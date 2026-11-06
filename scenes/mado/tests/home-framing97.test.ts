import { Box3,PerspectiveCamera,Vector3 } from 'three';
import { expect,it } from 'vitest';
import {frameHome} from '../src/home-framing';
it.each([[393,760],[873,330],[800,1180],[1280,700]])('keeps the model inside its UI rectangle at %sx%s',(w,h)=>{
 const box=new Box3(new Vector3(-87,-2.25,-4.5),new Vector3(-73,5.72,4.5)),c=new PerspectiveCamera();
 const area=w/h<.8?{left:20,top:86,width:w-40,height:h*.4}:{left:w*.42,top:80,width:w*.54,height:h-120};
 frameHome(c,box,w,h,area);
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
  const p=new Vector3(x,y,z).project(c),sx=(p.x+1)*w/2,sy=(1-p.y)*h/2;
  expect(sx).toBeGreaterThanOrEqual(area.left);expect(sx).toBeLessThanOrEqual(area.left+area.width);
  expect(sy).toBeGreaterThanOrEqual(area.top);expect(sy).toBeLessThanOrEqual(area.top+area.height);
 }
});
