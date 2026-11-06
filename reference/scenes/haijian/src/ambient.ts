export type EventType='bird'|'aircraft'|'fish'|'spout'|'breach';
export type AmbientEvent={id:number;type:EventType;age:number;duration:number;lane:number;variation:number};
export type AmbientContext={activity:'quiet'|'everyday'|'lively';fishing:boolean;reduced:boolean;night:boolean;progress:number;rain?:boolean;lowQuality?:boolean};
export function seeded(seed:number) {return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const duration:Record<EventType,number>={bird:44,aircraft:66,fish:24,spout:16,breach:18};
const cooldown:Record<EventType,number>={bird:36,aircraft:115,fish:60,spout:180,breach:510};
export class AmbientEventManager {
  events:AmbientEvent[]=[]; private random:()=>number;private clock=0;private serial=0;
  private next:Record<EventType,number>={bird:6,aircraft:32,fish:18,spout:115,breach:430};
  private context:AmbientContext={activity:'everyday',fishing:false,reduced:false,night:false,progress:0};
  constructor(seed=911){this.random=seeded(seed);}
  force(type:EventType) {
    const prominent=type==='spout'||type==='breach';
    if((prominent&&(this.context.fishing||this.events.some(e=>e.type==='spout'||e.type==='breach')))||this.events.some(e=>e.type===type))return false;
    if(this.events.length>=3)return false;
    this.events.push({id:++this.serial,type,age:0,duration:duration[type],lane:this.random(),variation:this.random()});
    this.next[type]=this.clock+duration[type]+cooldown[type]*(.8+this.random()*.7);return true;
  }
  tick(dt:number,context:AmbientContext) {
    this.clock+=dt;this.context=context;
    for(const e of this.events)e.age+=dt;
    this.events=this.events.filter(e=>e.age<e.duration);
    if(context.reduced)return;
    const limit=context.activity==='quiet'||context.lowQuality?1:context.activity==='lively'?3:2;
    for(const type of Object.keys(this.next) as EventType[]) {
      if(this.clock<this.next[type]||this.events.length>=limit)continue;
      if((context.night||context.rain) && (type==='bird'||type==='aircraft')){this.next[type]=this.clock+35;continue;}
      if((context.progress<.06||context.progress>.92||context.fishing)&&(type==='spout'||type==='breach'))continue;
      if(this.force(type)) this.next[type]+=context.activity==='quiet'?cooldown[type]:0;
    }
  }
  clear(){this.events=[];}
}
