export type QualityTier = 'low' | 'balanced' | 'high' | 'ultra';
export type QualityMode = 'auto' | QualityTier;
export const qualityNames: Record<QualityMode, string> = { auto: '自动', low: '省电', balanced: '均衡', high: '高清', ultra: '极致' };

const profiles = {
  ultra: { dpr: 3, pixels: 12582912, samples: 4, shadow: 4096, shadowFps: 60, fps: 60, bloom: true },
  low: { dpr: 1, pixels: 1500000, samples: 0, shadow: 512, shadowFps: 10, fps: 30, bloom: false },
  balanced: { dpr: 1.25, pixels: 2200000, samples: 0, shadow: 1024, shadowFps: 15, fps: 60, bloom: false },
  high: { dpr: 2, pixels: 8500000, samples: 4, shadow: 2048, shadowFps: 30, fps: 60, bloom: true },
};

export function initialQuality(memory: number | undefined, cores: number, coarse: boolean): QualityTier {
  if ((memory !== undefined && memory <= 2) || cores <= 2) return 'low';
  if (!coarse && cores >= 8 && (memory === undefined || memory >= 8)) return 'high';
  return 'balanced';
}

export function renderProfile(tier: QualityTier, width: number, height: number, deviceDpr: number, maxSamples: number, mobile = false, maxRenderSize = 16384) {
  // Touch devices retain finer high-quality sampling without the multi-pass bloom cost.
  const p = mobile && tier === 'high'
    ? { ...profiles.high, dpr: 1.5, pixels: 3200000, samples: 0, shadow: 1024, shadowFps: 15, bloom: false }
    : profiles[tier];
  const ratio = Math.min(deviceDpr, p.dpr, Math.sqrt(p.pixels / Math.max(1, width * height)), maxRenderSize / Math.max(width, height));
  return { ...p, ratio, shadow: Math.min(p.shadow, maxRenderSize), samples: Math.min(p.samples, maxSamples, mobile && width * height * ratio ** 2 > 6000000 ? 2 : 4) };
}

export function lowerQuality(tier: QualityTier): QualityTier {
  return tier === 'ultra' ? 'high' : tier === 'high' ? 'balanced' : 'low';
}
