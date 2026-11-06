/** One mounted scene, one authoritative clock. The host persists snapshots only. */
export type ScenePort = {
  pause(): void;
  background?(): void;
  preserveOnPageHide?: boolean;
  visibility(hidden: boolean): void | Promise<void>;
  dispose(): void;
  snapshot(): { active: unknown; records: unknown[] };
  configure?(settings: { muted?: boolean; reducedMotion?: boolean; requestId?: string }): void;
};
type HostMessage = { type: string; scene: string; storage: Record<string, string>; active: unknown; records: unknown[] };
declare global {
  interface Window {
    IkoHost?: { postMessage(message: string): void };
    ikoScene?: { command(name: string, value?: { muted?: boolean; reducedMotion?: boolean; requestId?: string }): void; snapshot(): HostMessage };
  }
}

export function connectIkoHost(scene: string, keys: string[], port: ScenePort) {
  let disposed = false;
  const abort = new AbortController();
  function snapshot(): HostMessage {
    const storage: Record<string, string> = {};
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) storage[key] = value;
    }
    return { type: 'snapshot', scene, storage, ...port.snapshot() };
  }
  let exitRequest: string | undefined;
  function emit(type = 'snapshot') {
    if (disposed && type !== 'disposed') return;
    const payload={ ...snapshot(), type, requestId:exitRequest, capturedAt:Date.now() };
    if(window.IkoHost)window.IkoHost.postMessage(JSON.stringify(payload));
    else if(window.parent!==window)window.parent.postMessage({channel:'iko.study.v1',payload},location.origin);
  }
  function pause() { port.pause(); void port.visibility(true); emit(); }
  function dispose() {
    if (disposed) return;
    port.pause(); emit(); disposed = true;
    clearInterval(timer); abort.abort(); port.dispose(); emit('disposed');
  }
  const timer = window.setInterval(() => emit(), 1000);
  window.ikoScene = {
    snapshot,
    command(name, value) {
      if (disposed) return;
      if (name === 'pause') pause();
      else if (name === 'visible') void port.visibility(false);
      else if (name === 'dispose') { exitRequest=value?.requestId; dispose(); }
      else if (name === 'settings' && value) { port.configure?.(value); emit(); }
    },
  };
  window.addEventListener('message', event=>{
    if(event.origin!==location.origin||event.source!==window.parent||event.data?.channel!=='iko.study.v1')return;
    window.ikoScene?.command(event.data.command,event.data.value);
  },{signal:abort.signal});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if(port.background){port.background();void port.visibility(true);emit();}
      else pause();
    } else void port.visibility(false);
  }, { signal: abort.signal });
  window.addEventListener('pagehide', () => {
    if(!port.preserveOnPageHide){dispose();return;}
    // A refresh keeps the current rest and focus record. Explicit host dispose
    // still uses pause() and closes the scene before the WebView is removed.
    void port.visibility(true);emit();disposed=true;clearInterval(timer);abort.abort();port.dispose();emit('disposed');
  }, { signal: abort.signal });
  // WebView does not implement browser blob downloads. Keep original export buttons.
  document.addEventListener('click', event => {
    const link = (event.target as Element)?.closest<HTMLAnchorElement>('a[download]');
    if (!window.IkoHost || !link?.href.startsWith('blob:')) return;
    event.preventDefault();
    void fetch(link.href).then(r => r.text()).then(data => window.IkoHost?.postMessage(JSON.stringify({ type: 'export', scene, name: link.download, data })));
  }, { capture: true, signal: abort.signal });
  emit('ready');
  return dispose;
}
