import Link from "next/link";
import { redirect } from "next/navigation";
import { StockForm } from "@/components/stock-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewStockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string; tags?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const initialStock =
    params.code || params.name || params.tags
      ? {
          code: params.code ?? "",
          name: params.name ?? "",
          tags: params.tags ?? "",
        }
      : undefined;

  return (
    <main>
      <section className="page-head">
        <div>
          <p className="eyebrow">Watchlist</p>
          <h1>銘柄追加</h1>
          <p className="muted">監視対象、保有情報、通知判断に使う補助情報を登録します。</p>
        </div>
        <Link className="button" href="/loop">AI調査で候補を探す</Link>
      </section>
      <section className="panel" id="stock-form-panel">
        <StockForm stock={initialStock} />
      </section>
    </main>
  );
}
