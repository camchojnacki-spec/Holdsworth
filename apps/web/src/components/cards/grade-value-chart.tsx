"use client";

/**
 * Grade-vs-Value Bar Chart — shows estimated value at different PSA grade levels.
 *
 * Highlights the AI-predicted grade, overlays a grading cost line to show ROI.
 * Uses inline SVG with Holdsworth brand colors. No external chart library.
 */

export interface GradeValueChartProps {
  rawValue: number;
  psa8Value?: number;
  psa9Value?: number;
  psa10Value?: number;
  predictedGrade: number; // e.g., 8.5
  gradingCost: number;    // e.g., 25
  currency: "USD" | "CAD";
}

interface BarData {
  label: string;
  value: number;
  isPredicted: boolean;
  profitable: boolean; // value > rawValue + gradingCost
}

export function GradeValueChart({
  rawValue,
  psa8Value,
  psa9Value,
  psa10Value,
  predictedGrade,
  gradingCost,
  currency,
}: GradeValueChartProps) {
  const currencySymbol = currency === "CAD" ? "C$" : "$";

  // Determine which grade is closest to the predicted grade
  const predictedLabel = predictedGrade >= 9.5
    ? "PSA 10"
    : predictedGrade >= 8.5
      ? "PSA 9"
      : "PSA 8";

  const bars: BarData[] = [
    {
      label: "Raw",
      value: rawValue,
      isPredicted: false,
      profitable: false,
    },
  ];

  if (psa8Value != null && psa8Value > 0) {
    bars.push({
      label: "PSA 8",
      value: psa8Value,
      isPredicted: predictedLabel === "PSA 8",
      profitable: psa8Value > rawValue + gradingCost,
    });
  }
  if (psa9Value != null && psa9Value > 0) {
    bars.push({
      label: "PSA 9",
      value: psa9Value,
      isPredicted: predictedLabel === "PSA 9",
      profitable: psa9Value > rawValue + gradingCost,
    });
  }
  if (psa10Value != null && psa10Value > 0) {
    bars.push({
      label: "PSA 10",
      value: psa10Value,
      isPredicted: predictedLabel === "PSA 10",
      profitable: psa10Value > rawValue + gradingCost,
    });
  }

  // If we only have the raw value, nothing to show
  if (bars.length <= 1) return null;

  const maxValue = Math.max(...bars.map((b) => b.value), rawValue + gradingCost);

  // SVG layout constants
  const svgWidth = 320;
  const svgHeight = 180;
  const barAreaLeft = 50;
  const barAreaRight = svgWidth - 20;
  const barAreaTop = 20;
  const barAreaBottom = svgHeight - 30;
  const barAreaWidth = barAreaRight - barAreaLeft;
  const barAreaHeight = barAreaBottom - barAreaTop;
  const barGap = 8;
  const barWidth = (barAreaWidth - barGap * (bars.length - 1)) / bars.length;

  const costLineY = maxValue > 0
    ? barAreaBottom - ((rawValue + gradingCost) / maxValue) * barAreaHeight
    : barAreaBottom;

  return (
    <div className="w-full">
      <label
        style={{ fontFamily: "var(--font-mono)" }}
        className="text-[10px] tracking-wider uppercase text-muted-foreground mb-2 block"
      >
        Grade vs Value
      </label>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto" role="img" aria-label="Grade versus value bar chart">
        {/* Y-axis reference lines */}
        {[0.25, 0.5, 0.75, 1].map((frac) => {
          const y = barAreaBottom - frac * barAreaHeight;
          const val = frac * maxValue;
          return (
            <g key={frac}>
              <line
                x1={barAreaLeft}
                y1={y}
                x2={barAreaRight}
                y2={y}
                stroke="currentColor"
                strokeWidth={0.5}
                className="text-white/5"
              />
              <text
                x={barAreaLeft - 4}
                y={y + 3}
                textAnchor="end"
                fill="currentColor"
                fontSize="8"
                fontFamily="var(--font-mono)"
                className="text-white/30"
              >
                {currencySymbol}{Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {bars.map((bar, i) => {
          const barHeight = maxValue > 0 ? (bar.value / maxValue) * barAreaHeight : 0;
          const x = barAreaLeft + i * (barWidth + barGap);
          const y = barAreaBottom - barHeight;

          // Color: burgundy for raw/unprofitable, green for profitable graded
          let fillColor: string;
          if (bar.label === "Raw") {
            fillColor = "rgba(139, 34, 82, 0.6)";
          } else if (bar.profitable) {
            fillColor = "var(--color-green, #22c55e)";
          } else {
            fillColor = "rgba(139, 34, 82, 0.4)";
          }

          // Glow for predicted grade
          const glowFilter = bar.isPredicted ? "url(#predictedGlow)" : undefined;

          return (
            <g key={bar.label}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={fillColor}
                filter={glowFilter}
                opacity={bar.isPredicted ? 1 : 0.8}
              />

              {/* Predicted grade accent border */}
              {bar.isPredicted && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill="none"
                  stroke="var(--color-burg-light, #c4577a)"
                  strokeWidth={2}
                />
              )}

              {/* Value label on top of bar */}
              <text
                x={x + barWidth / 2}
                y={y - 5}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="500"
              >
                {currencySymbol}{Math.round(bar.value)}
              </text>

              {/* Bar label */}
              <text
                x={x + barWidth / 2}
                y={barAreaBottom + 14}
                textAnchor="middle"
                fill="currentColor"
                fontSize="9"
                fontFamily="var(--font-mono)"
                letterSpacing="0.03em"
                className={bar.isPredicted ? "text-white" : "text-white/50"}
              >
                {bar.label}
              </text>

              {/* Predicted indicator */}
              {bar.isPredicted && (
                <text
                  x={x + barWidth / 2}
                  y={barAreaBottom + 24}
                  textAnchor="middle"
                  fill="var(--color-burg-light, #c4577a)"
                  fontSize="7"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.05em"
                >
                  PREDICTED
                </text>
              )}
            </g>
          );
        })}

        {/* Grading cost threshold line */}
        <line
          x1={barAreaLeft}
          y1={costLineY}
          x2={barAreaRight}
          y2={costLineY}
          stroke="var(--color-burg-light, #c4577a)"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.7}
        />
        <text
          x={barAreaRight}
          y={costLineY - 4}
          textAnchor="end"
          fill="var(--color-burg-light, #c4577a)"
          fontSize="7"
          fontFamily="var(--font-mono)"
          letterSpacing="0.03em"
          opacity={0.8}
        >
          RAW + {currencySymbol}{gradingCost} COST
        </text>

        {/* SVG filter for predicted glow effect */}
        <defs>
          <filter id="predictedGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor="#8B2252" floodOpacity="0.4" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>
    </div>
  );
}
