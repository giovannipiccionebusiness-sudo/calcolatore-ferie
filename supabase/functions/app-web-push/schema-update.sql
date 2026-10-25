begin;
alter table public.test_push_subscriptions add column if not exists push_keys jsonb;
alter table public.test_push_subscriptions add column if not exists app_scope text check(app_scope in ('production','test'));
alter table public.test_push_queue drop constraint if exists test_push_queue_kind_check;
alter table public.test_push_queue add constraint test_push_queue_kind_check check(kind in ('activation','weekly','monthly','test','custom','monthly_request'));
alter table public.test_push_queue add column if not exists message text check(length(message)<=600), add column if not exists target_month text check(target_month ~ '^\d{4}-(0[1-9]|1[0-2])$'), add column if not exists created_by uuid references public.profiles(id) on delete set null;
create index if not exists test_push_queue_admin_created on public.test_push_queue(created_by,created_at desc) where created_by is not null;
commit;
