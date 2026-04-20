import { STOCK_MASTER } from "@/lib/stock-master";

type Candle = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StrongBuyCandidate = {
  code: string;
  name: string;
  tags: string;
  score: number;
  latestClose: number;
  priceChangePct: number;
  volumeRatio: number;
  latestDate: string;
  reasons: string[];
};

type YahooChartResult = {
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

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function sma(values: number[], period: number) {
  if (values.length < period) return null;
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
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

function yahooSymbol(code: string) {
  const normalized = code.trim().toUpperCase();
  if (/^\d{5}$/.test(normalized) && normalized.endsWith("0")) return `${normalized.slice(0, 4)}.T`;
  if (/^\d{4}$/.test(normalized)) return `${normalized}.T`;
  return normalized.includes(".") ? normalized : `${normalized}.T`;
}

async function fetchYahooCandles(code: string): Promise<Candle[]> {
  const params = new URLSearchParams({ range: "1y", interval: "1d", events: "history" });
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(code))}?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
    next: { revalidate: 900 },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) return [];

  const result = body.chart?.result?.[0] as YahooChartResult | undefined;
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp?.length || !quote) return [];

  return result.timestamp
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
}

function scoreCandles(stock: (typeof STOCK_MASTER)[number], candles: Candle[]): StrongBuyCandidate | null {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  if (!latest || !previous || closes.length < 80) return null;

  const ma5 = sma(closes, 5);
  const ma25 = sma(closes, 25);
  const ma75 = sma(closes, 75);
  const rsi14 = rsi(closes);
  const volumeAvg20 = volumes.slice(-21, -1).reduce((sum, value) => sum + value, 0) / 20;
  const volumeRatio = volumeAvg20 > 0 ? latest.volume / volumeAvg20 : 0;
  const recentHigh = Math.max(...closes.slice(-20));
  const liquidityValue = latest.close * latest.volume;
  if (ma5 === null || ma25 === null || ma75 === null || rsi14 === null) return null;

  let score = 0;
  const reasons: string[] = [];
  if (latest.close > ma5) {
    score += 10;
    reasons.push("終値が5日線を上回っています。");
  }
  if (ma5 > ma25) {
    score += 15;
    reasons.push("5日線が25日線を上回っています。");
  }
  if (ma25 > ma75) {
    score += 14;
    reasons.push("25日線が75日線を上回っています。");
  }
  if (latest.close > previous.close) {
    score += 8;
    reasons.push("前日比で上昇しています。");
  }
  if (recentHigh <= latest.close * 1.01) {
    score += 16;
    reasons.push("直近高値圏です。");
  }
  if (volumeRatio >= 2) {
    score += 18;
    reasons.push("出来高が20日平均の2倍以上です。");
  } else if (volumeRatio >= 1.3) {
    score += 10;
    reasons.push("出来高が増加傾向です。");
  }
  if (liquidityValue >= 50_000_000) {
    score += 10;
    reasons.push("売買代金が一定以上あります。");
  }
  if (rsi14 >= 80) {
    score -= 20;
    reasons.push("RSIが高く、過熱に注意です。");
  } else if (rsi14 >= 45 && rsi14 <= 70) {
    score += 9;
    reasons.push("RSIが買い候補として扱いやすい範囲です。");
  }

  const finalScore = Math.max(0, Math.min(100, Math.floor(score)));

  return {
    code: stock.code,
    name: stock.name,
    tags: stock.tags,
    score: finalScore,
    latestClose: latest.close,
    priceChangePct: ((latest.close - previous.close) / previous.close) * 100,
    volumeRatio,
    latestDate: latest.ts.slice(0, 10),
    reasons: reasons.slice(0, 4),
  };
}

export async function scanStrongBuyCandidates() {
  const settled = await Promise.allSettled(
    STOCK_MASTER.map(async (stock) => {
      const candles = await fetchYahooCandles(stock.code);
      return scoreCandles(stock, candles);
    }),
  );

  return settled
    .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
