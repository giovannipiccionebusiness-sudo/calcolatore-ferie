CREATE OR REPLACE FUNCTION private.validate_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.documents;recipient_storage uuid;
begin
 if TG_OP='UPDATE' then
  if (new.id,new.worker_id,new.site,new.month,new.category,new.stage,new.week_ending,new.replaces,new.file_path,new.file_name,new.note,new.created_at)
    is distinct from (old.id,old.worker_id,old.site,old.month,old.category,old.stage,old.week_ending,old.replaces,old.file_path,old.file_name,old.note,old.created_at)
    then raise exception 'Document identity and original content are immutable'; end if;
  if new.review_status is distinct from old.review_status then
   new.reviewed_by:=auth.uid(); new.reviewed_at:=now();
   if new.review_status='rejected' and nullif(trim(new.review_reason),'') is null then raise exception 'Rejection reason required'; end if;
   if new.review_status<>'verified' and old."authorization" in ('approved','denied') then raise exception 'Authorized document cannot be unverified'; end if;
  end if;
  if new."authorization" is distinct from old."authorization" then
   if new.category not in ('ferie','rol') or new.review_status<>'verified' or new."authorization" not in ('approved','denied') then raise exception 'Authorization requires a verified request'; end if;
   new.authorized_at:=now();
  end if;
 else
  if new.worker_id is null then select delegate_storage_id into recipient_storage from public.hour_budget_registry where person_key=new.recipient_person_key;if recipient_storage is null then raise exception 'Invalid recipient';end if;else recipient_storage:=new.worker_id;end if;
  if new.file_path !~ ('^'||recipient_storage::text||'/'||new.month||'/'||new.id::text||'\.(pdf|jpeg|png|webp)$') then raise exception 'Invalid file path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='private-documents' and name=new.file_path) then raise exception 'Upload file first'; end if;
  new.created_at:=now(); new.authorized_at:=null; new.review_reason:=null;
  if new.week_ending is not null and (extract(isodow from new.week_ending)<>5 or to_char(new.week_ending,'YYYY-MM')<>new.month) then raise exception 'Select a Friday in the selected month'; end if;
  if new.stage='replacement' then
   select * into previous from public.documents where id=new.replaces for update;
   if not found or previous.worker_id is distinct from new.worker_id or (new.worker_id is null and previous.recipient_person_key is distinct from new.recipient_person_key) or previous.month<>new.month or previous.week_ending<>new.week_ending or previous.stage not in ('weekly','replacement') or exists(select 1 from public.documents where replaces=previous.id) then raise exception 'Invalid replacement target'; end if;
  elsif new.replaces is not null then raise exception 'Only replacements may link previous files'; end if;
 end if;
 return new;
end $function$;
