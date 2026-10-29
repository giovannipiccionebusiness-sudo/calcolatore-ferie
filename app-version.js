// Display the running code version, and update only after an explicit user action.
export const APP_VERSION=68;
export function installVersionControls(){
 const host=document.createElement('div');host.className='app-version-controls';
 const label=document.createElement('span');label.textContent='Versione '+APP_VERSION;
 const button=document.createElement('button');button.type='button';button.textContent='Aggiorna app';
 const notice=document.createElement('span');notice.setAttribute('role','status');
 host.append(label,button,notice);document.querySelector('.brand')?.after(host);
 const style=document.createElement('style');style.textContent='.app-version-controls{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;margin:0 0 14px;color:#607780;font:12px system-ui}.app-version-controls button{border:0;background:transparent;color:#075d52;text-decoration:underline;min-height:36px;cursor:pointer;font:inherit}.app-version-controls [role=status]{flex-basis:100%}';document.head.append(style);
 let latest=APP_VERSION;
 async function check(){if(document.visibilityState==='hidden')return;try{const r=await fetch('./version.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return;const data=await r.json();if(Number.isInteger(data.version)&&data.version>APP_VERSION){latest=data.version;notice.textContent='È disponibile la versione '+latest+'. Salva le modifiche e premi Aggiorna app.';}}catch{/* An offline check must not interrupt work. */}}
 button.onclick=async()=>{
  if(!confirm('Hai salvato le modifiche ai moduli? L’app verrà ricaricata. I dati già salvati e i documenti conservati nelle bozze non vengono cancellati.'))return;
  button.disabled=true;notice.textContent='Aggiornamento dell’app…';
  try{const registration=await navigator.serviceWorker?.getRegistration();await registration?.update();}catch{/* A network reload is still useful if the worker update times out. */}
  const url=new URL(location.href);url.searchParams.set('versione',String(latest));location.replace(url.href);
 };
 document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);check();
}
installVersionControls();
