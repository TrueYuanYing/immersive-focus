import { expect, it } from 'vitest';
import { renderProfile } from '../src/quality';
it('offers a distinct native-density ultra preset on touch hardware within GPU limits',()=>{
 const p=renderProfile('ultra',1440,900,3,2,true);
 const limited=renderProfile('ultra',1440,900,3,2,true,2048);
 expect(p.ratio).toBeGreaterThan(renderProfile('high',1440,900,3,2,true).ratio);
 expect(limited.ratio*1440).toBeLessThanOrEqual(2048);
 expect(p.samples).toBe(2);expect(limited.shadow).toBeLessThanOrEqual(2048);
 expect(p.bloom).toBe(true);
 const large=renderProfile('ultra',3840,2160,4,4,true,4096);
 expect(large.ratio**2*3840*2160).toBeLessThanOrEqual(12582913);
 expect(renderProfile('ultra',393,873,3,4,true).ratio).toBe(3);
});
