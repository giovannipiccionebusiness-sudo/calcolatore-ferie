import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
// Read-only OCR/snapshot endpoint. Budget writes use an authenticated, atomic RPC after human review.
const WORKER='60d6c259-e421-474b-9c5c-cc1d641e32d5';
const URL=Deno.env.get('SUPABASE_URL')!,KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(URL,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const hash=async(data:ArrayBuffer|string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof data==='string'?new TextEncoder().encode(data):data)),x=>x.toString(16).padStart(2,'0')).join('');
async function request(url:string,init:RequestInit={}){return fetch(url,{...init,signal:AbortSignal.timeout(45000)});}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 try{
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer /i,'');
  // PILOT_AUTH
  const {data:auth,error:ae}=await db.auth.getUser(jwt);
  if(ae||!auth.user)return reply({error:'Accedi come amministratore'},401);
  const {data:profile,error:pe}=await db.from('profiles').select('role,active').eq('id',auth.user.id).single();
  if(pe||!profile?.active||profile.role!=='admin')return reply({error:'Solo amministratore'},403);
  // PILOT_AUTH_END
  const input=await req.json();
  if(input.action==='snapshot'){
   if(typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month))return reply({error:'Mese non valido'},400);
   const first=input.month+'-01',next=new Date(first+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const last=new Date(next.getTime()-86400000).toISOString().slice(0,10);
   const results=await Promise.all([
    db.from('profiles').select('id,full_name,site,workplace').eq('id',WORKER).single(),
    db.from('documents').select('id,worker_id,month,category,stage,week_ending,file_name,file_path,created_at,review_status').eq('worker_id',WORKER).eq('category','presenze').eq('month',input.month).in('stage',['weekly','replacement','final']).neq('review_status','rejected').order('created_at',{ascending:false}).limit(100),
    db.from('daily_presence').select('*').eq('worker_id',WORKER).gte('day',first).lte('day',last),
    db.from('worker_shifts').select('*').eq('worker_id',WORKER).order('valid_from',{ascending:false}),
    db.from('leave_people').select('person_key').eq('account_id',WORKER),
    db.from('hour_budget_registry').select('*').eq('account_id',WORKER)
   ]);
   if(results.some(r=>r.error))throw Error('Impossibile caricare il confronto');
   let registry=results[5].data?.[0]||null;
   if(!registry&&results[4].data?.length){const r=await db.from('hour_budget_registry').select('*').in('imported_person_key',results[4].data.map(p=>p.person_key));if(r.error)throw Error('Anagrafica budget non disponibile');registry=r.data?.[0]||null;}
   let records=[];if(registry){const r=await db.from('hour_budget_days').select('*').eq('person_key',registry.person_key).gte('day',first).lte('day',last);if(r.error)throw Error('Budget non disponibile');records=r.data||[];}
   return reply({worker:results[0].data,documents:results[1].data,declarations:results[2].data,shifts:results[3].data,registry,records});
  }
  const {documentId,imageBase64,sourceDay}=input;
  if(imageBase64!==undefined&&(typeof imageBase64!=='string'||imageBase64.length>2800000||!Number.isInteger(sourceDay)||sourceDay<1||sourceDay>31))return reply({error:'Ritaglio non valido'},400);
  if(typeof documentId!=='string'||! /^[0-9a-f-]{36}$/i.test(documentId))return reply({error:'Documento non valido'},400);
  const {data:doc,error:de}=await db.from('documents').select('id,worker_id,category,stage,month,week_ending').eq('id',documentId).eq('worker_id',WORKER).eq('category','presenze').single();
  if(de||!doc||!['weekly','replacement','final'].includes(doc.stage))return reply({error:'Documento non incluso nella prova'},404);
  const {data:job,error:je}=await db.from('drive_archive_jobs').select('google_file_id,sha256').eq('document_id',doc.id).eq('status','archived').single();
  if(je||!job?.google_file_id||!job.sha256)return reply({error:'Originale archiviato non disponibile'},409);
  const {data:credentials,error:ce}=await db.from('drive_credentials').select('refresh_token').eq('singleton',true).single();
  if(ce||!credentials?.refresh_token)throw Error('Collegamento Drive non disponibile');
  const token=await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:Deno.env.get('GOOGLE_DRIVE_CLIENT_ID')!.trim(),client_secret:Deno.env.get('GOOGLE_DRIVE_CLIENT_SECRET')!.trim(),refresh_token:credentials.refresh_token,grant_type:'refresh_token'})});
  if(!token.ok)throw Error('Rinnovo accesso Drive non riuscito');
  const access=(await token.json()).access_token,headers={Authorization:'Bearer '+access};
  const original=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(job.google_file_id)+'?alt=media',{headers});
  if(!original.ok)throw Error('Lettura originale Drive non riuscita');
  let bytes=await original.arrayBuffer();
  if(bytes.byteLength>12582912||await hash(bytes)!==job.sha256)throw Error('Verifica originale non riuscita');
  let mime=original.headers.get('content-type')?.split(';')[0]||'';
  if(imageBase64!==undefined){
   const decoded=Uint8Array.from(atob(imageBase64),c=>c.charCodeAt(0));
   if(decoded.length<8||decoded[0]!==137||decoded[1]!==80||decoded[2]!==78||decoded[3]!==71)return reply({error:'Ritaglio PNG richiesto'},400);
   bytes=decoded.buffer;mime='image/png';
  }
  if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(mime))throw Error('Formato non supportato');
  const boundary='ocr_'+crypto.randomUUID();
  const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:'TEST_OCR_PRESENZE_'+doc.id,mimeType:'application/vnd.google-apps.document'})+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n',bytes,'\r\n--'+boundary+'--']);
  const converted=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=it&fields=id',{method:'POST',headers:{...headers,'Content-Type':'multipart/related; boundary='+boundary},body});
  if(!converted.ok)throw Error('Conversione OCR Google Drive non riuscita (HTTP '+converted.status+')');
  const temp=(await converted.json()).id;
  let text='',cleanupOk=false;
  try{
   const exported=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(temp)+'/export?mimeType=text%2Fplain',{headers});
   if(!exported.ok)throw Error('Esportazione testo OCR non riuscita');
   text=await exported.text();
   if(text.length>150000)throw Error('Testo OCR troppo lungo');
  }finally{
   const cleanup=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(temp),{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
   cleanupOk=cleanup.ok;
  }
  return reply({mode:'preview_only',inputMode:imageBase64===undefined?'original':'unverified_crop',sourceDay:imageBase64===undefined?null:sourceDay,dayVerified:false,workerId:WORKER,document:doc,text,cleanupOk,...(!cleanupOk?{temporaryFileId:temp}:{})});
 }catch(e){return reply({error:e instanceof Error?e.message:'Prova non riuscita'},500);}
});
