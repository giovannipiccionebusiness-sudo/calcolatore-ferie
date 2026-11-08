CREATE OR REPLACE FUNCTION private.test_push_tick(at_time timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare local_now timestamp := at_time at time zone 'Europe/Rome'; local_day date:=local_now::date; month_key text:=to_char(local_now,'YYYY-MM'); job_secret text;
begin
 perform private.collect_admin_push();
 perform private.collect_attendance_inbox(at_time);
 insert into public.test_push_queue(subscription_id,kind,event_key)
 select s.id,'activation','activation:'||s.created_at::text from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id where not s.activation_seen and p.active and p.role='worker' on conflict do nothing;
 update public.test_push_subscriptions s set activation_seen=true from public.profiles p where p.id=s.user_id and p.active and not s.activation_seen;
 if extract(isodow from local_day) in (5,6) and local_now::time between time '17:00' and time '20:00' then
  insert into public.test_push_queue(subscription_id,kind,event_key)
  select s.id,'weekly','weekly:'||local_day::text from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
  where p.active and p.role='worker' and (extract(isodow from local_day)=6)=coalesce((select jsonb_array_length(w.schedule->5)>0 from public.worker_shifts w where w.worker_id=p.id and w.valid_from<=local_day order by w.valid_from desc limit 1),false) and not exists(select 1 from public.documents d where d.worker_id=p.id and d.category='presenze' and d.month=to_char(local_day-(extract(isodow from local_day)::int-5),'YYYY-MM') and d.review_status<>'rejected' and ((d.stage in ('weekly','replacement') and d.week_ending=local_day-(extract(isodow from local_day)::int-5)) or d.stage='final')) on conflict do nothing;
 end if;
 if local_day=(date_trunc('month',local_day)+interval '1 month - 1 day')::date and local_now::time between time '18:00' and time '20:00' then
  insert into public.test_push_queue(subscription_id,kind,event_key)
  select s.id,'monthly','monthly:'||month_key from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
  where p.active and p.role='worker' and not exists(select 1 from public.documents d where d.worker_id=p.id and d.month=month_key and d.category='presenze' and d.stage='final' and d.review_status<>'rejected') on conflict do nothing;
 end if;
 update public.test_push_queue set state='pending' where state='sending' and attempted_at<now()-interval '10 minutes' and attempts<3;
 update public.test_push_queue set state='failed' where state='sending' and attempted_at<now()-interval '10 minutes' and attempts>=3;
 update public.test_push_queue set state='skipped' where state='pending' and created_at<now()-interval '1 day';
 delete from public.test_push_queue where created_at<now()-interval '45 days';
 if exists(select 1 from public.test_push_queue where state='pending' and attempts<3) then
  select job_token into job_secret from public.test_push_config where id and public_key is not null;
  if job_secret is not null then perform net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/app-web-push',headers:=jsonb_build_object('Content-Type','application/json','x-push-job',job_secret),body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=10000); end if;
 end if;
end $function$;
