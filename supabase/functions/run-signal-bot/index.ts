import { STRATEGY_CONFIG } from "./strategy-config.ts";

type Stock = {
  id: number;
  user_id: string;
  code: string;
  name: string;
  watch_status: "normal" | "strong" | "stopped";
  is_holding: boolean;
  holding_price: number | null;
  holding_shares: number | null;
  allow_additional_buy: boolean;
};

type Candle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type IndicatorValue = number | string | boolean | Record<string, unknown> | null;
type Indicators = Record<string, IndicatorValue>;

type VirtualBot = {
  id: number;
  user_id: string;
  status: "active" | "paused";
  initial_cash: number | string;
  cash_balance: number | string;
  realized_pnl: number | string;
  latest_equity: number | string;
};

type VirtualPosition = {
  id: number;
  bot_id: number;
  stock_id: number;
  quantity: number;
  avg_cost: number | string;
  last_price: number | string;
  market_value: number | string;
  unrealized_pnl: number | string;
  opened_at: string;
};

type VirtualAnalysisRow = {
  stock: Stock;
  signalId: number | null;
  signalType: string;
  score: number;
  price: number | null;
};

type CodexLoopRun = {
  id: number;
  completed_iterations: number;
  completed_at: string;
};

type CodexCandidate = {
  code: string;
  score: number;
  verdict: "候補" | "監視" | "見送り";
  estimated_order_price: number | string;
};

type JQuantsQuote = {
  Date: string;
  Code: string;
  Open: number | null;
  High: number | null;
  Low: number | null;
  Close: number | null;
  Volume: number | null;
  AdjustmentOpen: number | null;
  AdjustmentHigh: number | null;
  AdjustmentLow: number | null;
  AdjustmentClose: number | null;
  AdjustmentVolume: number | null;
};

type YahooChartResult = {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    previousClose?: number;
    regularMarketTime?: number;
  };
  timestamp?: number[];
  indicators?: {
    quote?: Array<{
      open?: Array<number | null>;
      high?: Array<number | null>;
      low?: Array<number | null>;
      close?: Array<number | null>;
      volume?: Array<number | null>;
    }>;
  };
};

type LatestQuote = {
  price: number;
  previousClose: number | null;
  ts: string;
};

type SummaryRow = {
  stockId: number;
  code: string;
  name: string;
  price: number | null;
  changePct: number | null;
  score: number;
  signalType: string;
  strength: string;
  riskLevel: string;
};

type BotRequest = {
  notify_summary?: boolean;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LINE_TO_USER_ID = Deno.env.get("LINE_TO_USER_ID") ?? "";
const RUN_SIGNAL_BOT_SECRET = Deno.env.get("RUN_SIGNAL_BOT_SECRET") ?? "";
const MARKET_DATA_PROVIDER = (Deno.env.get("MARKET_DATA_PROVIDER") ?? "yahoo").trim().toLowerCase();
const JQUANTS_REFRESH_TOKEN = (Deno.env.get("JQUANTS_REFRESH_TOKEN") ?? "").trim();
const JQUANTS_EMAIL = (Deno.env.get("JQUANTS_EMAIL") ?? "").trim();
const JQUANTS_PASSWORD = (Deno.env.get("JQUANTS_PASSWORD") ?? "").trim();
const VIRTUAL_BOT_INITIAL_CASH = 10000;
const VIRTUAL_BOT_MAX_POSITIONS = 2;
const VIRTUAL_BOT_POSITION_RATIO = 0.5;
const VIRTUAL_BOT_MIN_TRADE_AMOUNT = 1;

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabase(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: headers((init.headers as Record<string, string>) ?? {}),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

function hashCode(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function sampleCandles(stock: Stock): Candle[] {
  const seed = hashCode(stock.code);
  let price = 120 + (seed % 2400);
  const candles: Candle[] = [];
  const today = new Date();
  const current = new Date(today.getTime() - 420 * 24 * 60 * 60 * 1000);
  let index = 0;
  while (candles.length < 260) {
    if (current.getUTCDay() !== 0 && current.getUTCDay() !== 6) {
      const wave = Math.sin((seed + index * 17) / 11) * 0.025;
      const drift = (seed % 7) / 10000;
      const open = Math.max(price * (1 + Math.sin(index) * 0.006), 10);
      let close = Math.max(open * (1 + wave + drift), 10);
      let volume = Math.floor((70000 + (seed % 1200000)) * (0.8 + Math.abs(Math.sin(index * 1.7))));
      if (index > 95 && seed % 3 === 0) {
        close *= 1.015;
        volume *= 2;
      }
      const high = Math.max(open, close) * 1.015;
      const low = Math.min(open, close) * 0.985;
      candles.push({
        ts: current.toISOString(),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
        volume,
      });
      price = close;
      index += 1;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return candles;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function jquantsDate(date: string) {
  return `${date}T00:00:00+09:00`;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jquantsCodeCandidates(code: string) {
  const normalized = code.trim().toUpperCase();
  if (/^\d{4}$/.test(normalized)) {
    return [normalized, `${normalized}0`];
  }
  if (/^\d{5}$/.test(normalized) && normalized.endsWith("0")) {
    return [normalized, normalized.slice(0, 4)];
  }
  return [normalized];
}

function yahooSymbolCandidates(code: string) {
  const normalized = code.trim().toUpperCase();
  if (/^\d{4}$/.test(normalized)) {
    return [`${normalized}.T`, normalized];
  }
  if (/^\d{5}$/.test(normalized) && normalized.endsWith("0")) {
    return [`${normalized.slice(0, 4)}.T`, normalized];
  }
  if (normalized.includes(".")) {
    return [normalized];
  }
  return [`${normalized}.T`, normalized];
}

async function getJQuantsIdTokenFromRefreshToken(refreshToken: string) {
  const response = await fetch(
    `https://api.jquants.com/v1/token/auth_refresh?refreshtoken=${encodeURIComponent(refreshToken)}`,
    { method: "POST" },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.idToken) {
    throw new Error(`J-Quants auth_refresh failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return String(body.idToken);
}

async function getJQuantsIdToken() {
  if (JQUANTS_REFRESH_TOKEN) {
    return getJQuantsIdTokenFromRefreshToken(JQUANTS_REFRESH_TOKEN);
  }

  if (JQUANTS_EMAIL && JQUANTS_PASSWORD) {
    const response = await fetch("https://api.jquants.com/v1/token/auth_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailaddress: JQUANTS_EMAIL, password: JQUANTS_PASSWORD }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.refreshToken) {
      throw new Error(`J-Quants auth_user failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return getJQuantsIdTokenFromRefreshToken(String(body.refreshToken));
  }

  throw new Error("J-Quants credentials are missing. Set JQUANTS_REFRESH_TOKEN or JQUANTS_EMAIL/JQUANTS_PASSWORD.");
}

async function fetchJQuantsQuotes(stock: Stock, idToken: string, code: string, from: Date, to: Date) {
  const params = new URLSearchParams({
    code,
    from: formatDate(from),
    to: formatDate(to),
  });
  const quotes: JQuantsQuote[] = [];
  let paginationKey = "";

  do {
    if (paginationKey) params.set("pagination_key", paginationKey);
    const response = await fetch(`https://api.jquants.com/v1/prices/daily_quotes?${params.toString()}`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`J-Quants daily_quotes failed for ${stock.code} as ${code}: ${response.status} ${JSON.stringify(body)}`);
    }
    quotes.push(...((body.daily_quotes ?? []) as JQuantsQuote[]));
    paginationKey = String(body.pagination_key ?? "");
  } while (paginationKey);

  return quotes;
}

async function fetchJQuantsCandles(stock: Stock, idToken: string): Promise<Candle[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 420 * 24 * 60 * 60 * 1000);
  const quotes: JQuantsQuote[] = [];

  for (const code of jquantsCodeCandidates(stock.code)) {
    const fetched = await fetchJQuantsQuotes(stock, idToken, code, from, to);
    if (fetched.length > 0) {
      quotes.push(...fetched);
      break;
    }
  }

  const candles = quotes
    .map((quote) => {
      const open = numberOrNull(quote.Open);
      const high = numberOrNull(quote.High);
      const low = numberOrNull(quote.Low);
      const close = numberOrNull(quote.Close);
      const volume = numberOrNull(quote.Volume);
      if (open === null || high === null || low === null || close === null || volume === null) return null;
      return {
        ts: jquantsDate(quote.Date),
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
        volume: Math.round(volume),
      };
    })
    .filter((candle): candle is Candle => candle !== null)
    .sort((a, b) => a.ts.localeCompare(b.ts));

  if (candles.length === 0) {
    throw new Error(`J-Quants returned no usable daily quotes for ${stock.code}. Check the issue code and plan availability.`);
  }

  return candles;
}

async function fetchYahooCandles(stock: Stock): Promise<Candle[]> {
  for (const symbol of yahooSymbolCandidates(stock.code)) {
    const params = new URLSearchParams({
      range: "1y",
      interval: "1d",
      events: "history",
    });
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      continue;
    }

    const result = body.chart?.result?.[0] as YahooChartResult | undefined;
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp?.length || !quote) {
      continue;
    }

    const candles = result.timestamp
      .map((timestamp, index) => {
        const open = numberOrNull(quote.open?.[index]);
        const high = numberOrNull(quote.high?.[index]);
        const low = numberOrNull(quote.low?.[index]);
        const close = numberOrNull(quote.close?.[index]);
        const volume = numberOrNull(quote.volume?.[index]);
        if (open === null || high === null || low === null || close === null || volume === null) return null;
        return {
          ts: new Date(timestamp * 1000).toISOString(),
          open: round(open),
          high: round(high),
          low: round(low),
          close: round(close),
          volume: Math.round(volume),
        };
      })
      .filter((candle): candle is Candle => candle !== null)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    if (candles.length > 0) {
      return candles;
    }
  }

  throw new Error(`Yahoo Finance returned no usable daily quotes for ${stock.code}.`);
}

async function fetchYahooIntradayCandles(stock: Stock): Promise<Candle[]> {
  for (const symbol of yahooSymbolCandidates(stock.code)) {
    const params = new URLSearchParams({
      range: "5d",
      interval: "15m",
      includePrePost: "false",
      events: "history",
    });
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      continue;
    }

    const result = body.chart?.result?.[0] as YahooChartResult | undefined;
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp?.length || !quote) {
      continue;
    }

    const candles = result.timestamp
      .map((timestamp, index) => {
        const open = numberOrNull(quote.open?.[index]);
        const high = numberOrNull(quote.high?.[index]);
        const low = numberOrNull(quote.low?.[index]);
        const close = numberOrNull(quote.close?.[index]);
        const volume = numberOrNull(quote.volume?.[index]);
        if (open === null || high === null || low === null || close === null || volume === null) return null;
        return {
          ts: new Date(timestamp * 1000).toISOString(),
          open: round(open),
          high: round(high),
          low: round(low),
          close: round(close),
          volume: Math.round(volume),
        };
      })
      .filter((candle): candle is Candle => candle !== null)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    if (candles.length > 0) {
      return candles;
    }
  }

  return [];
}

async function fetchYahooLatestQuote(stock: Stock): Promise<LatestQuote | null> {
  for (const symbol of yahooSymbolCandidates(stock.code)) {
    const params = new URLSearchParams({
      range: "1d",
      interval: "1m",
    });
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) continue;

    const result = body.chart?.result?.[0] as YahooChartResult | undefined;
    const quote = result?.indicators?.quote?.[0];
    const metaPrice = numberOrNull(result?.meta?.regularMarketPrice);
    const previousClose = numberOrNull(result?.meta?.chartPreviousClose) ?? numberOrNull(result?.meta?.previousClose);
    const metaTime = numberOrNull(result?.meta?.regularMarketTime);
    if (metaPrice !== null) {
      return {
        price: round(metaPrice),
        previousClose,
        ts: new Date((metaTime ?? Date.now() / 1000) * 1000).toISOString(),
      };
    }

    const timestamps = result?.timestamp ?? [];
    const closes = quote?.close ?? [];
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const price = numberOrNull(closes[index]);
      const timestamp = numberOrNull(timestamps[index]);
      if (price !== null && timestamp !== null) {
        return {
          price: round(price),
          previousClose,
          ts: new Date(timestamp * 1000).toISOString(),
        };
      }
    }
  }

  return null;
}

async function getMarketCandles(stock: Stock, idToken: string | null) {
  if (MARKET_DATA_PROVIDER === "sample") {
    return sampleCandles(stock);
  }
  if (MARKET_DATA_PROVIDER === "yahoo") {
    return fetchYahooCandles(stock);
  }
  if (MARKET_DATA_PROVIDER !== "jquants") {
    throw new Error(`Unsupported MARKET_DATA_PROVIDER: ${MARKET_DATA_PROVIDER}`);
  }
  if (!idToken) {
    throw new Error("J-Quants ID token is missing.");
  }
  return fetchJQuantsCandles(stock, idToken);
}

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function ema(values: number[], period: number) {
  if (values.length < period) return null;
  const multiplier = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const value of values.slice(period)) {
    current = (value - current) * multiplier + current;
  }
  return current;
}

function rsi(values: number[], period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  const recent = values.slice(-period - 1);
  for (let i = 1; i < recent.length; i += 1) {
    const diff = recent[i] - recent[i - 1];
    gains += Math.max(diff, 0);
    losses += Math.abs(Math.min(diff, 0));
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

function macd(values: number[]) {
  if (values.length < 35) return { macd: null, signal: null };
  const series: number[] = [];
  for (let end = 26; end <= values.length; end += 1) {
    const subset = values.slice(0, end);
    const ema12 = ema(subset, 12);
    const ema26 = ema(subset, 26);
    if (ema12 !== null && ema26 !== null) series.push(ema12 - ema26);
  }
  return { macd: series.at(-1) ?? null, signal: ema(series, 9) };
}

function bollinger(values: number[], period = 20) {
  const middle = sma(values, period);
  if (middle === null) return { upper: null, middle: null, lower: null };
  const recent = values.slice(-period);
  const variance = recent.reduce((sum, value) => sum + (value - middle) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: middle + 2 * sd, middle, lower: middle - 2 * sd };
}

function vwap(candles: Candle[]) {
  let pv = 0;
  let volume = 0;
  for (const candle of candles) {
    pv += ((candle.high + candle.low + candle.close) / 3) * candle.volume;
    volume += candle.volume;
  }
  return volume === 0 ? null : pv / volume;
}

function calculate(candles: Candle[], options?: { intraday?: boolean }): Indicators {
  const strategy = STRATEGY_CONFIG.dailyBacktest;
  const intraday = options?.intraday ?? false;
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const latestClose = closes.at(-1) ?? null;
  const previousClose = closes.at(-2) ?? null;
  const latestVolume = volumes.at(-1) ?? null;
  const volumeAvg = volumes.length > strategy.volumeLookback
    ? volumes.slice(-strategy.volumeLookback - 1, -1).reduce((sum, value) => sum + value, 0) / strategy.volumeLookback
    : null;
  const bb = bollinger(closes);
  const macdValue = macd(closes);
  const maLongPeriod = intraday ? Math.max(strategy.maBase * 3, 45) : Math.max(strategy.maBase * 3, 75);
  const recentHigh = closes.length > strategy.breakoutLookback
    ? Math.max(...closes.slice(-strategy.breakoutLookback - 1, -1))
    : null;
  const recentLow = closes.length >= strategy.breakoutLookback
    ? Math.min(...closes.slice(-strategy.breakoutLookback))
    : null;
  return {
    latest_close: latestClose,
    previous_close: previousClose,
    price_change_pct: latestClose !== null && previousClose ? ((latestClose - previousClose) / previousClose) * 100 : null,
    ma5: sma(closes, strategy.maShort),
    ma25: sma(closes, strategy.maBase),
    ma75: sma(closes, maLongPeriod),
    rsi14: rsi(closes),
    macd: macdValue.macd,
    macd_signal: macdValue.signal,
    bb_upper: bb.upper,
    bb_middle: bb.middle,
    bb_lower: bb.lower,
    vwap: vwap(candles.slice(-20)),
    volume_ratio: latestVolume !== null && volumeAvg ? latestVolume / volumeAvg : null,
    liquidity_value: latestClose !== null && latestVolume !== null ? latestClose * latestVolume : null,
    recent_high: recentHigh,
    recent_low: recentLow,
    analysis_timeframe: intraday ? "15m" : "1d",
    strategy_ma_short_period: strategy.maShort,
    strategy_ma_base_period: strategy.maBase,
    strategy_breakout_lookback: strategy.breakoutLookback,
    strategy_breakout_buffer: strategy.breakoutBuffer,
    strategy_volume_threshold: strategy.volumeThreshold,
  };
}

function applyLatestQuote(indicators: Indicators, latestQuote: LatestQuote | null) {
  if (!latestQuote) return indicators;
  const previousClose = latestQuote.previousClose ?? numberOrNull(indicators.previous_close);
  return {
    ...indicators,
    latest_close: latestQuote.price,
    previous_close: previousClose,
    price_change_pct: previousClose ? ((latestQuote.price - previousClose) / previousClose) * 100 : indicators.price_change_pct,
  };
}

function strength(score: number) {
  if (score >= 80) return "強";
  if (score >= 60) return "中";
  return "弱";
}

function generateSignal(stock: Stock, indicators: Indicators) {
  const strategy = STRATEGY_CONFIG.dailyBacktest;
  if (stock.watch_status === "stopped") {
    return {
      signal_type: "監視停止",
      score: 0,
      strength: "弱",
      risk_level: "低",
      reasons_json: ["監視状態が停止です。"],
      cautions_json: [],
      beginner_note: "監視停止中のため判定しません。",
      breakdown_json: {},
      should_notify: false,
    };
  }
  const close = indicators.latest_close;
  const maShort = indicators.ma5;
  const maBase = indicators.ma25;
  const rsi14 = indicators.rsi14;
  const vwapValue = indicators.vwap;
  const volumeRatio = indicators.volume_ratio;
  const recentHigh = indicators.recent_high;
  if ([close, maShort, maBase, rsi14, vwapValue, volumeRatio, recentHigh].some((value) => typeof value !== "number")) {
    return {
      signal_type: "データ不足",
      score: 0,
      strength: "弱",
      risk_level: "中",
      reasons_json: ["必要なローソク足データが不足しています。"],
      cautions_json: ["価格データを追加取得してください。"],
      beginner_note: "一定期間の価格データが必要です。",
      breakdown_json: {},
      should_notify: false,
    };
  }
  let technical = 0;
  let volume = 0;
  let demand = 0;
  let safety = 0;
  const reasons: string[] = [];
  const cautions: string[] = [];
  const latestClose = close as number;
  const previousClose = numberOrNull(indicators.previous_close) ?? latestClose;
  const maLong = numberOrNull(indicators.ma75);
  const macdValue = numberOrNull(indicators.macd);
  const macdSignal = numberOrNull(indicators.macd_signal);
  const liquidityValue = numberOrNull(indicators.liquidity_value) ?? 0;
  const analysisTimeframe = String(indicators.analysis_timeframe ?? "1d");
  const isIntraday = analysisTimeframe === "15m";
  const learnedEntry = {
    aboveShortMa: latestClose > (maShort as number),
    shortAboveBase: (maShort as number) > (maBase as number),
    breakout: latestClose >= (recentHigh as number) * strategy.breakoutBuffer,
    volumeConfirmed: (volumeRatio as number) >= strategy.volumeThreshold,
  };
  if (learnedEntry.aboveShortMa) {
    technical += 15;
    reasons.push(`現在値が学習済み短期MA(${strategy.maShort}本)を上回っています。`);
  }
  if (learnedEntry.shortAboveBase) {
    technical += 20;
    reasons.push(`学習済み短期MA(${strategy.maShort}本)が基準MA(${strategy.maBase}本)を上回っています。`);
  }
  if (learnedEntry.breakout) {
    demand += 25;
    reasons.push(`学習済み条件の${strategy.breakoutLookback}本高値ブレイク圏です。`);
  }
  if (learnedEntry.volumeConfirmed) {
    volume += 15;
    reasons.push(`出来高が学習済み閾値の${strategy.volumeThreshold}倍以上です。`);
  }
  if (latestClose > (vwapValue as number)) {
    technical += isIntraday ? 8 : 6;
    reasons.push(isIntraday ? "現在値がVWAPを上回り、場中の買い優勢です。" : "株価がVWAPを上回っています。");
  }
  if (maLong !== null && maLong > 0 && (maBase as number) > maLong) {
    technical += isIntraday ? 6 : 4;
    reasons.push(isIntraday ? "基準線も上位線を上回り、トレンドの傾きが維持されています。" : "中期の移動平均線も上向きです。");
  }
  if (previousClose < latestClose) {
    technical += isIntraday ? 5 : 3;
    reasons.push(isIntraday ? "直近15分足で上昇しています。" : "前日比で上昇しています。");
  }
  if (macdValue !== null && macdSignal !== null && macdValue > macdSignal) {
    technical += isIntraday ? 5 : 3;
    reasons.push(isIntraday ? "MACDが上向きで短期モメンタムが優勢です。" : "MACDがシグナルを上回っています。");
  }
  if (!learnedEntry.volumeConfirmed && (volumeRatio as number) >= strategy.volumeThreshold * 0.9) {
    volume += 6;
    reasons.push("出来高は学習済み閾値に近づいています。");
  }
  if (liquidityValue >= (isIntraday ? 20_000_000 : 50_000_000)) {
    volume += 5;
    reasons.push(isIntraday ? "15分足ベースでも売買代金が十分あります。" : "売買代金が一定以上あり、流動性があります。");
  } else {
    safety -= 10;
    cautions.push("売買代金が少なく、流動性リスクがあります。");
  }
  if ((rsi14 as number) >= (isIntraday ? 78 : 80)) {
    safety -= 16;
    cautions.push(isIntraday ? "RSIが高く、短期の飛び乗りに注意です。" : "RSIが高く、短期過熱感があります。");
  } else if ((rsi14 as number) >= (isIntraday ? 68 : 70)) {
    safety -= 8;
    cautions.push(isIntraday ? "RSIがやや高めで押し目待ちが必要です。" : "RSIがやや高めです。");
  } else if ((rsi14 as number) >= (isIntraday ? 52 : 45) && (rsi14 as number) <= (isIntraday ? 72 : 65)) {
    technical += isIntraday ? 7 : 5;
    reasons.push(isIntraday ? "RSIが短期ブレイク狙いに使いやすい帯です。" : "RSIは過熱しすぎていない範囲です。");
  }

  let score = Math.max(0, Math.min(100, technical + volume + demand + safety));
  const learnedEntryMatched =
    learnedEntry.aboveShortMa &&
    learnedEntry.shortAboveBase &&
    learnedEntry.breakout &&
    learnedEntry.volumeConfirmed;
  let signalType = learnedEntryMatched && score >= 70 ? "買い候補" : "見送り";
  if (signalType === "買い候補" && (rsi14 as number) >= (isIntraday ? 74 : 75)) signalType = "過熱";
  const risk = cautions.length >= 2 || (volumeRatio as number) >= 4 ? "高" : cautions.length >= 1 ? "中" : "低";
  const shouldNotify = ["損切り候補", "撤退検討"].includes(signalType) || (["買い候補", "利確売り候補"].includes(signalType) && score >= 80);
  return {
    signal_type: signalType,
    score: Math.floor(score),
    strength: strength(score),
    risk_level: risk,
    entry_price_low: ["買い候補", "過熱"].includes(signalType) ? round(latestClose * 0.995) : null,
    entry_price_high: ["買い候補", "過熱"].includes(signalType) ? round(latestClose * 1.01) : null,
    take_profit_1: ["買い候補", "利確売り候補", "過熱"].includes(signalType) ? round(latestClose * (1 + strategy.takeProfitPct)) : null,
    take_profit_2: ["買い候補", "利確売り候補", "過熱"].includes(signalType) ? round(latestClose * (1 + strategy.takeProfitPct * 1.5)) : null,
    stop_loss: signalType !== "見送り" ? round(latestClose * (1 - strategy.stopLossPct)) : null,
    reasons_json: reasons.length ? reasons : ["明確な優位性は限定的です。"],
    cautions_json: cautions,
    beginner_note: isIntraday
      ? "15分足を、過去データ研究で採用されたMA、ブレイクアウト、出来高条件に当てはめた点数です。"
      : "過去データ研究で採用されたMA、ブレイクアウト、出来高条件に当てはめた点数です。",
    breakdown_json: {
      technical: Math.min(40, technical),
      volume_liquidity: Math.min(25, volume),
      demand_proxy: Math.min(25, demand),
      news: 0,
      safety_adjustment: safety,
      learned_entry: learnedEntry,
      strategy_config: strategy,
      raw: indicators,
    },
    should_notify: shouldNotify,
  };
}

async function sendLine(message: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_TO_USER_ID) {
    return { status: "skipped", error: "LINE secrets are missing." };
  }
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to: LINE_TO_USER_ID, messages: [{ type: "text", text: message }] }),
  });
  if (!response.ok) return { status: "error", error: await response.text() };
  return { status: "sent", error: null };
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${round(value)}%`;
}

function buildSummaryMessages(rows: SummaryRow[]) {
  const now = new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const chunks: SummaryRow[][] = [];
  for (let index = 0; index < sorted.length; index += 12) {
    chunks.push(sorted.slice(index, index + 12));
  }
  return chunks.map((chunk, index) => {
    const body = chunk
      .map((row, rowIndex) => {
        const rank = index * 12 + rowIndex + 1;
        const price = row.price === null ? "-" : `${round(row.price)}円`;
        return `${rank}. ${row.code} ${row.name}\n${row.signalType} / ${row.score}点 / ${row.strength} / リスク:${row.riskLevel}\n価格:${price} 前日比:${formatPercent(row.changePct)}`;
      })
      .join("\n\n");
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return `【日本株AIシグナルbot 定期サマリー${suffix}】\n${now}\n登録銘柄: ${rows.length}件\n\n${body}`;
  });
}

async function sendSummaryNotifications(rows: SummaryRow[]) {
  if (rows.length === 0) return { sent: 0, status: "skipped", error: "No stocks processed." };
  let sent = 0;
  let lastStatus = "skipped";
  let lastError: string | null = null;
  for (const message of buildSummaryMessages(rows)) {
    const result = await sendLine(message);
    lastStatus = result.status;
    lastError = result.error;
    if (result.status === "sent") sent += 1;
  }
  return { sent, status: lastStatus, error: lastError };
}

async function shouldSkipNotification(stockId: number, signature: string) {
  const existing = await supabase(`notification_state?stock_id=eq.${stockId}&select=signature`) as Array<{ signature: string }>;
  return existing[0]?.signature === signature;
}

async function saveNotificationSignature(stockId: number, signature: string) {
  await supabase("notification_state?on_conflict=stock_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{ stock_id: stockId, signature, updated_at: new Date().toISOString() }]),
  });
}

async function ensureVirtualBot(userId: string) {
  const existing = await supabase(`virtual_bots?user_id=eq.${userId}&select=*`) as VirtualBot[];
  if (existing[0]) return existing[0];

  const created = await supabase("virtual_bots", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{
      user_id: userId,
      name: "仮想bot",
      status: "active",
      initial_cash: VIRTUAL_BOT_INITIAL_CASH,
      cash_balance: VIRTUAL_BOT_INITIAL_CASH,
      latest_equity: VIRTUAL_BOT_INITIAL_CASH,
      realized_pnl: 0,
    }]),
  }) as VirtualBot[];
  return created[0];
}

async function loadVirtualPositions(botId: number) {
  return await supabase(`virtual_positions?bot_id=eq.${botId}&select=*`) as VirtualPosition[];
}

async function loadCodexCandidates(userId: string) {
  const since = encodeURIComponent(new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString());
  const runs = await supabase(
    `analysis_loop_runs?user_id=eq.${userId}&status=eq.completed&completed_at=gte.${since}&select=id,completed_iterations,completed_at&order=completed_at.desc&limit=1`,
  ) as CodexLoopRun[];
  const run = runs[0];
  if (!run) return new Map<string, CodexCandidate>();
  const candidates = await supabase(
    `analysis_loop_candidates?run_id=eq.${run.id}&iteration=eq.${run.completed_iterations}&verdict=eq.${encodeURIComponent("候補")}&score=gte.70&select=code,score,verdict,estimated_order_price`,
  ) as CodexCandidate[];
  return new Map(candidates.map((candidate) => [candidate.code, candidate]));
}

async function recordVirtualTrade(params: {
  botId: number;
  stockId: number;
  signalId: number | null;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  realizedPnl?: number;
  reason: string;
}) {
  const grossAmount = round(params.quantity * params.price);
  await supabase("virtual_trades", {
    method: "POST",
    body: JSON.stringify([{
      bot_id: params.botId,
      stock_id: params.stockId,
      signal_id: params.signalId,
      side: params.side,
      quantity: params.quantity,
      price: round(params.price),
      gross_amount: grossAmount,
      realized_pnl: round(params.realizedPnl ?? 0),
      reason: params.reason,
      executed_at: new Date().toISOString(),
    }]),
  });
}

async function runVirtualPortfolioBot(analyses: VirtualAnalysisRow[]) {
  const byUser = new Map<string, VirtualAnalysisRow[]>();
  for (const row of analyses) {
    const rows = byUser.get(row.stock.user_id) ?? [];
    rows.push(row);
    byUser.set(row.stock.user_id, rows);
  }

  for (const [userId, rows] of byUser) {
    const bot = await ensureVirtualBot(userId);
    const positions = await loadVirtualPositions(bot.id);
    const codexCandidates = await loadCodexCandidates(userId);
    const positionMap = new Map(positions.map((position) => [position.stock_id, position]));
    const priceMap = new Map(rows.map((row) => [row.stock.id, row.price]));

    let cash = toNumber(bot.cash_balance);
    let realizedPnl = toNumber(bot.realized_pnl);

    for (const position of positions) {
      const analysis = rows.find((row) => row.stock.id === position.stock_id);
      const latestPrice = priceMap.get(position.stock_id) ?? toNumber(position.last_price);
      if (!analysis || latestPrice <= 0) continue;

      const quantity = position.quantity;
      const avgCost = toNumber(position.avg_cost);
      const reachedTakeProfit = latestPrice >= avgCost * (1 + STRATEGY_CONFIG.takeProfitPct);
      const reachedStopLoss = latestPrice <= avgCost * (1 - STRATEGY_CONFIG.stopLossPct);
      if (!reachedTakeProfit && !reachedStopLoss) continue;

      const proceeds = round(quantity * latestPrice);
      const tradeRealizedPnl = round((latestPrice - avgCost) * quantity);
      cash = round(cash + proceeds);
      realizedPnl = round(realizedPnl + tradeRealizedPnl);

      await recordVirtualTrade({
        botId: bot.id,
        stockId: position.stock_id,
        signalId: analysis.signalId,
        side: "sell",
        quantity,
        price: latestPrice,
        realizedPnl: tradeRealizedPnl,
        reason: reachedTakeProfit ? "Codex候補の利確条件到達" : "Codex候補の損切り条件到達",
      });
      await supabase(`virtual_positions?id=eq.${position.id}`, { method: "DELETE" });
      positionMap.delete(position.stock_id);
    }

    const remainingPositionCount = positionMap.size;
    const equityBeforeBuys = round(cash + [...positionMap.values()].reduce((sum, position) => {
      const latestPrice = priceMap.get(position.stock_id) ?? toNumber(position.last_price);
      return sum + latestPrice * position.quantity;
    }, 0));

    const candidates = rows
      .filter((row) => codexCandidates.has(row.stock.code) && !positionMap.has(row.stock.id) && (row.price ?? 0) > 0)
      .sort((a, b) => (codexCandidates.get(b.stock.code)?.score ?? 0) - (codexCandidates.get(a.stock.code)?.score ?? 0))
      .slice(0, Math.max(0, VIRTUAL_BOT_MAX_POSITIONS - remainingPositionCount));

    for (const candidate of candidates) {
      if (positionMap.size >= VIRTUAL_BOT_MAX_POSITIONS) break;
      const codexCandidate = codexCandidates.get(candidate.stock.code);
      const price = Math.max(candidate.price ?? 0, toNumber(codexCandidate?.estimated_order_price ?? 0));
      if (price <= 0) continue;

      const desiredAmount = Math.min(cash, Math.max(VIRTUAL_BOT_MIN_TRADE_AMOUNT, equityBeforeBuys * VIRTUAL_BOT_POSITION_RATIO));
      const quantity = Math.floor(desiredAmount / price);
      if (quantity <= 0) continue;

      const grossAmount = round(quantity * price);
      if (grossAmount > cash || grossAmount < VIRTUAL_BOT_MIN_TRADE_AMOUNT) continue;

      cash = round(cash - grossAmount);
      const created = await supabase("virtual_positions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{
          bot_id: bot.id,
          stock_id: candidate.stock.id,
          quantity,
          avg_cost: round(price),
          last_price: round(price),
          market_value: grossAmount,
          unrealized_pnl: 0,
          opened_at: new Date().toISOString(),
        }]),
      }) as VirtualPosition[];
      if (created[0]) {
        positionMap.set(candidate.stock.id, created[0]);
      }
      await recordVirtualTrade({
        botId: bot.id,
        stockId: candidate.stock.id,
        signalId: candidate.signalId,
        side: "buy",
        quantity,
        price,
        reason: `Codex調査候補: ${codexCandidate?.score ?? 0}点 / S株想定価格`,
      });
    }

    let unrealizedPnl = 0;
    let marketValue = 0;
    for (const position of positionMap.values()) {
      const latestPrice = priceMap.get(position.stock_id) ?? toNumber(position.last_price);
      const avgCost = toNumber(position.avg_cost);
      const currentMarketValue = round(position.quantity * latestPrice);
      const currentUnrealizedPnl = round((latestPrice - avgCost) * position.quantity);
      marketValue = round(marketValue + currentMarketValue);
      unrealizedPnl = round(unrealizedPnl + currentUnrealizedPnl);

      await supabase(`virtual_positions?id=eq.${position.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          last_price: round(latestPrice),
          market_value: currentMarketValue,
          unrealized_pnl: currentUnrealizedPnl,
        }),
      });
    }

    await supabase(`virtual_bots?id=eq.${bot.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        cash_balance: round(cash),
        realized_pnl: round(realizedPnl),
        latest_equity: round(cash + marketValue),
        latest_valuation_at: new Date().toISOString(),
      }),
    });
  }
}

Deno.serve(async (request) => {
  try {
    if (!RUN_SIGNAL_BOT_SECRET) {
      return new Response(JSON.stringify({ error: "RUN_SIGNAL_BOT_SECRET is not configured." }), { status: 500 });
    }
    if (RUN_SIGNAL_BOT_SECRET && request.headers.get("x-bot-secret") !== RUN_SIGNAL_BOT_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const requestBody = await request.json().catch(() => ({})) as BotRequest;
    const notifySummary = requestBody.notify_summary !== false;
    const stocks = await supabase("stocks?select=*&watch_status=neq.stopped&order=code.asc") as Stock[];
    const idToken = MARKET_DATA_PROVIDER === "jquants" ? await getJQuantsIdToken() : null;
    let notificationCount = 0;
    const summaryRows: SummaryRow[] = [];
    const virtualAnalyses: VirtualAnalysisRow[] = [];
    for (const stock of stocks) {
      const candles = await getMarketCandles(stock, idToken);
      const intradayCandles = MARKET_DATA_PROVIDER === "yahoo" ? await fetchYahooIntradayCandles(stock) : [];
      const latestQuote = MARKET_DATA_PROVIDER === "yahoo" ? await fetchYahooLatestQuote(stock) : null;
      await supabase("price_candles?on_conflict=stock_id,timeframe,ts", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(candles.map((candle) => ({ ...candle, stock_id: stock.id, timeframe: "1d" }))),
      });
      if (intradayCandles.length > 0) {
        await supabase("price_candles?on_conflict=stock_id,timeframe,ts", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates" },
          body: JSON.stringify(intradayCandles.map((candle) => ({ ...candle, stock_id: stock.id, timeframe: "15m" }))),
        });
      }
      const analysisCandles = intradayCandles.length >= 80 ? intradayCandles : candles;
      const indicators = applyLatestQuote(calculate(analysisCandles, { intraday: intradayCandles.length >= 80 }), latestQuote);
      const indicatorRow = {
        stock_id: stock.id,
        latest_close: indicators.latest_close,
        previous_close: indicators.previous_close,
        price_change_pct: indicators.price_change_pct,
        ma5: indicators.ma5,
        ma25: indicators.ma25,
        ma75: indicators.ma75,
        rsi14: indicators.rsi14,
        macd: indicators.macd,
        macd_signal: indicators.macd_signal,
        bb_upper: indicators.bb_upper,
        bb_middle: indicators.bb_middle,
        bb_lower: indicators.bb_lower,
        vwap: indicators.vwap,
        volume_ratio: indicators.volume_ratio,
        liquidity_value: indicators.liquidity_value,
        raw_json: {
          ...indicators,
          market_data_provider: MARKET_DATA_PROVIDER,
          latest_candle_at: analysisCandles.at(-1)?.ts ?? null,
          latest_quote_at: latestQuote?.ts ?? null,
        },
        calculated_at: new Date().toISOString(),
      };
      await supabase("technical_indicators?on_conflict=stock_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([indicatorRow]),
      });
      const signal = generateSignal(stock, indicators);
      summaryRows.push({
        stockId: stock.id,
        code: stock.code,
        name: stock.name,
        price: numberOrNull(indicators.latest_close),
        changePct: numberOrNull(indicators.price_change_pct),
        score: signal.score,
        signalType: signal.signal_type,
        strength: signal.strength,
        riskLevel: signal.risk_level,
      });
      const inserted = await supabase("signals", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{ stock_id: stock.id, ...signal }]),
      }) as Array<{ id: number }>;
      virtualAnalyses.push({
        stock,
        signalId: inserted[0]?.id ?? null,
        signalType: signal.signal_type,
        score: signal.score,
        price: numberOrNull(indicators.latest_close),
      });
      await supabase(`stocks?id=eq.${stock.id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_signal: signal.signal_type, last_data_at: latestQuote?.ts ?? new Date().toISOString() }),
      });
      if (signal.should_notify) {
        const message = `【${signal.signal_type}】${stock.code} ${stock.name}\nスコア：${signal.score}点 / ${signal.strength}\nリスク：${signal.risk_level}\n\n根拠：\n${signal.reasons_json.slice(0, 3).join("\n")}`;
        const signature = `${stock.code}|${signal.signal_type}|${signal.score}|${signal.risk_level}`;
        const result = (await shouldSkipNotification(stock.id, signature))
          ? { status: "skipped", error: "Same signal was already notified." }
          : await sendLine(message);
        await supabase("notification_history", {
          method: "POST",
          body: JSON.stringify([{ signal_id: inserted[0]?.id, stock_id: stock.id, status: result.status, message, error: result.error }]),
        });
        if (result.status === "sent") {
          await saveNotificationSignature(stock.id, signature);
          notificationCount += 1;
        }
      }
    }
    await runVirtualPortfolioBot(virtualAnalyses);
    if (notifySummary && summaryRows[0]) {
      const summaryResult = await sendSummaryNotifications(summaryRows);
      notificationCount += summaryResult.sent;
      await supabase("notification_history", {
        method: "POST",
        body: JSON.stringify([{
          stock_id: summaryRows[0].stockId,
          status: summaryResult.status,
          message: `定期サマリー: ${summaryRows.length}件`,
          error: summaryResult.error,
        }]),
      });
    }
    await supabase("bot_runs", {
      method: "POST",
      body: JSON.stringify([{ status: "success", processed_count: stocks.length, notification_count: notificationCount }]),
    });
    return new Response(JSON.stringify({ ok: true, processed: stocks.length, notifications: notificationCount }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await supabase("bot_runs", {
      method: "POST",
      body: JSON.stringify([{ status: "error", error: String(error) }]),
    }).catch(() => null);
    return new Response(JSON.stringify({ error: String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
