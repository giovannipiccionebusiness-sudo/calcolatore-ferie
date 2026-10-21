create table public.document_scan_archive_jobs(
 document_id uuid primary key references public.documents(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','processing','retry','done')),
 algorithm_version integer not null, scan_path text not null, google_scan_id text,
 scan_hash text, original_hash text, pair_verified_at timestamptz, last_error text,
 lease_id uuid, next_attempt_at timestamptz not null default now(),created_at timestamptz not null default now()
);
alter table public.document_scan_archive_jobs enable row level security;
revoke all on public.document_scan_archive_jobs from anon,authenticated;
grant all on public.document_scan_archive_jobs to service_role;
grant select on public.document_scan_archive_jobs to authenticated;
create policy scan_archive_admin_read on public.document_scan_archive_jobs for select to authenticated using(private.is_admin());
create function private.queue_document_scan() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.documents d where d.id=new.document_id and d.category<>'presenze') then
  insert into public.document_scan_archive_jobs(document_id,algorithm_version,scan_path) values(new.document_id,new.algorithm_version,new.file_path)
  on conflict(document_id) do update set algorithm_version=excluded.algorithm_version,scan_path=excluded.scan_path,status='pending',next_attempt_at=now(),pair_verified_at=null,scan_hash=null,lease_id=null,last_error=null
  where document_scan_archive_jobs.algorithm_version is distinct from excluded.algorithm_version or document_scan_archive_jobs.scan_path is distinct from excluded.scan_path;
 end if;return new;
end $$;
revoke all on function private.queue_document_scan() from public,anon,authenticated;
create trigger queue_document_scan after insert or update on public.test_document_scans for each row execute function private.queue_document_scan();
-- No backfill. Only new/regenerated scan rows enqueue work.
create function public.document_scan_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare lease uuid;j public.document_scan_archive_jobs;
begin
 update public.drive_runtime set lease_id=gen_random_uuid(),lease_until=now()+interval '10 minutes' where singleton and(lease_until is null or lease_until<now()) returning lease_id into lease;
 if lease is null then return null;end if;
 select c.* into j from public.document_scan_archive_jobs c join public.drive_archive_jobs a on a.document_id=c.document_id join public.documents d on d.id=c.document_id
 where c.status<>'done' and c.next_attempt_at<=now() and a.status='archived' and d.category<>'presenze'
 order by c.created_at for update of c skip locked limit 1;
 if not found then update public.drive_runtime set lease_until=null where singleton and lease_id=lease;return null;end if;
 update public.document_scan_archive_jobs set status='processing',lease_id=lease,next_attempt_at=now()+interval '10 minutes' where document_id=j.document_id returning * into j;
 return jsonb_build_object('lease',lease,'job',to_jsonb(j));
end $$;
create function public.document_scan_guard(p_document uuid,p_lease uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.document_scan_archive_jobs j join public.test_document_scans s on s.document_id=j.document_id join public.documents d on d.id=j.document_id join public.drive_runtime r on r.singleton
 where j.document_id=p_document and j.lease_id=p_lease and r.lease_id=p_lease and r.lease_until>now() and d.category<>'presenze' and s.source_path=d.file_path and s.file_path=j.scan_path and s.algorithm_version=j.algorithm_version)
$$;
revoke all on function public.document_scan_claim(),public.document_scan_guard(uuid,uuid) from public,anon,authenticated;
grant execute on function public.document_scan_claim(),public.document_scan_guard(uuid,uuid) to service_role;
create function private.schedule_document_scan() returns bigint language plpgsql security definer set search_path='' as $$
declare rid bigint;
begin
 if not exists(select 1 from public.document_scan_archive_jobs j join public.drive_archive_jobs a on a.document_id=j.document_id where j.status<>'done' and j.next_attempt_at<=now() and a.status='archived') then return null;end if;
 select net.http_post(url:='https://vffnfulorjftailxyghp.supabase.co/functions/v1/document-scan-archive/worker',headers:=jsonb_build_object('Content-Type','application/json','x-drive-worker',(select worker_key from public.drive_runtime where singleton)),body:='{}'::jsonb,timeout_milliseconds:=120000) into rid;return rid;
end $$;
revoke all on function private.schedule_document_scan() from public,anon,authenticated;
select cron.schedule('ferie-facili-document-scans','* * * * *','select private.schedule_document_scan()');
