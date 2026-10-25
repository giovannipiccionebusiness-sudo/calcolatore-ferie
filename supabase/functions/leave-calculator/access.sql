create function public.leave_snapshot(actor uuid,key text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare administrator boolean; result jsonb;
begin
 select exists(select 1 from public.profiles where id=actor and role='admin' and active) into administrator;
 if not administrator and not exists(select 1 from public.leave_people p join public.profiles a on a.id=p.account_id where p.person_key=key and a.id=actor and a.role='worker' and a.active) then raise exception 'Non autorizzato';end if;
 select jsonb_build_object('person',to_jsonb(p),'config',c.data,'version',c.version,
 'balances',coalesce((select jsonb_agg(jsonb_build_object('period',b.period,'ferie',b.ferie::text,'rol',b.rol::text,'ex_festivita',b.ex_festivita::text,'source',case when administrator then b.source else null end) order by b.period) from public.leave_balances b where b.person_key=key),'[]'::jsonb),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'day',l.day,'kind',l.kind,'hours',l.hours::text,'quantity',l.quantity::text,'state',l.state,'included_in_report',l.included_in_report,'document_id',l.document_id,'note',l.note) order by l.day) from public.leave_ledger l where l.person_key=key),'[]'::jsonb),
 'unreconciled',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'category',d.category,'month',d.month,'created_at',d.created_at)) from public.documents d where d.worker_id=p.account_id and d.category in ('ferie','rol') and d.authorization='approved' and d.review_status<>'rejected' and not exists(select 1 from public.leave_document_links x where x.document_id=d.id)),'[]'::jsonb))
 into result from public.leave_people p join public.leave_config c using(person_key) where p.person_key=key;
 return result;
end $$;
create function public.leave_link_account(actor uuid,key text,account uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=actor and role='admin' and active) then raise exception 'Non autorizzato';end if;
 if account is not null and not exists(select 1 from public.profiles where id=account and role='worker') then raise exception 'Account lavoratore non valido';end if;
 update public.leave_people set account_id=account where person_key=key;
 if not found then raise exception 'Lavoratore non trovato';end if;
 insert into public.leave_audit(actor,action,person_key,details) values(actor,'link',key,jsonb_build_object('account',account));
end $$;
revoke all on function public.leave_snapshot(uuid,text),public.leave_link_account(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.leave_snapshot(uuid,text),public.leave_link_account(uuid,text,uuid) to service_role;
