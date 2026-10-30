begin;
alter table public.hour_budget_registry add column if not exists surname text check(surname is null or length(surname) between 1 and 150), add column if not exists given_name text check(given_name is null or length(given_name)<=150);
-- Extend the existing validation without changing authorization or saved data.
do $$
declare code text;
begin
 code:=pg_get_functiondef('private.validate_budget_identity()'::regprocedure);
 code:=replace(code,'site=''N153''','site in (''N153'',''N148'',''N154'')');
 code:=replace(code,'Scegli un account lavoratore N153','Scegli un account lavoratore con CDC valido');
 execute code;
 code:=pg_get_functiondef('private.validate_hour_budget()'::regprocedure);
 code:=replace(code,'''Corte d’Appello Taranto''];','''Corte d’Appello Taranto'',''N148'',''N154''];');
 code:=replace(code,'doc.site<>''N153''','doc.site not in (''N153'',''N148'',''N154'')');
 execute code;
end $$;
create table if not exists public.presence_week_marks(
 person_key text not null references public.hour_budget_registry(person_key),
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 site text not null check(site in ('N153','N148','N154')),
 week_start date not null check(extract(isodow from week_start)=1),
 done boolean not null default false,
 fingerprint text not null check(length(fingerprint)<=20000),
 updated_at timestamptz not null default now(),
 updated_by uuid not null default auth.uid() references public.profiles(id),
 version integer not null default 1,
 primary key(person_key,month,site,week_start),
 check(week_start<=((month||'-01')::date+interval '1 month - 1 day')::date and week_start+6>=(month||'-01')::date)
);
create table if not exists public.presence_cdc_checks(
 site text not null check(site in ('N153','N148','N154')),
 month text not null check(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 confirmed boolean not null default false,
 version integer not null default 1,
 primary key(site,month)
);
create or replace function private.validate_presence_week_mark() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.person_key,new.month,new.site,new.week_start) is distinct from (old.person_key,old.month,old.site,old.week_start) then raise exception 'Identità non modificabile';end if;
  if new.version<>old.version then raise exception 'Dati cambiati, aggiorna e riprova';end if;
  new.version:=old.version+1;
 else new.version:=1;end if;
 new.updated_by:=auth.uid();new.updated_at:=now();return new;
end $$;
alter table public.presence_week_marks enable row level security;
alter table public.presence_cdc_checks enable row level security;
revoke all on public.presence_week_marks,public.presence_cdc_checks from anon;
grant select,insert,update on public.presence_week_marks,public.presence_cdc_checks to authenticated;
create policy admin_read on public.presence_week_marks for select to authenticated using(private.is_admin());
create policy admin_insert on public.presence_week_marks for insert to authenticated with check(private.is_admin());
create policy admin_update on public.presence_week_marks for update to authenticated using(private.is_admin()) with check(private.is_admin());
create policy admin_read on public.presence_cdc_checks for select to authenticated using(private.is_admin());
create policy admin_insert on public.presence_cdc_checks for insert to authenticated with check(private.is_admin());
create policy admin_update on public.presence_cdc_checks for update to authenticated using(private.is_admin()) with check(private.is_admin());
create trigger validate_presence_mark before insert or update on public.presence_week_marks for each row execute function private.validate_presence_week_mark();
create trigger validate_presence_check before insert or update on public.presence_cdc_checks for each row execute function private.validate_hour_budget();
create trigger audit_presence_mark after insert or update on public.presence_week_marks for each row execute function private.audit_hour_budget();
create trigger audit_presence_check after insert or update on public.presence_cdc_checks for each row execute function private.audit_hour_budget();
commit;
