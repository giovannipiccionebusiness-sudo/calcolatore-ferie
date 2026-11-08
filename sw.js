importScripts('./push-sw.js?v=82');

const PREFIX='ferie-facili-production-';
const CACHE=PREFIX+'20261108-drive-list-v114';
const FILES=['./presence-inline-core.js?v=112','./presence-draft-core.js?v=100','./notification-report.js?v=98','./notification-report-core.js?v=98','./supervisor.js?v=101','./presence-acquire-core.js?v=99','./week-changes.js?v=105','./week-changes-core.js?v=83','./week-changes.css?v=104','./daily-presence.js?v=86','./admin-shifts.js?v=82','./shift-core.js?v=82','./moduli/foglio-presenze.pdf','./moduli/richiesta-ferie-rol.pdf','./moduli/permessi-legge-104.pdf','./moduli/comunicazione-cambio-email.pdf','./presence-ui.js?v=112','./attendance-reader-core.js?v=75','./presence-core.js?v=100','./presence.css?v=112','./app-version.js?v=114','./version.json','./colleague-upload.js?v=69','./hour-budget-core.js?v=70','./hour-budget-ui.js?v=100','./workplaces.js?v=61','./camera-perspective.js?v=60','./leave-ui.js?v=57','./leave-core.js','./leave-parser.js?v=54','./vendor/decimal.js','./vendor/fflate.js','./account-menu.js?v=50','./notification-center.js?v=108','./push-notice-store.js?v=46','./push-open-notice.js?v=107','./admin-messages.js?v=106','./push-notifications.js?v=111','./push-sw.js?v=82','./icons/notification-badge.png?v=43','./live-camera.js?v=60','./live-camera.css?v=60','./live-detector.js?v=42','./admin-menu.js?v=103','./worker-menu.js?v=71','./install-app.js?v=44','./app-dialog.js?v=37','./pdf-scan.js?v=35','./multipage.js?v=66','./','./index.html','./app.js?v=114','./password-recovery.js?v=59','./archive.js?v=35','./auto-scan.js?v=35','./scanner-core.js?v=35','./edge-crop.js?v=35','./paper-clean.js?v=35','./upload-draft.js?v=35','./config.js','./manifest.webmanifest','./icons/logo-dussmann.png','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const url=new URL(e.request.url);
 if(e.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)));
});


































