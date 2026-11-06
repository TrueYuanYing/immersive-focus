import {HaijianApp} from './app';
import {connectIkoHost} from '../../shared/iko-host';
import {CursorMotes} from '../../shared/pointer-trail';
const cursor=new CursorMotes('#d8c69d');
const app=new HaijianApp(document.querySelector<HTMLElement>('#app')!,{seed:Number(new URLSearchParams(location.search).get('seed')??911)});
connectIkoHost('haijian',['haijian.v1','haijian.v1.recovery'],{
  pause(){app.suspendForHost();},
  background(){app.pause();},
  preserveOnPageHide:true,
  visibility(hidden){cursor.setEnabled(!hidden);app.world?.visibility(hidden);void app.audio.visibility(hidden);},
  dispose(){cursor.dispose();app.dispose();},
  snapshot(){return {active:app.session.active,records:app.session.tickets};}
});
await app.start();
Object.defineProperty(window,'haijianDiagnostics',{value:()=>({...app.diagnostics(),cursor:cursor.diagnostics()})});
if(import.meta.env.DEV&&new URLSearchParams(location.search).has('dev'))Object.assign(window,{__haijian:app});
if(import.meta.hot)import.meta.hot.dispose(()=>app.dispose());
