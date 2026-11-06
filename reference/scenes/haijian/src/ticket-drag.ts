import {gsap} from 'gsap';
/** A short drag returns home; a completed insertion has exactly one commit. */
export class TicketDrag{
  private pointer:number|null=null;private start=0;private x=0;private busy=false;private disposed=false;private motion:gsap.core.Tween|null=null;
  constructor(private ticket:HTMLElement,private machine:HTMLElement,private commit:()=>void,signal:AbortSignal){
    ticket.addEventListener('pointerdown',e=>{if(this.busy||e.button!==0)return;this.motion?.kill();this.pointer=e.pointerId;this.start=e.clientX-this.x;ticket.setPointerCapture(e.pointerId);ticket.classList.add('dragging');},{signal});
    ticket.addEventListener('pointermove',e=>{if(this.pointer!==e.pointerId)return;this.move(Math.max(-this.travel,Math.min(14,e.clientX-this.start)));},{signal});
    ticket.addEventListener('pointerup',e=>{if(e.pointerId!==this.pointer)return;this.pointer=null;ticket.classList.remove('dragging');if(-this.x>=this.travel*.82)this.insert();else this.returnHome();},{signal});
    const cancel=()=>{if(this.pointer===null)return;this.pointer=null;ticket.classList.remove('dragging');this.returnHome();};
    ticket.addEventListener('pointercancel',cancel,{signal});ticket.addEventListener('lostpointercapture',cancel,{signal});
    ticket.addEventListener('keydown',e=>{if(e.code==='ArrowLeft'){e.preventDefault();this.insert();}},{signal});
    window.addEventListener('resize',cancel,{signal});
    signal.addEventListener('abort',()=>{this.disposed=true;this.motion?.kill();},{once:true});
  }
  private get travel(){return Math.min(205,Math.max(88,this.ticket.parentElement!.clientWidth*.245));}
  private move(x:number){this.x=x;gsap.set(this.ticket,{x,rotation:-.7+x/140});const p=Math.max(0,Math.min(1,-x/this.travel));this.ticket.setAttribute('aria-valuenow',String(Math.round(p*100)));this.machine.classList.toggle('ready',p>=.82);}
  private returnHome(){this.machine.classList.remove('ready');this.motion=gsap.to(this,{x:0,duration:.38,ease:'power3.out',onUpdate:()=>this.move(this.x)});}
  reset(){this.busy=false;this.pointer=null;this.motion?.kill();this.move(0);this.ticket.setAttribute('aria-disabled','false');this.machine.classList.remove('accepted');}
  private insert(){
    if(this.busy||this.disposed)return;this.busy=true;this.motion?.kill();const pointer=this.pointer;this.pointer=null;
    if(pointer!==null&&this.ticket.hasPointerCapture(pointer))this.ticket.releasePointerCapture(pointer);
    this.ticket.setAttribute('aria-disabled','true');this.ticket.classList.remove('dragging');
    this.motion=gsap.to(this,{x:-this.travel,duration:.28,ease:'power2.in',onUpdate:()=>this.move(this.x),onComplete:()=>{if(this.disposed)return;this.machine.classList.add('accepted');this.commit();}});
  }
}
