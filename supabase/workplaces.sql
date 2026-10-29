alter table public.profiles add column workplace text;
alter table public.profiles add constraint profiles_n153_workplace check (workplace is null or (site is not distinct from 'N153' and role='worker' and workplace in ('Tribunale Penale Lecce','Tribunale Civile Lecce','Giudice di Pace Lecce','Corte d’Appello Lecce','Tribunale Minori Lecce','Aula Bunker Lecce','Tribunale/Procura Brindisi','Tribunale Ordinario Taranto','Tribunale Minori Taranto','Procura Taranto','Corte d’Appello Taranto')));
create or replace function private.audit_profile_change() returns trigger language plpgsql security definer set search_path = '' as $function$
begin
 if (new.active,new.site,new.role,new.phone,new.full_name,new.workplace) is distinct from (old.active,old.site,old.role,old.phone,old.full_name,old.workplace) then
 insert into public.audit_log(actor_id,action,target_id,details) values(auth.uid(),'profile_update',new.id,jsonb_build_object('active',new.active,'site',new.site,'role',new.role,'workplace',new.workplace,'previous_workplace',old.workplace));
 end if;
 return new;
end $function$;
