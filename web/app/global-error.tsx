"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body>
        <main style={{ maxWidth: 720, margin: "48px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
          <section style={{ border: "1px solid #d7dee8", borderRadius: 8, padding: 18 }}>
            <h1>画面の読み込みに失敗しました</h1>
            <p>一度再読み込みしてください。設定直後の場合は、Vercelの再デプロイ完了を待ってから開き直してください。</p>
            <p style={{ color: "#5d6b7a" }}>{error.message}</p>
            <button onClick={reset}>再試行</button>
          </section>
        </main>
      </body>
    </html>
  );
}
