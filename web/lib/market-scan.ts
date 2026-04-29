import { STOCK_MASTER } from "@/lib/stock-master";

export const MAX_STRONG_BUY_CANDIDATES = 20;

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
  signalType: string;
  strength: string;
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
  const params = new URLSearchParams({ range: "5d", interval: "15m", includePrePost: "false", events: "history" });
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
  const ma25 = sma(closes, 20);
  const ma75 = sma(closes, 60);
  const rsi14 = rsi(closes);
  const volumeAvg20 = volumes.slice(-21, -1).reduce((sum, value) => sum + value, 0) / 20;
  const volumeRatio = volumeAvg20 > 0 ? latest.volume / volumeAvg20 : 0;
  const recentHigh = Math.max(...closes.slice(-16));
  const liquidityValue = latest.close * latest.volume;
  if (ma5 === null || ma25 === null || ma75 === null || rsi14 === null) return null;

  let technical = 0;
  let volume = 0;
  let demand = 0;
  let safety = 0;
  const reasons: string[] = [];
  if (latest.close > ma5) {
    technical += 10;
    reasons.push("直近15分足の価格が短期線を上回っています。");
  }
  if (ma5 > ma25) {
    technical += 15;
    reasons.push("短期線が基準線を上回っています。");
  }
  if (ma25 > ma75) {
    technical += 14;
    reasons.push("基準線が上位線を上回り、短期上昇トレンドです。");
  }
  if (latest.close > previous.close) {
    technical += 8;
    reasons.push("直近15分足で上昇しています。");
  }
  if (recentHigh <= latest.close * 1.01) {
    technical += 16;
    reasons.push("直近4時間の高値圏です。");
  }
  if (volumeRatio >= 1.8) {
    volume += 18;
    demand += 6;
    reasons.push("出来高が直近15分足平均の1.8倍以上です。");
  } else if (volumeRatio >= 1.15) {
    volume += 10;
    demand += 3;
    reasons.push("出来高が短期的に増加しています。");
  }
  if (liquidityValue >= 20_000_000) {
    volume += 10;
    reasons.push("15分足ベースでも売買代金があります。");
  } else {
    safety -= 6;
  }
  if (rsi14 >= 78) {
    safety -= 20;
    reasons.push("RSIが高く、飛び乗りに注意です。");
  } else if (rsi14 >= 72) {
    safety -= 8;
    reasons.push("RSIがやや高めです。");
  } else if (rsi14 >= 52 && rsi14 <= 72) {
    technical += 9;
    reasons.push("RSIがデイトレ向きの帯にあります。");
  }

  const finalScore = Math.max(0, Math.min(100, Math.floor(technical + volume + demand + safety)));
  const trendOk = latest.close > ma25 && ma5 > ma25;
  let signalType = "見送り";
  if (finalScore >= 66 && rsi14 < 76) {
    signalType = "買い候補";
  } else if (finalScore >= 58 && trendOk && rsi14 < 78) {
    signalType = "監視候補";
  } else if (finalScore >= 66) {
    signalType = "過熱";
  }
  if (!["買い候補", "監視候補"].includes(signalType)) return null;

  return {
    code: stock.code,
    name: stock.name,
    tags: stock.tags,
    score: finalScore,
    signalType,
    strength: finalScore >= 80 ? "強" : finalScore >= 60 ? "中" : "弱",
    latestClose: latest.close,
    priceChangePct: ((latest.close - previous.close) / previous.close) * 100,
    volumeRatio,
    latestDate: latest.ts,
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
    .sort((a, b) => {
      const priority = (signalType: string) => (signalType === "買い候補" ? 0 : 1);
      return priority(a.signalType) - priority(b.signalType) || b.score - a.score;
    })
    .slice(0, MAX_STRONG_BUY_CANDIDATES);
}
