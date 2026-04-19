import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runBacktest } from "@/lib/backtest";
import { formatNumber } from "@/lib/ui";

export default async function BacktestPage({ searchParams }: { searchParams: Promise<{ stock_id?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { data: stocks } = await supabase.from("stocks").select("id,code,name").order("code");
  const selectedStockId = params.stock_id ?? String(stocks?.[0]?.id ?? "");
  const selectedStock = stocks?.find((stock) => String(stock.id) === selectedStockId);
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const { data: candles } = selectedStockId
    ? await supabase
        .from("price_candles")
        .select("ts,open,high,low,close,volume")
        .eq("stock_id", selectedStockId)
        .eq("timeframe", "1d")
        .gte("ts", oneYearAgo.toISOString())
        .order("ts", { ascending: true })
    : { data: [] };

  const result = runBacktest(candles ?? []);

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Backtest</p>
          <h1>バックテスト</h1>
          <p className="muted">出来高増加、短期移動平均、直近高値圏を使ったMVPルールの検証です。</p>
        </div>
        <form className="toolbar">
          <label>
            銘柄
            <select name="stock_id" defaultValue={selectedStockId}>
              {(stocks ?? []).map((stock) => (
                <option key={stock.id} value={stock.id}>
                  {stock.code} {stock.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">検証</button>
        </form>
      </section>

      <section className="notice">
        <strong>検証ルール:</strong> 過去1年間の日足を対象に、翌足始値でエントリー、+3%で利確、-3%で損切り、最大10本で時間切れ決済。手数料と税金は未考慮です。
      </section>

      {!selectedStock ? (
        <section className="empty">銘柄を登録してください。</section>
      ) : (candles ?? []).length < 30 ? (
        <section className="empty">バックテストには価格データが必要です。設定画面からBotを実行してください。</section>
      ) : (
        <>
          <section className="panel" style={{ marginBottom: 18 }}>
            <h2>
              {selectedStock.code} {selectedStock.name} の過去1年チャート
            </h2>
            <BacktestChart candles={candles ?? []} trades={result.trades} />
            <p className="muted">
              対象期間: {result.startDate?.slice(0, 10) ?? "-"}〜{result.endDate?.slice(0, 10) ?? "-"} / 日足 {result.candleCount}本
            </p>
          </section>

          <section className="grid metrics">
            <Metric label="取引回数" value={`${result.trades.length}`} />
            <Metric label="勝率" value={`${formatNumber(result.winRate)}%`} />
            <Metric label="期待値" value={`${formatNumber(result.expectancyPct)}%`} />
            <Metric label="最大DD" value={`${formatNumber(result.maxDrawdownPct)}%`} />
          </section>

          <section className="grid two">
            <div className="panel">
              <h2>成績</h2>
              <dl className="stats">
                <div>
                  <dt>対象銘柄</dt>
                  <dd>
                    {selectedStock.code} {selectedStock.name}
                  </dd>
                </div>
                <div>
                  <dt>平均利益率</dt>
                  <dd>{formatNumber(result.averageProfitPct)}%</dd>
                </div>
                <div>
                  <dt>平均損失率</dt>
                  <dd>{formatNumber(result.averageLossPct)}%</dd>
                </div>
                <div>
                  <dt>プロフィットファクター</dt>
                  <dd>{result.profitFactor === Infinity ? "∞" : formatNumber(result.profitFactor)}</dd>
                </div>
              </dl>
            </div>

            <div className="panel">
              <h2>注意</h2>
              <p className="muted">
                現在の価格データProviderはサンプル生成です。実運用判断に使う前に、実データProviderへ差し替えてください。
              </p>
            </div>
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <h2>取引一覧</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Entry価格</th>
                    <th>Exit価格</th>
                    <th>損益率</th>
                    <th>理由</th>
                    <th>保有本数</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((trade, index) => (
                    <tr key={`${trade.entryDate}-${index}`}>
                      <td>{trade.entryDate.slice(0, 10)}</td>
                      <td>{trade.exitDate.slice(0, 10)}</td>
                      <td>{formatNumber(trade.entryPrice)}</td>
                      <td>{formatNumber(trade.exitPrice)}</td>
                      <td className={trade.returnPct >= 0 ? "price-up" : "price-down"}>{formatNumber(trade.returnPct)}%</td>
                      <td>{trade.reason}</td>
                      <td>{trade.holdingBars}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function BacktestChart({
  candles,
  trades,
}: {
  candles: Array<{ ts: string; close: number | string }>;
  trades: Array<{ entryDate: string; exitDate: string; returnPct: number }>;
}) {
  const normalized = candles
    .map((candle) => ({ ts: candle.ts, close: Number(candle.close) }))
    .filter((candle) => !Number.isNaN(candle.close));
  const closes = normalized.map((candle) => candle.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const width = 960;
  const height = 280;

  if (normalized.length < 2) {
    return <div className="empty">チャート表示には価格データが必要です。</div>;
  }

  const xForIndex = (index: number) => (index / Math.max(normalized.length - 1, 1)) * width;
  const yForClose = (close: number) => height - ((close - min) / Math.max(max - min, 1)) * height;
  const path = normalized
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xForIndex(index).toFixed(2)} ${yForClose(point.close).toFixed(2)}`)
    .join(" ");
  const dateToIndex = new Map(normalized.map((point, index) => [point.ts.slice(0, 10), index]));

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="バックテストチャート">
      <path d={path} fill="none" stroke="#087f8c" strokeWidth="3" />
      {trades.slice(0, 40).map((trade, index) => {
        const entryIndex = dateToIndex.get(trade.entryDate.slice(0, 10));
        if (entryIndex === undefined) return null;
        const point = normalized[entryIndex];
        return (
          <circle
            key={`${trade.entryDate}-${index}`}
            cx={xForIndex(entryIndex)}
            cy={yForClose(point.close)}
            r="5"
            fill={trade.returnPct >= 0 ? "#147a4a" : "#b42318"}
          />
        );
      })}
      <text x="10" y="22" fill="#5d6b7a" fontSize="14">
        高値 {formatNumber(max)} / 安値 {formatNumber(min)}
      </text>
    </svg>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}
