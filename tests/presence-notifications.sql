-- Apply supabase/presence-review-notifications.sql first. QA writes only to temporary copies.
begin;


create temporary table profiles as select id,full_name,site,active,role from public.profiles;
create temporary table documents (like public.documents including defaults);
create temporary table daily_presence (like public.daily_presence including defaults including constraints);
alter table daily_presence add primary key(worker_id,day);
create temporary table daily_notices (like public.daily_notices including defaults);
create temporary table presence_week_confirmations (like public.presence_week_confirmations including defaults);
alter table presence_week_confirmations add primary key(worker_id,week_ending);
create temporary table worker_week_changes (like public.worker_week_changes including defaults);
create temporary table presence_review_submissions (like public.presence_review_submissions including defaults including constraints);
alter table presence_review_submissions add primary key(worker_id,mode,period);
create temporary table app_notifications (like public.app_notifications including defaults);
alter table app_notifications add unique(user_id,event_key);
create temporary table test_push_queue (like public.test_push_queue including defaults including identity);
create temporary table test_push_subscriptions as select * from public.test_push_subscriptions where false;
create temporary table hour_budget_registry (like public.hour_budget_registry including defaults);
create temporary table leave_people as select * from public.leave_people where false;
create temporary table hour_budget_days (like public.hour_budget_days including defaults);
create function pg_temp.presence_actor() returns uuid language plpgsql as $$begin if not exists(select 1 from pg_temp.profiles where id=auth.uid() and active and role='worker') then raise exception 'Forbidden';end if;return auth.uid();end $$;

CREATE OR REPLACE FUNCTION pg_temp.save_daily_presence(p_entry jsonb, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=pg_temp.presence_actor();dt date;v integer;r pg_temp.daily_presence;s integer;a integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||actor::text,0));
 if jsonb_typeof(p_entry)<>'object' or not(p_entry ?& array['day','supplementary_minutes','cause','absence_scope','absence_minutes']) or jsonb_typeof(p_entry->'day')<>'string' or (p_entry->>'day')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Riga incompleta';end if;
 dt:=(p_entry->>'day')::date;if dt>(now() at time zone 'Europe/Rome')::date then raise exception 'Non puoi compilare giorni futuri';end if;
 if jsonb_typeof(p_entry->'supplementary_minutes')<>'number' or (p_entry->>'supplementary_minutes')!~'^\d+$' or jsonb_typeof(p_entry->'cause')<>'string' then raise exception 'Ore o giustificativo non validi';end if;
 s:=(p_entry->>'supplementary_minutes')::integer;
 if p_entry->>'absence_minutes' is not null then
 if jsonb_typeof(p_entry->'absence_minutes')<>'number' or (p_entry->>'absence_minutes')!~'^\d+$' then raise exception 'Minuti non validi';end if;a:=(p_entry->>'absence_minutes')::integer;end if;
 if (p_entry->>'cause'='' and (p_entry->>'absence_scope' is not null or a is not null)) or (p_entry->>'cause'<>'' and (p_entry->>'absence_scope' is null or p_entry->>'absence_scope' not in ('full','partial') or (p_entry->>'absence_scope'='partial' and (a is null or a<=0)) or (p_entry->>'absence_scope'='full' and a is not null))) then raise exception 'Durata assenza non valida';end if;
 select version into v from pg_temp.daily_presence where worker_id=actor and day=dt;
 if v is distinct from p_expected_version then raise exception 'Dati cambiati: riapri la giornata o la settimana';end if;
 insert into pg_temp.daily_presence(worker_id,day,supplementary_minutes,cause,absence_scope,absence_minutes,version,updated_at)
 values(actor,dt,s,p_entry->>'cause',p_entry->>'absence_scope',a,coalesce(v,0)+1,clock_timestamp())
 on conflict(worker_id,day) do update set supplementary_minutes=excluded.supplementary_minutes,cause=excluded.cause,absence_scope=excluded.absence_scope,absence_minutes=excluded.absence_minutes,version=excluded.version,updated_at=excluded.updated_at returning * into r;
 update pg_temp.daily_notices set read_at=now() where worker_id=actor and day=dt and kind='day' and read_at is null;
 return to_jsonb(r);
end $function$;
create function pg_temp.enqueue_presence_review(p_worker uuid,p_mode text,p_period date,p_first date,p_last date,p_version integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v integer; event text;
begin
 if p_worker is distinct from auth.uid() or not exists(select 1 from pg_temp.profiles where id=p_worker and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;
 if p_mode not in ('day','week') or p_first>p_last or p_last>(now() at time zone 'Europe/Rome')::date then raise exception 'Periodo non valido';end if;
 insert into pg_temp.presence_review_submissions(worker_id,mode,period,first_day,last_day,version)
 values(p_worker,p_mode,p_period,p_first,p_last,coalesce(p_version,1))
 on conflict(worker_id,mode,period) do update set first_day=excluded.first_day,last_day=excluded.last_day,
 version=coalesce(p_version,presence_review_submissions.version+1),submitted_at=clock_timestamp()
 returning version into v;
 event:='admin-presence:'||p_mode||':'||p_worker::text||':'||p_period::text||':'||v::text;
 insert into pg_temp.app_notifications(user_id,event_key,kind,title,body,created_by)
 select p.id,event,'admin_presence_'||p_mode,case when p_mode='day' then 'Giornata da verificare' else 'Settimana da verificare' end,
 'Un lavoratore ha salvato le presenze. Apri per controllare e confermare.',p_worker
 from pg_temp.profiles p where p.active and p.role='admin' on conflict do nothing;
 insert into pg_temp.test_push_queue(subscription_id,kind,event_key,message,target_month,created_by)
 select s.id,'admin_review',event,'Sono disponibili nuove presenze da verificare. Apri Lavoro Facile.',to_char(p_period,'YYYY-MM'),p_worker
 from pg_temp.test_push_subscriptions s join pg_temp.profiles p on p.id=s.user_id
 where p.active and p.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
end $$;
create function pg_temp.notify_daily_presence_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('app.presence_week_save',true),'')<>'1' then
 perform pg_temp.enqueue_presence_review(new.worker_id,'day',new.day,new.day,new.day,new.version);
 end if;
 return new;
end $$;
create function pg_temp.get_pending_presence_reviews()
returns table(target_id uuid,task_kind text,title text,person text,site text,month text,created_at timestamptz,day date,mode text,version integer)
language sql security invoker set search_path='' as $$
 with unverified as (
 select d.worker_id,d.day,d.version,d.updated_at from pg_temp.daily_presence d
 where not exists(
 select 1 from pg_temp.hour_budget_days b join pg_temp.hour_budget_registry r on r.person_key=b.person_key
 left join pg_temp.leave_people l on l.person_key=r.imported_person_key
 where coalesce(l.account_id,r.account_id)=d.worker_id and b.day=d.day and b.confirmed
 and strpos(b.source_note,'Dichiarazione del lavoratore del '||to_char(d.day,'DD/MM/YYYY')||' (v'||d.version::text||')')>0
 ))
 select s.worker_id,'presence_'||s.mode,
 (case when s.mode='day' then 'Giornata da verificare · '||to_char(s.period,'DD/MM') else 'Settimana da verificare · '||to_char(s.first_day,'DD/MM')||' – '||to_char(s.last_day,'DD/MM') end),
 coalesce(nullif(p.full_name,''),'Lavoratore'),p.site,to_char(s.period,'YYYY-MM'),s.submitted_at,s.period,s.mode,s.version
 from pg_temp.presence_review_submissions s join pg_temp.profiles p on p.id=s.worker_id and p.active and p.role='worker'
 where exists(select 1 from unverified d where d.worker_id=s.worker_id and d.day between s.first_day and s.last_day and ((s.mode='week' and d.updated_at<=s.submitted_at) or (s.mode='day' and d.version=s.version)))
 and (s.mode='week' or not exists(select 1 from pg_temp.presence_review_submissions w where w.worker_id=s.worker_id and w.mode='week'
 and s.period between w.first_day and w.last_day and w.submitted_at>=s.submitted_at))
$$;
CREATE OR REPLACE FUNCTION pg_temp.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid DEFAULT NULL::uuid, p_week_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior_batch text:=current_setting('app.presence_week_save',true);actor uuid:=pg_temp.presence_actor();d pg_temp.documents;start_day date;finish_day date;expected integer;e jsonb;dt date;seen date[]:='{}';current_version integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||actor::text,0));
 if p_week_ending is null or extract(isodow from p_week_ending)<>5 then raise exception 'Venerdì non valido';end if;
 start_day:=p_week_ending-4;finish_day:=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date);
 if p_document is not null then
 select * into d from pg_temp.documents where id=p_document for share;
 if not found or d.worker_id<>actor or d.category<>'presenze' or d.stage not in ('weekly','replacement') or d.review_status='rejected' or d.week_ending<>p_week_ending or exists(select 1 from pg_temp.documents where replaces=d.id) then raise exception 'Foglio non valido';end if;
 start_day:=greatest(start_day,(d.month||'-01')::date);finish_day:=least(finish_day,(date_trunc('month',(d.month||'-01')::date)+interval '1 month -1 day')::date);
 select version into current_version from pg_temp.worker_week_changes where document_id=p_document;
 if current_version is distinct from p_week_version then raise exception 'Dati cambiati: riapri la settimana';end if;
 end if;
 expected:=greatest(0,finish_day-start_day+1);
 if p_entries is null or p_versions is null or jsonb_typeof(p_entries)<>'array' or jsonb_array_length(p_entries)<>expected or expected=0 or jsonb_typeof(p_versions)<>'object' then raise exception 'Controlla tutti i giorni trascorsi';end if;
 perform set_config('app.presence_week_save','1',true);
 for e in select value from jsonb_array_elements(p_entries) loop
 dt:=(e->>'day')::date;if dt is null or dt<start_day or dt>finish_day or dt=any(seen) then raise exception 'Giorno duplicato o fuori settimana';end if;seen:=array_append(seen,dt);
 if not(p_versions ? (e->>'day')) then raise exception 'Versione giorno mancante';end if;
 perform pg_temp.save_daily_presence(e,(p_versions->>(e->>'day'))::integer);
 end loop;
 if p_document is not null then
 if current_version is null then insert into pg_temp.worker_week_changes(document_id,worker_id,week_ending,days,confirmed) values(p_document,actor,p_week_ending,p_entries,true);
 else update pg_temp.worker_week_changes set days=p_entries,confirmed=true,version=current_version where document_id=p_document;end if;
 end if;
 if (select count(*) from pg_temp.daily_presence where worker_id=actor and day between p_week_ending-4 and least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date))=least(p_week_ending+2,(now() at time zone 'Europe/Rome')::date)-(p_week_ending-4)+1 then
 insert into pg_temp.presence_week_confirmations(worker_id,week_ending,confirmed_at) values(actor,p_week_ending,clock_timestamp()) on conflict(worker_id,week_ending) do update set confirmed_at=excluded.confirmed_at;
 end if;
 perform set_config('app.presence_week_save',coalesce(prior_batch,''),true);
 perform pg_temp.enqueue_presence_review(actor,'week',p_week_ending,start_day,finish_day);
 update pg_temp.daily_notices set read_at=now() where worker_id=actor and kind='week' and day=p_week_ending and read_at is null;
end $function$;

create trigger notify_presence after insert or update on pg_temp.daily_presence for each row execute function pg_temp.notify_daily_presence_review();
do $$
declare w uuid; a integer; entry jsonb; v jsonb; cnt integer; failed boolean;
begin
 select id into w from pg_temp.profiles where active and role='worker' limit 1;
 select count(*) into a from pg_temp.profiles where active and role='admin';if w is null or a=0 then raise exception 'Missing QA actors';end if;
 perform set_config('request.jwt.claim.sub',w::text,true);
 entry:=jsonb_build_object('day','2026-11-02','supplementary_minutes',0,'cause','','absence_scope',null,'absence_minutes',null);
 perform pg_temp.save_daily_presence(entry,null);
 if (select count(*) from pg_temp.app_notifications)<>a then raise exception 'Missing daily notices';end if;
 if (select count(*) from pg_temp.get_pending_presence_reviews())<>1 then raise exception 'Missing daily task';end if;
 failed:=false;begin perform pg_temp.save_daily_presence(entry,null);exception when others then failed:=sqlerrm like 'Dati cambiati%';end;if not failed then raise exception 'Version conflict accepted';end if;
 entry:=jsonb_set(entry,'{supplementary_minutes}','90');perform pg_temp.save_daily_presence(entry,1);
 if (select count(*) from pg_temp.get_pending_presence_reviews())<>1 then raise exception 'Duplicate daily tasks';end if;
 perform pg_temp.save_presence_week('2026-11-06',jsonb_build_array(entry,jsonb_set(entry,'{day}','"2026-11-03"')),jsonb_build_object('2026-11-02',2,'2026-11-03',null),null,null);
 if (select count(*) from pg_temp.app_notifications)<>3*a then raise exception 'Weekly save generated daily duplicates';end if;
 if (select count(*) from pg_temp.get_pending_presence_reviews())<>1 or not exists(select 1 from pg_temp.get_pending_presence_reviews() where mode='week') then raise exception 'Week did not replace day task';end if;
 insert into pg_temp.hour_budget_registry(person_key,account_id) values('QA:presence',w);
 insert into pg_temp.hour_budget_days(person_key,day,allocations,absence_minutes,justification,source_note,confirmed)
 select 'QA:presence',d.day,'[]'::jsonb,0,'','Dichiarazione del lavoratore del '||to_char(d.day,'DD/MM/YYYY')||' (v'||d.version||')',true from pg_temp.daily_presence d;
 if exists(select 1 from pg_temp.get_pending_presence_reviews()) then raise exception 'Verified week remains pending';end if;
 perform pg_temp.save_daily_presence(entry,3);
 if (select count(*) from pg_temp.get_pending_presence_reviews())<>1 or not exists(select 1 from pg_temp.get_pending_presence_reviews() where mode='day' and version=4) then raise exception 'Correction did not reopen exactly one task';end if;
 if exists(select 1 from pg_temp.test_push_queue) then raise exception 'QA unexpectedly generated deliveries';end if;
end $$;
select 'PASS: day/week notices, version conflicts, one weekly notice per admin, no daily duplicates, verified dismissal, corrected day reopening, no real deliveries' as checks;

rollback;