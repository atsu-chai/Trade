import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveQuoteMap } from "@/lib/live-quotes";
import { improvementText, readResearchStatus } from "@/lib/research-status";
import { badgeClass, formatNumber } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const research = await readResearchStatus();
  const improvement = research ? improvementText(research) : null;

  const [{ data: stocks }, { data: signals }, { data: notifications }, { data: runs }, { data: virtualBot }, { data: virtualPositions }] = await Promise.all([
    supabase.from("latest_stock_signals").select("*").order("score", { ascending: false, nullsFirst: false }).limit(10),
    supabase.from("signals").select("*, stocks(code,name)").order("id", { ascending: false }).limit(10),
    supabase.from("notification_history").select("*, stocks(code,name)").order("id", { ascending: false }).limit(8),
    supabase.from("bot_runs").select("*").order("id", { ascending: false }).limit(1),
    supabase.from("virtual_bots").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("virtual_positions").select("*, stocks(code,name)").order("opened_at", { ascending: false }),
  ]);
  const quoteCodes = Array.from(new Set([...(stocks ?? []).map((stock) => stock.code), ...((virtualPositions ?? []).map((position) => position.stocks?.code).filter(Boolean) as string[])]));
  const liveQuotes = await fetchLiveQuoteMap(quoteCodes);

  const buyCount = signals?.filter((signal) => signal.signal_type === "買い候補").length ?? 0;
  const sellCount = signals?.filter((signal) => signal.signal_type === "利確売り候補").length ?? 0;
  const cutCount = signals?.filter((signal) => ["損切り候補", "撤退検討", "下落リスク上昇"].includes(signal.signal_type)).length ?? 0;
  const virtualCash = Number(virtualBot?.cash_balance ?? 100000);
  const virtualInitial = Number(virtualBot?.initial_cash ?? 100000);
  const virtualMarketValue = (virtualPositions ?? []).reduce((sum, position) => {
    const live = liveQuotes.get(position.stocks?.code ?? "");
    const price = Number(live?.price ?? position.last_price ?? 0);
    return sum + price * Number(position.quantity ?? 0);
  }, 0);
  const virtualEquity = virtualCash + virtualMarketValue;
  const virtualReturnPct = virtualInitial > 0 ? ((virtualEquity - virtualInitial) / virtualInitial) * 100 : 0;

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>ダッシュボード</h1>
          <p className="muted">監視銘柄、最新シグナル、通知状況をまとめて確認します。</p>
        </div>
        <Link className="button" href="/settings">
          手動実行
        </Link>
      </section>
      <div className="notice">
        <strong>免責:</strong> 本システムは投資助言ではありません。表示内容は売買を推奨・保証するものではなく、最終判断は利用者本人が行ってください。
      </div>

      <section className="grid metrics">
        <div className="metric">
          <span className="muted">監視銘柄</span>
          <b>{stocks?.length ?? 0}</b>
        </div>
        <div className="metric">
          <span className="muted">買い候補</span>
          <b>{buyCount}</b>
        </div>
        <div className="metric">
          <span className="muted">利確候補</span>
          <b>{sellCount}</b>
        </div>
        <div className="metric">
          <span className="muted">撤退系</span>
          <b>{cutCount}</b>
        </div>
        <div className="metric">
          <span className="muted">最終実行</span>
          <b style={{ fontSize: 16 }}>{runs?.[0]?.created_at ? new Date(runs[0].created_at).toLocaleString("ja-JP") : "-"}</b>
        </div>
        <div className="metric">
          <span className="muted">仮想資産</span>
          <b>{formatNumber(virtualEquity)}円</b>
        </div>
        <div className="metric">
          <span className="muted">研究改善率</span>
          <b className={(improvement?.diffPct ?? 0) >= 0 ? "price-up" : "price-down"}>
            {improvement ? `${formatNumber(improvement.diffPct)}%` : "-"}
          </b>
        </div>
      </section>

      <section className="grid two">
        <div className="panel">
          <h1>高スコア銘柄</h1>
          {stocks?.length ? <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>コード</th>
                  <th>銘柄</th>
                  <th>シグナル</th>
                  <th>スコア</th>
                  <th>最新価格</th>
                  <th>取得時刻</th>
                </tr>
              </thead>
              <tbody>
                {(stocks ?? []).map((stock) => {
                  const live = liveQuotes.get(stock.code);
                  return (
                    <tr key={stock.id}>
                      <td>{stock.code}</td>
                      <td>{stock.name}</td>
                      <td>
                        <span className={`badge ${badgeClass(stock.signal_type)}`}>{stock.signal_type ?? "-"}</span>
                      </td>
                      <td>{stock.score ?? "-"}</td>
                      <td>{formatNumber(live?.price ?? stock.latest_close)}</td>
                      <td>
                        {live?.fetchedAt
                          ? new Date(live.fetchedAt).toLocaleString("ja-JP")
                          : stock.last_data_at
                            ? new Date(stock.last_data_at).toLocaleString("ja-JP")
                            : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div> : <div className="empty">銘柄を登録し、Botを実行するとここに表示されます。</div>}
          <p>
            <Link href="/stocks">銘柄管理へ</Link>
          </p>
        </div>

        <div className="panel">
          <h1>研究ステータス</h1>
          {research ? (
            <>
              <p className="muted">
                {new Date(research.generatedAt).toLocaleString("ja-JP")} / {research.source}
              </p>
              <div className="research-status-grid">
                <div>
                  <span className="muted">検証前</span>
                  <strong>{formatNumber(improvement?.before)}x</strong>
                </div>
                <div>
                  <span className="muted">検証後</span>
                  <strong>{formatNumber(improvement?.after)}x</strong>
                </div>
                <div>
                  <span className="muted">期待値</span>
                  <strong>{formatNumber(research.best.validation.expectancyPct)}%</strong>
                </div>
                <div>
                  <span className="muted">検証銘柄</span>
                  <strong>{research.universeSize}</strong>
                </div>
              </div>
              <p className="muted">
                MA {research.best.config.maShort}/{research.best.config.maBase} / 高値 {research.best.config.breakoutLookback}本 /
                出来高 {formatNumber(research.best.config.volumeThreshold)}倍 / 利確 {formatNumber(research.best.config.takeProfitPct * 100)}%
              </p>
            </>
          ) : (
            <div className="empty">研究レポートはまだありません。</div>
          )}
        </div>

        <div className="panel">
          <h1>仮想bot</h1>
          <article>
            <strong>初期資金 100,000円</strong>
            <p className="muted">
              現在資産 {formatNumber(virtualEquity)}円 / 騰落率{" "}
              <span className={virtualReturnPct >= 0 ? "price-up" : "price-down"}>{formatNumber(virtualReturnPct)}%</span>
            </p>
            <p className="muted">
              現金 {formatNumber(virtualCash)}円 / 保有銘柄 {(virtualPositions ?? []).length}件
            </p>
            <p>
              <Link href="/virtual-bot">仮想botの詳細へ</Link>
            </p>
          </article>
        </div>

        <div className="panel">
          <h1>通知履歴</h1>
          {notifications?.length ? (notifications ?? []).map((item) => (
            <article key={item.id}>
              <strong>
                {item.stocks?.code} {item.stocks?.name}
              </strong>
              <p className="muted">
                {item.created_at} / {item.status}
              </p>
              {item.error ? <p className="muted">{item.error}</p> : null}
            </article>
          )) : <div className="empty">通知履歴はまだありません。</div>}
        </div>
      </section>
    </main>
  );
}
