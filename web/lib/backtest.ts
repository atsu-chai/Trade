type Candle = {
  ts: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
};

export type BacktestTrade = {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  reason: string;
  holdingBars: number;
};

export type BacktestResult = {
  trades: BacktestTrade[];
  winRate: number;
  averageProfitPct: number;
  averageLossPct: number;
  expectancyPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
};

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(values: number[], end: number, period: number) {
  if (end + 1 < period) return null;
  const slice = values.slice(end + 1 - period, end + 1);
  return average(slice);
}

function volumeRatio(volumes: number[], end: number, period = 20) {
  if (end < period) return null;
  const prior = volumes.slice(end - period, end);
  const avg = average(prior);
  return avg > 0 ? volumes[end] / avg : null;
}

function maxDrawdown(equity: number[]) {
  let peak = equity[0] ?? 1;
  let worst = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    const drawdown = ((value - peak) / peak) * 100;
    worst = Math.min(worst, drawdown);
  }
  return worst;
}

export function runBacktest(candles: Candle[]): BacktestResult {
  const normalized = candles
    .map((candle) => ({
      ts: candle.ts,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
      volume: Number(candle.volume),
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close, candle.volume].every((value) => !Number.isNaN(value)));

  const closes = normalized.map((candle) => candle.close);
  const volumes = normalized.map((candle) => candle.volume);
  const trades: BacktestTrade[] = [];
  let index = 25;

  while (index < normalized.length - 2) {
    const ma5 = sma(closes, index, 5);
    const ma25 = sma(closes, index, 25);
    const ratio = volumeRatio(volumes, index);
    const previousHigh = Math.max(...closes.slice(Math.max(0, index - 20), index));
    const isEntry =
      ma5 !== null &&
      ma25 !== null &&
      ratio !== null &&
      closes[index] > ma5 &&
      ma5 > ma25 &&
      ratio >= 1.3 &&
      closes[index] >= previousHigh * 0.995;

    if (!isEntry) {
      index += 1;
      continue;
    }

    const entryIndex = index + 1;
    const entryPrice = normalized[entryIndex].open;
    const takeProfit = entryPrice * 1.03;
    const stopLoss = entryPrice * 0.97;
    let exitIndex = Math.min(entryIndex + 10, normalized.length - 1);
    let exitPrice = normalized[exitIndex].close;
    let reason = "時間切れ";

    for (let cursor = entryIndex; cursor <= Math.min(entryIndex + 10, normalized.length - 1); cursor += 1) {
      const candle = normalized[cursor];
      if (candle.low <= stopLoss) {
        exitIndex = cursor;
        exitPrice = stopLoss;
        reason = "損切り";
        break;
      }
      if (candle.high >= takeProfit) {
        exitIndex = cursor;
        exitPrice = takeProfit;
        reason = "利確";
        break;
      }
    }

    trades.push({
      entryDate: normalized[entryIndex].ts,
      exitDate: normalized[exitIndex].ts,
      entryPrice,
      exitPrice,
      returnPct: ((exitPrice - entryPrice) / entryPrice) * 100,
      reason,
      holdingBars: exitIndex - entryIndex + 1,
    });
    index = exitIndex + 1;
  }

  const wins = trades.filter((trade) => trade.returnPct > 0);
  const losses = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0));
  const equity = trades.reduce<number[]>((series, trade) => {
    const previous = series.at(-1) ?? 1;
    series.push(previous * (1 + trade.returnPct / 100));
    return series;
  }, [1]);

  return {
    trades,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    averageProfitPct: average(wins.map((trade) => trade.returnPct)),
    averageLossPct: average(losses.map((trade) => trade.returnPct)),
    expectancyPct: average(trades.map((trade) => trade.returnPct)),
    maxDrawdownPct: maxDrawdown(equity),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
  };
}

