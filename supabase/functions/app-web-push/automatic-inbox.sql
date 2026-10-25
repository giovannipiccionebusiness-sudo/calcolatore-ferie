create function private.collect_attendance_inbox(at_time timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare local_now timestamp:=at_time at time zone 'Europe/Rome';day_key date:=local_now::date; month_key text:=to_char(local_now,'YYYY-MM');label text;
begin
 if extract(isodow from day_key)=5 and local_now::time between time '17:00' and time '20:00' then
 insert into public.app_notifications(user_id,event_key,kind,title,body)
 select p.id,'weekly:'||day_key::text,'weekly','Presenze del venerdì','Ti ricordiamo di aggiornare il foglio presenze fino a questa settimana e caricarne una foto leggibile nell’app, usando “Aggiorna foglio presenze”.'
 from public.profiles p where p.active and p.role='worker' and not exists(select 1 from public.documents d where d.worker_id=p.id and d.category='presenze' and d.month=month_key and d.review_status<>'rejected' and (d.stage='final' or (d.stage in ('weekly','replacement') and d.week_ending=day_key))) on conflict do nothing;
 end if;
 if day_key=(date_trunc('month',day_key)+interval '1 month - 1 day')::date and local_now::time between time '18:00' and time '20:00' then
 label:=(array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'])[extract(month from day_key)::int]||' '||extract(year from day_key)::text;
 insert into public.app_notifications(user_id,event_key,kind,title,body)
 select p.id,'monthly:'||month_key,'monthly','Foglio presenze definitivo','Caro collaboratore, ti chiedo di completare il foglio presenze di '||label||' fino a fine mese e di caricarlo, firmato, nell’app con “Invia foglio definitivo”. Ti chiedo inoltre di comunicare tempestivamente al responsabile eventuali modifiche successive. Grazie per la collaborazione.'
 from public.profiles p where p.active and p.role='worker' and not exists(select 1 from public.documents d where d.worker_id=p.id and d.month=month_key and d.category='presenze' and d.stage='final' and d.review_status<>'rejected') on conflict do nothing;
 end if;
end $$;
revoke all on function private.collect_attendance_inbox(timestamptz) from public,anon,authenticated;
do $$ declare source text;
begin
 select pg_get_functiondef('private.test_push_tick(timestamptz)'::regprocedure) into source;
 if strpos(source,'collect_attendance_inbox')=0 then
 source:=replace(source,'begin'||chr(10),'begin'||chr(10)||' perform private.collect_attendance_inbox(at_time);'||chr(10));
 execute source;
 end if;
end $$;
