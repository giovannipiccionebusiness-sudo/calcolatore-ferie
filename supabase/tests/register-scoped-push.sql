begin;
-- All endpoints are inert fixtures, in an unused account; no push is dispatched.
create temp table scoped_push_fixture as select id as user_id from public.profiles p where role='worker' and active and not exists(select 1 from public.test_push_subscriptions s where s.user_id=p.id) order by created_at limit 1;
DO $$begin if not exists(select 1 from scoped_push_fixture) then raise exception 'Unused fixture account missing';end if;end $$;
grant select on scoped_push_fixture to service_role;
insert into public.test_push_subscriptions(user_id,endpoint,activation_seen,app_scope)
select user_id,'https://example.invalid/scoped-qa-production-'||i,true,'production' from scoped_push_fixture cross join generate_series(1,3) i
union all select user_id,'https://example.invalid/scoped-qa-legacy-'||i,true,null from scoped_push_fixture cross join generate_series(1,2) i;
set local role service_role;
DO $$declare actor uuid:=(select user_id from scoped_push_fixture);a uuid;b uuid;other_user uuid;begin
 a:=public.register_scoped_push(actor,'https://example.invalid/scoped-qa-production-4','production',null,true);
 if (select count(*) from public.test_push_subscriptions where user_id=actor and app_scope='production')<>4 then raise exception 'Legacy records blocked new official device';end if;
 b:=public.register_scoped_push(actor,'https://example.invalid/scoped-qa-production-4','production',null,true);if a<>b then raise exception 'Renewal created duplicate';end if;
 perform public.register_scoped_push(actor,'https://example.invalid/scoped-qa-production-5','production',null,true);
 begin perform public.register_scoped_push(actor,'https://example.invalid/scoped-qa-production-6','production',null,true);raise exception 'TEST limit ignored';exception when others then if sqlerrm<>'SCOPED_DEVICE_LIMIT' then raise;end if;end;
 b:=public.register_scoped_push(actor,'https://example.invalid/scoped-qa-production-4','production',null,true);if a<>b then raise exception 'Existing phone blocked at cap';end if;
 perform public.register_scoped_push(actor,'https://example.invalid/scoped-qa-test-1','test',null,true);
 if (select count(*) from public.test_push_subscriptions where user_id=actor and app_scope='test')<>1 then raise exception 'Test scope was blocked by official scope';end if;
 select id into other_user from public.profiles where id<>actor order by created_at limit 1;
 begin perform public.register_scoped_push(other_user,'https://example.invalid/scoped-qa-production-4','production',null,true);raise exception 'TEST ownership changed';exception when others then if sqlerrm<>'ENDPOINT_OWNED_BY_OTHER_ACCOUNT' then raise;end if;end;
 if (select count(*) from public.test_push_subscriptions where user_id=actor and app_scope is null)<>2 then raise exception 'Old endpoints removed';end if;
end $$;
reset role;
DO $$begin if has_function_privilege('authenticated','public.register_scoped_push(uuid,text,text,jsonb,boolean)','execute') or has_function_privilege('anon','public.register_scoped_push(uuid,text,text,jsonb,boolean)','execute') then raise exception 'Registration RPC exposed to clients';end if;end $$;
select 'PASS: original cap reproduced, legacy records separated, renewal idempotent at cap, independent app limits, ownership and service-only RPC; existing phones preserved' as checks;
rollback;
