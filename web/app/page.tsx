import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="hero small-lot-hero">
        <div className="hero-copy">
          <p className="eyebrow">SBI S株 × Codex</p>
          <h1>1万円で買える日本株だけを、根拠から調べる</h1>
          <p className="muted">最新情報、反対材料、S株の約定価格リスクをWebで調査し、実際に買える株数まで計算します。</p>
          <div className="actions"><Link className="button" href="/login">ログイン</Link></div>
        </div>
        <div className="small-lot-visual" aria-label="分析フロー">
          <div><span>予算</span><strong>¥10,000</strong></div>
          <div className="visual-arrow">→</div>
          <div><span>Codex調査</span><strong>3 rounds</strong></div>
          <div className="visual-arrow">→</div>
          <div><span>結果</span><strong>株数 + 根拠</strong></div>
        </div>
      </section>

      <section className="flow-band">
        <div><span>01</span><strong>Web調査</strong><p>企業開示と市場情報を確認</p></div>
        <div><span>02</span><strong>反対材料</strong><p>下落要因と情報の矛盾を検索</p></div>
        <div><span>03</span><strong>S株判定</strong><p>価格余裕を含めて買える株数を計算</p></div>
        <div><span>04</span><strong>仮想運用</strong><p>1万円で結果を追跡</p></div>
      </section>

      <section className="grid two" style={{ marginTop: 18 }}>
        <div className="panel"><p className="eyebrow">Focused</p><h2>必要な画面だけ</h2><p className="muted">AI調査、監視銘柄、1万円仮想運用、LINE通知設定に整理しています。</p></div>
        <div className="panel"><p className="eyebrow">Human decision</p><h2>実注文は行わない</h2><p className="muted">AIは候補と根拠を提示します。SBI証券での最終判断と注文は利用者が行います。</p></div>
      </section>
    </main>
  );
}
