import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const STOCK_MASTER_PATH = path.join(ROOT, "web/lib/stock-master.ts");
const CONFIG_PATH = path.join(ROOT, "config/strategy-config.ts");
const REPORT_DIR = path.join(ROOT, "data/research");
const REPORT_PATH = path.join(REPORT_DIR, "latest-report.json");
const FROM_DATE = "2015-01-01";
const VALIDATION_FROM = "2024-01-01";
const MAX_UNIVERSE = Number(process.env.RESEARCH_UNIVERSE_SIZE ?? "24");
const MAX_CANDIDATES = Number(process.env.RESEARCH_CANDIDATES ?? "40");
const RESEARCH_SEED = Number(process.env.RESEARCH_SEED ?? "1");

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sma(values, end, period) {
  if (end + 1 < period) return null;
  return average(values.slice(end + 1 - period, end + 1));
}

function volumeRatio(values, end, period) {
  if (end < period) return null;
  const prior = values.slice(end - period, end);
  const avg = average(prior);
  return avg > 0 ? values[end] / avg : null;
}

function maxDrawdown(equity) {
  let peak = equity[0] ?? 1;
  let worst = 0;
  for (const value of equity) {
    peak = Math.max(peak, value);
    const drawdown = ((value - peak) / peak) * 100;
    worst = Math.min(worst, drawdown);
  }
  return worst;
}

function evaluateStrategy(candles, config) {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const trades = [];
  let index = Math.max(config.maBase, config.breakoutLookback, config.volumeLookback) + 1;

  while (index < candles.length - 2) {
    const maShort = sma(closes, index, config.maShort);
    const maBase = sma(closes, index, config.maBase);
    const ratio = volumeRatio(volumes, index, config.volumeLookback);
    const previousHigh = Math.max(...closes.slice(Math.max(0, index - config.breakoutLookback), index));
    const isEntry =
      maShort !== null &&
      maBase !== null &&
      ratio !== null &&
      closes[index] > maShort &&
      maShort > maBase &&
      ratio >= config.volumeThreshold &&
      closes[index] >= previousHigh * config.breakoutBuffer;

    if (!isEntry) {
      index += 1;
      continue;
    }

    const entryIndex = index + 1;
    const entryPrice = candles[entryIndex].open;
    const takeProfit = entryPrice * (1 + config.takeProfitPct);
    const stopLoss = entryPrice * (1 - config.stopLossPct);
    let exitIndex = Math.min(entryIndex + config.maxHoldBars, candles.length - 1);
    let exitPrice = candles[exitIndex].close;
    let reason = "timeout";

    for (let cursor = entryIndex; cursor <= Math.min(entryIndex + config.maxHoldBars, candles.length - 1); cursor += 1) {
      const candle = candles[cursor];
      if (candle.low <= stopLoss) {
        exitIndex = cursor;
        exitPrice = stopLoss;
        reason = "stop";
        break;
      }
      if (candle.high >= takeProfit) {
        exitIndex = cursor;
        exitPrice = takeProfit;
        reason = "take";
        break;
      }
    }

    trades.push({
      entryDate: candles[entryIndex].ts,
      exitDate: candles[exitIndex].ts,
      entryPrice,
      exitPrice,
      returnPct: ((exitPrice - entryPrice) / entryPrice) * 100,
      reason,
    });
    index = exitIndex + 1;
  }

  const wins = trades.filter((trade) => trade.returnPct > 0);
  const losses = trades.filter((trade) => trade.returnPct < 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.returnPct, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.returnPct, 0));
  const equity = trades.reduce((series, trade) => {
    const previous = series.at(-1) ?? 1;
    series.push(previous * (1 + trade.returnPct / 100));
    return series;
  }, [1]);
  const expectancyPct = average(trades.map((trade) => trade.returnPct));
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const terminalEquity = equity.at(-1) ?? 1;
  const drawdownPct = maxDrawdown(equity);
  const score =
    Math.log(Math.max(terminalEquity, 0.0001)) * 100 +
    expectancyPct * 3 +
    Math.min(6, profitFactor) * 4 +
    winRate * 0.08 +
    drawdownPct * 0.25 -
    Math.max(0, 12 - trades.length) * 0.8;

  return {
    tradeCount: trades.length,
    winRate,
    expectancyPct,
    profitFactor,
    maxDrawdownPct: drawdownPct,
    terminalEquity,
    score,
  };
}

function parseStockMaster(source) {
  return [...source.matchAll(/\{ code: "(\d+)", name: "([^"]+)"/g)].map((match) => ({
    code: match[1],
    name: match[2],
  }));
}

async function fetchYahooDailyCandles(code) {
  const candidates = /^\d{5}$/.test(code) && code.endsWith("0")
    ? [`${code.slice(0, 4)}.T`, code]
    : /^\d{4}$/.test(code)
      ? [`${code}.T`, code]
      : [`${code}.T`, code];

  for (const symbol of candidates) {
    const combined = [];
    for (let year = 2015; year <= new Date().getUTCFullYear(); year += 1) {
      const period1 = Math.floor(Date.UTC(year, 0, 1) / 1000);
      const period2 = Math.floor(Date.UTC(year + 1, 0, 1) / 1000);
      const params = new URLSearchParams({
        period1: String(period1),
        period2: String(period2),
        interval: "1d",
        events: "history",
        includeAdjustedClose: "true",
      });
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) continue;
      const result = body.chart?.result?.[0];
      const quote = result?.indicators?.quote?.[0];
      if (!result?.timestamp?.length || !quote) continue;

      const candles = result.timestamp
        .map((timestamp, index) => {
          const open = Number(quote.open?.[index]);
          const high = Number(quote.high?.[index]);
          const low = Number(quote.low?.[index]);
          const close = Number(quote.close?.[index]);
          const volume = Number(quote.volume?.[index]);
          if (![open, high, low, close, volume].every(Number.isFinite)) return null;
          const ts = new Date(timestamp * 1000).toISOString();
          if (ts.slice(0, 10) < FROM_DATE) return null;
          return { ts, open, high, low, close, volume };
        })
        .filter(Boolean);

      combined.push(...candles);
    }

    if (combined.length > 0) {
      const deduped = [...new Map(combined.map((candle) => [candle.ts, candle])).values()].sort((a, b) => a.ts.localeCompare(b.ts));
      if (deduped.length > 0) return deduped;
    }
  }

  return [];
}

function splitCandles(candles) {
  return {
    train: candles.filter((candle) => candle.ts.slice(0, 10) < VALIDATION_FROM),
    validation: candles.filter((candle) => candle.ts.slice(0, 10) >= VALIDATION_FROM),
  };
}

function parseCurrentConfig(source) {
  const match = source.match(/dailyBacktest:\s*\{([\s\S]*?)\n\s*\},/);
  if (!match) throw new Error("Could not parse current strategy config.");
  const parseNumber = (key) => {
    const keyMatch = match[1].match(new RegExp(`${key}:\\s*([0-9.]+)`));
    return keyMatch ? Number(keyMatch[1]) : null;
  };
  return {
    maShort: parseNumber("maShort"),
    maBase: parseNumber("maBase"),
    breakoutLookback: parseNumber("breakoutLookback"),
    breakoutBuffer: parseNumber("breakoutBuffer"),
    volumeLookback: parseNumber("volumeLookback"),
    volumeThreshold: parseNumber("volumeThreshold"),
    takeProfitPct: parseNumber("takeProfitPct"),
    stopLossPct: parseNumber("stopLossPct"),
    maxHoldBars: parseNumber("maxHoldBars"),
  };
}

function renderConfigFile(config, source) {
  return `export type DailyStrategyConfig = {
  maShort: number;
  maBase: number;
  breakoutLookback: number;
  breakoutBuffer: number;
  volumeLookback: number;
  volumeThreshold: number;
  takeProfitPct: number;
  stopLossPct: number;
  maxHoldBars: number;
};

export type StrategyConfig = {
  version: number;
  updatedAt: string;
  source: string;
  dailyBacktest: DailyStrategyConfig;
};

export const STRATEGY_CONFIG: StrategyConfig = {
  version: 1,
  updatedAt: "${new Date().toISOString()}",
  source: "${source}",
  dailyBacktest: {
    maShort: ${config.maShort},
    maBase: ${config.maBase},
    breakoutLookback: ${config.breakoutLookback},
    breakoutBuffer: ${config.breakoutBuffer},
    volumeLookback: ${config.volumeLookback},
    volumeThreshold: ${config.volumeThreshold},
    takeProfitPct: ${config.takeProfitPct},
    stopLossPct: ${config.stopLossPct},
    maxHoldBars: ${config.maxHoldBars},
  },
};
`;
}

function createCandidatePool() {
  const candidates = [];
  for (const maShort of [4, 5, 6, 8]) {
    for (const maBase of [15, 20, 25, 30]) {
      if (maShort >= maBase) continue;
      for (const breakoutLookback of [10, 15, 20, 30]) {
        for (const volumeThreshold of [1.1, 1.2, 1.3, 1.5]) {
          for (const takeProfitPct of [0.025, 0.03, 0.04]) {
            for (const stopLossPct of [0.02, 0.025, 0.03]) {
              for (const maxHoldBars of [5, 8, 10, 15]) {
                candidates.push({
                  maShort,
                  maBase,
                  breakoutLookback,
                  breakoutBuffer: 0.995,
                  volumeLookback: 20,
                  volumeThreshold,
                  takeProfitPct,
                  stopLossPct,
                  maxHoldBars,
                });
              }
            }
          }
        }
      }
    }
  }

  candidates.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const random = createSeededRandom(RESEARCH_SEED);
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  return candidates.slice(0, MAX_CANDIDATES);
}

async function main() {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const stockMasterSource = await fs.readFile(STOCK_MASTER_PATH, "utf8");
  const configSource = await fs.readFile(CONFIG_PATH, "utf8");
  const currentConfig = parseCurrentConfig(configSource);
  const stockMaster = parseStockMaster(stockMasterSource).slice(0, MAX_UNIVERSE);

  const datasets = [];
  for (const stock of stockMaster) {
    const candles = await fetchYahooDailyCandles(stock.code);
    if (candles.length < 600) continue;
    const split = splitCandles(candles);
    if (split.train.length < 250 || split.validation.length < 120) continue;
    datasets.push({ ...stock, ...split });
  }

  if (!datasets.length) {
    throw new Error("No usable historical datasets were fetched.");
  }

  const baselineTrain = datasets.map((dataset) => evaluateStrategy(dataset.train, currentConfig));
  const baselineValidation = datasets.map((dataset) => evaluateStrategy(dataset.validation, currentConfig));
  const summarize = (results) => ({
    score: average(results.map((result) => result.score)),
    expectancyPct: average(results.map((result) => result.expectancyPct)),
    winRate: average(results.map((result) => result.winRate)),
    profitFactor: average(results.map((result) => Number.isFinite(result.profitFactor) ? result.profitFactor : 6)),
    maxDrawdownPct: average(results.map((result) => result.maxDrawdownPct)),
    tradeCount: average(results.map((result) => result.tradeCount)),
    terminalEquity: average(results.map((result) => result.terminalEquity)),
  });

  const baseline = {
    train: summarize(baselineTrain),
    validation: summarize(baselineValidation),
  };

  let best = {
    config: currentConfig,
    train: baseline.train,
    validation: baseline.validation,
    adopted: false,
  };

  for (const candidate of createCandidatePool()) {
    const trainSummary = summarize(datasets.map((dataset) => evaluateStrategy(dataset.train, candidate)));
    const validationSummary = summarize(datasets.map((dataset) => evaluateStrategy(dataset.validation, candidate)));
    const improved =
      validationSummary.score > best.validation.score + 0.25 &&
      validationSummary.expectancyPct >= best.validation.expectancyPct &&
      validationSummary.tradeCount >= 4;

    if (improved) {
      best = {
        config: candidate,
        train: trainSummary,
        validation: validationSummary,
        adopted: true,
      };
    }
  }

  if (best.adopted) {
    await fs.writeFile(CONFIG_PATH, renderConfigFile(best.config, "research-2015-yahoo"), "utf8");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: "research-2015-yahoo",
    seed: RESEARCH_SEED,
    universeSize: datasets.length,
    baseline,
    best,
  };
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
}

await main();
