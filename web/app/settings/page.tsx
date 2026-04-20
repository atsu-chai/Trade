import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: settings } = await supabase.from("settings").select("*").order("key");
  const params = await searchParams;

  return (
    <main>
      {params.message ? <div className="notice">{params.message}</div> : null}
      <section className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>設定</h1>
          <p className="muted">Bot手動実行、LINEテスト、MVP設定値の確認を行います。</p>
        </div>
      </section>
      <section className="grid two">
        <div className="panel">
          <h1>手動実行</h1>
          <p className="muted">Cronを待たずに、Yahoo Financeの日足データで登録銘柄をすぐ分析します。</p>
          <form action="/api/run-bot" method="POST">
            <button type="submit">Botを今すぐ実行</button>
          </form>
        </div>

        <div className="panel">
          <h1>LINEテスト</h1>
          <p className="muted">シグナル条件に関係なく、LINE接続だけ確認します。</p>
          <form action="/api/test-line" method="POST">
            <label>
              テスト文
              <textarea name="message" rows={3} defaultValue="LINE通知テストです" />
            </label>
            <button type="submit">LINEテスト送信</button>
          </form>
        </div>
      </section>

      <section className="notice" style={{ marginTop: 18 }}>
        既定の価格Providerは `yahoo` です。銘柄一覧と詳細ではYahoo Financeから取れる最新価格を表示します。J-Quantsを使う場合のみ、
        Supabase Edge Function側のSecretsに `JQUANTS_EMAIL` / `JQUANTS_PASSWORD` または `JQUANTS_REFRESH_TOKEN` が必要です。
      </section>

      <section className="panel" style={{ marginTop: 18 }}>
        <h1>設定値</h1>
        <p className="muted">現在は読み取り表示です。閾値編集UIは次フェーズで追加します。</p>
        {(settings ?? []).map((setting) => (
          <article key={setting.key}>
            <h2>{setting.key}</h2>
            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(setting.value, null, 2)}</pre>
          </article>
        ))}
      </section>
    </main>
  );
}
