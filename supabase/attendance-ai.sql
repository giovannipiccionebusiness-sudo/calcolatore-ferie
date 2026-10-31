-- Internal AI drafts only. Actual attendance remains in hour_budget_days after human review.
create table public.attendance_ai_drafts (
 document_id uuid primary key references public.documents(id) on delete cascade,
 source_path text not null, prompt_version integer not null default 1,
 status text not null check(status in ('processing','done','failed')),
 lease_id uuid not null, started_at timestamptz not null default now(),
 requested_by uuid not null references public.profiles(id), attempts integer not null default 1,
 result jsonb, model text, usage jsonb, error_code text,
 check(attempts between 1 and 3)
);
alter table public.attendance_ai_drafts enable row level security;
create index attendance_ai_drafts_requested_by_idx on public.attendance_ai_drafts(requested_by);
revoke all on public.attendance_ai_drafts from public,anon,authenticated;
grant all on public.attendance_ai_drafts to service_role;
create table public.attendance_ai_limits(day date primary key,calls integer not null default 0 check(calls between 0 and 50));
alter table public.attendance_ai_limits enable row level security;
revoke all on public.attendance_ai_limits from public,anon,authenticated;
grant all on public.attendance_ai_limits to service_role;
create function public.attendance_ai_claim(p_document uuid,p_path text,p_admin uuid)
returns jsonb language plpgsql set search_path='' security invoker as $$
declare r public.attendance_ai_drafts; n integer; l uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(73910431);
 select * into r from public.attendance_ai_drafts where document_id=p_document;
 if found then
  if r.source_path<>p_path then raise exception 'Fonte modificata: richiedi assistenza';end if;
  if r.status='done' then return jsonb_build_object('cached',true,'result',r.result,'model',r.model,'usage',r.usage);end if;
  if r.status='processing' and r.started_at>now()-interval '3 minutes' then raise exception 'Lettura in corso: riprova tra poco';end if;
  if r.attempts>=3 then raise exception 'Limite di tre tentativi raggiunto per questo foglio';end if;
 end if;
 insert into public.attendance_ai_limits(day,calls) values((now() at time zone 'Europe/Rome')::date,0) on conflict do nothing;
 update public.attendance_ai_limits set calls=calls+1 where day=(now() at time zone 'Europe/Rome')::date and calls<50 returning calls into n;
 if not found then raise exception 'Limite giornaliero di 50 letture raggiunto';end if;
 insert into public.attendance_ai_drafts(document_id,source_path,status,lease_id,requested_by)
 values(p_document,p_path,'processing',l,p_admin)
 on conflict(document_id) do update set status='processing',lease_id=l,started_at=now(),requested_by=p_admin,attempts=public.attendance_ai_drafts.attempts+1,error_code=null;
 return jsonb_build_object('cached',false,'lease',l);
end;$$;
revoke all on function public.attendance_ai_claim(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.attendance_ai_claim(uuid,text,uuid) to service_role;
