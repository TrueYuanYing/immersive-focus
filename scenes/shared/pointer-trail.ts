type Mote={x:number;y:number;vx:number;vy:number;born:number;life:number;size:number};
/** Bounded Canvas2D trail; passive touch listeners never steal scrolling or fishing. */
export class CursorMotes {
  private canvas=document.createElement('canvas');
  private ctx:CanvasRenderingContext2D|null;
  private pool:Mote[]=Array.from({length:36},()=>({x:0,y:0,vx:0,vy:0,born:0,life:0,size:0}));
  private abort=new AbortController();private index=0;private frameId=0;private last=0;private enabled=true;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)');
  constructor(private color='#b9a377') {
    // Keep this canvas independent of the original mouse-only cursor CSS.
    this.canvas.className='iko-pointer-trail';this.canvas.setAttribute('aria-hidden','true');
    this.canvas.style.cssText='display:block;position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646';
    this.ctx=this.canvas.getContext('2d');document.body.append(this.canvas);this.resize();
    const options={passive:true,capture:true,signal:this.abort.signal};
    document.addEventListener('pointermove',e=>this.pointer(e,false),options);
    document.addEventListener('pointerdown',e=>this.pointer(e,true),options);
    // A scrolling touch can cancel pointermove in Android WebView. Observe the
    // touch passively as well; the shared throttle prevents duplicate emission.
    document.addEventListener('touchmove',e=>{const t=e.touches[0];if(t)this.pointer({clientX:t.clientX,clientY:t.clientY,target:e.target},false);},options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clear();},options);
    window.addEventListener('blur',()=>this.clear(),options);
    window.addEventListener('resize',()=>this.resize(),options);
  }
  setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled)this.clear();}
  private resize(){this.canvas.width=innerWidth;this.canvas.height=innerHeight;}
  private pointer(e:{clientX:number;clientY:number;target:EventTarget|null},burst:boolean){
    if(!this.enabled||this.reduced.matches||document.hidden||!this.ctx)return;
    if((e.target as Element)?.closest?.('input,textarea,[contenteditable="true"]'))return;
    const now=performance.now();if(!burst&&now-this.last<24)return;this.last=now;
    for(let i=0;i<(burst?6:2);i++){
      const p=this.pool[this.index++%this.pool.length],angle=Math.random()*Math.PI*2;
      Object.assign(p,{x:e.clientX,y:e.clientY,vx:Math.cos(angle)*30,vy:Math.sin(angle)*30-8,born:now,life:680,size:burst?4.2:3.5});
    }
    if(!this.frameId)this.frameId=requestAnimationFrame(this.frame);
  }
  private frame=(now:number)=>{
    this.frameId=0;const c=this.ctx;if(!c)return;c.clearRect(0,0,this.canvas.width,this.canvas.height);let alive=false;
    c.fillStyle=this.color;
    for(const p of this.pool){if(!p.life)continue;const age=now-p.born,fade=1-age/p.life;
      if(fade<=0){p.life=0;continue;}alive=true;c.globalAlpha=fade*.85;
      const x=p.x+p.vx*age/1000,y=p.y+p.vy*age/1000,r=p.size*(.4+fade*.6);
      c.fillStyle=this.color;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
      c.fillStyle='#fff8e2';c.fillRect(x-.7,y-r-1,1.4,r*2+2);c.fillRect(x-r-1,y-.7,r*2+2,1.4);
    }
    if(alive)this.frameId=requestAnimationFrame(this.frame);
  };
  private clear(){cancelAnimationFrame(this.frameId);this.frameId=0;this.pool.forEach(p=>p.life=0);this.ctx?.clearRect(0,0,this.canvas.width,this.canvas.height);}
  diagnostics(){return {active:this.pool.filter(p=>p.life>0).length,capacity:this.pool.length,animating:!!this.frameId};}
  dispose(){this.clear();this.abort.abort();this.canvas.remove();}
}
