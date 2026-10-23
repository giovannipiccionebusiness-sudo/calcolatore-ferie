let active=false;
export function appConfirm(message){
 if(active)return Promise.resolve(false);active=true;
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='app-confirm';dialog.setAttribute('aria-labelledby','appConfirmTitle');dialog.setAttribute('aria-describedby','appConfirmMessage');
  const header=document.createElement('div');header.className='app-confirm-brand';const image=document.createElement('img');image.src='./icons/icon-192.png';image.alt='';image.width=48;image.height=48;const title=document.createElement('h2');title.id='appConfirmTitle';title.textContent='Lavoro Facile';header.append(image,title);
  const text=document.createElement('p');text.id='appConfirmMessage';text.textContent=message;const controls=document.createElement('div');controls.className='app-confirm-actions';
  const cancel=document.createElement('button'),accept=document.createElement('button');cancel.type=accept.type='button';cancel.textContent='Annulla';accept.textContent='Continua';controls.append(cancel,accept);dialog.append(header,text,controls);
  let settled=false;const finish=value=>{if(settled)return;settled=true;active=false;if(dialog.open)dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value);};cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});dialog.addEventListener('close',()=>finish(false));
  document.body.append(dialog);dialog.showModal();cancel.focus();
 });
}



export function appNotice(message){
 const existing=document.getElementById('appNotice');
 if(existing){existing.querySelector('p').textContent=message;return;}
 const previous=document.activeElement,dialog=document.createElement('dialog');
 dialog.id='appNotice';dialog.className='app-confirm';dialog.setAttribute('aria-labelledby','appNoticeTitle');dialog.setAttribute('aria-describedby','appNoticeMessage');
 const header=document.createElement('div');header.className='app-confirm-brand';
 const image=document.createElement('img');image.src='./icons/icon-192.png';image.alt='';image.width=image.height=48;
 const title=document.createElement('h2');title.id='appNoticeTitle';title.textContent='Riprova più tardi';header.append(image,title);
 const text=document.createElement('p');text.id='appNoticeMessage';text.textContent=message;
 const controls=document.createElement('div');controls.className='app-confirm-actions';
 const close=document.createElement('button');close.type='button';close.textContent='Ho capito';controls.append(close);
 dialog.append(header,text,controls);
 const finish=()=>{if(dialog.open)dialog.close();dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});};
 close.onclick=finish;dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});dialog.addEventListener('close',finish,{once:true});
 document.body.append(dialog);dialog.showModal();close.focus();
}
