import { formatNumber } from "@/lib/ui";

type Candle = {
  ts: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
};

type Marker = {
  ts: string;
  value?: number;
  tone?: "good" | "bad" | "neutral";
};

export function CandlestickChart({
  candles,
  markers = [],
  title,
}: {
  candles: Candle[];
  markers?: Marker[];
  title?: string;
}) {
  const normalized = candles
    .map((candle) => ({
      ts: candle.ts,
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every((value) => !Number.isNaN(value)));

  if (normalized.length < 2) {
    return <div className="empty">チャート表示には価格データが必要です。</div>;
  }

  const view = normalized.slice(-90);
  const width = 980;
  const height = 320;
  const padX = 28;
  const padY = 30;
  const chartWidth = width - padX * 2;
  const chartHeight = height - padY * 2;
  const max = Math.max(...view.map((candle) => candle.high));
  const min = Math.min(...view.map((candle) => candle.low));
  const step = chartWidth / view.length;
  const bodyWidth = Math.max(3, step * 0.58);
  const yFor = (price: number) => padY + ((max - price) / Math.max(max - min, 1)) * chartHeight;
  const markerMap = new Map(markers.map((marker) => [marker.ts.slice(0, 10), marker]));

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? "ローソク足チャート"}>
      {[0, 1, 2, 3].map((line) => {
        const y = padY + (chartHeight / 3) * line;
        return <line key={line} x1={padX} x2={width - padX} y1={y} y2={y} stroke="#e3e8ef" strokeWidth="1" />;
      })}
      {view.map((candle, index) => {
        const x = padX + index * step + step / 2;
        const openY = yFor(candle.open);
        const closeY = yFor(candle.close);
        const highY = yFor(candle.high);
        const lowY = yFor(candle.low);
        const up = candle.close >= candle.open;
        const color = up ? "#147a4a" : "#b42318";
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
        const marker = markerMap.get(candle.ts.slice(0, 10));
        return (
          <g key={`${candle.ts}-${index}`}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.5" />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} rx="1" />
            {marker ? (
              <circle
                cx={x}
                cy={Math.max(10, highY - 10)}
                r="5"
                fill={marker.tone === "bad" ? "#b42318" : marker.tone === "good" ? "#147a4a" : "#087f8c"}
              />
            ) : null}
          </g>
        );
      })}
      <text x="10" y="20" fill="#5d6b7a" fontSize="14">
        {title ? `${title} / ` : ""}高値 {formatNumber(max)} / 安値 {formatNumber(min)}
      </text>
    </svg>
  );
}
