-- Apply supabase/supervisor-access.sql first. All QA writes use temporary copies.
begin;
create temporary table profiles as select id,full_name,role,active,site from public.profiles;
create temporary table documents (like public.documents including defaults);
insert into documents select * from public.documents where category in ('ferie','rol','malattia') and site='N153';
create temporary table supervisor_assignments (like public.supervisor_assignments including defaults);
create temporary table hour_budget_registry as select person_key,account_id from public.hour_budget_registry;
create temporary table audit_log (like public.audit_log including defaults including identity);
create temporary table app_notifications (like public.app_notifications including defaults);
create temporary table test_push_queue (like public.test_push_queue including defaults);
create temporary table test_push_subscriptions as select * from public.test_push_subscriptions where false;

create function pg_temp.supervisor_decide(p_actor uuid,p_document uuid,p_decision text,p_reason text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare d pg_temp.documents; actor pg_temp.profiles; reason text:=nullif(btrim(p_reason),'');
begin
 select * into actor from pg_temp.profiles where id=p_actor and active and role='worker' for share;
 if actor.id is null then raise exception 'Accesso non consentito';end if;
 select * into d from pg_temp.documents where id=p_document for update;
 if d.id is null or not exists(select 1 from pg_temp.supervisor_assignments a where a.user_id=p_actor and a.site=d.site)
 or actor.site<>d.site or d.category not in ('ferie','rol')
 or d.worker_id=p_actor or exists(select 1 from pg_temp.hour_budget_registry r where r.person_key=d.recipient_person_key and r.account_id=p_actor)
 or (d.worker_id is not null and not exists(select 1 from pg_temp.profiles p where p.id=d.worker_id and p.site=d.site and p.role='worker'))
 then raise exception 'Richiesta non gestibile';end if;
 if p_decision is null or p_decision not in ('approved','denied') or length(coalesce(reason,''))>250
 or (p_decision='denied' and reason is null) then raise exception 'Indica una motivazione valida (massimo 250 caratteri)';end if;
 if d.authorization<>'pending' or d.review_status='rejected' then raise exception 'Richiesta già gestita: aggiorna l’elenco';end if;
 if exists(select 1 from pg_temp.documents x where x.replaces=d.id) then raise exception 'Documento sostituito';end if;
 -- Existing validation and audit triggers record the real authenticated actor.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update pg_temp.documents set review_status='verified',"authorization"=p_decision,
 review_reason=coalesce(reason,review_reason) where id=d.id;
 insert into pg_temp.audit_log(actor_id,action,target_id,details)
 values(p_actor,'supervisor_authorization',d.id,jsonb_build_object('site',d.site,'category',d.category,'authorization',p_decision,'reason',reason));
 if d.worker_id is not null and d.submitted_name is null then
  insert into pg_temp.app_notifications(user_id,event_key,kind,title,body,created_by)
  values(d.worker_id,'supervisor-decision:'||d.id::text,'custom','Esito della tua richiesta',
   case when p_decision='approved' then 'La tua richiesta è stata autorizzata dal caposervizio. Consulta I miei caricamenti.' else 'La tua richiesta non è stata autorizzata dal caposervizio. Consulta il motivo in I miei caricamenti.' end,p_actor)
  on conflict do nothing;
  insert into pg_temp.test_push_queue(subscription_id,kind,event_key,message)
  select s.id,'custom','supervisor-decision:'||d.id::text,'È disponibile l’esito di una tua richiesta. Apri Lavoro Facile.'
  from pg_temp.test_push_subscriptions s where s.user_id=d.worker_id and s.app_scope='production' and s.push_keys is not null
  on conflict do nothing;
 end if;
 return jsonb_build_object('id',d.id,'authorization',p_decision);
end $$;
create temporary table supervisor_fixture as
 select p.id as actor, (select id from pg_temp.profiles where role='worker' and active and site='N153' and id<>p.id order by id limit 1) as outsider
 from pg_temp.profiles p where p.full_name='Prefetto Stefania' and p.active and p.role='worker' and p.site='N153';
grant select on supervisor_fixture to service_role;
insert into pg_temp.supervisor_assignments(user_id,site) select actor,'N153' from supervisor_fixture on conflict do nothing;

do $$
declare a uuid; outsider uuid; d pg_temp.documents; ok boolean; result jsonb;
begin
 select f.actor,f.outsider into a,outsider from supervisor_fixture f;
 if a is null or outsider is null then raise exception 'Missing test accounts';end if;
 select * into d from pg_temp.documents where site='N153' and category in('ferie','rol') and "authorization"='pending' and review_status<>'rejected' and worker_id<>a limit 1;
 if d.id is null then raise exception 'Missing pending fixture';end if;
 -- Non-supervisor cannot authorize, even with a valid document identifier.
 ok:=false;begin perform pg_temp.supervisor_decide(outsider,d.id,'approved','');exception when others then ok:=sqlerrm='Richiesta non gestibile';end;
 if not ok then raise exception 'Unassigned worker accepted';end if;
 -- Assigned supervisor may not approve their own request.
 insert into pg_temp.supervisor_assignments(user_id,site) values(d.worker_id,'N153') on conflict do nothing;
 ok:=false;begin perform pg_temp.supervisor_decide(d.worker_id,d.id,'approved','');exception when others then ok:=sqlerrm='Richiesta non gestibile';end;
 if not ok then raise exception 'Self approval accepted';end if;
 delete from pg_temp.supervisor_assignments where user_id=d.worker_id;
 -- An assignment in a different CDC cannot read or decide this request.
 begin
  update pg_temp.supervisor_assignments set site='N148' where user_id=a;
  ok:=false;begin perform pg_temp.supervisor_decide(a,d.id,'approved','');exception when others then ok:=sqlerrm='Richiesta non gestibile';end;
  if not ok then raise exception 'Wrong CDC accepted';end if;
  raise exception 'EXPECTED_ROLLBACK';
 exception when others then if sqlerrm<>'EXPECTED_ROLLBACK' then raise;end if;end;
 ok:=false;begin perform pg_temp.supervisor_decide(a,d.id,'denied','');exception when others then ok:=sqlerrm like 'Indica una motivazione%';end;
 if not ok then raise exception 'Empty refusal reason accepted';end if;
 -- Successful decision, trigger attribution, audit, retry protection: nested rollback.
 begin
  result:=pg_temp.supervisor_decide(a,d.id,'approved','QA rollback');
  if result->>'authorization'<>'approved' or not exists(select 1 from pg_temp.documents where id=d.id and "authorization"='approved' and review_status='verified')
  or not exists(select 1 from pg_temp.audit_log where target_id=d.id and action='supervisor_authorization' and actor_id=a)
  then raise exception 'Decision or attribution missing';end if;
  ok:=false;begin perform pg_temp.supervisor_decide(a,d.id,'denied','Retry');exception when others then ok:=sqlerrm like 'Richiesta già gestita%';end;
  if not ok then raise exception 'Duplicate decision accepted';end if;
  raise exception 'EXPECTED_ROLLBACK';
 exception when others then if sqlerrm<>'EXPECTED_ROLLBACK' then raise;end if;end;
 -- Health notices are never approvable.
 select * into d from pg_temp.documents where category='malattia' and site='N153' limit 1;
 if d.id is not null then
  ok:=false;begin perform pg_temp.supervisor_decide(a,d.id,'approved','');exception when others then ok:=sqlerrm='Richiesta non gestibile';end;
  if not ok then raise exception 'Health approval accepted';end if;
 end if;
end $$;

do $$begin
 if has_function_privilege('authenticated','public.supervisor_decide(uuid,uuid,text,text)','execute') or has_function_privilege('anon','public.supervisor_decide(uuid,uuid,text,text)','execute') then raise exception 'RPC client accessible';end if;
 if has_table_privilege('authenticated','public.supervisor_assignments','insert') or has_table_privilege('authenticated','public.supervisor_assignments','update') then raise exception 'Self escalation allowed';end if;
end $$;
select 'PASS: own requests blocked, CDC scope enforced, unassigned workers blocked, health read-only, decisions audited, retry blocked, service-only RPC' as checks;

rollback;