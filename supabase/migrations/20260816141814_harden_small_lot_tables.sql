drop policy if exists "users can manage own virtual bots" on public.virtual_bots;
create policy "users can manage own virtual bots"
on public.virtual_bots
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "users can read own virtual positions" on public.virtual_positions;
create policy "users can read own virtual positions"
on public.virtual_positions
for select
to authenticated
using (
  exists (
    select 1 from public.virtual_bots vb
    where vb.id = virtual_positions.bot_id
      and vb.user_id = (select auth.uid())
  )
);

drop policy if exists "users can read own virtual trades" on public.virtual_trades;
create policy "users can read own virtual trades"
on public.virtual_trades
for select
to authenticated
using (
  exists (
    select 1 from public.virtual_bots vb
    where vb.id = virtual_trades.bot_id
      and vb.user_id = (select auth.uid())
  )
);

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

create index if not exists virtual_positions_stock_idx on public.virtual_positions(stock_id);
create index if not exists virtual_trades_bot_idx on public.virtual_trades(bot_id);
create index if not exists virtual_trades_stock_idx on public.virtual_trades(stock_id);
create index if not exists virtual_trades_signal_idx on public.virtual_trades(signal_id);

alter function public.set_updated_at() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
