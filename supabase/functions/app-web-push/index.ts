import webpush from 'npm:web-push@3.6.7';
import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encode=(v:unknown)=>b64(new TextEncoder().encode(JSON.stringify(v)));
export function validEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&u.pathname.length>1&&(u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
export function notificationText(item:any){
 const month=item.target_month||item.event_key?.split(':')[1]?.slice(0,7)||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()).slice(0,7);
 const label=/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric',timeZone:'Europe/Rome'}).format(new Date(month+'-15T12:00:00Z')):'del mese';
 if(item.kind==='weekly')return {title:'Presenze del venerdì',body:'Ti ricordiamo di aggiornare il foglio presenze fino a questa settimana e caricarne una foto leggibile nell’app, usando “Aggiorna foglio presenze”.',month};
 if(item.kind==='monthly')return {title:'Foglio presenze definitivo',body:'Manca il foglio presenze definitivo di '+label+'. Quando è completo e firmato, caricalo nell’app con “Invia foglio definitivo”.',month};
 if(item.kind==='monthly_request')return {title:'Richiesta del definitivo mensile',body:item.message,month};
 if(item.kind==='custom')return {title:'Messaggio dal responsabile',body:item.message};
 if(item.kind==='activation')return {title:'Il tuo account è stato abilitato',body:'Il responsabile ha abilitato il tuo account. Accedi a Lavoro Facile per caricare le presenze e i tuoi documenti.'};
 return {title:'Notifica di prova',body:'Gli avvisi di Lavoro Facile funzionano su questo telefono.'};
}
function validKeys(value:any){try{return typeof value?.p256dh==='string'&&typeof value?.auth==='string'&&Uint8Array.from(atob(value.p256dh.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)).length===65&&Uint8Array.from(atob(value.auth.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0)).length===16;}catch{return false;}}
async function config(){const {data,error}=await db.from('test_push_config').select('*').eq('id',true).single();if(error)throw error;return data;}
async function keys(){let row=await config();if(!row.public_key){const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const public_key=b64(new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey)));const private_jwk=await crypto.subtle.exportKey('jwk',pair.privateKey);const {error}=await db.from('test_push_config').update({public_key,private_jwk}).eq('id',true).is('public_key',null);if(error)throw error;row=await config();}return row;}
async function stillNeeded(item:any,sub:any){
 const {data:p,error}=await db.from('profiles').select('active,role').eq('id',sub.user_id).single();if(error||!p)return false;
 if(item.kind==='test')return true;
 if(!p.active||p.role!=='worker')return false;
 if(item.kind==='activation'||item.kind==='custom')return true;
 const local=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()),month=item.kind==='monthly_request'?item.target_month:local.slice(0,7);
 if(item.kind==='weekly'&&item.event_key!=='weekly:'+local)return false;
 if(item.kind==='monthly'&&item.event_key!=='monthly:'+month)return false;
 const {data:docs,error:e}=await db.from('documents').select('stage,week_ending').eq('worker_id',sub.user_id).eq('month',month).eq('category','presenze').neq('review_status','rejected');if(e)throw e;
 return !(docs||[]).some(d=>d.stage==='final'||(item.kind==='weekly'&&['weekly','replacement'].includes(d.stage)&&d.week_ending===local));
}
async function send(item:any,row:any){
 const {data:sub}=await db.from('test_push_subscriptions').select('*').eq('id',item.subscription_id).maybeSingle();if(!sub)return 'skipped';
 if(!validEndpoint(sub.endpoint)||!await stillNeeded(item,sub)){await db.from('test_push_queue').update({state:'skipped'}).eq('id',item.id);return 'skipped';}
 const audience=new URL(sub.endpoint).origin,key=await crypto.subtle.importKey('jwk',row.private_jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);const token=encode({typ:'JWT',alg:'ES256'})+'.'+encode({aud:audience,exp:Math.floor(Date.now()/1000)+3600,sub:'https://giovannipiccionebusiness-sudo.github.io/calcolatore-ferie/'});const signature=b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(token))));
 // Existing devices keep generic delivery until their next app visit synchronizes encryption keys.
 let headers:any={Authorization:`vapid t=${token}.${signature}, k=${row.public_key}`,TTL:'300',Urgency:'normal'},payload:any;
 if(validKeys(sub.push_keys)){const details=webpush.generateRequestDetails({endpoint:sub.endpoint,keys:sub.push_keys},JSON.stringify({...notificationText(item),id:String(item.id)}),{TTL:300,urgency:'normal',contentEncoding:'aes128gcm',vapidDetails:{subject:'https://giovannipiccionebusiness-sudo.github.io/calcolatore-ferie/',publicKey:row.public_key,privateKey:row.private_jwk.d}});headers=details.headers;payload=details.body;}
 const response=await fetch(sub.endpoint,{method:'POST',headers,body:payload,redirect:'error',signal:AbortSignal.timeout(10000)});
 if(response.status===404||response.status===410){await db.from('test_push_subscriptions').delete().eq('id',sub.id);return 'expired';}
 const state=response.ok?'sent':item.attempts>=3?'failed':'pending';await db.from('test_push_queue').update({state,attempted_at:new Date().toISOString()}).eq('id',item.id);return response.ok?'sent':'retry';
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers:cors});if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
  const raw=await req.text();if(raw.length>10000)return reply({error:'Richiesta troppo grande'},413);const body=JSON.parse(raw||'{}');
  if(body.action==='dispatch'){
   const row=await config();if(!req.headers.get('x-push-job')||req.headers.get('x-push-job')!==row.job_token)return reply({error:'Non autorizzato'},401);
   if(!row.private_jwk)return reply({sent:0});const {data,error}=await db.rpc('test_claim_push');if(error)throw error;let sent=0;
   for(const item of data||[]){try{if(await send(item,row)==='sent')sent++;}catch{await db.from('test_push_queue').update({state:item.attempts>=3?'failed':'pending',attempted_at:new Date().toISOString()}).eq('id',item.id);}}
   return reply({sent});
  }
  const bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!bearer)return reply({error:'Accedi prima di attivare le notifiche.'},401);
  const {data:{user},error}=await db.auth.getUser(bearer);if(error||!user)return reply({error:'Sessione scaduta. Accedi nuovamente.'},401);
  const {data:profile}=await db.from('profiles').select('active,role').eq('id',user.id).single();if(!profile)return reply({error:'Profilo non disponibile'},403);
  if(body.action==='admin_send'){
   if(!profile.active||profile.role!=='admin')return reply({error:'Solo l’amministratore può inviare messaggi.'},403);
   if(!['custom','monthly_request'].includes(body.kind)||typeof body.message!=='string'||!body.message.trim()||body.message.trim().length>600||!/^[-0-9a-f]{36}$/i.test(body.request_id||''))return reply({error:'Controlla il messaggio e riprova.'},400);
   if(body.kind==='monthly_request'&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month||''))return reply({error:'Seleziona il mese.'},400);
   const {data,error:e}=await db.rpc('enqueue_admin_push',{actor:user.id,request_id:body.request_id,chosen_worker:body.worker||null,chosen_site:body.site||null,notice_kind:body.kind,notice_message:body.message.trim(),notice_month:body.month||null});
   if(e)return reply({error:e.message?.includes('Attendi un minuto')?'Attendi un minuto prima di un altro invio.':'Invio non riuscito. Controlla i destinatari e riprova.'},400);
   return reply(data);
  }
  if(body.action==='key'){const row=await keys();return reply({publicKey:row.public_key});}
  if(!['subscribe','unsubscribe','test'].includes(body.action)||typeof body.endpoint!=='string'||!validEndpoint(body.endpoint))return reply({error:'Sottoscrizione non valida'},400);
  const {data:existing,error:lookup}=await db.from('test_push_subscriptions').select('*').eq('endpoint',body.endpoint).maybeSingle();if(lookup)throw lookup;
  if(existing&&existing.user_id!==user.id)return reply({error:'Questo telefono è associato a un altro account. Disattiva prima le sue notifiche.'},409);
  if(body.action==='unsubscribe'){if(existing)await db.from('test_push_subscriptions').delete().eq('id',existing.id).eq('user_id',user.id);return reply({ok:true});}
  if(body.action==='subscribe'){
   if(body.keys&&!validKeys(body.keys))return reply({error:'Chiavi del telefono non valide. Disattiva e riattiva gli avvisi.'},400);
   if(body.scope&&!['production','test'].includes(body.scope))return reply({error:'App non valida.'},400);
   if(existing&&body.keys){const {error:e}=await db.from('test_push_subscriptions').update({push_keys:body.keys,app_scope:body.scope||'production'}).eq('id',existing.id).eq('user_id',user.id);if(e)throw e;}

   if(!existing){const {count}=await db.from('test_push_subscriptions').select('id',{count:'exact',head:true}).eq('user_id',user.id);if((count||0)>=5)return reply({error:'Hai già attivato cinque dispositivi.'},400);const {error:e}=await db.from('test_push_subscriptions').insert({user_id:user.id,endpoint:body.endpoint,activation_seen:profile.active,push_keys:body.keys||null,app_scope:body.scope||null});if(e)throw e;}
   return reply({ok:true});
  }
  if(!existing)return reply({error:'Attiva prima le notifiche.'},400);
  if(existing.last_test_at&&Date.now()-Date.parse(existing.last_test_at)<60000)return reply({error:'Attendi un minuto prima di riprovare.'},429);
  const {data:locked,error:lockError}=await db.from('test_push_subscriptions').update({last_test_at:new Date().toISOString()}).eq('id',existing.id).or('last_test_at.is.null,last_test_at.lt.'+new Date(Date.now()-60000).toISOString()).select('id');if(lockError)throw lockError;if(!locked?.length)return reply({error:'Attendi un minuto prima di riprovare.'},429);
  const {data:item,error:e}=await db.from('test_push_queue').insert({subscription_id:existing.id,kind:'test',event_key:'test:'+crypto.randomUUID(),state:'sending',attempts:1,attempted_at:new Date().toISOString()}).select('*').single();if(e)throw e;
  const result=await send(item,await keys());return result==='sent'?reply({ok:true}):reply({error:'Notifica non consegnata. Disattiva e riattiva le notifiche, poi riprova.'},502);
 }catch{return reply({error:'Servizio notifiche momentaneamente non disponibile. Riprova più tardi.'},500);}
});

