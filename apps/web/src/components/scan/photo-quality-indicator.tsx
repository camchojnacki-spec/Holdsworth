"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PhotoQualityResult } from "@/lib/photo-quality";

interface PhotoQualityIndicatorProps {
  result: PhotoQualityResult;
  className?: string;
}

function dotColor(score: number): string {
  if (score >= 70) return "bg-[var(--color-green)]";
  if (score >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function dotGlow(score: number): string {
  if (score >= 70) return "shadow-[0_0_6px_var(--color-green)]";
  if (score >= 45) return "shadow-[0_0_6px_theme(colors.amber.500)]";
  return "shadow-[0_0_6px_theme(colors.red.500)]";
}

function overallMessage(overall: PhotoQualityResult["overall"]): string {
  switch (overall) {
    case "good":
      return "Photo looks great";
    case "acceptable":
      return "Photo is acceptable";
    case "poor":
      return "Photo quality issues detected";
  }
}

function overallColor(overall: PhotoQualityResult["overall"]): string {
  switch (overall) {
    case "good":
      return "text-[var(--color-green-light)]";
    case "acceptable":
      return "text-amber-400";
    case "poor":
      return "text-red-400";
  }
}

export function PhotoQualityIndicator({
  result,
  className = "",
}: PhotoQualityIndicatorProps) {
  const [expanded, setExpanded] = useState(result.overall === "poor");

  const metrics = [
    { ...result.brightness, metricLabel: "Light" },
    { ...result.blur, metricLabel: "Focus" },
    { ...result.framing, metricLabel: "Frame" },
  ];

  return (
    <div className={`rounded-lg border border-border bg-card/60 px-4 py-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Quality dots */}
          <div className="flex items-center gap-1.5">
            {metrics.map((m) => (
              <div
                key={m.metricLabel}
                className={`w-2.5 h-2.5 rounded-full ${dotColor(m.score)} ${dotGlow(m.score)}`}
                title={`${m.metricLabel}: ${m.label} (${m.score})`}
              />
            ))}
          </div>
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className={`text-[11px] tracking-wider uppercase ${overallColor(result.overall)}`}
          >
            {overallMessage(result.overall)}
          </span>
        </div>

        {result.suggestions.length > 0 && result.overall !== "good" && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-white transition-colors p-1"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {expanded && result.overall !== "good" && (
        <div className="mt-3 space-y-2">
          {/* Metric details */}
          <div className="flex gap-4">
            {metrics.map((m) => (
              <div key={m.metricLabel} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-[9px] tracking-wider uppercase text-muted-foreground"
                  >
                    {m.metricLabel}
                  </span>
                  <span
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-[9px] tracking-wider uppercase text-muted-foreground"
                  >
                    {m.score}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      m.score >= 70
                        ? "bg-[var(--color-green)]"
                        : m.score >= 45
                        ? "bg-amber-500"
                        : "bg-red-500"
                    }`}
                    style={{ width: `${m.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          <ul className="space-y-1 pt-1">
            {result.suggestions
              .filter((s) => s !== "Looking good!")
              .map((suggestion) => (
                <li
                  key={suggestion}
                  className="text-xs text-muted-foreground flex items-start gap-2"
                >
                  <span className="text-[var(--color-burg-light)] mt-0.5">•</span>
                  {suggestion}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
