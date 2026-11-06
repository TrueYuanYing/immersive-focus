import {gsap} from 'gsap';
import {SessionStore,clockLabel,type Ticket} from './session';
import {FishingController,species} from './fishing';
import {SeaWorld} from './world';
import {Soundscape} from './audio';
import {icon} from './icons';
import {TicketDrag} from './ticket-drag';
import {soundLabels,soundPresets,type SoundChannel} from './sound-mix';
import type {Settings} from './settings';
import type {EventType} from './ambient';
import './style.css';
import './voyage-ui.css';
import './cafe-layout.css';

type Screen='home'|'ticket'|'boarding'|'focus'|'fishing'|'arrival';
export type SessionPort=Pick<SessionStore,'active'|'tickets'|'fish'|'settings'|'storageError'|'create'|'elapsed'|'remaining'|'seat'|'pause'|'resume'|'finish'|'configure'|'opportunity'|'enterFishing'|'consumeCast'|'returnToSeat'|'restElapsed'|'confirmCatch'|'today'|'export'|'save'>;
export type AppOptions={session?:SessionPort;storage?:Pick<Storage,'getItem'|'setItem'>;now?:()=>number;seed?:number};
const formatDate=(timestamp:number)=>new Date(timestamp).toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'});
const minuteLabel=(ms:number)=>ms<60000?`${Math.floor(ms/1000)} 秒`:`${Math.floor(ms/60000)} 分 ${Math.floor(ms/1000)%60} 秒`;
const escape=(text:unknown)=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

export class HaijianApp {
  readonly session:SessionPort; readonly audio=new Soundscape();readonly fishing:FishingController;
  world:SeaWorld|null=null;
  private screen:Screen='home';private selectedMinutes=25;private loaded=false;private busy=false;private destroyed=false;
  private generation=0;private uiTimer=0;private hudUntil=0;private pendingSeat:(()=>void)|null=null;private lastTicket:Ticket|null=null;private reminded=false;
  private abort=new AbortController();private gamepadDown=false;private lastFishPhase='';
  private ticketDrag:TicketDrag|null=null;
  private reelInputs={pointer:false,keyboard:false,gamepad:false};
  private rodKeys=new Set<string>();private rodInputs={pointer:0,gamepad:0};private liftInputs={pointer:false,gamepad:false};private pointerAction=false;
  private pointerPressed=false;private inputFocused=true;private gamepadNeedsNeutral=false;private gamepadConnected=false;
  constructor(private root:HTMLElement,private options:AppOptions={}) {
    this.session=options.session??new SessionStore(options.storage??localStorage,options.now);
    if(!options.session&&!options.storage&&matchMedia('(prefers-reduced-motion: reduce)').matches)this.session.configure({reducedMotion:true});
    this.fishing=new FishingController(()=>this.session.consumeCast(),fish=>{this.session.confirmCatch(fish);this.renderFishCatch();},kind=>this.audio.play(kind));
    this.fishing.caughtCount=this.session.fish.length;
    this.root.innerHTML=this.shell();this.bind();this.renderSettings();this.renderHome();
    this.uiTimer=window.setInterval(()=>this.tickUI(),200);
  }
  private q<T extends HTMLElement=HTMLElement>(selector:string){return this.root.querySelector<T>(selector)!;}
  private shell(){return `
    <canvas id="sea" aria-label="汐间的实时三维海景"></canvas>
    <div class="home-shade"></div>
    <header class="masthead"><a class="brand" href="#" aria-label="汐间首页">${icon('ship')}<span>汐间<small>SHIO</small></span></a>
      <nav aria-label="航程操作"><button class="round" data-action="mute" aria-label="切换声音">${icon('sound')}</button><button class="quiet" data-action="book">${icon('book')}<span>航程札记</span></button><button class="round" data-action="settings" aria-label="环境设置">${icon('settings')}</button></nav></header>
    <main id="home" class="home">
      <div class="home-copy"><p class="eyebrow">青屿号 · 岛际邮船</p><h1>把时间<br>交给大海。</h1><p class="intro">在舷窗边坐下。<br>做自己的事，船会带你抵达。</p>
      <button class="primary departure" data-action="choose"><span id="start-label">领取这一程船票</span>${icon('arrow')}</button><p class="home-note">一张船票，一段安静航程</p></div>
      <div class="harbor-caption"><span class="little-rule"></span><span>青屿港<small>海风轻，今日通航。</small></span></div>
      <footer><span id="today">今天，已安静坐了 0 分钟</span><span class="coordinate">青屿港 <i>—</i> 灯屿湾</span></footer>
    </main>
    <section id="ticket-screen" class="ticket-screen" hidden aria-label="本程船票">
      <p class="eyebrow">这段时间，留给自己</p>
      <div class="ticket-dock"><div class="ticket-machine" id="ticket-machine" aria-hidden="true"><span class="machine-brand">青屿港 <small>QINGYU POST</small></span><span class="machine-lamp"></span><span class="machine-slot"></span><span class="machine-caption">乘船检票<small>请向左送入船票</small></span><i class="machine-bolt bolt-one"></i><i class="machine-bolt bolt-two"></i></div><article class="boarding-ticket" id="boarding-ticket" role="slider" tabindex="0" aria-label="向左滑动船票检票" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-orientation="horizontal" aria-describedby="ticket-instruction"><div class="ticket-main"><div class="ticket-heading"><span>${icon('ship')}青屿号</span><small>群岛邮船 · 乘船凭证</small></div>
      <div class="ticket-route"><span>青屿港<small>QINGYU</small></span><i>⟶</i><span>灯屿湾<small>DENGYU BAY</small></span></div>
      <p class="ticket-quote">海风替你翻过一页，时间带你慢慢向前。</p>
      <div class="ticket-data"><span>航程<b id="ticket-duration">25 分钟</b></span><span>座位<b>右舷 · 06</b></span><span>日期<b id="ticket-date"></b></span></div>
      <div class="stamp" id="ticket-stamp">青屿港<br><strong>准予登船</strong><small>ISLAND MAIL</small></div></div>
      <div class="ticket-stub"><small>一程海风</small><span class="stub-wave">≈</span><b id="ticket-number"></b><span>向左送入检票机</span></div></article></div>
      <p class="ticket-instruction" id="ticket-instruction"><span>←</span> 拖住船票，向左送入检票机</p><p class="soft-note">送到位后自动盖章 · 也可聚焦船票后按 ← 键 · 入座才开始计时</p>
    </section>
    <section id="focus-screen" class="focus-screen" hidden aria-label="专注座位"><button class="reveal" data-action="reveal" aria-label="显示专注操作">· · ·</button>
      <div class="focus-hint" id="focus-hint">坐稳了，慢慢来。<small>轻触画面，查看时间与操作</small></div>
      <div class="hud" id="hud" aria-label="专注控制">
        <div class="focus-top"><div class="seat-label"><i class="seat-dot"></i>右舷 · 06<span id="seat-weather">晴天 · 白天</span></div><button data-action="settings" class="round focus-settings" aria-label="环境设置">${icon('settings')}</button></div>
        <div class="focus-bottom"><div class="focus-controls"><div class="time-block"><span id="status-label">航行中</span><strong id="remaining">25:00</strong></div><span class="hud-divider"></span>
          <button data-action="pause" class="round" aria-label="暂停专注" id="pause-button">${icon('pause')}</button><button data-action="mute" class="round" aria-label="静音" id="mute-button">${icon('sound')}</button><button data-action="finish-ask" class="round" aria-label="结束本程">${icon('flag')}</button></div>
          <button data-action="fishing" class="fishing-entry" id="fishing-entry">${icon('fish')}<span>去钓鱼<small id="fishing-wait">现在可以出门</small></span></button></div>
        <span class="focus-route" id="route-label">青屿港 → 灯屿湾 · 把这一程留给自己</span>
      </div>
    </section>
    <section id="fishing-screen" class="fishing-screen" hidden aria-label="甲板钓鱼"><header class="deck-top"><span>背风的甲板<small>专注计时已暂停</small></span><button class="quiet light" data-action="return">${icon('back')}回来自习</button></header>
      <div class="catch-display" id="catch-display" hidden><small>这一程，遇见了</small><h2 id="catch-name"></h2><p id="catch-size"></p><span>已记入鱼册 · 随后放流</span></div>
      <div class="break-reminder" id="break-reminder" hidden><span>回船舱坐坐？</span><button data-action="return">回来自习</button><button class="round" data-action="dismiss-reminder" aria-label="继续休息">${icon('close')}</button></div>
      <div class="rod-controls" aria-label="控竿"><span>控竿</span><div><button data-rod="-1" aria-label="向左控竿">←<small>A</small></button><button data-rod="lift" aria-label="抬高鱼竿">↑<small>W</small></button><button data-rod="1" aria-label="向右控竿">→<small>D</small></button></div><small>挣扎时，向相反方向稳住鱼竿</small></div>
      <div class="fishing-panel"><p id="fish-status" role="status">选个方向，按住蓄力抛竿。</p>
      <div id="cast-power-wrap" class="cast-power-wrap" hidden><label for="cast-power">抛投力度</label><meter id="cast-power" min="0" max="1" value="0"></meter><output id="cast-distance">5 m</output></div>
      <div id="tension-wrap" class="tension-wrap" hidden><span>张力<small id="tension-text">舒缓</small></span><meter id="tension" min="0" max="1" low=".15" high=".8" optimum=".4" value="0" aria-label="鱼线张力"></meter><span id="reel-progress">距船 7 m</span></div>
      <div class="fishing-controls"><div class="distance" id="distance-control" aria-label="抛竿距离"><span>按住越久，抛得越远</span></div>
      <button id="fish-action" class="primary" data-action="fish-action">${icon('fish')}按住抛竿</button><label class="assist"><input id="fish-assist" type="checkbox">轻松辅助</label></div><p class="fish-help" id="fish-help">Space 抛竿 / 收线 · A D 控竿 · W 抬竿</p></div>
    </section>
    <section class="arrival" id="arrival-screen" hidden aria-label="航程完成"><p class="eyebrow">青屿号已轻轻靠岸</p><h1>这一程，辛苦了。</h1><p id="arrival-description"></p><article class="saved-ticket"><div>${icon('ship')}<span>青屿港 <i>→</i> 灯屿湾</span><small id="arrival-date"></small></div><strong id="arrival-time"></strong><span class="postmark">此程留存</span></article><p class="soft-note">票根已经放进航程札记。</p><div class="arrival-actions"><button class="primary" data-action="home">回到码头 ${icon('arrow')}</button><button class="quiet" data-action="linger">再坐一会儿</button></div></section>
    <div class="transition-veil" id="transition" aria-live="polite" hidden><span>${icon('ship')}</span><p id="transition-label">正在准备这一程海风</p></div>
    <div class="orientation" id="orientation" hidden><span>${icon('rotate')}</span><h2>横过来，海会更宽。</h2><p>转动设备后，就能在舷窗边坐下。</p><small>准备入座时不计入专注</small></div>
    <div class="loading" id="loading" role="status"><span class="loading-mark">${icon('ship')}</span><p>邮船正在靠近码头</p><small>准备舷窗、木桌和一整片海</small></div>
    <div class="notice" id="storage-notice" hidden role="alert">记录暂时未能保存到本机。<button data-action="export">导出备份</button></div>
    <dialog id="choose-dialog" aria-labelledby="choose-title"><button class="dialog-close round" data-action="close" aria-label="关闭">${icon('close')}</button><p class="eyebrow">领取船票</p><h2 id="choose-title">你想在海上坐多久？</h2><p class="dialog-intro">选一段时间，我们会在那时抵达。</p><div class="duration-options">${[15,25,45,60].map(n=>`<button data-minutes="${n}" aria-pressed="${n===25}"><b>${n}</b><small>分钟</small></button>`).join('')}</div>
    <label class="custom-duration">自定义 <input id="custom-minutes" inputmode="numeric" type="number" min="5" max="180" step="1" value="25" aria-label="自定义专注分钟数"> 分钟 <span>5–180 分钟</span></label><p id="duration-error" class="error" role="alert" hidden></p>
    <label class="first-fish"><input id="first-fish" type="checkbox"><span>先去钓一会儿<small>登船后先到甲板，回来再开始专注。</small></span>${icon('fish')}</label><button class="primary wide" data-action="take-ticket">领取船票 ${icon('arrow')}</button><p class="soft-note">这是一次出发的仪式，无需支付。</p></dialog>
    <dialog id="settings-dialog" aria-labelledby="settings-title"><button class="dialog-close round" data-action="close" aria-label="关闭">${icon('close')}</button><p class="eyebrow">让这里更像你的座位</p><h2 id="settings-title">海风与日常</h2><div class="settings-body">
      <fieldset><legend>窗外天气</legend><div class="segment">${[['sun','sun','晴天'],['rain','rain','雨天']].map(([v,i,l])=>`<button data-setting="weather" data-value="${v}">${icon(i)}${l}</button>`).join('')}</div></fieldset>
      <fieldset><legend>海上的光</legend><div class="segment wrap">${[['local','当地时间'],['dawn','清晨'],['day','白天'],['dusk','黄昏'],['night','夜晚']].map(([v,l])=>`<button data-setting="time" data-value="${v}">${l}</button>`).join('')}</div></fieldset>
      <fieldset class="sound-field"><legend>为这一段专注，调一份音景</legend><div class="sound-presets">${Object.entries(soundPresets).map(([key,p])=>`<button data-preset="${key}">${p.label}</button>`).join('')}</div>
      <label class="setting-line"><span>静音</span><input type="checkbox" data-check="muted"></label><label class="slider-line master-volume"><span>总音量</span><input type="range" min="0" max="100" step="1" id="volume" aria-label="音景音量"><output id="volume-value"></output></label>
      <div class="sound-channels">${Object.entries(soundLabels).map(([key,label])=>`<label class="slider-line"><span>${label}</span><input data-sound="${key}" type="range" min="0" max="100" step="1" aria-label="${label}音量"><output data-sound-value="${key}"></output></label>`).join('')}</div><p class="setting-note">每一种声音都可单独调节。音景与窗外天气分别设置。</p></fieldset>
      <fieldset><legend>钓鱼休息</legend><label class="setting-line"><span>显示「去钓鱼」入口</span><input type="checkbox" data-check="fishingEnabled"></label><label class="setting-line"><span>轻松辅助<small>自动提竿与控竿，挣扎时自动放松。</small></span><input type="checkbox" data-check="assisted"></label><label class="slider-line interval"><span>再次开放所需专注</span><input type="range" min="5" max="60" step="1" id="interval" aria-label="钓鱼开放间隔"><output id="interval-value">25 分钟</output></label><div class="interval-shortcuts">${[5,15,25,45,60].map(n=>`<button data-interval="${n}">${n}</button>`).join('')}</div><p class="setting-note">每程第一次立即可用。之后只累计专注，暂停和钓鱼不算；每次休息可以反复抛竿。</p></fieldset>
      <fieldset><legend>环境活跃度</legend><div class="segment">${[['quiet','安静'],['everyday','日常'],['lively','稍丰富']].map(([v,l])=>`<button data-setting="activity" data-value="${v}">${l}</button>`).join('')}</div></fieldset>
      <fieldset><legend>画面</legend><div class="segment">${[['auto','自动'],['low','省电'],['medium','均衡'],['high','高清']].map(([v,l])=>`<button data-setting="quality" data-value="${v}">${l}</button>`).join('')}</div><label class="setting-line"><span>轻微镜头呼吸</span><input type="checkbox" data-check="cameraMotion"></label><label class="setting-line"><span>减少动态<small>固定镜头，减少装饰性动作与生物事件。</small></span><input type="checkbox" data-check="reducedMotion"></label></fieldset>
      <p class="setting-note">设置与记录保存在当前浏览器。音景不含背景音乐。</p></div></dialog>
    <dialog id="book-dialog" class="book-dialog" aria-labelledby="book-title"><button class="dialog-close round" data-action="close" aria-label="关闭">${icon('close')}</button><p class="eyebrow">留下这一程海风</p><h2 id="book-title">航程札记</h2><div class="book-tabs"><button data-book="tickets" aria-pressed="true">船票收藏册</button><button data-book="fish" aria-pressed="false">海湾鱼册 <span id="fish-count">0 / 8</span></button></div><div id="book-content"></div><button class="quiet export" data-action="export">${icon('download')}导出本地记录</button></dialog>
    <dialog id="end-dialog" aria-labelledby="end-title"><p class="eyebrow">这一程随时可以靠岸</p><h2 id="end-title">在这里结束吗？</h2><p class="dialog-intro">已经专注的时间会保留在票根里。</p><div class="dialog-actions"><button class="quiet" data-action="close">再坐一会儿</button><button class="primary" data-action="finish">结束并保存</button></div></dialog>
  `;}
  async start() {
    try {
      this.world=new SeaWorld(this.q<HTMLCanvasElement>('#sea'),this.session.settings,this.audio,this.options.seed);
    this.world.onFrame=dt=>{this.pollGamepad();if(this.screen==='fishing'&&!this.busy&&!this.root.querySelector('dialog[open]'))this.fishing.tick(dt);};
      this.world.onHarborClick=()=>{if(this.screen==='home'&&!this.root.querySelector('dialog[open]'))this.choose();};
      this.world.onContextLost=()=>this.showFailure('海景暂时停下了，已保留这程记录。刷新后继续。');
      await this.world.load();if(this.destroyed){this.world.dispose();return;}
      this.loaded=true;this.q('#loading').hidden=true;
      if(this.session.active) {
        if(this.session.active.status==='boarding')this.showTicket();
        else if(this.session.active.status==='fishing'){this.fishing.ready();this.world.setFishing(this.fishing);await this.world.changeView('deck',true);this.show('fishing');}
        else {await this.world.changeView('cabin',true);this.show('focus');this.reveal();this.orientation();}
      }
      this.syncSettings();
    }catch(error){if(!this.destroyed)this.showFailure(`海景未能准备好。${error instanceof Error?error.message:'请刷新后重试。'}`);}
  }
  private bind(){
    const signal=this.abort.signal;
    this.ticketDrag=new TicketDrag(this.q('#boarding-ticket'),this.q('#ticket-machine'),()=>{void this.audio.unlock();void this.board();},signal);
    this.root.addEventListener('click',e=>{
      const button=(e.target as Element).closest<HTMLButtonElement>('[data-action],[data-minutes],[data-setting],[data-interval],[data-distance],[data-book],[data-preset]');if(!button||button.disabled)return;
      void this.audio.unlock();this.reveal();
      const d=button.dataset;
      if(d.action==='fish-action'&&this.pointerAction){this.pointerAction=false;if(e.detail>0)return;}
      if(d.preset){const preset=soundPresets[d.preset as keyof typeof soundPresets];if(preset){this.session.configure({soundMix:{...preset.mix}});this.syncSettings();}return;}
      if(d.minutes){this.selectedMinutes=Number(d.minutes);this.q<HTMLInputElement>('#custom-minutes').value=d.minutes;this.updateDurations();this.audio.play('select');return;}
      if(d.setting){this.session.configure({[d.setting]:d.value});this.syncSettings();this.audio.play('select');return;}
      if(d.interval){this.session.configure({intervalMinutes:Number(d.interval)});this.syncSettings();this.audio.play('select');return;}
      if(d.distance){this.fishing.distance=d.distance as 'near'|'middle';this.root.querySelectorAll<HTMLElement>('[data-distance]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));this.audio.play('select');return;}
      if(d.book){this.renderBook(d.book);return;}
      if(d.action!=='fish-action')this.audio.play(['board','take-ticket'].includes(d.action!)?'confirm':d.action==='close'?'back':'click');
      void this.action(d.action!);
    },{signal});
    this.root.addEventListener('change',e=>{
      const target=e.target as HTMLInputElement;
      if(target.dataset.check){this.session.configure({[target.dataset.check]:target.checked});this.syncSettings();this.audio.play('switch');}
      if(target.id==='fish-assist'){this.session.configure({assisted:target.checked});this.syncSettings();}
    },{signal});
    this.q('#custom-minutes').addEventListener('input',()=>{this.selectedMinutes=Number(this.q<HTMLInputElement>('#custom-minutes').value);this.updateDurations();},{signal});
    for(const id of ['volume','interval'])this.q(`#${id}`).addEventListener('input',()=>{
      const value=Number(this.q<HTMLInputElement>(`#${id}`).value);this.session.configure(id==='volume'?{volume:value/100}:{intervalMinutes:value});this.syncSettings();this.audio.play('slider');
    },{signal});
    this.root.querySelectorAll<HTMLInputElement>('[data-sound]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.sound as SoundChannel;this.session.configure({soundMix:{...this.session.settings.soundMix,[key]:Number(input.value)/100}});this.syncSettings();},{signal}));
    const action=this.q('#fish-action');
    action.addEventListener('pointerdown',e=>{
      if(this.busy||action instanceof HTMLButtonElement&&action.disabled)return;
      this.pointerAction=true;this.pointerPressed=true;action.setPointerCapture(e.pointerId);void this.audio.unlock();
      if(this.fishing.phase==='Ready')this.fishing.beginCast();
      else if(this.fishing.phase==='Reeling'&&!this.fishing.assisted)this.reelInput('pointer',true);
      else this.fishing.action();this.updateFishingUI();
    },{signal});
    action.addEventListener('pointerup',()=>{this.pointerPressed=false;this.fishing.releaseCast();this.reelInput('pointer',false);this.updateFishingUI();},{signal});
    const cancel=()=>{if(!this.pointerPressed)return;this.pointerPressed=false;this.fishing.cancelCast();this.reelInput('pointer',false);this.fishing.held=false;};
    action.addEventListener('pointercancel',cancel,{signal});action.addEventListener('lostpointercapture',cancel,{signal});
    this.root.querySelectorAll<HTMLButtonElement>('[data-rod]').forEach(button=>{
      button.addEventListener('pointerdown',e=>{button.setPointerCapture(e.pointerId);if(button.dataset.rod==='lift')this.liftInputs.pointer=true;else this.rodInputs.pointer=Number(button.dataset.rod);this.syncRod();e.preventDefault();},{signal});
      const release=()=>{if(button.dataset.rod==='lift')this.liftInputs.pointer=false;else this.rodInputs.pointer=0;this.syncRod();};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,release,{signal});
    });
    this.q('#sea').addEventListener('pointerdown',()=>{if(this.screen==='focus')this.reveal();},{signal});
    window.addEventListener('keydown',e=>this.key(e,true),{signal});window.addEventListener('keyup',e=>this.key(e,false),{signal});
    window.addEventListener('resize',()=>this.orientation(),{signal});
    document.addEventListener('visibilitychange',()=>{
      this.session.save();this.world?.visibility(document.hidden);void this.audio.visibility(document.hidden);
      if(document.hidden){this.clearReelInputs();if(this.screen==='fishing')this.fishing.interrupt();}
      else this.tickUI();
    },{signal});
    window.addEventListener('blur',()=>{this.inputFocused=false;this.clearReelInputs();},{signal});
    window.addEventListener('focus',()=>{this.inputFocused=true;},{signal});
    window.addEventListener('pagehide',()=>this.session.save(),{signal});
    this.q('.brand').addEventListener('click',e=>{e.preventDefault();if(this.session.active){this.reveal();return;}void this.action('home');},{signal});
    this.root.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>d.addEventListener('close',()=>{this.fishing.held=false;this.reveal();},{signal}));
  }
  private async action(name:string){
    switch(name){
      case 'choose':this.choose();break;
      case 'take-ticket':this.takeTicket();break;
      case 'close':this.root.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());break;
      case 'settings':this.renderSettings();this.openDialog('settings-dialog');break;
      case 'book':this.renderBook('tickets');this.openDialog('book-dialog');break;
      case 'reveal':this.reveal();break;
      case 'pause':if(this.session.active?.status==='paused')this.session.resume();else this.session.pause();this.tickUI();break;
      case 'finish-ask':if(this.session.active)this.openDialog('end-dialog');else await this.action('home');break;
      case 'finish':this.q<HTMLDialogElement>('#end-dialog').close();await this.finish();break;
      case 'mute':this.session.configure({muted:!this.session.settings.muted});this.syncSettings();break;
      case 'fishing':await this.goFishing();break;
      case 'fish-action':if(!this.busy)this.fishing.action();this.updateFishingUI();break;
      case 'return':await this.returnToSeat();break;
      case 'dismiss-reminder':this.q('#break-reminder').hidden=true;break;
      case 'home':if(this.session.active){this.reveal();break;}this.generation++;this.fishing.leave();this.world?.setFishing(null);await this.world?.changeView('harbor',true);this.show('home');this.renderHome();break;
      case 'linger':this.show('focus');this.reveal();break;
      case 'export':this.export();break;
    }
  }
  private openDialog(id:string){this.clearReelInputs();this.q<HTMLDialogElement>(`#${id}`).showModal();}
  private choose(){if(!this.loaded)return;if(this.session.active){if(this.session.active.status==='boarding')this.showTicket();else {this.show(this.session.active.status==='fishing'?'fishing':'focus');this.reveal();}return;}this.q('.first-fish').hidden=!this.session.settings.fishingEnabled;this.openDialog('choose-dialog');}
  private updateDurations(){this.root.querySelectorAll<HTMLElement>('[data-minutes]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.minutes)===this.selectedMinutes)));this.q('#duration-error').hidden=true;}
  private takeTicket(){
    if(!Number.isInteger(this.selectedMinutes)||this.selectedMinutes<5||this.selectedMinutes>180){this.q('#duration-error').hidden=false;this.q('#duration-error').textContent='请填写 5–180 之间的整数分钟。';return;}
    const firstFish=this.q<HTMLInputElement>('#first-fish').checked&&this.session.settings.fishingEnabled;
    this.session.create(this.selectedMinutes,firstFish);this.q<HTMLDialogElement>('#choose-dialog').close();this.showTicket();
  }
  private showTicket(){
    const a=this.session.active;if(!a)return;
    this.q('#ticket-duration').textContent=`${Math.round(a.durationMs/60000)} 分钟`;this.q('#ticket-date').textContent=formatDate(a.createdAt);
    this.q('#ticket-number').textContent=`QY ${a.id.slice(0,6).toUpperCase()}`;this.q('#ticket-stamp').classList.remove('stamped');
    this.ticketDrag?.reset();this.show('ticket');
  }
  private async board(){
    if(this.busy||this.session.active?.status!=='boarding')return;
    const token=this.generation;
    this.busy=true;this.q('#ticket-stamp').classList.add('stamped');this.audio.play('stamp');
    await this.delay(this.session.settings.reducedMotion?30:550);
    const active=this.session.active;if(!active||this.destroyed||token!==this.generation){this.busy=false;return;}
    this.show('boarding');this.busy=false;
    await this.ensureLandscape();
    if(!this.session.active||this.destroyed)return;
    if(!await this.transitionTo('cabin','沿着暖灯，走到你的舷窗旁'))return;
    if(!this.session.active||this.destroyed)return;
    if(this.session.active.startWithFishing&&this.session.settings.fishingEnabled){await this.goFishing();}
    else {this.session.seat();this.show('focus');this.reveal();this.q('#focus-hint').classList.add('show');setTimeout(()=>this.q('#focus-hint')?.classList.remove('show'),5500);}
  }
  private isPortrait(){return matchMedia('(pointer: coarse)').matches&&innerHeight>innerWidth;}
  private orientation(){
    const needed=this.isPortrait()&&(['focus','fishing','boarding'].includes(this.screen));this.q('#orientation').hidden=!needed;
    if(!needed&&this.pendingSeat){const resolve=this.pendingSeat;this.pendingSeat=null;resolve();}
  }
  private async ensureLandscape(){
    if(!this.isPortrait())return;
    const token=this.generation;
    try{await (screen.orientation as ScreenOrientation&{lock?:(s:string)=>Promise<void>}).lock?.('landscape');}catch{/* 浏览器拒绝方向锁时，原生横屏提示继续接管。 */}
    if(this.destroyed||token!==this.generation)return;
    if(this.isPortrait()){this.q('#orientation').hidden=false;await new Promise<void>(resolve=>{this.pendingSeat=resolve;});}
  }
  private async transitionTo(view:'cabin'|'deck',label:string){
    const token=++this.generation;this.busy=true;this.q('#transition-label').textContent=label;this.q('#transition').hidden=false;
    this.audio.play('door');await this.delay(this.session.settings.reducedMotion?0:250);
    if(token!==this.generation)return false;
    await this.world?.changeView(view);if(token!==this.generation)return false;
    this.q('#transition').hidden=true;this.busy=false;return true;
  }
  private async goFishing(){
    if(this.busy||!this.world)return;
    const rest=this.session.enterFishing();if(!rest)return;
    this.fishing.enter();this.reminded=false;this.q('#break-reminder').hidden=true;this.world.setFishing(this.fishing);
    this.show('fishing');this.updateFishingUI();
    if(await this.transitionTo('deck','收起笔，去甲板吹一会儿海风')){this.fishing.ready();this.updateFishingUI();}
  }
  private async returnToSeat(){
    if(this.session.active?.status!=='fishing')return;
    this.clearReelInputs();this.fishing.leave();
    if(await this.transitionTo('cabin','回到刚才那一页')){this.session.returnToSeat();this.world?.setFishing(null);this.show('focus');this.reveal();}
  }
  async finish(){
    const ticket=this.session.finish();if(!ticket)return;
    ++this.generation;this.fishing.leave();this.world?.setFishing(null);this.lastTicket=ticket;this.busy=false;this.q('#transition').hidden=true;this.q('#orientation').hidden=true;
    this.show('arrival');await this.world?.changeView('cabin',true);if(this.destroyed)return;this.world?.arrive();
    this.q('#arrival-description').textContent=ticket.complete?'你把一段完整的时间，安静地留给了自己。':'今天先到这里，认真坐过的时间都已留下。';
    this.q('#arrival-time').textContent=minuteLabel(ticket.focusMs);this.q('#arrival-date').textContent=formatDate(ticket.endedAt);this.audio.play('door');
  }
  private show(screen:Screen){
    this.screen=screen;this.root.dataset.screen=screen;
    for(const [id,value] of [['home','home'],['ticket-screen','ticket'],['focus-screen','focus'],['fishing-screen','fishing'],['arrival-screen','arrival']])this.q(`#${id}`).hidden=screen!==value;
    this.q('.masthead').hidden=['focus','fishing','boarding'].includes(screen);this.q('.home-shade').hidden=screen!=='home';this.orientation();this.syncSettings();
  }
  private reveal(){this.hudUntil=performance.now()+5200;this.q('#hud').classList.add('visible');this.q('#hud').inert=false;}
  private tickUI(){
    if(this.destroyed)return;
    const a=this.session.active;
    if(a&&a.status==='focusing'&&this.session.remaining()===0){void this.finish();return;}
    this.q('#storage-notice').hidden=!this.session.storageError;
    this.world?.setProgress(a?this.session.elapsed()/a.durationMs:0,a?.status==='focusing');
    const gate=this.session.opportunity();
    this.q('#remaining').textContent=a?clockLabel(this.session.remaining()):'已靠岸';
    this.q('#status-label').textContent=a?.status==='paused'?'已暂停':a?'航行中':'再坐一会儿';
    const pause=this.q<HTMLButtonElement>('#pause-button');pause.disabled=!a;
    const paused=a?.status==='paused';pause.innerHTML=icon(paused?'play':'pause');pause.setAttribute('aria-label',paused?'继续专注':'暂停专注');
    this.q('#fishing-entry').hidden=!a||!this.session.settings.fishingEnabled;
    this.q<HTMLButtonElement>('#fishing-entry').disabled=!gate.available;
    this.q('#fishing-wait').textContent=gate.available?'现在可以出门':`再专注 ${clockLabel(gate.remainingMs)}`;
    const hud=this.q('#hud');
    const interacting=hud.matches(':focus-within')||!!hud.querySelector('button:hover,.focus-controls:hover,.seat-label:hover')||!!this.root.querySelector('dialog[open]');
    if(performance.now()>this.hudUntil&&!interacting){hud.classList.remove('visible');hud.inert=true;}
    if(this.screen==='fishing'){this.updateFishingUI();if(!this.reminded&&this.session.restElapsed()>=180000){this.reminded=true;this.q('#break-reminder').hidden=false;}}
  }
  private updateFishingUI(){
    const f=this.fishing;this.q('#fish-status').textContent=f.label();
    this.q('#tension-wrap').hidden=f.phase!=='Reeling';this.q<HTMLMeterElement>('#tension').value=f.tension;
    this.q('#tension-text').textContent=f.tension>.8?'快断了':f.fighting?'正在挣扎':'可以收线';this.q('#reel-progress').textContent=`距船 ${f.lineDistance.toFixed(1)} m`;
    this.q('#cast-power-wrap').hidden=f.phase!=='Charging';this.q<HTMLMeterElement>('#cast-power').value=f.power;this.q('#cast-distance').textContent=`${(7+f.power*9).toFixed(1)} m`;
    this.q('.rod-controls').hidden=!['Ready','Charging','Reeling'].includes(f.phase);
    this.q('#distance-control').hidden=f.phase!=='Ready';this.q('#catch-display').hidden=f.phase!=='Caught';
    const action=this.q<HTMLButtonElement>('#fish-action');
    if(f.phase!==this.lastFishPhase){this.lastFishPhase=f.phase;this.renderFishCatch();}
    const text=f.phase==='Ready'?'按住抛竿':f.phase==='Charging'?'松开抛出':f.phase==='Biting'?'现在提竿':f.phase==='Reeling'?(f.assisted?(f.held?'停一下':'开始收线'):f.fighting?'松开 · 稳住鱼竿':'按住收线'):f.phase==='Caught'?'轻轻放流':f.phase==='Waiting'?'轻逗一下鱼饵':'慢慢来';
    if(action.dataset.label!==text){action.dataset.label=text;action.innerHTML=`${icon(f.phase==='Caught'?'arrow':'fish')}<span>${text}</span>`;}
    action.disabled=this.busy||!['Ready','Charging','Waiting','Biting','Reeling','Caught'].includes(f.phase)||(f.phase==='Caught'&&f.phaseTime<.9);
    action.classList.toggle('biting',f.phase==='Biting');this.q('#fishing-screen').dataset.phase=f.phase;
    this.q('#fish-help').textContent=f.assisted?'自动提竿与控竿 · 点击收线，挣扎时自动放松':'Space 抛竿 / 收线 · A D 控竿 · W 抬竿';
  }
  private renderFishCatch(){const c=this.fishing.current;if(c){this.q('#catch-name').textContent=species[c.species].name;this.q('#catch-size').textContent=`${c.length.toFixed(1)} cm · 青屿海湾`;}}
  private renderHome(){this.q('#today').textContent=`今天，已安静坐了 ${Math.floor(this.session.today()/60000)} 分钟`;this.q('#start-label').textContent=this.session.active?'回到这一程':'领取这一程船票';}
  private renderSettings(){
    const s=this.session.settings;
    this.q('#seat-weather').textContent=`${s.weather==='rain'?'雨天':'晴天'} · ${{local:'当地时间',dawn:'清晨',day:'白天',dusk:'黄昏',night:'夜晚'}[s.time]}`;
    this.root.querySelectorAll<HTMLInputElement>('[data-sound]').forEach(input=>{const key=input.dataset.sound as SoundChannel;input.value=String(Math.round(s.soundMix[key]*100));this.q(`[data-sound-value=${key}]`).textContent=`${Math.round(s.soundMix[key]*100)}%`;});
    this.root.querySelectorAll<HTMLElement>('[data-preset]').forEach(b=>{const p=soundPresets[b.dataset.preset as keyof typeof soundPresets];b.setAttribute('aria-pressed',String(Object.entries(p.mix).every(([k,v])=>s.soundMix[k as SoundChannel]===v)));});
    this.root.querySelectorAll<HTMLButtonElement>('[data-setting]').forEach(b=>b.setAttribute('aria-pressed',String(s[b.dataset.setting as keyof Settings]===b.dataset.value)));
    this.root.querySelectorAll<HTMLInputElement>('[data-check]').forEach(input=>input.checked=Boolean(s[input.dataset.check as keyof Settings]));
    this.q<HTMLInputElement>('#volume').value=String(s.volume*100);this.q('#volume-value').textContent=`${Math.round(s.volume*100)}%`;
    this.q<HTMLInputElement>('#interval').value=String(s.intervalMinutes);this.q('#interval-value').textContent=`${s.intervalMinutes} 分钟`;
    this.q<HTMLInputElement>('#fish-assist').checked=s.assisted;
    this.root.querySelectorAll<HTMLButtonElement>('[data-action="mute"]').forEach(b=>{b.innerHTML=icon(s.muted?'mute':'sound');b.setAttribute('aria-label',s.muted?'开启声音':'静音');b.setAttribute('aria-pressed',String(s.muted));});
  }
  private syncSettings(){
    const s=this.session.settings;this.renderSettings();this.fishing.assisted=s.assisted;this.fishing.weather=s.weather;this.fishing.night=s.time==='night';
    this.world?.configure(s);this.audio.configure(s,this.screen==='fishing'?'deck':this.screen==='home'||this.screen==='ticket'?'harbor':'cabin');
    this.root.classList.toggle('reduced-motion',s.reducedMotion);
  }
  private renderBook(tab:string){
    this.root.querySelectorAll<HTMLButtonElement>('[data-book]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.book===tab)));
    const known=new Set(this.session.fish.map(f=>f.species));this.q('#fish-count').textContent=`${known.size} / 8`;
    if(tab==='fish')this.q('#book-content').innerHTML=`<p class="book-intro">遇见就留下记忆，不必赶着集齐。</p><div class="fish-book">${species.map((s,i)=>{const fish=this.session.fish.filter(f=>f.species===i),first=fish.at(-1);return `<article class="fish-entry ${first?'known':''}">${icon('fish')}<h3>${first?s.name:'尚未遇见'}</h3>${first?`<p>最大 ${Math.max(...fish.map(f=>f.length)).toFixed(1)} cm</p><small>初见 ${formatDate(first.caughtAt)}<br>青屿海湾 · ${fish.length} 次相遇</small>`:'<p>让相遇慢慢发生。</p>'}</article>`;}).join('')}</div>`;
    else this.q('#book-content').innerHTML=this.session.tickets.length?`<div class="ticket-book">${this.session.tickets.map(t=>`<article class="journal-ticket"><div><span>青屿号 · 右舷 06</span><small>${formatDate(t.endedAt)}</small></div><h3>青屿港 <i>→</i> 灯屿湾</h3><p><b>${minuteLabel(t.focusMs)}</b><span>${t.complete?'完整抵达':'此程留存'}</span></p><footer><small>甲板休息 ${minuteLabel(t.restMs??0)}</small><small>QY ${escape(t.id.slice(0,6).toUpperCase())}</small></footer></article>`).join('')}</div>`:`<div class="empty-book">${icon('book')}<h3>第一页，还留着海风。</h3><p>完成一程专注后，船票会放在这里。</p><button class="quiet" data-action="close">去坐一会儿 ${icon('arrow')}</button></div>`;
  }
  private export(){if(window.IkoHost){window.IkoHost.postMessage(JSON.stringify({type:'export',scene:'haijian',data:this.session.export()}));return;}const blob=new Blob([this.session.export()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`汐间-航程札记-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  private key(e:KeyboardEvent,down:boolean){
    const rodKey=['KeyA','KeyD','KeyW','ArrowLeft','ArrowRight','ArrowUp'].includes(e.code);
    if(rodKey){
      if(!down){this.rodKeys.delete(e.code);this.syncRod();return;}
      if(this.screen!=='fishing'||this.busy||this.root.querySelector('dialog[open]')||e.target instanceof Element&&e.target.closest('input,textarea,select'))return;
      e.preventDefault();this.rodKeys.add(e.code);this.syncRod();return;
    }
    if(e.code!=='Space'&&e.code!=='Enter'&&e.code!=='Escape')return;
    if(e.code==='Space'&&!down){
      this.fishing.releaseCast();
      this.reelInput('keyboard',false);
      if(this.screen==='fishing'&&e.target instanceof Element&&e.target.closest('#fish-action'))e.preventDefault();
      return;
    }
    if(e.target instanceof Element&&e.target.closest('input,select,textarea,a,button:not(#fish-action)'))return;
    if(this.root.querySelector('dialog[open]')||this.busy)return;
    if(e.code==='Escape'){if(down)this.reveal();return;}
    if(this.screen==='fishing'&&e.code==='Space'){
      e.preventDefault();if(e.repeat)return;
      if(this.fishing.phase==='Ready'){this.pointerAction=false;this.fishing.beginCast();}
      else if(this.fishing.phase==='Reeling'&&!this.fishing.assisted)this.reelInput('keyboard',down);
      else if(down)this.fishing.action();
    }
    else if(this.screen==='focus'&&down)this.reveal();
  }
  private pollGamepad(){
    const pad=navigator.getGamepads?.()[0];if(this.screen!=='fishing'||this.busy||!this.inputFocused||document.hidden||this.root.querySelector('dialog[open]'))return;
    if(!pad){if(this.gamepadConnected){this.fishing.cancelCast();if(this.fishing.assisted)this.fishing.held=false;}this.gamepadConnected=false;this.reelInput('gamepad',false);this.rodInputs.gamepad=0;this.liftInputs.gamepad=false;this.syncRod();this.gamepadDown=false;return;}
    this.gamepadConnected=true;
    const down=!!pad.buttons[0]?.pressed;
    if(this.gamepadNeedsNeutral){if(pad.buttons.some(b=>b.pressed)||(pad.axes??[]).some(a=>Math.abs(a)>.18))return;this.gamepadNeedsNeutral=false;}
    this.rodInputs.gamepad=Math.abs(pad.axes?.[0]??0)>.18?pad.axes[0]:0;this.liftInputs.gamepad=(pad.axes?.[1]??0)<-.35;this.syncRod();
    if(this.fishing.phase==='Ready'&&down&&!this.gamepadDown)this.fishing.beginCast();
    else if(this.fishing.phase==='Charging'&&!down&&this.gamepadDown)this.fishing.releaseCast();
    else if(this.fishing.phase==='Reeling'&&!this.fishing.assisted)this.reelInput('gamepad',down);
    else if(down&&!this.gamepadDown)this.fishing.action();
    if(pad.buttons[1]?.pressed&&!this.busy)void this.returnToSeat();this.gamepadDown=down;
  }
  private reelInput(source:keyof typeof this.reelInputs,down:boolean){this.reelInputs[source]=down;if(!this.fishing.assisted)this.fishing.held=Object.values(this.reelInputs).some(Boolean);}
  private syncRod(){const left=this.rodKeys.has('KeyA')||this.rodKeys.has('ArrowLeft'),right=this.rodKeys.has('KeyD')||this.rodKeys.has('ArrowRight');this.fishing.steer=this.rodInputs.pointer||Number(right)-Number(left)||this.rodInputs.gamepad;this.fishing.lift=this.rodKeys.has('KeyW')||this.rodKeys.has('ArrowUp')||Object.values(this.liftInputs).some(Boolean);}
  private clearReelInputs(){this.reelInputs={pointer:false,keyboard:false,gamepad:false};this.rodKeys.clear();this.rodInputs={pointer:0,gamepad:0};this.liftInputs={pointer:false,gamepad:false};this.gamepadDown=false;this.gamepadNeedsNeutral=true;this.pointerPressed=false;this.fishing.held=false;this.fishing.cancelCast();this.syncRod();}
  private delay(ms:number){return new Promise<void>(resolve=>setTimeout(resolve,ms));}
  private showFailure(message:string){this.q('#loading').hidden=false;this.q('#loading').innerHTML=`${icon('ship')}<h2>这一程需要稍等一下</h2><p>${escape(message)}</p><button class="primary" onclick="location.reload()">重新准备</button>`;}
  diagnostics(){return {screen:this.screen,busy:this.busy,active:this.session.active,elapsed:this.session.elapsed(),opportunity:this.session.opportunity(),fishing:{phase:this.fishing.phase,tension:this.fishing.tension,progress:this.fishing.progress},world:this.world?.diagnostics(),audio:this.audio.diagnostics()};}
  /** Explicit host lifecycle, no DOM globals required when mounting another scene. */
  pause(){this.session.pause();this.tickUI();}resume(){this.session.resume();this.tickUI();}setWeather(weather:'sun'|'rain'){this.session.configure({weather});this.syncSettings();}
  suspendForHost(){
    if(this.destroyed)return;
    if(this.session.active?.status==='fishing'){
      this.clearReelInputs();this.fishing.leave();this.session.active.rest!.resumeAfter=false;
      this.session.returnToSeat();this.world?.setFishing(null);void this.world?.changeView('cabin',true);this.show('focus');this.reveal();
    }
    this.pause();
  }
  forceEvent(type:EventType){return this.world?.forceEvent(type);}
  dispose(){if(this.destroyed)return;this.destroyed=true;++this.generation;this.pendingSeat?.();this.pendingSeat=null;clearInterval(this.uiTimer);this.abort.abort();this.fishing.leave();this.session.save();this.world?.dispose();this.audio.dispose();gsap.killTweensOf(this.root);this.root.replaceChildren();}
}

export async function createHaijian(container:HTMLElement,options:AppOptions={}){const app=new HaijianApp(container,options);await app.start();return app;}
