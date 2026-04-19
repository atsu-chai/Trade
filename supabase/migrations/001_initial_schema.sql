create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create table if not exists public.allowed_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.stocks (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  memo text not null default '',
  tags text not null default '',
  watch_status text not null default 'normal' check (watch_status in ('normal', 'strong', 'stopped')),
  target_amount integer not null default 100000,
  is_holding boolean not null default false,
  holding_price numeric,
  holding_shares integer,
  allow_additional_buy boolean not null default false,
  last_data_at timestamptz,
  last_signal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, code)
);

create table if not exists public.price_candles (
  id bigserial primary key,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  timeframe text not null,
  ts timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume bigint not null,
  created_at timestamptz not null default now(),
  unique(stock_id, timeframe, ts)
);

create table if not exists public.technical_indicators (
  stock_id bigint primary key references public.stocks(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  latest_close numeric,
  previous_close numeric,
  price_change_pct numeric,
  ma5 numeric,
  ma25 numeric,
  ma75 numeric,
  rsi14 numeric,
  macd numeric,
  macd_signal numeric,
  bb_upper numeric,
  bb_middle numeric,
  bb_lower numeric,
  vwap numeric,
  volume_ratio numeric,
  liquidity_value numeric,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists public.signals (
  id bigserial primary key,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  signal_type text not null,
  score integer not null,
  strength text not null,
  risk_level text not null,
  entry_price_low numeric,
  entry_price_high numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  stop_loss numeric,
  reasons_json jsonb not null default '[]'::jsonb,
  cautions_json jsonb not null default '[]'::jsonb,
  beginner_note text not null default '',
  breakdown_json jsonb not null default '{}'::jsonb,
  should_notify boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_history (
  id bigserial primary key,
  signal_id bigint references public.signals(id) on delete set null,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  status text not null,
  message text not null,
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_state (
  stock_id bigint primary key references public.stocks(id) on delete cascade,
  signature text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.bot_runs (
  id bigserial primary key,
  status text not null,
  processed_count integer not null default 0,
  notification_count integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists stocks_set_updated_at on public.stocks;
create trigger stocks_set_updated_at
before update on public.stocks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(new.email)
  ) then
    raise exception 'This email is not allowed to use this app.';
  end if;

  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.allowed_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.stocks enable row level security;
alter table public.price_candles enable row level security;
alter table public.technical_indicators enable row level security;
alter table public.signals enable row level security;
alter table public.notification_history enable row level security;
alter table public.notification_state enable row level security;
alter table public.bot_runs enable row level security;

drop policy if exists "allowed emails are visible to allowed users" on public.allowed_emails;
create policy "allowed emails are visible to allowed users"
on public.allowed_emails
for select
using (
  exists (
    select 1 from public.allowed_emails ae
    where lower(ae.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "users can manage own stocks" on public.stocks;
create policy "users can manage own stocks"
on public.stocks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can read own price candles" on public.price_candles;
create policy "users can read own price candles"
on public.price_candles
for select
using (
  exists (
    select 1 from public.stocks s
    where s.id = price_candles.stock_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "users can read own indicators" on public.technical_indicators;
create policy "users can read own indicators"
on public.technical_indicators
for select
using (
  exists (
    select 1 from public.stocks s
    where s.id = technical_indicators.stock_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "users can read own signals" on public.signals;
create policy "users can read own signals"
on public.signals
for select
using (
  exists (
    select 1 from public.stocks s
    where s.id = signals.stock_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "users can read own notifications" on public.notification_history;
create policy "users can read own notifications"
on public.notification_history
for select
using (
  exists (
    select 1 from public.stocks s
    where s.id = notification_history.stock_id
      and s.user_id = auth.uid()
  )
);

drop policy if exists "users can read own notification state" on public.notification_state;
create policy "users can read own notification state"
on public.notification_state
for select
using (
  exists (
    select 1 from public.stocks s
    where s.id = notification_state.stock_id
      and s.user_id = auth.uid()
  )
);

create or replace view public.latest_stock_signals
with (security_invoker = true)
as
select
  s.*,
  ti.latest_close,
  ti.price_change_pct,
  ti.volume_ratio,
  ti.liquidity_value,
  sig.signal_type,
  sig.score,
  sig.risk_level,
  sig.strength,
  sig.created_at as signal_at
from public.stocks s
left join public.technical_indicators ti on ti.stock_id = s.id
left join lateral (
  select *
  from public.signals
  where stock_id = s.id
  order by id desc
  limit 1
) sig on true;
