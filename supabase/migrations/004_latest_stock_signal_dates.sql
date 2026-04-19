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
  sig.created_at as signal_at,
  latest_candle.ts as latest_price_at
from public.stocks s
left join public.technical_indicators ti on ti.stock_id = s.id
left join lateral (
  select pc.ts
  from public.price_candles pc
  where pc.stock_id = s.id
    and pc.timeframe = '1d'
  order by pc.ts desc
  limit 1
) latest_candle on true
left join lateral (
  select *
  from public.signals
  where stock_id = s.id
  order by id desc
  limit 1
) sig on true;
