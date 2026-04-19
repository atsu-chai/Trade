export function badgeClass(signalType?: string | null) {
  if (!signalType) return "neutral";
  if (["損切り", "撤退", "下落"].some((word) => signalType.includes(word))) return "bad";
  if (["利確", "過熱", "注意"].some((word) => signalType.includes(word))) return "warn";
  if (signalType.includes("買い")) return "good";
  return "neutral";
}

export function formatNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const number = Number(value);
  if (Number.isNaN(number)) return "-";
  return number.toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

export function watchStatusLabel(value?: string | null) {
  return {
    normal: "通常監視",
    strong: "強監視",
    stopped: "停止",
  }[value ?? ""] ?? "-";
}

