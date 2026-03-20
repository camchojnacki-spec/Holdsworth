"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPortfolioHistory, type SnapshotData } from "@/actions/portfolio-snapshots";

interface ValueChartProps {
  className?: string;
}

export function PortfolioValueChart({ className }: ValueChartProps) {
  const [data, setData] = useState<SnapshotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<30 | 90 | 365>(90);

  useEffect(() => {
    setLoading(true);
    getPortfolioHistory(range).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [range]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground animate-pulse">
              Loading chart...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length < 2) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
            Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center">
            <div className="text-center">
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                Building history
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Chart appears after 2+ days of data. Check back tomorrow.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const values = data.map((d) => d.totalValueCad);
  const costValues = data.map((d) => d.totalCostCad);
  const maxVal = Math.max(...values, ...costValues, 1);
  const minVal = Math.min(...values.filter(v => v > 0), ...costValues.filter(v => v > 0), 0);
  const valueRange = maxVal - minVal || 1;

  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePct = first > 0 ? ((change / first) * 100).toFixed(1) : "0";
  const isUp = change >= 0;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
              Portfolio Value
            </CardTitle>
            <div className="flex items-center gap-2 mt-0.5">
              <span style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-[var(--color-burg-light)]">
                ${last.toFixed(2)}
              </span>
              <span style={{ fontFamily: "var(--font-mono)" }} className={`text-xs ${isUp ? "text-[var(--color-green-light)]" : "text-[var(--color-burg)]"}`}>
                {isUp ? "+" : ""}{change.toFixed(2)} ({changePct}%)
              </span>
            </div>
          </div>
          <div className="flex gap-1">
            {([30, 90, 365] as const).map((d) => (
              <Button
                key={d}
                variant={range === d ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => setRange(d)}
              >
                {d === 365 ? "1Y" : `${d}D`}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* SVG Area Chart */}
        <div className="relative h-48">
          <svg
            viewBox={`0 0 ${data.length - 1} 100`}
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Cost basis line (dashed) */}
            <polyline
              fill="none"
              stroke="var(--color-burg)"
              strokeWidth="0.8"
              strokeDasharray="2,2"
              strokeOpacity="0.4"
              points={costValues
                .map((v, i) => `${i},${100 - ((v - minVal) / valueRange) * 90}`)
                .join(" ")}
            />

            {/* Value area fill */}
            <polygon
              fill="url(#valueGradient)"
              opacity="0.3"
              points={[
                `0,100`,
                ...values.map((v, i) => `${i},${100 - ((v - minVal) / valueRange) * 90}`),
                `${data.length - 1},100`,
              ].join(" ")}
            />

            {/* Value line */}
            <polyline
              fill="none"
              stroke={isUp ? "var(--color-green)" : "var(--color-burg)"}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={values
                .map((v, i) => `${i},${100 - ((v - minVal) / valueRange) * 90}`)
                .join(" ")}
            />

            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isUp ? "var(--color-green)" : "var(--color-burg)"} stopOpacity="0.6" />
                <stop offset="100%" stopColor={isUp ? "var(--color-green)" : "var(--color-burg)"} stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>

          {/* Date labels */}
          <div className="flex justify-between mt-1">
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
              {new Date(data[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
              {new Date(data[data.length - 1].date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[2px] rounded" style={{ backgroundColor: isUp ? "var(--color-green)" : "var(--color-burg)" }} />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">Market Value (CAD)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[2px] rounded border-t border-dashed" style={{ borderColor: "var(--color-burg)" }} />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">Cost Basis</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
