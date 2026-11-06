/** 开放进度只接受计时引擎给出的有效专注毫秒。 */
export type Opportunity = {state:'Available'|'CoolingDown'; focusAtCast:number};
export function updateOpportunity(gate:Opportunity, focusMs:number, intervalMinutes:number) {
  const remainingMs=Math.max(0,intervalMinutes*60000-(focusMs-gate.focusAtCast));
  if (gate.state==='CoolingDown' && remainingMs===0) gate.state='Available';
  return {available:gate.state==='Available',remainingMs:gate.state==='Available'?0:remainingMs};
}
export function consumeOpportunity(gate:Opportunity, focusMs:number) {
  gate.state='CoolingDown';gate.focusAtCast=focusMs;
}
