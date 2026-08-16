import Link from "next/link";
import { redirect } from "next/navigation";
import { RingGauge } from "@/components/visuals";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveQuoteMap } from "@/lib/live-quotes";
import { badgeClass, formatNumber } from "@/lib/ui";

export const dynamic = "force-dynamic";

const runLabels: Record<string, string> = {
  queued: "実行待ち",
  running: "Web調査中",
  completed: "調査完了",
  failed: "要確認",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: stocks }, { data: bot }, { data: positions }, { data: profile }, { data: loopRuns }, { data: botRuns }] = await Promise.all([
    supabase.from("latest_stock_signals").select("*").order("score", { ascending: false, nullsFirst: false }).limit(8),
    supabase.from("virtual_bots").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("virtual_positions").select("*, stocks(code,name)").order("opened_at", { ascending: false }),
    supabase.from("investment_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("analysis_loop_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    supabase.from("bot_runs").select("*").order("id", { ascending: false }).limit(1),
  ]);
  const latestLoop = loopRuns?.[0] ?? null;
  const { data: candidates } = latestLoop
    ? await supabase.from("analysis_loop_candidates").select("*").eq("run_id", latestLoop.id).eq("iteration", latestLoop.completed_iterations).order("score", { ascending: false }).limit(3)
    : { data: [] };
  const quoteCodes = Array.from(new Set([...(stocks ?? []).map((stock) => stock.code), ...((positions ?? []).map((position) => position.stocks?.code).filter(Boolean) as string[])]));
  const liveQuotes = await fetchLiveQuoteMap(quoteCodes);
  const budget = Number(profile?.budget_yen ?? 10000);
  const cash = Number(bot?.cash_balance ?? 10000);
  const initial = Number(bot?.initial_cash ?? 10000);
  const marketValue = (positions ?? []).reduce((sum, position) => {
    const price = Number(liveQuotes.get(position.stocks?.code ?? "")?.price ?? position.last_price ?? 0);
    return sum + price * Number(position.quantity ?? 0);
  }, 0);
  const equity = cash + marketValue;
  const returnPct = initial > 0 ? ((equity - initial) / initial) * 100 : 0;
  const best = candidates?.[0] ?? null;

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Small-lot dashboard</p>
          <h1>1万円投資ダッシュボード</h1>
          <p className="muted">SBI証券のS株を前提に、買える金額と調査根拠だけを確認します。</p>
        </div>
        <Link className="button" href="/loop">AI調査を開く</Link>
      </section>
      <div className="notice"><strong>投資判断はご自身で行ってください。</strong> AI調査は注文を行わず、利益を保証しません。</div>

      <section className="grid metrics">
        <div className="metric"><span className="muted">予算上限</span><b>{formatNumber(budget)}円</b></div>
        <div className="metric"><span className="muted">仮想資産</span><b>{formatNumber(equity)}円</b></div>
        <div className="metric"><span className="muted">仮想損益</span><b className={returnPct >= 0 ? "price-up" : "price-down"}>{formatNumber(returnPct)}%</b></div>
        <div className="metric"><span className="muted">監視銘柄</span><b>{stocks?.length ?? 0}件</b></div>
        <div className="metric"><span className="muted">価格更新</span><b style={{ fontSize: 15 }}>{botRuns?.[0]?.created_at ? new Date(botRuns[0].created_at).toLocaleString("ja-JP") : "-"}</b></div>
      </section>

      <section className="grid two">
        <div className="panel dashboard-focus">
          <div className="section-title">
            <div><p className="eyebrow">Best candidate</p><h2>{best ? `${best.code} ${best.name}` : "候補なし"}</h2></div>
            <RingGauge value={Number(best?.score ?? 0)} label="調査点" detail={best?.verdict ?? "未調査"} color="#087f8c" />
          </div>
          {best ? (
            <>
              <p>{best.thesis}</p>
              <div className="candidate-numbers">
                <div><span>想定価格</span><strong>{formatNumber(best.estimated_order_price)}円</strong></div>
                <div><span>購入可能</span><strong>{best.affordable_shares}株</strong></div>
                <div><span>想定金額</span><strong>{formatNumber(best.proposed_amount)}円</strong></div>
                <div><span>保有目安</span><strong>{best.horizon_days}日</strong></div>
              </div>
            </>
          ) : <p className="muted">AI調査を実行すると、条件を通過した候補が表示されます。</p>}
          <Link href="/loop">根拠とリスクを確認</Link>
        </div>

        <div className="panel">
          <p className="eyebrow">Research status</p>
          <h2>{latestLoop ? runLabels[latestLoop.status] ?? latestLoop.status : "未実行"}</h2>
          <div className="progress-track"><span style={{ width: `${latestLoop ? (latestLoop.completed_iterations / latestLoop.iteration_limit) * 100 : 0}%` }} /></div>
          <p className="muted">{latestLoop?.summary ?? "現在の情報をWebで調べ、反対材料を含めて3回見直します。"}</p>
          <Link className="button secondary" href="/loop">調査を管理</Link>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="section-title"><div><p className="eyebrow">Watchlist</p><h2>監視銘柄</h2></div><Link className="button secondary" href="/stocks/new">銘柄を追加</Link></div>
        {stocks?.length ? (
          <div className="table-wrap"><table><thead><tr><th>コード</th><th>銘柄</th><th>現在値</th><th>従来シグナル</th><th>更新時刻</th></tr></thead><tbody>
            {stocks.map((stock) => {
              const quote = liveQuotes.get(stock.code);
              return <tr key={stock.id}><td>{stock.code}</td><td>{stock.name}</td><td>{formatNumber(quote?.price ?? stock.latest_close)}円</td><td><span className={`badge ${badgeClass(stock.signal_type)}`}>{stock.signal_type ?? "-"}</span></td><td>{quote?.fetchedAt ? new Date(quote.fetchedAt).toLocaleString("ja-JP") : stock.last_data_at ? new Date(stock.last_data_at).toLocaleString("ja-JP") : "-"}</td></tr>;
            })}
          </tbody></table></div>
        ) : <div className="empty">監視銘柄はまだありません。</div>}
      </section>
    </main>
  );
}
