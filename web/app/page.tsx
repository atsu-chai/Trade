import Link from "next/link";
import { formatNumber } from "@/lib/ui";
import { improvementText, readResearchStatus } from "@/lib/research-status";
import { HorizontalBars, MiniLineChart, RingGauge } from "@/components/visuals";

export default async function Home() {
  const research = await readResearchStatus();
  const improvement = research ? improvementText(research) : null;
  const score = research?.best.validation.score ?? 0;
  const gaugeValue = Math.max(0, Math.min(100, score * 8));
  const parameterBars = research
    ? [
        { label: `短期MA ${research.best.config.maShort}`, value: research.best.config.maShort, color: "#087f8c" },
        { label: `基準MA ${research.best.config.maBase}`, value: research.best.config.maBase, color: "#2563eb" },
        { label: `高値 ${research.best.config.breakoutLookback}本`, value: research.best.config.breakoutLookback, color: "#14b8a6" },
        { label: `保有 ${research.best.config.maxHoldBars}本`, value: research.best.config.maxHoldBars, color: "#64748b" },
      ]
    : [];

  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">日本株AIシグナルbot</p>
          <h1>監視、通知、仮想運用、過去検証を一画面で回す</h1>
          <p className="muted">
            監視銘柄の短期シグナル、LINE通知、仮想botの自動売買、2015年以降の過去データ研究をまとめて確認できます。
          </p>
          <div className="actions">
            <Link className="button" href="/login">
              ログイン
            </Link>
            <Link className="button secondary" href="/dashboard">
              ダッシュボード
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <RingGauge
            value={gaugeValue}
            label="学習スコア"
            detail={research ? `${research.universeSize}銘柄で検証` : "研究データ待ち"}
          />
          {research ? (
            <MiniLineChart
              points={[
                { label: "検証前", value: improvement?.before ?? 1 },
                { label: "採用後", value: improvement?.after ?? 1 },
              ]}
              suffix="x"
            />
          ) : (
            <div className="empty">研究グラフはBot実行後に表示されます。</div>
          )}
        </div>
      </section>

      <section className="visual-strip">
        <div>
          <span className="muted">検証資産曲線</span>
          <strong>{improvement ? `${formatNumber(improvement.after)}x` : "-"}</strong>
        </div>
        <div>
          <span className="muted">改善率</span>
          <strong className={(improvement?.diffPct ?? 0) >= 0 ? "price-up" : "price-down"}>
            {improvement ? `${formatNumber(improvement.diffPct)}%` : "-"}
          </strong>
        </div>
        <div>
          <span className="muted">期待値</span>
          <strong>{research ? `${formatNumber(research.best.validation.expectancyPct)}%` : "-"}</strong>
        </div>
        <div>
          <span className="muted">取引回数</span>
          <strong>{research ? formatNumber(research.best.validation.tradeCount) : "-"}</strong>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 18 }}>
        <div className="panel">
          <h2>研究パフォーマンス</h2>
          {research ? (
            <>
              <p className="muted">
                更新: {new Date(research.generatedAt).toLocaleString("ja-JP")} / ソース: {research.source}
              </p>
              <MiniLineChart
                points={[
                  { label: "基準", value: research.baseline.validation.terminalEquity },
                  { label: "学習後", value: research.best.validation.terminalEquity },
                ]}
                suffix="x"
              />
              <div className="comparison-grid">
                <RingGauge value={Math.max(0, Math.min(100, research.best.validation.winRate ?? 0))} label="勝率" detail="検証期間" color="#147a4a" />
                <RingGauge value={gaugeValue} label="総合" detail={`Score ${formatNumber(score)}`} color="#2563eb" />
              </div>
            </>
          ) : (
            <div className="empty">まだ研究レポートがありません。</div>
          )}
        </div>

        <div className="panel">
          <h2>採用中パラメータ</h2>
          {research ? (
            <>
              <HorizontalBars bars={parameterBars} />
              <div className="risk-reward">
                <div>
                  <span>利確</span>
                  <strong>+{formatNumber(research.best.config.takeProfitPct * 100)}%</strong>
                </div>
                <div>
                  <span>損切り</span>
                  <strong>-{formatNumber(research.best.config.stopLossPct * 100)}%</strong>
                </div>
                <div>
                  <span>出来高</span>
                  <strong>{formatNumber(research.best.config.volumeThreshold)}倍</strong>
                </div>
              </div>
            </>
          ) : (
            <div className="empty">採用中パラメータはまだありません。</div>
          )}
        </div>
      </section>

      <section className="flow-band">
        <div>
          <span>01</span>
          <strong>15分足更新</strong>
          <p>登録銘柄の価格と出来高を取得</p>
        </div>
        <div>
          <span>02</span>
          <strong>学習条件で採点</strong>
          <p>MA、ブレイクアウト、出来高を評価</p>
        </div>
        <div>
          <span>03</span>
          <strong>LINE通知</strong>
          <p>高スコアの銘柄を定期送信</p>
        </div>
        <div>
          <span>04</span>
          <strong>仮想運用</strong>
          <p>10万円の仮想資金で検証</p>
        </div>
      </section>
    </main>
  );
}
