export const soundLabels={ocean:'海浪',wind:'海风',rain:'细雨',engine:'船机低鸣',birds:'远处海鸟',desk:'纸笔与茶杯',stream:'溪流',fire:'炉火',white:'白噪音',brown:'棕噪音'} as const;
export type SoundChannel=keyof typeof soundLabels;
export type SoundMix=Record<SoundChannel,number>;
export const defaultMix:SoundMix={ocean:.65,wind:.2,rain:0,engine:.22,birds:.3,desk:.4,stream:0,fire:0,white:0,brown:0};
const quiet:SoundMix={ocean:0,wind:0,rain:0,engine:0,birds:0,desk:0,stream:0,fire:0,white:0,brown:0};
export const soundPresets={reading:{label:'海风阅读',mix:{...defaultMix}},deep:{label:'深度自习',mix:{...quiet,ocean:.18,brown:.55}},rainy:{label:'雨夜书桌',mix:{...quiet,rain:.68,desk:.28,fire:.2}},stream:{label:'林间小憩',mix:{...quiet,stream:.65,wind:.14}},noise:{label:'纯净白噪',mix:{...quiet,white:.48}}};
export function validateMix(raw:unknown):SoundMix{
  const out={...defaultMix};if(!raw||typeof raw!=='object')return out;
  for(const key of Object.keys(out) as SoundChannel[]){const v=(raw as Record<string,unknown>)[key];if(typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)out[key]=v;}
  return out;
}
