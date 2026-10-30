import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
import {dec,date,monthEnd,validateConfig,quantities,historyEvidence,project} from './leave-core.js';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const headers={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
async function snapshot(actor:string,key:string){const {data,error}=await db.rpc('leave_snapshot',{actor,key});if(error)throw error;if(!data)throw Error('Saldi non disponibili');return {...data,evidence:historyEvidence(data.balances,data.entries,data.config)};}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('',{headers});if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
  const raw=await req.text();if(raw.length>2_000_000)return reply({error:'Richiesta troppo grande'},413);const body=JSON.parse(raw||'{}'),bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'');
  if(!bearer)return reply({error:'Accedi per consultare i tuoi saldi'},401);
  const {data:{user},error:authError}=await db.auth.getUser(bearer);if(authError||!user)return reply({error:'Sessione scaduta. Accedi nuovamente.'},401);
  const {data:profile,error:pe}=await db.from('profiles').select('role,active').eq('id',user.id).single();if(pe||!profile?.active)return reply({error:'Account non abilitato'},403);
  const admin=profile.role==='admin';let key=body.person_key;
  if(!admin){const {data:person,error}=await db.from('leave_people').select('person_key').eq('account_id',user.id).maybeSingle();if(error)throw error;key=person?.person_key;}
  if(body.action==='snapshot'||body.action==='simulate'){
   if(!key)return reply({unlinked:true});
   const data=await snapshot(user.id,key);if(body.action==='simulate'&&body.input?.start<new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()))throw Error('Scegli una data di partenza futura');return reply(body.action==='snapshot'?data:project(data,body.input||{}));
  }
  if(!admin)return reply({error:'Operazione riservata all’amministratore'},403);
  if(body.action==='attendance_roster'){
   async function rows(table:string,columns:string,order:string){let out:any[]=[];for(let offset=0;;offset+=500){const {data,error}=await db.from(table).select(columns).order(order).range(offset,offset+499);if(error)throw error;out.push(...(data||[]));if(!data||data.length<500)return out;}}
   const [people,accounts,configs]=await Promise.all([rows('leave_people','person_key,surname,given_name,site,account_id','person_key'),rows('profiles','id,full_name,site,active','id'),rows('leave_config','person_key,data,version','person_key')]);
   const workerIds=new Set((await rows('profiles','id,role','id')).filter(p=>p.role==='worker').map(p=>p.id));
   return reply({people,accounts:accounts.filter(a=>workerIds.has(a.id)),configs:configs.map(r=>({person_key:r.person_key,version:r.version,data:{schedules:r.data?.schedules||[],day_overrides:r.data?.day_overrides||[]}}))});
  }
  if(body.action==='roster'){
   const [people,accounts,reports]=await Promise.all([db.from('leave_people').select('*').order('surname'),db.from('profiles').select('id,full_name,site,active').eq('role','worker').order('full_name'),db.from('leave_reports').select('id,period,file_name,created_at').order('period',{ascending:false})]);if(people.error||accounts.error||reports.error)throw people.error||accounts.error||reports.error;return reply({people:people.data,accounts:accounts.data,reports:reports.data});
  }
  if(body.action==='import'){
   const report=body.report;if(!report||!Array.isArray(report.rows)||report.rows.length>5000)throw Error('Report non valido');date(report.period);if(report.period!==monthEnd(report.period.slice(0,7)))throw Error('Il saldo deve riferirsi alla fine del mese');
   for(const row of report.rows){for(const field of ['ferie','rol','ex_festivita']){row[field]=dec(row[field]).toString();if(dec(row[field]).abs().gte(1000000))throw Error('Saldo fuori intervallo');}}
   const canonical=JSON.stringify({period:report.period,rows:[...report.rows].sort((a,b)=>a.person_key.localeCompare(b.person_key)).map(({person_key,ferie,rol,ex_festivita})=>({person_key,ferie,rol,ex_festivita}))});
   report.checksum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical)))].map(b=>b.toString(16).padStart(2,'0')).join('');
   const {data,error}=await db.rpc('leave_import_report',{actor:user.id,report,replace_period:body.replace===true});if(error)throw error;return reply(data);
  }
  if(body.action==='link'){const {error}=await db.rpc('leave_link_account',{actor:user.id,key,account:body.account_id||null});if(error)throw error;return reply({ok:true});}
  if(body.action==='save_config'){
   const config=validateConfig(body.config);const {data,error}=await db.rpc('leave_set_config',{actor:user.id,key,expected_version:body.version,settings:config});if(error)throw error;return reply({version:data});
  }
  if(body.action==='add_entries'){
   const data=await snapshot(user.id,key);validateConfig(data.config);
   if(!['used','approved'].includes(body.state))throw Error('Stato assenza non valido');
   if(body.state==='used'&&body.end>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()))throw Error('Un utilizzo effettivo non può avere date future');
   if(!/^[0-9a-f-]{36}$/i.test(body.request_id||''))throw Error('Identificativo invio non valido');
   const entries=quantities(data.config,body.start,body.end,body.kind,body.dailyHours).map(x=>({...x,state:body.state,note:String(body.note||'').slice(0,300)}));
   if(body.document_id){const {data:d}=await db.from('documents').select('category').eq('id',body.document_id).single();if(d?.category!==body.kind)throw Error('Tipo assenza diverso dal documento');}
   const {error}=await db.rpc('leave_add_entries',{actor:user.id,key,request_key:body.request_id,entries,document:body.document_id||null});if(error)throw error;return reply({count:entries.length});
  }
  if(body.action==='update_entry'){
   const data=await snapshot(user.id,key),entry=data.entries.find(x=>x.id===body.id);if(!entry)throw Error('Voce non trovata');
   const update:any={};if(body.state){if(!['used','cancelled'].includes(body.state))throw Error('Stato non valido');if(body.state==='used'&&entry.day>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome'}).format(new Date()))throw Error('Data futura');update.state=body.state;}
   if(body.included_in_report){date(body.included_in_report);if(!data.balances.some(b=>b.period===body.included_in_report)||entry.day>body.included_in_report)throw Error('Periodo di copertura non valido');update.included_in_report=body.included_in_report;}
   const {error}=await db.from('leave_ledger').update(update).eq('id',entry.id).eq('person_key',key);if(error)throw error;await db.from('leave_audit').insert({actor:user.id,action:'update_entry',person_key:key,details:{id:entry.id,...update}});return reply({ok:true});
  }
  if(body.action==='reconcile_document'){
   const data=await snapshot(user.id,key);if(!data.unreconciled.some(x=>x.id===body.document_id))throw Error('Documento non riconciliabile');
   if(!['included','not_absence'].includes(body.mode))throw Error('Modalità non valida');
   if(body.mode==='included'&&!data.balances.some(b=>b.period===body.covered_by))throw Error('Scegli il report che include l’assenza');
   const {error}=await db.from('leave_document_links').upsert({document_id:body.document_id,person_key:key,mode:body.mode,covered_by:body.mode==='included'?body.covered_by:null,updated_by:user.id});if(error)throw error;
   await db.from('leave_audit').insert({actor:user.id,action:'reconcile_document',person_key:key,details:{id:body.document_id,mode:body.mode,covered_by:body.covered_by}});return reply({ok:true});
  }
  return reply({error:'Operazione non valida'},400);
 }catch(error){const message=String(error.message||error);return reply({error:message.includes('duplicate key')?'Associazione o registrazione duplicata. Ricarica e verifica.':message.slice(0,300)},400);}
});
