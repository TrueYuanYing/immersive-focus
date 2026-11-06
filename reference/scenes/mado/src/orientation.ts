import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

export const isTouchDevice = () => Capacitor.isNativePlatform() || matchMedia('(pointer: coarse)').matches;
export const needsLandscape = () => isTouchDevice() && innerHeight > innerWidth;
export async function setStudyOrientation(studying: boolean, requestFullscreen = false) {
  if (!isTouchDevice()) return;
  try {
    if (Capacitor.isNativePlatform()) await ScreenOrientation.lock({ orientation: studying ? 'landscape' : 'portrait' });
    else if (studying) {
      if(requestFullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
      await orientation?.lock?.('landscape');
    } else screen.orientation?.unlock?.();
  } catch { /* Browser/iPad/large Android windows can refuse locks. The rotation gate stays usable. */ }
}
