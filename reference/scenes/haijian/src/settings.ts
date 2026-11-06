import {defaultMix,validateMix,type SoundMix} from './sound-mix';
export type Settings = {
  soundMix:SoundMix;
  intervalMinutes:number; fishingEnabled:boolean; assisted:boolean;
  weather:'sun'|'rain'; time:'local'|'dawn'|'day'|'dusk'|'night';
  quality:'auto'|'low'|'medium'|'high'; activity:'quiet'|'everyday'|'lively';
  muted:boolean; volume:number; cameraMotion:boolean; reducedMotion:boolean;
};
export const defaults:Settings={soundMix:{...defaultMix},intervalMinutes:25,fishingEnabled:true,assisted:false,weather:'sun',time:'day',quality:'auto',activity:'everyday',muted:false,volume:.45,cameraMotion:false,reducedMotion:false};
export function validateSettings(raw:unknown):Settings {
  const s={...defaults,soundMix:{...defaultMix}}; if (!raw || typeof raw!=='object') return s;
  const d=raw as Record<string,unknown>;
  s.soundMix=validateMix(d.soundMix);
  for (const key of ['fishingEnabled','assisted','muted','cameraMotion','reducedMotion'] as const) if(typeof d[key]==='boolean') s[key]=d[key];
  if(typeof d.intervalMinutes==='number'&&Number.isInteger(d.intervalMinutes)&&d.intervalMinutes>=5&&d.intervalMinutes<=60) s.intervalMinutes=d.intervalMinutes;
  if(typeof d.volume==='number'&&Number.isFinite(d.volume)&&d.volume>=0&&d.volume<=1) s.volume=d.volume;
  for(const [key, values] of Object.entries({weather:['sun','rain'],time:['local','dawn','day','dusk','night'],quality:['auto','low','medium','high'],activity:['quiet','everyday','lively']})) {
    if(values.includes(d[key] as string)) Object.assign(s,{[key]:d[key]});
  }
  return s;
}
