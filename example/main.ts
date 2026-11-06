import {SessionStore, durationLabel} from '../scenes/mado/src/session';
const session = new SessionStore(localStorage);
session.pause();
const clock = document.querySelector<HTMLOutputElement>('#clock')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
function render() {
  clock.value = durationLabel(session.active ? session.remaining() : 300000);
  status.textContent = session.storageError ? '存储失败，当前状态尚未持久保存' : `已归档 ${session.receipts.length} 次`;
}
for (const [id, action] of Object.entries({
  start: () => { if (!session.active) session.start(5, '合成咖啡'); },
  pause: () => session.pause(), resume: () => session.resume(),
  finish: () => session.finish(),
})) document.getElementById(id)!.addEventListener('click', () => {action();render();});
const timer = window.setInterval(render, 250);
document.addEventListener('visibilitychange', () => {if (document.hidden) session.pause();render();});
window.addEventListener('pagehide', () => {session.pause();window.clearInterval(timer);});
render();
