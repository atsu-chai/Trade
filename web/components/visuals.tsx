type Point = {
  label: string;
  value: number;
};

type Bar = Point & {
  color?: string;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

export function RingGauge({
  value,
  label,
  detail,
  color = "#087f8c",
}: {
  value: number;
  label: string;
  detail?: string;
  color?: string;
}) {
  const normalized = clamp(value);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - normalized / 100);
  return (
    <figure className="visual-card gauge-card">
      <svg viewBox="0 0 120 120" role="img" aria-label={`${label}: ${normalized.toFixed(0)}%`}>
        <circle className="gauge-track" cx="60" cy="60" r={radius} />
        <circle
          className="gauge-value"
          cx="60"
          cy="60"
          r={radius}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <text x="60" y="58" textAnchor="middle" className="gauge-number">
          {normalized.toFixed(0)}
        </text>
        <text x="60" y="75" textAnchor="middle" className="gauge-unit">
          /100
        </text>
      </svg>
      <figcaption>
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
      </figcaption>
    </figure>
  );
}

export function HorizontalBars({ bars }: { bars: Bar[] }) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  return (
    <div className="h-bars">
      {bars.map((bar) => (
        <div className="h-bar-row" key={bar.label}>
          <span>{bar.label}</span>
          <div className="h-bar-track">
            <i style={{ width: `${clamp((bar.value / max) * 100)}%`, background: bar.color ?? "var(--accent)" }} />
          </div>
          <b>{bar.value.toFixed(0)}</b>
        </div>
      ))}
    </div>
  );
}

export function MiniLineChart({ points, suffix = "" }: { points: Point[]; suffix?: string }) {
  const width = 520;
  const height = 180;
  const padding = 24;
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(max - min, 0.0001);
  const path = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const fillPath = `${path} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <figure className="line-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="推移グラフ">
        <path className="line-fill" d={fillPath} />
        <path className="line-path" d={path} />
        {points.map((point, index) => {
          const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
          const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
          return <circle key={point.label} cx={x} cy={y} r="4" />;
        })}
      </svg>
      <figcaption className="chart-caption">
        {points.map((point) => (
          <span key={point.label}>
            {point.label}: <b>{point.value.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}{suffix}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function SignalDonut({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  return (
    <figure className="donut-wrap">
      <svg viewBox="0 0 124 124" role="img" aria-label="シグナル構成">
        <circle className="gauge-track" cx="62" cy="62" r={radius} />
        {items.map((item) => {
          const ratio = total > 0 ? item.value / total : 0;
          const dash = ratio * circumference;
          const offset = -cursor * circumference;
          cursor += ratio;
          return (
            <circle
              key={item.label}
              className="donut-segment"
              cx="62"
              cy="62"
              r={radius}
              stroke={item.color}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
        <text x="62" y="64" textAnchor="middle" className="gauge-number">
          {total}
        </text>
        <text x="62" y="80" textAnchor="middle" className="gauge-unit">
          件
        </text>
      </svg>
      <figcaption className="donut-legend">
        {items.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} />
            {item.label} {item.value}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
