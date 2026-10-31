begin;
select cron.alter_job(jobid,active:=false) from cron.job where jobname='lavoro-facile-attendance-auto';
alter table public.documents disable trigger enqueue_attendance_auto;
update public.attendance_auto_jobs set status='cancelled',message='Lettura IA disattivata dall’amministratore' where status='queued';
commit;
