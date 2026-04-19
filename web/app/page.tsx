import Link from "next/link";

export default function Home() {
  return (
    <main>
      <section className="panel" style={{ maxWidth: 720, margin: "48px auto" }}>
        <p className="muted">日本株AIシグナルbot</p>
        <h1>監視銘柄とシグナル管理</h1>
        <p>
          Email OTP / Magic Linkでログインして、監視銘柄、シグナル、通知履歴を確認します。
        </p>
        <div className="actions">
          <Link className="button" href="/login">
            ログイン
          </Link>
          <Link className="button secondary" href="/dashboard">
            ダッシュボード
          </Link>
        </div>
      </section>
    </main>
  );
}
