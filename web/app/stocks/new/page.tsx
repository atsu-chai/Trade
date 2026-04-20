import { redirect } from "next/navigation";
import { findStrongBuyCandidates } from "@/app/actions";
import { StrongBuyCandidateList } from "@/components/strong-buy-candidate-list";
import { StockForm } from "@/components/stock-form";
import type { StrongBuyCandidate } from "@/lib/market-scan";
import { createClient } from "@/lib/supabase/server";

function parseScan(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as StrongBuyCandidate[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export default async function NewStockPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; name?: string; tags?: string; scan?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const candidates = parseScan(params.scan);
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
        <form action={findStrongBuyCandidates}>
          <button type="submit">強シグナル候補を探す</button>
        </form>
      </section>
      {candidates.length ? (
        <section className="panel" style={{ marginBottom: 18 }}>
          <h2>買いの強シグナル候補</h2>
          <p className="muted">
            Yahoo Financeの日足で銘柄マスターを現時点評価し、買い候補スコアが高い順に複数表示しています。
          </p>
          <StrongBuyCandidateList candidates={candidates} />
        </section>
      ) : params.scan ? (
        <section className="notice">強シグナル候補は見つかりませんでした。時間を置いて再実行してください。</section>
      ) : null}
      <section className="panel" id="stock-form-panel">
        <StockForm stock={initialStock} />
      </section>
    </main>
  );
}
