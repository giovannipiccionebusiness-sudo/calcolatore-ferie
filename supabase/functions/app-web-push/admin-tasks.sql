create function public.get_admin_notification_tasks(actor uuid,page_offset integer default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles where id=actor and active and role='admin') then raise exception 'Non autorizzato';end if;
 with tasks as (
 select p.id as target_id,'registration'::text as task_kind,'Account da abilitare'::text as title,coalesce(nullif(p.full_name,''),'Nuovo lavoratore') as person,p.site,null::text as month,p.created_at
 from public.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.review_status='pending' then 'review' else 'authorization' end,
 case when d.review_status='pending' then 'Documento da verificare' else 'Richiesta da autorizzare' end,
 coalesce(nullif(p.full_name,''),'Lavoratore')||' · '||case d.category when 'presenze' then 'Foglio presenze' when 'ferie' then 'Ferie' when 'rol' then 'Permessi ROL' when 'legge104' then 'Legge 104' when 'malattia' then 'Malattia' when 'congedo_parentale' then 'Congedo parentale' else 'Documento' end,
 d.site,d.month,d.created_at from public.documents d join public.profiles p on p.id=d.worker_id
 where (d.review_status='pending' or (d.review_status='verified' and d.category in ('ferie','rol') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 ), page as (select * from tasks order by created_at desc,target_id desc offset greatest(0,least(page_offset,100000)) limit 30)
 select jsonb_build_object('total',(select count(*) from tasks),'registrations',(select count(*) from tasks where task_kind='registration'),'reviews',(select count(*) from tasks where task_kind='review'),'authorizations',(select count(*) from tasks where task_kind='authorization'),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,target_id desc) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_admin_notification_tasks(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_admin_notification_tasks(uuid,integer) to service_role;
