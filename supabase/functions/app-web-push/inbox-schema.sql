begin;
create table public.app_notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 event_key text not null,
 kind text not null,
 title text not null,
 body text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null,
 unique(user_id,event_key)
);
create index app_notifications_user_created on public.app_notifications(user_id,created_at desc,id desc);
create index app_notifications_unread on public.app_notifications(user_id) where read_at is null;
create index app_notifications_actor_created on public.app_notifications(created_by,created_at desc) where created_by is not null;
alter table public.app_notifications enable row level security;
revoke all on public.app_notifications from public,anon,authenticated;
grant all on public.app_notifications to service_role;
create function private.save_push_inbox() returns trigger language plpgsql security invoker set search_path='' as $$
declare recipient uuid; scope_name text; label text; headline text; message_text text; m text;
begin
 select user_id,app_scope into recipient,scope_name from public.test_push_subscriptions where id=new.subscription_id;
 if recipient is null or scope_name is distinct from 'production' then return new;end if;
 m:=coalesce(new.target_month,substring(new.event_key from '([0-9]{4}-[0-9]{2})'));
 if m ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
 label:=(array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'])[substring(m,6,2)::int]||' '||substring(m,1,4);
 else label:='questo mese';end if;
 headline:=case new.kind when 'weekly' then 'Presenze del venerdì' when 'monthly' then 'Foglio presenze definitivo' when 'monthly_request' then 'Richiesta del definitivo mensile' when 'custom' then 'Messaggio dal responsabile' when 'activation' then 'Il tuo account è stato abilitato' else 'Notifica di prova' end;
 message_text:=case new.kind
 when 'weekly' then 'Ti ricordiamo di aggiornare il foglio presenze fino a questa settimana e caricarne una foto leggibile nell’app, usando “Aggiorna foglio presenze”.'
 when 'monthly' then 'Caro collaboratore, ti chiedo di completare il foglio presenze di '||label||' fino a fine mese e di caricarlo, firmato, nell’app con “Invia foglio definitivo”. Ti chiedo inoltre di comunicare tempestivamente al responsabile eventuali modifiche successive. Grazie per la collaborazione.'
 when 'activation' then 'Il responsabile ha abilitato il tuo account. Accedi a Lavoro Facile per caricare le presenze e i tuoi documenti.'
 when 'test' then 'Gli avvisi di Lavoro Facile funzionano su questo telefono.'
 else coalesce(new.message,'Hai un nuovo avviso dal responsabile.') end;
 insert into public.app_notifications(user_id,event_key,kind,title,body,created_at,created_by)
 values(recipient,new.event_key,new.kind,headline,message_text,new.created_at,new.created_by) on conflict do nothing;
 return new;
end $$;
revoke all on function private.save_push_inbox() from public,anon,authenticated;
grant execute on function private.save_push_inbox() to service_role;
create trigger save_push_inbox after insert on public.test_push_queue for each row execute function private.save_push_inbox();
-- Replay existing production rows through the trigger without sending or changing queue state.
create trigger backfill_push_inbox after update of event_key on public.test_push_queue for each row execute function private.save_push_inbox();
update public.test_push_queue q set event_key=q.event_key where exists(select 1 from public.test_push_subscriptions s where s.id=q.subscription_id and s.app_scope='production');
drop trigger backfill_push_inbox on public.test_push_queue;
commit;
