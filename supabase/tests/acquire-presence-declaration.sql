begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='admin' order by created_at limit 1),true);
-- All fixtures use unused historical dates and are rolled back. No notices or dispatch calls.
create temp table acquisition_fixture as
select p.id as worker,'ACCOUNT:'||p.id::text as person_key from public.profiles p where p.active and p.role='worker' and not exists(select 1 from public.daily_presence d where d.worker_id=p.id and d.day between '2020-11-02'::date and '2020-11-04'::date) and not exists(select 1 from public.hour_budget_days h where h.person_key='ACCOUNT:'||p.id::text and h.day between '2020-11-02'::date and '2020-11-04'::date) order by p.created_at limit 1;
DO $$begin if not exists(select 1 from acquisition_fixture) then raise exception 'No unused fixture dates available';end if;end $$;
insert into public.hour_budget_registry(person_key,account_id,schedules) select person_key,worker,'[]'::jsonb from acquisition_fixture where not exists(select 1 from public.hour_budget_registry r where r.person_key=acquisition_fixture.person_key);
insert into public.daily_presence(worker_id,day,supplementary_minutes,cause,absence_scope,absence_minutes)
select worker,'2020-11-02'::date,90,'PHR','partial',40 from acquisition_fixture union all select worker,'2020-11-03'::date,90,'',null,null from acquisition_fixture union all select worker,'2020-11-04'::date,0,'F','full',null from acquisition_fixture;
insert into public.hour_budget_days(person_key,day,allocations,absence_minutes,justification,source_note,confirmed)
select person_key,'2020-11-02'::date,'[{"workplace":"Tribunale Penale Lecce","ordinary":240,"overtime":30}]'::jsonb,0,'','QA acquisition fixture',true from acquisition_fixture
union all select person_key,'2020-11-03'::date,'[{"workplace":"Tribunale Penale Lecce","ordinary":120,"overtime":0},{"workplace":"Tribunale Civile Lecce","ordinary":120,"overtime":0}]'::jsonb,0,'','QA acquisition fixture',true from acquisition_fixture;

-- Do not grant access to real tables beyond their existing RLS. Temp fixture is read-only.
grant select on acquisition_fixture to authenticated;
set local role authenticated;
DO $$declare key text;worker uuid;r public.hour_budget_days;alloc jsonb:='[{"workplace":"Tribunale Penale Lecce","ordinary":240,"overtime":90}]'::jsonb;begin
 select person_key,f.worker into key,worker from acquisition_fixture f;
 r:=public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,1,alloc,40,null,'QA acquisition',true);
 if r.version<>2 or (r.allocations->0->>'ordinary')::int<>240 or (r.allocations->0->>'overtime')::int<>90 or r.absence_minutes<>40 or r.justification<>'PHR' or not r.confirmed then raise exception 'Single-site acquisition failed';end if;
 r:=public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,2,alloc,40,null,r.source_note,true);
 if r.version<>3 or (r.allocations->0->>'overtime')::int<>90 then raise exception 'Repeated acquisition double counted';end if;
 begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,2,3,alloc,40,null,'',true);raise exception 'TEST stale declaration accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,1,alloc,40,null,'',true);raise exception 'TEST stale presence accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,3,jsonb_set(alloc,'{0,ordinary}','120'),40,null,'',true);raise exception 'TEST existing ordinary changed';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,3,alloc,90,null,'',true);raise exception 'TEST wrong partial absence accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,3,alloc,40,null,'',false);raise exception 'TEST unverified acquisition accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 alloc:='[{"workplace":"Tribunale Penale Lecce","ordinary":120,"overtime":60},{"workplace":"Tribunale Civile Lecce","ordinary":120,"overtime":30}]'::jsonb;
 r:=public.acquire_presence_declaration(key,'2020-11-03'::date,worker,1,1,alloc,0,null,'',true);
 if (select sum((v->>'ordinary')::int+(v->>'overtime')::int) from jsonb_array_elements(r.allocations) v)<>330 then raise exception 'Multi-site total wrong';end if;
 if (r.allocations->0->>'overtime')::int<>60 or (r.allocations->1->>'overtime')::int<>30 then raise exception 'Wrong site distribution';end if;
 begin perform public.acquire_presence_declaration(key,'2020-11-03'::date,worker,1,2,jsonb_set(alloc,'{1,overtime}','0'),0,null,'',true);raise exception 'TEST supplementary total mismatch accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
 r:=public.acquire_presence_declaration(key,'2020-11-04'::date,worker,1,null,'[{"workplace":"Tribunale Penale Lecce","ordinary":0,"overtime":0}]'::jsonb,240,null,'',true);
 if r.justification<>'F' or r.absence_minutes<>240 then raise exception 'Full day absence acquisition failed';end if;
 begin perform public.acquire_presence_declaration(key,'2020-11-04'::date,worker,1,1,'[{"workplace":"Tribunale Penale Lecce","ordinary":0,"overtime":0}]'::jsonb,0,null,'',true);raise exception 'TEST full absence missing hours accepted';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select worker::text from acquisition_fixture),true);
set local role authenticated;
DO $$declare key text;worker uuid;begin select person_key,f.worker into key,worker from acquisition_fixture f;begin perform public.acquire_presence_declaration(key,'2020-11-02'::date,worker,1,3,'[{"workplace":"Tribunale Penale Lecce","ordinary":240,"overtime":90}]'::jsonb,40,null,'',true);raise exception 'TEST worker could acquire';exception when others then if sqlerrm like 'TEST%' then raise;end if;end;end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='admin' order by created_at limit 1),true);
DO $$declare key text;worker uuid;r public.hour_budget_days;begin
 select reg.person_key,lp.account_id into key,worker from public.hour_budget_registry reg join public.leave_people lp on lp.person_key=reg.imported_person_key join public.profiles p on p.id=lp.account_id and p.active and p.role='worker'
 where not exists(select 1 from public.daily_presence d where d.worker_id=lp.account_id and d.day='2020-11-05'::date) and not exists(select 1 from public.hour_budget_days h where h.person_key=reg.person_key and h.day='2020-11-05'::date) limit 1;
 if key is null then raise exception 'Imported account fixture missing';end if;
 insert into public.daily_presence(worker_id,day,supplementary_minutes,cause) values(worker,'2020-11-05',60,'');
 insert into public.hour_budget_days(person_key,day,allocations,absence_minutes,justification,source_note,confirmed) values(key,'2020-11-05','[{"workplace":"Tribunale Penale Lecce","ordinary":180,"overtime":0}]',0,'','Imported fixture',true);
 r:=public.acquire_presence_declaration(key,'2020-11-05',worker,1,1,'[{"workplace":"Tribunale Penale Lecce","ordinary":180,"overtime":60}]',0,null,'',true);
 if (r.allocations->0->>'ordinary')::int<>180 or (r.allocations->0->>'overtime')::int<>60 then raise exception 'Imported worker acquisition failed';end if;
end $$;
select 'PASS: admin-only verified acquisition, existing ordinary preserved per site, replacement without duplicate hours, partial/full absence, stale versions, imported account links and multi-site totals' as checks;
rollback;
