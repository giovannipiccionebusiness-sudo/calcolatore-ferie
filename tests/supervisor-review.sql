begin;
create temporary table profiles as select id,full_name,role,active,site from public.profiles;
create temporary table documents (like public.documents including defaults);
insert into documents select * from public.documents where site='N153' and category in ('malattia','legge104','ferie','congedo_parentale');
create temporary table supervisor_assignments as select * from public.supervisor_assignments;
create temporary table hour_budget_registry as select person_key,account_id from public.hour_budget_registry;
create temporary table audit_log (like public.audit_log including defaults including identity);
create trigger qa_validation before update on pg_temp.documents for each row execute function private.validate_document();
create or replace function pg_temp.supervisor_verify(p_actor uuid,p_document uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d pg_temp.documents; actor pg_temp.profiles;
begin
 select * into actor from pg_temp.profiles where id=p_actor and active and role='worker' for share;
 if actor.id is null then raise exception 'Accesso non consentito';end if;
 select * into d from pg_temp.documents where id=p_document for update;
 if d.id is null or not exists(select 1 from pg_temp.supervisor_assignments a where a.user_id=p_actor and a.site=d.site)
 or actor.site is distinct from d.site or d.category not in ('malattia','legge104')
 or d.worker_id=p_actor or exists(select 1 from pg_temp.hour_budget_registry r where r.person_key=d.recipient_person_key and r.account_id=p_actor)
 or (d.worker_id is not null and not exists(select 1 from pg_temp.profiles p where p.id=d.worker_id and p.site=d.site and p.role='worker'))
 then raise exception 'Comunicazione non gestibile';end if;
 if d.review_status<>'pending' then raise exception 'Comunicazione già gestita: aggiorna l’elenco';end if;
 if exists(select 1 from pg_temp.documents x where x.replaces=d.id) then raise exception 'Documento sostituito';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 update pg_temp.documents set review_status='verified' where id=d.id;
 insert into pg_temp.audit_log(actor_id,action,target_id,details)
 values(p_actor,'supervisor_review',d.id,jsonb_build_object('site',d.site,'category',d.category,'review_status','verified'));
 return jsonb_build_object('id',d.id,'review_status','verified');
end $$;
do $$
declare a uuid; outsider uuid; d pg_temp.documents; c text; ok boolean;
begin
select user_id into a from pg_temp.supervisor_assignments where site='N153' limit 1;
select id into outsider from pg_temp.profiles where site='N153' and role='worker' and active and id<>a and id not in(select user_id from pg_temp.supervisor_assignments) limit 1;
if a is null or outsider is null then raise exception 'Missing actors';end if;
foreach c in array array['malattia','legge104'] loop
 select * into d from pg_temp.documents where category=c and worker_id<>a limit 1;
 if d.id is null then raise exception 'Missing health fixture %',c;end if;
 update pg_temp.documents set review_status='pending' where id=d.id;
 ok:=false;begin perform pg_temp.supervisor_verify(outsider,d.id);exception when others then ok:=sqlerrm='Comunicazione non gestibile';end;
 if not ok then raise exception 'Unassigned accepted';end if;
 perform pg_temp.supervisor_verify(a,d.id);
 if not exists(select 1 from pg_temp.documents where id=d.id and review_status='verified' and reviewed_by=a and reviewed_at is not null and "authorization"=d.authorization) then raise exception 'State or attribution wrong';end if;
 ok:=false;begin perform pg_temp.supervisor_verify(a,d.id);exception when others then ok:=sqlerrm like 'Comunicazione già gestita%';end;
 if not ok then raise exception 'Duplicate accepted';end if;
 update pg_temp.documents set review_status='pending' where id=d.id;
 update pg_temp.supervisor_assignments set site='N148' where user_id=a;
 ok:=false;begin perform pg_temp.supervisor_verify(a,d.id);exception when others then ok:=sqlerrm='Comunicazione non gestibile';end;
 if not ok then raise exception 'CDC bypass';end if;
 update pg_temp.supervisor_assignments set site='N153' where user_id=a;

end loop;
end $$;
select 'PASS: both categories, scope, attribution, unchanged authorization, duplicate rejection' as checks;
rollback;
