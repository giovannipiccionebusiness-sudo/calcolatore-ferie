import {createClient} from 'npm:@supabase/supabase-js@2.49.10';
const cors={'Access-Control-Allow-Origin':'https://giovannipiccionebusiness-sudo.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function validDay(value:unknown){if(typeof value!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});if(req.method!=='POST')return reply({error:'Metodo non consentito'},405);
 try{
 const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply({error:'Accedi nuovamente.'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(token);if(authError||!user)return reply({error:'Accedi nuovamente.'},401);
 const {data:actor,error:ae}=await db.from('profiles').select('id,role,active').eq('id',user.id).single();if(ae)throw ae;if(!actor?.active)return reply({error:'Account non abilitato.'},403);
 const body=await req.json();
 if(body.action==='device-status'){
  if(typeof body.endpoint!=='string'||body.endpoint.length>4095)return reply({error:'Dispositivo non valido.'},400);
  const {data:s,error:se}=await db.from('test_push_subscriptions').select('id').eq('user_id',user.id).eq('endpoint',body.endpoint).eq('app_scope','production').maybeSingle();if(se)throw se;if(!s)return reply({repair:false});
  const {data:history,error:he}=await db.from('daily_deliveries').select('state,attempted_at').eq('subscription_id',s.id).order('attempted_at',{ascending:false}).limit(1);if(he)throw he;
  return reply({repair:history?.[0]?.state==='failed'});
 }
 if(actor.role!=='admin')return reply({error:'Accesso riservato all’amministratore.'},403);
 if(body.action!=='report'||!validDay(body.day)||!['','N153','N148','N154'].includes(body.site||''))return reply({error:'Seleziona data e CDC validi.'},400);
 const check=async(query:any)=>{const r=await query;if(r.error)throw r.error;return r.data||[];};
 let pq=db.from('profiles').select('id,full_name,site,workplace').eq('role','worker').eq('active',true).order('full_name');if(body.site)pq=pq.eq('site',body.site);
 const people=await check(pq),ids=people.map((p:any)=>p.id);if(!ids.length)return reply({rows:[],day:body.day});
 const [notices,devices,presence,shifts]=await Promise.all([
 check(db.from('daily_notices').select('id,worker_id,kind,created_at,read_at').eq('day',body.day).in('worker_id',ids)),
 check(db.from('test_push_subscriptions').select('id,user_id').eq('app_scope','production').not('push_keys','is',null).in('user_id',ids)),
 check(db.from('daily_presence').select('worker_id,updated_at').eq('day',body.day).in('worker_id',ids)),
 check(db.from('worker_shifts').select('worker_id,enabled,valid_from,schedule').lte('valid_from',body.day).in('worker_id',ids).order('valid_from',{ascending:false}))]);
 const noticeIds=notices.map((n:any)=>n.id);const deliveries=noticeIds.length?await check(db.from('daily_deliveries').select('notice_id,state,attempts,attempted_at').in('notice_id',noticeIds)):[];
 const weekday=(new Date(body.day+'T12:00:00Z').getUTCDay()+6)%7;
 const rows=people.map((p:any)=>{const nn=notices.filter((n:any)=>n.worker_id===p.id),dd=deliveries.filter((d:any)=>nn.some((n:any)=>n.id===d.notice_id)),shift=shifts.find((s:any)=>s.worker_id===p.id),slots=shift?.enabled?shift.schedule?.[weekday]:null;
 return {worker_id:p.id,name:p.full_name,site:p.site,workplace:p.workplace,devices:devices.filter((s:any)=>s.user_id===p.id).length,notice_at:nn[0]?.created_at||null,opened_at:nn.find((n:any)=>n.read_at)?.read_at||null,day_saved_at:presence.find((d:any)=>d.worker_id===p.id)?.updated_at||null,shift_set:!!shift?.enabled,working_day:Array.isArray(slots)&&slots.length>0,kind:nn[0]?.kind||(weekday===4?'week':'day'),push:{sent:dd.filter((d:any)=>d.state==='sent').length,failed:dd.filter((d:any)=>d.state==='failed').length,pending:dd.filter((d:any)=>['pending','sending'].includes(d.state)).length,skipped:dd.filter((d:any)=>d.state==='skipped').length}};});
 return reply({rows,day:body.day,checked_at:new Date().toISOString()});
 }catch{ return reply({error:'Controllo notifiche non disponibile. Riprova.'},500);}
});
