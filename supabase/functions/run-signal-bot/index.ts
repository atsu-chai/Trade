type Stock = {
  id: number;
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

type Indicators = Record<string, number | null>;

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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") ?? "";
const LINE_TO_USER_ID = Deno.env.get("LINE_TO_USER_ID") ?? "";
const RUN_SIGNAL_BOT_SECRET = Deno.env.get("RUN_SIGNAL_BOT_SECRET") ?? "";
const MARKET_DATA_PROVIDER = Deno.env.get("MARKET_DATA_PROVIDER") ?? "jquants";
const JQUANTS_REFRESH_TOKEN = Deno.env.get("JQUANTS_REFRESH_TOKEN") ?? "";
const JQUANTS_EMAIL = Deno.env.get("JQUANTS_EMAIL") ?? "";
const JQUANTS_PASSWORD = Deno.env.get("JQUANTS_PASSWORD") ?? "";

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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function jquantsDate(date: string) {
  return `${date}T00:00:00+09:00`;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getJQuantsIdToken() {
  if (JQUANTS_REFRESH_TOKEN) {
    const response = await fetch(
      `https://api.jquants.com/v1/token/auth_refresh?refreshtoken=${encodeURIComponent(JQUANTS_REFRESH_TOKEN)}`,
      { method: "POST" },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.idToken) {
      throw new Error(`J-Quants auth_refresh failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return String(body.idToken);
  }

  if (JQUANTS_EMAIL && JQUANTS_PASSWORD) {
    const response = await fetch("https://api.jquants.com/v1/token/auth_user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailaddress: JQUANTS_EMAIL, password: JQUANTS_PASSWORD }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.idToken) {
      throw new Error(`J-Quants auth_user failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return String(body.idToken);
  }

  throw new Error("J-Quants credentials are missing. Set JQUANTS_REFRESH_TOKEN or JQUANTS_EMAIL/JQUANTS_PASSWORD.");
}

async function fetchJQuantsCandles(stock: Stock, idToken: string): Promise<Candle[]> {
  const to = new Date();
  const from = new Date(to.getTime() - 420 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    code: stock.code.trim(),
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
      throw new Error(`J-Quants daily_quotes failed for ${stock.code}: ${response.status} ${JSON.stringify(body)}`);
    }
    quotes.push(...((body.daily_quotes ?? []) as JQuantsQuote[]));
    paginationKey = String(body.pagination_key ?? "");
  } while (paginationKey);

  const candles = quotes
    .map((quote) => {
      const open = numberOrNull(quote.AdjustmentOpen) ?? numberOrNull(quote.Open);
      const high = numberOrNull(quote.AdjustmentHigh) ?? numberOrNull(quote.High);
      const low = numberOrNull(quote.AdjustmentLow) ?? numberOrNull(quote.Low);
      const close = numberOrNull(quote.AdjustmentClose) ?? numberOrNull(quote.Close);
      const volume = numberOrNull(quote.AdjustmentVolume) ?? numberOrNull(quote.Volume);
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

async function getMarketCandles(stock: Stock, idToken: string | null) {
  if (MARKET_DATA_PROVIDER === "sample") {
    return sampleCandles(stock);
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

function calculate(candles: Candle[]): Indicators {
  const closes = candles.map((candle) => candle.close);
  const volumes = candles.map((candle) => candle.volume);
  const latestClose = closes.at(-1) ?? null;
  const previousClose = closes.at(-2) ?? null;
  const latestVolume = volumes.at(-1) ?? null;
  const volumeAvg20 = volumes.length >= 21 ? volumes.slice(-21, -1).reduce((sum, value) => sum + value, 0) / 20 : null;
  const bb = bollinger(closes);
  const macdValue = macd(closes);
  return {
    latest_close: latestClose,
    previous_close: previousClose,
    price_change_pct: latestClose !== null && previousClose ? ((latestClose - previousClose) / previousClose) * 100 : null,
    ma5: sma(closes, 5),
    ma25: sma(closes, 25),
    ma75: sma(closes, 75),
    rsi14: rsi(closes),
    macd: macdValue.macd,
    macd_signal: macdValue.signal,
    bb_upper: bb.upper,
    bb_middle: bb.middle,
    bb_lower: bb.lower,
    vwap: vwap(candles.slice(-20)),
    volume_ratio: latestVolume !== null && volumeAvg20 ? latestVolume / volumeAvg20 : null,
    liquidity_value: latestClose !== null && latestVolume !== null ? latestClose * latestVolume : null,
    recent_high: closes.length >= 20 ? Math.max(...closes.slice(-20)) : null,
    recent_low: closes.length >= 20 ? Math.min(...closes.slice(-20)) : null,
  };
}

function strength(score: number) {
  if (score >= 80) return "強";
  if (score >= 60) return "中";
  return "弱";
}

function generateSignal(stock: Stock, indicators: Indicators) {
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
  const ma5 = indicators.ma5;
  const ma25 = indicators.ma25;
  const rsi14 = indicators.rsi14;
  const vwapValue = indicators.vwap;
  const volumeRatio = indicators.volume_ratio;
  if ([close, ma5, ma25, rsi14, vwapValue, volumeRatio].some((value) => value === null)) {
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
  if (latestClose > (vwapValue as number)) {
    technical += 8;
    reasons.push("株価がVWAPを上回っています。");
  }
  if ((ma5 as number) > (ma25 as number)) {
    technical += 8;
    reasons.push("5日移動平均線が25日移動平均線を上回っています。");
  }
  if ((indicators.ma75 ?? 0) > 0 && (ma25 as number) > (indicators.ma75 as number)) {
    technical += 6;
    reasons.push("中期の移動平均線も上向きです。");
  }
  if ((indicators.previous_close ?? latestClose) < latestClose) {
    technical += 5;
    reasons.push("前日比で上昇しています。");
  }
  if ((indicators.recent_high ?? Infinity) <= latestClose * 1.005) {
    technical += 8;
    reasons.push("直近高値圏まで上昇しています。");
  }
  if ((indicators.macd ?? 0) > (indicators.macd_signal ?? Infinity)) {
    technical += 5;
    reasons.push("MACDがシグナルを上回っています。");
  }
  if ((volumeRatio as number) >= 2) {
    volume += 15;
    demand += 6;
    reasons.push("出来高が直近平均の2倍以上です。");
  } else if ((volumeRatio as number) >= 1.3) {
    volume += 8;
    demand += 3;
    reasons.push("出来高が増加傾向です。");
  }
  if ((indicators.liquidity_value ?? 0) >= 50_000_000) {
    volume += 10;
    reasons.push("売買代金が一定以上あり、流動性があります。");
  } else {
    safety -= 10;
    cautions.push("売買代金が少なく、流動性リスクがあります。");
  }
  if ((rsi14 as number) >= 80) {
    safety -= 16;
    cautions.push("RSIが高く、短期過熱感があります。");
  } else if ((rsi14 as number) >= 70) {
    safety -= 8;
    cautions.push("RSIがやや高めです。");
  } else if ((rsi14 as number) >= 45 && (rsi14 as number) <= 65) {
    technical += 5;
    reasons.push("RSIは過熱しすぎていない範囲です。");
  }

  let score = Math.max(0, Math.min(100, technical + volume + demand + safety));
  let signalType = score >= 65 ? "買い候補" : "見送り";
  if (signalType === "買い候補" && (rsi14 as number) >= 75) signalType = "過熱";
  const risk = cautions.length >= 2 || (volumeRatio as number) >= 4 ? "高" : cautions.length >= 1 ? "中" : "低";
  const shouldNotify = ["損切り候補", "撤退検討"].includes(signalType) || (["買い候補", "利確売り候補"].includes(signalType) && score >= 80);
  return {
    signal_type: signalType,
    score: Math.floor(score),
    strength: strength(score),
    risk_level: risk,
    entry_price_low: ["買い候補", "過熱"].includes(signalType) ? round(latestClose * 0.995) : null,
    entry_price_high: ["買い候補", "過熱"].includes(signalType) ? round(latestClose * 1.01) : null,
    take_profit_1: ["買い候補", "利確売り候補", "過熱"].includes(signalType) ? round(latestClose * 1.03) : null,
    take_profit_2: ["買い候補", "利確売り候補", "過熱"].includes(signalType) ? round(latestClose * 1.06) : null,
    stop_loss: signalType !== "見送り" ? round(latestClose * 0.97) : null,
    reasons_json: reasons.length ? reasons : ["明確な優位性は限定的です。"],
    cautions_json: cautions,
    beginner_note: "点数はテクニカル、出来高、流動性、過熱リスクをルールで合算した目安です。断定ではなく確認材料として使ってください。",
    breakdown_json: {
      technical: Math.min(40, technical),
      volume_liquidity: Math.min(25, volume),
      demand_proxy: Math.min(15, demand),
      news: 0,
      safety_adjustment: safety,
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

Deno.serve(async (request) => {
  try {
    if (!RUN_SIGNAL_BOT_SECRET) {
      return new Response(JSON.stringify({ error: "RUN_SIGNAL_BOT_SECRET is not configured." }), { status: 500 });
    }
    if (RUN_SIGNAL_BOT_SECRET && request.headers.get("x-bot-secret") !== RUN_SIGNAL_BOT_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    }
    const stocks = await supabase("stocks?select=*&watch_status=neq.stopped&order=code.asc") as Stock[];
    const idToken = MARKET_DATA_PROVIDER === "jquants" ? await getJQuantsIdToken() : null;
    let notificationCount = 0;
    for (const stock of stocks) {
      const candles = await getMarketCandles(stock, idToken);
      await supabase("price_candles?on_conflict=stock_id,timeframe,ts", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(candles.map((candle) => ({ ...candle, stock_id: stock.id, timeframe: "1d" }))),
      });
      const indicators = calculate(candles);
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
        raw_json: { ...indicators, market_data_provider: MARKET_DATA_PROVIDER, latest_candle_at: candles.at(-1)?.ts ?? null },
        calculated_at: new Date().toISOString(),
      };
      await supabase("technical_indicators?on_conflict=stock_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify([indicatorRow]),
      });
      const signal = generateSignal(stock, indicators);
      const inserted = await supabase("signals", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify([{ stock_id: stock.id, ...signal }]),
      }) as Array<{ id: number }>;
      await supabase(`stocks?id=eq.${stock.id}`, {
        method: "PATCH",
        body: JSON.stringify({ last_signal: signal.signal_type, last_data_at: new Date().toISOString() }),
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
