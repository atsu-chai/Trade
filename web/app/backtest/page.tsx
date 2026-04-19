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
  const { data: candles } = selectedStockId
    ? await supabase
        .from("price_candles")
        .select("ts,open,high,low,close,volume")
        .eq("stock_id", selectedStockId)
        .eq("timeframe", "1d")
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
        <strong>検証ルール:</strong> 翌足始値でエントリー、+3%で利確、-3%で損切り、最大10本で時間切れ決済。手数料と税金は未考慮です。
      </section>

      {!selectedStock ? (
        <section className="empty">銘柄を登録してください。</section>
      ) : (candles ?? []).length < 30 ? (
        <section className="empty">バックテストには価格データが必要です。設定画面からBotを実行してください。</section>
      ) : (
        <>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="muted">{label}</span>
      <b>{value}</b>
    </div>
  );
}

