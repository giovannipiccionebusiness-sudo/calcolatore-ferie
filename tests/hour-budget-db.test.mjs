import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.REST_PGLITE_MODULE||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema public,private,auth to authenticated;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function private.is_admin() returns boolean language sql as $$select current_setting('test.admin',true)='yes'$$;create table public.profiles(id uuid primary key);create table public.leave_people(person_key text primary key,account_id uuid);create table public.documents(id uuid primary key,worker_id uuid,site text,category text,month text,stage text,week_ending date,review_status text);insert into public.leave_people values('a',null);grant select on public.documents to authenticated;`);
await db.exec(await readFile(new URL('../supabase/hour-budget.sql',import.meta.url),'utf8'));
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);select set_config('test.admin','yes',false);insert into public.hour_budget_assignments(person_key,valid_from,workplace) values('a','2026-01-01','Tribunale Penale Lecce');`);
assert.equal((await db.query('select version from hour_budget_assignments')).rows[0].version,1);
await db.exec(`insert into public.hour_budget_days(person_key,day,source_note,confirmed,allocations) values('a','2026-01-02','Foglio cartaceo verificato',true,'[{"workplace":"Tribunale Penale Lecce","ordinary":240,"overtime":0}]');`);
assert.equal((await db.query('select count(*)::int n from hour_budget_audit')).rows[0].n,2);
for(const sql of ["update hour_budget_days set allocations='[{\"workplace\":\"Invalid\",\"ordinary\":0,\"overtime\":0}]'", "update hour_budget_days set absence_minutes=1440", "update hour_budget_assignments set workplace='Wrong'"]){await assert.rejects(()=>db.exec(sql));}
await db.exec('update hour_budget_days set source_note=\'Revision\' where version=1');
assert.equal((await db.query('select version from hour_budget_days')).rows[0].version,2);
await db.exec('update hour_budget_days set source_note=\'Stale write\' where version=1');assert.equal((await db.query('select source_note from hour_budget_days')).rows[0].source_note,'Revision');
await db.exec("select set_config('test.admin','no',false)");assert.equal((await db.query('select * from hour_budget_days')).rows.length,0);await assert.rejects(()=>db.exec("insert into hour_budget_roster(month,confirmed) values('2026-10',true)"));
await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from hour_budget_days'));
await db.close();console.log('PASS schema, admin save/read, audit, site validation, daily hour limit, optimistic concurrency, worker isolation, anonymous denied');
