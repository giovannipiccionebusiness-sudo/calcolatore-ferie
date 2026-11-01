import {localToday,calendarWeek} from './week-changes-core.js?v=82';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,fn,outline=false)=>{const b=el('button',text,'doc-button'+(outline?' outline':''));b.type='button';b.onclick=fn;return b;};
export function createDailyPresence({getClient,getSession,getProfile,weekChanges,onError=()=>{},onNoticeRefresh=()=>{}}){
 let panel=null,bell=null,inbox=null,user=null,epoch=0,notes=[],loading=false,pending=null,opening=false;
 const allowed=()=>!!getSession()&&getProfile()?.active&&getProfile().role==='worker';
 function clear(){epoch++;user=null;panel?.remove();panel=null;bell?.remove();bell=null;inbox?.close();inbox=null;notes=[];loading=false;}
 async function openTarget(day,mode='day',id=null){
  if(!allowed()){pending={day,mode,id};return;}if(opening)return;opening=true;const owner=getSession().user.id;
  try{calendarWeek(day);inbox?.close();await (mode==='week'?weekChanges.openWeek(day):weekChanges.openDay(day));if(id&&owner===getSession()?.user.id){const r=await getClient().rpc('read_daily_notice',{p_id:id});if(r.error)throw r.error;}await refresh();}catch(e){onError(e);}finally{opening=false;}
 }
 function deepLink(){const q=new URL(location.href);if(!q.searchParams.has('presenze'))return;const day=q.searchParams.get('presenze'),mode=q.searchParams.get('vista')==='week'?'week':'day';try{calendarWeek(day);pending={day,mode,id:null};}catch{}q.searchParams.delete('presenze');q.searchParams.delete('vista');history.replaceState(null,'',q);}
 if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OPEN_DAILY_PRESENCE'){const {day,mode,noticeId}=e.data;try{calendarWeek(day);pending={day,mode:mode==='week'?'week':'day',id:noticeId};if(allowed()){const target=pending;pending=null;openTarget(target.day,target.mode,target.id);}}catch{}}else if(e.data?.type==='DAILY_NOTICE_RECEIVED')refresh();});
 deepLink();
 async function refresh(){
  if(!allowed()){clear();return;}if(loading)return;loading=true;const owner=getSession().user.id,token=epoch;
  try{
   const [nr,dr]=await Promise.all([getClient().from('daily_notices').select('*').eq('worker_id',owner).order('created_at',{ascending:false}).limit(30),getClient().from('daily_presence').select('*').eq('worker_id',owner).eq('day',localToday()).maybeSingle()]);if(nr.error||dr.error)throw nr.error||dr.error;if(token!==epoch||owner!==getSession()?.user.id||!allowed())return;
   user=owner;notes=nr.data||[];await onNoticeRefresh();if(token!==epoch||owner!==getSession()?.user.id||!allowed())return;
   if(panel){panel.querySelector('.dp-today-state').textContent=dr.data?'✓ Oggi già compilato · puoi correggerlo':'Puoi salvare anche prima di caricare il foglio.';panel.querySelector('input[type=date]').max=localToday();return;}panel=el('section',null,'card dp-panel');panel.append(el('h3','📝 Le presenze, giorno per giorno'),el('p','Indica ore in più e assenze: il venerdì le ritrovi già compilate.','wc-intro'));
   const status=el('p',dr.data?'✓ Oggi già compilato · puoi correggerlo':'Puoi salvare anche prima di caricare il foglio.','dp-today-state'),dayLabel=el('label','Giorno da compilare'),dayInput=el('input');dayInput.type='date';dayInput.value=localToday();dayInput.max=localToday();dayInput.className='doc-input';dayInput.setAttribute('aria-label','Giorno da compilare');dayLabel.append(dayInput);const actions=el('div',null,'doc-toolbar');actions.append(btn('Compila giornata',()=>openTarget(dayInput.value)),btn('Riepilogo settimana',()=>openTarget(dayInput.value,'week'),true));panel.append(status,dayLabel,actions);
   panel.append(el('small','Il promemoria è impostato dal responsabile: arriva 30 minuti prima della fine dell’ultima fascia di lavoro. Per riceverlo sul telefono, consenti gli avvisi dell’app.'));document.getElementById('workerArea').prepend(panel);
  }catch(e){onError(e);}finally{loading=false;if(pending&&allowed()){const target=pending;pending=null;openTarget(target.day,target.mode,target.id);}}
 }
 function invalidate(){panel?.remove();panel=null;return refresh();}
 const timer=setInterval(()=>{if(allowed()&&document.visibilityState==='visible')refresh();},60000);window.addEventListener('focus',()=>{if(allowed())refresh();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&allowed())refresh();});
 return {refresh,clear,invalidate,openNotice:async(day,mode='day')=>{const owner=getSession()?.user.id;if(!allowed()){pending={day,mode,id:null};return;}const r=await getClient().from('daily_notices').select('id').eq('worker_id',owner).eq('day',day).eq('kind',mode==='week'?'week':'day').maybeSingle();if(r.error)throw r.error;if(owner!==getSession()?.user.id)return;return openTarget(day,mode,r.data?.id||null);}};
}
