import {describe,it,expect} from 'vitest';
import {validateSettings} from '../src/settings';
import {defaultMix,soundPresets} from '../src/sound-mix';
import {SessionStore} from '../src/session';
describe('独立音景与旧记录',()=>{
  it('旧设置获得默认混音，不共享嵌套对象',()=>{const a=validateSettings({volume:.3,weather:'rain'}),b=validateSettings({});expect(a.soundMix).toEqual(defaultMix);a.soundMix.ocean=0;expect(b.soundMix.ocean).toBe(.65);expect(a.volume).toBe(.3);});
  it('每路可完全关闭，拒绝坏值但保留其他声部',()=>{const s=validateSettings({soundMix:{rain:0,brown:.8,white:NaN,ocean:4,wind:'0.1'}});expect(s.soundMix).toMatchObject({rain:0,brown:.8,white:0,ocean:.65,wind:.2});});
  it('预设与自定义在刷新后完整保留，声音改动不改变航程',()=>{const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};const s=new SessionStore(storage,()=>1000);s.create(25);s.configure({soundMix:{...soundPresets.deep.mix,rain:.27}});const next=new SessionStore(storage,()=>1000);expect(next.settings.soundMix).toEqual({...soundPresets.deep.mix,rain:.27});expect(next.active?.id).toBe(s.active?.id);expect(next.elapsed()).toBe(0);});
});
