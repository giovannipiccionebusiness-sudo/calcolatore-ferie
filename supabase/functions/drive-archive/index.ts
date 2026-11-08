
import { createClient } from "npm:@supabase/supabase-js@2.49.10";
const SUPABASE_ENDPOINT=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT=Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")?.trim();
const SECRET=Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")?.trim();
const REDIRECT=SUPABASE_ENDPOINT+"/functions/v1/drive-archive/callback";
const APP="https://giovannipiccionebusiness-sudo.github.io";
const SCOPE="https://www.googleapis.com/auth/drive.file";
const db=createClient(SUPABASE_ENDPOINT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const headers={"Access-Control-Allow-Origin":APP,"Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,"Content-Type":"application/json","Cache-Control":"no-store"}});
function must<T extends {error:unknown;data:unknown}>(r:T):T["data"]{if(r.error)throw new Error("Database operation failed");return r.data;}
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("");
const digest=async(s:string|ArrayBuffer)=>hex(await crypto.subtle.digest("SHA-256",typeof s==="string"?new TextEncoder().encode(s):s));
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,"0")).join("");
const base64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
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
async function folder(access:string,key:string,name:string,parent?:string){
 let row=must(await db.from("drive_folders").select("google_id").eq("path_key",key).maybeSingle()) as any;
 if(!row){
  row={google_id:await allocated(access)};
  must(await db.from("drive_folders").insert({path_key:key,...row}));
 }
 let m=await metadata(access,row.google_id);
 if(!m){
  const r=await request("https://www.googleapis.com/drive/v3/files?fields=id",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify({id:row.google_id,name,mimeType:"application/vnd.google-apps.folder",...(parent?{parents:[parent]}:{}),appProperties:{ferieFaciliPath:key}})});
  if(!r.ok&&r.status!==409)throw new Error("Drive folder HTTP "+r.status);
  m=await metadata(access,row.google_id);
 }
 if(!m||m.mimeType!=="application/vnd.google-apps.folder"||m.appProperties?.ferieFaciliPath!==key||(parent&&!m.parents?.includes(parent)))throw new Error("Drive folder verification failed");
 return row.google_id;
}
const documentNames:Record<string,{folder:string;label:string}>={
 presenze:{folder:"Presenze",label:"Presenze"},
 ferie:{folder:"Ferie e ROL",label:"Richieste ferie e ROL"},
 rol:{folder:"Ferie e ROL",label:"Richieste ferie e ROL"},
 legge104:{folder:"Legge 104",label:"Giorni L104"},
 malattia:{folder:"Malattia",label:"Malattia"},
 congedo_parentale:{folder:"Congedo parentale",label:"Congedo parentale"}
};
const months=["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
function archiveFilename(d:any,label:string,mime:string){
 const month=months[Number(d.month.slice(5,7))-1];
 if(!month)throw new Error("Invalid document month");
 const ext=d.file_name.match(/\.[a-z0-9]{1,8}$/i)?.[0]||
  ({ "application/pdf":".pdf","image/jpeg":".jpg","image/png":".png","image/webp":".webp" } as Record<string,string>)[mime]||"";
 const date=new Intl.DateTimeFormat("it-IT",{timeZone:"Europe/Rome",day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(d.created_at)).replaceAll("/","-");
 const detail=d.category==="presenze"?(d.stage==="final"?"":d.stage==="replacement"?" · Sostituzione":" · Settimanale"):d.category==="rol"?" · ROL":d.category==="ferie"?" · Ferie":"";
 const suffix=d.category==="presenze"&&d.stage==="final"?"":detail+" · "+date+" · "+d.id.slice(0,8);
 return label+" "+month+" "+d.month.slice(0,4)+suffix+ext;
}
async function cleanupSource(connection:any,documentId?:string){
 const cutoff=new Date(Date.now()-600000).toISOString();
 const candidates=db.from("drive_archive_jobs").select("document_id,google_file_id,sha256")
  .eq("status","archived").is("source_removed_at",null)
  .not("google_file_id","is",null).not("sha256","is",null)
  .or("source_cleanup_attempted_at.is.null,source_cleanup_attempted_at.lt."+cutoff)
  .order("source_cleanup_attempted_at",{ascending:true,nullsFirst:true}).order("created_at");
 if(documentId)candidates.eq("document_id",documentId);
 const job=must(await candidates
  .limit(1).maybeSingle()) as any;
 if(!job)return {processed:0};
 const claimed=must(await db.from("drive_archive_jobs").update({source_cleanup_attempted_at:new Date().toISOString()})
  .eq("document_id",job.document_id).eq("status","archived").is("source_removed_at",null)
  .or("source_cleanup_attempted_at.is.null,source_cleanup_attempted_at.lt."+cutoff)
  .select("document_id").maybeSingle());
 if(!claimed)return {processed:0};
 try{
  const doc=must(await db.from("documents").select("file_path").eq("id",job.document_id).single()) as any;
  const storage=db.storage.from("private-documents");
  const original=await storage.download(doc.file_path);
  if(original.error||!original.data)throw new Error("Source unavailable");
  const bytes=await original.data.arrayBuffer();
  if(bytes.byteLength>12582912||await digest(bytes)!==job.sha256)throw new Error("Source hash mismatch");
  const access=(await token({refresh_token:connection.refresh_token,grant_type:"refresh_token"})).access_token;
  const meta=await metadata(access,job.google_file_id);
  if(!meta||meta.appProperties?.documentId!==job.document_id||meta.appProperties?.sha256!==job.sha256||Number(meta.size)!==bytes.byteLength)throw new Error("Archive metadata mismatch");
  const copy=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(job.google_file_id)+"?alt=media",{headers:{Authorization:"Bearer "+access}});
  if(!copy.ok||await digest(await copy.arrayBuffer())!==job.sha256)throw new Error("Archive readback failed");
  const removed=must(await storage.remove([doc.file_path]));
  if(removed?.length!==1)throw new Error("Source removal unconfirmed");
  must(await db.from("drive_archive_jobs").update({source_removed_at:new Date().toISOString()}).eq("document_id",job.document_id));
  return {processed:0,source_removed:true};
 }catch(e){
  console.warn("Drive source cleanup:",e instanceof Error?e.message:"unknown error");
  return {processed:0,source_removed:false};
 }
}
async function worker(){
 if(!CLIENT||!SECRET)return {processed:0,configured:false,reason:"Credenziali OAuth mancanti"};
 const connection=must(await db.from("drive_credentials").select("*").eq("singleton",true).maybeSingle()) as any;
 if(!connection)return {processed:0,reason:"Google non collegato"};
 const owner=must(await db.from("profiles").select("active,role").eq("id",connection.admin_id).single()) as any;
 if(!owner.active||owner.role!=="admin")throw new Error("Drive administrator disabled");
 if(!CLIENT||!SECRET)return {processed:0,reason:"Credenziali OAuth mancanti"};
 const claim=must(await db.rpc("drive_claim_job")) as any;
 if(!claim)return await cleanupSource(connection);
 const {job,lease}=claim;
 try{
  const access=(await token({refresh_token:connection.refresh_token,grant_type:"refresh_token"})).access_token;
  const d=must(await db.from("documents").select("*").eq("id",job.document_id).single()) as any;
  // Stable worker UUID is authoritative; changes to the displayed name cannot create new folders.
  const p=must(await db.rpc("drive_recipient_identity",{document:d.id})) as any;
  const root=await folder(access,"root","Documenti lavoratori - Ferie Facili TEST");
  if(connection.root_id!==root)must(await db.from("drive_credentials").update({root_id:root}).eq("singleton",true));
  let parent=root;
  const kind=documentNames[d.category];
  if(!kind)throw new Error("Unsupported document category");
  const year=d.month.slice(0,4);
  const names=[({N153:"N153 - Corte d’Appello",N148:"N148 - ENAV",N154:"N154 - Acquedotto Pugliese"} as Record<string,string>)[d.site]||d.site,(p.full_name||"Lavoratore").replace(/[\\/]/g," ").slice(0,120)+" ["+p.key+"]",year,kind.folder];
  const keys=[d.site,p.key,year,"category:"+kind.folder];
  let path="root";
  for(let i=0;i<keys.length;i++){path+="/"+keys[i];parent=await folder(access,path,names[i],parent);}
  const stored=await db.storage.from("private-documents").download(d.file_path);
  if(stored.error||!stored.data)throw new Error("Source document unavailable");
  const bytes=await stored.data.arrayBuffer();
  if(bytes.byteLength>12582912)throw new Error("Document too large");
  const hash=await digest(bytes);
  const name=archiveFilename(d,kind.label,stored.data.type);
  let id=job.google_file_id;
  if(!id){id=await allocated(access);must(await db.from("drive_archive_jobs").update({google_file_id:id}).eq("document_id",d.id));}
  let m=await metadata(access,id);
  if(!m){
   const boundary="ff_"+crypto.randomUUID();
   const meta={id,name,parents:[parent],appProperties:{documentId:d.id,sha256:hash,stage:d.stage,replaces:d.replaces||""}};
   const body=new Blob(["--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",JSON.stringify(meta),"\r\n--"+boundary+"\r\nContent-Type: "+(stored.data.type||"application/octet-stream")+"\r\n\r\n",bytes,"\r\n--"+boundary+"--"]);
   const r=await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",{method:"POST",headers:{Authorization:"Bearer "+access,"Content-Type":"multipart/related; boundary="+boundary},body});
   if(!r.ok&&r.status!==409)throw new Error("Drive upload HTTP "+r.status);
   m=await metadata(access,id);
  }
  if(!m||m.appProperties?.documentId!==d.id||m.appProperties?.sha256!==hash||Number(m.size)!==bytes.byteLength)throw new Error("Archive metadata mismatch");
  // Verify access and bytes before marking archived, including after an interrupted upload.
  const read=await request("https://www.googleapis.com/drive/v3/files/"+id+"?alt=media",{headers:{Authorization:"Bearer "+access}});
  if(!read.ok||await digest(await read.arrayBuffer())!==hash)throw new Error("Archive readback failed");
  if(!m.parents?.includes(parent)){
   const query=new URLSearchParams({addParents:parent});
   if(m.parents?.length)query.set("removeParents",m.parents.join(","));
   await api(access,"files/"+encodeURIComponent(id)+"?"+query,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
   const moved=await metadata(access,id);
   if(!moved?.parents?.includes(parent))throw new Error("Archive folder verification failed");
  }
  must(await db.rpc("drive_finish_job",{p_lease:lease,p_document:d.id,p_hash:hash}));
  const cleanup=await cleanupSource(connection,d.id).catch(()=>({source_removed:false}));
  return {...cleanup,processed:1,archived:true};
 }catch(e){
  const message=e instanceof Error?e.message:"Archive failed";
  must(await db.rpc("drive_finish_job",{p_lease:lease,p_document:job.document_id,p_error:message}));
  return {processed:1,archived:false,error:message};
 }
}
async function readArchived(req:Request,documentId:unknown,internal=false){
 if(typeof documentId!=="string"||!/^[0-9a-f-]{36}$/i.test(documentId))return json({error:"Documento non valido"},400);
 if(internal&&req.headers.get("Authorization")!=="Bearer "+KEY)return json({error:"Unauthorized"},401);
 if(!internal){
 const jwt=(req.headers.get("Authorization")||"").replace(/^Bearer /i,"");
 const {data:auth,error}=await db.auth.getUser(jwt);
 if(error||!auth.user)return json({error:"Accedi nuovamente"},401);
 const scoped=createClient(SUPABASE_ENDPOINT,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:"Bearer "+jwt}}});
 const {data:doc,error:denied}=await scoped.from("documents").select("id").eq("id",documentId).maybeSingle();
 if(denied||!doc)return json({error:"Documento non accessibile"},404);
 }
 const archived=must(await db.from("drive_archive_jobs").select("google_file_id,sha256").eq("document_id",documentId).eq("status","archived").maybeSingle()) as any;
 if(!archived?.google_file_id||!archived.sha256)return json({error:"Copia Drive non disponibile"},404);
 const connection=must(await db.from("drive_credentials").select("refresh_token").eq("singleton",true).single()) as any;
 const access=(await token({refresh_token:connection.refresh_token,grant_type:"refresh_token"})).access_token;
 const response=await request("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(archived.google_file_id)+"?alt=media",{headers:{Authorization:"Bearer "+access}});
 if(!response.ok)return json({error:"Copia Drive non disponibile"},502);
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength>12582912||await digest(bytes)!==archived.sha256)return json({error:"Verifica della copia Drive non riuscita"},502);
 const mime=response.headers.get("Content-Type")?.split(";")[0]||"";
 return new Response(bytes,{headers:{...headers,"Content-Type":["application/pdf","image/jpeg","image/png","image/webp"].includes(mime)?mime:"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});
}
Deno.serve(async(req:Request)=>{
 const path=new URL(req.url).pathname;
 if(req.method==="OPTIONS")return new Response(null,{headers});
 try{
  if(path.endsWith("/callback")){
   if(req.method!=="GET")return json({error:"Method not allowed"},405);
   const url=new URL(req.url),state=url.searchParams.get("state")||"";
   const rows=must(await db.rpc("drive_consume_state",{p_hash:await digest(state)})) as any[];
   if(!rows?.length)throw new Error("OAuth state invalid or expired");
   const code=url.searchParams.get("code");
   if(!code||url.searchParams.has("error"))throw new Error("Google consent not granted");
   const t=await token({code,code_verifier:rows[0].verifier,redirect_uri:REDIRECT,grant_type:"authorization_code"});
   if(!t.refresh_token||!String(t.scope||"").split(" ").includes(SCOPE))throw new Error("Offline Drive permission missing");
   // Recheck role and session at the end of the exchange.
   const check=must(await db.rpc("drive_session_active",{p_admin:rows[0].admin_id,p_session:rows[0].session_id}));
   if(!check)throw new Error("Unauthorized");
   must(await db.from("drive_credentials").upsert({singleton:true,admin_id:rows[0].admin_id,refresh_token:t.refresh_token,connected_at:new Date().toISOString()}));
   return new Response("Google Drive collegato. Torna a Ferie Facili TEST e aggiorna lo stato dell’archivio.",{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; frame-ancestors 'none'"}});
  }
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const origin=req.headers.get("Origin");if(origin&&origin!==APP)return json({error:"Origin rejected"},403);
  if(path.endsWith("/worker")){
   const runtime=must(await db.from("drive_runtime").select("worker_key").eq("singleton",true).single()) as any;
   if(req.headers.get("x-drive-worker")!==runtime.worker_key)return json({error:"Unauthorized"},401);
   return json(await worker());
  }
  const {action,document_id}=await req.json();
  if(action==="read-archived")return await readArchived(req,document_id);
  if(action==="read-archived-internal")return await readArchived(req,document_id,true);
  const user=await admin(req);
  if(action==="status"){
   const c=must(await db.from("drive_credentials").select("connected_at,root_id").eq("singleton",true).maybeSingle());
   const jobs=must(await db.from("drive_archive_jobs").select("*").order("created_at",{ascending:false}).limit(200));
   return json({configured:!!CLIENT&&!!SECRET,callback:REDIRECT,connection:c,jobs});
  }
  if(action==="connect"){
   if(!CLIENT||!SECRET)return json({error:"Configura GOOGLE_DRIVE_CLIENT_ID e GOOGLE_DRIVE_CLIENT_SECRET nei Secrets della funzione Supabase."},409);
   const state=random(),verifier=random();
   must(await db.from("drive_oauth_states").delete().lt("expires_at",new Date().toISOString()));
   must(await db.from("drive_oauth_states").insert({state_hash:await digest(state),admin_id:user.id,session_id:user.session,verifier}));
   const challenge=base64url(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))));
   const q=new URLSearchParams({client_id:CLIENT,redirect_uri:REDIRECT,response_type:"code",scope:SCOPE,access_type:"offline",prompt:"consent",state,code_challenge:challenge,code_challenge_method:"S256"});
   return json({url:"https://accounts.google.com/o/oauth2/v2/auth?"+q});
  }
  if(action==="retry"){
   if(!document_id)return json({error:"Document id required"},400);
   must(await db.from("drive_archive_jobs").update({status:"pending",attempts:0,last_error:null,next_attempt_at:new Date().toISOString()}).eq("document_id",document_id).in("status",["failed","retry"]));
   return json({ok:true});
  }
  if(action==="process")return json(await worker());
  return json({error:"Unknown action"},400);
 }catch(e){
  const m=e instanceof Error?e.message:"Request failed";
  return json({error:m},m==="Unauthorized"?401:400);
 }
});

