begin;
create table public.attendance_auto_jobs (
 document_id uuid primary key references public.documents(id) on delete cascade,
 source_path text not null,status text not null default 'queued' check(status in ('queued','processing','done','review','failed','cancelled')),
 attempts integer not null default 0 check(attempts between 0 and 3),lease uuid,started_at timestamptz,created_at timestamptz not null default now(),finished_at timestamptz,message text
);
create table public.attendance_auto_rows (
 document_id uuid not null references public.attendance_auto_jobs(document_id) on delete cascade,
 day date not null,reading jsonb not null,primary key(document_id,day)
);
alter table public.attendance_auto_jobs enable row level security;
alter table public.attendance_auto_rows enable row level security;
revoke all on public.attendance_auto_jobs,public.attendance_auto_rows from public,anon,authenticated;
grant select on public.attendance_auto_jobs,public.attendance_auto_rows to authenticated;
grant all on public.attendance_auto_jobs,public.attendance_auto_rows to service_role;
create policy admin_auto_jobs on public.attendance_auto_jobs for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and active));
create policy admin_auto_rows on public.attendance_auto_rows for select to authenticated using(exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin' and active));
create index attendance_auto_pending on public.attendance_auto_jobs(created_at) where status in ('queued','processing');
create or replace function private.enqueue_attendance_auto() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.category='presenze' and new.stage in ('weekly','replacement','final') and new.review_status<>'rejected' then
  insert into public.attendance_auto_jobs(document_id,source_path) values(new.id,new.file_path) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.enqueue_attendance_auto() from public,anon,authenticated;
create trigger enqueue_attendance_auto after insert on public.documents for each row execute function private.enqueue_attendance_auto();
-- No historical backfill: only uploads created after activation enter this queue.
do $$begin
 if not exists(select 1 from vault.secrets where name='attendance_auto_worker_token') then
  perform vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'attendance_auto_worker_token');
 end if;
end;$$;
create function public.attendance_auto_authorized(p_token text) returns boolean language sql security definer set search_path='' as $$
 select p_token is not null and length(p_token)>60 and exists(select 1 from vault.decrypted_secrets where name='attendance_auto_worker_token' and decrypted_secret=p_token);
$$;
revoke all on function public.attendance_auto_authorized(text) from public,anon,authenticated;
grant execute on function public.attendance_auto_authorized(text) to service_role;
create function public.attendance_auto_claim() returns jsonb language plpgsql set search_path='' as $$
declare j public.attendance_auto_jobs;
begin
 perform pg_advisory_xact_lock(73910432);
 if exists(select 1 from public.attendance_auto_jobs where status='processing' and started_at>now()-interval '5 minutes') then return null;end if;
 update public.attendance_auto_jobs set status='failed',message='Tre tentativi non completati: verifica manuale' where status='processing' and started_at<=now()-interval '5 minutes' and attempts>=3;
 select * into j from public.attendance_auto_jobs where (status='queued' or status='processing' and started_at<=now()-interval '5 minutes') and attempts<3 order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.attendance_auto_jobs set status='processing',attempts=attempts+1,lease=gen_random_uuid(),started_at=now(),message=null where document_id=j.document_id returning * into j;
 return to_jsonb(j);
end;$$;
revoke all on function public.attendance_auto_claim() from public,anon,authenticated;
grant execute on function public.attendance_auto_claim() to service_role;
create function public.attendance_auto_finish(p_document uuid,p_lease uuid,p_path text,p_result jsonb) returns void language plpgsql set search_path='' as $$
declare d public.documents;r jsonb;dt date;
begin
 perform 1 from public.attendance_auto_jobs where document_id=p_document and lease=p_lease and status='processing' for update;
 if not found then raise exception 'Lease non valida';end if;
 select * into d from public.documents where id=p_document for share;
 if d.file_path<>p_path or d.review_status='rejected' then raise exception 'Documento modificato o respinto';end if;
 if p_result->>'month' is distinct from d.month then raise exception 'Mese non corrispondente';end if;
 for r in select value from jsonb_array_elements(p_result->'rows') loop
  dt:=(d.month||'-'||lpad(r->>'day',2,'0'))::date;
  if dt<=((now() at time zone 'Europe/Rome')::date) and (d.stage='final' or dt between d.week_ending-(extract(isodow from d.week_ending)::integer-1) and d.week_ending) then
   insert into public.attendance_auto_rows(document_id,day,reading) values(d.id,dt,r) on conflict(document_id,day) do update set reading=excluded.reading;
  end if;
 end loop;
 update public.attendance_auto_jobs set status='done',finished_at=now(),message='Lettura automatica pronta: ore da verificare' where document_id=d.id and lease=p_lease;
end;$$;
revoke all on function public.attendance_auto_finish(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.attendance_auto_finish(uuid,uuid,text,jsonb) to service_role;
select cron.schedule('lavoro-facile-attendance-auto','* * * * *',$cron$
 select net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/attendance-auto',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('token',(select decrypted_secret from vault.decrypted_secrets where name='attendance_auto_worker_token')),timeout_milliseconds:=5000)
 where exists(select 1 from public.attendance_auto_jobs where status='queued' or status='processing' and started_at<now()-interval '5 minutes');
$cron$);
commit;
