// Run with linkedom 0.18.12 and @napi-rs/canvas available in NODE_PATH.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require('linkedom'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const {window}=parseHTML('<html><head></head><body><div id="adminOperations"></div></body></html>'),{document}=window;
const create=document.createElement.bind(document),canvases=new WeakMap();
Object.defineProperty(window.HTMLSelectElement.prototype,'value',{get(){return this.querySelector('option[selected]')?.getAttribute('value')??this.querySelector('option')?.getAttribute('value')??'';},set(v){for(const o of this.querySelectorAll('option')){if(o.getAttribute('value')===String(v))o.setAttribute('selected','');else o.removeAttribute('selected');}},configurable:true});
document.createElement=(t)=>{const n=create(t);if(t==='canvas'){const c=createCanvas(300,150);canvases.set(n,c);Object.defineProperties(n,{width:{get:()=>c.width,set:v=>c.width=v},height:{get:()=>c.height,set:v=>c.height=v}});n.getContext=()=>{const ctx=c.getContext('2d');if(!ctx.patched){const draw=ctx.drawImage.bind(ctx);ctx.drawImage=(s,...args)=>draw(canvases.get(s)||s.nativeImage||s,...args);ctx.patched=true;}return ctx;};n.toDataURL=(...a)=>c.toDataURL(...a);n.toBlob=fn=>fn(new Blob([c.toBuffer('image/png')],{type:'image/png'}));}return n;};
const sheet=createCanvas(1273,1800),ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1273,1800);ctx.fillStyle='#000';ctx.fillRect(159,470,990,2);ctx.fillRect(220,497,530,2);for(let i=0;i<32;i++)ctx.fillRect(159,Math.round(524+i*27.1),990,2);
const doc={id:'sheet',worker_id:'60d6c259-e421-474b-9c5c-cc1d641e32d5',month:'2026-11',stage:'weekly',week_ending:'2026-11-13',file_name:'synthetic.png',created_at:'2026-11-13T12:00:00Z'};
let snapshot={worker:{full_name:'Lavoratore di prova',workplace:'Tribunale Minori Taranto'},documents:[doc],declarations:[],records:[],registry:{person_key:'test'},shifts:[{valid_from:'2026-11-02',version:1,schedule:Array.from({length:7},(_,i)=>i<5?[{start:'14:00',end:'18:00'}]:[])}]},writes=[],previews=0,session={user:{id:'admin'},access_token:'fixture'};
const client={rpc:async(name,p)=>{writes.push({name,p});const r={person_key:'test',day:p.p_day,version:1,allocations:[{workplace:p.p_values.workplace,ordinary:p.p_values.ordinary,overtime:p.p_values.extra}],absence_minutes:p.p_values.absence,justification:p.p_values.cause};snapshot.records.push(r);return {data:r};}};
const sandbox={document,window,console,Blob,Response,URL,Date,Math,Intl,Number,String,Map,Set,Uint8ClampedArray,Float32Array,Error,Array,Object,RegExp,AbortSignal,CustomEvent:window.CustomEvent,setInterval:()=>0,
 Option:function(t,v){const o=create('option');o.setAttribute('value',v);o.textContent=t;return o;},
 createImageBitmap:async blob=>{const nativeImage=await loadImage(Buffer.from(await blob.arrayBuffer()));return {nativeImage,width:nativeImage.width,height:nativeImage.height,close(){}};},
 SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture',N153_WORKPLACES:['Tribunale Minori Taranto'],
 downloadDocument:async()=>new Blob([sheet.toBuffer('image/png')],{type:'image/png'}),
 appConfirm:async()=>true,showDocument:async()=>{previews++;return {open:true,close(){this.open=false;},addEventListener(){}};},
 fetch:async(url,init)=>{assert.match(url,/fixture.invalid/);const b=JSON.parse(init.body);return new Response(JSON.stringify(b.action==='snapshot'?snapshot:{text:'NOTE:\nFERIE',cleanupOk:true}),{status:200});}};
vm.createContext(sandbox);for(const f of ['drive-ocr-core.js','drive-ocr-ui.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/^import .*;$/mg,'').replace(/\bexport /g,''),sandbox,{filename:f});
const getButton=(root,text)=>[...root.querySelectorAll('button')].find(n=>n.textContent===text);
(async()=>{const pilot=sandbox.createDriveOcrPilot({getClient:()=>client,getSession:()=>session,getProfile:()=>({active:true,role:'admin'})});pilot.refresh();await pilot.openDocument(doc);
assert.match(document.querySelector('.ocr-status').textContent,/Griglia trovata/);assert.equal(writes.length,0);
await getButton(document,'Ingrandisci griglia').onclick();assert.equal(previews,1);
const gridCheck=[...document.querySelectorAll('.ocr-check input')].find(n=>n.parentElement.textContent.includes('corrispondenza'));gridCheck.checked=true;gridCheck.onchange();const rows=document.querySelectorAll('.ocr-row');assert.equal(rows.length,5);const row=rows[4];assert.match(row.querySelector('h3').textContent,/13\/11\/2026/);
await getButton(row,'Conferma valori nel budget').onclick();assert.equal(writes.length,0);
await getButton(row,'Leggi questa riga').onclick();assert.equal(writes.length,0);const inputs=row.querySelectorAll('.ocr-fields input');assert.equal(inputs[0].value,'0:00');assert.equal(inputs[2].value,'4:00');assert.equal(row.querySelector('select').value,'F');
const verified=row.querySelector('.ocr-check input');verified.checked=true;await getButton(row,'Conferma valori nel budget').onclick();assert.equal(writes.length,1);assert.equal(writes[0].p.p_values.absence,240);assert.equal(writes[0].p.p_day,'2026-11-13');
session=null;pilot.refresh();assert.equal(document.querySelectorAll('.ocr-row').length,0);assert.equal(document.querySelector('#driveOcrPilot').hidden,true);
console.log('OK: grid review, 5 correct dates, zoom, OCR without writes, confirmation-only save and logout cleanup.');})().catch(e=>{console.error(e);process.exitCode=1;});
