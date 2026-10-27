create or replace function public.admin_worker_emails() returns table(id uuid,email text) language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active) then
 raise exception 'Accesso riservato all’amministratore' using errcode='42501';
 end if;
 return query select p.id,u.email::text from public.profiles p join auth.users u on u.id=p.id where p.role='worker';
end; $$;
revoke all on function public.admin_worker_emails() from public,anon;
grant execute on function public.admin_worker_emails() to authenticated;