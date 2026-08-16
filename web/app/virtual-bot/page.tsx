import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveQuoteMap } from "@/lib/live-quotes";
import { formatNumber } from "@/lib/ui";

export const dynamic = "force-dynamic";

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}%`;
}

export default async function VirtualBotPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let { data: bot } = await supabase.from("virtual_bots").select("*").eq("user_id", user.id).maybeSingle();
  if (!bot) {
    const created = await supabase
      .from("virtual_bots")
      .insert({
        user_id: user.id,
        name: "仮想bot",
        initial_cash: 10000,
        cash_balance: 10000,
        latest_equity: 10000,
        realized_pnl: 0,
      })
      .select("*")
      .single();
    bot = created.data ?? null;
  }

  const [{ data: positions }, { data: trades }] = await Promise.all([
    bot
      ? supabase.from("virtual_positions").select("*, stocks(code,name)").eq("bot_id", bot.id).order("opened_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    bot
      ? supabase.from("virtual_trades").select("*, stocks(code,name)").eq("bot_id", bot.id).order("id", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const positionCodes = (positions ?? []).map((position) => position.stocks?.code).filter(Boolean) as string[];
  const liveQuotes = await fetchLiveQuoteMap(positionCodes);

  const positionRows = (positions ?? []).map((position) => {
    const live = liveQuotes.get(position.stocks?.code ?? "");
    const lastPrice = Number(live?.price ?? position.last_price ?? 0);
    const quantity = Number(position.quantity ?? 0);
    const avgCost = Number(position.avg_cost ?? 0);
    const marketValue = lastPrice * quantity;
    const unrealizedPnl = (lastPrice - avgCost) * quantity;
    return {
      ...position,
      displayPrice: lastPrice,
      displayMarketValue: marketValue,
      displayUnrealizedPnl: unrealizedPnl,
      fetchedAt: live?.fetchedAt ?? null,
    };
  });

  const cashBalance = Number(bot?.cash_balance ?? 10000);
  const initialCash = Number(bot?.initial_cash ?? 10000);
  const realizedPnl = Number(bot?.realized_pnl ?? 0);
  const marketValue = positionRows.reduce((sum, position) => sum + position.displayMarketValue, 0);
  const unrealizedPnl = positionRows.reduce((sum, position) => sum + position.displayUnrealizedPnl, 0);
  const equity = cashBalance + marketValue;
  const returnPct = initialCash > 0 ? ((equity - initialCash) / initialCash) * 100 : 0;

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Virtual Bot</p>
          <h1>仮想bot</h1>
          <p className="muted">初期資金1万円で、SBI証券のS株を想定した仮想運用結果を確認します。</p>
        </div>
      </section>

      <section className="grid metrics">
        <div className="metric">
          <span className="muted">初期資金</span>
          <b>{formatNumber(initialCash)}円</b>
        </div>
        <div className="metric">
          <span className="muted">現在資産</span>
          <b>{formatNumber(equity)}円</b>
        </div>
        <div className="metric">
          <span className="muted">現金</span>
          <b>{formatNumber(cashBalance)}円</b>
        </div>
        <div className="metric">
          <span className="muted">評価損益</span>
          <b className={unrealizedPnl >= 0 ? "price-up" : "price-down"}>{formatNumber(unrealizedPnl)}円</b>
        </div>
        <div className="metric">
          <span className="muted">実現損益</span>
          <b className={realizedPnl >= 0 ? "price-up" : "price-down"}>{formatNumber(realizedPnl)}円</b>
        </div>
        <div className="metric">
          <span className="muted">累計騰落率</span>
          <b className={returnPct >= 0 ? "price-up" : "price-down"}>{formatPercent(returnPct)}</b>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h1>保有ポジション</h1>
          {positionRows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>コード</th>
                    <th>銘柄</th>
                    <th>数量</th>
                    <th>平均取得</th>
                    <th>現在値</th>
                    <th>評価額</th>
                    <th>評価損益</th>
                  </tr>
                </thead>
                <tbody>
                  {positionRows.map((position) => (
                    <tr key={position.id}>
                      <td>{position.stocks?.code}</td>
                      <td>{position.stocks?.name}</td>
                      <td>{formatNumber(position.quantity)}</td>
                      <td>{formatNumber(position.avg_cost)}</td>
                      <td>{formatNumber(position.displayPrice)}</td>
                      <td>{formatNumber(position.displayMarketValue)}</td>
                      <td className={position.displayUnrealizedPnl >= 0 ? "price-up" : "price-down"}>
                        {formatNumber(position.displayUnrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">まだ保有ポジションはありません。Bot実行後に自動で仮想売買が始まります。</div>
          )}
        </div>

        <div className="panel">
          <h1>口座状態</h1>
          <dl className="stats">
            <div>
              <dt>Bot名</dt>
              <dd>{bot?.name ?? "仮想bot"}</dd>
            </div>
            <div>
              <dt>ステータス</dt>
              <dd>{bot?.status === "paused" ? "停止中" : "稼働中"}</dd>
            </div>
            <div>
              <dt>保有銘柄数</dt>
              <dd>{positionRows.length}</dd>
            </div>
            <div>
              <dt>最終評価</dt>
              <dd>{bot?.latest_valuation_at ? new Date(bot.latest_valuation_at).toLocaleString("ja-JP") : "-"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h1>売買履歴</h1>
        {trades?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日時</th>
                  <th>売買</th>
                  <th>コード</th>
                  <th>銘柄</th>
                  <th>数量</th>
                  <th>価格</th>
                  <th>金額</th>
                  <th>実現損益</th>
                  <th>理由</th>
                </tr>
              </thead>
              <tbody>
                {(trades ?? []).map((trade) => (
                  <tr key={trade.id}>
                    <td>{new Date(trade.executed_at).toLocaleString("ja-JP")}</td>
                    <td>{trade.side === "buy" ? "買い" : "売り"}</td>
                    <td>{trade.stocks?.code}</td>
                    <td>{trade.stocks?.name}</td>
                    <td>{formatNumber(trade.quantity)}</td>
                    <td>{formatNumber(trade.price)}</td>
                    <td>{formatNumber(trade.gross_amount)}</td>
                    <td className={Number(trade.realized_pnl ?? 0) >= 0 ? "price-up" : "price-down"}>
                      {formatNumber(trade.realized_pnl)}
                    </td>
                    <td>{trade.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">まだ売買履歴はありません。</div>
        )}
      </section>
    </main>
  );
}
