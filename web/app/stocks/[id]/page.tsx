import { notFound, redirect } from "next/navigation";
import { StockForm } from "@/components/stock-form";
import { createClient } from "@/lib/supabase/server";
import { badgeClass, formatNumber } from "@/lib/ui";

export default async function EditStockPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [{ data: stock }, { data: candles }, { data: indicators }, { data: signals }] = await Promise.all([
    supabase.from("stocks").select("*").eq("id", id).single(),
    supabase.from("price_candles").select("*").eq("stock_id", id).eq("timeframe", "1d").order("ts", { ascending: true }).limit(100),
    supabase.from("technical_indicators").select("*").eq("stock_id", id).maybeSingle(),
    supabase.from("signals").select("*").eq("stock_id", id).order("id", { ascending: false }).limit(20),
  ]);
  if (!stock) notFound();

  return (
    <main>
      <section className="grid two">
        <div className="panel">
          <h1>
            {stock.code} {stock.name}
          </h1>
          <PriceChart candles={candles ?? []} />
          <div className="grid two" style={{ marginTop: 18 }}>
            <div>
              <strong>現在値</strong>
              <p>{formatNumber(indicators?.latest_close)}</p>
            </div>
            <div>
              <strong>出来高倍率</strong>
              <p>{formatNumber(indicators?.volume_ratio)}倍</p>
            </div>
            <div>
              <strong>RSI</strong>
              <p>{formatNumber(indicators?.rsi14)}</p>
            </div>
            <div>
              <strong>VWAP</strong>
              <p>{formatNumber(indicators?.vwap)}</p>
            </div>
          </div>
        </div>
        <div className="panel">
          <h1>最新シグナル</h1>
          {(signals ?? []).slice(0, 5).map((signal) => (
            <article key={signal.id}>
              <h2>
                <span className={`badge ${badgeClass(signal.signal_type)}`}>{signal.signal_type}</span> {signal.score}点
              </h2>
              <p className="muted">
                {signal.created_at} / {signal.strength} / リスク:{signal.risk_level}
              </p>
              <ul>
                {(signal.reasons_json ?? []).slice(0, 4).map((reason: string) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <h1>銘柄編集</h1>
        <StockForm stock={stock} />
      </section>
    </main>
  );
}

function PriceChart({ candles }: { candles: Array<{ close: number | string; ts: string }> }) {
  const points = candles.slice(-60).map((candle) => Number(candle.close)).filter((value) => !Number.isNaN(value));
  if (points.length < 2) {
    return <div className="notice">チャート表示にはBot実行後の価格データが必要です。</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const width = 640;
  const height = 220;
  const path = points
    .map((value, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((value - min) / Math.max(max - min, 1)) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="終値チャート" style={{ width: "100%", background: "#fff", border: "1px solid #d7dee8", borderRadius: 8 }}>
      <path d={path} fill="none" stroke="#087f8c" strokeWidth="3" />
      <text x="8" y="20" fill="#5d6b7a" fontSize="14">
        高値 {formatNumber(max)} / 安値 {formatNumber(min)}
      </text>
    </svg>
  );
}
