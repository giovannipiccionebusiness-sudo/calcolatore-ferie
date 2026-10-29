alter table public.profiles add column can_upload_for_colleagues boolean not null default false;
alter table public.hour_budget_registry add column delegate_storage_id uuid not null default gen_random_uuid() unique;
alter table public.documents alter column worker_id drop not null;
alter table public.documents add column recipient_person_key text references public.hour_budget_registry(person_key),add column recipient_name text,add column submitted_by uuid references public.profiles(id),add column submitted_name text;
alter table public.documents add constraint document_recipient_required check(worker_id is not null or recipient_person_key is not null);
create table public.colleague_upload_intents(id uuid primary key,actor uuid not null references public.profiles(id),recipient_key text not null,recipient_person_key text references public.hour_budget_registry(person_key),recipient_account uuid references public.profiles(id),recipient_name text not null,workplace text not null,storage_id uuid not null,month text not null,week_ending date,stage text not null check(stage in('weekly','final')),previous_document uuid references public.documents(id),file_path text unique not null,file_name text not null,mime text not null,size int not null check(size between 1 and 12582912),created_at timestamptz not null default now(),finished_at timestamptz);
alter table public.colleague_upload_intents enable row level security;
revoke all on public.colleague_upload_intents from public,anon,authenticated;grant all on public.colleague_upload_intents to service_role;
create function public.colleague_workplace(acc uuid,person text) returns text language sql stable security invoker set search_path='' as $$
 select coalesce((select case when a.included then a.workplace else '' end from public.hour_budget_assignments a where a.valid_from<=(now() at time zone 'Europe/Rome')::date and (a.person_key=person or a.person_key in(select r.person_key from public.hour_budget_registry r left join public.leave_people l on l.person_key=r.imported_person_key where coalesce(r.account_id,l.account_id)=acc)) order by a.valid_from desc limit 1),(select workplace from public.profiles where id=acc))
$$;
create function public.colleague_directory(actor uuid) returns table(recipient_key text,full_name text,account_id uuid,person_key text,storage_id uuid,workplace text) language plpgsql security invoker set search_path='' as $$
declare own_site text;begin
 if not exists(select 1 from public.profiles p where p.id=actor and p.active and p.role='worker' and p.site='N153' and p.can_upload_for_colleagues) then raise exception 'Funzione non abilitata dal responsabile';end if;
 own_site:=public.colleague_workplace(actor,null);if nullif(own_site,'') is null then raise exception 'Sede da assegnare: contatta il responsabile';end if;
 return query
 select 'A:'||p.id::text,p.full_name,p.id,k.person_key,p.id,own_site from public.profiles p left join lateral(select r.person_key from public.hour_budget_registry r left join public.leave_people l on l.person_key=r.imported_person_key where coalesce(r.account_id,l.account_id)=p.id order by (r.account_id is not null) desc limit 1) k on true where p.id<>actor and p.role='worker' and p.active and p.site='N153' and public.colleague_workplace(p.id,k.person_key)=own_site
 union all
 select 'P:'||r.person_key,trim(l.surname||' '||l.given_name),null::uuid,r.person_key,r.delegate_storage_id,own_site from public.hour_budget_registry r join public.leave_people l on l.person_key=r.imported_person_key where l.account_id is null and public.colleague_workplace(null,r.person_key)=own_site;
end $$;
create function public.colleague_prepare(actor uuid,recipient text,period text,week date,kind text,filename text,mimetype text,bytes int) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target record;key uuid:=gen_random_uuid();previous uuid;path text;ext text;begin
 select * into target from public.colleague_directory(actor) where recipient_key=recipient;if not found then raise exception 'Collega non disponibile nella tua sede';end if;
 if period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or kind not in('weekly','final') then raise exception 'Periodo non valido';end if;
 if kind='weekly' and (week is null or extract(isodow from week)<>5 or to_char(week,'YYYY-MM')<>period) then raise exception 'Seleziona un venerdì del mese';end if;
 if kind='final' and week is not null then raise exception 'Il definitivo non ha una settimana';end if;
 if bytes not between 1 and 12582912 or length(filename) not between 1 and 255 or mimetype not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'File non valido (massimo 12 MB)';end if;
 select d.id into previous from public.documents d where (target.account_id is not null and d.worker_id=target.account_id or target.account_id is null and d.worker_id is null and d.recipient_person_key=target.person_key) and d.month=period and d.category='presenze' and d.review_status<>'rejected' and (kind='final' and d.stage='final' or kind='weekly' and d.stage in('weekly','replacement') and d.week_ending=week) and not exists(select 1 from public.documents x where x.replaces=d.id) order by d.created_at desc limit 1;
 ext:=case mimetype when 'image/jpeg' then 'jpeg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end;path:=target.storage_id::text||'/'||period||'/'||key::text||'.'||ext;
 insert into public.colleague_upload_intents(id,actor,recipient_key,recipient_person_key,recipient_account,recipient_name,workplace,storage_id,month,week_ending,stage,previous_document,file_path,file_name,mime,size) values(key,actor,recipient,target.person_key,target.account_id,target.full_name,target.workplace,target.storage_id,period,week,kind,previous,path,filename,mimetype,bytes);
 return jsonb_build_object('id',key,'path',path,'recipient_name',target.full_name,'duplicate',previous is not null);
end $$;
create function private.colleague_document_attribution() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' then if (new.recipient_person_key,new.recipient_name,new.submitted_by,new.submitted_name) is distinct from (old.recipient_person_key,old.recipient_name,old.submitted_by,old.submitted_name) then raise exception 'Attribuzione del documento immutabile';end if;
 else
  if auth.uid() is not null then
   if new.recipient_person_key is not null or new.recipient_name is not null or new.submitted_name is not null or (new.submitted_by is not null and new.submitted_by<>auth.uid()) then raise exception 'Attribuzione non consentita';end if;
   new.submitted_by:=auth.uid();
  elsif new.submitted_by is not null and not exists(select 1 from public.colleague_upload_intents i where i.id=new.id and i.actor=new.submitted_by and i.recipient_account is not distinct from new.worker_id and i.recipient_person_key is not distinct from new.recipient_person_key and i.file_path=new.file_path) then raise exception 'Invio per collega non valido';end if;
 end if;return new;
end $$;
create trigger colleague_attribution before insert or update on public.documents for each row execute function private.colleague_document_attribution();
create function public.colleague_finish(actor uuid,intent uuid,confirm_duplicate boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.colleague_upload_intents;t record;current_doc uuid;actual_size bigint;actual_mime text;sender text;begin
 select * into i from public.colleague_upload_intents where id=intent and colleague_upload_intents.actor=colleague_finish.actor for update;if not found then raise exception 'Invio non trovato';end if;
 if i.finished_at is not null then return jsonb_build_object('id',i.id,'recipient_name',i.recipient_name,'already_sent',true);end if;
 if i.created_at<now()-interval '24 hours' then raise exception 'Invio scaduto: prepara un nuovo caricamento';end if;
 select * into t from public.colleague_directory(actor) where recipient_key=i.recipient_key;if not found or t.workplace<>i.workplace or t.account_id is distinct from i.recipient_account or t.person_key is distinct from i.recipient_person_key then raise exception 'Sede o associazione del collega cambiate: ripeti la selezione';end if;
 perform pg_advisory_xact_lock(hashtextextended(i.recipient_key||i.month||coalesce(i.week_ending::text,'final'),0));
 select d.id into current_doc from public.documents d where (i.recipient_account is not null and d.worker_id=i.recipient_account or i.recipient_account is null and d.worker_id is null and d.recipient_person_key=i.recipient_person_key) and d.month=i.month and d.category='presenze' and d.review_status<>'rejected' and (i.stage='final' and d.stage='final' or i.stage='weekly' and d.stage in('weekly','replacement') and d.week_ending=i.week_ending) and not exists(select 1 from public.documents x where x.replaces=d.id) order by d.created_at desc limit 1;
 if current_doc is distinct from i.previous_document then raise exception 'È arrivato un altro foglio: aggiorna prima di inviare';end if;
 if current_doc is not null and not confirm_duplicate then raise exception 'Conferma la sostituzione del foglio già presente';end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into actual_size,actual_mime from storage.objects where bucket_id='private-documents' and name=i.file_path;
 if actual_size is null or actual_size<>i.size or actual_mime is distinct from i.mime then raise exception 'File assente o diverso da quello selezionato';end if;
 select p.full_name into sender from public.profiles p where p.id=actor;
 insert into public.documents(id,worker_id,recipient_person_key,recipient_name,submitted_by,submitted_name,site,month,category,stage,week_ending,replaces,file_path,file_name,note,"authorization") values(i.id,i.recipient_account,i.recipient_person_key,i.recipient_name,actor,sender,'N153',i.month,'presenze',case when i.stage='weekly' and current_doc is not null then 'replacement' else i.stage end,i.week_ending,case when i.stage='weekly' then current_doc else null end,i.file_path,i.file_name,'','not_applicable');
 update public.colleague_upload_intents set finished_at=now() where id=i.id;
 insert into public.audit_log(actor_id,action,target_id,details) values(actor,'colleague_upload',i.id,jsonb_build_object('recipient_name',i.recipient_name,'recipient_person_key',i.recipient_person_key,'workplace',i.workplace));
 return jsonb_build_object('id',i.id,'recipient_name',i.recipient_name,'already_sent',false);
end $$;
-- Keep previously created folders when an unregistered person later receives an account.
create function public.drive_recipient_identity(document uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare d public.documents;r public.hour_budget_registry;p public.profiles;k text;name text;begin
 select * into d from public.documents where id=document;if not found then raise exception 'Documento non trovato';end if;
 if d.worker_id is not null then
  select * into p from public.profiles where id=d.worker_id;k:=p.id::text;name:=p.full_name;
  if not exists(select 1 from public.drive_folders where path_key='root/'||d.site||'/'||k) then
   select x.* into r from public.hour_budget_registry x left join public.leave_people l on l.person_key=x.imported_person_key where coalesce(x.account_id,l.account_id)=d.worker_id and exists(select 1 from public.documents old where old.worker_id is null and old.recipient_person_key=x.person_key) limit 1;
   if found then k:=r.delegate_storage_id::text;end if;
  end if;
 else select * into r from public.hour_budget_registry where person_key=d.recipient_person_key;k:=r.delegate_storage_id::text;name:=d.recipient_name;end if;
 name:=coalesce(nullif(name,''),'Lavoratore');if k is null then raise exception 'Destinatario non valido';end if;return jsonb_build_object('key',k,'full_name',name);
end $$;
revoke all on function public.colleague_workplace(uuid,text) from public,anon,authenticated;
grant execute on function public.colleague_workplace(uuid,text) to service_role;
revoke all on function public.colleague_directory(uuid) from public,anon,authenticated;
grant execute on function public.colleague_directory(uuid) to service_role;
revoke all on function public.colleague_prepare(uuid,text,text,date,text,text,text,int) from public,anon,authenticated;
grant execute on function public.colleague_prepare(uuid,text,text,date,text,text,text,int) to service_role;
revoke all on function public.colleague_finish(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.colleague_finish(uuid,uuid,boolean) to service_role;
revoke all on function public.drive_recipient_identity(uuid) from public,anon,authenticated;
grant execute on function public.drive_recipient_identity(uuid) to service_role;
