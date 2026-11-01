begin;
-- Additive RPC: existing RLS, validation triggers and audit remain in force.
create or replace function public.acquire_presence_declaration(
 p_person_key text,p_day date,p_worker uuid,p_declaration_version integer,p_record_version integer,
 p_allocations jsonb,p_absence_minutes integer,p_document uuid default null,
 p_source_note text default '',p_verified boolean default false
) returns public.hour_budget_days language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid();worker uuid;declaration public.daily_presence;old_day public.hour_budget_days;result public.hour_budget_days;item jsonb;old_item jsonb;total_s integer:=0;total_o integer:=0;note text;marker text;
begin
 if actor is null or not exists(select 1 from public.profiles where id=actor and active and role='admin') then raise exception 'Accesso amministratore necessario';end if;
 if p_verified is distinct from true then raise exception 'Conferma la verifica di ore, assenze e sedi';end if;
 if p_day is null or p_day>(now() at time zone 'Europe/Rome')::date then raise exception 'Giorno non valido o futuro';end if;
 select private.hour_budget_account(person_key) into worker from public.hour_budget_registry where person_key=p_person_key for share;
 if worker is null or worker is distinct from p_worker then raise exception 'Collegamento lavoratore cambiato: aggiorna l’anagrafica';end if;
 -- Use the same worker lock as save_daily_presence/save_presence_week; no UPDATE grant on declarations is needed.
 perform pg_advisory_xact_lock(hashtextextended('presence:'||worker::text,0));
 select * into declaration from public.daily_presence where worker_id=worker and day=p_day;
 if not found or declaration.version is distinct from p_declaration_version then raise exception 'Dichiarazione cambiata: aggiorna i dati e ricontrolla';end if;
 select * into old_day from public.hour_budget_days where person_key=p_person_key and day=p_day for update;
 if old_day.version is distinct from p_record_version then raise exception 'Presenze cambiate: aggiorna i dati e ricontrolla';end if;
 if p_allocations is null or jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations) not between 1 and 11 then raise exception 'Indica le sedi e la ripartizione delle ore';end if;
 for item in select value from jsonb_array_elements(p_allocations) loop
 if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'workplace') is distinct from 'string' or jsonb_typeof(item->'ordinary') is distinct from 'number' or jsonb_typeof(item->'overtime') is distinct from 'number' or item->>'ordinary'!~'^\d+$' or item->>'overtime'!~'^\d+$' then raise exception 'Sedi e minuti non validi';end if;
 if (item->>'ordinary')::integer not between 0 and 1440 or (item->>'overtime')::integer not between 0 and 1440 then raise exception 'Minuti fuori intervallo';end if;
 total_o:=total_o+(item->>'ordinary')::int;total_s:=total_s+(item->>'overtime')::int;
 if old_day.version is not null and (item->>'ordinary')::int>0 and not exists(select 1 from jsonb_array_elements(old_day.allocations) o where o->>'workplace'=item->>'workplace' and (o->>'ordinary')::int=(item->>'ordinary')::int) then raise exception 'Mantieni le ordinarie già registrate; per correggerle usa il salvataggio manuale';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_allocations))<>(select count(distinct value->>'workplace') from jsonb_array_elements(p_allocations)) then raise exception 'Usa una sola riga per sede';end if;
 if old_day.version is not null then
 for old_item in select value from jsonb_array_elements(old_day.allocations) loop
 if (old_item->>'ordinary')::int>0 and not exists(select 1 from jsonb_array_elements(p_allocations) n where n->>'workplace'=old_item->>'workplace' and (n->>'ordinary')::int=(old_item->>'ordinary')::int) then raise exception 'Le ordinarie già registrate devono restare invariate per sede';end if;
 end loop;
 end if;
 if total_s<>declaration.supplementary_minutes then raise exception 'Ripartisci esattamente il supplementare dichiarato tra le sedi';end if;
 if p_absence_minutes is null or p_absence_minutes not between 0 and 1440 then raise exception 'Indica le ore di assenza';end if;
 if declaration.cause='' and p_absence_minutes<>0 then raise exception 'La dichiarazione non contiene assenze';end if;
 if declaration.absence_scope='partial' and p_absence_minutes<>declaration.absence_minutes then raise exception 'Le ore di assenza devono corrispondere alla dichiarazione';end if;
 if declaration.absence_scope='full' and p_absence_minutes<=0 then raise exception 'Verifica le ore di assenza per la giornata intera';end if;
 if declaration.absence_scope='full' and total_o>0 then raise exception 'Correggi manualmente le ordinarie prima di acquisire un’assenza di giornata intera';end if;
 if total_o+total_s+p_absence_minutes>1440 then raise exception 'Il totale supera 24 ore';end if;
 marker:='Dichiarazione del lavoratore del '||to_char(p_day,'DD/MM/YYYY')||' (v'||declaration.version::text||')';
 note:=trim(coalesce(p_source_note,''));if length(note)>5000 then raise exception 'Annotazione troppo lunga';end if;
 if position(marker in note)=0 then note:=case when note='' then marker else note||' · '||marker end;end if;
 if old_day.version is null then
 insert into public.hour_budget_days(person_key,day,allocations,absence_minutes,justification,document_id,source_note,confirmed)
 values(p_person_key,p_day,p_allocations,p_absence_minutes,declaration.cause,p_document,note,true) returning * into result;
 else
 update public.hour_budget_days set allocations=p_allocations,absence_minutes=p_absence_minutes,justification=declaration.cause,document_id=p_document,source_note=note,confirmed=true,version=old_day.version
 where person_key=p_person_key and day=p_day and version=old_day.version returning * into result;
 end if;
 if result.person_key is null then raise exception 'Salvataggio non riuscito: ricarica la giornata';end if;
 return result;
end $$;
revoke all on function public.acquire_presence_declaration(text,date,uuid,integer,integer,jsonb,integer,uuid,text,boolean) from public,anon;
grant execute on function public.acquire_presence_declaration(text,date,uuid,integer,integer,jsonb,integer,uuid,text,boolean) to authenticated;
commit;
