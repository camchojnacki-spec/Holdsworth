import Link from "next/link";
import { getAccuracyMetrics } from "@/actions/accuracy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "AI Accuracy | Holdsworth",
};

function AccuracyRing({ accuracy }: { accuracy: number }) {
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (accuracy / 100) * circumference;
  const color =
    accuracy >= 90
      ? "var(--color-green, #22c55e)"
      : accuracy >= 70
      ? "#eab308"
      : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          style={{ fontFamily: "var(--font-mono)", color }}
          className="text-3xl font-medium"
        >
          {accuracy.toFixed(1)}%
        </span>
        <span
          style={{ fontFamily: "var(--font-mono)" }}
          className="text-[10px] tracking-wider uppercase text-muted-foreground"
        >
          accuracy
        </span>
      </div>
    </div>
  );
}

function fieldLabel(fieldName: string): string {
  switch (fieldName) {
    case "playerName":
      return "Player";
    case "setName":
      return "Set";
    case "year":
      return "Year";
    case "cardNumber":
      return "Card #";
    case "parallelVariant":
    case "parallel":
      return "Parallel";
    default:
      return fieldName;
  }
}

function accuracyColor(accuracy: number): string {
  if (accuracy >= 90) return "text-[var(--color-green,#22c55e)]";
  if (accuracy >= 70) return "text-yellow-400";
  return "text-red-400";
}

function accuracyBgColor(accuracy: number): string {
  if (accuracy >= 90) return "bg-[var(--color-green,#22c55e)]/10";
  if (accuracy >= 70) return "bg-yellow-400/10";
  return "bg-red-400/10";
}

export default async function AccuracyPage() {
  const metrics = await getAccuracyMetrics();

  const fieldRows = [
    { key: "playerName" as const, label: "Player", data: metrics.fieldAccuracy.playerName },
    { key: "setName" as const, label: "Set", data: metrics.fieldAccuracy.setName },
    { key: "year" as const, label: "Year", data: metrics.fieldAccuracy.year },
    { key: "cardNumber" as const, label: "Card #", data: metrics.fieldAccuracy.cardNumber },
    { key: "parallel" as const, label: "Parallel", data: metrics.fieldAccuracy.parallel },
  ];

  const maxTrendCount = Math.max(1, ...metrics.correctionTrend.map((t) => t.count));

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl sm:text-3xl font-light tracking-wide text-white"
          >
            AI Accuracy
          </h1>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[11px] tracking-wider uppercase text-muted-foreground mt-1"
          >
            {metrics.totalScans} scans &middot; {metrics.totalCorrected} corrections &middot;{" "}
            {metrics.totalVerified} verified
          </p>
        </div>
      </div>

      {/* Top Row: Ring + Summary Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 flex items-center justify-center py-8">
          <AccuracyRing accuracy={metrics.overallAccuracy} />
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-[10px] tracking-wider uppercase text-muted-foreground"
                >
                  Total Scans
                </p>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-2xl font-medium text-white mt-1"
                >
                  {metrics.totalScans}
                </p>
              </div>
              <div>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-[10px] tracking-wider uppercase text-muted-foreground"
                >
                  Corrected
                </p>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-2xl font-medium text-white mt-1"
                >
                  {metrics.totalCorrected}
                </p>
              </div>
              <div>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-[10px] tracking-wider uppercase text-muted-foreground"
                >
                  Verified
                </p>
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-2xl font-medium text-white mt-1"
                >
                  {metrics.totalVerified}
                </p>
              </div>
            </div>
            {metrics.totalScans === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                No cards scanned yet. Scan some cards to start tracking AI accuracy.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Field-Level Accuracy */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle
            style={{ fontFamily: "var(--font-display)" }}
            className="text-base font-normal text-white"
          >
            Field-Level Accuracy
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-left text-[10px] tracking-wider uppercase text-muted-foreground py-2 pr-4"
                  >
                    Field
                  </th>
                  <th
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-right text-[10px] tracking-wider uppercase text-muted-foreground py-2 px-4"
                  >
                    Scans
                  </th>
                  <th
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-right text-[10px] tracking-wider uppercase text-muted-foreground py-2 px-4"
                  >
                    Corrections
                  </th>
                  <th
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-right text-[10px] tracking-wider uppercase text-muted-foreground py-2 pl-4"
                  >
                    Accuracy
                  </th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-b border-border/50 ${accuracyBgColor(row.data.accuracy)}`}
                  >
                    <td className="py-2.5 pr-4 text-white">{row.label}</td>
                    <td
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="py-2.5 px-4 text-right text-muted-foreground"
                    >
                      {row.data.total}
                    </td>
                    <td
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="py-2.5 px-4 text-right text-muted-foreground"
                    >
                      {row.data.corrected}
                    </td>
                    <td
                      style={{ fontFamily: "var(--font-mono)" }}
                      className={`py-2.5 pl-4 text-right font-medium ${accuracyColor(row.data.accuracy)}`}
                    >
                      {row.data.accuracy.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Correction Trend */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Correction Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Corrections per day over the last 30 days
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {metrics.correctionTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No corrections recorded yet.
              </p>
            ) : (
              <div className="flex items-end gap-1 h-32">
                {metrics.correctionTrend.map((day) => {
                  const heightPct = (day.count / maxTrendCount) * 100;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                    >
                      <div
                        className="w-full bg-[#8B2252] rounded-t transition-all hover:bg-[#a82d66] min-h-[2px]"
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="bg-popover border border-border rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                          <span style={{ fontFamily: "var(--font-mono)" }} className="text-white">
                            {day.count}
                          </span>
                          <span className="text-muted-foreground ml-1">{day.date}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Corrections */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Recent Corrections
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              What the AI got wrong and what you fixed
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {metrics.recentCorrections.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No corrections yet. The AI is either perfect or untested.
              </p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {metrics.recentCorrections.map((c, i) => (
                  <Link
                    key={`${c.cardId}-${c.fieldName}-${i}`}
                    href={`/cards/${c.cardId}`}
                    className="flex flex-col gap-0.5 rounded-lg p-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{c.playerName}</span>
                      <span
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[10px] text-muted-foreground"
                      >
                        {fieldLabel(c.fieldName)}
                      </span>
                    </div>
                    <div
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-xs flex items-center gap-2"
                    >
                      <span className="text-red-400 line-through truncate max-w-[40%]">
                        {c.aiValue || "(empty)"}
                      </span>
                      <span className="text-muted-foreground">&rarr;</span>
                      <span className="text-[var(--color-green,#22c55e)] truncate max-w-[40%]">
                        {c.correctedValue || "(empty)"}
                      </span>
                    </div>
                    <span
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] text-muted-foreground"
                    >
                      {formatTimeAgo(c.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
