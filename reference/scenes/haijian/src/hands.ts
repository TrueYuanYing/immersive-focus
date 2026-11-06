import * as T from 'three';
export type HandPose='rest'|'write'|'grip'|'pinch';
const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const handShapes:Record<HandPose,number[][]>={rest:[[.12,.16,.12],[.17,.2,.14],[.2,.23,.16],[.24,.3,.2]],write:[[.34,.82,.67],[.57,1,.7],[.9,1.18,.74],[1.0,1.23,.81]],grip:[[.82,1.32,.94],[.93,1.36,.94],[.95,1.36,.92],[.93,1.34,.9]],pinch:[[.22,.64,.58],[.08,.1,.08],[.1,.12,.1],[.12,.14,.1]]};
/** Articulated fingers and a separately constrained forearm; contact and geometry share the same pose. */
export class HandRig {
  readonly sleeve:T.Mesh;
  private joints:T.Object3D[][]=[];private thumb:T.Object3D;private thumbTip:T.Object3D;
  private curve=new T.CubicBezierCurve3(v(0,0,0),v(0,0,0),v(0,0,0),v(0,0,0));
  private point=v(0,0,0);private tangent=v(0,0,0);private axis=v(0,0,0);
  private other=v(0,0,0);private radial=v(0,0,0);private vertex=v(0,0,0);private pivotOffset=v(0,0,0);
  private wrist=v(0,0,0);private end=v(0,0,0);private wristAxis=v(0,0,0);private up=v(0,1,0);
  constructor(readonly root:T.Group,readonly side:'L'|'R'){
    for(let i=0;i<4;i++)this.joints.push([0,1,2].map(j=>root.getObjectByName(`Joint_${side}_${i}_${j}`)!));
    this.thumb=root.getObjectByName(`Thumb_${side}`)!;this.thumbTip=root.getObjectByName(`ThumbTip_${side}`)!;
    if(side==='L')this.joints.forEach(f=>{f[0].position.x*=-1;});
    this.thumb.position.z=-.033;
    root.getObjectByName(`Pinch_${side}`)!.position.set(side==='L'?.041:-.041,side==='L'?-.056:-.064,side==='L'?-.123:-.108);
    this.sleeve=new T.Mesh(new T.BufferGeometry(),new T.MeshStandardMaterial({color:0xc9d0bc,roughness:.96}));
    const positions=new Float32Array(25*12*3),normals=new Float32Array(positions.length),indices=[];
    for(let j=0;j<24;j++)for(let i=0;i<12;i++){const a=j*12+i,b=j*12+(i+1)%12;indices.push(a,b,a+12,b,b+12,a+12);}
    this.sleeve.geometry.setAttribute('position',new T.BufferAttribute(positions,3));this.sleeve.geometry.setAttribute('normal',new T.BufferAttribute(normals,3));this.sleeve.geometry.setIndex(indices);
    this.sleeve.castShadow=true;this.sleeve.receiveShadow=true;this.sleeve.frustumCulled=false;this.sleeve.name=`Forearm_${side}`;
  }
  pose(mode:HandPose,closure=1,settle=0){
    this.joints.forEach((f,i)=>f.forEach((joint,j)=>{const shape=T.MathUtils.lerp(handShapes[mode][i][j],handShapes.pinch[i][j],settle);joint.rotation.x=-T.MathUtils.lerp(handShapes.rest[i][j],shape,closure);}));
    const sign=this.side==='L'?1:-1;
    this.thumb.rotation.set(-(mode==='pinch'?.65:.5)*closure,sign*(mode==='grip'?.85:.5),-sign*.12*closure);this.thumbTip.rotation.x=mode==='rest'?-.15:mode==='grip'?-.64:-.35;
  }
  at(contact:T.Vector3,rotation:T.Quaternion,mode:HandPose,closure=1,settle=0){
    this.pose(mode,closure,settle);this.root.scale.setScalar(1);this.root.quaternion.copy(rotation);
    const pivot=this.root.getObjectByName(`${mode==='write'||mode==='pinch'?'Pinch':'Grip'}_${this.side}`)!;
    this.root.position.copy(contact).sub(this.pivotOffset.copy(pivot.position).applyQuaternion(rotation));
  }
  arm(deck=false){
    this.root.updateWorldMatrix(true,true);this.sleeve.visible=this.root.visible;
    const start=this.root.localToWorld(this.wrist.set(0,0,.126));
    const end=this.end.set(this.side==='L'?-.74:.87,deck?.82:.76,1.9);
    this.wristAxis.set(0,0,1).applyQuaternion(this.root.quaternion);
    this.curve.v0.copy(start);this.curve.v1.copy(start).addScaledVector(this.wristAxis,.18);this.curve.v2.copy(end).lerp(start,.34);this.curve.v3.copy(end);
    const attr=this.sleeve.geometry.attributes.position;const normal=this.sleeve.geometry.attributes.normal;
    for(let j=0;j<=24;j++){
      const p=j/24,c=this.curve.getPoint(p,this.point),tangent=this.curve.getTangent(p,this.tangent).normalize();
      if(!deck&&c.z<1.22)c.y=Math.max(c.y,.846);
      const axis=this.axis.crossVectors(tangent,this.up).normalize(),other=this.other.crossVectors(tangent,axis).normalize();
      const r=.049+p*.041;
      for(let i=0;i<12;i++){const a=i*Math.PI/6,n=this.radial.copy(axis).multiplyScalar(Math.cos(a)).addScaledVector(other,Math.sin(a));const q=this.vertex.copy(c).addScaledVector(n,r);attr.setXYZ(j*12+i,q.x,q.y,q.z);normal.setXYZ(j*12+i,n.x,n.y,n.z);}
    }
    attr.needsUpdate=true;normal.needsUpdate=true;
  }
}
