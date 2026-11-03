import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
const cors={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return reply({error:'Accedi nuovamente.'},401);
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await db.auth.getUser(token);
  if(authError||!user)return reply({error:'Accedi nuovamente.'},401);
  const {data:actor,error:actorError}=await db.from('profiles').select('id,role,active,site').eq('id',user.id).single();
  if(actorError)throw actorError;
  if(!actor?.active||actor.role!=='worker')return reply({error:'Accesso non consentito.'},403);
  const {data:assigned,error:assignmentError}=await db.from('supervisor_assignments').select('site').eq('user_id',user.id).eq('site',actor.site);
  if(assignmentError)throw assignmentError;
  const sites=(assigned||[]).map(x=>x.site);
  const body=await req.json();
  if(body.action==='context')return reply({sites});
  if(!sites.length)return reply({error:'Accesso caposervizio non abilitato.'},403);
  if(body.action==='list'){
   if(typeof body.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body.month))return reply({error:'Seleziona mese e anno.'},400);
   // Select only operational metadata, never health files or their storage paths.
   const {data:documents,error}=await db.from('documents').select('id,worker_id,recipient_person_key,recipient_name,site,month,category,note,review_status,authorization,review_reason,created_at,authorized_at,reviewed_by,reviewed_at')
    .in('site',sites).eq('month',body.month).in('category',['ferie','rol','malattia','legge104','congedo_parentale']).order('created_at',{ascending:false}).limit(1000);
   if(error)throw error;
   const workerIds=[...new Set((documents||[]).map(d=>d.worker_id).filter(Boolean))];
   const {data:workers,error:workerError}=workerIds.length?await db.from('profiles').select('id,full_name,site,workplace,role').in('id',workerIds):{data:[],error:null};
   if(workerError)throw workerError;
   const keys=[...new Set((documents||[]).map(d=>d.recipient_person_key).filter(Boolean))];
   const {data:registry,error:registryError}=keys.length?await db.from('hour_budget_registry').select('person_key,account_id').in('person_key',keys):{data:[],error:null};
   if(registryError)throw registryError;
   const rows=(documents||[]).filter(d=>{
    const owner=workers?.find(p=>p.id===d.worker_id),linked=registry?.find(r=>r.person_key===d.recipient_person_key);
    return d.worker_id!==user.id&&linked?.account_id!==user.id&&(!d.worker_id||(owner?.site===d.site&&owner?.role==='worker'));
   }).map(d=>{
    const owner=workers?.find(p=>p.id===d.worker_id);
    return {...d,worker_name:owner?.full_name||d.recipient_name||'Lavoratore',workplace:owner?.workplace||'',can_verify:['malattia','legge104'].includes(d.category)&&d.review_status==='pending',can_decide:['ferie','rol'].includes(d.category)&&d.authorization==='pending'&&d.review_status!=='rejected'};
   });
   return reply({rows,sites});
  }
  if(!uuid(body.document_id))return reply({error:'Documento non valido.'},400);
  if(body.action==='verify'){
   const {data,error}=await db.rpc('supervisor_verify',{p_actor:user.id,p_document:body.document_id});
   if(error)return reply({error:error.message},409);
   return reply({ok:true,result:data});
  }
  if(body.action==='decide'){
   if(!['approved','denied'].includes(body.decision)||typeof body.reason!=='string'||body.reason.trim().length>250||(body.decision==='denied'&&!body.reason.trim()))return reply({error:'Indica una motivazione valida (massimo 250 caratteri).'},400);
   const {data,error}=await db.rpc('supervisor_decide',{p_actor:user.id,p_document:body.document_id,p_decision:body.decision,p_reason:body.reason});
   if(error)return reply({error:error.message},409);
   return reply({ok:true,result:data});
  }
  if(body.action==='open'){
   const {data:d,error}=await db.from('documents').select('worker_id,recipient_person_key,site,category,file_path').eq('id',body.document_id).single();
   if(error||!d||!sites.includes(d.site)||!['ferie','rol'].includes(d.category)||d.worker_id===user.id)return reply({error:'Documento non accessibile.'},403);
   if(d.worker_id){const {data:p,error:e}=await db.from('profiles').select('site,role').eq('id',d.worker_id).single();if(e||p?.site!==d.site||p?.role!=='worker')return reply({error:'Documento non accessibile.'},403);}
   if(d.recipient_person_key){const {data:r,error:e}=await db.from('hour_budget_registry').select('account_id').eq('person_key',d.recipient_person_key).single();if(e||r?.account_id===user.id)return reply({error:'Documento non accessibile.'},403);}
   const {data:url,error:urlError}=await db.storage.from('private-documents').createSignedUrl(d.file_path,90);
   if(urlError)throw urlError;
   return reply({url:url.signedUrl});
  }
  return reply({error:'Operazione non valida.'},400);
 }catch(e){console.error('supervisor-access',e instanceof Error?e.message:'request failed');return reply({error:'Operazione non completata. Riprova.'},500);}
});

