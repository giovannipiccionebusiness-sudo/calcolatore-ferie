create table public.presence_review_submissions(
 worker_id uuid not null references public.profiles(id) on delete cascade,
 mode text not null check(mode in ('day','week')), period date not null,
 first_day date not null,last_day date not null,version integer not null check(version>0),
 submitted_at timestamptz not null default clock_timestamp(),
 primary key(worker_id,mode,period),check(first_day<=last_day)
);
alter table public.presence_review_submissions enable row level security;
revoke all on public.presence_review_submissions from anon,authenticated;
grant all on public.presence_review_submissions to service_role;

create function private.enqueue_presence_review(p_worker uuid,p_mode text,p_period date,p_first date,p_last date,p_version integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare v integer; event text;
begin
 if p_worker is distinct from auth.uid() or not exists(select 1 from public.profiles where id=p_worker and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;
 if p_mode not in ('day','week') or p_first>p_last or p_last>(now() at time zone 'Europe/Rome')::date then raise exception 'Periodo non valido';end if;
 insert into public.presence_review_submissions(worker_id,mode,period,first_day,last_day,version)
 values(p_worker,p_mode,p_period,p_first,p_last,coalesce(p_version,1))
 on conflict(worker_id,mode,period) do update set first_day=excluded.first_day,last_day=excluded.last_day,
 version=coalesce(p_version,presence_review_submissions.version+1),submitted_at=clock_timestamp()
 returning version into v;
 event:='admin-presence:'||p_mode||':'||p_worker::text||':'||p_period::text||':'||v::text;
 insert into public.app_notifications(user_id,event_key,kind,title,body,created_by)
 select p.id,event,'admin_presence_'||p_mode,case when p_mode='day' then 'Giornata da verificare' else 'Settimana da verificare' end,
 'Un lavoratore ha salvato le presenze. Apri per controllare e confermare.',p_worker
 from public.profiles p where p.active and p.role='admin' on conflict do nothing;
 insert into public.test_push_queue(subscription_id,kind,event_key,message,target_month,created_by)
 select s.id,'admin_review',event,'Sono disponibili nuove presenze da verificare. Apri Lavoro Facile.',to_char(p_period,'YYYY-MM'),p_worker
 from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
 where p.active and p.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
end $$;
revoke all on function private.enqueue_presence_review(uuid,text,date,date,date,integer) from public,anon,authenticated,service_role;

create function private.notify_daily_presence_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('app.presence_week_save',true),'')<>'1' then
 perform private.enqueue_presence_review(new.worker_id,'day',new.day,new.day,new.day,new.version);
 end if;
 return new;
end $$;
revoke all on function private.notify_daily_presence_review() from public,anon,authenticated,service_role;
create trigger notify_daily_presence_review after insert or update on public.daily_presence
for each row execute function private.notify_daily_presence_review();

create function public.get_pending_presence_reviews()
returns table(target_id uuid,task_kind text,title text,person text,site text,month text,created_at timestamptz,day date,mode text,version integer)
language sql security invoker set search_path='' as $$
 with unverified as (
 select d.worker_id,d.day,d.version,d.updated_at from public.daily_presence d
 where not exists(
 select 1 from public.hour_budget_days b join public.hour_budget_registry r on r.person_key=b.person_key
 left join public.leave_people l on l.person_key=r.imported_person_key
 where coalesce(l.account_id,r.account_id)=d.worker_id and b.day=d.day and b.confirmed
 and strpos(b.source_note,'Dichiarazione del lavoratore del '||to_char(d.day,'DD/MM/YYYY')||' (v'||d.version::text||')')>0
 ))
 select s.worker_id,'presence_'||s.mode,
 (case when s.mode='day' then 'Giornata da verificare · '||to_char(s.period,'DD/MM') else 'Settimana da verificare · '||to_char(s.first_day,'DD/MM')||' – '||to_char(s.last_day,'DD/MM') end),
 coalesce(nullif(p.full_name,''),'Lavoratore'),p.site,to_char(s.period,'YYYY-MM'),s.submitted_at,s.period,s.mode,s.version
 from public.presence_review_submissions s join public.profiles p on p.id=s.worker_id and p.active and p.role='worker'
 where exists(select 1 from unverified d where d.worker_id=s.worker_id and d.day between s.first_day and s.last_day and ((s.mode='week' and d.updated_at<=s.submitted_at) or (s.mode='day' and d.version=s.version)))
 and (s.mode='week' or not exists(select 1 from public.presence_review_submissions w where w.worker_id=s.worker_id and w.mode='week'
 and s.period between w.first_day and w.last_day and w.submitted_at>=s.submitted_at))
$$;
revoke all on function public.get_pending_presence_reviews() from public,anon,authenticated;
grant execute on function public.get_pending_presence_reviews() to service_role;

CREATE OR REPLACE FUNCTION private.save_presence_week(p_week_ending date, p_entries jsonb, p_versions jsonb, p_document uuid DEFAULT NULL::uuid, p_week_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare prior_batch text:=current_setting('app.presence_week_save',true);actor uuid:=private.presence_actor();d public.documents;start_day date;finish_day date;expected integer;e jsonb;dt date;seen date[]:='{}';current_version integer;
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
 perform set_config('app.presence_week_save','1',true);
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
 perform set_config('app.presence_week_save',coalesce(prior_batch,''),true);
 perform private.enqueue_presence_review(actor,'week',p_week_ending,start_day,finish_day);
 update public.daily_notices set read_at=now() where worker_id=actor and kind='week' and day=p_week_ending and read_at is null;
end $function$;

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
 select d.id,case when d.review_status='pending' then 'review' else 'authorization' end,
 case when d.review_status='pending' then 'Documento da verificare' else 'Richiesta da autorizzare' end,
 coalesce(nullif(p.full_name,''),nullif(d.recipient_name,''),'Lavoratore')||' · '||case d.category when 'presenze' then 'Foglio presenze' when 'ferie' then 'Ferie' when 'rol' then 'Permessi ROL' when 'legge104' then 'Legge 104' when 'malattia' then 'Malattia' when 'congedo_parentale' then 'Congedo parentale' else 'Documento' end,
 d.site,d.month,d.created_at,null::date,null::text,null::integer from public.documents d left join public.profiles p on p.id=d.worker_id
 where (d.review_status='pending' or (d.review_status='verified' and d.category in ('ferie','rol') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 union all select * from public.get_pending_presence_reviews()
 ), page as (select * from tasks order by created_at desc,target_id desc offset greatest(0,least(page_offset,100000)) limit 30)
 select jsonb_build_object('total',(select count(*) from tasks),'registrations',(select count(*) from tasks where task_kind='registration'),'reviews',(select count(*) from tasks where task_kind='review'),'authorizations',(select count(*) from tasks where task_kind='authorization'),'presence_days',(select count(*) from tasks where task_kind='presence_day'),'presence_weeks',(select count(*) from tasks where task_kind='presence_week'),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,target_id desc) from page),'[]'::jsonb)) into result;
 return result;
end $function$;

