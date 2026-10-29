-- Version 66: existing v65 clients/intents remain compatible.
alter table public.colleague_upload_intents add column category text not null default 'presenze' check(category in('presenze','ferie','rol','legge104','malattia','congedo_parentale')),add column note text not null default '' check(length(note)<=250);
alter table public.colleague_upload_intents drop constraint colleague_upload_intents_stage_check;
alter table public.colleague_upload_intents add constraint colleague_upload_intents_stage_check check((category='presenze' and stage in('weekly','final')) or (category<>'presenze' and stage='request'));
create function public.colleague_prepare_document(actor uuid,recipient text,period text,week date,kind text,filename text,mimetype text,bytes int, doc_category text default 'presenze', doc_note text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare target record;key uuid:=gen_random_uuid();previous uuid;path text;ext text;begin
 select * into target from public.colleague_directory(actor) where recipient_key=recipient;if not found then raise exception 'Collega non disponibile nella tua sede';end if;
 if doc_category is null or doc_category not in('presenze','ferie','rol','legge104','malattia','congedo_parentale') or doc_note is null or length(doc_note)>250 then raise exception 'Tipo di documento o note non validi';end if;
 if period is null or kind is null or period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' or (doc_category='presenze' and kind not in('weekly','final')) or (doc_category<>'presenze' and kind<>'request') then raise exception 'Periodo non valido';end if;
 if kind='weekly' and (week is null or extract(isodow from week)<>5 or to_char(week,'YYYY-MM')<>period) then raise exception 'Seleziona un venerdì del mese';end if;
 if kind in('final','request') and week is not null then raise exception 'Il definitivo non ha una settimana';end if;
 if bytes is null or filename is null or mimetype is null or bytes not between 1 and 12582912 or length(filename) not between 1 and 255 or mimetype not in('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'File non valido (massimo 12 MB)';end if;
 select d.id into previous from public.documents d where (target.account_id is not null and d.worker_id=target.account_id or target.account_id is null and d.worker_id is null and d.recipient_person_key=target.person_key) and d.month=period and d.category=doc_category and doc_category='presenze' and d.review_status<>'rejected' and (kind='final' and d.stage='final' or kind='weekly' and d.stage in('weekly','replacement') and d.week_ending=week) and not exists(select 1 from public.documents x where x.replaces=d.id) order by d.created_at desc limit 1;
 ext:=case mimetype when 'image/jpeg' then 'jpeg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end;path:=target.storage_id::text||'/'||period||'/'||key::text||'.'||ext;
 insert into public.colleague_upload_intents(id,actor,recipient_key,recipient_person_key,recipient_account,recipient_name,workplace,storage_id,month,week_ending,stage,previous_document,file_path,file_name,mime,size,category,note) values(key,actor,recipient,target.person_key,target.account_id,target.full_name,target.workplace,target.storage_id,period,week,kind,previous,path,filename,mimetype,bytes,doc_category,doc_note);
 return jsonb_build_object('id',key,'path',path,'recipient_name',target.full_name,'duplicate',previous is not null);
end $$;
create or replace function public.colleague_finish(actor uuid,intent uuid,confirm_duplicate boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare i public.colleague_upload_intents;t record;current_doc uuid;actual_size bigint;actual_mime text;sender text;begin
 select * into i from public.colleague_upload_intents where id=intent and colleague_upload_intents.actor=colleague_finish.actor for update;if not found then raise exception 'Invio non trovato';end if;
 if i.finished_at is not null then return jsonb_build_object('id',i.id,'recipient_name',i.recipient_name,'already_sent',true);end if;
 if i.created_at<now()-interval '24 hours' then raise exception 'Invio scaduto: prepara un nuovo caricamento';end if;
 select * into t from public.colleague_directory(actor) where recipient_key=i.recipient_key;if not found or t.workplace<>i.workplace or t.account_id is distinct from i.recipient_account or t.person_key is distinct from i.recipient_person_key then raise exception 'Sede o associazione del collega cambiate: ripeti la selezione';end if;
 perform pg_advisory_xact_lock(hashtextextended(i.recipient_key||i.month||i.category||coalesce(i.week_ending::text,i.stage),0));
 select d.id into current_doc from public.documents d where (i.recipient_account is not null and d.worker_id=i.recipient_account or i.recipient_account is null and d.worker_id is null and d.recipient_person_key=i.recipient_person_key) and d.month=i.month and d.category=i.category and i.category='presenze' and d.review_status<>'rejected' and (i.stage='final' and d.stage='final' or i.stage='weekly' and d.stage in('weekly','replacement') and d.week_ending=i.week_ending) and not exists(select 1 from public.documents x where x.replaces=d.id) order by d.created_at desc limit 1;
 if current_doc is distinct from i.previous_document then raise exception 'È arrivato un altro foglio: aggiorna prima di inviare';end if;
 if current_doc is not null and not confirm_duplicate then raise exception 'Conferma la sostituzione del foglio già presente';end if;
 select (metadata->>'size')::bigint,metadata->>'mimetype' into actual_size,actual_mime from storage.objects where bucket_id='private-documents' and name=i.file_path;
 if actual_size is null or actual_size<>i.size or actual_mime is distinct from i.mime then raise exception 'File assente o diverso da quello selezionato';end if;
 select p.full_name into sender from public.profiles p where p.id=actor;
 insert into public.documents(id,worker_id,recipient_person_key,recipient_name,submitted_by,submitted_name,site,month,category,stage,week_ending,replaces,file_path,file_name,note,"authorization") values(i.id,i.recipient_account,i.recipient_person_key,i.recipient_name,actor,sender,'N153',i.month,i.category,case when i.stage='weekly' and current_doc is not null then 'replacement' else i.stage end,i.week_ending,case when i.stage='weekly' then current_doc else null end,i.file_path,i.file_name,i.note,case when i.category in('ferie','rol') then 'pending' else 'not_applicable' end);
 update public.colleague_upload_intents set finished_at=now() where id=i.id;
 insert into public.audit_log(actor_id,action,target_id,details) values(actor,'colleague_upload',i.id,jsonb_build_object('recipient_name',i.recipient_name,'recipient_person_key',i.recipient_person_key,'workplace',i.workplace));
 return jsonb_build_object('id',i.id,'recipient_name',i.recipient_name,'already_sent',false);
end $$;

revoke all on function public.colleague_prepare_document(uuid,text,text,date,text,text,text,int,text,text) from public,anon,authenticated;
grant execute on function public.colleague_prepare_document(uuid,text,text,date,text,text,text,int,text,text) to service_role;
create or replace function public.get_admin_notification_tasks(actor uuid,page_offset integer default 0) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.profiles where id=actor and active and role='admin') then raise exception 'Non autorizzato';end if;
 with tasks as (
 select p.id as target_id,'registration'::text as task_kind,'Account da abilitare'::text as title,coalesce(nullif(p.full_name,''),'Nuovo lavoratore') as person,p.site,null::text as month,p.created_at
 from public.profiles p where p.role='worker' and not p.active
 union all
 select d.id,case when d.review_status='pending' then 'review' else 'authorization' end,
 case when d.review_status='pending' then 'Documento da verificare' else 'Richiesta da autorizzare' end,
 coalesce(nullif(p.full_name,''),nullif(d.recipient_name,''),'Lavoratore')||' · '||case d.category when 'presenze' then 'Foglio presenze' when 'ferie' then 'Ferie' when 'rol' then 'Permessi ROL' when 'legge104' then 'Legge 104' when 'malattia' then 'Malattia' when 'congedo_parentale' then 'Congedo parentale' else 'Documento' end,
 d.site,d.month,d.created_at from public.documents d left join public.profiles p on p.id=d.worker_id
 where (d.review_status='pending' or (d.review_status='verified' and d.category in ('ferie','rol') and d.authorization='pending'))
 and not exists(select 1 from public.documents replacement where replacement.replaces=d.id)
 ), page as (select * from tasks order by created_at desc,target_id desc offset greatest(0,least(page_offset,100000)) limit 30)
 select jsonb_build_object('total',(select count(*) from tasks),'registrations',(select count(*) from tasks where task_kind='registration'),'reviews',(select count(*) from tasks where task_kind='review'),'authorizations',(select count(*) from tasks where task_kind='authorization'),'items',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,target_id desc) from page),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_admin_notification_tasks(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_admin_notification_tasks(uuid,integer) to service_role;

alter table public.test_push_queue drop constraint test_push_queue_kind_check;
alter table public.test_push_queue add constraint test_push_queue_kind_check check(kind in ('activation','weekly','monthly','test','custom','monthly_request','admin_registration','admin_review','admin_authorization','colleague_upload','colleague_review','colleague_authorization'));
-- No health category, note, dates of absence or filename on the lock screen.
-- The document remains accessible only through the existing recipient/admin policies.
create function private.notify_colleague_document() returns trigger language plpgsql security definer set search_path='' as $$
declare event text; notice_kind text; headline text; content text; worker_content text;
begin
 if new.submitted_name is null then return new;end if;
 if TG_OP='INSERT' then
  notice_kind:='colleague_upload';headline:='Documento caricato per te';
  worker_content:=left(coalesce(new.submitted_name,'Un collega'),180)||' ha caricato un documento per tuo conto. È in attesa di verifica del responsabile. Apri i tuoi documenti per consultarlo.';
 elsif new.review_status is distinct from old.review_status and new.review_status in('verified','rejected') then
  notice_kind:='colleague_review';headline:='Esito verifica documento';
  worker_content:=case when new.review_status='verified' then 'Il documento caricato per te è stato verificato dal responsabile.' else 'Il documento caricato per te è stato respinto dal responsabile. Apri i tuoi documenti per leggere il motivo.' end;
  if new.review_status='verified' and new.category in('ferie','rol') then worker_content:=worker_content||' La richiesta è ancora in attesa di autorizzazione.';end if;
 elsif new."authorization" is distinct from old."authorization" and new."authorization" in('approved','denied') then
  notice_kind:='colleague_authorization';headline:='Esito della tua richiesta';
  worker_content:=case when new."authorization"='approved' then 'La richiesta caricata per tuo conto è stata autorizzata dal responsabile.' else 'La richiesta caricata per tuo conto non è stata autorizzata dal responsabile.' end;
 else return new;end if;
 event:=notice_kind||':'||new.id::text||case when TG_OP='INSERT' then '' else ':'||case when notice_kind='colleague_review' then new.review_status else new."authorization" end end;
 if new.worker_id is not null then
  insert into public.app_notifications(user_id,event_key,kind,title,body) values(new.worker_id,event,notice_kind,headline,worker_content) on conflict do nothing;
  insert into public.test_push_queue(subscription_id,kind,event_key,message)
  select s.id,notice_kind,event,worker_content from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id where p.id=new.worker_id and p.active and p.role='worker' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
 end if;
 if TG_OP='INSERT' or (new.review_status='verified' and new.category in('ferie','rol') and new."authorization"='pending') then
  notice_kind:=case when TG_OP='INSERT' then 'admin_review' else 'admin_authorization' end;
  headline:=case when TG_OP='INSERT' then 'Documento da verificare' else 'Richiesta da autorizzare' end;
  content:=case when TG_OP='INSERT' then 'Hai un documento caricato per un collega da verificare.' else 'Hai una richiesta verificata da autorizzare.' end||' Apri la campanella e consulta “Da gestire”.';
  event:=notice_kind||':'||new.id::text;
  insert into public.app_notifications(user_id,event_key,kind,title,body) select p.id,event,notice_kind,headline,content from public.profiles p where p.active and p.role='admin' on conflict do nothing;
  insert into public.test_push_queue(subscription_id,kind,event_key,message) select s.id,notice_kind,event,content from public.test_push_subscriptions s join public.profiles p on p.id=s.user_id where p.active and p.role='admin' and s.app_scope='production' and s.push_keys is not null on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function private.notify_colleague_document() from public,anon,authenticated;
create trigger notify_colleague_document after insert or update of review_status,"authorization" on public.documents for each row execute function private.notify_colleague_document();
