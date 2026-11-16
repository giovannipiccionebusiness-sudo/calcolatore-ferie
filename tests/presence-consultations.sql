begin;
select set_config('request.jwt.claim.sub','de4b5f37-3a58-492b-b7b8-c06425245df7',true);
set local role authenticated;
do $$ begin
 insert into public.presence_consultations(admin_id,document_id,document_month,period_key) values(auth.uid(),'e210b526-37cd-4ffe-a706-6f7e028bf16d','2026-11','2026-11-06') on conflict do nothing;
 if not exists(select 1 from public.presence_consultations where document_id='e210b526-37cd-4ffe-a706-6f7e028bf16d' and period_key='2026-11-06') then raise exception 'Admin cannot recover saved mark';end if;
 insert into public.presence_consultations(admin_id,document_id,document_month,period_key) values(auth.uid(),'e210b526-37cd-4ffe-a706-6f7e028bf16d','2026-11','2026-11-06') on conflict do nothing;
 begin
 insert into public.presence_consultations(admin_id,document_id,document_month,period_key) values(auth.uid(),'e210b526-37cd-4ffe-a706-6f7e028bf16d','2026-11','2026-11-13');raise exception 'Wrong week accepted';
 exception when insufficient_privilege then null;end;
 begin
 insert into public.presence_consultations(admin_id,document_id,document_month,period_key) values('60d6c259-e421-474b-9c5c-cc1d641e32d5','e210b526-37cd-4ffe-a706-6f7e028bf16d','2026-11','2026-11-06');raise exception 'Other admin id accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','60d6c259-e421-474b-9c5c-cc1d641e32d5',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.presence_consultations) then raise exception 'Worker can read marks';end if;
 begin
 insert into public.presence_consultations(admin_id,document_id,document_month,period_key) values(auth.uid(),'e210b526-37cd-4ffe-a706-6f7e028bf16d','2026-11','2026-11-06');raise exception 'Worker insert accepted';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
rollback;
