-- Schedule data refresh every 15 minutes and LINE summaries at 09:00 / 21:00 JST.
-- Supabase pg_cron uses UTC.
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

select cron.unschedule('run-signal-bot-refresh-15min')
where exists (
  select 1
  from cron.job
  where jobname = 'run-signal-bot-refresh-15min'
);

select cron.schedule(
  'run-signal-bot-refresh-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/run-signal-bot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bot-secret', 'REPLACE_WITH_RUN_SIGNAL_BOT_SECRET'
    ),
    body := jsonb_build_object('notify_summary', false)
  );
  $$
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
    body := jsonb_build_object('notify_summary', true)
  );
  $$
);
