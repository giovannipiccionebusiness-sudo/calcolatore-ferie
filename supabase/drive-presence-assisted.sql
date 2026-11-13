create or replace function private.lock_drive_presence_pilot(p_day date) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='admin') then raise exception 'Accesso amministratore necessario';end if;
 perform pg_advisory_xact_lock(hashtextextended('presence:60d6c259-e421-474b-9c5c-cc1d641e32d5',0));
 perform 1 from public.daily_presence where worker_id='60d6c259-e421-474b-9c5c-cc1d641e32d5'::uuid and day=p_day for share;
 perform 1 from public.worker_shifts where worker_id='60d6c259-e421-474b-9c5c-cc1d641e32d5'::uuid and valid_from<=p_day for share;
end $$;
revoke all on function private.lock_drive_presence_pilot(date) from public,anon;
grant execute on function private.lock_drive_presence_pilot(date) to authenticated;

-- One-worker assisted pilot. RLS and the existing budget audit remain in force.
create or replace function public.confirm_drive_presence_pilot(
 p_document uuid,p_day date,p_values jsonb,p_budget_version integer,p_declaration_version integer,
 p_shift_version integer,p_reviewed boolean,p_setup boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare worker constant uuid:='60d6c259-e421-474b-9c5c-cc1d641e32d5';
 doc public.documents;reg public.hour_budget_registry;old public.hour_budget_days;decl public.daily_presence;shift public.worker_shifts;
 key text;loc text;ord integer;extra integer;absent integer;cause text;alloc jsonb;note text;hours jsonb;row_value jsonb;idx integer;mins integer;interval_value jsonb;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active and role='admin') then raise exception 'Accesso amministratore necessario';end if;
 if p_reviewed is distinct from true then raise exception 'Controlla giorno, ritaglio e valori prima di confermare';end if;
 if p_day is null or p_day>(now() at time zone 'Europe/Rome')::date then raise exception 'Giorno non valido o futuro';end if;
 -- Same lock used by the automatic acquisition of daily declarations.
 perform private.lock_drive_presence_pilot(p_day);
 select * into doc from public.documents where id=p_document for share;
 if doc.id is null or doc.worker_id is distinct from worker or doc.category<>'presenze' or doc.site<>'N153' or doc.review_status='rejected' or doc.stage not in ('weekly','replacement','final') or doc.month<>to_char(p_day,'YYYY-MM') or (doc.stage<>'final' and (doc.week_ending is null or p_day>doc.week_ending or p_day<date_trunc('week',doc.week_ending)::date)) then raise exception 'Foglio non valido per questo giorno';end if;
 if exists(select 1 from public.documents d where d.worker_id=worker and d.category='presenze' and d.month=doc.month and d.review_status<>'rejected' and d.id<>doc.id and (d.stage='final' and (doc.stage<>'final' or d.created_at>doc.created_at) or doc.stage<>'final' and d.stage in ('weekly','replacement') and d.week_ending>=p_day and p_day>=date_trunc('week',d.week_ending)::date and d.created_at>doc.created_at)) then raise exception 'Esiste un foglio più recente o definitivo: ricarica il confronto';end if;
 select * into decl from public.daily_presence where worker_id=worker and day=p_day;
 if decl.version is distinct from p_declaration_version then raise exception 'La giornata nell’app è cambiata: ricarica il confronto';end if;
 select * into shift from public.worker_shifts where worker_id=worker and valid_from<=p_day order by valid_from desc limit 1;
 if shift.version is distinct from p_shift_version then raise exception 'Il turno è cambiato: ricarica il confronto';end if;
 loc:=p_values->>'workplace';cause:=coalesce(p_values->>'cause','');
 if coalesce(p_values->>'ordinary','')!~'^\d+$' or coalesce(p_values->>'extra','')!~'^\d+$' or coalesce(p_values->>'absence','')!~'^\d+$' then raise exception 'Indica ore e minuti validi';end if;
 ord:=(p_values->>'ordinary')::integer;extra:=(p_values->>'extra')::integer;absent:=(p_values->>'absence')::integer;
 if ord<0 or extra<0 or absent<0 or ord+extra+absent>1440 or length(cause)>30 or absent>0 and cause='' or absent=0 and cause<>'' then raise exception 'Ore o giustificativo non coerenti';end if;
 if cause not in ('','F','M','L104','congedo parentale','PHR') then raise exception 'Giustificativo non valido';end if;
 select * into reg from public.hour_budget_registry where account_id=worker or private.hour_budget_account(person_key)=worker limit 1 for update;
 if reg.person_key is null then
  if p_setup is distinct from true or shift.worker_id is null then raise exception 'Conferma prima collegamento, turno e sede del lavoratore';end if;
  hours:='[]'::jsonb;
  for idx in 0..6 loop
   mins:=0;
   for interval_value in select value from jsonb_array_elements(coalesce(shift.schedule->idx,'[]'::jsonb)) loop
    mins:=mins+extract(epoch from ((interval_value->>'end')::time-(interval_value->>'start')::time))::integer/60;
   end loop;
   if mins<0 or mins>1440 then raise exception 'Turno non valido';end if;
   hours:=hours||jsonb_build_array(mins::numeric/60);
  end loop;
  insert into public.hour_budget_registry(person_key,account_id,imported_person_key,schedules)
   values('ACCOUNT:'||worker::text,worker,null,jsonb_build_array(jsonb_build_object('from',shift.valid_from,'confirmed',true,'hours',hours))) returning * into reg;
  insert into public.hour_budget_assignments(person_key,valid_from,workplace,included) values(reg.person_key,shift.valid_from,loc,true);
 end if;
 key:=reg.person_key;
 select * into old from public.hour_budget_days where person_key=key and day=p_day for update;
 if old.version is distinct from p_budget_version then raise exception 'Il budget è cambiato: ricarica il confronto';end if;
 -- Explicit single-site replacement: the UI warns when a multi-site day exists.
 alloc:=jsonb_build_array(jsonb_build_object('workplace',loc,'ordinary',ord,'overtime',extra));
 note:='OCR assistito · Controllato dall’amministratore · dichiarazione v'||coalesce(p_declaration_version::text,'assente')||' · '||left(coalesce(p_values->>'evidence',''),1500);
 if old.person_key is null then
  insert into public.hour_budget_days(person_key,day,allocations,absence_minutes,justification,document_id,source_note,confirmed)
  values(key,p_day,alloc,absent,cause,doc.id,note,true) returning * into old;
 else
  update public.hour_budget_days set allocations=alloc,absence_minutes=absent,justification=cause,document_id=doc.id,source_note=note,confirmed=true
   where person_key=key and day=p_day returning * into old;
 end if;
 return to_jsonb(old);
end $$;
revoke all on function public.confirm_drive_presence_pilot(uuid,date,jsonb,integer,integer,integer,boolean,boolean) from public,anon;
grant execute on function public.confirm_drive_presence_pilot(uuid,date,jsonb,integer,integer,integer,boolean,boolean) to authenticated;

-- Do not let later worker declarations overwrite a human-confirmed OCR decision.
-- A changed declaration remains available to the existing presence review workflow.

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
 if p_worker='60d6c259-e421-474b-9c5c-cc1d641e32d5'::uuid and old_day.confirmed and old_day.source_note like 'OCR assistito%' then return false;end if;
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
