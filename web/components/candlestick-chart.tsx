import { formatNumber } from "@/lib/ui";

type Candle = {
  ts: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
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
      volume: Number(candle.volume ?? 0),
    }))
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every((value) => !Number.isNaN(value)));

  if (normalized.length < 2) {
    return <div className="empty">チャート表示には価格データが必要です。</div>;
  }

  const view = normalized.slice(-90);
  const width = 1040;
  const height = 420;
  const padLeft = 58;
  const padRight = 24;
  const padTop = 34;
  const priceHeight = 270;
  const volumeTop = 326;
  const volumeHeight = 58;
  const axisY = 394;
  const chartWidth = width - padLeft - padRight;
  const max = Math.max(...view.map((candle) => candle.high));
  const min = Math.min(...view.map((candle) => candle.low));
  const maxVolume = Math.max(...view.map((candle) => candle.volume), 1);
  const last = view.at(-1);
  const isIntraday =
    view.length >= 2 &&
    new Date(view.at(-1)?.ts ?? 0).toDateString() === new Date(view.at(-2)?.ts ?? 0).toDateString();
  const step = chartWidth / view.length;
  const bodyWidth = Math.max(3, step * 0.58);
  const yFor = (price: number) => padTop + ((max - price) / Math.max(max - min, 1)) * priceHeight;
  const markerMap = new Map(markers.map((marker) => [marker.ts.slice(0, 10), marker]));
  const priceTicks = Array.from({ length: 5 }, (_, index) => max - ((max - min) / 4) * index);
  const dateIndexes = [0, Math.floor(view.length / 3), Math.floor((view.length / 3) * 2), view.length - 1].filter(
    (index, position, indexes) => index >= 0 && indexes.indexOf(index) === position,
  );
  const labelFor = (ts: string) => {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts.slice(5, 10);
    if (isIntraday) {
      return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
    }
    return new Intl.DateTimeFormat("ja-JP", { month: "2-digit", day: "2-digit" }).format(date);
  };

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? "ローソク足チャート"}>
      <rect x={padLeft} y={padTop} width={chartWidth} height={priceHeight} fill="#fbfdff" rx="6" />
      {priceTicks.map((price) => {
        const y = yFor(price);
        return (
          <g key={price}>
            <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#e3e8ef" strokeWidth="1" />
            <text x={padLeft - 8} y={y + 4} fill="#5d6b7a" fontSize="12" textAnchor="end">
              {formatNumber(price)}
            </text>
          </g>
        );
      })}
      {view.map((candle, index) => {
        const x = padLeft + index * step + step / 2;
        const openY = yFor(candle.open);
        const closeY = yFor(candle.close);
        const highY = yFor(candle.high);
        const lowY = yFor(candle.low);
        const up = candle.close >= candle.open;
        const color = up ? "#138a55" : "#c02a1d";
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
        const volumeBarHeight = Math.max(1, (candle.volume / maxVolume) * volumeHeight);
        const marker = markerMap.get(candle.ts.slice(0, 10));
        return (
          <g key={`${candle.ts}-${index}`}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.5" />
            <rect x={x - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} rx="1" />
            <rect
              x={x - bodyWidth / 2}
              y={volumeTop + volumeHeight - volumeBarHeight}
              width={bodyWidth}
              height={volumeBarHeight}
              fill={up ? "#9fd8bd" : "#efaaa4"}
              opacity="0.78"
              rx="1"
            />
            {marker ? (
              <circle
                cx={x}
                cy={Math.max(16, highY - 12)}
                r="6"
                stroke="#ffffff"
                strokeWidth="2"
                fill={marker.tone === "bad" ? "#b42318" : marker.tone === "good" ? "#147a4a" : "#087f8c"}
              />
            ) : null}
          </g>
        );
      })}
      {last ? (
        <g>
            <line x1={padLeft} x2={width - padRight} y1={yFor(last.close)} y2={yFor(last.close)} stroke="#087f8c" strokeDasharray="5 5" />
            <text x={width - padRight - 4} y={yFor(last.close) - 7} fill="#087f8c" fontSize="12" textAnchor="end">
            {isIntraday ? "最新価格" : "最新終値"} {formatNumber(last.close)}
          </text>
        </g>
      ) : null}
      <line x1={padLeft} x2={width - padRight} y1={axisY} y2={axisY} stroke="#cbd5df" />
      {dateIndexes.map((index) => {
        const candle = view[index];
        const x = padLeft + index * step + step / 2;
        return (
          <text key={`${candle.ts}-${index}`} x={x} y={axisY + 18} fill="#5d6b7a" fontSize="12" textAnchor="middle">
            {labelFor(candle.ts)}
          </text>
        );
      })}
      <text x={padLeft} y="22" fill="#15202b" fontSize="14" fontWeight="700">
        {title ?? "ローソク足チャート"}
      </text>
      <text x={width - padRight} y="22" fill="#5d6b7a" fontSize="13" textAnchor="end">
        高値 {formatNumber(max)} / 安値 {formatNumber(min)}
      </text>
      <text x={padLeft} y={volumeTop - 8} fill="#5d6b7a" fontSize="12">
        出来高
      </text>
    </svg>
  );
}
