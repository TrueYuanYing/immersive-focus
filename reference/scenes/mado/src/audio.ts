import type { EventName } from './ambient';
export type SoundChannel = 'cafe' | 'street' | 'desk';
type Cue = 'tap' | 'paper' | 'confirm' | 'back' | 'select' | 'toggle' | 'step' | 'door';

/** Small, bounded Web Audio voices. Every transient disconnects after playback. */
export class Soundscape {
  private context?: AudioContext;
  private master?: GainNode;
  private buses = {} as Record<SoundChannel | 'ui', GainNode>;
  private spaces={} as Record<SoundChannel,GainNode>;
  private scene:'home'|'counter'|'seat'='home';
  private rain?: GainNode;
  private windowRain?:GainNode;
  private rainValue = 0;
  private pink?: AudioBuffer;
  private white?: AudioBuffer;
  private lastUi = -Infinity;
  private lastUiCue: Cue | null = null;
  private activeVoices = 0;
  private transients = new Map<AudioScheduledSourceNode,()=>void>();
  private uiCount = 0;
  enabled = true;
  levels = { cafe: .45, street: .35, desk: .35 };
  async unlock() {
    if (!this.enabled) return;
    if (!this.context) {
      const c = this.context = new AudioContext();
      this.master=c.createGain();this.master.gain.value=.50;
      const compressor=c.createDynamicsCompressor();compressor.threshold.value=-20;compressor.knee.value=18;compressor.ratio.value=2.5;compressor.attack.value=.015;compressor.release.value=.25;
      const rumble=c.createBiquadFilter(),air=c.createBiquadFilter();rumble.type='highpass';rumble.frequency.value=65;air.type='lowpass';air.frequency.value=6800;
      this.master.connect(rumble).connect(air).connect(compressor).connect(c.destination);
      for(const name of ['cafe','street','desk','ui'] as const){
        const bus=this.buses[name]=c.createGain();bus.gain.value=name==='ui'?.6:this.levels[name];
        if(name==='ui')bus.connect(this.master);else{const space=this.spaces[name]=c.createGain();bus.connect(space).connect(this.master);}
      }
      this.pink=c.createBuffer(2,c.sampleRate*8,c.sampleRate);this.white=c.createBuffer(2,c.sampleRate*8,c.sampleRate);
      for(let channel=0;channel<2;channel++){
        const count=this.pink.length,fade=2048,pink=new Float32Array(count+fade),white=new Float32Array(count+fade);let a=0,b=0,d=0;
        for(let i=0;i<pink.length;i++){const w=Math.random()*2-1;white[i]=w;a=.997*a+w*.025;b=.985*b+w*.065;d=.85*d+w*.15;pink[i]=(a+b+d+w*.04)*.28;}
        // Blend the tail into the discarded prefix, then begin immediately after it.
        for(let i=0;i<fade;i++){const t=i/(fade-1);pink[count+i]=pink[count+i]*(1-t)+pink[i]*t;white[count+i]=white[count+i]*(1-t)+white[i]*t;}
        this.pink.getChannelData(channel).set(pink.subarray(fade));this.white.getChannelData(channel).set(white.subarray(fade));
      }
      this.loop('cafe',380,.060,false);this.loop('cafe',1650,.012,false);this.loop('street',950,.024,false);
      this.rain=this.loop('street',2700,this.rainValue*.10,true);
      this.windowRain=this.loop('cafe',5200,this.rainValue*.026,true);
      this.setScene(this.scene);
    }
    if(this.enabled&&!document.hidden)await this.context.resume();
  }
  private loop(bus: SoundChannel, frequency: number, volume: number, bright: boolean) {
    const c=this.context!,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=bright?this.white!:this.pink!;source.loop=true;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.value=volume;
    source.connect(filter).connect(gain).connect(this.buses[bus]);source.start(0,Math.random()*4);return gain;
  }
  private tone(frequency: number, duration: number, volume: number, bus: SoundChannel | 'ui', delay=0, end=frequency, pan=0) {
    const c=this.context;if(!c||!this.enabled||c.state!=='running'||this.activeVoices>=(bus==='ui'?24:20))return;
    const oscillator=c.createOscillator(),gain=c.createGain(),panner=c.createStereoPanner(),t=c.currentTime+delay;
    oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,t);oscillator.frequency.exponentialRampToValueAtTime(end,t+duration);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.009);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    panner.pan.value=pan;oscillator.connect(gain).connect(panner).connect(this.buses[bus]);oscillator.start(t);oscillator.stop(t+duration+.025);this.activeVoices++;
    const cleanup=()=>{if(!this.transients.delete(oscillator))return;oscillator.disconnect();gain.disconnect();panner.disconnect();this.activeVoices--;};
    this.transients.set(oscillator,cleanup);oscillator.onended=cleanup;
  }
  private noise(frequency:number,duration:number,volume:number,bus:SoundChannel|'ui',delay=0,travel=0,bright=false) {
    const c=this.context;if(!c||!this.enabled||c.state!=='running'||this.activeVoices>=(bus==='ui'?24:20))return;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain(),pan=c.createStereoPanner(),t=c.currentTime+delay;
    source.buffer=bright?this.white!:this.pink!;source.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.6;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+(duration>2?duration*.42:Math.min(.09,duration*.25)));gain.gain.setTargetAtTime(.0001,t+duration*.55,duration*.14);
    pan.pan.setValueAtTime(-travel,t);pan.pan.linearRampToValueAtTime(travel,t+duration);
    source.connect(filter).connect(gain).connect(pan).connect(this.buses[bus]);source.start(t,Math.random()*5);source.stop(t+duration);this.activeVoices++;
    const cleanup=()=>{if(!this.transients.delete(source))return;source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();this.activeVoices--;};
    this.transients.set(source,cleanup);source.onended=cleanup;
  }
  async ui(cue: Cue='tap', value=0) {
    await this.unlock();const c=this.context;
    if(!this.enabled||!c||c.state!=='running'||document.hidden)return;
    // Rate-limit repeated cues, without swallowing a different, deliberate action.
    if(cue===this.lastUiCue&&c.currentTime-this.lastUi<(cue==='step'?.085:.045))return;
    this.lastUi=c.currentTime;this.lastUiCue=cue;this.uiCount++;
    const amount=Math.max(0,Math.min(1,value));
    if(cue==='step'){this.tone(390+amount*240,.045,.018,'ui');return;}
    this.noise(cue==='paper'?1750:1050,cue==='paper'?.19:.028,cue==='paper'?.045:.038,'ui',0,0,true);
    if(cue==='confirm'){this.tone(740,.14,.030,'ui');this.tone(1110,.20,.014,'ui',.065);}
    else if(cue==='door'){this.tone(880,.42,.032,'ui');this.tone(1320,.28,.012,'ui',.075);this.tone(660,.38,.017,'ui',.14);}
    else if(cue==='select')this.tone(680,.09,.030,'ui',0,620);
    else if(cue==='toggle')this.tone(amount?560:620,.12,.025,'ui',0,amount?780:420);
    else if(cue!=='paper')this.tone(cue==='back'?330:480,.075,.025,'ui');
  }
  setLevel(channel: SoundChannel, value: number) {this.levels[channel]=value;if(this.context)this.buses[channel].gain.setTargetAtTime(value,this.context.currentTime,.2);}
  setRain(value:number){this.rainValue=value;if(this.rain&&this.context){this.rain.gain.setTargetAtTime(value*.10,this.context.currentTime,1.4);this.windowRain?.gain.setTargetAtTime(value*.026,this.context.currentTime,1.4);}}
  setScene(scene:'home'|'counter'|'seat'){
    if(this.scene==='seat'&&scene!=='seat')this.cancelTransients();this.scene=scene;
    if(!this.context)return;
    for(const channel of ['cafe','street','desk'] as const)this.spaces[channel].gain.setTargetAtTime(scene==='seat'?1:channel==='desk'?.35:channel==='street'?(scene==='home'?.6:.25):.8,this.context.currentTime,.5);
  }
  private cancelTransients(){for(const [source,cleanup] of this.transients){source.stop();cleanup();}this.lastUi=-Infinity;}
  async setEnabled(enabled:boolean){this.enabled=enabled;if(enabled)await this.unlock();else {this.cancelTransients();await this.context?.suspend();}}
  async visibility(){if(document.hidden){this.cancelTransients();await this.context?.suspend();}else if(this.enabled)await this.context?.resume();}
  event(name: EventName|'cup'|'page'|'write'|'brew',variant=0,duration=24) {
    if(name==='bird'){this.tone(2100,.13,.010,'street',0,2900,-.3);this.tone(2450,.16,.008,'street',.20,1900,-.3);}
    if(name==='bike'){this.noise(this.rainValue>.4?1900:700,Math.min(16,duration*.55),this.rainValue>.4?.050:.018,'street',0,-.6,this.rainValue>.4);this.tone(1550,.55,.011,'street',duration*.20,1540,.15);this.tone(2325,.31,.004,'street',duration*.20+.015,2310,.15);}
    if(name==='cup'){this.noise(420,.09,.1,'desk');this.tone(1250,.20,.018,'desk');this.tone(1940,.11,.006,'desk',.008);}
    if(name==='page'){this.noise(1600,.45,.045,'desk',0,0,true);this.noise(2400,.28,.021,'desk',.22,0,true);}
    if(name==='write')for(let i=0;i<4;i++)this.noise(1600+i*95,.10+(i%2)*.06,.018,'desk',i*.24,0,true);
    if(name==='brew'){this.noise(900,1.2,.075,'cafe');this.noise(2300,1.9,.052,'cafe',.6,0,true);}
    if(name==='car'){this.noise(320,duration*.6,.11,'street',0,.65);if(this.rainValue>.4)this.noise(1800,duration*.55,.045,'street',.4,.65,true);}
    if(name==='train'){
      this.noise(460,18,.12,'street',0,-.65);this.tone(110,12,.010,'street',2,93);
      for(let i=0;i<6;i++)this.noise(650,.20,.017,'street',4+i*1.1,-.2);
    }
    if(name==='borrow'){this.noise(1700,.35,.018,'street',5,0,true);this.noise(2200,.75,.028,'street',9.5,0,true);}
    if(name==='hand'){
      if(variant===1){this.noise(450,.12,.03,'desk',2.2);this.tone(1250,.20,.015,'desk',8.5);this.noise(420,.09,.08,'desk',8.5);}
      else if(variant===2)this.noise(2300,.8,.06,'desk',3.5,0,true);
      else if(variant===3)for(let i=0;i<3;i++)this.noise(400,.04,.025,'desk',3+i*.6);
      else if(variant===0||variant===5)this.event('write');
    }
  }
  async hostVisibility(hidden:boolean){if(hidden){this.cancelTransients();await this.context?.suspend();}else if(this.enabled)await this.context?.resume();}
  dispose(){this.enabled=false;this.cancelTransients();void this.context?.close();}
  diagnostics(){return {enabled:this.enabled,state:this.context?.state??'uninitialized',activeVoices:this.activeVoices,uiCount:this.uiCount,lastUiCue:this.lastUiCue};}
}
