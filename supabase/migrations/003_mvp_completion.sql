create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "allowed users can read settings" on public.settings;
create policy "allowed users can read settings"
on public.settings
for select
using (
  exists (
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "allowed users can read bot runs" on public.bot_runs;
create policy "allowed users can read bot runs"
on public.bot_runs
for select
using (
  exists (
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
  )
);

insert into public.settings (key, value)
values
  ('notification_rules', jsonb_build_object(
    'buy_score_threshold', 80,
    'profit_score_threshold', 80,
    'notify_cut_loss', true,
    'mute_outside_market_hours', false
  )),
  ('scoring_weights', jsonb_build_object(
    'technical', 40,
    'volume_liquidity', 25,
    'demand_proxy', 15,
    'news', 0,
    'safety_adjustment_min', -30
  )),
  ('disclaimer', jsonb_build_object(
    'text', '本システムは投資助言ではありません。表示内容は売買を推奨・保証するものではなく、最終判断は利用者本人が行ってください。'
  ))
on conflict (key) do nothing;
