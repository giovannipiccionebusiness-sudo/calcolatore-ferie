begin;
create table public.leave_people(person_key text primary key,matricola text not null,surname text not null,given_name text not null,site text not null default '',account_id uuid unique references public.profiles(id) on delete set null,last_period date not null);
create table public.leave_reports(id uuid primary key default gen_random_uuid(),checksum text not null unique check(checksum ~ '^[0-9a-f]{64}$'),period date not null check(period=(date_trunc('month',period)+interval '1 month - 1 day')::date),file_name text not null,imported_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.leave_balances(person_key text references public.leave_people(person_key) on delete cascade,period date not null,ferie numeric not null check(abs(ferie)<1000000),rol numeric not null check(abs(rol)<1000000),ex_festivita numeric not null check(abs(ex_festivita)<1000000),report_id uuid not null references public.leave_reports(id),source jsonb not null,primary key(person_key,period));
create table public.leave_config(person_key text primary key references public.leave_people(person_key) on delete cascade,data jsonb not null default '{"rates":[],"schedules":[],"expectancies":[],"reconciled_months":[]}',version integer not null default 0,updated_by uuid references public.profiles(id),updated_at timestamptz not null default now());
create table public.leave_ledger(id uuid primary key default gen_random_uuid(),person_key text not null references public.leave_people(person_key) on delete cascade,day date not null,kind text not null check(kind in ('ferie','rol')),hours numeric not null check(hours>0 and hours<=24),quantity numeric not null check(quantity>0 and quantity<100),state text not null check(state in ('approved','used','cancelled')),source_key text not null,document_id uuid references public.documents(id) on delete set null,included_in_report date check(included_in_report>=day),note text not null default '',created_by uuid references public.profiles(id),unique(person_key,day,kind,source_key));
create index leave_ledger_person_day on public.leave_ledger(person_key,day);
create table public.leave_document_links(document_id uuid primary key references public.documents(id) on delete cascade,person_key text not null references public.leave_people(person_key),mode text not null check(mode in ('recorded','included','not_absence')),covered_by date,updated_by uuid references public.profiles(id),check(mode<>'included' or covered_by is not null));
create table public.leave_audit(id bigint generated always as identity primary key,actor uuid references public.profiles(id),action text not null,person_key text,details jsonb,created_at timestamptz not null default now());
alter table public.leave_people enable row level security;
alter table public.leave_reports enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_config enable row level security;
alter table public.leave_ledger enable row level security;
alter table public.leave_document_links enable row level security;
alter table public.leave_audit enable row level security;
revoke all on public.leave_people,public.leave_reports,public.leave_balances,public.leave_config,public.leave_ledger,public.leave_document_links,public.leave_audit from public,anon,authenticated;
grant all on public.leave_people,public.leave_reports,public.leave_balances,public.leave_config,public.leave_ledger,public.leave_document_links,public.leave_audit to service_role;
grant usage,select on sequence public.leave_audit_id_seq to service_role;
create function public.leave_import_report(actor uuid,report jsonb,replace_period boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rid uuid;row jsonb;period_date date:=(report->>'period')::date; key text; n int:=0;
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and active) then raise exception 'Non autorizzato';end if;
 perform pg_advisory_xact_lock(hashtextextended('leave-import',0));
 select id into rid from public.leave_reports where checksum=report->>'checksum';
 if rid is not null then return jsonb_build_object('duplicate',true,'count',0);end if;
 if jsonb_array_length(report->'rows') not between 1 and 5000 then raise exception 'Righe non valide';end if;
 insert into public.leave_reports(checksum,period,file_name,imported_by) values(report->>'checksum',period_date,left(report->>'file_name',200),actor) returning id into rid;
 for row in select value from jsonb_array_elements(report->'rows') loop
  key:=row->>'person_key';
  if key !~ '^DUSSMANN:[A-Za-z0-9_-]{1,40}$' or length(row->>'surname') not between 1 and 100 or length(row->>'given_name') not between 1 and 100 then raise exception 'Lavoratore non valido';end if;
  if not replace_period and exists(select 1 from public.leave_balances b where b.person_key=key and b.period=period_date and (b.ferie<>(row->>'ferie')::numeric or b.rol<>(row->>'rol')::numeric or b.ex_festivita<>(row->>'ex_festivita')::numeric)) then raise exception 'Saldo differente nello stesso periodo: conferma la sostituzione';end if;
  insert into public.leave_people(person_key,matricola,surname,given_name,site,last_period) values(key,row->>'matricola',row->>'surname',row->>'given_name',coalesce(row->>'site',''),period_date)
  on conflict(person_key) do update set surname=case when excluded.last_period>=leave_people.last_period then excluded.surname else leave_people.surname end,given_name=case when excluded.last_period>=leave_people.last_period then excluded.given_name else leave_people.given_name end,site=case when excluded.last_period>=leave_people.last_period then excluded.site else leave_people.site end,last_period=greatest(leave_people.last_period,excluded.last_period);
  insert into public.leave_config(person_key) values(key) on conflict do nothing;
  insert into public.leave_balances(person_key,period,ferie,rol,ex_festivita,report_id,source) values(key,period_date,(row->>'ferie')::numeric,(row->>'rol')::numeric,(row->>'ex_festivita')::numeric,rid,jsonb_build_object('sheet',row->>'source_sheet','row',row->'source_row','raw',row->'raw')) on conflict(person_key,period) do update set ferie=excluded.ferie,rol=excluded.rol,ex_festivita=excluded.ex_festivita,report_id=excluded.report_id,source=excluded.source;
  n:=n+1;
 end loop;
 insert into public.leave_audit(actor,action,details) values(actor,'import',jsonb_build_object('report_id',rid,'period',period_date,'count',n,'replace',replace_period));
 return jsonb_build_object('duplicate',false,'count',n,'period',period_date);
end $$;
create function public.leave_set_config(actor uuid,key text,expected_version integer,settings jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare new_version integer;begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and active) then raise exception 'Non autorizzato';end if;
 update public.leave_config set data=settings,version=version+1,updated_by=actor,updated_at=now() where person_key=key and version=expected_version returning version into new_version;
 if new_version is null then raise exception 'Dati modificati: ricarica prima di salvare';end if;
 insert into public.leave_audit(actor,action,person_key,details) values(actor,'config',key,jsonb_build_object('version',new_version,'settings',settings));return new_version;end $$;
create function public.leave_add_entries(actor uuid,key text,request_key text,entries jsonb,document uuid default null) returns void language plpgsql security invoker set search_path='' as $$
declare row jsonb;begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and active) then raise exception 'Non autorizzato';end if;
 perform pg_advisory_xact_lock(hashtextextended(key,0));
 if exists(select 1 from public.leave_ledger where person_key=key and source_key=request_key) then return;end if;
 if document is not null and not exists(select 1 from public.documents d join public.leave_people p on p.account_id=d.worker_id where p.person_key=key and d.id=document and d.category in ('ferie','rol') and d.authorization='approved') then raise exception 'Documento non associabile';end if;
 for row in select value from jsonb_array_elements(entries) loop
  if coalesce((select sum(hours) from public.leave_ledger where person_key=key and day=(row->>'day')::date and state<>'cancelled'),0)+(row->>'hours')::numeric>(row->>'max_capacity')::numeric then raise exception 'Impegni sovrapposti oltre l’orario giornaliero';end if;
  insert into public.leave_ledger(person_key,day,kind,hours,quantity,state,source_key,document_id,note,created_by) values(key,(row->>'day')::date,row->>'kind',(row->>'hours')::numeric,(row->>'quantity')::numeric,row->>'state',request_key,document,left(coalesce(row->>'note',''),300),actor);
 end loop;
 if document is not null then insert into public.leave_document_links(document_id,person_key,mode,updated_by) values(document,key,'recorded',actor) on conflict(document_id) do update set mode='recorded',updated_by=actor;end if;
 insert into public.leave_audit(actor,action,person_key,details) values(actor,'entries',key,jsonb_build_object('request',request_key,'document',document,'count',jsonb_array_length(entries)));
end $$;
revoke all on function public.leave_import_report(uuid,jsonb,boolean),public.leave_set_config(uuid,text,integer,jsonb),public.leave_add_entries(uuid,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.leave_import_report(uuid,jsonb,boolean),public.leave_set_config(uuid,text,integer,jsonb),public.leave_add_entries(uuid,text,text,jsonb,uuid) to service_role;
commit;
