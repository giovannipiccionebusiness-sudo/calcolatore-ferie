CREATE OR REPLACE FUNCTION public.register_scoped_push(p_user uuid, p_endpoint text, p_scope text, p_keys jsonb, p_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_sub public.test_push_subscriptions;device_count integer;result uuid;
begin
 if p_user is null or not exists(select 1 from public.profiles where id=p_user) or p_scope is null or p_scope not in ('production','test') or p_endpoint is null or length(p_endpoint) not between 1 and 4095 or p_endpoint not like 'https://%' then raise exception 'Registrazione non valida';end if;
 if p_keys is not null and jsonb_typeof(p_keys)<>'object' then raise exception 'Chiavi non valide';end if;
 perform pg_advisory_xact_lock(hashtextextended('push-register:'||p_user::text,0));
 select * into current_sub from public.test_push_subscriptions where endpoint=p_endpoint for update;
 if current_sub.id is not null then
  if current_sub.user_id<>p_user then raise exception 'ENDPOINT_OWNED_BY_OTHER_ACCOUNT';end if;
  update public.test_push_subscriptions set push_keys=coalesce(p_keys,push_keys),app_scope=p_scope where id=current_sub.id returning id into result;
  return result;
 end if;
 select count(*) into device_count from public.test_push_subscriptions where user_id=p_user and app_scope=p_scope;
 if device_count>=20 then raise exception 'SCOPED_DEVICE_LIMIT';end if;
 insert into public.test_push_subscriptions(user_id,endpoint,activation_seen,push_keys,app_scope)
 values(p_user,p_endpoint,coalesce(p_active,false),p_keys,p_scope) returning id into result;
 return result;
end $function$
;