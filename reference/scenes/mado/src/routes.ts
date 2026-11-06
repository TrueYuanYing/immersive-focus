// The seat has an 80-degree horizontal field-of-view cap; 24 m leaves a full model offscreen.
export const STREET_EDGE=24;
export const CROSSING_SECONDS=16;
const approachSpeed=.65,crossingSpeed=.48,radius=.6,arc=radius*Math.PI/2,road=6.05;
const endX=(variant:number)=>STREET_EDGE+(variant%2?4:0);

export function familyApproachSeconds(variant:number){return (endX(variant)-2.6)/approachSpeed+.8;}
export function familyExitSeconds(variant:number){return (arc+road+endX(variant)-3.2)/crossingSpeed+.4;}

/** One continuous path in either direction, with a stationary wait before entering the road. */
export function familyRoute(age:number,variant:number,crossAge?:number){
  const approach=familyApproachSeconds(variant),t=Math.max(0,Math.min(age,approach));
  let distance=approachSpeed*(t<.8?t*t/1.6:t<approach-.8?t-.4:approach-.8-(approach-t)**2/1.6);
  let x=endX(variant)-distance,z=1.6,yaw=Math.PI/2,walking=Math.min(1,t/.8,(approach-t)/.8);
  const turn=Math.max(0,Math.min(1,(age-approach)/1.2));
  yaw+=Math.PI/2*turn*turn*(3-2*turn);
  if(crossAge!==undefined){
    const c=Math.max(0,crossAge),d=crossingSpeed*(c<.8?c*c/1.6:c-.4);walking=Math.min(1,c/.8);
    distance+=d;
    if(d<road){x=2.6;z=1.6+d;yaw=Math.PI;}
    else if(d<arc+road){const a=(d-road)/radius;x=3.2-radius*Math.cos(a);z=7.65+radius*Math.sin(a);yaw=Math.PI+a;}
    else{x=3.2+d-arc-road;z=8.25;yaw=Math.PI*1.5;}
  }
  if(variant%2){x=4-x;z=9.85-z;yaw+=Math.PI;}
  return {x,z,yaw,distance,walking};
}
