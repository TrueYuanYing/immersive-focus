import { STREET_EDGE, CROSSING_SECONDS, familyApproachSeconds, familyExitSeconds } from './routes';
export type CrowdMode='quiet'|'daily'|'lively';
export const crowdNames={quiet:'清静',daily:'日常',lively:'热闹'};
export type EventName = 'train' | 'students' | 'worker' | 'walker' | 'car' | 'bike' | 'cat' | 'hand' | 'bird' | 'skip' | 'family' | 'borrow';
type Rule = { name: EventName; cooldown: [number, number]; duration: number; first: number; channel: 'rail' | 'road' | 'walk' | 'hands' | 'sound' | 'gesture' };
export type AmbientEvent = { name: EventName; start: number; duration: number; variant: number; channel: Rule['channel']; crossingStart?:number; borrowStart?:number; sounded?:boolean };
const rules: Rule[] = [
  { name: 'train', cooldown: [180, 300], duration: 18, first: 40, channel: 'rail' },
  { name: 'family', cooldown: [140, 220], duration: Infinity, first: 40, channel: 'walk' },
  { name: 'students', cooldown: [65, 105], duration: (STREET_EDGE*2+4)/.55, first: 2, channel: 'walk' },
  { name: 'worker', cooldown: [45, 90], duration: STREET_EDGE*2/(28/30), first: 19, channel: 'walk' },
  { name: 'walker', cooldown: [70, 120], duration: STREET_EDGE*2/(28/45), first: 61, channel: 'walk' },
  { name: 'car', cooldown: [24, 48], duration: STREET_EDGE*2/2, first: 12, channel: 'road' },
  { name: 'bike', cooldown: [65, 120], duration: STREET_EDGE*2/(30/26), first: 36, channel: 'road' },
  { name: 'cat', cooldown: [100, 180], duration: STREET_EDGE*2/.65, first: 83, channel: 'walk' },
  { name: 'hand', cooldown: [30, 150], duration: 10, first: 35, channel: 'hands' },
  { name: 'bird', cooldown: [45, 100], duration: 3, first: 23, channel: 'sound' },
  { name: 'skip', cooldown: [70, 120], duration: 2.7, first: 10, channel: 'gesture' },
  { name: 'borrow', cooldown: [90, 140], duration: 11, first: 0, channel: 'gesture' },
];

export class AmbientManager {
  active: AmbientEvent[] = [];
  private next = new Map<EventName, number>();
  private lastVariant = new Map<EventName, number>();
  crowd:CrowdMode='quiet';
  private factor(){return {quiet:1.6,daily:.75,lively:.25}[this.crowd];}
  constructor(private random: () => number = Math.random) { rules.forEach(r => this.next.set(r.name, r.first)); }
  setCrowd(mode:CrowdMode,now:number){
    const old=this.factor();this.crowd=mode;
    for(const rule of rules)if(['walk','road'].includes(rule.channel)){
      const next=this.next.get(rule.name)!;this.next.set(rule.name,now+Math.max(0,next-now)*this.factor()/old);
    }
  }
  tick(now: number, rain=false): AmbientEvent[] {
    const started: AmbientEvent[] = [];
    this.active = this.active.filter(e => {
      if (now < e.start + e.duration) return true;
      const rule = rules.find(r => r.name === e.name)!;
      this.next.set(e.name, now + (rule.cooldown[0] + this.random() * (rule.cooldown[1] - rule.cooldown[0]))*(['walk','road'].includes(rule.channel)?this.factor():1));
      return false;
    });
    const family=this.active.find(e=>e.name==='family');
    const waiting=family&&now-family.start>=familyApproachSeconds(family.variant);
    if(waiting&&family.crossingStart===undefined&&now-family.start>=familyApproachSeconds(family.variant)+1.5&&now%56<=4&&!this.active.some(e=>e.channel==='road')){
      family.crossingStart=now;family.duration=now-family.start+familyExitSeconds(family.variant);
    }
    // Long offscreen approaches must not let earlier rules permanently crowd out the cat or walkers.
    const due=[...rules].sort((a,b)=>this.next.get(a.name)!-this.next.get(b.name)!);
    for (const r of due) {
      if (now < this.next.get(r.name)! || this.active.some(e => e.name === r.name)) continue;
      // Reserve the crossing until both pedestrians have reached the far pavement.
      if(r.channel==='road'&&waiting&&(family.crossingStart===undefined||now-family.crossingStart<CROSSING_SECONDS))continue;
      if(r.name==='borrow'){
        const group=this.active.find(e=>e.name==='students');
        if(!rain||!group||group.borrowStart!==undefined||now-group.start<group.duration*.34||now-group.start>group.duration*.7)continue;
      }
      if(r.name==='skip'){
        const group=this.active.find(e=>e.name==='students');
        if(rain||!group||group.borrowStart!==undefined||now-group.start<group.duration*.56||now-group.start>group.duration*.70)continue;
        // Leave the look-back smile its own quiet moment.
        if(now-group.start>group.duration*.48-3&&now-group.start<group.duration*.48+7)continue;
      }
      const count = this.active.filter(e => e.channel === r.channel).length;
      if(r.channel==='walk'){
        const walkers=this.active.filter(e=>e.channel==='walk'),lane=(name:EventName)=>['students','walker'].includes(name)?'far':'near';
        if(walkers.some(e=>e.name==='family')||(r.name==='family'&&walkers.length))continue;
        if(r.name!=='family'&&now>=this.next.get('family')!&&!family)continue;
        if(walkers.some(e=>lane(e.name)===lane(r.name))||count>=(this.crowd==='quiet'?1:2))continue;
      }else if (count >= 1) continue;
      const streetCount = this.active.filter(e => ['rail', 'road', 'walk'].includes(e.channel)).length;
      if (['rail', 'road', 'walk'].includes(r.channel) && streetCount >= (this.crowd==='quiet'?3:4)) continue;
      let variant = Math.floor(this.random() * 6);
      if (variant === this.lastVariant.get(r.name)) variant = (variant + 1) % 6;
      if(r.name==='skip'&&variant%3===(this.lastVariant.get(r.name)??-1)%3)variant=(variant+1)%6;
      this.lastVariant.set(r.name, variant);
      // Freeze travel time at entry, so switching weather cannot teleport a rider.
      const event = { name: r.name, start: now, duration: r.name==='bike'&&rain?STREET_EDGE*2/(30/18.5):r.duration, variant, channel: r.channel };
      if(r.name==='borrow')this.active.find(e=>e.name==='students')!.borrowStart=now;
      this.active.push(event); started.push(event);
    }
    return started;
  }
}
