create or replace function public.supervisor_verify(p_actor uuid,p_document uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.documents; actor public.profiles;
begin
 select * into actor from public.profiles where id=p_actor and active and role='worker' for share;
 if actor.id is null then raise exception 'Accesso non consentito';end if;
 select * into d from public.documents where id=p_document for update;
 if d.id is null or not exists(select 1 from public.supervisor_assignments a where a.user_id=p_actor and a.site=d.site)
 or actor.site is distinct from d.site or d.category not in ('malattia','legge104')
 or d.worker_id=p_actor or exists(select 1 from public.hour_budget_registry r where r.person_key=d.recipient_person_key and r.account_id=p_actor)
 or (d.worker_id is not null and not exists(select 1 from public.profiles p where p.id=d.worker_id and p.site=d.site and p.role='worker'))
 then raise exception 'Comunicazione non gestibile';end if;
 if d.review_status<>'pending' then raise exception 'Comunicazione già gestita: aggiorna l’elenco';end if;
 if exists(select 1 from public.documents x where x.replaces=d.id) then raise exception 'Documento sostituito';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update public.documents set review_status='verified' where id=d.id;
 insert into public.audit_log(actor_id,action,target_id,details)
 values(p_actor,'supervisor_review',d.id,jsonb_build_object('site',d.site,'category',d.category,'review_status','verified'));
 return jsonb_build_object('id',d.id,'review_status','verified');
end $$;
revoke all on function public.supervisor_verify(uuid,uuid) from public,anon,authenticated;
grant execute on function public.supervisor_verify(uuid,uuid) to service_role;
