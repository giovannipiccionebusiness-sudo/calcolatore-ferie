// Updates are offered only when newer code is available; work is never reloaded automatically.
export const APP_VERSION=73;
export const APP_VERSION_LABEL='7.3';
export function installVersionControls(){
 const footer=document.createElement('footer');footer.className='app-version-footer';footer.textContent='Lavoro Facile · Versione '+APP_VERSION_LABEL;
 (document.querySelector('main')||document.body).append(footer);
 const style=document.createElement('style');style.textContent='.app-version-footer{text-align:center;margin:24px 0 8px;color:#72827f;font:12px system-ui}.app-update-dialog{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:85dvh;overflow:auto;padding:24px;border:0;border-radius:22px;background:#fff;color:#173f3a;box-shadow:0 18px 60px #0004}.app-update-dialog::backdrop{background:#102d3299}.app-update-dialog h2{font-size:22px;margin:0 0 14px}.app-update-dialog p{line-height:1.5}.app-update-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.app-update-actions button{flex:1;min-height:46px;padding:12px;border:1px solid #badbd2;border-radius:12px;background:#eff9f6;color:#075d52;font:inherit;font-weight:700;cursor:pointer}.app-update-actions button:last-child{background:#087e71;color:#fff}';document.head.append(style);
 let latest=APP_VERSION,dismissed=APP_VERSION,dialog=null,checking=false;
 function offer(){
  if(latest<=APP_VERSION||latest<=dismissed||dialog||document.visibilityState==='hidden'||document.querySelector('dialog[open]'))return;
  const previous=document.activeElement,offered=latest;dialog=document.createElement('dialog');dialog.className='app-update-dialog';dialog.setAttribute('aria-labelledby','appUpdateTitle');
  const title=document.createElement('h2');title.id='appUpdateTitle';title.textContent='È disponibile un aggiornamento';
  const text=document.createElement('p');text.textContent='Salva le modifiche ai moduli prima di aggiornare. I dati già salvati e le bozze dei documenti vengono conservati.';
  const status=document.createElement('p');status.setAttribute('role','status');const actions=document.createElement('div'),later=document.createElement('button'),update=document.createElement('button');actions.className='app-update-actions';later.type=update.type='button';later.textContent='Più tardi';update.textContent='Aggiorna ora';
  let updating=false;
  function close(){if(updating)return;dismissed=Math.max(dismissed,offered);const current=dialog;dialog=null;if(current?.open)current.close();current?.remove();if(previous?.isConnected)previous.focus({preventScroll:true});}
  later.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  update.onclick=async()=>{
   if(updating)return;updating=true;later.disabled=update.disabled=true;status.textContent='Aggiornamento dell’app…';
   try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();}catch{/* Reload the current release even if the worker check fails. */}
   const url=new URL(location.href);url.searchParams.set('versione',String(latest));location.replace(url.href);
  };
  actions.append(later,update);dialog.append(title,text,status,actions);document.body.append(dialog);dialog.showModal();later.focus();
 }
 async function check(){if(checking||document.visibilityState==='hidden')return;checking=true;try{const r=await fetch('./version.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){const data=await r.json();if(Number.isInteger(data.version)&&data.version>latest)latest=data.version;}offer();}catch{/* Offline checks must not interrupt work. */}finally{checking=false;}}
 document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);document.addEventListener('close',offer,true);navigator.serviceWorker?.addEventListener('controllerchange',check);check();
 return {check};
}
export const versionControls=installVersionControls();
