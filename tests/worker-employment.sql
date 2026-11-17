begin;
select set_config('request.jwt.claim.sub','de4b5f37-3a58-492b-b7b8-c06425245df7',true);
set local role authenticated;
do $$ declare r jsonb;begin
 r:=public.set_worker_employment('60d6c259-e421-474b-9c5c-cc1d641e32d5','2026-11-10',0);
 if r->>'last_day'<>'2026-11-10' or (r->>'version')::int<>1 then raise exception 'Cessation save failed';end if;
 begin
 perform public.set_worker_employment('60d6c259-e421-474b-9c5c-cc1d641e32d5','2026-11-09',0);raise exception 'Stale update accepted';
 exception when others then if sqlerrm not like 'Dati modificati:%' then raise;end if;end;
 r:=public.set_worker_employment('DUSSMANN:107687','2026-11-11',1);
 if r->>'last_day'<>'2026-11-11' or (r->>'version')::int<>2 then raise exception 'Correction/relinked identity failed';end if;
 r:=public.set_worker_employment('60d6c259-e421-474b-9c5c-cc1d641e32d5',null,2);
 if r->>'last_day' is not null or (r->>'version')::int<>3 then raise exception 'Restore failed';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','60d6c259-e421-474b-9c5c-cc1d641e32d5',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.worker_employment_status) then raise exception 'Worker can read cessations';end if;
 begin perform public.set_worker_employment('60d6c259-e421-474b-9c5c-cc1d641e32d5','2026-11-10',0);raise exception 'Worker can change cessation';
 exception when others then if sqlerrm<>'Operazione riservata all’amministratore' then raise;end if;end;
end $$;
reset role;
rollback;
