export type Cup = { id: string; drink: string; startedAt: number; durationMs: number; accumulatedMs: number; runningSince: number | null };
export type Receipt = { id: string; drink: string; startedAt: number; endedAt: number; elapsedMs: number; durationMs: number; complete: boolean };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'mado.session.v1';
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const validReceipt = (r: Partial<Receipt> | null): r is Receipt => !!r && typeof r.id === 'string' && typeof r.drink === 'string' && finite(r.startedAt) && finite(r.endedAt) && finite(r.elapsedMs) && finite(r.durationMs) && typeof r.complete === 'boolean';

export class SessionStore {
  active: Cup | null = null;
  receipts: Receipt[] = [];
  storageError = false;
  constructor(private storage: StoragePort, private now: () => number = Date.now) {
    try {
      const saved = JSON.parse(storage.getItem(KEY) ?? '{}');
      this.receipts = Array.isArray(saved.receipts) ? saved.receipts.filter(validReceipt) : [];
      const a = saved.active;
      if (a && typeof a.id === 'string' && typeof a.drink === 'string' && finite(a.startedAt) && finite(a.durationMs) && a.durationMs >= 300000 && a.durationMs <= 10800000 && finite(a.accumulatedMs) && (a.runningSince === null || finite(a.runningSince))) this.active = a;
    } catch { this.storageError = true; }
  }
  start(minutes: number, drink: string) {
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 180) throw new Error('请选择 5–180 分钟');
    if (this.active) throw new Error('桌上已经有一杯咖啡');
    const now = this.now();
    this.active = { id: crypto.randomUUID(), drink: drink.slice(0, 40), startedAt: now, durationMs: Math.round(minutes * 60000), accumulatedMs: 0, runningSince: now };
    this.save();
  }
  elapsed() {
    const a = this.active;
    return a ? Math.min(a.durationMs, a.accumulatedMs + (a.runningSince === null ? 0 : Math.max(0, this.now() - a.runningSince))) : 0;
  }
  remaining() { return this.active ? Math.max(0, this.active.durationMs - this.elapsed()) : 0; }
  pause() {
    if (!this.active || this.active.runningSince === null) return;
    this.active.accumulatedMs = this.elapsed(); this.active.runningSince = null; this.save();
  }
  resume() {
    if (!this.active || this.active.runningSince !== null) return;
    this.active.runningSince = this.now(); this.save();
  }
  finish(): Receipt | null {
    const a = this.active;
    if (!a) return null;
    const elapsedMs = this.elapsed();
    const receipt = { id: a.id, drink: a.drink, startedAt: a.startedAt, endedAt: this.now(), elapsedMs, durationMs: a.durationMs, complete: elapsedMs >= a.durationMs };
    if (!this.receipts.some(r => r.id === a.id)) this.receipts.unshift(receipt);
    this.active = null;
    this.save();
    return receipt;
  }
  today() {
    const today = new Date(this.now()).toDateString();
    const items = this.receipts.filter(r => new Date(r.endedAt).toDateString() === today);
    return { minutes: Math.floor(items.reduce((sum, r) => sum + r.elapsedMs, 0) / 60000), cups: items.length };
  }
  private save() {
    try { this.storage.setItem(KEY, JSON.stringify({ active: this.active, receipts: this.receipts })); this.storageError = false; }
    catch { this.storageError = true; }
  }
}

export function durationLabel(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
