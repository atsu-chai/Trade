export type LiveQuote = {
  price: number;
  previousClose: number | null;
  changePct: number | null;
  fetchedAt: string;
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
      close?: Array<number | null>;
    }>;
  };
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function yahooSymbols(code: string) {
  const normalized = code.trim().toUpperCase();
  if (/^\d{5}$/.test(normalized) && normalized.endsWith("0")) return [`${normalized.slice(0, 4)}.T`, normalized];
  if (/^\d{4}$/.test(normalized)) return [`${normalized}.T`, normalized];
  return normalized.includes(".") ? [normalized] : [`${normalized}.T`, normalized];
}

export async function fetchLiveQuote(code: string): Promise<LiveQuote | null> {
  for (const symbol of yahooSymbols(code)) {
    const params = new URLSearchParams({ range: "1d", interval: "1m" });
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params}`, {
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) continue;

    const result = body.chart?.result?.[0] as YahooChartResult | undefined;
    const metaPrice = numberOrNull(result?.meta?.regularMarketPrice);
    const previousClose = numberOrNull(result?.meta?.chartPreviousClose) ?? numberOrNull(result?.meta?.previousClose);
    const metaTime = numberOrNull(result?.meta?.regularMarketTime);
    if (metaPrice !== null) {
      return {
        price: round(metaPrice),
        previousClose,
        changePct: previousClose ? ((metaPrice - previousClose) / previousClose) * 100 : null,
        fetchedAt: new Date((metaTime ?? Date.now() / 1000) * 1000).toISOString(),
      };
    }

    const timestamps = result?.timestamp ?? [];
    const closes = result?.indicators?.quote?.[0]?.close ?? [];
    for (let index = closes.length - 1; index >= 0; index -= 1) {
      const price = numberOrNull(closes[index]);
      const timestamp = numberOrNull(timestamps[index]);
      if (price !== null && timestamp !== null) {
        return {
          price: round(price),
          previousClose,
          changePct: previousClose ? ((price - previousClose) / previousClose) * 100 : null,
          fetchedAt: new Date(timestamp * 1000).toISOString(),
        };
      }
    }
  }

  return null;
}

export async function fetchLiveQuoteMap(codes: string[]) {
  const entries = await Promise.all(
    codes.map(async (code) => {
      const quote = await fetchLiveQuote(code);
      return [code, quote] as const;
    }),
  );
  return new Map(entries);
}
