select cron.schedule('lavoro-facile-daily-presence','* * * * *','select private.daily_presence_tick();');
