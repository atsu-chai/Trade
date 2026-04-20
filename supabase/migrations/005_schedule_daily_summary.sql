-- Schedule the signal bot at 09:00 and 21:00 JST every day.
-- Supabase pg_cron uses UTC, so this is 00:00 and 12:00 UTC.
-- Replace REPLACE_WITH_RUN_SIGNAL_BOT_SECRET before applying if you want cron to work immediately.

select cron.unschedule('run-signal-bot-market-hours')
where exists (
  select 1
  from cron.job
  where jobname = 'run-signal-bot-market-hours'
);

select cron.unschedule('run-signal-bot-daily-summary')
where exists (
  select 1
  from cron.job
  where jobname = 'run-signal-bot-daily-summary'
);

select cron.schedule(
  'run-signal-bot-daily-summary',
  '0 0,12 * * *',
  $$
  select net.http_post(
    url := 'https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/run-signal-bot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bot-secret', 'REPLACE_WITH_RUN_SIGNAL_BOT_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
