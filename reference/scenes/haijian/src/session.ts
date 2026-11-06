import {consumeOpportunity, updateOpportunity, type Opportunity} from './opportunity';
import {defaults, validateSettings, type Settings} from './settings';
export type VoyageStatus = 'boarding' | 'focusing' | 'paused' | 'fishing';
export type Rest = {id:string; startedAt:number; consumed:boolean; resumeAfter:boolean};
export type Voyage = {id:string; createdAt:number; durationMs:number; focusMs:number; runningSince:number|null; status:VoyageStatus; restMs:number; rest:Rest|null; opportunity:Opportunity;startWithFishing:boolean};
export type Ticket = {id:string; createdAt:number; endedAt:number; durationMs:number; focusMs:number; restMs:number; complete:boolean};
export type CatchInput = {id:string; species:number; length:number};
export type FishRecord = CatchInput & {voyageId:string; restId:string; caughtAt:number; region:string};
type StoragePort = Pick<Storage, 'getItem'|'setItem'>;
export const STORAGE_KEY = 'haijian.v1';
const nonnegative = (n:unknown):n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export class SessionStore {
  active: Voyage|null = null;
  tickets: Ticket[] = [];
  fish:FishRecord[]=[];
  settings:Settings={...defaults};
  storageError = false;
  private recoveryRaw:string|null=null;
  constructor(private storage:StoragePort, private now:()=>number = Date.now) {
    let raw:string|null=null;
    try {
      this.recoveryRaw=storage.getItem(`${STORAGE_KEY}.recovery`);this.storageError=this.recoveryRaw!==null;
      raw=storage.getItem(STORAGE_KEY);const data = JSON.parse(raw ?? '{}');
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('无法读取记录');
      this.settings=validateSettings(data.settings);
      if(Array.isArray(data.fish)) this.fish=data.fish.filter((f:FishRecord)=>f && typeof f.id==='string' && typeof f.voyageId==='string' && typeof f.restId==='string' && typeof f.region==='string' && nonnegative(f.caughtAt) && Number.isInteger(f.species) && f.species>=0 && f.species<8 && nonnegative(f.length));
      if (Array.isArray(data.tickets)) this.tickets = data.tickets.filter((t:Ticket)=>t && typeof t.id==='string' && nonnegative(t.focusMs) && nonnegative(t.durationMs) && nonnegative(t.createdAt) && nonnegative(t.endedAt) && typeof t.complete==='boolean');
      const a = data.active;
      const validRest=a?.rest && typeof a.rest.id==='string' && nonnegative(a.rest.startedAt) && typeof a.rest.consumed==='boolean' && typeof a.rest.resumeAfter==='boolean';
      if (a && typeof a.id==='string' && nonnegative(a.createdAt) && nonnegative(a.durationMs) && a.durationMs>=300000 && a.durationMs<=10800000 && nonnegative(a.focusMs) && a.focusMs<=a.durationMs && (a.status==='focusing'?nonnegative(a.runningSince):a.runningSince===null) && ['boarding','focusing','paused','fishing'].includes(a.status) && nonnegative(a.restMs) && ['Available','CoolingDown'].includes(a.opportunity?.state) && nonnegative(a.opportunity.focusAtCast) && a.opportunity.focusAtCast<=a.focusMs && (a.status==='fishing'?validRest:a.rest===null)) {
        this.active=a;
        a.startWithFishing=a.startWithFishing===true;
        this.opportunity();
      }else if(a)throw new Error('航程记录格式不完整');
      if((Array.isArray(data.tickets)&&this.tickets.length!==data.tickets.length)||(Array.isArray(data.fish)&&this.fish.length!==data.fish.length))throw new Error('部分记录格式不完整');
    } catch { this.storageError=true;this.recoveryRaw=raw; }
  }
  create(minutes:number,startWithFishing=false) {
    if (this.active) return this.active;
    if (!Number.isInteger(minutes)||minutes<5||minutes>180) throw new Error('请选择 5–180 分钟');
    this.active={id:crypto.randomUUID(),createdAt:this.now(),durationMs:minutes*60000,focusMs:0,runningSince:null,status:'boarding',restMs:0,rest:null,opportunity:{state:'Available',focusAtCast:0},startWithFishing};
    this.save(); return this.active;
  }
  elapsed() {
    const a=this.active;
    return a ? Math.min(a.durationMs,a.focusMs+(a.status==='focusing' && a.runningSince!==null? Math.max(0,this.now()-a.runningSince):0)) : 0;
  }
  remaining() { return this.active ? Math.max(0,this.active.durationMs-this.elapsed()) : 0; }
  seat() { if (this.active?.status==='boarding') this.resume(); }
  pause() {
    const a=this.active; if (!a || a.status!=='focusing'||this.remaining()===0) return;
    a.focusMs=this.elapsed();a.runningSince=null;a.status='paused';this.save();
  }
  resume() {
    const a=this.active; if (!a || !['boarding','paused'].includes(a.status)) return;
    a.status='focusing';a.runningSince=this.now();this.save();
  }
  configure(patch:Partial<Settings>) {
    this.opportunity(); // 先按旧间隔锁定已经开放的机会，调大不收回。
    this.settings=validateSettings({...this.settings,...patch});this.opportunity();this.save();
  }
  opportunity() {
    const a=this.active;if(!a) return {available:false,remainingMs:0};
    const before=a.opportunity.state;
    const result=updateOpportunity(a.opportunity,this.elapsed(),this.settings.intervalMinutes);
    if(before!==a.opportunity.state) this.save();
    return result;
  }
  enterFishing():Rest|null {
    const a=this.active; if(!a) return null;
    if(a.status==='fishing') return a.rest;
    if(!this.settings.fishingEnabled||!this.opportunity().available||this.remaining()===0) return null;
    const resumeAfter=a.status!=='paused';a.focusMs=this.elapsed();a.runningSince=null;
    a.rest={id:crypto.randomUUID(),startedAt:this.now(),consumed:false,resumeAfter};a.status='fishing';this.save();return a.rest;
  }
  consumeCast() {
    const a=this.active;const rest=a?.rest;if(!a||a.status!=='fishing'||!rest) return false;
    if(!rest.consumed) {consumeOpportunity(a.opportunity,this.elapsed());rest.consumed=true;this.save();}
    return true;
  }
  returnToSeat() {
    const a=this.active;if(!a||a.status!=='fishing'||!a.rest) return;
    a.restMs+=Math.max(0,this.now()-a.rest.startedAt);const resume=a.rest.resumeAfter;
    a.rest=null;a.status=resume?'focusing':'paused';a.runningSince=resume?this.now():null;this.save();
  }
  restElapsed() {return this.active?.rest ? Math.max(0,this.now()-this.active.rest.startedAt) : 0;}
  confirmCatch(fish:CatchInput) {
    const a=this.active;
    if(!a||a.status!=='fishing'||!a.rest?.consumed) return false;
    if(typeof fish.id!=='string'||!Number.isInteger(fish.species)||fish.species<0||fish.species>7||!nonnegative(fish.length)) return false;
    if(this.fish.some(f=>f.id===fish.id)) return true;
    this.fish.unshift({...fish,voyageId:a.id,restId:a.rest.id,caughtAt:this.now(),region:'青屿海湾'});this.save();return true;
  }
  today() {
    const date=new Date(this.now()).toDateString();
    return this.tickets.filter(t=>new Date(t.endedAt).toDateString()===date).reduce((n,t)=>n+t.focusMs,0)+this.elapsed();
  }
  export() {return JSON.stringify({version:1,exportedAt:this.now(),active:this.active,tickets:this.tickets,fish:this.fish,settings:this.settings,recoveryRaw:this.recoveryRaw},null,2);}
  finish():Ticket|null {
    const a=this.active; if (!a) return null;
    const focusMs=this.elapsed();
    const endedAt = focusMs>=a.durationMs && a.runningSince!==null ? a.runningSince + a.durationMs-a.focusMs : this.now();
    const ticket={id:a.id,createdAt:a.createdAt,endedAt,durationMs:a.durationMs,focusMs,restMs:a.restMs+this.restElapsed(),complete:focusMs>=a.durationMs};
    if (!this.tickets.some(t=>t.id===a.id)) this.tickets.unshift(ticket);
    this.active=null;this.save();return ticket;
  }
  save() {
    try {
      if(this.recoveryRaw!==null)this.storage.setItem(`${STORAGE_KEY}.recovery`,this.recoveryRaw);
      this.storage.setItem(STORAGE_KEY,JSON.stringify({version:1,active:this.active,tickets:this.tickets,fish:this.fish,settings:this.settings}));this.storageError=this.recoveryRaw!==null;
    }
    catch {this.storageError=true;}
  }
}

export function clockLabel(ms:number) {
  const s=Math.max(0,Math.ceil(ms/1000));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
}
