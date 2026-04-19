import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { badgeClass, formatNumber } from "@/lib/ui";

export default async function SignalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: signals, error } = await supabase
    .from("signals")
    .select("*, stocks(code,name)")
    .order("id", { ascending: false })
    .limit(100);

  return (
    <main>
      {error ? <div className="notice">{error.message}</div> : null}
      <section className="panel">
        <h1>シグナル一覧</h1>
        {(signals ?? []).map((signal) => (
          <article key={signal.id}>
            <h2>
              {signal.stocks?.code} {signal.stocks?.name}{" "}
              <span className={`badge ${badgeClass(signal.signal_type)}`}>{signal.signal_type}</span>
            </h2>
            <p className="muted">
              {signal.created_at} / {signal.score}点 / {signal.strength} / リスク:{signal.risk_level}
            </p>
            <p>
              エントリー目安: {formatNumber(signal.entry_price_low)}〜{formatNumber(signal.entry_price_high)} / 第1利確:{" "}
              {formatNumber(signal.take_profit_1)} / 損切り: {formatNumber(signal.stop_loss)}
            </p>
            <ul>
              {(signal.reasons_json ?? []).slice(0, 5).map((reason: string) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {(signal.cautions_json ?? []).length ? (
              <p className="muted">注意: {(signal.cautions_json ?? []).join(" / ")}</p>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

