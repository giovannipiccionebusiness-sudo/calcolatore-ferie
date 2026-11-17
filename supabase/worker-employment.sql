begin;
create table public.worker_employment_status (
 worker_key text primary key,
 person_key text unique references public.leave_people(person_key),
 account_id uuid unique references public.profiles(id),
 last_day date,
 version integer not null default 1 check(version>0),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 check(person_key is not null or account_id is not null)
);
alter table public.worker_employment_status enable row level security;
revoke all on public.worker_employment_status from public,anon,authenticated;
grant select,insert,update on public.worker_employment_status to authenticated;
create policy employment_read on public.worker_employment_status for select to authenticated using ((select private.is_admin()));
create policy employment_insert on public.worker_employment_status for insert to authenticated with check ((select private.is_admin()) and updated_by=(select auth.uid()));
create policy employment_update on public.worker_employment_status for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()) and updated_by=(select auth.uid()));
-- Narrow private lookup: leave_people is intentionally not exposed to authenticated clients.
create function private.employment_identity(p_worker_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare person text; account uuid;
begin
 if not private.is_admin() then raise exception 'Non autorizzato';end if;
 select p.person_key,p.account_id into person,account from public.leave_people p where p.person_key=p_worker_key or p.account_id::text=p_worker_key;
 if person is null then select p.id into account from public.profiles p where p.id::text=p_worker_key and p.role='worker';end if;
 -- Accept the previous key when a report-only worker has subsequently been linked to an account.
 if person is null and account is null then
 select s.person_key,s.account_id into person,account from public.worker_employment_status s where s.worker_key=p_worker_key;
 end if;
 return jsonb_build_object('person',person,'account',account);
end $$;
revoke all on function private.employment_identity(text) from public,anon;
grant execute on function private.employment_identity(text) to authenticated;
create function public.set_worker_employment(p_worker_key text,p_last_day date,p_expected_version integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare person text; account uuid; existing public.worker_employment_status; result public.worker_employment_status;
begin
 if not private.is_admin() then raise exception 'Operazione riservata all’amministratore';end if;
 if p_last_day is not null and (p_last_day<'2000-01-01' or p_last_day>'2100-12-31') then raise exception 'Data di cessazione non valida';end if;
 select (x->>'person')::text,(x->>'account')::uuid into person,account from (select private.employment_identity(p_worker_key) x) q;
 if person is null and account is null then raise exception 'Lavoratore non trovato';end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(person,account::text),712));
 select * into existing from public.worker_employment_status s where s.worker_key=p_worker_key or (person is not null and s.person_key=person) or (account is not null and s.account_id=account) for update;
 if coalesce(existing.version,0)<>p_expected_version then raise exception 'Dati modificati: premi Carica / aggiorna prima di salvare';end if;
 if existing.worker_key is null then
 insert into public.worker_employment_status(worker_key,person_key,account_id,last_day,updated_by) values(p_worker_key,person,account,p_last_day,auth.uid()) returning * into result;
 else
 update public.worker_employment_status set last_day=p_last_day,person_key=person,account_id=account,version=version+1,updated_by=auth.uid(),updated_at=now() where worker_key=existing.worker_key returning * into result;
 end if;
 return to_jsonb(result);
end $$;
revoke all on function public.set_worker_employment(text,date,integer) from public,anon;
grant execute on function public.set_worker_employment(text,date,integer) to authenticated;
commit;
