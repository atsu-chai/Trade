import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteStock } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { badgeClass, formatNumber, watchStatusLabel } from "@/lib/ui";

export default async function StocksPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const { data: stocks, error } = await supabase
    .from("latest_stock_signals")
    .select("*")
    .order("score", { ascending: false, nullsFirst: false });

  return (
    <main>
      {params.message ? <div className="notice">{params.message}</div> : null}
      {error ? <div className="notice">{error.message}</div> : null}
      <section className="page-head">
        <div>
          <p className="eyebrow">Watchlist</p>
          <h1>監視銘柄</h1>
          <p className="muted">銘柄、保有情報、監視状態を管理します。</p>
        </div>
        <Link className="button" href="/stocks/new">
          銘柄を追加
        </Link>
      </section>
      <section className="panel">
        {stocks?.length ? <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>コード</th>
                <th>銘柄名</th>
                <th>現在値</th>
                <th>前日比</th>
                <th>出来高倍率</th>
                <th>シグナル</th>
                <th>スコア</th>
                <th>状態</th>
                <th>詳細</th>
              </tr>
            </thead>
            <tbody>
              {(stocks ?? []).map((stock) => (
                <tr key={stock.id}>
                  <td>{stock.code}</td>
                  <td>
                    <strong>{stock.name}</strong>
                    <br />
                    <small>{stock.tags}</small>
                  </td>
                  <td>{formatNumber(stock.latest_close)}</td>
                  <td>{formatNumber(stock.price_change_pct)}%</td>
                  <td>{formatNumber(stock.volume_ratio)}倍</td>
                  <td>
                    <span className={`badge ${badgeClass(stock.signal_type)}`}>{stock.signal_type ?? "-"}</span>
                  </td>
                  <td>{stock.score ?? "-"}</td>
                  <td>{watchStatusLabel(stock.watch_status)}</td>
                  <td>
                    <div className="actions">
                      <Link className="button secondary" href={`/stocks/${stock.id}`}>
                        詳細
                      </Link>
                      <form action={deleteStock}>
                        <input type="hidden" name="id" value={stock.id} />
                        <button className="danger">削除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div> : <div className="empty">まだ銘柄がありません。最初の監視銘柄を追加してください。</div>}
      </section>
    </main>
  );
}
