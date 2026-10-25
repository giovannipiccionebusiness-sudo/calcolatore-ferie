begin;
alter table public.test_push_queue drop constraint test_push_queue_kind_check;
alter table public.test_push_queue add constraint test_push_queue_kind_check check(kind in ('activation','weekly','monthly','test','custom','monthly_request','admin_registration','admin_review','admin_authorization'));
create function private.collect_admin_push() returns void language sql security invoker set search_path='' as $$
 with tasks as (
 select p.id,'admin_registration'::text as kind,'Un account lavoratore è in attesa di abilitazione. Apri la campanella e consulta “Da gestire”.'::text as message from public.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.review_status='pending' then 'admin_review' else 'admin_authorization' end,
 case when d.review_status='pending' then 'Hai un documento da verificare. Apri la campanella e consulta “Da gestire”.' else 'Hai una richiesta da autorizzare. Apri la campanella e consulta “Da gestire”.' end
 from public.documents d where (d.review_status='pending' or (d.review_status='verified' and d.category in ('ferie','rol') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 )
 insert into public.test_push_queue(subscription_id,kind,event_key,message)
 select s.id,t.kind,t.kind||':'||t.id::text,t.message from tasks t cross join public.test_push_subscriptions s join public.profiles admin on admin.id=s.user_id
 where admin.active and admin.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
$$;
revoke all on function private.collect_admin_push() from public,anon,authenticated;
do $$ declare source text;
begin
 select pg_get_functiondef('private.save_push_inbox()'::regprocedure) into source;
 if strpos(source,'admin_review')=0 then
 source:=replace(source,'headline:=case new.kind','headline:=case new.kind when ''admin_registration'' then ''Account da abilitare'' when ''admin_review'' then ''Documento da verificare'' when ''admin_authorization'' then ''Richiesta da autorizzare''');execute source;
 end if;
end $$;
commit;
