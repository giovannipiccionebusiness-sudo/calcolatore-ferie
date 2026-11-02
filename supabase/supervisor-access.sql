begin;
-- Additional capability: the existing worker role and its policies stay unchanged.
create table public.supervisor_assignments (
 user_id uuid not null references public.profiles(id) on delete cascade,
 site text not null check(site in ('N153','N148','N154')),
 created_at timestamptz not null default now(),
 primary key(user_id,site)
);
alter table public.supervisor_assignments enable row level security;
revoke all on public.supervisor_assignments from public,anon,authenticated;
grant select on public.supervisor_assignments to authenticated;
grant all on public.supervisor_assignments to service_role;
create policy supervisor_assignment_read on public.supervisor_assignments for select to authenticated
 using(user_id=(select auth.uid()) or (select private.is_admin()));

-- Only the authenticated Edge Function may call this transaction. No client can
-- supply an actor directly to the database or update other workers' documents.
create function public.supervisor_decide(p_actor uuid,p_document uuid,p_decision text,p_reason text)
 returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.documents; actor public.profiles; reason text:=nullif(btrim(p_reason),'');
begin
 select * into actor from public.profiles where id=p_actor and active and role='worker' for share;
 if actor.id is null then raise exception 'Accesso non consentito';end if;
 select * into d from public.documents where id=p_document for update;
 if d.id is null or not exists(select 1 from public.supervisor_assignments a where a.user_id=p_actor and a.site=d.site)
 or actor.site<>d.site or d.category not in ('ferie','rol')
 or d.worker_id=p_actor or exists(select 1 from public.hour_budget_registry r where r.person_key=d.recipient_person_key and r.account_id=p_actor)
 or (d.worker_id is not null and not exists(select 1 from public.profiles p where p.id=d.worker_id and p.site=d.site and p.role='worker'))
 then raise exception 'Richiesta non gestibile';end if;
 if p_decision is null or p_decision not in ('approved','denied') or length(coalesce(reason,''))>250
 or (p_decision='denied' and reason is null) then raise exception 'Indica una motivazione valida (massimo 250 caratteri)';end if;
 if d.authorization<>'pending' or d.review_status='rejected' then raise exception 'Richiesta già gestita: aggiorna l’elenco';end if;
 if exists(select 1 from public.documents x where x.replaces=d.id) then raise exception 'Documento sostituito';end if;
 -- Existing validation and audit triggers record the real authenticated actor.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.documents set review_status='verified',"authorization"=p_decision,
 review_reason=coalesce(reason,review_reason) where id=d.id;
 insert into public.audit_log(actor_id,action,target_id,details)
 values(p_actor,'supervisor_authorization',d.id,jsonb_build_object('site',d.site,'category',d.category,'authorization',p_decision,'reason',reason));
 if d.worker_id is not null and d.submitted_name is null then
  insert into public.app_notifications(user_id,event_key,kind,title,body,created_by)
  values(d.worker_id,'supervisor-decision:'||d.id::text,'custom','Esito della tua richiesta',
   case when p_decision='approved' then 'La tua richiesta è stata autorizzata dal caposervizio. Consulta I miei caricamenti.' else 'La tua richiesta non è stata autorizzata dal caposervizio. Consulta il motivo in I miei caricamenti.' end,p_actor)
  on conflict do nothing;
  insert into public.test_push_queue(subscription_id,kind,event_key,message)
  select s.id,'custom','supervisor-decision:'||d.id::text,'È disponibile l’esito di una tua richiesta. Apri Lavoro Facile.'
  from public.test_push_subscriptions s where s.user_id=d.worker_id and s.app_scope='production' and s.push_keys is not null
  on conflict do nothing;
 end if;
 return jsonb_build_object('id',d.id,'authorization',p_decision);
end $$;
revoke all on function public.supervisor_decide(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.supervisor_decide(uuid,uuid,text,text) to service_role;

-- New requests produce one generic notice. No medical information is sent to phones.
create function private.notify_supervisor_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category not in ('ferie','rol','malattia','legge104','congedo_parentale') then return new;end if;
 insert into public.app_notifications(user_id,event_key,kind,title,body)
 select a.user_id,'supervisor-request:'||new.id::text,'custom','Nuova richiesta N153',
 'È disponibile una nuova richiesta o comunicazione. Apri Gestione N153.'
 from public.supervisor_assignments a join public.profiles p on p.id=a.user_id
 where a.site=new.site and p.active and p.role='worker' and p.site=a.site and p.id is distinct from new.worker_id
 and not exists(select 1 from public.hour_budget_registry r where r.person_key=new.recipient_person_key and r.account_id=p.id)
 on conflict do nothing;
 insert into public.test_push_queue(subscription_id,kind,event_key,message)
 select s.id,'custom','supervisor-request:'||new.id::text,'Hai una nuova comunicazione in Gestione N153. Apri Lavoro Facile.'
 from public.supervisor_assignments a join public.profiles p on p.id=a.user_id
 join public.test_push_subscriptions s on s.user_id=p.id and s.app_scope='production' and s.push_keys is not null
 where a.site=new.site and p.active and p.role='worker' and p.site=a.site and p.id is distinct from new.worker_id
 and not exists(select 1 from public.hour_budget_registry r where r.person_key=new.recipient_person_key and r.account_id=p.id)
 on conflict do nothing;
 return new;
end $$;
revoke all on function private.notify_supervisor_request() from public,anon,authenticated;
create trigger notify_supervisor_request after insert on public.documents for each row execute function private.notify_supervisor_request();
commit;
