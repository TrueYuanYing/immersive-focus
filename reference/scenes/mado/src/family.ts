import * as THREE from 'three';
import { CharacterRig } from './student';
import { walkPhase, walkRise } from './motion';
import { familyRoute } from './routes';

/** A quiet, continuous crossing: wait, hold hands, cross, turn onto the far pavement. */
export class Family {
  readonly object=new THREE.Group();
  readonly mother:CharacterRig;
  readonly daughter:CharacterRig;
  private grip=new THREE.Vector3();

  constructor(source:THREE.Group,umbrella:THREE.Object3D){
    this.object.name='Family';
    this.mother=new CharacterRig(source.getObjectByName('Mother') as THREE.Group,0,'mother');
    this.daughter=new CharacterRig(source.getObjectByName('Daughter') as THREE.Group,1,'daughter');
    this.mother.attachUmbrella(umbrella);
    this.object.add(this.mother.object,this.daughter.object);this.object.visible=false;
  }

  update(age:number,time:number,rain:number,variant=0,crossAge?:number){
    const {x,z,yaw,distance,walking}=familyRoute(age,variant,crossAge);
    this.object.visible=true;this.object.position.set(x,.062,z);this.object.rotation.y=yaw;
    for(const [i,person] of [this.mother,this.daughter].entries()){
      const side=i?.27:-.25,turn=yaw-(variant%2?Math.PI*1.5:Math.PI/2);
      const gait=walkPhase(distance+side*turn,1,i*.6,person.strideScale);
      person.object.position.set(side,walkRise(gait,person.strideScale)*walking,0);
      // A child takes smaller, quicker steps while the shared hand keeps their spacing.
      const glance=(1-walking)*Math.sin(Math.min(age%11/3,1)*Math.PI)*.24;
      person.animate(gait,time,i?.12+glance:-.07-glance,i?0:rain,-1,walking);
    }
    this.object.updateWorldMatrix(true,true);
    this.grip.set(.055,.985+Math.sin(time*1.4)*.006,-.035);this.object.localToWorld(this.grip);
    this.mother.holdHand('R',this.grip);this.daughter.holdHand('L',this.grip);
  }
}
