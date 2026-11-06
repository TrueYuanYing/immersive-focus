import { expect, it } from 'vitest';
import { initialQuality, renderProfile } from '../src/quality';

it('keeps high-density rendering sharp without exceeding GPU samples or pixel budgets', () => {
  const high=renderProfile('high',1440,900,2,4);
  expect(high.ratio).toBe(2);
  expect(high.samples).toBe(4);
  expect(renderProfile('balanced',1440,900,2,4).ratio).toBeLessThan(high.ratio);
  const large=renderProfile('high',3840,2160,3,2);
  expect(large.ratio**2*3840*2160).toBeLessThanOrEqual(8500001);
  expect(large.samples).toBe(2);
  expect(initialQuality(2,4,true)).toBe('low');
  expect(initialQuality(8,12,false)).toBe('high');
  const mobile=renderProfile('high',2880,1800,2,4,true);
  expect(mobile.ratio**2*2880*1800).toBeLessThanOrEqual(3200001);
  expect(mobile.bloom).toBe(false);
  expect(mobile.samples).toBe(0);
});
