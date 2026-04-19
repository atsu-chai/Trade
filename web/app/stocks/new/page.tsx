import { redirect } from "next/navigation";
import { StockForm } from "@/components/stock-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewStockPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Watchlist</p>
          <h1>銘柄追加</h1>
          <p className="muted">監視対象、保有情報、通知判断に使う補助情報を登録します。</p>
        </div>
      </section>
      <section className="panel">
        <StockForm />
      </section>
    </main>
  );
}
