create table if not exists public.investment_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  broker text not null default 'sbi',
  budget_yen integer not null default 10000 check (budget_yen between 1000 and 1000000),
  reserve_rate numeric not null default 0.05 check (reserve_rate between 0 and 0.30),
  max_positions integer not null default 2 check (max_positions between 1 and 10),
  min_horizon_days integer not null default 3 check (min_horizon_days between 1 and 90),
  max_horizon_days integer not null default 20 check (max_horizon_days between 1 and 365),
  odd_lot_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (min_horizon_days <= max_horizon_days)
);

create table if not exists public.analysis_loop_runs (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  objective text not null default 'SBI証券のS株で1万円以内の買い候補を探す',
  iteration_limit integer not null default 3 check (iteration_limit between 1 and 10),
  completed_iterations integer not null default 0,
  codex_thread_id text,
  best_score integer,
  summary text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis_loop_candidates (
  id bigserial primary key,
  run_id bigint not null references public.analysis_loop_runs(id) on delete cascade,
  iteration integer not null check (iteration > 0),
  code text not null,
  name text not null,
  current_price numeric not null check (current_price > 0),
  estimated_order_price numeric not null check (estimated_order_price > 0),
  affordable_shares integer not null check (affordable_shares >= 0),
  proposed_amount numeric not null check (proposed_amount >= 0),
  score integer not null check (score between 0 and 100),
  verdict text not null check (verdict in ('候補', '監視', '見送り')),
  horizon_days integer not null check (horizon_days > 0),
  thesis text not null,
  risks_json jsonb not null default '[]'::jsonb,
  sources_json jsonb not null default '[]'::jsonb,
  metrics_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(run_id, iteration, code)
);

create index if not exists analysis_loop_runs_user_created_idx
  on public.analysis_loop_runs(user_id, created_at desc);

create index if not exists analysis_loop_candidates_run_score_idx
  on public.analysis_loop_candidates(run_id, score desc);

alter table public.investment_profiles enable row level security;
alter table public.analysis_loop_runs enable row level security;
alter table public.analysis_loop_candidates enable row level security;

grant select, insert, update on public.investment_profiles to authenticated;
grant select, insert, update on public.analysis_loop_runs to authenticated;
grant select on public.analysis_loop_candidates to authenticated;
grant all on public.investment_profiles, public.analysis_loop_runs, public.analysis_loop_candidates to service_role;
grant usage, select on sequence public.analysis_loop_runs_id_seq to authenticated, service_role;
grant usage, select on sequence public.analysis_loop_candidates_id_seq to service_role;

drop policy if exists "users can manage own investment profile" on public.investment_profiles;
create policy "users can manage own investment profile"
on public.investment_profiles
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can manage own analysis runs" on public.analysis_loop_runs;
create policy "users can manage own analysis runs"
on public.analysis_loop_runs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can read own analysis candidates" on public.analysis_loop_candidates;
create policy "users can read own analysis candidates"
on public.analysis_loop_candidates
for select
to authenticated
using (
  exists (
    select 1 from public.analysis_loop_runs r
    where r.id = analysis_loop_candidates.run_id
      and r.user_id = (select auth.uid())
  )
);

drop trigger if exists investment_profiles_set_updated_at on public.investment_profiles;
create trigger investment_profiles_set_updated_at
before update on public.investment_profiles
for each row execute function public.set_updated_at();

alter table public.stocks alter column target_amount set default 10000;
alter table public.virtual_bots alter column initial_cash set default 10000;
alter table public.virtual_bots alter column cash_balance set default 10000;
alter table public.virtual_bots alter column latest_equity set default 10000;

update public.stocks
set target_amount = 10000
where target_amount = 100000;

update public.virtual_bots
set initial_cash = 10000,
    cash_balance = case when cash_balance = 100000 and latest_equity = 100000 then 10000 else cash_balance end,
    latest_equity = case when cash_balance = 100000 and latest_equity = 100000 then 10000 else latest_equity end
where initial_cash = 100000
  and not exists (
    select 1 from public.virtual_positions vp where vp.bot_id = virtual_bots.id
  )
  and not exists (
    select 1 from public.virtual_trades vt where vt.bot_id = virtual_bots.id
  );
