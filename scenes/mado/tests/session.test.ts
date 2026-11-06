import { expect, test } from 'vitest';
import { SessionStore } from '../src/session';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
};

test('暂停时间不计入一杯，刷新后保留剩余时间，重复结束只存一张小票', () => {
  const storage = memory();
  let now = new Date('2026-09-06T15:00:00+08:00').getTime();
  let store = new SessionStore(storage, () => now);
  store.start(25, '拿铁');
  now += 5 * 60000;
  store.pause();
  now += 10 * 60000;
  expect(store.remaining()).toBe(20 * 60000);
  store.resume();
  store = new SessionStore(storage, () => now);
  now += 2 * 60000;
  expect(store.remaining()).toBe(18 * 60000);
  store.finish();
  store.finish();
  expect(store.receipts).toHaveLength(1);
  expect(store.receipts[0].elapsedMs).toBe(7 * 60000);
  expect(store.receipts[0].drink).toBe('拿铁');
});

test('到时恢复按约定时长完成，退出后的后台时间不会超额计入',()=>{
  const storage=memory();let now=1000000;let store=new SessionStore(storage,()=>now);
  store.start(5,'美式');now+=90*60000;store=new SessionStore(storage,()=>now);
  expect(store.remaining()).toBe(0);expect(store.finish()?.elapsedMs).toBe(5*60000);
  expect(store.receipts[0].complete).toBe(true);
});

test('无效时长不会覆盖现有记录，存储失败仍保留可导出的本次小票',()=>{
  let now=1000000;const store=new SessionStore({getItem:()=>null,setItem:()=>{throw new Error('disk full');}},()=>now);
  expect(()=>store.start(NaN,'拿铁')).toThrow();expect(store.active).toBeNull();
  store.start(25,'拿铁');now+=60000;store.finish();
  expect(store.storageError).toBe(true);expect(store.receipts[0].elapsedMs).toBe(60000);
});
