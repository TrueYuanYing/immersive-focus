import { MathUtils, Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Raycaster, Vector2 } from 'three';

/** A bounded response on the existing miniature, driven by World's render loop. */
export class HomeInteraction {
  private enabled=false;
  private hovered=false;
  private warmth=0;
  private yaw=0;
  private pitch=0;
  private yawVelocity=0;
  private pitchVelocity=0;
  private renderedYaw=0;
  private renderedPitch=0;
  private reduced=false;
  private baseRotation:number;
  private basePitch:number;
  private ray=new Raycaster();
  private point=new Vector2();
  private lastHitAt=-Infinity;
  private pointer=new Vector2();
  private pointerDirty=false;
  private press?:{x:number;y:number;id:number;yaw:number;pitch:number;lastAt:number;dragged:boolean};
  private lifecycle=new AbortController();
  private lamps:{material:MeshStandardMaterial;source:MeshStandardMaterial;amount:number}[]=[];

  constructor(private canvas:HTMLCanvasElement,private root:Object3D,private camera:PerspectiveCamera,onEnter:()=>void){
    this.baseRotation=root.rotation.y;
    this.basePitch=root.rotation.x;
    const signal=this.lifecycle.signal;
    const copies=new Map<MeshStandardMaterial,MeshStandardMaterial>();
    root.traverse(object=>{
      if(!(object instanceof Mesh))return;
      const copy=(material:MeshStandardMaterial)=>{
        if(!['Glow','Glass','WindowGlow'].includes(material.name))return material;
        if(!copies.has(material)){
          const local=material.clone();copies.set(material,local);
          if(material.name==='Glass'){local.emissive.set('#d8a164');local.emissiveIntensity=0;}
          this.lamps.push({material:local,source:material,amount:material.name==='Glow'?.65:material.name==='WindowGlow'?.38:.14});
        }
        return copies.get(material)!;
      };
      object.material=Array.isArray(object.material)?object.material.map(copy):copy(object.material);
    });
    canvas.addEventListener('pointermove',event=>{
      if(!this.enabled)return;
      const press=this.press;
      if(press){
        if(press.id!==event.pointerId)return;
        const dx=event.clientX-press.x,dy=event.clientY-press.y;
        press.dragged ||= Math.hypot(dx,dy)>=8;
        if(!press.dragged)return;
        const now=performance.now(),dt=Math.max(.008,(now-press.lastAt)/1000);
        const yaw=MathUtils.clamp(press.yaw-dx*.006,-.85,.85);
        const pitch=MathUtils.clamp(press.pitch+dy*.0025,-.10,.10);
        this.yawVelocity=MathUtils.clamp((yaw-this.yaw)/dt,-3,3);
        this.pitchVelocity=MathUtils.clamp((pitch-this.pitch)/dt,-.8,.8);
        this.yaw=yaw;this.pitch=pitch;press.lastAt=now;
        this.applyRotation();this.canvas.classList.add('home-dragging');
        return;
      }
      if(event.pointerType==='mouse'){this.pointer.set(event.clientX,event.clientY);this.pointerDirty=true;}
    },{signal});
    canvas.addEventListener('pointerleave',()=>{if(!this.press)this.clear();},{signal});
    canvas.addEventListener('pointercancel',event=>{if(this.press?.id===event.pointerId)this.reset();},{signal});
    canvas.addEventListener('lostpointercapture',event=>{if(this.press?.id===event.pointerId)this.reset();},{signal});
    canvas.addEventListener('pointerdown',event=>{
      if(this.press||event.button!==0||!this.hit(event.clientX,event.clientY))return;
      // Suppress compatibility mouse events: they can focus a newly opened input.
      event.preventDefault();
      this.press={x:event.clientX,y:event.clientY,id:event.pointerId,yaw:this.yaw,pitch:this.pitch,lastAt:performance.now(),dragged:false};
      this.yawVelocity=0;this.pitchVelocity=0;
      if(event.isTrusted)canvas.setPointerCapture(event.pointerId);
    },{signal});
    canvas.addEventListener('pointerup',event=>{
      const press=this.press;
      if(!press||press.id!==event.pointerId)return;
      const tapped=!press.dragged&&Math.hypot(event.clientX-press.x,event.clientY-press.y)<8&&this.hit(event.clientX,event.clientY);
      if(performance.now()-press.lastAt>100){this.yawVelocity=0;this.pitchVelocity=0;}
      // Keep capture until the browser finishes pointerup and releases it implicitly.
      this.clear(false);
      if(this.reduced)this.reset();
      if(tapped)onEnter();
    },{signal});
    window.addEventListener('blur',()=>this.reset(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();},{signal});
  }
  setEnabled(enabled:boolean){this.enabled=enabled;this.canvas.classList.toggle('home-interactive',enabled);if(!enabled)this.reset();}
  private clear(releaseCapture=true){
    const id=this.press?.id;this.press=undefined;
    if(releaseCapture&&id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
    this.hovered=false;this.pointerDirty=false;this.canvas.classList.remove('home-hover','home-dragging');
  }
  private applyRotation(){this.root.rotation.y=this.baseRotation+this.yaw;this.root.rotation.x=this.basePitch+this.pitch;}
  private reset(){this.clear();this.yaw=0;this.pitch=0;this.yawVelocity=0;this.pitchVelocity=0;this.applyRotation();}
  private hit(x:number,y:number){
    if(!this.enabled||!this.root.visible)return false;
    const bounds=this.canvas.getBoundingClientRect();
    this.point.set((x-bounds.left)/bounds.width*2-1,1-(y-bounds.top)/bounds.height*2);
    this.camera.updateMatrixWorld();this.root.updateWorldMatrix(true,true);
    this.ray.setFromCamera(this.point,this.camera);
    return this.ray.intersectObject(this.root,true).some(hit=>hit.object.visible);
  }
  update(dt:number,reduced:boolean){
    this.reduced=reduced;
    // Consume the latest position in the existing render loop, including the final move.
    const now=performance.now();
    if(this.enabled&&!this.press&&this.pointerDirty&&now-this.lastHitAt>=65){
      this.lastHitAt=now;this.pointerDirty=false;this.hovered=this.hit(this.pointer.x,this.pointer.y);
      this.canvas.classList.toggle('home-hover',this.hovered);
    }
    if(!this.press){
      if(reduced){this.yaw=0;this.pitch=0;this.yawVelocity=0;this.pitchVelocity=0;}
      else {
        // Small fixed steps keep the damped spring stable at 30/60 fps and after stalls.
        let remaining=Math.min(.08,Math.max(0,dt));
        while(remaining>0){
          const step=Math.min(remaining,1/120);remaining-=step;
          this.yawVelocity+=(-48*this.yaw-11*this.yawVelocity)*step;
          this.pitchVelocity+=(-48*this.pitch-11*this.pitchVelocity)*step;
          this.yaw+=this.yawVelocity*step;this.pitch+=this.pitchVelocity*step;
          if(Math.abs(this.yaw)>.85){this.yaw=Math.sign(this.yaw)*.85;this.yawVelocity=0;}
          if(Math.abs(this.pitch)>.10){this.pitch=Math.sign(this.pitch)*.10;this.pitchVelocity=0;}
        }
        if(Math.abs(this.yaw)<.0001&&Math.abs(this.yawVelocity)<.001){this.yaw=0;this.yawVelocity=0;}
        if(Math.abs(this.pitch)<.0001&&Math.abs(this.pitchVelocity)<.001){this.pitch=0;this.pitchVelocity=0;}
      }
      this.applyRotation();
    }
    const active=this.enabled&&(this.hovered||!!this.press)&&!reduced;
    this.warmth=reduced?0:MathUtils.damp(this.warmth,active?1:0,7,dt);
    for(const lamp of this.lamps){
      const base=lamp.source.emissive.getHex()===0?0:lamp.source.emissiveIntensity;
      lamp.material.emissiveIntensity=base+this.warmth*lamp.amount;
    }
    const moved=this.renderedYaw!==this.yaw||this.renderedPitch!==this.pitch;
    this.renderedYaw=this.yaw;this.renderedPitch=this.pitch;
    return moved;
  }
  cancel(){this.reset();}
  dispose(){this.setEnabled(false);this.lifecycle.abort();}
  diagnostics(){return {enabled:this.enabled,hovered:this.hovered,dragging:!!this.press?.dragged,warmth:this.warmth,rotation:this.root.rotation.y-this.baseRotation,pitch:this.root.rotation.x-this.basePitch,velocity:this.yawVelocity};}
}
