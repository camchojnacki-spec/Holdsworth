"use client";

/**
 * Grading Radar Chart — 6-axis spider/radar chart for card condition scores.
 *
 * Axes: Centering, Corners, Edges, Surface, Print Quality, Eye Appeal
 * Uses inline SVG with Holdsworth brand colors. No external chart library.
 */

interface GradingRadarChartProps {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  printQuality: number;
  eyeAppeal: number;
}

const AXES = [
  { key: "centering", label: "Centering" },
  { key: "corners", label: "Corners" },
  { key: "edges", label: "Edges" },
  { key: "surface", label: "Surface" },
  { key: "printQuality", label: "Print" },
  { key: "eyeAppeal", label: "Eye Appeal" },
] as const;

const GRID_LEVELS = [2, 4, 6, 8, 10];
const NUM_AXES = 6;
const CENTER = 130; // SVG center point
const RADIUS = 100; // Max radius for score of 10

/** Convert a score (0-10) and axis index to SVG x,y coordinates. */
function polarToXY(axisIndex: number, score: number): { x: number; y: number } {
  const angle = (Math.PI * 2 * axisIndex) / NUM_AXES - Math.PI / 2; // Start from top
  const r = (score / 10) * RADIUS;
  return {
    x: CENTER + r * Math.cos(angle),
    y: CENTER + r * Math.sin(angle),
  };
}

/** Build an SVG polygon points string for a set of scores. */
function buildPolygonPoints(scores: number[]): string {
  return scores
    .map((score, i) => {
      const { x, y } = polarToXY(i, score);
      return `${x},${y}`;
    })
    .join(" ");
}

/** Build a hexagonal grid ring at a given score level. */
function buildGridRing(level: number): string {
  return Array.from({ length: NUM_AXES }, (_, i) => {
    const { x, y } = polarToXY(i, level);
    return `${x},${y}`;
  }).join(" ");
}

export function GradingRadarChart({
  centering,
  corners,
  edges,
  surface,
  printQuality,
  eyeAppeal,
}: GradingRadarChartProps) {
  const scores = [centering, corners, edges, surface, printQuality, eyeAppeal];

  return (
    <div className="w-full max-w-[280px] mx-auto">
      <svg viewBox="0 0 260 260" className="w-full h-auto" role="img" aria-label="Grading radar chart">
        {/* Grid rings */}
        {GRID_LEVELS.map((level) => (
          <polygon
            key={level}
            points={buildGridRing(level)}
            fill="none"
            stroke="currentColor"
            strokeWidth={level === 10 ? 1 : 0.5}
            className="text-white/10"
          />
        ))}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const { x, y } = polarToXY(i, 10);
          return (
            <line
              key={i}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.5}
              className="text-white/10"
            />
          );
        })}

        {/* Score polygon — filled area */}
        <polygon
          points={buildPolygonPoints(scores)}
          fill="rgba(139, 34, 82, 0.25)"
          stroke="#8B2252"
          strokeWidth={2}
        />

        {/* Score dots and values */}
        {scores.map((score, i) => {
          const { x, y } = polarToXY(i, score);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3} fill="#8B2252" stroke="#fff" strokeWidth={1} />
              <text
                x={x}
                y={y - 8}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontFamily="var(--font-mono)"
                fontWeight="500"
              >
                {score}
              </text>
            </g>
          );
        })}

        {/* Axis labels */}
        {AXES.map((axis, i) => {
          const { x, y } = polarToXY(i, 12.2);
          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
              fontSize="9"
              fontFamily="var(--font-mono)"
              letterSpacing="0.05em"
              className="text-white/50 uppercase"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
