"use client";

interface DataPoint {
  date: string;
  valueCad: number;
}

export function PortfolioSparkline({ data }: { data: DataPoint[] }) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.valueCad);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const width = 600;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((d.valueCad - minVal) / range) * chartHeight;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`;

  const isUp = values[values.length - 1] >= values[0];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? "var(--color-green)" : "#ef4444"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isUp ? "var(--color-green)" : "#ef4444"} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill="url(#sparklineGrad)" />
      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={isUp ? "var(--color-green)" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dots at endpoints */}
      <circle cx={points[0].x} cy={points[0].y} r="3" fill={isUp ? "var(--color-green)" : "#ef4444"} />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill={isUp ? "var(--color-green)" : "#ef4444"}
      />
      {/* Date labels */}
      <text
        x={points[0].x}
        y={height - 4}
        textAnchor="start"
        fill="currentColor"
        className="text-muted-foreground"
        style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}
      >
        {data[0].date}
      </text>
      <text
        x={points[points.length - 1].x}
        y={height - 4}
        textAnchor="end"
        fill="currentColor"
        className="text-muted-foreground"
        style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}
      >
        {data[data.length - 1].date}
      </text>
      {/* Value labels */}
      <text
        x={points[0].x + 8}
        y={points[0].y - 6}
        textAnchor="start"
        fill="currentColor"
        className="text-muted-foreground"
        style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}
      >
        ${data[0].valueCad.toFixed(0)}
      </text>
      <text
        x={points[points.length - 1].x - 8}
        y={points[points.length - 1].y - 6}
        textAnchor="end"
        fill={isUp ? "var(--color-green)" : "#ef4444"}
        style={{ fontSize: "9px", fontFamily: "var(--font-mono)" }}
      >
        ${data[data.length - 1].valueCad.toFixed(0)}
      </text>
    </svg>
  );
}
