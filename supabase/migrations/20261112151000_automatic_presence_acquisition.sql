create or replace function private.audit_hour_budget() returns trigger language plpgsql set search_path='' as $$
declare source_actor uuid:=auth.uid();
begin
 if source_actor is null and tg_table_name='hour_budget_days' and new.source_note like '% · Acquisizione automatica' then
  select coalesce(l.account_id,r.account_id) into source_actor from public.hour_budget_registry r left join public.leave_people l on l.person_key=r.imported_person_key where r.person_key=new.person_key;
 end if;
 insert into public.hour_budget_audit(actor,table_name,old_value,new_value)
 values(source_actor,tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create or replace function private.auto_acquire_presence(p_worker uuid,p_day date) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.daily_presence;r public.hour_budget_registry; old_day public.hour_budget_days;
cfg jsonb;rules jsonb;rule jsonb;override_value jsonb;assigned public.hour_budget_assignments;
site text;workplace text;contract integer;absence integer;ordinary integer;allocations jsonb;
marker text;
begin
 perform pg_advisory_xact_lock(hashtextextended('presence:'||p_worker::text,0));
 select * into d from public.daily_presence where worker_id=p_worker and day=p_day;
 if not found or p_day>(now() at time zone 'Europe/Rome')::date then return false;end if;
 select * into r from public.hour_budget_registry b where coalesce((select l.account_id from public.leave_people l where l.person_key=b.imported_person_key),b.account_id)=p_worker;
 if not found then return false;end if;
 select * into old_day from public.hour_budget_days where person_key=r.person_key and day=p_day for update;
 marker:='Dichiarazione del lavoratore del '||to_char(p_day,'DD/MM/YYYY')||' (v'||d.version::text||')';
 if old_day.confirmed and strpos(old_day.source_note,marker)>0 then return true;end if;
 select data into cfg from public.leave_config where person_key=r.imported_person_key;
 rules:=case when jsonb_array_length(coalesce(cfg->'schedules','[]'))>0 then cfg->'schedules' else r.schedules end;
 select value into rule from jsonb_array_elements(coalesce(rules,'[]')) where (value->>'from')::date<=p_day order by value->>'from' desc limit 1;
 if rule is null or not coalesce((rule->>'confirmed')::boolean,false) then return false;end if;
 select value into override_value from jsonb_array_elements(coalesce(cfg->'day_overrides','[]')) where value->>'day'=p_day::text limit 1;
 contract:=round(coalesce(override_value->>'hours',rule->'hours'->>((extract(isodow from p_day)::integer)-1))::numeric*60)::integer;
 if contract is null or contract not between 0 and 1440 then return false;end if;
 select p.site into site from public.profiles p where p.id=p_worker and p.active and p.role='worker';
 select * into assigned from public.hour_budget_assignments where person_key=r.person_key and valid_from<=p_day order by valid_from desc limit 1;
 if assigned.included is false then return false;end if;
 workplace:=case when jsonb_array_length(coalesce(old_day.allocations,'[]'))=1 then old_day.allocations->0->>'workplace' else null end;
 workplace:=coalesce(workplace,case when site in ('N148','N154') then site else coalesce(assigned.workplace,(select p.workplace from public.profiles p where p.id=p_worker)) end);
 if workplace is null then return false;end if;
 absence:=case when d.absence_scope='full' then contract when d.absence_scope='partial' then d.absence_minutes else 0 end;
 if absence is null or absence not between 0 and contract then return false;end if;
 ordinary:=contract-absence;
 if ordinary+d.supplementary_minutes+absence>1440 then return false;end if;
 if jsonb_array_length(coalesce(old_day.allocations,'[]'))>1 then
  with weights as (select value,ordinality,
   (value->>'ordinary')::numeric o,(value->>'overtime')::numeric s from jsonb_array_elements(old_day.allocations) with ordinality),
  parts as (select *,case when sum(o) over()>0 then floor(ordinary*o/sum(o) over())::int else case when ordinality=1 then ordinary else 0 end end po,
   case when sum(s) over()>0 then floor(d.supplementary_minutes*s/sum(s) over())::int else case when value->>'workplace'=workplace then d.supplementary_minutes else 0 end end ps from weights)
  select jsonb_agg(jsonb_build_object('workplace',value->>'workplace',
   'ordinary',po+case when ordinality=1 then ordinary-(select sum(po) from parts) else 0 end,
   'overtime',ps+case when ordinality=1 then d.supplementary_minutes-(select sum(ps) from parts) else 0 end) order by ordinality) into allocations from parts;
 else allocations:=jsonb_build_array(jsonb_build_object('workplace',workplace,'ordinary',ordinary,'overtime',d.supplementary_minutes));end if;
 insert into public.hour_budget_days(person_key,day,allocations,absence_minutes,justification,document_id,source_note,confirmed)
 values(r.person_key,p_day,allocations,absence,d.cause,null,marker||' · Acquisizione automatica',true)
 on conflict(person_key,day) do update set allocations=excluded.allocations,absence_minutes=excluded.absence_minutes,
 justification=excluded.justification,document_id=null,source_note=excluded.source_note,confirmed=true;
 return true;
end $$;
revoke all on function private.auto_acquire_presence(uuid,date) from public,anon,authenticated;
create or replace function private.auto_acquire_presence_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.auto_acquire_presence(new.worker_id,new.day);return new;end $$;
revoke all on function private.auto_acquire_presence_trigger() from public,anon,authenticated;
create trigger auto_acquire_presence after insert or update on public.daily_presence for each row execute function private.auto_acquire_presence_trigger();

CREATE OR REPLACE FUNCTION private.enqueue_presence_review(p_worker uuid, p_mode text, p_period date, p_first date, p_last date, p_version integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v integer; event text;
begin
 if p_worker is distinct from auth.uid() or not exists(select 1 from public.profiles where id=p_worker and active and role='worker') then raise exception 'Accesso lavoratore necessario';end if;
 if p_mode not in ('day','week') or p_first>p_last or p_last>(now() at time zone 'Europe/Rome')::date then raise exception 'Periodo non valido';end if;
 insert into public.presence_review_submissions(worker_id,mode,period,first_day,last_day,version)
 values(p_worker,p_mode,p_period,p_first,p_last,coalesce(p_version,1))
 on conflict(worker_id,mode,period) do update set first_day=excluded.first_day,last_day=excluded.last_day,
 version=coalesce(p_version,presence_review_submissions.version+1),submitted_at=clock_timestamp()
 returning version into v;
 if not exists(
 select 1 from public.daily_presence d where d.worker_id=p_worker and d.day between p_first and p_last
 and not exists(select 1 from public.hour_budget_days b join public.hour_budget_registry r on r.person_key=b.person_key
 left join public.leave_people l on l.person_key=r.imported_person_key
 where coalesce(l.account_id,r.account_id)=p_worker and b.day=d.day and b.confirmed
 and strpos(b.source_note,'Dichiarazione del lavoratore del '||to_char(d.day,'DD/MM/YYYY')||' (v'||d.version::text||')')>0)
 ) then return;end if;
 event:='admin-presence:'||p_mode||':'||p_worker::text||':'||p_period::text||':'||v::text;
 insert into public.app_notifications(user_id,event_key,kind,title,body,created_by)
 select p.id,event,'admin_presence_'||p_mode,case when p_mode='day' then 'Giornata da verificare' else 'Settimana da verificare' end,
 'Un lavoratore ha salvato le presenze. Apri per controllare e confermare.',p_worker
 from public.profiles p where p.active and p.role='admin' on conflict do nothing;
 insert into public.test_push_queue(subscription_id,kind,event_key,message,target_month,created_by)
 select s.id,'admin_review',event,'Sono disponibili nuove presenze da verificare. Apri Lavoro Facile.',to_char(p_period,'YYYY-MM'),p_worker
 from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id
 where p.active and p.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
end $function$
;
