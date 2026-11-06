import type {CatchInput} from './session';
export const species=[
  {name:'竹荚鱼',note:'银亮的一小片海。',min:17,max:30},
  {name:'真鲷',note:'像带回了一点晚霞。',min:23,max:46},
  {name:'鲭鱼',note:'背上的波纹，比海更深一点。',min:22,max:38},
  {name:'黄鳍鲷',note:'鳍尖留着一抹阳光。',min:18,max:35},
  {name:'花鲈',note:'从岛边的礁石间游来。',min:27,max:53},
  {name:'沙梭',note:'轻快得像一支银色的笔。',min:16,max:28},
  {name:'羊鱼',note:'在暖水里慢慢散步。',min:18,max:32},
  {name:'黑鲷',note:'礁湾里安静的老邻居。',min:21,max:42},
];
export type FishingPhase='Entering'|'Ready'|'Charging'|'Casting'|'Waiting'|'Biting'|'Reeling'|'Caught'|'Releasing'|'Returning';
export type FishingSound='cast'|'splash'|'nibble'|'bite'|'hook'|'reel'|'release';
export class FishingController {
  phase:FishingPhase='Ready'; phaseTime=0; time=0; tension=0; progress=0; held=false; assisted=false;
  distance:'near'|'middle'='near'; waitTime=8; biteWindow=3; current:CatchInput|null=null; caughtCount=0;
  weather:'sun'|'rain'='sun'; night=false; lost=false;
  power=0;castDistance=7.2;aim=0;castAim=0;
  steer=0;lift=false;stamina=1;lossReason:''|'break'|'slack'|'miss'='';
  private slackTime=0;private lastTwitch=-10;
  get fishDirection(){return Math.sin(this.phaseTime*.73+(this.current?.species??0))>=0?1:-1;}
  get fighting(){const cycle=this.phaseTime%7.2;return this.stamina>.08&&cycle>=2.6&&cycle<2.6+3.8*(.4+.6*this.stamina);}
  get rodSteer(){return this.assisted&&this.fighting?-this.fishDirection:this.steer;}
  get reeling(){return this.phase==='Reeling'&&this.held&&(!this.assisted||!this.fighting);}
  get lineDistance(){return 1.9+(1-this.progress)*(this.castDistance-1.9);}
  get lurePulse(){return Math.max(0,1-(this.time-this.lastTwitch)/.65);}
  private nibblePlayed=false;private reelSoundTime=0;
  constructor(private onCast:()=>boolean,private onCatch:(fish:CatchInput)=>void,private sound:(kind:FishingSound)=>void,private random:()=>number=Math.random) {}
  enter(){this.set('Entering');}
  ready(){this.set('Ready');this.held=false;this.steer=0;this.lift=false;}
  private set(phase:FishingPhase){this.phase=phase;this.phaseTime=0;}
  beginCast(){if(this.phase==='Ready'){this.power=0;this.held=false;this.set('Charging');}}
  releaseCast(){if(this.phase==='Charging'){const power=this.power;this.set('Ready');this.action();this.castDistance=7+power*9;this.castAim=this.aim;}}
  cancelCast(){if(this.phase==='Charging')this.ready();}
  action() {
    if(this.phase==='Ready') {
      this.castDistance=this.distance==='near'?7.2:11;this.castAim=this.aim;
      this.lost=false;this.lossReason='';this.progress=0;this.tension=0;this.stamina=1;this.slackTime=0;this.nibblePlayed=false;
      const weights=this.night?[4,1,2,1,5,2,1,5]:this.weather==='rain'?[4,2,5,1,5,2,1,3]:[6,4,3,4,3,4,3,2];
      let draw=this.random()*weights.reduce((n,w)=>n+w,0),index=0;
      for(let i=0;i<weights.length;i++){draw-=weights[i];if(draw<=0){index=i;break}}
      if(this.caughtCount===0) index=0;
      const s=species[index];this.current={id:crypto.randomUUID(),species:index,length:Math.round((s.min+(s.max-s.min)*this.random())*10)/10};
      this.waitTime=5+this.random()*7;this.biteWindow=this.caughtCount===0?4:3;
      this.sound('cast');this.set('Casting');
    } else if(this.phase==='Biting') {this.sound('hook');this.set('Reeling');this.tension=.28;this.held=false;}
    else if(this.phase==='Waiting'&&this.time-this.lastTwitch>1.5){this.lastTwitch=this.time;this.waitTime=Math.max(this.phaseTime+1.3,this.waitTime-.7);this.sound('nibble');}
    else if(this.phase==='Reeling' && this.assisted) this.held=!this.held;
    else if(this.phase==='Caught') {this.sound('release');this.held=false;this.set('Releasing');}
  }
  interrupt(){if(this.phase!=='Returning'){this.current=null;this.held=false;this.set('Ready');}}
  leave(){this.held=false;this.current=null;this.set('Returning');}
  private lose(reason:'break'|'slack'|'miss'){this.lost=true;this.lossReason=reason;this.current=null;this.ready();}
  tick(dt:number) {
    if(!Number.isFinite(dt)||dt<=0) return;
    let remaining=Math.min(dt,60);
    while(remaining>1e-7){const step=Math.min(remaining,1/120);this.step(step);remaining-=step;}
  }
  private step(dt:number){
    this.phaseTime+=dt;this.time+=dt;
    if(this.phase==='Reeling'){this.fightStep(dt);return;}
    if(this.phase==='Ready'||this.phase==='Charging')this.aim=Math.max(-1,Math.min(1,this.aim+this.steer*dt*.5));
    if(this.phase==='Charging')this.power=Math.min(1,this.phaseTime/1.4);
    else if(this.phase==='Casting' && this.phaseTime>=1.35-1e-9) {
      if(!this.onCast()){this.ready();return}
      this.sound('splash');this.set('Waiting');
    } else if(this.phase==='Waiting') {
      if(!this.nibblePlayed&&this.phaseTime>=this.waitTime*.5) {this.nibblePlayed=true;this.sound('nibble');}
      if(this.phaseTime>=this.waitTime-1e-9){this.sound('bite');this.set('Biting');}
    } else if(this.phase==='Biting') {
      if(this.assisted&&this.phaseTime>=.45) this.action();
      else if(this.phaseTime>this.biteWindow)this.lose('miss');
    } else if(this.phase==='Releasing'&&this.phaseTime>1.4){this.current=null;this.set('Ready');}
  }
  private fightStep(dt:number){
    const fight=this.fighting,counter=Math.max(0,-this.fishDirection*this.rodSteer),wrong=Math.max(0,this.fishDirection*this.rodSteer),reel=this.reeling;
    const rate=fight?.11-counter*.18+wrong*.12+(reel?.43:0)+(this.lift&&!this.assisted?.16:0):reel?.035:-.18;
    this.tension=Math.max(0,Math.min(this.assisted?.78:1,this.tension+rate*dt));
    if(this.tension>=1){this.lose('break');return;}
    this.stamina=Math.max(0,this.stamina-dt*(fight?(.035+counter*.095):.012));
    // A fighting fish takes line; a tired fish can be reeled in. Lifting helps only in the calm window.
    const speed=fight?-(.28-counter*.20):reel?1.03+((this.lift||this.assisted)?.34:0):-.035;
    this.progress=Math.max(0,Math.min(1,this.progress+speed*dt/(this.castDistance-1.9)));
    this.slackTime=this.tension<.035&&!reel&&counter<.4?this.slackTime+dt:0;
    if(!this.assisted&&this.slackTime>6){this.lose('slack');return;}
    if(reel&&this.time-this.reelSoundTime>.65){this.reelSoundTime=this.time;this.sound('reel');}
    if(this.progress>=1&&this.current){this.sound('splash');this.onCatch(this.current);this.caughtCount++;this.held=false;this.set('Caught');}
  }
  struggle(){return this.fighting?.7+Math.sin(this.phaseTime*5)*.22:.06;}
  label() {
    switch(this.phase){
      case 'Entering':return '走到背风的甲板';case 'Ready':return this.lossReason==='break'?'鱼线断了。下一次，挣扎时先松开收线。':this.lossReason==='slack'?'鱼线松得太久，它脱钩了。':this.lost?'错过咬钩了，慢慢再来。':'选个方向，按住蓄力抛竿。';
      case 'Charging':return '松开抛投 · 左右调整方向';case 'Casting':return '鱼线轻轻划过海风';case 'Waiting':return this.phaseTime>this.waitTime*.47&&this.phaseTime<this.waitTime*.67?'它在试探，再等一小会儿。':'看看浮漂，听听海。';
      case 'Biting':return '浮漂沉下去了 · 现在提竿';case 'Reeling':return this.fighting?`它向${this.fishDirection>0?'右':'左'}挣扎 · 向${this.fishDirection>0?'左':'右'}控竿，松开收线`:this.tension>.8?'张力很高，先放松一下。':'它游累了 · 收线，抬竿把它带近';
      case 'Caught':return this.current?species[this.current.species].note:'';case 'Releasing':return '回到海里吧。';case 'Returning':return '回到刚才那一页';
    }
  }
}
