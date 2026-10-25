importScripts('./push-sw.js?v=46');

const PREFIX='ferie-facili-production-';
const CACHE=PREFIX+'20261025-v46';
const FILES=['./push-notice-store.js?v=46','./push-open-notice.js?v=46','./admin-messages.js?v=46','./push-notifications.js?v=46','./push-sw.js?v=46','./icons/notification-badge.png?v=43','./live-camera.js?v=42','./live-camera.css?v=42','./live-detector.js?v=42','./admin-menu.js?v=35','./worker-menu.js?v=35','./install-app.js?v=44','./app-dialog.js?v=37','./pdf-scan.js?v=35','./multipage.js?v=35','./worker-guide.js?v=35','./','./index.html','./app.js?v=46','./archive.js?v=35','./auto-scan.js?v=35','./scanner-core.js?v=35','./edge-crop.js?v=35','./paper-clean.js?v=35','./upload-draft.js?v=35','./config.js','./manifest.webmanifest','./icons/logo-dussmann.png','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});











