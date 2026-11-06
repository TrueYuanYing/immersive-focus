import './style.css';
import {connectIkoHost} from '../../shared/iko-host';
import { gsap } from 'gsap';
import { SessionStore, durationLabel, type Receipt } from './session';
import { World, type TimeMode, type Weather } from './world';
import { Soundscape, type SoundChannel } from './audio';
import { qualityNames, type QualityMode } from './quality';
import { needsLandscape, setStudyOrientation } from './orientation';
import { crowdNames, type CrowdMode } from './ambient';
import { CursorMotes } from './cursor';
import { drinkIcon, drinkNotes } from './drink-icons';

const app = document.querySelector<HTMLElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
const icons: Record<string, string> = {
  cup: '<path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v2m5-2v2M4 22h15"/>',
  book: '<path d="M4 4h7a4 4 0 0 1 1 1 4 4 0 0 1 1-1h7v15h-7a4 4 0 0 0-1 1 4 4 0 0 0-1-1H4V4Zm8 1v15"/>',
  sound: '<path d="m4 9 4 0 5-4v14l-5-4H4V9Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m4 9 4 0 5-4v14l-5-4H4V9Zm13 0 5 6m0-6-5 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  rain: '<path d="M5 14a4 4 0 0 1 0-8 6 6 0 0 1 11-1 4.5 4.5 0 0 1 2 9H5Zm2 3-1 3m6-3-1 3m6-3-1 3"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  up: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  end: '<path d="M5 5h14v14H5z"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
const icon = (name: string) => `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.cup}</svg>`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sound = new Soundscape();
const cursor = new CursorMotes();
const storage = (() => { try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } }; } })();
const store = new SessionStore(storage);
type Screen = 'home' | 'order' | 'counter' | 'brewing' | 'ready' | 'focus' | 'finished' | 'history';
type Settings = { time: TimeMode; weather: Weather; quality: QualityMode; crowd:CrowdMode; reduced: boolean; breathing: boolean; sound: boolean; levels: Record<SoundChannel, number> };
let preferences: Settings = { time: 'afternoon', weather: 'sun', quality: 'auto', crowd:'daily', reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, breathing:true, sound: true, levels: { cafe: .45, street: .35, desk: .35 } };
try {
  const p = JSON.parse(storage.getItem('mado.preferences.v1') ?? '{}');
  if (['real','dawn','morning','afternoon','sunset','night'].includes(p.time)) preferences.time = p.time;
  if (['sun','rain'].includes(p.weather)) preferences.weather = p.weather;
  if (['quiet','daily','lively'].includes(p.crowd)) preferences.crowd=p.crowd;
  if (['auto','low','balanced','high','ultra'].includes(p.quality)) preferences.quality = p.quality;
  else if (p.saving === true) preferences.quality = 'low';
  for (const key of ['reduced','breathing','sound'] as const) if (typeof p[key] === 'boolean') preferences[key] = p[key];
  for (const key of ['cafe','street','desk'] as const) if (Number.isFinite(p.levels?.[key])) preferences.levels[key] = Math.min(1, Math.max(0, p.levels[key]));
} catch { /* Invalid preferences fall back without changing session records. */ }
sound.enabled = preferences.sound; sound.levels = preferences.levels;
let world: World;
let screen: Screen = 'home';
let minutes = 45, drink = '拿铁';
let overlay: 'settings' | 'end' | null = null;
let lastReceipt: Receipt | null = null;
let hudVisible = true;
let hideTimer: ReturnType<typeof setTimeout>;
let transitionBusy = false;
let pendingSeat = false;
let volumeReturnFocus: HTMLElement | null = null;
const timers: ReturnType<typeof setTimeout>[] = [];
const dateFormat = (time: number) => new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replaceAll('/', '.');
const timeFormat = (time: number) => new Date(time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const timeNames: Record<TimeMode, string> = { real: '此时此刻', dawn: '清晨', morning: '上午', afternoon: '午后', sunset: '黄昏', night: '夜晚' };
const drinkPrices: Record<string, number> = { '美式': 22, '拿铁': 28, '冰咖啡': 24, '抹茶拿铁': 30, '热可可': 26 };
const menu = () => Object.keys(drinkPrices);
const logo = `<span class="logo-mark">${icon('cup')}</span><span class="logo-name">窗间<span>MADO</span></span>`;
const button = (id: string, text: string, cls = '', symbol = '') => `<button id="${id}" class="${cls}">${symbol ? icon(symbol) : ''}${text}</button>`;
const quietButton = (id: string, label: string, symbol: string) => `<button id="${id}" class="icon-button" aria-label="${label}" title="${label}">${icon(symbol)}</button>`;
function toolbar() {
  return `<header class="topbar"><a href="#" id="home-logo" class="brand" aria-label="窗间首页">${logo}</a><nav>${quietButton('sound-toggle', sound.enabled ? '关闭声音' : '开启声音', sound.enabled ? 'sound' : 'mute')}${button('history-open','小票收藏册','text-button','book')}${quietButton('settings-open','环境设置','settings')}</nav></header>`;
}
function receiptContent(receipt: Receipt | null, checkout = false) {
  const now = receipt?.startedAt ?? Date.now();
  const beverage = receipt?.drink ?? drink;
  return `<div class="receipt-head"><span class="receipt-flower">✳</span><strong>窗间咖啡</strong><small>A CUP OF QUIET</small></div>
    <div class="receipt-rule"></div><div class="receipt-line"><span>${dateFormat(now)}</span><span>${timeFormat(now)}</span></div>
    <div class="receipt-id">NO. ${(receipt?.id.slice(0,8) ?? new Date().getTime().toString(36).slice(-8)).toUpperCase()}</div>
    <div class="receipt-rule"></div><div class="receipt-line drink-line"><span>${escape(beverage)}</span><span>× 1</span></div>
    <div class="receipt-line"><span>${receipt ? '在窗边的时间' : '留给自己的时间'}</span><span>${receipt ? Math.floor(receipt.elapsedMs / 60000) + ' 分 ' + Math.floor(receipt.elapsedMs / 1000) % 60 + ' 秒' : minutes + ' 分钟'}</span></div>
    ${checkout ? `<div class="receipt-line price-line"><span>合计</span><span>¥ ${drinkPrices[beverage] ?? 28}.00</span></div>` : ''}
    <div class="receipt-rule"></div><p class="receipt-note">${receipt ? '今天，也在这里坐了一会儿。' : '窗边的位置，为你留着。'}</p>
    <div class="barcode" aria-hidden="true"></div><small class="receipt-footer">${checkout ? '店内小票 · 无需实际支付' : '谢谢你，把时间留给自己'}</small>`;
}
function homeContent() {
  const today = store.today();
  return `${toolbar()}<section class="home-copy"><div class="eyebrow"><span class="status-dot"></span>街角的小店，今天也开着</div>
    <h1>把今天，<br>慢慢写完<span class="title-dot">。</span></h1><p>窗外的世界慢慢走。<br>留一杯咖啡的时间，给自己。</p>
    ${button('begin',store.active ? '回到窗边，继续这一杯' : '开始今天的一杯','primary home-start','arrow')}
    <div class="today"><span>今天在这里 <b>${today.minutes}</b> 分钟</span><span class="today-divider"></span><span><b>${today.cups}</b> 杯咖啡</span></div><div class="home-note"><span class="note-stem"></span><span>今日店内手记<small>${preferences.weather==='rain'?'雨落在窗上，咖啡替你暖着。':preferences.time==='night'?'街灯亮着，窗边也为你留着灯。':'花影落在桌边，窗边的位置还空着。'}</small></span></div>
    </section><div class="home-caption"><span class="caption-line"></span>划一划小店，松手慢慢归位；轻点进去坐坐。</div><div class="world-label">${icon(preferences.weather === 'rain' ? 'rain' : 'sun')}<span>${timeNames[preferences.time]} · ${preferences.weather === 'rain' ? '雨落街角' : '晴朗的街角'}</span></div>`;
}
function orderContent() {
  return `${homeContent()}<div class="sheet-scrim"></div><section class="order-sheet panel" role="dialog" aria-modal="true" aria-labelledby="order-title">
    ${quietButton('order-close','返回店外','close')}<span class="eyebrow">坐下来之前</span><h2 id="order-title">今天，想留多久？</h2><p class="muted">一杯咖啡，陪你做一件想做的事。</p>
    <div class="duration-choice"><input id="custom-minutes" aria-label="专注分钟数" type="number" min="5" max="180" value="${minutes}" inputmode="numeric"><span>分钟</span></div>
    <div class="duration-options">${[25,45,60,90].map(m => `<button class="duration-option ${minutes === m ? 'selected' : ''}" data-minutes="${m}" aria-pressed="${minutes === m}">${m}<small>分钟</small></button>`).join('')}</div>
    <div class="section-label">今天的一杯<span>随心选一杯</span></div><div class="drink-options">${menu().map(d => `<button class="drink-option ${drink === d ? 'selected' : ''}" data-drink="${d}" aria-pressed="${drink === d}">${drinkIcon(d)}<span>${d}</span><small>${drinkNotes[d] ?? '一份新心情'}</small><span class="selection-dot"></span></button>`).join('')}</div>
    <p id="order-error" class="form-error" role="alert"></p>${button('to-counter','去柜台，领取这一杯','primary','arrow')}<p class="footnote">不用急，坐下后才开始计时。</p></section>`;
}
function counterContent() {
  return `<header class="minimal-header">${button('counter-back','回到店外','text-button','back')}<span>窗间 · 柜台</span>${quietButton('settings-open','环境设置','settings')}</header>
    ${screen === 'counter' ? `<div class="receipt-holder"><article id="order-receipt" class="receipt" tabindex="0" role="button" aria-label="上滑提交小票，领取咖啡">${receiptContent(null,true)}</article><button id="submit-receipt" class="swipe-prompt">${icon('up')}<span>上滑小票，领取咖啡</span><small>也可以轻点这里</small></button></div>` : `<section class="making-coffee">${screen === 'brewing' ? '<span class="brewing-dots" aria-hidden="true"><i></i><i></i><i></i></span><div class="counter-message" role="status"><h2>为你准备一杯温热。</h2><p>磨豆 · 萃取 · 慢慢等待</p></div>' : `${icon('cup')}<div class="counter-message" role="status"><h2>咖啡好了，去坐坐吧。</h2><p>杯子还是热的。</p></div>${button('take-coffee','端起咖啡','primary','arrow')}`}</section>`}`;
}
function focusContent() {
  const paused = store.active?.runningSince === null;
  return `<div class="focus-ui ${hudVisible ? 'visible' : ''}" ${hudVisible ? '' : 'inert'}>
    <header class="focus-top"><span class="seat-label"><span class="status-dot"></span>窗边 · 01<span class="focus-weather">${timeNames[preferences.time]}，${preferences.weather === 'sun' ? '晴' : '雨'}</span></span>${quietButton('settings-open','环境设置','settings')}</header>
    <div class="focus-controls"><div class="time-readout"><span>${paused ? '歇一小会儿' : '这一杯，还有'}</span><output id="remaining" aria-label="剩余专注时间">${durationLabel(store.remaining())}</output></div><div class="control-divider"></div>${quietButton('pause-toggle',paused ? '继续专注' : '暂停专注',paused ? 'play' : 'pause')}${quietButton('sound-toggle',sound.enabled ? '关闭声音' : '开启声音',sound.enabled ? 'sound' : 'mute')}${quietButton('end-open','结束这一杯','end')}</div>
    <p class="focus-hint">${paused ? '咖啡等着你，时间也等着你。' : '轻触画面可查看时间，片刻后自动隐去'}</p></div>`;
}
function finishedContent() {
  return `<header class="minimal-header"><span class="brand">${logo}</span><span>一杯时间的纪念</span>${quietButton('settings-open','环境设置','settings')}</header><section class="finished-content"><span class="eyebrow">${lastReceipt?.complete ? '这一杯，刚刚好' : '今天，就先到这里'}</span><h2>谢谢你，坐了一会儿。</h2><p>把这段安静的时间，留在小票里。</p><article class="receipt finished-receipt">${receiptContent(lastReceipt)}</article><div class="finish-actions">${button('save-receipt','收进小票册','primary','book')}${button('back-home','回到店外','text-button')}</div>${store.storageError ? '<p class="storage-warning" role="alert">本机存储不可用。请导出这张小票，避免关闭后丢失。</p>' + button('export-receipts','导出小票','text-button') : '<p class="footnote">已悄悄保存在这台设备上</p>'}</section>`;
}
function historyContent() {
  return `<header class="topbar"><span class="brand">${logo}</span>${button('back-home','回到店外','text-button','back')}</header><section class="history-content"><div class="history-heading"><div><div class="eyebrow">RECEIPT BOOK</div><h1>留在这里的时间</h1><p>一些平常的日子，和好好坐下来的自己。</p></div>${store.receipts.length ? button('export-receipts','导出收藏','text-button') : ''}</div>
    ${store.receipts.length ? `<div class="receipt-gallery">${store.receipts.map((r,i) => `<article class="receipt archive-receipt" style="--tilt:${(i%3-1)*1.3}deg">${receiptContent(r)}<span class="receipt-stamp">${r.complete ? '一杯刚好' : '片刻也好'}</span></article>`).join('')}</div>` : `<div class="empty-book"><div class="empty-ticket">${icon('cup')}<span>等待第一杯</span></div><h3>小票册还是空白的。</h3><p>你在窗边坐过的时间，<br>会一张张留在这里。</p>${button('begin','开始今天的一杯','primary','arrow')}</div>`}</section>`;
}
function settingsContent() {
  return `<div class="modal-scrim" data-dismiss="true"></div><section class="settings-panel panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">${quietButton('settings-close','关闭环境设置','close')}<span class="eyebrow">让这里，更像你喜欢的样子</span><h2 id="settings-title">窗外的此刻</h2><div class="section-label">时间</div><div class="time-options">${Object.entries(timeNames).map(([key,value])=>`<button data-time="${key}" class="${preferences.time===key?'selected':''}" aria-pressed="${preferences.time===key}">${value}</button>`).join('')}</div>
    <div class="section-label">天气<span>让光线慢慢改变</span></div><div class="weather-options">${(['sun','rain'] as const).map(w=>`<button data-weather="${w}" class="${preferences.weather===w?'selected':''}" aria-pressed="${preferences.weather===w}">${icon(w)}${w==='sun'?'晴天':'雨天'}</button>`).join('')}</div>
    <div class="section-label">街道人流<span>让相遇，多一点或少一点</span></div><div class="crowd-options" role="group" aria-label="街道人流">${Object.entries(crowdNames).map(([key,label])=>`<button data-crowd="${key}" class="${preferences.crowd===key?'selected':''}" aria-pressed="${preferences.crowd===key}">${label}</button>`).join('')}</div>
    <div class="section-label">环境声音${button('settings-sound',sound.enabled?'全部静音':'开启声音','text-button')}</div>
    ${(['cafe','street','desk'] as const).map(key=>`<label class="sound-slider"><span>${{cafe:'店里的声音',street:'远处的街道',desk:'桌边的小动静'}[key]}</span><input type="range" min="0" max="1" step="0.05" value="${preferences.levels[key]}" data-sound="${key}" aria-label="${key==='cafe'?'咖啡厅音量':key==='street'?'街道音量':'桌面音量'}"></label>`).join('')}
    <div class="settings-divider"></div><div class="section-label">画质<span>${preferences.quality === 'auto' ? '当前：' + qualityNames[world.qualityTier] : '按你的偏好保留'}</span></div><div class="quality-options">${Object.entries(qualityNames).map(([key,value])=>`<button data-quality="${key}" class="${preferences.quality===key?'selected':''}" aria-pressed="${preferences.quality===key}">${value}</button>`).join('')}</div><p class="quality-hint">${{auto:'根据设备与运行流畅度调整画质。',low:'更少的耗电，适合长时间静静坐着。',balanced:'兼顾清晰度和流畅度。',high:'更清晰的窗景与边缘，耗电会稍多一些。',ultra:'最高渲染精度、抗锯齿与阴影。适合高性能设备，耗电和发热会增加。'}[preferences.quality]}</p><label class="switch-row"><span>减少动态<small>留一幅安静的窗景</small></span><input id="reduced-motion" type="checkbox" role="switch" ${preferences.reduced?'checked':''}></label>
    <label class="switch-row"><span>轻微视角呼吸<small>跟随呼吸和身体，轻轻起伏</small></span><input id="camera-breathing" type="checkbox" role="switch" ${preferences.breathing?'checked':''}></label><p class="footnote">设置只保存在这台设备上</p><details class="footnote"><summary>素材与许可</summary><p>手部：DevMops（CC0）；树木：Quaternius（CC0）；笔：Poly by Google（CC BY 3.0）。均已为窗间修改。</p><a href="${import.meta.env.BASE_URL}THIRD_PARTY.md" target="_blank" rel="noopener">完整素材说明与许可链接</a></details></section>`;
}
function render() {
  document.body.dataset.screen = screen;
  const content = screen === 'home' ? homeContent() : screen === 'order' ? orderContent() : ['counter','brewing','ready'].includes(screen) ? counterContent() : screen === 'focus' ? focusContent() : screen === 'finished' ? finishedContent() : historyContent();
  app.innerHTML = content + (overlay === 'settings' ? settingsContent() : overlay === 'end' ? `<div class="modal-scrim"></div><section class="end-panel panel" role="dialog" aria-modal="true" aria-labelledby="end-title"><span class="eyebrow">这一杯的时间，由你决定</span><h2 id="end-title">今天，先到这里？</h2><p>已经坐下来的 ${Math.floor(store.elapsed()/60000)} 分钟，都会留下。</p>${button('confirm-end','结束并留下小票','primary','check')}${button('continue-focus','再坐一会儿','text-button')}</section>` : '');
  bind();
  updateOrientationGate();
  syncInteraction();
  if(screen==='home'||screen==='order')world.layoutHome();
}
function syncInteraction(){world.setHomeInteractive(screen==='home'&&!overlay&&!transitionBusy);cursor.setEnabled(!hostHidden&&!preferences.reduced);}
function updateOrientationGate() {
  document.getElementById('orientation-gate')?.remove();
  const gated = needsLandscape() && (pendingSeat || screen === 'focus') && !overlay;
  document.querySelector<HTMLElement>('.focus-ui')?.toggleAttribute('inert', gated || !hudVisible);
  if(!gated)return;
  const gate=document.createElement('section');gate.id='orientation-gate';gate.setAttribute('role','dialog');gate.setAttribute('aria-modal','true');gate.setAttribute('aria-label','横屏自习');
  gate.innerHTML=`<span class="rotate-symbol" aria-hidden="true">▯<span>↻</span></span><span class="eyebrow">给窗外，多一点空间</span><h2>横过来，坐一会儿。</h2><p>${pendingSeat?'转动手机或平板后再入座，<br>这一杯还没有开始计时。':store.active?.runningSince===null?'时间暂停着，咖啡也等着你。':'这一杯正在继续。<br>转动设备，就能回到窗边。'}</p>${button('rotate-request','切换到横屏','primary','arrow')}${pendingSeat?button('rotate-back','回到店外','text-button'):button('rotate-pause',store.active?.runningSince===null?'继续计时':'暂停计时','text-button',store.active?.runningSince===null?'play':'pause')}`;
  document.body.append(gate);
  document.getElementById('rotate-request')!.onclick=()=>{void setStudyOrientation(true,true);};
  document.getElementById('rotate-back')?.addEventListener('click',navigateHome);
  document.getElementById('rotate-pause')?.addEventListener('click',()=>{store.active?.runningSince===null?store.resume():store.pause();updateOrientationGate();});
}
const on = (id: string, action: () => void) => document.getElementById(id)?.addEventListener('click', e => { e.stopPropagation(); action(); });
function savePreferences() { try { storage.setItem('mado.preferences.v1', JSON.stringify(preferences)); } catch { /* Session storage failures are surfaced separately. */ } }
function applyPreferences() { world.setTime(preferences.time); world.setWeather(preferences.weather); world.setQuality(preferences.quality);world.setCrowd(preferences.crowd); world.reducedMotion = preferences.reduced;world.cameraBreathing=preferences.breathing; for (const key of ['cafe','street','desk'] as const) sound.setLevel(key, preferences.levels[key]); }
async function enableSound() { try { await sound.unlock(); sound.setRain(preferences.weather==='rain'?1:0); } catch { sound.enabled=false; } }
async function toggleSound() { try { await sound.setEnabled(!sound.enabled);if(sound.enabled)void sound.ui('toggle',1); } catch { sound.enabled=false; } preferences.sound=sound.enabled; savePreferences(); render(); }
function showHud() {
  if (screen !== 'focus') return;
  hudVisible = true; const ui = document.querySelector<HTMLElement>('.focus-ui'); ui?.classList.add('visible'); if(ui)ui.inert=false;
  clearTimeout(hideTimer);
  if (store.active?.runningSince !== null && !overlay) hideTimer=setTimeout(()=>{
    if (document.activeElement instanceof HTMLElement && ui?.contains(document.activeElement)) document.activeElement.blur();
    hudVisible=false; const current=document.querySelector<HTMLElement>('.focus-ui');current?.classList.remove('visible');if(current)current.inert=true;
  },5000);
}
function closeOverlay() { overlay=null; render(); showHud(); volumeReturnFocus?.focus(); }
function openSettings() { volumeReturnFocus=document.activeElement as HTMLElement; overlay='settings';clearTimeout(hideTimer);render();document.getElementById('settings-close')?.focus(); }
function navigateHome() { pendingSeat=false;transitionBusy=false;timers.forEach(clearTimeout);timers.length=0;screen='home';overlay=null;void setStudyOrientation(false);world.setView('home',false);render(); }
function begin() { void enableSound(); if(store.active){store.resume();void setStudyOrientation(true);screen='focus';world.setView('seat');hudVisible=true;render();showHud();}else{screen='order';render();document.getElementById('order-close')?.focus({preventScroll:true});} }
function bind() {
  on('begin',begin);on('order-close',navigateHome);on('counter-back',()=>{if(!transitionBusy)navigateHome();});on('back-home',navigateHome);
  on('home-logo',()=>{if(!store.active)navigateHome();});
  on('history-open',()=>{screen='history';render();});on('save-receipt',()=>{screen='history';world.setView('home',false);render();});
  on('settings-open',openSettings);on('settings-close',closeOverlay);
  on('sound-toggle',()=>{void toggleSound();});on('settings-sound',()=>{void toggleSound();});
  on('export-receipts',exportReceipts);
  on('to-counter',()=>{
    const input=document.querySelector<HTMLInputElement>('#custom-minutes')!;
    const value=Number(input.value);
    if(!Number.isFinite(value)||value<5||value>180){document.querySelector('#order-error')!.textContent='给自己 5–180 分钟就好。';input.focus();return;}
    minutes=Math.round(value);screen='counter';world.setView('counter',false);world.brewing(false);render();void enableSound();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-minutes]').forEach(b=>b.addEventListener('click',()=>{minutes=Number(b.dataset.minutes);render();}));
  document.querySelector<HTMLInputElement>('#custom-minutes')?.addEventListener('input',e=>{const value=Number((e.target as HTMLInputElement).value);if(Number.isFinite(value))minutes=value;});
  app.querySelectorAll<HTMLButtonElement>('[data-drink]').forEach(b=>b.addEventListener('click',()=>{drink=b.dataset.drink!;render();}));
  on('submit-receipt',submitReceipt);on('take-coffee',takeSeat);
  const ticket=document.querySelector<HTMLElement>('#order-receipt');
  if(ticket){
    let start=0,dragging=false,distance=0;
    ticket.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging=true;start=e.clientY;ticket.setPointerCapture(e.pointerId);});
    ticket.addEventListener('pointermove',e=>{if(!dragging)return;distance=Math.min(0,e.clientY-start);ticket.style.transform=`translateY(${distance}px) rotate(${-distance*.006}deg)`;});
    ticket.addEventListener('pointerup',()=>{if(!dragging)return;dragging=false;if(distance< -72)submitReceipt();else gsap.to(ticket,{y:0,rotation:0,duration:.35});distance=0;});
    ticket.addEventListener('pointercancel',()=>{dragging=false;distance=0;gsap.to(ticket,{y:0,rotation:0,duration:.35});});
    ticket.addEventListener('keydown',e=>{if(['Enter',' ','ArrowUp'].includes(e.key)){e.preventDefault();submitReceipt();}});
  }
  on('pause-toggle',()=>{store.active?.runningSince===null?store.resume():store.pause();hudVisible=true;render();showHud();});
  on('end-open',()=>{overlay='end';clearTimeout(hideTimer);render();document.getElementById('continue-focus')?.focus();});
  on('continue-focus',closeOverlay);on('confirm-end',finishCup);
  app.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(b=>b.addEventListener('click',()=>{preferences.time=b.dataset.time as TimeMode;world.setTime(preferences.time);savePreferences();render();}));
  app.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(b=>b.addEventListener('click',()=>{preferences.weather=b.dataset.weather as Weather;world.setWeather(preferences.weather);savePreferences();render();}));
  app.querySelectorAll<HTMLButtonElement>('[data-crowd]').forEach(b=>b.addEventListener('click',()=>{
    preferences.crowd=b.dataset.crowd as CrowdMode;world.setCrowd(preferences.crowd);savePreferences();
    app.querySelectorAll<HTMLButtonElement>('[data-crowd]').forEach(option=>{const selected=option.dataset.crowd===preferences.crowd;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));});
  }));
  app.querySelectorAll<HTMLInputElement>('[data-sound]').forEach(input=>input.addEventListener('input',()=>{const key=input.dataset.sound as SoundChannel;preferences.levels[key]=Number(input.value);sound.setLevel(key,Number(input.value));savePreferences();void enableSound();}));
  app.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(b=>b.addEventListener('click',()=>{preferences.quality=b.dataset.quality as QualityMode;world.setQuality(preferences.quality);savePreferences();const scroll=document.querySelector('.settings-panel')?.scrollTop??0;render();const panel=document.querySelector('.settings-panel');if(panel)panel.scrollTop=scroll;document.querySelector<HTMLButtonElement>(`[data-quality="${preferences.quality}"]`)?.focus({preventScroll:true});}));
  document.querySelector<HTMLInputElement>('#reduced-motion')?.addEventListener('change',e=>{preferences.reduced=(e.target as HTMLInputElement).checked;world.reducedMotion=preferences.reduced;savePreferences();syncInteraction();});
  document.querySelector<HTMLInputElement>('#camera-breathing')?.addEventListener('change',e=>{preferences.breathing=(e.target as HTMLInputElement).checked;world.cameraBreathing=preferences.breathing;savePreferences();});
  document.querySelector('[data-dismiss]')?.addEventListener('click',()=>{void sound.ui('back').catch(()=>{});closeOverlay();});
}
function submitReceipt() {
  if(screen!=='counter'||transitionBusy)return;transitionBusy=true;void enableSound();
  void sound.ui('paper').catch(()=>{});
  const ticket=document.querySelector('#order-receipt');
  const tl=gsap.timeline({defaults:{ease:'power2.inOut'},onComplete:()=>{
    screen='brewing';render();sound.event('brew');
    timers.push(setTimeout(()=>{screen='ready';world.brewing(true);sound.event('cup');render();timers.push(setTimeout(takeSeat,2200));},2400));
  }});
  tl.to(ticket,{y:-innerHeight*.85,opacity:0,rotation:2,duration:preferences.reduced?.05:.85});
}
function takeSeat() {
  if(screen!=='ready')return;
  if(document.hidden||hostHidden){pendingSeat=true;return;}
  if(needsLandscape()){pendingSeat=true;render();void setStudyOrientation(true);return;}
  pendingSeat=false;void setStudyOrientation(true);
  screen='focus';transitionBusy=true;overlay=null;hudVisible=true;
  syncInteraction();
  timers.forEach(clearTimeout);timers.length=0;
  const shade=document.createElement('div');shade.className='transition-shade';document.body.append(shade);
  gsap.timeline({onComplete:()=>{shade.remove();transitionBusy=false;showHud();}})
    .to(shade,{opacity:1,duration:preferences.reduced?.05:.65,ease:'sine.inOut'})
    .call(()=>{store.start(minutes,drink);world.setCoffee(0);world.setView('seat');render();sound.event('cup');})
    .to(shade,{opacity:0,duration:preferences.reduced?.05:1.4,ease:'sine.inOut'});
}
function finishCup() {
  if(screen!=='focus'||transitionBusy||!store.active)return;
  lastReceipt=store.finish();world.setCoffee(1);overlay=null;transitionBusy=true;clearTimeout(hideTimer);
  const shade=document.createElement('div');shade.className='transition-shade';document.body.append(shade);
  gsap.timeline({onComplete:()=>{shade.remove();transitionBusy=false;}})
    .to(shade,{opacity:1,duration:preferences.reduced?.05:1.1})
    .call(()=>{screen='finished';void setStudyOrientation(false);world.setView('counter',false);world.brewing(false);render();})
    .to(shade,{opacity:0,duration:preferences.reduced?.05:.8});
}
function exportReceipts() {
  if(window.IkoHost){window.IkoHost.postMessage(JSON.stringify({type:'export',scene:'mado',data:JSON.stringify({app:'窗间',version:1,receipts:store.receipts},null,2)}));return;}
  const blob=new Blob([JSON.stringify({app:'窗间',version:1,receipts:store.receipts},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`mado-receipts-${dateFormat(Date.now())}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
canvas.addEventListener('pointerdown',()=>{if(screen==='focus'&&!overlay)showHud();});
// Capture once, including dynamically rendered buttons, switches and keyboard clicks.
document.addEventListener('click',event=>{
  const target=(event.target as Element)?.closest<HTMLElement>('button,a,input,[role="button"]');
  if(!target||target.matches(':disabled,input')||['sound-toggle','settings-sound','order-receipt','submit-receipt'].includes(target.id))return;
  const id=target.id;
  void sound.ui(target.matches('[aria-pressed]')?'select':/receipt|history|export/.test(id)?'paper':/take-coffee|to-counter|confirm|begin|rotate-request/.test(id)?'confirm':/close|back|continue|home-logo/.test(id)?'back':'tap').catch(()=>{});
},true);
document.addEventListener('input',event=>{
  const input=event.target;
  if(input instanceof HTMLInputElement&&input.type==='range')void sound.ui('step',(Number(input.value)-Number(input.min))/(Number(input.max)-Number(input.min)||1)).catch(()=>{});
});
document.addEventListener('change',event=>{
  const input=event.target;
  if(input instanceof HTMLInputElement){
    if(input.type==='checkbox')void sound.ui('toggle',Number(input.checked)).catch(()=>{});
    else if(input.type==='number')void sound.ui('select').catch(()=>{});
  }
});
window.addEventListener('resize',()=>{if(pendingSeat&&!needsLandscape())takeSeat();else updateOrientationGate();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(overlay||screen==='order')void sound.ui('back').catch(()=>{});if(overlay)closeOverlay();else if(screen==='order')navigateHome();else if(screen==='focus')showHud();}
  if(screen==='focus'&&!overlay&&(e.key==='Tab'||e.key===' '))showHud();
  if(e.key==='Tab'&&(overlay||screen==='order'||document.getElementById('orientation-gate'))){
    const dialog=document.querySelector('[role="dialog"]');const items=Array.from(dialog?.querySelectorAll<HTMLElement>('button,input,[tabindex="0"]')??[]).filter(el=>!el.hasAttribute('disabled'));
    const first=items[0],last=items.at(-1);
    if(e.shiftKey&&(document.activeElement===first||!dialog?.contains(document.activeElement))){e.preventDefault();last?.focus();}
    else if(!e.shiftKey&&(document.activeElement===last||!dialog?.contains(document.activeElement))){e.preventDefault();first?.focus();}
  }
});
document.addEventListener('visibilitychange',()=>{void sound.visibility();updateTime();});
function updateTime() {
  if(!store.active||screen!=='focus')return;
  const output=document.querySelector('#remaining');if(output)output.textContent=durationLabel(store.remaining());
  world.setCoffee(store.elapsed()/store.active.durationMs);
  if(store.remaining()===0)finishCup();
}
const uiTimer=setInterval(updateTime,500);
let disposed=false;
let hostHidden=false;

async function boot() {
  app.innerHTML=`<section class="loading"><span class="loading-cup">${icon('cup')}</span><h1>窗间</h1><p>推开门，留一杯时间。</p><div class="loading-track"><i id="load-progress"></i></div><small>正在整理窗边的位置</small></section>`;
  try {
    world=new World(canvas,sound,preferences.quality);
    world.onHomeEnter=()=>{if(screen==='home'&&!overlay&&!transitionBusy){void sound.ui('door').catch(()=>{});begin();}};
    world.onContextLost=()=>{app.innerHTML='<section class="loading"><h2>窗景暂时休息了。</h2><p>这一杯的计时已经保留。</p><button class="primary" onclick="location.reload()">重新打开窗景</button></section>';};
    await world.load(progress=>{const bar=document.getElementById('load-progress');if(bar)bar.style.width=`${Math.max(5,progress*100)}%`;});
    if(disposed){world.dispose();return;}
    applyPreferences();
    // Opening a scene never starts or resumes focus without an explicit choice.
    store.pause();
    void setStudyOrientation(false);
    screen='home';world.setView('home',false);
    render();showHud();updateTime();
    // Read-only diagnostics for performance verification, never visible in the product UI.
    Object.defineProperty(window,'madoDiagnostics',{value:()=>({...world.diagnostics(),screen,receipts:store.receipts.length,remainingMs:store.remaining(),storageError:store.storageError,orientationGated:!!document.getElementById('orientation-gate'),pendingSeat,audio:sound.diagnostics(),homeInteraction:world.homeDiagnostics(),cursor:cursor.diagnostics()})});
  } catch(error) {
    console.error('MADO could not load the 3D world',error);
    app.innerHTML=`<section class="loading"><span class="loading-cup">${icon('cup')}</span><h2>窗边还没有准备好。</h2><p>需要支持 WebGL2 的浏览器，并能加载本地场景。<br>你的专注记录会保留。</p><button class="primary" id="retry">再试一次</button></section>`;
    on('retry',()=>location.reload());
  }
}
connectIkoHost('mado',['mado.session.v1','mado.preferences.v1'],{
  pause(){store.pause();if(world){hudVisible=true;render();updateTime();}},
  visibility(hidden){hostHidden=hidden;world?.visibility(hidden);if(hidden){cursor.setEnabled(false);gsap.globalTimeline.pause();}else{cursor.setEnabled(!preferences.reduced);gsap.globalTimeline.resume();if(pendingSeat)takeSeat();}void sound.hostVisibility(hidden);},
  dispose(){disposed=true;clearInterval(uiTimer);clearTimeout(hideTimer);timers.forEach(clearTimeout);cursor.dispose();gsap.globalTimeline.clear();world?.dispose();sound.dispose();},
  snapshot(){return {active:store.active,records:store.receipts};},
  configure(settings){if(settings.muted!==undefined)preferences.sound=!settings.muted;if(settings.reducedMotion!==undefined)preferences.reduced=settings.reducedMotion;if(world)applyPreferences();}
});
void document.fonts.ready.then(()=>{if(!disposed&&world&&screen==='home')world.layoutHome();});
void boot();
