begin;
create table public.presence_consultations (
 admin_id uuid not null references public.profiles(id) on delete cascade,
 document_id uuid not null references public.documents(id) on delete cascade,
 document_month text not null check(document_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 period_key text not null check(period_key='final' or period_key ~ '^\d{4}-\d{2}-\d{2}$'),
 consulted_at timestamptz not null default now(),
 primary key(admin_id,document_id,period_key)
);
create index presence_consultations_admin_month on public.presence_consultations(admin_id,document_month);
alter table public.presence_consultations enable row level security;
revoke all on public.presence_consultations from public,anon,authenticated;
grant select,insert on public.presence_consultations to authenticated;
create policy consultations_read on public.presence_consultations for select to authenticated
 using (admin_id=(select auth.uid()) and (select private.is_admin()));
create policy consultations_insert on public.presence_consultations for insert to authenticated
 with check (admin_id=(select auth.uid()) and (select private.is_admin()) and exists (
 select 1 from public.documents d where d.id=document_id and d.month=document_month and d.category='presenze' and d.review_status<>'rejected'
 and ((period_key='final' and d.stage='final') or (d.stage in ('weekly','replacement') and d.week_ending is not null
 and period_key=(d.week_ending-((extract(isodow from d.week_ending)::int)-1)+4)::text))
 ));
commit;
