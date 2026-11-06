import * as THREE from 'three';
import { CharacterRig } from './student';
import { studentTravel, walkPhase, walkRise, skipPose } from './motion';
import { STREET_EDGE } from './routes';
const ease=(t:number,a:number,b:number)=>THREE.MathUtils.smoothstep(t,a,b);

/** One group clock keeps friends together; a spare umbrella has one continuous owner path. */
export class Friends {
  private point=new THREE.Vector3();
  private other=new THREE.Vector3();
  private arc=new THREE.Vector3();
  constructor(readonly roots:THREE.Object3D[],readonly people:CharacterRig[]){}
  update(age:number,duration:number,time:number,rain:number,variant:number,borrowAge=-1,skipIndex=-1,skipAge=-1){
    const distance=studentTravel(age,0,(STREET_EDGE*2+4)/duration);
    const play=Math.sin(Math.PI*ease(age,duration*.38,duration*.38+7))**2*(1-ease(rain,0,.2))*(borrowAge<0?1:0);
    const opened=ease(borrowAge,6,10),gap=.82+.32*opened;
    const closer=ease(borrowAge,0,3)*(1-ease(borrowAge,6,9));
    const shelter=Math.max(rain,borrowAge>=0?1-ease(borrowAge,12,16):0);
    for(let i=0;i<3;i++){
      const gait=walkPhase(distance,1,i*1.7),hop=skipPose(i===skipIndex?skipAge:-1),root=this.roots[i];
      root.visible=true;root.position.set(-STREET_EDGE+distance-i*gap+(i===0?-.06:i===1?.05:0)*play+(i===1?-.06:i===2?.08:0)*closer,.055+walkRise(gait)+hop.height,8.25);
      root.rotation.set(0,-Math.PI/2,Math.sin(gait)*.004+(i===1?.035:0)*play);
      const glance=variant%3===i?Math.sin(Math.PI*ease(age,duration*.48,duration*.48+5.5))**2:0;
      const asking=(ease(borrowAge,0,1)-ease(borrowAge,7,10))*(i===1?.7:i===2?-.3:0);
      this.people[i].animate(gait,time,glance*(1-play)+(i===0?.65:i===1?-.5:0)*play+asking,i===1?(borrowAge>=5?shelter:0):rain,i===skipIndex?skipAge:-1);
      this.people[i].setWetness(rain*(i===1?1-.3*ease(borrowAge,7,13):.25));
      const bag=root.getObjectByName('Student'+i+'_Bag');if(bag)bag.rotation.x=Math.sin(gait+.5)*.04;
    }
    for(const root of this.roots)root.updateWorldMatrix(true,true);
    if(play>.001){
      this.point.set(.15,1.28,-.12);this.people[1].object.localToWorld(this.point);
      this.people[0].gestureHand('R',this.point,play*.9);
      this.point.set(-.28,1.16,-.30);this.people[1].object.localToWorld(this.point);
      this.people[1].gestureHand('L',this.point,play*.75);
    }
    const recipient=this.people[1],giver=this.people[2];
    this.roots[1].getWorldPosition(this.point);this.roots[2].getWorldPosition(this.other);this.point.lerp(this.other,.5);this.point.y+=1.20;
    const tilt=.85*ease(borrowAge,1,3)*(1-ease(borrowAge,9,11));
    const give=ease(borrowAge,1,3)*(1-ease(borrowAge,5.5,7));
    if(borrowAge>=3&&borrowAge<11){
      // Withdraw while the group separates, following a low arc around the shoulder.
      const retract=ease(borrowAge,5.5,11),target=recipient.palmContact().lerp(this.point,1-retract);
      this.other.set(-.12,-.25,0);recipient.object.localToWorld(this.other);
      this.other.sub(recipient.object.getWorldPosition(this.arc));target.addScaledVector(this.other,4*retract*(1-retract));
      if(borrowAge<5)target.copy(recipient.palmContact()).lerp(this.point,ease(borrowAge,3,5));
      recipient.holdUmbrella(1,time,target,tilt*ease(borrowAge,3,5),ease(borrowAge,3,5));
    }
    if(give>0)giver.gestureHand('R',borrowAge>=5?recipient.palmContact():this.point,give);
    if(borrowAge<5){
      const bag=giver.object.localToWorld(this.other.set(.25,.75,.12));
      bag.lerp(giver.heldHandContact('R'),ease(borrowAge,1.2,3.2));
      recipient.placeUmbrella(bag,0,.08*(1-ease(borrowAge,1,3))+tilt);
    }else if(borrowAge<11)recipient.placeUmbrella(recipient.palmContact(),ease(borrowAge,9,11),tilt);
  }
}
