import Link from "next/link";
import { formatNumber } from "@/lib/ui";
import { improvementText, readResearchStatus } from "@/lib/research-status";

export default async function Home() {
  const research = await readResearchStatus();
  const improvement = research ? improvementText(research) : null;

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
        <div className="hero-grid">
          <div className="hero-stat">
            <span className="muted">研究状態</span>
            <b>{research?.best.adopted ? "採用済み" : "未採用"}</b>
          </div>
          <div className="hero-stat">
            <span className="muted">検証対象</span>
            <b>{research ? `${research.universeSize}銘柄` : "-"}</b>
          </div>
          <div className="hero-stat">
            <span className="muted">期待値</span>
            <b>{research ? `${formatNumber(research.best.validation.expectancyPct)}%` : "-"}</b>
          </div>
          <div className="hero-stat">
            <span className="muted">検証損益曲線</span>
            <b>{improvement ? `${formatNumber(improvement.after)}x` : "-"}</b>
          </div>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 18 }}>
        <div className="panel">
          <h2>研究の最新状況</h2>
          {research ? (
            <>
              <p className="muted">
                更新: {new Date(research.generatedAt).toLocaleString("ja-JP")} / ソース: {research.source}
              </p>
              <dl className="stats">
                <div>
                  <dt>検証前の資産曲線</dt>
                  <dd>{formatNumber(improvement?.before)}x</dd>
                </div>
                <div>
                  <dt>採用後の資産曲線</dt>
                  <dd>{formatNumber(improvement?.after)}x</dd>
                </div>
                <div>
                  <dt>改善率</dt>
                  <dd className={(improvement?.diffPct ?? 0) >= 0 ? "price-up" : "price-down"}>{formatNumber(improvement?.diffPct)}%</dd>
                </div>
                <div>
                  <dt>平均期待値</dt>
                  <dd>{formatNumber(research.best.validation.expectancyPct)}%</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="empty">まだ研究レポートがありません。</div>
          )}
        </div>

        <div className="panel">
          <h2>採用中パラメータ</h2>
          {research ? (
            <dl className="stats">
              <div>
                <dt>短期線 / 基準線</dt>
                <dd>
                  {research.best.config.maShort} / {research.best.config.maBase}
                </dd>
              </div>
              <div>
                <dt>高値判定本数</dt>
                <dd>{research.best.config.breakoutLookback}</dd>
              </div>
              <div>
                <dt>出来高倍率</dt>
                <dd>{formatNumber(research.best.config.volumeThreshold)}倍</dd>
              </div>
              <div>
                <dt>利確 / 損切り</dt>
                <dd>
                  {formatNumber(research.best.config.takeProfitPct * 100)}% / {formatNumber(research.best.config.stopLossPct * 100)}%
                </dd>
              </div>
              <div>
                <dt>最大保有日数</dt>
                <dd>{research.best.config.maxHoldBars}</dd>
              </div>
            </dl>
          ) : (
            <div className="empty">採用中パラメータはまだありません。</div>
          )}
        </div>
      </section>
    </main>
  );
}
