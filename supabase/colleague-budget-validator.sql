CREATE OR REPLACE FUNCTION private.validate_hour_budget()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb; total int := 0; acc uuid; doc public.documents; locations text[] := ARRAY['Tribunale Penale Lecce','Tribunale Civile Lecce','Giudice di Pace Lecce','Corte d’Appello Lecce','Tribunale Minori Lecce','Aula Bunker Lecce','Tribunale/Procura Brindisi','Tribunale Ordinario Taranto','Tribunale Minori Taranto','Procura Taranto','Corte d’Appello Taranto'];
begin
 if tg_op='UPDATE' then if new.version<>old.version then raise exception 'Versione non valida'; end if; new.version:=old.version+1;else new.version:=1;end if;
 if tg_table_name='hour_budget_assignments' then
  if new.included and (new.workplace is null or not(new.workplace=any(locations))) then raise exception 'Scegli una sede valida';end if;
 elsif tg_table_name='hour_budget_calendar' then
  if not(new.workplace=any(locations)) then raise exception 'Sede non valida';end if;
 elsif tg_table_name='hour_budget_days' then
  if jsonb_typeof(new.allocations)<>'array' or jsonb_array_length(new.allocations)>11 then raise exception 'Ripartizione non valida';end if;
  for item in select value from jsonb_array_elements(new.allocations) loop
   if item->>'workplace' is null or not(item->>'workplace'=any(locations)) or item->>'ordinary' is null or item->>'overtime' is null then raise exception 'Sede/ore non valide';end if;
   if (item->>'ordinary')::numeric<>trunc((item->>'ordinary')::numeric) or (item->>'overtime')::numeric<>trunc((item->>'overtime')::numeric) or (item->>'ordinary')::numeric not between 0 and 1440 or (item->>'overtime')::numeric not between 0 and 1440 then raise exception 'Minuti non validi';end if;
   total:=total+(item->>'ordinary')::int+(item->>'overtime')::int;
  end loop;
  if total+new.absence_minutes>1440 then raise exception 'Il totale supera 24 ore';end if;
  if new.absence_minutes>0 and length(trim(new.justification))=0 then raise exception 'Indica il giustificativo';end if;
  if new.document_id is null and length(trim(new.source_note))=0 then raise exception 'Indica il riferimento al foglio esterno';end if;
  if new.day>(now() at time zone 'Europe/Rome')::date then raise exception 'Non confermare presenze future';end if;
  if new.document_id is not null then
   select * into doc from public.documents where id=new.document_id;
   -- account ownership is checked by a private lookup helper below, without exposing leave_people.
   if doc.id is null or (doc.worker_id is not null and doc.worker_id is distinct from private.hour_budget_account(new.person_key)) or (doc.worker_id is null and doc.recipient_person_key is distinct from new.person_key and not coalesce(private.hour_budget_account(doc.recipient_person_key)=private.hour_budget_account(new.person_key),false)) or doc.site<>'N153' or doc.category<>'presenze' or doc.month<>to_char(new.day,'YYYY-MM') or doc.review_status='rejected' or doc.stage not in ('weekly','replacement','final') or (doc.stage<>'final' and (doc.week_ending is null or doc.week_ending<new.day)) then raise exception 'Foglio non valido per lavoratore e giorno';end if;
  end if;
 end if;
 return new;
end $function$;
