import { notFound, redirect } from "next/navigation";
import { CandlestickChart } from "@/components/candlestick-chart";
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
      <section className="page-head">
        <div>
          <p className="eyebrow">Stock Detail</p>
          <h1>
            {stock.code} {stock.name}
          </h1>
          <p className="muted">チャート、指標、シグナル根拠、保有設定を確認します。</p>
        </div>
      </section>
      <section className="grid two">
        <div className="panel">
          <h2>チャートと指標</h2>
          <CandlestickChart candles={candles ?? []} title={`${stock.code} ${stock.name}`} />
          <div className="grid two" style={{ marginTop: 18 }}>
            <div>
              <strong>最新価格</strong>
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
        <h1>銘柄詳細・設定</h1>
        <StockForm stock={stock} />
      </section>
    </main>
  );
}
