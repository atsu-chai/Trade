create table if not exists public.virtual_bots (
  id bigserial primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '仮想bot',
  status text not null default 'active' check (status in ('active', 'paused')),
  initial_cash numeric not null default 100000,
  cash_balance numeric not null default 100000,
  realized_pnl numeric not null default 0,
  latest_equity numeric not null default 100000,
  latest_valuation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.virtual_positions (
  id bigserial primary key,
  bot_id bigint not null references public.virtual_bots(id) on delete cascade,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  avg_cost numeric not null,
  last_price numeric not null,
  market_value numeric not null,
  unrealized_pnl numeric not null default 0,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bot_id, stock_id)
);

create table if not exists public.virtual_trades (
  id bigserial primary key,
  bot_id bigint not null references public.virtual_bots(id) on delete cascade,
  stock_id bigint not null references public.stocks(id) on delete cascade,
  signal_id bigint references public.signals(id) on delete set null,
  side text not null check (side in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  price numeric not null,
  gross_amount numeric not null,
  fee numeric not null default 0,
  realized_pnl numeric not null default 0,
  reason text not null default '',
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.virtual_bots enable row level security;
alter table public.virtual_positions enable row level security;
alter table public.virtual_trades enable row level security;

drop trigger if exists virtual_bots_set_updated_at on public.virtual_bots;
create trigger virtual_bots_set_updated_at
before update on public.virtual_bots
for each row execute function public.set_updated_at();

drop trigger if exists virtual_positions_set_updated_at on public.virtual_positions;
create trigger virtual_positions_set_updated_at
before update on public.virtual_positions
for each row execute function public.set_updated_at();

drop policy if exists "users can manage own virtual bots" on public.virtual_bots;
create policy "users can manage own virtual bots"
on public.virtual_bots
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can read own virtual positions" on public.virtual_positions;
create policy "users can read own virtual positions"
on public.virtual_positions
for select
using (
  exists (
    select 1
    from public.virtual_bots vb
    where vb.id = virtual_positions.bot_id
      and vb.user_id = auth.uid()
  )
);

drop policy if exists "users can read own virtual trades" on public.virtual_trades;
create policy "users can read own virtual trades"
on public.virtual_trades
for select
using (
  exists (
    select 1
    from public.virtual_bots vb
    where vb.id = virtual_trades.bot_id
      and vb.user_id = auth.uid()
  )
);
