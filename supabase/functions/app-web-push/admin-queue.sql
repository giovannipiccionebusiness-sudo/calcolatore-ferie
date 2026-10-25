create or replace function public.enqueue_admin_push(actor uuid, request_id uuid, chosen_worker uuid, chosen_site text, notice_kind text, notice_message text, notice_month text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare queued int; reached int; total int; complete int; ev text:='admin:'||request_id::text;
begin
 if not exists(select 1 from public.profiles where id=actor and active and role='admin') then raise exception 'Non autorizzato'; end if;
 if notice_kind not in ('custom','monthly_request') or length(trim(notice_message)) not between 1 and 600 or (notice_kind='monthly_request' and (notice_month is null or notice_month !~ '^\d{4}-(0[1-9]|1[0-2])$')) then raise exception 'Messaggio non valido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if exists(select 1 from public.test_push_queue where event_key=ev and created_by=actor) then
  return jsonb_build_object('queued_devices',(select count(*) from public.test_push_queue where event_key=ev and created_by=actor),'duplicate',true);
 end if;
 if exists(select 1 from public.test_push_queue where created_by=actor and created_at>now()-interval '1 minute') then raise exception 'Attendi un minuto prima di un altro invio'; end if;
 select count(*),count(*) filter(where notice_kind='monthly_request' and exists(select 1 from public.documents d where d.worker_id=p.id and d.category='presenze' and d.stage='final' and d.month=notice_month and d.review_status<>'rejected'))
 into total,complete from public.profiles p where p.active and p.role='worker' and (chosen_worker is null or p.id=chosen_worker) and (chosen_site is null or p.site=chosen_site);
 with inserted as (
 insert into public.test_push_queue(subscription_id,kind,event_key,message,target_month,created_by)
 select s.id,notice_kind,ev,trim(notice_message),case when notice_kind='monthly_request' then notice_month end,actor
 from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
 where p.active and p.role='worker' and s.app_scope='production' and s.push_keys is not null
 and (chosen_worker is null or p.id=chosen_worker) and (chosen_site is null or p.site=chosen_site)
 and (notice_kind<>'monthly_request' or not exists(select 1 from public.documents d where d.worker_id=p.id and d.category='presenze' and d.stage='final' and d.month=notice_month and d.review_status<>'rejected'))
 on conflict do nothing returning subscription_id
 ) select count(*),count(distinct s.user_id) into queued,reached from inserted i join public.test_push_subscriptions s on s.id=i.subscription_id;
 return jsonb_build_object('queued_devices',queued,'reached_workers',reached,'without_push',total-complete-reached,'already_complete',complete);
end $$;
revoke all on function public.enqueue_admin_push(uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_admin_push(uuid,uuid,uuid,text,text,text,text) to service_role;
