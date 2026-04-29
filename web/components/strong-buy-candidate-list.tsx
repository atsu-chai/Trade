"use client";

import type { StrongBuyCandidate } from "@/lib/market-scan";
import { formatNumber } from "@/lib/ui";

export function StrongBuyCandidateList({ candidates }: { candidates: StrongBuyCandidate[] }) {
  function formatCandidateTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function applyCandidate(candidate: StrongBuyCandidate) {
    window.dispatchEvent(
      new CustomEvent("stock-form-autofill", {
        detail: {
          code: candidate.code,
          name: candidate.name,
          tags: candidate.tags,
        },
      }),
    );
  }

  return (
    <div className="candidate-results">
      {candidates.map((candidate) => (
        <article className="candidate-card" key={candidate.code}>
          <div>
            <p className="eyebrow">{candidate.code}</p>
            <h3>{candidate.name}</h3>
            <p className="muted">
              {formatCandidateTime(candidate.latestDate)} / 現在値 {formatNumber(candidate.latestClose)} / 直近変化 {formatNumber(candidate.priceChangePct)}%
              / 出来高倍率 {formatNumber(candidate.volumeRatio)}倍
            </p>
          </div>
          <strong className="score-pill">
            {candidate.signalType} / {candidate.score}点 / {candidate.strength}
          </strong>
          <ul>
            {candidate.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <button className="secondary" type="button" onClick={() => applyCandidate(candidate)}>
            この銘柄を入力
          </button>
        </article>
      ))}
    </div>
  );
}
