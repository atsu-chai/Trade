import Link from "next/link";
import { redirect } from "next/navigation";
import { saveInvestmentProfile, startAnalysisLoop } from "@/app/actions";
import { LoopAutoRefresh } from "@/components/loop-auto-refresh";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/ui";

export const dynamic = "force-dynamic";

type Source = { title?: string; url?: string; publishedAt?: string | null; claim?: string };
type MetricMap = Record<string, number>;

const statusLabel: Record<string, string> = {
  queued: "実行待ち",
  running: "調査中",
  completed: "完了",
  failed: "失敗",
  cancelled: "中止",
};

function toSources(value: unknown): Source[] {
  return Array.isArray(value) ? (value as Source[]) : [];
}

function toRisks(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toMetrics(value: unknown): MetricMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as MetricMap) : {};
}

export default async function LoopPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;

  const [{ data: profile }, { data: runs }] = await Promise.all([
    supabase.from("investment_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("analysis_loop_runs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
  ]);
  const latestRun = runs?.[0] ?? null;
  const latestIteration = Number(latestRun?.completed_iterations ?? 0);
  const { data: candidates } = latestRun
    ? await supabase
        .from("analysis_loop_candidates")
        .select("*")
        .eq("run_id", latestRun.id)
        .eq("iteration", latestIteration)
        .order("score", { ascending: false })
    : { data: [] };
  const active = ["queued", "running"].includes(latestRun?.status ?? "");
  const budget = Number(profile?.budget_yen ?? 10000);
  const reservePercent = Number(profile?.reserve_rate ?? 0.05) * 100;

  return (
    <main>
      <LoopAutoRefresh active={active} />
      <section className="page-head">
        <div>
          <p className="eyebrow">Codex Research Loop</p>
          <h1>1万円のAI銘柄調査</h1>
          <p className="muted">Web上の最新情報を調べ、反対材料まで確認してS株で買える候補に絞ります。</p>
        </div>
        <form action={startAnalysisLoop} className="loop-start-form">
          <input type="hidden" name="iteration_limit" value="3" />
          <button type="submit" disabled={active}>{active ? "調査中" : "3回調査を開始"}</button>
        </form>
      </section>

      {params.message ? <div className="notice">{params.message}</div> : null}
      <div className="notice loop-safety">
        <strong>注文は実行しません。</strong> 現在値は発注価格ではありません。S株は発注時刻により約定タイミングが決まるため、価格余裕を含めて判定します。
      </div>

      <section className="loop-overview">
        <div className="loop-budget">
          <span>運用上限</span>
          <strong>{formatNumber(budget)}円</strong>
          <small>価格余裕 {formatNumber(reservePercent)}% / 最大 {profile?.max_positions ?? 2}銘柄</small>
        </div>
        <div className="loop-progress panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Latest run</p>
              <h2>{latestRun ? statusLabel[latestRun.status] ?? latestRun.status : "未実行"}</h2>
            </div>
            <span className={`badge ${latestRun?.status === "completed" ? "good" : latestRun?.status === "failed" ? "bad" : "warn"}`}>
              {latestRun ? `${latestRun.completed_iterations}/${latestRun.iteration_limit}回` : "0/3回"}
            </span>
          </div>
          <div className="progress-track"><span style={{ width: `${latestRun ? (latestRun.completed_iterations / latestRun.iteration_limit) * 100 : 0}%` }} /></div>
          <p className="muted">
            {latestRun?.summary ?? (latestRun?.status === "queued" ? "Codexワーカーの開始を待っています。" : "開始すると調査結果がここに表示されます。")}
          </p>
          {latestRun?.error ? <p className="price-down">{latestRun.error}</p> : null}
        </div>
      </section>

      <section className="loop-candidates">
        <div className="section-title">
          <div>
            <p className="eyebrow">Shortlist</p>
            <h2>調査を通過した候補</h2>
          </div>
          <span className="muted">第{latestIteration || "-"}回</span>
        </div>
        {candidates?.length ? (
          <div className="candidate-grid">
            {candidates.map((candidate, index) => {
              const metrics = toMetrics(candidate.metrics_json);
              const sources = toSources(candidate.sources_json);
              const risks = toRisks(candidate.risks_json);
              return (
                <article className="candidate-card" key={candidate.id}>
                  <div className="candidate-rank">{String(index + 1).padStart(2, "0")}</div>
                  <div className="candidate-main">
                    <div className="candidate-title">
                      <div><span>{candidate.code}</span><h3>{candidate.name}</h3></div>
                      <div className={`score-orbit ${candidate.verdict === "候補" ? "is-good" : ""}`}><strong>{candidate.score}</strong><small>{candidate.verdict}</small></div>
                    </div>
                    <div className="candidate-numbers">
                      <div><span>参考価格</span><strong>{formatNumber(candidate.current_price)}円</strong></div>
                      <div><span>想定価格</span><strong>{formatNumber(candidate.estimated_order_price)}円</strong></div>
                      <div><span>購入可能</span><strong>{candidate.affordable_shares}株</strong></div>
                      <div><span>想定金額</span><strong>{formatNumber(candidate.proposed_amount)}円</strong></div>
                    </div>
                    <p>{candidate.thesis}</p>
                    <div className="metric-bars">
                      {Object.entries(metrics).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></i><em>{value}</em></div>)}
                    </div>
                    {risks.length ? <div className="risk-list"><strong>注意点</strong>{risks.map((risk) => <p key={risk}>{risk}</p>)}</div> : null}
                    <div className="source-list">
                      {sources.map((source) => source.url ? <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title || "根拠を開く"}</a> : null)}
                    </div>
                    <Link className="button secondary" href={`/stocks/new?code=${candidate.code}&name=${encodeURIComponent(candidate.name)}&tags=Codex候補`}>監視銘柄に追加</Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="empty">完了した候補はまだありません。調査中は15秒ごとに更新します。</div>}
      </section>

      <section className="grid two loop-settings">
        <form action={saveInvestmentProfile} className="panel">
          <p className="eyebrow">Investor profile</p>
          <h2>投資条件</h2>
          <div className="form-grid">
            <label>予算（円）<input name="budget_yen" type="number" min="1000" step="1000" defaultValue={budget} /></label>
            <label>価格余裕（%）<input name="reserve_rate" type="number" min="0" max="30" step="1" defaultValue={reservePercent} /></label>
            <label>最大保有銘柄<input name="max_positions" type="number" min="1" max="10" defaultValue={profile?.max_positions ?? 2} /></label>
            <label>最短保有日数<input name="min_horizon_days" type="number" min="1" max="90" defaultValue={profile?.min_horizon_days ?? 3} /></label>
            <label>最長保有日数<input name="max_horizon_days" type="number" min="1" max="365" defaultValue={profile?.max_horizon_days ?? 20} /></label>
          </div>
          <button type="submit">条件を保存</button>
        </form>
        <div className="panel">
          <p className="eyebrow">History</p>
          <h2>最近の調査</h2>
          <div className="run-list">
            {(runs ?? []).map((run) => <div key={run.id}><span>{new Date(run.created_at).toLocaleString("ja-JP")}</span><strong>{statusLabel[run.status] ?? run.status}</strong><em>{run.best_score ?? "-"}点</em></div>)}
            {!runs?.length ? <p className="muted">履歴はまだありません。</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
