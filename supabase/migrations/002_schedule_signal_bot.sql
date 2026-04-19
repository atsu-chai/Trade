-- Run this after deploying the Edge Function and setting RUN_SIGNAL_BOT_SECRET.
-- This schedule uses UTC. 00:00-06:45 UTC is 09:00-15:45 JST.

select cron.unschedule('run-signal-bot-market-hours')
where exists (
  select 1
  from cron.job
  where jobname = 'run-signal-bot-market-hours'
);

select cron.schedule(
  'run-signal-bot-market-hours',
  '*/15 0-6 * * 1-5',
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
