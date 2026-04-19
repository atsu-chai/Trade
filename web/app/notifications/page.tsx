import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notifications, error } = await supabase
    .from("notification_history")
    .select("*, stocks(code,name)")
    .order("id", { ascending: false })
    .limit(100);

  return (
    <main>
      {error ? <div className="notice">{error.message}</div> : null}
      <section className="panel">
        <h1>通知履歴</h1>
        <p className="muted">LINE送信、重複スキップ、エラーを確認します。</p>
        {(notifications ?? []).map((item) => (
          <article key={item.id}>
            <strong>
              {item.stocks?.code} {item.stocks?.name}
            </strong>
            <p className="muted">
              {item.created_at} / {item.status}
            </p>
            {item.error ? <p className="muted">{item.error}</p> : null}
            <pre style={{ whiteSpace: "pre-wrap" }}>{item.message}</pre>
          </article>
        ))}
      </section>
    </main>
  );
}

