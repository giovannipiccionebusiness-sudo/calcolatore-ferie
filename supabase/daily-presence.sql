begin;
create table public.worker_week_changes(
 document_id uuid primary key references public.documents(id) on delete cascade,
 worker_id uuid not null references public.profiles(id),week_ending date not null,
 days jsonb not null,confirmed boolean not null default true check(confirmed),
 version integer not null default 1,updated_at timestamptz not null default now()
);
alter table public.worker_week_changes enable row level security;
revoke all on public.worker_week_changes from public,anon,authenticated;
grant select,insert,update on public.worker_week_changes to authenticated;
grant all on public.worker_week_changes to service_role;
create policy test_week_read on public.worker_week_changes for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or p.id=worker_id)));
create policy test_week_insert on public.worker_week_changes for insert to authenticated with check(worker_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='worker') and exists(select 1 from public.documents d where d.id=document_id and d.worker_id=(select auth.uid()) and d.category='presenze' and d.stage in ('weekly','replacement') and d.review_status<>'rejected'));
create policy test_week_update on public.worker_week_changes for update to authenticated using(worker_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role='worker')) with check(worker_id=(select auth.uid()));

create table public.daily_presence(
 worker_id uuid not null references public.profiles(id) on delete cascade,day date not null,
 supplementary_minutes integer not null default 0 check(supplementary_minutes between 0 and 1440),
 cause text not null default '' check(cause in ('','F','M','L104','PHR','congedo parentale')),
 absence_scope text,absence_minutes integer,version integer not null default 1,
 updated_at timestamptz not null default now(),primary key(worker_id,day),
 check((cause='' and absence_scope is null and absence_minutes is null) or (cause<>'' and ((absence_scope='full' and absence_minutes is null) or (absence_scope='partial' and absence_minutes between 1 and 1440)))),
 check(supplementary_minutes+coalesce(absence_minutes,0)<=1440)
);
create table public.presence_week_confirmations(worker_id uuid not null references public.profiles(id) on delete cascade,week_ending date not null,confirmed_at timestamptz not null default now(),primary key(worker_id,week_ending));
create table public.daily_notices(
 id uuid primary key default gen_random_uuid(),worker_id uuid not null references public.profiles(id) on delete cascade,
 day date not null,kind text not null check(kind in ('day','week')),created_at timestamptz not null default now(),read_at timestamptz,unique(worker_id,day,kind)
);
create table public.daily_deliveries(
 notice_id uuid not null references public.daily_notices(id) on delete cascade,
 subscription_id uuid not null references public.test_push_subscriptions(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','skipped')),attempts integer not null default 0,attempted_at timestamptz,primary key(notice_id,subscription_id)
);

create table public.worker_shifts(
 worker_id uuid not null references public.profiles(id) on delete cascade,
 valid_from date not null,schedule jsonb not null,enabled boolean not null default true,
 version integer not null default 1,updated_at timestamptz not null default now(),primary key(worker_id,valid_from)
);
alter table public.worker_shifts enable row level security;
revoke all on public.worker_shifts from public,anon,authenticated;
grant select on public.worker_shifts to authenticated;
grant all on public.worker_shifts to service_role;
create policy shifts_read on public.worker_shifts for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or (p.role='worker' and p.id=worker_id))));

alter table public.daily_presence enable row level security;
revoke all on public.daily_presence from public,anon,authenticated;
grant all on public.daily_presence to service_role;
alter table public.presence_week_confirmations enable row level security;
revoke all on public.presence_week_confirmations from public,anon,authenticated;
grant all on public.presence_week_confirmations to service_role;
alter table public.daily_notices enable row level security;
revoke all on public.daily_notices from public,anon,authenticated;
grant all on public.daily_notices to service_role;
alter table public.daily_deliveries enable row level security;
revoke all on public.daily_deliveries from public,anon,authenticated;
grant all on public.daily_deliveries to service_role;
grant select on public.daily_presence,public.presence_week_confirmations,public.daily_notices to authenticated;
create policy daily_read on public.daily_presence for select to authenticated using(exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (p.role='admin' or (p.role='worker' and p.id=worker_id))));
create policy confirmation_read on public.presence_week_confirmations for select to authenticated using(worker_id=(select auth.uid()));
create policy notice_read on public.daily_notices for select to authenticated using(worker_id=(select auth.uid()));
CREATE FUNCTION private.presence_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;return auth.uid();end $function$;
revoke all on function private.presence_actor() from public,anon,authenticated;
CREATE FUNCTION private.validate_worker_week()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.documents;r jsonb;dt date;start_day date;finish_day date;seen date[]:='{}';s integer;a integer;expected integer;
begin
 if auth.uid() is null or new.worker_id<>auth.uid() or not exists(select 1 from public.profiles where id=auth.uid() and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;
 if TG_OP='UPDATE' and (new.document_id<>old.document_id or new.worker_id<>old.worker_id or new.week_ending<>old.week_ending or new.version<>old.version) then raise exception 'Dati cambiati: riapri la dichiarazione';end if;
 select * into d from public.documents where id=new.document_id for share;
 if not found or d.worker_id is distinct from new.worker_id or d.category<>'presenze' or d.stage not in ('weekly','replacement') or d.review_status='rejected' or d.week_ending<>new.week_ending or exists(select 1 from public.documents where replaces=d.id) then raise exception 'Foglio non valido o già sostituito';end if;
 start_day:=greatest(d.week_ending-4,(d.month||'-01')::date);finish_day:=least(d.week_ending+2,(date_trunc('month',(d.month||'-01')::date)+interval '1 month -1 day')::date,(now() at time zone 'Europe/Rome')::date);expected:=greatest(0,finish_day-start_day+1);
 if jsonb_typeof(new.days)<>'array' or jsonb_array_length(new.days)<>expected or expected=0 then raise exception 'Giorni della settimana non validi';end if;
 for r in select value from jsonb_array_elements(new.days) loop
  if jsonb_typeof(r)<>'object' or not(r ?& array['day','supplementary_minutes','cause','absence_scope','absence_minutes']) then raise exception 'Riga incompleta';end if;
  if jsonb_typeof(r->'cause')<>'string' or jsonb_typeof(r->'day')<>'string' or (r->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Giorno o causale non validi';end if;
  dt:=(r->>'day')::date;if dt<start_day or dt>finish_day or dt=any(seen) then raise exception 'Giorno fuori settimana o duplicato';end if;seen:=array_append(seen,dt);
  if jsonb_typeof(r->'supplementary_minutes')<>'number' or (r->>'supplementary_minutes')!~'^\d+$' then raise exception 'Supplementare non valido';end if;s:=(r->>'supplementary_minutes')::integer;
  if s<0 or s>1440 or r->>'cause' not in ('','F','M','L104','PHR','congedo parentale') then raise exception 'Ore o causale non valide';end if;
  if r->>'cause'='' then if r->>'absence_scope' is not null or r->>'absence_minutes' is not null then raise exception 'Assenza senza causale';end if;a:=0;
  elsif r->>'absence_scope'='full' then if r->>'absence_minutes' is not null then raise exception 'Giornata intera non richiede ore';end if;a:=0;
  elsif r->>'absence_scope'='partial' then if jsonb_typeof(r->'absence_minutes')<>'number' or (r->>'absence_minutes')!~'^\d+$' then raise exception 'Durata assenza non valida';end if;a:=(r->>'absence_minutes')::integer;if a<=0 then raise exception 'Indica le ore di assenza';end if;
  else raise exception 'Tipo assenza non valido';end if;
  if s+a>1440 then raise exception 'Totale oltre 24 ore';end if;
 end loop;
 if not new.confirmed then raise exception 'Conferma la dichiarazione';end if;
 new.version:=case when TG_OP='INSERT' then 1 else old.version+1 end;new.updated_at:=now();return new;
end;$function$;
revoke all on function private.validate_worker_week() from public,anon,authenticated;
CREATE FUNCTION private.save_daily_presence(p_entry jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=private.presence_actor();dt date;v integer;r public.daily_presence;s integer;a integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||actor::text,0));
 if jsonb_typeof(p_entry)<>'object' or not(p_entry ?& array['day','supplementary_minutes','cause','absence_scope','absence_minutes']) or jsonb_typeof(p_entry->'day')<>'string' or (p_entry->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Riga incompleta';end if;
 dt:=(p_entry->>'day')::date;if dt>(now() at time zone 'Europe/Rome')::date then raise exception 'Non puoi compilare giorni futuri';end if;
 if jsonb_typeof(p_entry->'supplementary_minutes')<>'number' or (p_entry->>'supplementary_minutes')!~'^\d+$' or jsonb_typeof(p_entry->'cause')<>'string' then raise exception 'Ore o giustificativo non validi';end if;
 s:=(p_entry->>'supplementary_minutes')::integer;
 if p_entry->>'absence_minutes' is not null then
 if jsonb_typeof(p_entry->'absence_minutes')<>'number' or (p_entry->>'absence_minutes')!~'^\d+$' then raise exception 'Minuti non validi';end if;a:=(p_entry->>'absence_minutes')::integer;end if;
 if (p_entry->>'cause'='' and (p_entry->>'absence_scope' is not null or a is not null)) or (p_entry->>'cause'<>'' and (p_entry->>'absence_scope' is null or p_entry->>'absence_scope' not in ('full','partial') or (p_entry->>'absence_scope'='partial' and (a is null or a<=0)) or (p_entry->>'absence_scope'='full' and a is not null))) then raise exception 'Durata assenza non valida';end if;
 select version into v from public.daily_presence where worker_id=actor and day=dt;
 if v is distinct from p_expected_version then raise exception 'Dati cambiati: riapri la giornata o la settimana';end if;
 insert into public.daily_presence(worker_id,day,supplementary_minutes,cause,absence_scope,absence_minutes,version,updated_at)
 values(actor,dt,s,p_entry->>'cause',p_entry->>'absence_scope',a,coalesce(v,0)+1,clock_timestamp())
 on conflict(worker_id,day) do update set supplementary_minutes=excluded.supplementary_minutes,cause=excluded.cause,absence_scope=excluded.absence_scope,absence_minutes=excluded.absence_minutes,version=excluded.version,updated_at=excluded.updated_at returning * into r;
 update public.daily_notices set read_at=now() where worker_id=actor and day=dt and kind='day' and read_at is null;
 return to_jsonb(r);
end $function$;
revoke all on function private.save_daily_presence(p_entry jsonb, p_expected_version integer) from public,anon,authenticated;
grant execute on function private.save_daily_presence(p_entry jsonb, p_expected_version integer) to authenticated;
CREATE FUNCTION private.read_daily_notice(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=private.presence_actor();begin update public.daily_notices set read_at=now() where id=p_id and worker_id=actor and read_at is null;end $function$;
revoke all on function private.read_daily_notice(p_id uuid) from public,anon,authenticated;
grant execute on function private.read_daily_notice(p_id uuid) to authenticated;
CREATE FUNCTION private.daily_presence_tick()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare secret text;begin
 perform private.collect_daily_presence();
 if exists(select 1 from public.daily_deliveries where state='pending' and attempts<3) then
 select job_token into secret from public.test_push_config where id and public_key is not null;
 if secret is not null then perform net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/daily-presence-push',headers:=jsonb_build_object('Content-Type','application/json','x-push-job',secret),body:='{}'::jsonb,timeout_milliseconds:=10000);end if;
 end if;
end $function$;
revoke all on function private.daily_presence_tick() from public,anon,authenticated;
CREATE FUNCTION private.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid DEFAULT NULL::uuid, p_week_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=private.presence_actor();d public.documents;start_day date;finish_day date;expected integer;e jsonb;dt date;seen date[]:='{}';current_version integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||actor::text,0));
 if p_week_ending is null or extract(isodow from p_week_ending)<>5 then raise exception 'Venerdì non valido';end if;
 start_day:=p_week_ending-4;finish_day:=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date);
 if p_document is not null then
 select * into d from public.documents where id=p_document for share;
 if not found or d.worker_id<>actor or d.category<>'presenze' or d.stage not in ('weekly','replacement') or d.review_status='rejected' or d.week_ending<>p_week_ending or exists(select 1 from public.documents where replaces=d.id) then raise exception 'Foglio non valido';end if;
 start_day:=greatest(start_day,(d.month||'-01')::date);finish_day:=least(finish_day,(date_trunc('month',(d.month||'-01')::date)+interval '1 month -1 day')::date);
 select version into current_version from public.worker_week_changes where document_id=p_document;
 if current_version is distinct from p_week_version then raise exception 'Dati cambiati: riapri la settimana';end if;
 end if;
 expected:=greatest(0,finish_day-start_day+1);
 if p_entries is null or p_versions is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<>expected or expected=0 or jsonb_typeof(p_versions)<>'object' then raise exception 'Controlla tutti i giorni trascorsi';end if;
 for e in select value from jsonb_array_elements(p_entries) loop
 dt:=(e->>'day')::date;if dt is null or dt<start_day or dt>finish_day or dt=any(seen) then raise exception 'Giorno duplicato o fuori settimana';end if;seen:=array_append(seen,dt);
 if not(p_versions ? (e->>'day')) then raise exception 'Versione giorno mancante';end if;
 perform public.save_daily_presence(e,(p_versions->>(e->>'day'))::integer);
 end loop;
 if p_document is not null then
 if current_version is null then insert into public.worker_week_changes(document_id,worker_id,week_ending,days,confirmed) values(p_document,actor,p_week_ending,p_entries,true);
 else update public.worker_week_changes set days=p_entries,confirmed=true,version=current_version where document_id=p_document;end if;
 end if;
 if (select count(*) from public.daily_presence where worker_id=actor and day between p_week_ending-4 and least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date))=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date)-(p_week_ending-4)+1 then
 insert into public.presence_week_confirmations(worker_id,week_ending,confirmed_at) values(actor,p_week_ending,clock_timestamp()) on conflict(worker_id,week_ending) do update set confirmed_at=excluded.confirmed_at;
 end if;
 update public.daily_notices set read_at=now() where worker_id=actor and kind='week' and day=p_week_ending and read_at is null;
end $function$;
revoke all on function private.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid, p_week_version integer) from public,anon,authenticated;
grant execute on function private.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid, p_week_version integer) to authenticated;
CREATE FUNCTION private.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer;day_slots jsonb;slot jsonb;i integer:=0;start_min int;end_min int;previous_end int;first_starts int[]:='{}';last_ends int[]:='{}';first_start int;day_total int;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active) then raise exception 'Accesso amministratore necessario';end if;
 if not exists(select 1 from public.profiles where id=p_worker and role='worker') or p_from is null or p_enabled is null or p_schedule is null or jsonb_typeof(p_schedule)<>'array' or jsonb_array_length(p_schedule)<>7 then raise exception 'Lavoratore, decorrenza o settimana non validi';end if;
 perform pg_advisory_xact_lock(hashtextextended('shifts:'||p_worker::text,0));
 select version into v from public.worker_shifts where worker_id=p_worker and valid_from=p_from;
 if v is distinct from p_expected_version then raise exception 'Fasce cambiate: ricarica prima di salvare';end if;
 for day_slots in select value from jsonb_array_elements(p_schedule) loop
 if jsonb_typeof(day_slots)<>'array' or jsonb_array_length(day_slots)>2 then raise exception 'Massimo due fasce per giorno';end if;
 previous_end:=0;first_start:=null;day_total:=0;
 for slot in select value from jsonb_array_elements(day_slots) loop
 if jsonb_typeof(slot)<>'object' or jsonb_typeof(slot->'start') is distinct from 'string' or jsonb_typeof(slot->'end') is distinct from 'string' or slot->>'start'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or slot->>'end'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Inserisci entrata e uscita in formato HH:MM';end if;
 start_min:=substring(slot->>'start',1,2)::int*60+substring(slot->>'start',4,2)::int;
 end_min:=substring(slot->>'end',1,2)::int*60+substring(slot->>'end',4,2)::int;
 if start_min=end_min then raise exception 'Entrata e uscita non possono coincidere';end if;
 if end_min<start_min then end_min:=end_min+1440;end if;
 if end_min-start_min<30 or start_min<previous_end then raise exception 'Fasce sovrapposte, non ordinate o inferiori a 30 minuti';end if;
 first_start:=coalesce(first_start,start_min);previous_end:=end_min;day_total:=day_total+end_min-start_min;
 end loop;
 if day_total>1440 then raise exception 'Totale giornaliero oltre 24 ore';end if;
 first_starts:=array_append(first_starts,first_start);last_ends:=array_append(last_ends,case when first_start is null then null else previous_end end);
 end loop;
 for i in 1..7 loop
 if last_ends[i]>1440 and first_starts[case when i=7 then 1 else i+1 end] is not null and last_ends[i]-1440>first_starts[case when i=7 then 1 else i+1 end] then raise exception 'Il turno notturno si sovrappone al giorno successivo';end if;
 end loop;
 if p_enabled and not exists(select 1 from jsonb_array_elements(p_schedule) d where jsonb_array_length(d)>0) then raise exception 'Inserisci almeno una fascia o disattiva il promemoria';end if;
 insert into public.worker_shifts(worker_id,valid_from,schedule,enabled,version) values(p_worker,p_from,p_schedule,p_enabled,coalesce(v,0)+1)
 on conflict(worker_id,valid_from) do update set schedule=excluded.schedule,enabled=excluded.enabled,version=excluded.version,updated_at=now();
end $function$;
revoke all on function private.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer) from public,anon,authenticated;
grant execute on function private.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer) to authenticated;
CREATE FUNCTION private.shift_window(p_worker uuid, p_day date)
 RETURNS TABLE(remind_at timestamp with time zone, end_at timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 with current_shift as (select * from public.worker_shifts where worker_id=p_worker and valid_from<=p_day order by valid_from desc limit 1),
 last_slot as (select slot from current_shift cross join lateral jsonb_array_elements(schedule->(extract(isodow from p_day)::int-1)) with ordinality s(slot,ord) where enabled order by ord desc limit 1),
 finish as (select (p_day+(slot->>'end')::time+case when (slot->>'end')::time<(slot->>'start')::time then interval '1 day' else interval '0 day' end) at time zone 'Europe/Rome' as ts from last_slot)
 select ts-interval '30 minutes',ts from finish;
$function$;
revoke all on function private.shift_window(p_worker uuid, p_day date) from public,anon,authenticated;
grant execute on function private.shift_window(p_worker uuid, p_day date) to service_role;
CREATE FUNCTION private.collect_daily_presence(at_time timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ld date:=(at_time at time zone 'Europe/Rome')::date;
begin
 insert into public.daily_notices(worker_id,day,kind,created_at)
 select p.id,work_day,case when extract(isodow from work_day)=5 then 'week' else 'day' end,at_time
 from public.profiles p cross join lateral (values(ld-1),(ld)) days(work_day)
 cross join lateral private.shift_window(p.id,work_day) w
 where p.active and p.role='worker' and at_time>=w.remind_at and at_time<w.end_at
 and ((extract(isodow from work_day)<>5 and not exists(select 1 from public.daily_presence dp where dp.worker_id=p.id and dp.day=work_day)) or
 (extract(isodow from work_day)=5 and not exists(select 1 from public.presence_week_confirmations wc where wc.worker_id=p.id and wc.week_ending=work_day and wc.confirmed_at>=coalesce((select max(updated_at) from public.daily_presence dp where dp.worker_id=p.id and dp.day between work_day-4 and work_day),'-infinity'::timestamptz))))
 on conflict(worker_id,day,kind) do nothing;
 insert into public.daily_deliveries(notice_id,subscription_id)
 select n.id,s.id from public.daily_notices n join public.test_push_subscriptions s on s.user_id=n.worker_id and s.app_scope='production' and s.push_keys is not null
 cross join lateral private.shift_window(n.worker_id,n.day) w
 where n.day between ld-1 and ld and at_time>=w.remind_at and at_time<w.end_at and n.read_at is null on conflict do nothing;
 update public.daily_deliveries set state='failed' where state='sending' and attempted_at<now()-interval '10 minutes';
 update public.daily_deliveries d set state='skipped' where state='pending' and not exists(select 1 from public.daily_notices n cross join lateral private.shift_window(n.worker_id,n.day) w where n.id=d.notice_id and n.read_at is null and at_time>=w.remind_at and at_time<w.end_at);
end $function$;
revoke all on function private.collect_daily_presence(at_time timestamp with time zone) from public,anon,authenticated;
CREATE FUNCTION public.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid DEFAULT NULL::uuid, p_week_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.save_presence_week(p_week_ending,p_entries,p_versions,p_document,p_week_version)$function$;
revoke all on function public.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid, p_week_version integer) from public,anon,authenticated;
grant execute on function public.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid, p_week_version integer) to authenticated;
CREATE FUNCTION public.read_daily_notice(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.read_daily_notice(p_id)$function$;
revoke all on function public.read_daily_notice(p_id uuid) from public,anon,authenticated;
grant execute on function public.read_daily_notice(p_id uuid) to authenticated;
CREATE FUNCTION public.shift_notice_needed(p_worker uuid, p_day date, p_kind text)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 select exists(select 1 from private.shift_window(p_worker,p_day) w join public.profiles p on p.id=p_worker and p.active and p.role='worker' where now()>=w.remind_at and now()<w.end_at
 and ((p_kind='day' and not exists(select 1 from public.daily_presence where worker_id=p_worker and day=p_day)) or (p_kind='week' and not exists(select 1 from public.presence_week_confirmations wc where wc.worker_id=p_worker and wc.week_ending=p_day and wc.confirmed_at>=coalesce((select max(updated_at) from public.daily_presence dp where dp.worker_id=p_worker and dp.day between p_day-4 and p_day),'-infinity'::timestamptz)))));
$function$;
revoke all on function public.shift_notice_needed(p_worker uuid, p_day date, p_kind text) from public,anon,authenticated;
grant execute on function public.shift_notice_needed(p_worker uuid, p_day date, p_kind text) to service_role;
CREATE FUNCTION public.claim_daily_presence()
 RETURNS SETOF daily_deliveries
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 update public.daily_deliveries set state='sending',attempts=attempts+1,attempted_at=now() where (notice_id,subscription_id) in (select notice_id,subscription_id from public.daily_deliveries where state='pending' and attempts<3 and (attempted_at is null or attempted_at<now()-interval '5 minutes') order by notice_id for update skip locked limit 20) returning *;
$function$;
revoke all on function public.claim_daily_presence() from public,anon,authenticated;
grant execute on function public.claim_daily_presence() to service_role;
CREATE FUNCTION public.save_daily_presence(p_entry jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.save_daily_presence(p_entry,p_expected_version)$function$;
revoke all on function public.save_daily_presence(p_entry jsonb, p_expected_version integer) from public,anon,authenticated;
grant execute on function public.save_daily_presence(p_entry jsonb, p_expected_version integer) to authenticated;
CREATE FUNCTION public.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.save_worker_shifts(p_worker,p_from,p_schedule,p_enabled,p_expected_version)$function$;
revoke all on function public.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer) from public,anon,authenticated;
grant execute on function public.save_worker_shifts(p_worker uuid, p_from date, p_schedule jsonb, p_enabled boolean, p_expected_version integer) to authenticated;
create trigger validate_worker_week before insert or update on public.worker_week_changes for each row execute function private.validate_worker_week();

create function private.presence_notice_inbox() returns trigger language plpgsql set search_path='' as $$
begin
 insert into public.app_notifications(user_id,event_key,kind,title,body,created_at,read_at)
 values(new.worker_id,'presence:'||new.kind||':'||new.day::text,case when new.kind='week' then 'presence_week' else 'daily_presence' end,
 case when new.kind='week' then 'Controlla la tua settimana' else 'Aggiorna le presenze di oggi' end,
 case when new.kind='week' then 'Ritrovi quanto hai già inserito. Controlla ore in più e assenze e conferma.' else 'Ore in più o assenze? Segnalale in pochi tocchi.' end,new.created_at,new.read_at)
 on conflict(user_id,event_key) do update set read_at=coalesce(app_notifications.read_at,excluded.read_at);
 return new;
end $$;
revoke all on function private.presence_notice_inbox() from public,anon,authenticated;
create trigger presence_notice_inbox after insert or update of read_at on public.daily_notices for each row execute function private.presence_notice_inbox();


commit;