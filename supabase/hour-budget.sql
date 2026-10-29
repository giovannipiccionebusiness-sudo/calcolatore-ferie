-- Separate administrative register; existing profiles, leave data and documents are not modified.
create table public.hour_budget_assignments(person_key text not null references public.leave_people(person_key),valid_from date not null,workplace text, included boolean not null default true,version int not null default 0,primary key(person_key,valid_from));
create table public.hour_budget_days(person_key text not null references public.leave_people(person_key),day date not null,allocations jsonb not null default '[]',absence_minutes int not null default 0 check(absence_minutes between 0 and 1440),justification text not null default '',document_id uuid references public.documents(id),source_note text not null default '',confirmed boolean not null default false,version int not null default 0,primary key(person_key,day));
create table public.hour_budget_calendar(workplace text not null,day date not null,minutes int not null check(minutes between 0 and 1000000),note text not null check(length(trim(note))>0),version int not null default 0,primary key(workplace,day));
create table public.hour_budget_roster(month text primary key check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),confirmed boolean not null default false,version int not null default 0);
create table public.hour_budget_audit(id bigint generated always as identity primary key,actor uuid not null default auth.uid(),table_name text not null,old_value jsonb,new_value jsonb,created_at timestamptz not null default now());
create function private.validate_hour_budget() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; total int := 0; acc uuid; doc public.documents; locations text[] := ARRAY['Tribunale Penale Lecce','Tribunale Civile Lecce','Giudice di Pace Lecce','Corte d’Appello Lecce','Tribunale Minori Lecce','Aula Bunker Lecce','Tribunale/Procura Brindisi','Tribunale Ordinario Taranto','Tribunale Minori Taranto','Procura Taranto','Corte d’Appello Taranto'];
begin
 if tg_op='UPDATE' then if new.version<>old.version then raise exception 'Versione non valida'; end if; new.version:=old.version+1;else new.version:=1;end if;
 if tg_table_name='hour_budget_assignments' then
  if new.included and (new.workplace is null or not(new.workplace=any(locations))) then raise exception 'Scegli una sede valida';end if;
 elsif tg_table_name='hour_budget_calendar' then
  if not(new.workplace=any(locations)) then raise exception 'Sede non valida';end if;
 elsif tg_table_name='hour_budget_days' then
  if jsonb_typeof(new.allocations)<>'array' or jsonb_array_length(new.allocations)>11 then raise exception 'Ripartizione non valida';end if;
  for item in select value from jsonb_array_elements(new.allocations) loop
   if item->>'workplace' is null or not(item->>'workplace'=any(locations)) or item->>'ordinary' is null or item->>'overtime' is null then raise exception 'Sede/ore non valide';end if;
   if (item->>'ordinary')::numeric<>trunc((item->>'ordinary')::numeric) or (item->>'overtime')::numeric<>trunc((item->>'overtime')::numeric) or (item->>'ordinary')::numeric not between 0 and 1440 or (item->>'overtime')::numeric not between 0 and 1440 then raise exception 'Minuti non validi';end if;
   total:=total+(item->>'ordinary')::int+(item->>'overtime')::int;
  end loop;
  if total+new.absence_minutes>1440 then raise exception 'Il totale supera 24 ore';end if;
  if new.absence_minutes>0 and length(trim(new.justification))=0 then raise exception 'Indica il giustificativo';end if;
  if new.document_id is null and length(trim(new.source_note))=0 then raise exception 'Indica il riferimento al foglio esterno';end if;
  if new.day>(now() at time zone 'Europe/Rome')::date then raise exception 'Non confermare presenze future';end if;
  if new.document_id is not null then
   select * into doc from public.documents where id=new.document_id;
   -- account ownership is checked by a private lookup helper below, without exposing leave_people.
   if doc.id is null or doc.worker_id is distinct from private.hour_budget_account(new.person_key) or doc.site<>'N153' or doc.category<>'presenze' or doc.month<>to_char(new.day,'YYYY-MM') or doc.review_status='rejected' or doc.stage not in ('weekly','replacement','final') or (doc.stage<>'final' and (doc.week_ending is null or doc.week_ending<new.day)) then raise exception 'Foglio non valido per lavoratore e giorno';end if;
  end if;
 end if;
 return new;
end $$;
-- Private lookup required because the imported registry is intentionally backend-only.
create function private.hour_budget_account(k text) returns uuid language sql security definer set search_path='' as $$select account_id from public.leave_people where person_key=k and private.is_admin()$$;
revoke all on function private.hour_budget_account(text) from public,anon; grant execute on function private.hour_budget_account(text) to authenticated;
create function private.audit_hour_budget() returns trigger language plpgsql security invoker set search_path='' as $$begin insert into public.hour_budget_audit(table_name,old_value,new_value) values(tg_table_name,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;end $$;
alter table public.hour_budget_assignments enable row level security;
revoke all on public.hour_budget_assignments from public,anon,authenticated;
grant select,insert,update on public.hour_budget_assignments to authenticated;
create policy admin_read on public.hour_budget_assignments for select to authenticated using(private.is_admin());
create policy admin_insert on public.hour_budget_assignments for insert to authenticated with check(private.is_admin());
create policy admin_update on public.hour_budget_assignments for update to authenticated using(private.is_admin()) with check(private.is_admin());
create trigger validate_budget before insert or update on public.hour_budget_assignments for each row execute function private.validate_hour_budget();
create trigger audit_budget after insert or update on public.hour_budget_assignments for each row execute function private.audit_hour_budget();
alter table public.hour_budget_days enable row level security;
revoke all on public.hour_budget_days from public,anon,authenticated;
grant select,insert,update on public.hour_budget_days to authenticated;
create policy admin_read on public.hour_budget_days for select to authenticated using(private.is_admin());
create policy admin_insert on public.hour_budget_days for insert to authenticated with check(private.is_admin());
create policy admin_update on public.hour_budget_days for update to authenticated using(private.is_admin()) with check(private.is_admin());
create trigger validate_budget before insert or update on public.hour_budget_days for each row execute function private.validate_hour_budget();
create trigger audit_budget after insert or update on public.hour_budget_days for each row execute function private.audit_hour_budget();
alter table public.hour_budget_calendar enable row level security;
revoke all on public.hour_budget_calendar from public,anon,authenticated;
grant select,insert,update on public.hour_budget_calendar to authenticated;
create policy admin_read on public.hour_budget_calendar for select to authenticated using(private.is_admin());
create policy admin_insert on public.hour_budget_calendar for insert to authenticated with check(private.is_admin());
create policy admin_update on public.hour_budget_calendar for update to authenticated using(private.is_admin()) with check(private.is_admin());
create trigger validate_budget before insert or update on public.hour_budget_calendar for each row execute function private.validate_hour_budget();
create trigger audit_budget after insert or update on public.hour_budget_calendar for each row execute function private.audit_hour_budget();
alter table public.hour_budget_roster enable row level security;
revoke all on public.hour_budget_roster from public,anon,authenticated;
grant select,insert,update on public.hour_budget_roster to authenticated;
create policy admin_read on public.hour_budget_roster for select to authenticated using(private.is_admin());
create policy admin_insert on public.hour_budget_roster for insert to authenticated with check(private.is_admin());
create policy admin_update on public.hour_budget_roster for update to authenticated using(private.is_admin()) with check(private.is_admin());
create trigger validate_budget before insert or update on public.hour_budget_roster for each row execute function private.validate_hour_budget();
create trigger audit_budget after insert or update on public.hour_budget_roster for each row execute function private.audit_hour_budget();
alter table public.hour_budget_audit enable row level security;
revoke all on public.hour_budget_audit from public,anon,authenticated;
grant select,insert on public.hour_budget_audit to authenticated;
grant usage on sequence public.hour_budget_audit_id_seq to authenticated;
create policy admin_read on public.hour_budget_audit for select to authenticated using(private.is_admin());
create policy admin_insert on public.hour_budget_audit for insert to authenticated with check(private.is_admin() and actor=auth.uid());
