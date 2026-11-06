import type {Settings} from './settings';
import {defaultMix,soundLabels,type SoundChannel} from './sound-mix';
type Sound='click'|'select'|'confirm'|'back'|'switch'|'slider'|'stamp'|'door'|'page'|'cup'|'bird'|'cast'|'splash'|'nibble'|'bite'|'hook'|'reel'|'release';
/** Original stereo synthesis: independent buses, noise colours, swells and irregular transients. */
export class Soundscape {
  private ctx:AudioContext|null=null;private master:GainNode|null=null;
  private loops:AudioScheduledSourceNode[]=[];private live=new Set<AudioScheduledSourceNode>();
  private channels=new Map<SoundChannel,GainNode>();private noise:AudioBuffer|null=null;
  private muted=false;private volume=.45;private hidden=false;private destroyed=false;private timer=0;private step=0;
  private settings:Settings|null=null;private place:'harbor'|'cabin'|'deck'='harbor';
  async unlock(){
    if(this.destroyed)return;
    if(!this.ctx){
      const c=this.ctx=new AudioContext();this.master=c.createGain();this.master.gain.value=0;
      const limiter=c.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=15;limiter.ratio.value=5;this.master.connect(limiter).connect(c.destination);
      for(const key of Object.keys(soundLabels) as SoundChannel[]){const bus=c.createGain();bus.gain.value=0;bus.connect(this.master);this.channels.set(key,bus);}
      const buffers=new Map<string,AudioBuffer>();
      for(const colour of ['white','brown']){
        const b=c.createBuffer(2,c.sampleRate*12,c.sampleRate);
        for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let last=0;for(let i=0;i<d.length;i++){const r=Math.random()*2-1;last=(last+.025*r)/1.025;d[i]=colour==='brown'?last*5:r;}
          const seam=Math.floor(c.sampleRate*.5);for(let i=0;i<seam;i++){const p=i/(seam-1);d[d.length-seam+i]=d[d.length-seam+i]*(1-p)+d[i]*p;}}
        buffers.set(colour,b);
      }
      this.noise=buffers.get('white')!;
      const bed=(key:SoundChannel,colour:string,type:BiquadFilterType,hz:number,level:number,rate=0,depth=0)=>{
        const src=c.createBufferSource();src.buffer=buffers.get(colour)!;src.loop=true;src.loopStart=.5;src.loopEnd=12;
        const filter=c.createBiquadFilter();filter.type=type;filter.frequency.value=hz;filter.Q.value=.45;
        const g=c.createGain();g.gain.value=level;src.connect(filter).connect(g).connect(this.channels.get(key)!);src.start(0,.5+Math.random()*8);this.loops.push(src);
        if(rate){const lfo=c.createOscillator(),amount=c.createGain();lfo.frequency.value=rate;amount.gain.value=level*depth;lfo.connect(amount).connect(g.gain);lfo.start();this.loops.push(lfo);}
      };
      bed('ocean','brown','lowpass',900,.33,.085,.68);bed('ocean','white','lowpass',1600,.09,.086,.85);
      bed('wind','brown','bandpass',580,.35,.037,.62);bed('rain','white','highpass',700,.14,.22,.13);
      bed('stream','white','bandpass',1200,.21,.63,.25);bed('fire','brown','lowpass',440,.17,.21,.52);
      bed('white','white','lowpass',11000,.105);bed('brown','brown','lowpass',400,.42);
      for(const [frequency,amp] of [[46,.065],[92,.014],[138,.007]]){const src=c.createOscillator(),g=c.createGain();src.frequency.value=frequency;g.gain.value=amp;src.connect(g).connect(this.channels.get('engine')!);src.start();this.loops.push(src);}
      this.timer=window.setInterval(()=>this.ambience(),1300);
    }
    if(!this.hidden){await this.ctx.resume();if(!this.destroyed)this.apply();}
  }
  configure(s:Settings,place:'harbor'|'cabin'|'deck'){this.settings=s;this.muted=s.muted;this.volume=s.volume;this.place=place;this.apply();}
  private apply(){
    if(!this.ctx||!this.master)return;const t=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted||this.hidden?0:this.volume,t,.08);
    for(const [key,bus] of this.channels){const gain=(this.settings?.soundMix??defaultMix)[key];bus.gain.setTargetAtTime(gain,t,.15);}
    if(this.muted)this.cancelTransient();
  }
  private ambience(){
    if(!this.ctx||this.ctx.state!=='running'||this.hidden||this.muted)return;this.step++;
    if(this.step%13===0&&this.channels.get('birds')!.gain.value>.01){this.tone(1450,.23,.025,'birds',0,1.52);this.tone(1790,.20,.017,'birds',.30,.71);}
    if(Math.random()<.7)this.burst('fire',.025+Math.random()*.055,1700,.08+Math.random()*.09);
    if(this.step%7===0&&this.place==='cabin')this.burst('desk',.32,2800,.025);
    if(Math.random()<.5)this.tone(600+Math.random()*1300,.065,.008,'stream',0,.68);
  }
  private bus(channel?:SoundChannel){return channel?this.channels.get(channel)!:this.master!;}
  private track(src:AudioScheduledSourceNode,nodes:AudioNode[],end:number,start:number){this.live.add(src);src.onended=()=>{src.disconnect();nodes.forEach(n=>n.disconnect());this.live.delete(src);};src.start(start);src.stop(end);}
  private tone(hz:number,duration:number,amp:number,channel?:SoundChannel,delay=0,ratio=.65){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime+delay,src=c.createOscillator(),g=c.createGain();
    src.frequency.setValueAtTime(hz,t);src.frequency.exponentialRampToValueAtTime(Math.max(28,hz*ratio),t+duration);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+.006);g.gain.exponentialRampToValueAtTime(.00001,t+duration);
    src.connect(g).connect(this.bus(channel));this.track(src,[g],t+duration+.02,t);
  }
  private burst(channel:SoundChannel|undefined,duration:number,hz:number,amp:number){
    if(!this.ctx||!this.noise||channel&&this.channels.get(channel)!.gain.value<.002)return;
    const c=this.ctx,t=c.currentTime,src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();src.buffer=this.noise;
    f.type='bandpass';f.frequency.value=hz;f.Q.value=.55;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(amp,t+.007);g.gain.exponentialRampToValueAtTime(.00001,t+duration);
    src.connect(f).connect(g).connect(this.bus(channel));this.track(src,[f,g],t+duration+.015,t);
  }
  play(kind:Sound){
    if(!this.ctx||!this.master||this.muted||this.hidden||this.ctx.state!=='running')return;
    if(kind==='page'){this.burst('desk',.42,1900,.16);return;}
    if(kind==='cup'){this.tone(1640,.32,.035,'desk');this.tone(2670,.19,.012,'desk',.006,.98);this.burst('desk',.06,490,.05);return;}
    if(kind==='bird'){this.tone(1320,.24,.023,'birds',0,1.6);return;}
    if(kind==='stamp'){this.burst(undefined,.13,390,.36);this.tone(78,.13,.12);return;}
    if(['splash','release','cast'].includes(kind)){this.burst('ocean',kind==='cast'?.34:.62,kind==='cast'?2100:690,.26);return;}
    if(kind==='reel'){this.burst('desk',.04,900,.08);return;}
    if(kind==='door'){this.burst(undefined,.28,240,.07);return;}
    const profile:Partial<Record<Sound,[number,number,number]>>={click:[380,.035,.013],select:[510,.055,.015],confirm:[620,.15,.023],back:[280,.075,.015],switch:[420,.05,.016],slider:[460,.035,.005],nibble:[260,.1,.023],bite:[180,.23,.05],hook:[340,.11,.025]};
    const [hz,duration,amp]=profile[kind]??[300,.05,.01];this.tone(hz,duration,amp);
  }
  private cancelTransient(){for(const source of this.live){try{source.stop()}catch{}source.disconnect();}this.live.clear();}
  async visibility(hidden:boolean){this.hidden=hidden;this.cancelTransient();this.apply();if(this.ctx){if(hidden)await this.ctx.suspend();else await this.ctx.resume();}}
  diagnostics(){return {contexts:this.ctx?1:0,loops:this.loops.length,transients:this.live.size,state:this.ctx?.state??'locked',muted:this.muted,channels:Object.fromEntries([...this.channels].map(([k,v])=>[k,v.gain.value]))};}
  dispose(){this.destroyed=true;clearInterval(this.timer);this.cancelTransient();for(const source of this.loops){try{source.stop()}catch{}source.disconnect();}this.loops=[];this.channels.clear();void this.ctx?.close();this.ctx=null;this.master=null;this.noise=null;}
}
