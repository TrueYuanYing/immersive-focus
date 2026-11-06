import { describe, it, expect } from 'vitest';
import { SessionStore } from '../src/session';

const minute = 60000;
function setup() {
  let time = 1000000000;
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const now = () => time;
  return { store: new SessionStore(storage, now), storage, now, advance: (ms: number) => { time += ms; } };
}
describe('一张船票与有效专注', () => {
  it('到期瞬间按暂停，仍按原计划终点归档',()=>{
    const {store,advance,now}=setup();const end=now()+5*minute;store.create(5);store.seat();advance(5*minute);store.pause();advance(60*minute);
    expect(store.finish()?.endedAt).toBe(end);
  });
  it('刷新船票保留先去钓鱼；不接受字符串时长或状态不一致的持久化航程',()=>{
    const {store,storage,now}=setup();store.create(25,true);
    expect(new SessionStore(storage,now).active?.startWithFishing).toBe(true);
    const saved=JSON.parse(storage.getItem('haijian.v1')!);saved.active.durationMs='300000';storage.setItem('haijian.v1',JSON.stringify(saved));
    const invalid=new SessionStore(storage,now);expect(invalid.active).toBe(null);expect(invalid.storageError).toBe(true);
    expect(JSON.parse(invalid.export()).recoveryRaw).toContain('300000');
  });
  it('初始立即可用，只在抛竿入水时消费；12 + 暂停10 + 13 分钟重新开放', () => {
    const {store, advance} = setup();store.create(60);
    expect(store.opportunity().available).toBe(true);
    store.enterFishing();store.returnToSeat();
    expect(store.opportunity().available).toBe(true);
    const rest = store.enterFishing();
    expect(store.enterFishing()?.id).toBe(rest?.id);
    expect(store.consumeCast()).toBe(true);
    expect(store.consumeCast()).toBe(true);
    advance(3*minute);store.returnToSeat();advance(12*minute);store.pause();advance(10*minute);
    expect(store.opportunity().remainingMs).toBe(13*minute);
    store.resume();advance(13*minute);
    expect(store.opportunity().available).toBe(true);
    expect(store.active?.restMs).toBe(3*minute);
  });
  it('已开放不会被调大间隔收回，尚未开放时调小保留已有专注',()=>{
    const {store,advance}=setup();store.create(180);store.seat();store.enterFishing();store.consumeCast();store.returnToSeat();
    advance(12*minute);store.configure({intervalMinutes:10});expect(store.opportunity().available).toBe(true);
    store.configure({intervalMinutes:60});expect(store.opportunity().available).toBe(true);
    advance(90*minute);store.enterFishing();store.consumeCast();store.returnToSeat();
    expect(store.opportunity().remainingMs).toBe(60*minute);
  });
  it.each([5,60])('%i 分钟阈值、隐藏入口、刷新休息身份和已确认鱼获幂等', interval=>{
    const {store,advance,storage,now}=setup();store.configure({intervalMinutes:interval});store.create(180);store.seat();
    const rest=store.enterFishing();store.consumeCast();store.confirmCatch({id:'cast-1',species:0,length:22});
    const restored=new SessionStore(storage,now);
    expect(restored.active?.rest?.id).toBe(rest?.id);
    restored.confirmCatch({id:'cast-1',species:0,length:22});expect(restored.fish).toHaveLength(1);
    expect(restored.active?.rest?.consumed).toBe(true);restored.returnToSeat();restored.configure({fishingEnabled:false});
    advance(interval*minute-1);expect(restored.opportunity().available).toBe(false);advance(1);expect(restored.opportunity().available).toBe(true);
    restored.configure({fishingEnabled:true});expect(restored.opportunity().available).toBe(true);
  });
  it('从暂停进入休息后仍暂停，宿主结束只归档实际专注',()=>{
    const {store,advance}=setup();store.create(25);store.seat();advance(2*minute);store.pause();store.enterFishing();store.consumeCast();advance(minute);store.returnToSeat();
    expect(store.active?.status).toBe('paused');advance(20*minute);expect(store.elapsed()).toBe(2*minute);
    const ticket=store.finish();expect(ticket?.focusMs).toBe(2*minute);expect(ticket?.complete).toBe(false);
    expect(store.confirmCatch({id:'late',species:0,length:30})).toBe(false);expect(store.fish).toHaveLength(0);
  });
  it('宿主在钓鱼中结束，立即保存休息与已确认鱼，拒绝迟到结算',()=>{
    const {store,advance,storage,now}=setup();store.create(25);store.seat();advance(2*minute);store.enterFishing();store.consumeCast();
    store.confirmCatch({id:'confirmed',species:1,length:30});advance(3*minute);expect(store.active?.status).toBe('fishing');
    const ticket=store.finish();expect(ticket).toMatchObject({focusMs:2*minute,restMs:3*minute,complete:false});
    expect(store.confirmCatch({id:'late',species:2,length:28})).toBe(false);expect(new SessionStore(storage,now).fish).toHaveLength(1);
  });
  it('取票和等待横屏不计时，真正入座开始；暂停后刷新保持暂停', () => {
    const {store, advance, storage, now} = setup();
    store.create(25); advance(2 * minute);
    expect(store.elapsed()).toBe(0);
    store.seat(); advance(12 * minute); store.pause(); advance(10 * minute);
    const restored = new SessionStore(storage, now);
    expect(restored.elapsed()).toBe(12 * minute);
    expect(restored.active?.status).toBe('paused');
    restored.resume(); advance(13 * minute);
    const ticket = restored.finish();
    expect(ticket?.focusMs).toBe(25 * minute);
    expect(ticket?.complete).toBe(true);
    expect(restored.finish()).toBe(null);
    expect(new SessionStore(storage, now).tickets).toHaveLength(1);
  });
});
