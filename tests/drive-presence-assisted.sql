begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"de4b5f37-3a58-492b-b7b8-c06425245df7","role":"authenticated"}',true);
do $$ declare original integer;v integer;result jsonb;bad boolean;args jsonb:='{"ordinary":240,"extra":80,"absence":0,"cause":"","workplace":"Tribunale Minori Taranto","evidence":"Rollback-only integration test"}';begin
 select version into original from public.hour_budget_days where person_key='DUSSMANN:107687' and day='2026-11-10';
 select version into v from public.daily_presence where worker_id='60d6c259-e421-474b-9c5c-cc1d641e32d5' and day='2026-11-10';
 bad:=false;begin perform public.confirm_drive_presence_pilot('ece264ac-6624-4957-8635-53eba15f1672','2026-11-10',args,original,v,1,false,false);exception when raise_exception then if sqlerrm like 'Controlla giorno%' then bad:=true;else raise;end if;end;if not bad then raise exception 'Missing review accepted';end if;
 bad:=false;begin perform public.confirm_drive_presence_pilot('ece264ac-6624-4957-8635-53eba15f1672','2026-11-10',args,original,v+1,1,true,false);exception when raise_exception then if sqlerrm like 'La giornata nell’app%' then bad:=true;else raise;end if;end;if not bad then raise exception 'Stale declaration accepted';end if;
 result:=public.confirm_drive_presence_pilot('ece264ac-6624-4957-8635-53eba15f1672','2026-11-10',args,original,v,1,true,false);
 if (result->>'version')::integer<>original+1 or result->'allocations'->0->>'overtime'<>'80' then raise exception 'Saved value incorrect';end if;
 bad:=false;begin perform public.confirm_drive_presence_pilot('ece264ac-6624-4957-8635-53eba15f1672','2026-11-10',args,original,v,1,true,false);exception when raise_exception then if sqlerrm like 'Il budget è cambiato%' then bad:=true;else raise;end if;end;if not bad then raise exception 'Duplicate stale write accepted';end if;
end $$;
reset role;
do $$declare v integer;begin
 select version into v from public.hour_budget_days where person_key='DUSSMANN:107687' and day='2026-11-10';
 if private.auto_acquire_presence('60d6c259-e421-474b-9c5c-cc1d641e32d5','2026-11-10') is distinct from false then raise exception 'OCR protection failed';end if;
 if v<>(select version from public.hour_budget_days where person_key='DUSSMANN:107687' and day='2026-11-10') then raise exception 'OCR row overwritten';end if;
end $$;
select set_config('request.jwt.claims','{"sub":"60d6c259-e421-474b-9c5c-cc1d641e32d5","role":"authenticated"}',true);
do $$declare before_version integer;new_version integer;begin
 select version into before_version from public.hour_budget_days where person_key='DUSSMANN:107687' and day='2026-11-10';
 update public.daily_presence set supplementary_minutes=supplementary_minutes+1 where worker_id='60d6c259-e421-474b-9c5c-cc1d641e32d5' and day='2026-11-10' returning version into new_version;
 if before_version<>(select version from public.hour_budget_days where person_key='DUSSMANN:107687' and day='2026-11-10') then raise exception 'Later worker edit overwrote OCR decision';end if;
 if not exists(select 1 from public.app_notifications where event_key='admin-presence:day:60d6c259-e421-474b-9c5c-cc1d641e32d5:2026-11-10:'||new_version::text) then raise exception 'Later edit review notification missing';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"60d6c259-e421-474b-9c5c-cc1d641e32d5","role":"authenticated"}',true);
do $$declare rejected boolean:=false;begin
 begin perform public.confirm_drive_presence_pilot('ece264ac-6624-4957-8635-53eba15f1672','2026-11-10','{}',null,null,null,true,false);exception when raise_exception then if sqlerrm like 'Accesso amministratore%' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'Worker authorization failed';end if;
end $$;
rollback;
