begin;
create temporary table profiles(id uuid,full_name text,role text,active boolean,site text,created_at timestamptz);
insert into profiles values ('11111111-1111-4111-8111-111111111111','Admin','admin',true,'N153',now());
create temporary table documents(id uuid,worker_id uuid,recipient_name text,category text,review_status text,"authorization" text,site text,month text,created_at timestamptz,replaces uuid);
insert into documents select gen_random_uuid(),null,'Fixture',c,'pending',case when c in ('ferie','rol') then 'pending' else 'not_applicable' end,'N153','2026-11',now(),null from unnest(array['ferie','rol','presenze','malattia','legge104','congedo_parentale']) c;
CREATE OR REPLACE FUNCTION pg_temp.get_admin_notification_tasks(actor uuid, page_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not exists(select 1 from pg_temp.profiles where id=actor and active and role='admin') then raise exception 'Non autorizzato';end if;
 with tasks as (
 select p.id as target_id,'registration'::text as task_kind,'Account da abilitare'::text as title,coalesce(nullif(p.full_name,''),'Nuovo lavoratore') as person,p.site,null::text as month,p.created_at,null::date as day,null::text as mode,null::integer as version
 from pg_temp.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.category in ('ferie','rol') then 'authorization' else 'review' end,
 case when d.category in ('ferie','rol') then 'Richiesta da autorizzare' else 'Documento da verificare' end,
 coalesce(nullif(p.full_name,''),nullif(d.recipient_name,''),'Lavoratore')||' · '||case d.category when 'presenze' then 'Foglio presenze' when 'ferie' then 'Ferie' when 'rol' then 'Permessi ROL' when 'legge104' then 'Legge 104' when 'malattia' then 'Malattia' when 'congedo_parentale' then 'Congedo parentale' else 'Documento' end,
 d.site,d.month,d.created_at,null::date,null::text,null::integer from pg_temp.documents d left join pg_temp.profiles p on p.id=d.worker_id
 where ((d.category not in ('ferie','rol') and d.review_status='pending') or (d.category in ('ferie','rol') and d.review_status in ('pending','verified') and d.authorization='pending'))
 and not exists(select 1 from pg_temp.documents replacement where replacement.replaces=d.id)

 ), page as (select * from tasks order by created_at desc,target_id desc offset greatest(0,least(page_offset,100000)) limit 30)
 select jsonb_build_object('total',(select count(*) from tasks),'registrations',(select count(*) from tasks where task_kind='registration'),'reviews',(select count(*) from tasks where task_kind='review'),'authorizations',(select count(*) from tasks where task_kind='authorization'),'presence_days',(select count(*) from tasks where task_kind='presence_day'),'presence_weeks',(select count(*) from tasks where task_kind='presence_week'),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,target_id desc) from page),'[]'::jsonb)) into result;
 return result;
end $function$;

do $$declare result jsonb;begin
 result:=pg_temp.get_admin_notification_tasks('11111111-1111-4111-8111-111111111111');
 if (result->>'authorizations')::int<>2 or (result->>'reviews')::int<>4 then raise exception 'Wrong initial classification: %',result;end if;
 update pg_temp.documents set review_status='verified' where category='ferie';
 result:=pg_temp.get_admin_notification_tasks('11111111-1111-4111-8111-111111111111');
 if (result->>'authorizations')::int<>2 then raise exception 'Verified leave disappeared';end if;
 update pg_temp.documents set review_status='verified',"authorization"='approved' where category in ('ferie','rol');
 result:=pg_temp.get_admin_notification_tasks('11111111-1111-4111-8111-111111111111');
 if (result->>'authorizations')::int<>0 or (result->>'reviews')::int<>4 then raise exception 'Completed leave still pending';end if;
end $$;
create temporary table auth_documents (like public.documents including defaults);
insert into auth_documents select * from public.documents limit 1;
update auth_documents set category='ferie',review_status='pending',"authorization"='pending';
create trigger validate_document before update on auth_documents for each row execute function private.validate_document();
select set_config('request.jwt.claim.sub','de4b5f37-3a58-492b-b7b8-c06425245df7',true);
update auth_documents set review_status='verified',"authorization"='approved';
do $$begin if not exists(select 1 from auth_documents where review_status='verified' and "authorization"='approved' and reviewed_by='de4b5f37-3a58-492b-b7b8-c06425245df7') then raise exception 'Atomic authorization failed validation';end if;end $$;
select 'PASS: pending/verified leave classified as authorization; other documents remain review; completed leave removed; atomic update accepted and attributed by production validator' as checks;
rollback;
