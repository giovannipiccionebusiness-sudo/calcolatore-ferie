importScripts('./push-notice-store.js?v=46');
const fallbackNotice={title:'Lavoro Facile',body:'Hai un aggiornamento o un promemoria. Apri l’app per consultarlo.'};
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const notice={title:typeof data.title==='string'?data.title.slice(0,100):fallbackNotice.title,eventKey:typeof data.eventKey==='string'?data.eventKey:null,body:typeof data.body==='string'?data.body.slice(0,600):fallbackNotice.body};
 event.waitUntil(Promise.all([self.clients.matchAll({type:'window'}).then(clients=>clients.forEach(c=>c.postMessage({type:'PUSH_NOTICE_RECEIVED'}))),self.registration.showNotification(notice.title,{body:notice.body,icon:new URL('./icons/icon-192.png',self.registration.scope).href,badge:new URL('./icons/notification-badge.png?v=43',self.registration.scope).href,tag:'lavoro-facile-'+String(data.id||'generic'),data:notice})]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=self.registration.scope;
 event.waitUntil((async()=>{
  const id=crypto.randomUUID(),notice={id,eventKey:event.notification.data?.eventKey,title:event.notification.title||fallbackNotice.title,body:event.notification.body||fallbackNotice.body};
  let saved=false;try{await LavoroPushNoticeStore.put(target,notice);saved=true;}catch{}
  const existing=(await self.clients.matchAll({type:'window',includeUncontrolled:true})).find(c=>c.url.startsWith(target));
  if(existing){existing.postMessage({type:'OPEN_PUSH_NOTICE',id:saved?id:null,notice:saved?null:notice});return existing.focus();}
  const url=new URL(target);url.searchParams.set('avviso',saved?id:'notifica');return self.clients.openWindow(url.href);
 })());
});

