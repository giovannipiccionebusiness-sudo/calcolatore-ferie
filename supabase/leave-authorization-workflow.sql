CREATE OR REPLACE FUNCTION private.collect_admin_push()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with tasks as (
 select p.id,'admin_registration'::text as kind,'Un account lavoratore è in attesa di abilitazione. Apri la campanella e consulta “Da gestire”.'::text as message from public.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.category in ('ferie','rol') then 'admin_authorization' else 'admin_review' end,
 case when d.category in ('ferie','rol') then 'Hai una richiesta da autorizzare. Apri la campanella e consulta “Da gestire”.' else 'Hai un documento da verificare. Apri la campanella e consulta “Da gestire”.' end
 from public.documents d where ((d.category not in ('ferie','rol') and d.review_status='pending') or (d.category in ('ferie','rol') and d.review_status in ('pending','verified') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 )
 insert into public.test_push_queue(subscription_id,kind,event_key,message)
 select s.id,t.kind,t.kind||':'||t.id::text,t.message from tasks t cross join public.test_push_subscriptions s join public.profiles admin on admin.id=s.user_id
 where admin.active and admin.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_notification_tasks(actor uuid, page_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles where id=actor and active and role='admin') then raise exception 'Non autorizzato';end if;
 with tasks as (
 select p.id as target_id,'registration'::text as task_kind,'Account da abilitare'::text as title,coalesce(nullif(p.full_name,''),'Nuovo lavoratore') as person,p.site,null::text as month,p.created_at,null::date as day,null::text as mode,null::integer as version
 from public.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.category in ('ferie','rol') then 'authorization' else 'review' end,
 case when d.category in ('ferie','rol') then 'Richiesta da autorizzare' else 'Documento da verificare' end,
 coalesce(nullif(p.full_name,''),nullif(d.recipient_name,''),'Lavoratore')||' · '||case d.category when 'presenze' then 'Foglio presenze' when 'ferie' then 'Ferie' when 'rol' then 'Permessi ROL' when 'legge104' then 'Legge 104' when 'malattia' then 'Malattia' when 'congedo_parentale' then 'Congedo parentale' else 'Documento' end,
 d.site,d.month,d.created_at,null::date,null::text,null::integer from public.documents d left join public.profiles p on p.id=d.worker_id
 where ((d.category not in ('ferie','rol') and d.review_status='pending') or (d.category in ('ferie','rol') and d.review_status in ('pending','verified') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 union all select * from public.get_pending_presence_reviews()
 ), page as (select * from tasks order by created_at desc,target_id desc offset greatest(0,least(page_offset,100000)) limit 30)
 select jsonb_build_object('total',(select count(*) from tasks),'registrations',(select count(*) from tasks where task_kind='registration'),'reviews',(select count(*) from tasks where task_kind='review'),'authorizations',(select count(*) from tasks where task_kind='authorization'),'presence_days',(select count(*) from tasks where task_kind='presence_day'),'presence_weeks',(select count(*) from tasks where task_kind='presence_week'),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,target_id desc) from page),'[]'::jsonb)) into result;
 return result;
end $function$;
