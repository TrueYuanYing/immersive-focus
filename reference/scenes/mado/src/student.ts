import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { legPose, skipPose, walkRise } from './motion';

const axes = { x: new THREE.Vector3(1,0,0), y: new THREE.Vector3(0,1,0), z: new THREE.Vector3(0,0,1) };
/** Shared painted assets, independent humanoid skeletons and expressions. */
export class CharacterRig {
  readonly object: THREE.Object3D;
  private joints = new Map<string, { node: THREE.Object3D; rest: THREE.Quaternion; parent: THREE.Quaternion }>();
  private faces: THREE.Mesh[] = [];
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  private upper=.353;
  private lower=.415;
  private hipsHeight=.91;
  private footHeight=.07;
  private restUpper=0;
  private restLower=0;
  private feet = new Map<string,{contact:THREE.Vector3;rest:THREE.Quaternion}>();
  private handContacts = new Map<string,{point:THREE.Vector3;rotation:THREE.Quaternion;fingers:{node:THREE.Object3D;rest:THREE.Quaternion;axis:THREE.Vector3;angle:number}[]}>();
  private vectors=Array.from({length:10},()=>new THREE.Vector3());
  private rotations=Array.from({length:4},()=>new THREE.Quaternion());
  private reference=new THREE.Matrix4();
  private relative=new THREE.Matrix4();
  private briefcase?:THREE.Group;
  private umbrella?:THREE.Group;
  private canopy?:THREE.Group;
  private palm=new THREE.Vector3();
  private handRest=new THREE.Quaternion();
  private gripRotation=new THREE.Quaternion();
  private gripTarget=new THREE.Vector3();
  private elbowPole=new THREE.Vector3();
  private walkingArm=[new THREE.Quaternion(),new THREE.Quaternion()];
  private wetSurfaces:{material:THREE.MeshToonMaterial;color:THREE.Color}[]=[];
  private wetness={value:0};
  smile = 0;
  turn = 0;
  readonly strideScale:number;
  constructor(source: THREE.Group, private index: number, private role: 'student'|'worker'|'walker'|'cyclist'|'mother'|'daughter'='student') {
    this.object = clone(source);
    this.strideScale=role==='daughter'?.68:role==='mother'?1.045:1;
    this.object.updateMatrixWorld(true);
    this.object.traverse(o => {
      if (o instanceof THREE.Bone) {
        // glTF assigns unique suffixes when two independently skinned people share a file.
        const name=role==='daughter'?o.name.replace(/_1$/,''):o.name;o.name=name;
        this.joints.set(name, { node:o, rest:o.quaternion.clone(), parent:o.parent!.getWorldQuaternion(new THREE.Quaternion()).invert() });
      }
      if (!(o instanceof THREE.Mesh)) return;
      const hairStyle=o.name.match(/HairStyle_(\d)_/);if(hairStyle)o.visible=Number(hairStyle[1])===index;
      o.castShadow = true; o.receiveShadow = false;
      if (o.morphTargetDictionary?.Smile !== undefined) this.faces.push(o);
      const original = o.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshToonMaterial({ map:original.map, color:original.color, alphaTest:original.alphaTest || .45, side:original.side });
      // Lift shaded areas softly, preserving the painted eyes and facial expressions.
      mat.emissive.set('#716251');mat.emissiveIntensity=.11;
      if (/Tops|Bottoms/.test(original.name)) mat.color.multiply(new THREE.Color(['#c7d5e0','#c8d8d0','#d5cbdb'][index]));
      if (/HAIR/.test(original.name)) mat.color.multiply(new THREE.Color(['#d1c2b9','#b6bdce','#d9b5a0'][index]));
      if (original.name==='EverydayCottonSocks') {mat.map=null;mat.color.set(index===1?'#eeeade':'#303039');}
      if(role==='worker'||role==='walker'||role==='cyclist'){
        if(/HAIR/.test(original.name))mat.color.set(['#4c4240','#8c796c','#514f4c'][index]);
        if(/Tops/.test(original.name))mat.color.set(role==='worker'?'#555e70':role==='walker'?'#aaa693':'#789999');
        if(/Bottoms/.test(original.name))mat.color.set('#626875');
      }
      mat.name=original.name+'_MADO'; o.material=mat;
      if((role==='cyclist'||role==='student')&&/Tops|Bottoms|HAIR|CottonSocks/.test(original.name)){
        this.wetSurfaces.push({material:mat,color:mat.color.clone()});
        // Damp cloth stays opaque. A broad, weak highlight preserves the painted style.
        mat.onBeforeCompile=shader=>{
          shader.uniforms.uWetness=this.wetness;
          shader.fragmentShader='uniform float uWetness;\n'+shader.fragmentShader;
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float waterSheen = pow(max(dot(normal, normalize(vec3(-0.35, 0.8, 0.5))), 0.0), 12.0);
            outgoingLight += vec3(0.11, 0.14, 0.15) * waterSheen * uWetness;
            #include <opaque_fragment>`);
        };
        mat.customProgramCacheKey=()=> 'mado-damp-cloth-1';
      }
    });
    // The Blender glTF export already faces the actor convention, local -Z.
    const hip=this.joints.get('J_Bip_L_UpperLeg')!.node.getWorldPosition(new THREE.Vector3());
    const knee=this.joints.get('J_Bip_L_LowerLeg')!.node.getWorldPosition(new THREE.Vector3());
    const foot=this.joints.get('J_Bip_L_Foot')!.node.getWorldPosition(new THREE.Vector3());
    this.upper=hip.distanceTo(knee);this.lower=knee.distanceTo(foot);this.hipsHeight=hip.y;this.footHeight=foot.y;
    this.restUpper=Math.atan2(hip.z-knee.z,hip.y-knee.y);this.restLower=Math.atan2(knee.z-foot.z,knee.y-foot.y);
    for(const side of ['L','R']){
      const node=this.joints.get(`J_Bip_${side}_Foot`)!.node;
      const contact=node.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-this.footHeight,-.04));
      this.feet.set(side,{contact:node.worldToLocal(contact),rest:node.getWorldQuaternion(new THREE.Quaternion())});
      const hand=this.hand(side as 'L'|'R')!,middle=this.joints.get(`J_Bip_${side}_Middle1`)!.node.getWorldPosition(new THREE.Vector3());
      const point=hand.getWorldPosition(new THREE.Vector3()).lerp(middle,.68);
      const restDirection=middle.sub(hand.getWorldPosition(new THREE.Vector3())).normalize();
      const across=this.joints.get(`J_Bip_${side}_Index1`)!.node.getWorldPosition(new THREE.Vector3()).sub(this.joints.get(`J_Bip_${side}_Little1`)!.node.getWorldPosition(new THREE.Vector3()));
      const normal=new THREE.Vector3().crossVectors(restDirection,across).normalize().multiplyScalar(side==='R'?-1:1);
      point.addScaledVector(normal,.012*this.strideScale);
      const direction=new THREE.Vector3(side==='R'?.05:-.05,side==='R'?-.97:.97,-.25).normalize(),inward=new THREE.Vector3(side==='R'?1:-1,0,0);
      inward.addScaledVector(direction,-inward.dot(direction)).normalize();
      const basis=(a:THREE.Vector3,b:THREE.Vector3)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a,b,new THREE.Vector3().crossVectors(a,b)));
      const rotation=basis(direction,inward).multiply(basis(restDirection,normal).invert()).multiply(hand.getWorldQuaternion(new THREE.Quaternion()));
      const fingers=[];
      for(const finger of ['Index','Middle','Ring','Little','Thumb'])for(const segment of [1,2,3]){
        const joint=this.joints.get(`J_Bip_${side}_${finger}${segment}`);if(!joint)continue;
        const axis=new THREE.Vector3().crossVectors(restDirection,normal).applyQuaternion(joint.node.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        fingers.push({node:joint.node,rest:joint.rest,axis,angle:finger==='Thumb'?.30:finger==='Index'?.65:.85});
      }
      this.handContacts.set(side,{point:hand.worldToLocal(point),rotation,fingers});
    }
    const hand=this.hand('L')!;
    hand.getWorldPosition(this.palm).lerp(this.joints.get('J_Bip_L_Middle1')!.node.getWorldPosition(new THREE.Vector3()),.95);
    hand.worldToLocal(this.palm);this.palm.z+=.020; // Center of the curled fingers, beyond the flat palm surface.
    hand.getWorldQuaternion(this.handRest);
    if(role==='worker'){
      this.briefcase=new THREE.Group();this.object.add(this.briefcase);
      const leather=new THREE.MeshToonMaterial({color:'#51473f'}),metal=new THREE.MeshToonMaterial({color:'#a39171'});
      const part=(size:number[],position:number[],material:THREE.Material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),material);mesh.position.fromArray(position);mesh.castShadow=true;this.briefcase!.add(mesh);};
      part([.065,.24,.32],[0,-.18,0],leather);part([.028,.018,.11],[0,-.035,0],leather);
      for(const z of [-.05,.05])part([.024,.03,.014],[0,-.055,z],leather);
      part([.071,.026,.04],[0,-.12,0],metal);
      const watch=new THREE.Group();this.hand('L')!.add(watch);
      const wristDirection=this.joints.get('J_Bip_L_Middle1')!.node.position.clone().normalize();
      watch.quaternion.setFromUnitVectors(axes.z,wristDirection);watch.position.copy(wristDirection).multiplyScalar(-.026);
      const band=new THREE.Mesh(new THREE.TorusGeometry(.027,.006,6,16),leather);watch.add(band);
      const dial=new THREE.Mesh(new THREE.BoxGeometry(.029,.009,.024),metal);dial.position.y=-.029;watch.add(dial);
    }
  }
  private pose(name: string, axis: keyof typeof axes, radians: number) {
    const j=this.joints.get(name);if(!j)return;
    this.axis.copy(axes[axis]).applyQuaternion(j.parent);
    j.node.quaternion.copy(this.rotation.setFromAxisAngle(this.axis,radians)).multiply(j.rest);
  }
  animate(gait: number, time: number, lookBack: number, rain=0, skipAge=-1, walking=1) {
    const hop=skipPose(skipAge),rise=walkRise(gait,this.strideScale)*walking+Math.min(0,hop.height);
    const lively=this.role==='student',gesture=lively?Math.sin(time*.79+this.index*1.9)*.035:0;
    for(const [i,side] of ['L','R'].entries()) {
      const phase=gait+(i?Math.PI:0),p=legPose(phase,rise,this.upper,this.lower,this.hipsHeight-this.footHeight,this.strideScale*walking);
      this.pose(`J_Bip_${side}_UpperLeg`,'x',p.hip-this.restUpper+hop.tuck*(i?.08:.12));
      this.pose(`J_Bip_${side}_LowerLeg`,'x',p.knee-this.restLower+this.restUpper-hop.tuck*(i?.30:.45));
      this.pose(`J_Bip_${side}_Foot`,'x',p.ankle+this.restLower+hop.tuck*.2);
      this.pose(`J_Bip_${side}_UpperArm`,'z',(side==='L'?1:-1)*(1.34-hop.energy*.22+gesture));
      const upper=this.joints.get(`J_Bip_${side}_UpperArm`);
      if(upper){this.axis.copy(axes.x).applyQuaternion(upper.parent);upper.node.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis,p.footZ*(lively?.70:.62)+gesture*.35));}
      this.pose(`J_Bip_${side}_LowerArm`,'z',(side==='L'?1:-1)*(.10+hop.energy*.28));
      this.pose(`J_Bip_${side}_Hand`,'x',0);
      for(const segment of [2,3])this.pose(`J_Bip_${side}_Thumb${segment}`,'x',0);
      for(const finger of ['Index','Middle','Ring','Little']) for(const segment of [1,2,3]) this.pose(`J_Bip_${side}_${finger}${segment}`,'y',side==='L'?-.20:.20);
    }
    this.turn=lookBack;
    this.pose('J_Bip_C_Chest','y',Math.sin(gait)*(lively?.045:.025)+lookBack*.28+gesture);
    this.pose('J_Bip_C_Head','y',lookBack*.90+Math.sin(time*.36+this.index)*(lively?.15:.09));
    if(this.role==='mother'||this.role==='daughter'){
      const head=this.joints.get('J_Bip_C_Head')!;this.axis.copy(axes.x).applyQuaternion(head.parent);
      head.node.quaternion.premultiply(this.rotation.setFromAxisAngle(this.axis,(this.role==='mother'?-.13:.15)*(1-walking)));
    }
    if(this.role==='worker'){
      const check=Math.sin(Math.PI*THREE.MathUtils.clamp(((time%58)-23)/4,0,1))**2*(1-THREE.MathUtils.smoothstep(rain,0,.3));
      this.pose('J_Bip_L_UpperArm','z',1.40-check*.52);this.pose('J_Bip_L_LowerArm','y',-check*1.2);this.pose('J_Bip_C_Head','x',check*.25);
    }
    // A brief natural blink every few seconds, staggered across the three friends.
    const blinkPhase=(time+this.index*2.7)%(4.8+this.index*.7);
    const blink=blinkPhase<.18?Math.sin(blinkPhase/.18*Math.PI):0;
    this.smile=THREE.MathUtils.clamp(.14+Math.abs(lookBack)*.65+hop.energy*.25,0,1);
    if(this.role==='mother'||this.role==='daughter')this.smile=.20+(1-walking)*.14;
    for(const f of this.faces){f.morphTargetInfluences![f.morphTargetDictionary!.Smile]=this.smile;f.morphTargetInfluences![f.morphTargetDictionary!.Blink]=blink;}
    for(const [name,j] of this.joints) if(name.startsWith('J_Sec_')&&/Hair/.test(name)) this.pose(name,'x',Math.sin(time*1.6+name.length)*.02);
    if(this.umbrella)this.holdUmbrella(rain,time);
    if(this.briefcase){this.object.updateWorldMatrix(true,true);this.briefcase.position.copy(this.object.worldToLocal(this.hand('R')!.getWorldPosition(this.vectors[9])));this.briefcase.rotation.x=Math.sin(gait-.4)*.06;}
  }
  /** Normalize the Blender umbrella around its grip; shaft and canopy remain separate. */
  attachUmbrella(source:THREE.Object3D) {
    const umbrella=new THREE.Group(),model=source.clone(true),canopy=new THREE.Group();
    const span=this.role==='mother'?1.6:.78;
    umbrella.name='HeldUmbrella';model.position.set(-.22*span,-1.10*.76,0);model.rotation.set(0,0,0);model.scale.set(span,.76,span);
    umbrella.add(model);this.object.add(umbrella);this.umbrella=umbrella;
    canopy.name='HeldUmbrellaCanopy';canopy.position.set(.22,2.04,0);model.add(canopy);this.canopy=canopy;
    model.updateWorldMatrix(true,true);
    for(const mesh of [...model.children]){
      if(!(mesh instanceof THREE.Mesh))continue;
      const material=mesh.material as THREE.MeshStandardMaterial;
      if(material.name==='Metal')mesh.name='HeldUmbrellaShaft';
      else {canopy.attach(mesh);mesh.material=material.clone();(mesh.material as THREE.MeshStandardMaterial).color.set(['#d5cdb9','#c2cdbb','#cac5d3'][this.index]);}
    }
    umbrella.visible=false;
  }
  holdUmbrella(rain:number,time:number,target?:THREE.Vector3,tilt=0,blend=1) {
    const raise=THREE.MathUtils.smoothstep(rain,0,.65),open=THREE.MathUtils.smoothstep(rain,.35,.95);
    const hand=this.hand('L')!;
    if(raise>0){
      this.object.updateWorldMatrix(true,true);
      this.rotation.setFromAxisAngle(axes.z,Math.PI/2+tilt).multiply(this.rotations[2].setFromAxisAngle(axes.y,-Math.PI/2)).multiply(this.handRest);
      this.reference.copy(this.object.matrixWorld).invert();
      this.gripRotation.setFromRotationMatrix(this.relative.multiplyMatrices(this.reference,hand.matrixWorld)).slerp(this.rotation,blend);
      if(target){this.gripTarget.copy(target);this.object.worldToLocal(this.gripTarget).sub(this.vectors[9].copy(this.palm).applyQuaternion(this.gripRotation));}
      else this.gripTarget.set(-.19-this.index*.012,this.hipsHeight+.34+Math.sin(time*.9+this.index)*.006,-.30);
      this.object.localToWorld(this.gripTarget);
      // Open the elbow outward during a tilted handoff; settle back as the shaft straightens.
      const handoff=THREE.MathUtils.clamp(tilt/.85,0,1);
      this.elbowPole.set(-.35-.65*handoff,-1+.9*handoff,.12-.27*handoff).transformDirection(this.object.matrixWorld);
      const upper=this.joints.get('J_Bip_L_UpperArm')!.node,lower=this.joints.get('J_Bip_L_LowerArm')!.node;
      this.walkingArm[0].copy(upper.quaternion);this.walkingArm[1].copy(lower.quaternion);
      this.reach(upper,lower,hand,this.gripTarget,this.elbowPole);
      upper.quaternion.slerp(this.walkingArm[0],1-raise);lower.quaternion.slerp(this.walkingArm[1],1-raise);
      upper.updateWorldMatrix(false,true);
      this.reference.copy(this.object.matrixWorld).invert();
      const desired=this.rotations[3].setFromRotationMatrix(this.relative.multiplyMatrices(this.reference,hand.parent!.matrixWorld)).invert().multiply(this.gripRotation);
      hand.quaternion.slerp(desired,raise);hand.updateWorldMatrix(false,true);
      for(const finger of this.handContacts.get('L')!.fingers)finger.node.quaternion.copy(finger.rest).multiply(this.rotation.setFromAxisAngle(finger.axis,raise*blend*(finger.node.name.includes('Thumb')?.55:1.06)));
    }
    this.umbrella!.visible=rain>.025;
    this.umbrella!.position.copy(this.object.worldToLocal(hand.localToWorld(this.vectors[9].copy(this.palm))));
    this.umbrella!.rotation.set(Math.sin(time*.7+this.index)*.018,0,tilt+Math.sin(time*.55+this.index)*.022-(this.role==='mother'?.24*raise:0));
    this.canopy!.scale.set(.055+.945*open,1,.055+.945*open);
  }
  palmContact(){return this.hand('L')!.localToWorld(this.palm.clone());}
  setWetness(value:number){
    this.wetness.value=THREE.MathUtils.clamp(value,0,1);
    for(const surface of this.wetSurfaces)surface.material.color.copy(surface.color).multiplyScalar(1-this.wetness.value*(this.role==='cyclist'?.25:.18));
  }
  /** A spare umbrella follows a hand or bag before being taken by its owner. */
  placeUmbrella(grip:THREE.Vector3,open:number,tilt=0){
    if(!this.umbrella)return;this.umbrella.visible=true;
    this.umbrella.position.copy(this.object.worldToLocal(grip.clone()));this.umbrella.rotation.set(0,0,tilt);
    this.canopy!.scale.set(.055+.945*open,1,.055+.945*open);
  }
  gestureHand(side:'L'|'R',target:THREE.Vector3,amount:number){
    const upper=this.joints.get(`J_Bip_${side}_UpperArm`)!.node,lower=this.joints.get(`J_Bip_${side}_LowerArm`)!.node,hand=this.hand(side)!;
    const before=[upper.quaternion.clone(),lower.quaternion.clone(),hand.quaternion.clone()];
    this.holdHand(side,target);
    for(const [i,joint] of [upper,lower,hand].entries())joint.quaternion.slerp(before[i],1-amount);
    this.object.updateWorldMatrix(true,true);
  }
  /** Both skeletons reach one shared grip, including wrist orientation and palm offset. */
  holdHand(side:'L'|'R',target:THREE.Vector3) {
    const data=this.handContacts.get(side)!,hand=this.hand(side)!;
    this.object.updateWorldMatrix(true,true);
    this.gripTarget.copy(target);this.object.worldToLocal(this.gripTarget);
    this.gripTarget.sub(this.vectors[9].copy(data.point).applyQuaternion(data.rotation));this.object.localToWorld(this.gripTarget);
    this.elbowPole.set(side==='L'?-.5:.5,-1,.3).transformDirection(this.object.matrixWorld);
    this.reach(this.joints.get(`J_Bip_${side}_UpperArm`)!.node,this.joints.get(`J_Bip_${side}_LowerArm`)!.node,hand,this.gripTarget,this.elbowPole);
    this.reference.copy(this.object.matrixWorld).invert();
    hand.quaternion.setFromRotationMatrix(this.relative.multiplyMatrices(this.reference,hand.parent!.matrixWorld)).invert().multiply(data.rotation);
    for(const finger of data.fingers)finger.node.quaternion.copy(finger.rest).multiply(this.rotation.setFromAxisAngle(finger.axis,finger.angle));
    hand.updateWorldMatrix(false,true);
  }
  heldHandContact(side:'L'|'R'){return this.hand(side)!.localToWorld(this.handContacts.get(side)!.point.clone());}
  setupCycle() {
    this.object.rotation.y=-Math.PI/2;this.object.position.set(-.08,1.10-this.hipsHeight,0);
  }
  /** Reach a world-space contact with the actual imported bone lengths. */
  private reach(upper:THREE.Object3D,lower:THREE.Object3D,end:THREE.Object3D,target:THREE.Vector3,pole:THREE.Vector3) {
    this.object.updateWorldMatrix(true,true);
    this.reference.copy(this.object.matrixWorld).invert();
    const [a,b,c,d,bend,knee,from,to,goal]=this.vectors;
    goal.copy(target).applyMatrix4(this.reference);
    upper.getWorldPosition(a);lower.getWorldPosition(b);end.getWorldPosition(c);
    a.applyMatrix4(this.reference);b.applyMatrix4(this.reference);c.applyMatrix4(this.reference);
    const l1=a.distanceTo(b),l2=b.distanceTo(c);
    d.subVectors(goal,a);const length=THREE.MathUtils.clamp(d.length(),Math.abs(l1-l2)+.0001,l1+l2-.0001);d.normalize();
    const along=(l1*l1+length*length-l2*l2)/(2*length);
    bend.copy(pole).transformDirection(this.reference);bend.addScaledVector(d,-bend.dot(d)).normalize();
    knee.copy(a).addScaledVector(d,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
    const [parent,delta,local]=this.rotations;
    const rotate=(node:THREE.Object3D)=>{
      delta.setFromUnitVectors(from.normalize(),to.normalize());parent.setFromRotationMatrix(this.relative.multiplyMatrices(this.reference,node.parent!.matrixWorld));
      local.copy(parent).invert().multiply(delta).multiply(parent);node.quaternion.premultiply(local);node.updateWorldMatrix(false,true);
    };
    from.subVectors(b,a);to.subVectors(knee,a);rotate(upper);
    lower.getWorldPosition(b).applyMatrix4(this.reference);end.getWorldPosition(c).applyMatrix4(this.reference);from.subVectors(c,b);to.subVectors(goal,b);rotate(lower);
  }
  cycle(phase:number,time:number,rain=0) {
    this.animate(0,time,0);
    this.setWetness(rain);
    this.pose('J_Bip_C_Spine','x',-.98);this.pose('J_Bip_C_Head','x',.62);
    this.object.updateWorldMatrix(true,true);
    const bike=this.object.parent!,target=new THREE.Vector3(),pole=new THREE.Vector3(1,0,0).transformDirection(bike.matrixWorld);
    for(const [i,side] of ['L','R'].entries()){
      const angle=phase+(i?Math.PI:0),foot=this.joints.get(`J_Bip_${side}_Foot`)!.node,data=this.feet.get(side)!;
      const offset=data.contact.clone().applyQuaternion(data.rest);
      target.set(.04+.165*Math.cos(angle),.52-.165*Math.sin(angle),i?-.17:.17);bike.localToWorld(target);this.object.worldToLocal(target).sub(offset);this.object.localToWorld(target);
      this.reach(this.joints.get(`J_Bip_${side}_UpperLeg`)!.node,this.joints.get(`J_Bip_${side}_LowerLeg`)!.node,foot,target,pole);
      this.reference.copy(this.object.matrixWorld).invert();
      foot.quaternion.setFromRotationMatrix(this.relative.multiplyMatrices(this.reference,foot.parent!.matrixWorld)).invert().multiply(data.rest);foot.updateWorldMatrix(false,true);
      // Wrists stay at the grips while the torso breathes very slightly.
      target.set(.40,1.31,i?-.20:.20);bike.localToWorld(target);
      const elbowPole=new THREE.Vector3(-.3,-1,i?-1:1).transformDirection(bike.matrixWorld);
      this.reach(this.joints.get(`J_Bip_${side}_UpperArm`)!.node,this.joints.get(`J_Bip_${side}_LowerArm`)!.node,this.hand(side as 'L'|'R')!,target,elbowPole);
      for(const finger of ['Index','Middle','Ring','Little'])for(const segment of [1,2,3])this.pose(`J_Bip_${side}_${finger}${segment}`,'y',i?.9:-.9);
    }
  }
  footContact(side:'L'|'R'){return this.joints.get(`J_Bip_${side}_Foot`)!.node.localToWorld(this.feet.get(side)!.contact.clone());}
  kneeAngles(){return ['L','R'].map(s=>this.joints.get(`J_Bip_${s}_LowerLeg`)!.node.quaternion.toArray());}
  hand(side:'L'|'R'){return this.joints.get(`J_Bip_${side}_Hand`)?.node;}
}
