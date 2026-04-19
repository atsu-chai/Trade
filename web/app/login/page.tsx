export default function LoginPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  return (
    <main>
      <section className="panel" style={{ maxWidth: 520, margin: "48px auto" }}>
        <h1>メールでログイン</h1>
        <p className="muted">
          Google Cloud OAuthを使わず、Supabase Email OTP / Magic Linkでログインします。許可されたメールアドレスだけ利用できます。
        </p>
        <LoginMessage searchParams={searchParams} />
        <form action="/auth/sign-in" method="POST">
          <label>
            メールアドレス
            <input type="email" name="email" required placeholder="you@example.com" />
          </label>
          <button type="submit">ログインメールを送る</button>
        </form>
      </section>
    </main>
  );
}

async function LoginMessage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const params = await searchParams;
  if (!params.message) return null;
  return <div className="notice">{params.message}</div>;
}
