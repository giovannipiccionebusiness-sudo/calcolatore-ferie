
const PREFIX='ferie-facili-production-';
const CACHE=PREFIX+'20261021-v24';
const FILES=['./pdf-scan.js?v=23','./multipage.js?v=22','./worker-guide.js?v=21','./','./index.html','./app.js?v=24','./archive.js?v=19','./auto-scan.js?v=23','./scanner-core.js?v=19','./edge-crop.js?v=19','./paper-clean.js?v=19','./upload-draft.js?v=20261021','./config.js','./manifest.webmanifest','./icons/logo-dussmann.png','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(PREFIX)||/^ferie-facili-v\d+$/.test(k))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});






