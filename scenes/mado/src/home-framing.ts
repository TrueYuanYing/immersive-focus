import { Box3, PerspectiveCamera, Vector3 } from 'three';

/** Frame the unchanged miniature into the unoccupied UI rectangle, on resize only. */
export function frameHome(camera: PerspectiveCamera, bounds: Box3, width: number, height: number, area: {left:number;top:number;width:number;height:number}) {
  const center=bounds.getCenter(new Vector3());
  const direction=new Vector3(-9,8,-18).normalize();
  camera.clearViewOffset();camera.fov=42;camera.aspect=width/height;
  camera.position.copy(center).add(direction);camera.lookAt(center);camera.updateMatrixWorld();
  const inverse=camera.quaternion.clone().invert();
  const tanV=Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;
  const fractionX=Math.max(.05,area.width/width)*.90,fractionY=Math.max(.05,area.height/height)*.90;
  let distance=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=new Vector3(x,y,z).sub(center).applyQuaternion(inverse);
    distance=Math.max(distance,point.z+Math.abs(point.x)/(tanH*fractionX),point.z+Math.abs(point.y)/(tanV*fractionY));
  }
  camera.position.copy(center).addScaledVector(direction,distance);camera.lookAt(center);
  camera.setViewOffset(width,height,width/2-area.left-area.width/2,height/2-area.top-area.height/2,width,height);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();return center;
}
