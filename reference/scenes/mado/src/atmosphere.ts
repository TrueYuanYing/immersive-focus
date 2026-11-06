import * as THREE from 'three';
import type { QualityTier } from './quality';

/** Fixed particle pools: no per-frame allocations or randomized event spawning. */
export class Atmosphere {
  readonly root = new THREE.Group();
  private dust: THREE.Points;
  private motes: THREE.Points;
  private splash: THREE.Points;
  private bikeSpray:THREE.Points;
  private ripples: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private position = new THREE.Vector3();
  constructor() {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d')!,gradient=ctx.createRadialGradient(16,16,1,16,16,16);
    gradient.addColorStop(0,'#fff');gradient.addColorStop(.3,'#ffffffa0');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);
    const sprite=new THREE.CanvasTexture(canvas);
    const points=(count:number,color:string,size:number,opacity:number)=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
      const material=new THREE.PointsMaterial({map:sprite,color,size,opacity,transparent:true,depthWrite:false});
      const object=new THREE.Points(geometry,material);object.frustumCulled=false;this.root.add(object);return object;
    };
    this.dust=points(72,'#ffedc0',.027,.28);this.motes=points(10,'#ffd59a',.052,.45);this.splash=points(48,'#dce5df',.040,.22);
    this.bikeSpray=points(32,'#dce8e6',.027,.32);
    this.ripples=new THREE.InstancedMesh(new THREE.RingGeometry(.91,1,20),new THREE.MeshBasicMaterial({color:'#bccfc8',transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide}),40);
    this.ripples.frustumCulled=false;this.root.add(this.ripples);this.root.name='AmbientParticles';
  }
  update(time:number,rain:number,hour:number,tier:QualityTier,visible:boolean,car?:THREE.Object3D,bike?:THREE.Object3D) {
    this.root.visible=visible;if(!visible)return;
    const low=tier==='low',night=hour>19||hour<6;
    this.dust.visible=!night&&rain<.8;this.motes.visible=night&&rain<.3;
    this.ripples.visible=rain>.05;this.splash.visible=rain>.25&&!!car?.visible;
    this.bikeSpray.visible=rain>.05&&!!bike?.visible;
    this.dust.geometry.setDrawRange(0,low?22:72);this.ripples.count=low?12:40;
    const dust=this.dust.geometry.getAttribute('position');
    for(let i=0;i<72;i++){const t=time*.045+i*1.71;dust.setXYZ(i,Math.sin(i*2.37)*4+Math.sin(t)*.18,1.8+(i*.373+time*.028)%3.5,-1.8-(i*.619)%4);}
    dust.needsUpdate=true;
    const motes=this.motes.geometry.getAttribute('position');
    for(let i=0;i<10;i++)motes.setXYZ(i,Math.sin(i*2.17)*9,1+(i*.27)%2+Math.sin(time*.3+i)*.13,5+(i*.49)%3);
    motes.needsUpdate=true;
    if(this.ripples.visible){
      for(let i=0;i<this.ripples.count;i++){const p=(time*.55+i*.731)%1;this.dummy.position.set(Math.sin(i*12.78)*12,.035,2+(i*1.71)%5.5);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.setScalar(p>.88?0:.025+p*.23);this.dummy.updateMatrix();this.ripples.setMatrixAt(i,this.dummy.matrix);}
      this.ripples.instanceMatrix.needsUpdate=true;
    }
    if(this.splash.visible&&car){
      car.getWorldPosition(this.position);const vertices=this.splash.geometry.getAttribute('position');
      for(let i=0;i<48;i++){const p=(time*1.6+i*.173)%1;vertices.setXYZ(i,this.position.x+(i%2?-.82:.82)+(p-.5)*.6,.06+Math.sin(p*Math.PI)*.13,this.position.z+(i%3-1)*.65+p*.34);}
      vertices.needsUpdate=true;
    }
    if(this.bikeSpray.visible&&bike){
      const vertices=this.bikeSpray.geometry.getAttribute('position');
      this.bikeSpray.geometry.setDrawRange(0,low?16:32);(this.bikeSpray.material as THREE.PointsMaterial).opacity=rain*.32;
      for(let i=0;i<32;i++){
        const p=(time*2.2+i*.173)%1;
        // Fine droplets thrown behind each tire, plus runoff from the rider's shoulders.
        if(i<24)this.position.set((i%2?-.75:.78)-p*.28,.035+Math.sin(p*Math.PI)*.16,(i%3-1)*.035+p*.10);
        else this.position.set(-.06-p*.16,1.48-p*.40,(i%2?-.16:.16));
        bike.localToWorld(this.position);this.root.worldToLocal(this.position);vertices.setXYZ(i,this.position.x,this.position.y,this.position.z);
      }
      vertices.needsUpdate=true;
    }
  }
}
