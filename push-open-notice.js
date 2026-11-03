import './push-notice-store.js?v=46';
import {appNotice} from './app-dialog.js?v=37';
export function setupOpenedPushNotice(ready,{onOpenNotice=async()=>false}={}){
 let pending=null,opening=false;
 const url=new URL(location.href),id=url.searchParams.get('avviso');if(id){pending={id};url.searchParams.delete('avviso');history.replaceState(history.state,'',url.href);}
 async function show(){
  if(opening||!pending||document.visibilityState==='hidden')return;
  if(document.querySelector('dialog[open]')){setTimeout(show,500);return;}
  opening=true;const next=pending;pending=null;let notice=next.notice;
  try{if(next.id&&next.id!=='notifica')notice=await LavoroPushNoticeStore.take(new URL('./',location.href).href,next.id);}catch{}
  try{const handled=await onOpenNotice(notice);if(handled==='pending'){pending={notice};return;}if(!handled)appNotice(notice?.body||'Hai un aggiornamento o un promemoria. Accedi alla tua area personale per consultarlo.',notice?.title||'🔔 Avviso di Lavoro Facile');document.dispatchEvent(new CustomEvent('push-notice-opened',{detail:{eventKey:notice?.eventKey}}));}catch(e){appNotice(e.message||'Impossibile aprire la notifica.','Presenze da verificare');}finally{opening=false;}

 }
 const initialized=ready.then(show);
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type!=='OPEN_PUSH_NOTICE')return;pending={id:event.data.id,notice:event.data.notice};initialized.then(show);});
 document.addEventListener('visibilitychange',()=>initialized.then(show));document.addEventListener('app-session-ready',()=>initialized.then(show));
}


