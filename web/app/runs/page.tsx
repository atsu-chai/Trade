import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: runs, error } = await supabase.from("bot_runs").select("*").order("id", { ascending: false }).limit(100);

  return (
    <main>
      {error ? <div className="notice">{error.message}</div> : null}
      <section className="panel">
        <h1>Bot実行履歴</h1>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>状態</th>
                <th>処理銘柄</th>
                <th>通知数</th>
                <th>エラー</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((run) => (
                <tr key={run.id}>
                  <td>{run.created_at}</td>
                  <td>{run.status}</td>
                  <td>{run.processed_count}</td>
                  <td>{run.notification_count}</td>
                  <td>{run.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

