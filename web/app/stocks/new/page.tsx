import Link from "next/link";
import { redirect } from "next/navigation";
import { findStrongBuyCandidates } from "@/app/actions";
import { StockForm } from "@/components/stock-form";
import type { StrongBuyCandidate } from "@/lib/market-scan";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/ui";

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
          <p className="muted">Yahoo Financeの日足で銘柄マスターをスキャンし、買い候補スコアが高い順に表示しています。</p>
          <div className="candidate-results">
            {candidates.map((candidate) => (
              <article className="candidate-card" key={candidate.code}>
                <div>
                  <p className="eyebrow">{candidate.code}</p>
                  <h3>{candidate.name}</h3>
                  <p className="muted">
                    {candidate.latestDate} / 終値 {formatNumber(candidate.latestClose)} / 前日比{" "}
                    {formatNumber(candidate.priceChangePct)}% / 出来高倍率 {formatNumber(candidate.volumeRatio)}倍
                  </p>
                </div>
                <strong className="score-pill">{candidate.score}点</strong>
                <ul>
                  {candidate.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                <Link
                  className="button secondary"
                  href={`/stocks/new?code=${encodeURIComponent(candidate.code)}&name=${encodeURIComponent(candidate.name)}&tags=${encodeURIComponent(candidate.tags)}`}
                >
                  この銘柄を入力
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : params.scan ? (
        <section className="notice">強シグナル候補は見つかりませんでした。時間を置いて再実行してください。</section>
      ) : null}
      <section className="panel">
        <StockForm stock={initialStock} />
      </section>
    </main>
  );
}
