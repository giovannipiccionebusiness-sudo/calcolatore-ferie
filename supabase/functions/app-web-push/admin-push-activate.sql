do $$ declare source text;begin
 select pg_get_functiondef('private.test_push_tick(timestamptz)'::regprocedure) into source;
 if strpos(source,'collect_admin_push')=0 then
 source:=replace(source,'begin'||chr(10),'begin'||chr(10)||' perform private.collect_admin_push();'||chr(10));execute source;
 end if;
end $$;
