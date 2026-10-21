
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
const SUPABASE_ENDPOINT=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")?.trim();
const SECRET=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")?.trim();
const APP="https://giovannipiccionebusiness-sudo.github.io";
const db=createClient(SUPABASE_ENDPOINT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":APP,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json","Cache-Control":"no-store"}});
function must<T extends {error:unknown;data:unknown}>(r:T):T["data"]{if(r.error)throw new Error("Database operation failed");return r.data;}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const digest=async(s:string|ArrayBuffer)=>hex(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s));
async function request(url:string,init:RequestInit={}){return await fetch(url,{...init,signal:AbortSignal.timeout(20000)});}
function googleTokenError(code:string,status:number){
 const messages:Record<string,string>={
  invalid_client:"Google: invalid_client. ID client e client secret non corrispondono, oppure il segreto non è valido. Verifica i due Secrets Supabase usando lo stesso client Google.",
  invalid_grant:"Google: invalid_grant. Codice scaduto, già utilizzato o verifica PKCE non riuscita. Torna all’app e avvia nuovamente Collega Google Drive.",
  redirect_uri_mismatch:"Google: redirect_uri_mismatch. Registra esattamente la callback indicata nell’app nel client OAuth Google.",
  unauthorized_client:"Google: unauthorized_client. Verifica che il client OAuth sia di tipo Applicazione web e autorizzato per questo flusso.",
  invalid_request:"Google: invalid_request. La richiesta OAuth non è stata accettata; occorre verificare la configurazione."
 };
 return messages[code]||"Google token exchange failed (HTTP "+status+"). Riavvia il collegamento dall’app.";
}
async function token(body:Record<string,string>){
 if(!CLIENT||!SECRET)throw new Error("OAuth credentials missing");
 const r=await request("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({...body,client_id:CLIENT,client_secret:SECRET})});
 if(!r.ok){
  const failure=await r.json().catch(()=>({}));
  // Only fixed messages leave the backend: never return Google's raw response or request.
  throw new Error(googleTokenError(typeof failure.error==="string"?failure.error:"",r.status));
 }
 return await r.json();
}
async function admin(req:Request){
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer /,"");
 const result=await db.auth.getUser(jwt);
 if(result.error||!result.data.user)throw new Error("Unauthorized");
 const p=must(await db.from("profiles").select("id,role,active").eq("id",result.data.user.id).single()) as any;
 if(!p.active||p.role!=="admin")throw new Error("Unauthorized");
 // Decode only after getUser has validated the JWT signature.
 const claims=JSON.parse(atob(jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
 if(!claims.session_id||!must(await db.rpc("drive_session_active",{p_admin:p.id,p_session:claims.session_id})))throw new Error("Unauthorized");
 return {id:p.id,session:claims.session_id};
}
async function api(access:string,path:string,init:RequestInit={}){
 const r=await request("https://www.googleapis.com/drive/v3/"+path,{...init,headers:{Authorization:"Bearer "+access,...init.headers}});
 if(!r.ok)throw new Error("Drive HTTP "+r.status);
 return await r.json();
}
async function allocated(access:string){return (await api(access,"files/generateIds?count=1&space=drive&type=files")).ids[0];}
async function metadata(access:string,id:string){
 const r=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(id)+"?fields=id,trashed,size,appProperties,parents,mimeType",{headers:{Authorization:"Bearer "+access}});
 if(r.status===404)return null;
 if(!r.ok)throw new Error("Drive metadata HTTP "+r.status);
 const m=await r.json();if(m.trashed)throw new Error("Drive object is in Trash");return m;
}
async function rawMeta(access:string,id:string){
 const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,trashed,size,appProperties,parents',{headers:{Authorization:'Bearer '+access}});
 if(r.status===404)return null;if(!r.ok)throw Error('Drive metadata HTTP '+r.status);return await r.json();
}
async function verifyBytes(access:string,id:string,hash:string){const r=await request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?alt=media',{headers:{Authorization:'Bearer '+access}});if(!r.ok||await digest(await r.arrayBuffer())!==hash)throw Error('Drive readback failed');}
async function guard(id:string,lease:string){if(!must(await db.rpc('document_scan_guard',{p_document:id,p_lease:lease})))throw Error('Scansione aggiornata o processo scaduto');}
async function processScan(){
 const connection=must(await db.from('drive_credentials').select('*').eq('singleton',true).maybeSingle()) as any;if(!connection)return {waiting:true};
 const owner=must(await db.from('profiles').select('active,role').eq('id',connection.admin_id).single()) as any;if(!owner.active||owner.role!=='admin')throw Error('Drive administrator disabled');
 const claim=must(await db.rpc('document_scan_claim')) as any;if(!claim)return {waiting:true};const {lease,job}=claim;let done=false;
 try{
  const access=(await token({refresh_token:connection.refresh_token,grant_type:'refresh_token'})).access_token;
  const d=must(await db.from('documents').select('*').eq('id',job.document_id).single()) as any;
  const scan=must(await db.from('test_document_scans').select('*').eq('document_id',d.id).single()) as any;
  if(d.category==='presenze'||scan.source_path!==d.file_path||scan.file_path!==job.scan_path||scan.algorithm_version!==job.algorithm_version)throw Error('Document/scan mismatch');
  await guard(d.id,lease);
  const original=must(await db.from('drive_archive_jobs').select('*').eq('document_id',d.id).single()) as any;if(original.status!=='archived'||!original.google_file_id||!original.sha256)throw Error('Original not ready');
  const om=await metadata(access,original.google_file_id);if(!om||om.appProperties?.documentId!==d.id||om.appProperties?.sha256!==original.sha256||!om.parents?.length)throw Error('Original Drive identity mismatch');
  const source=await db.storage.from('private-documents').download(d.file_path);if(source.error||!source.data||await digest(await source.data.arrayBuffer())!==original.sha256)throw Error('Original source/hash mismatch');await verifyBytes(access,original.google_file_id,original.sha256);
  const stored=await db.storage.from('document-scans-test').download(scan.file_path);if(stored.error||!stored.data)throw Error('Scan unavailable');const bytes=await stored.data.arrayBuffer();if(bytes.byteLength>12582912)throw Error('Scan too large');const hash=await digest(bytes);
  let id=job.google_scan_id;if(!id){const allocatedId=await allocated(access);const row=must(await db.from('document_scan_archive_jobs').update({google_scan_id:allocatedId}).eq('document_id',d.id).eq('lease_id',lease).select('google_scan_id').single()) as any;id=row.google_scan_id;}
  await guard(d.id,lease);let sm=await metadata(access,id);
  const props={documentId:d.id,sha256:hash,variant:'document_scan'};
  if(!sm){const boundary='ff_'+crypto.randomUUID(),meta={id,name:d.id+'_SCANSIONE.'+(stored.data.type==='application/pdf'?'pdf':'jpg'),parents:[om.parents[0]],appProperties:props};const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',JSON.stringify(meta),'\r\n--'+boundary+'\r\nContent-Type: '+stored.data.type+'\r\n\r\n',bytes,'\r\n--'+boundary+'--']);const r=await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'multipart/related; boundary='+boundary},body});if(!r.ok&&r.status!==409)throw Error('Drive scan upload failed');sm=await metadata(access,id);
  }else{
   if(sm.appProperties?.documentId!==d.id||sm.appProperties?.variant!=='document_scan'||!sm.parents?.includes(om.parents[0]))throw Error('Scan Drive identity mismatch');
   if(sm.appProperties?.sha256!==hash){await guard(d.id,lease);const r=await request('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media',{method:'PATCH',headers:{Authorization:'Bearer '+access,'Content-Type':stored.data.type},body:bytes});if(!r.ok)throw Error('Drive scan refresh failed');await api(access,'files/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({appProperties:props})});sm=await metadata(access,id);}
  }
  if(!sm||sm.appProperties?.documentId!==d.id||sm.appProperties?.variant!=='document_scan'||sm.appProperties?.sha256!==hash||Number(sm.size)!==bytes.byteLength||!sm.parents?.includes(om.parents[0]))throw Error('Scan Drive metadata mismatch');
  await verifyBytes(access,id,hash);await guard(d.id,lease);
  must(await db.from('document_scan_archive_jobs').update({status:'done',scan_hash:hash,original_hash:original.sha256,pair_verified_at:new Date().toISOString(),last_error:null}).eq('document_id',d.id).eq('lease_id',lease).select('document_id').single());done=true;return {done:true};
 }catch(e){const message=e instanceof Error?e.message:'Scan archive failed';must(await db.from('document_scan_archive_jobs').update({last_error:message}).eq('document_id',job.document_id).eq('lease_id',lease));return {done:false,error:message};}
 finally{if(!done)must(await db.from('document_scan_archive_jobs').update({status:'retry',next_attempt_at:new Date(Date.now()+60000).toISOString()}).eq('document_id',job.document_id).eq('lease_id',lease));must(await db.from('drive_runtime').update({lease_until:null}).eq('singleton',true).eq('lease_id',lease));}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return json({error:'Method not allowed'},405);
 try{const origin=req.headers.get('Origin');if(origin&&origin!==APP)return json({error:'Origin rejected'},403);
  if(new URL(req.url).pathname.endsWith('/worker')){const runtime=must(await db.from('drive_runtime').select('worker_key').eq('singleton',true).single()) as any;if(req.headers.get('x-drive-worker')!==runtime.worker_key)return json({error:'Unauthorized'},401);return json(await processScan());}
  await admin(req);const {document_id}=await req.json();const d=must(await db.from('documents').select('id,category').eq('id',document_id).single()) as any;if(d.category==='presenze')return json({error:'Use monthly archive'},400);
  const job=must(await db.from('document_scan_archive_jobs').select('status,last_error,pair_verified_at').eq('document_id',d.id).maybeSingle());return json({job});
 }catch(e){const message=e instanceof Error?e.message:'Request failed';return json({error:message},message==='Unauthorized'?401:400);}
});
