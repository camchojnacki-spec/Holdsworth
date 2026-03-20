import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getDashboardData } from "@/actions/dashboard";
import { getAccuracyMetrics } from "@/actions/accuracy";
import { TrendingUp, TrendingDown, Minus, ArrowRight, BrainCircuit } from "lucide-react";
import { SnapshotButton } from "@/components/dashboard/snapshot-button";
import { ValueDistributionChart } from "@/components/dashboard/value-distribution-chart";
import { PortfolioSparkline } from "@/components/dashboard/portfolio-sparkline";

export const metadata = {
  title: "Dashboard | Holdsworth",
};

export default async function DashboardPage() {
  const [data, accuracy] = await Promise.all([
    getDashboardData(),
    getAccuracyMetrics(),
  ]);

  const pricedPct = data.cardCount > 0
    ? Math.round((data.pricedCount / data.cardCount) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-2 sm:px-0">
      {/* Portfolio Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1
            style={{ fontFamily: "var(--font-display)" }}
            className="text-2xl sm:text-3xl font-light tracking-wide text-white"
          >
            Portfolio Dashboard
          </h1>
          <p
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[11px] tracking-wider uppercase text-muted-foreground mt-1"
          >
            {data.cardCount} cards &middot; {pricedPct}% priced
          </p>
        </div>
        <SnapshotButton />
      </div>

      {/* Value Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Collection Value
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xl sm:text-2xl font-medium text-white mt-1"
            >
              ${data.totalValueCad.toFixed(2)}
              <span className="text-xs text-muted-foreground ml-1">CAD</span>
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xs text-muted-foreground"
            >
              ${data.totalValueUsd.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Total Cost
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xl sm:text-2xl font-medium text-white mt-1"
            >
              ${data.totalCost.toFixed(2)}
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xs text-muted-foreground"
            >
              cost basis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Trend
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              {data.valueTrend.direction === "up" && (
                <TrendingUp className="h-5 w-5 text-[var(--color-green)]" />
              )}
              {data.valueTrend.direction === "down" && (
                <TrendingDown className="h-5 w-5 text-red-400" />
              )}
              {data.valueTrend.direction === "stable" && (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className={`text-xl sm:text-2xl font-medium ${
                  data.valueTrend.direction === "up"
                    ? "text-[var(--color-green)]"
                    : data.valueTrend.direction === "down"
                    ? "text-red-400"
                    : "text-white"
                }`}
              >
                {data.valueTrend.percentage > 0 ? "+" : ""}
                {data.valueTrend.percentage}%
              </p>
            </div>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xs text-muted-foreground"
            >
              vs last snapshot
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] tracking-wider uppercase text-muted-foreground"
            >
              Cards
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xl sm:text-2xl font-medium text-white mt-1"
            >
              {data.cardCount}
            </p>
            <p
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-xs text-muted-foreground"
            >
              {data.pricedCount} priced
            </p>
          </CardContent>
        </Card>
      </div>

      {/* AI Accuracy Link */}
      <Link href="/dashboard/accuracy" className="block group">
        <Card className="hover:border-[#8B2252]/50 transition-colors">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#8B2252]/20 shrink-0">
              <BrainCircuit className="h-5 w-5 text-[#8B2252]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">AI Accuracy</p>
                <span
                  style={{ fontFamily: "var(--font-mono)" }}
                  className={`text-lg font-medium ${
                    accuracy.overallAccuracy >= 90
                      ? "text-[var(--color-green,#22c55e)]"
                      : accuracy.overallAccuracy >= 70
                      ? "text-yellow-400"
                      : "text-red-400"
                  }`}
                >
                  {accuracy.overallAccuracy.toFixed(1)}%
                </span>
              </div>
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] text-muted-foreground"
              >
                Based on {accuracy.totalScans} scans, {accuracy.totalCorrected} corrections
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-[#8B2252] transition-colors shrink-0" />
          </CardContent>
        </Card>
      </Link>

      {/* Portfolio Sparkline */}
      {data.portfolioHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Portfolio Value Over Time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <PortfolioSparkline data={data.portfolioHistory} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Cards */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Top 10 Most Valuable
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {data.topCards.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No priced cards yet. Scan some cards to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {data.topCards.map((card, i) => (
                  <Link
                    key={card.id}
                    href={`/cards/${card.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors group"
                  >
                    <span
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-xs text-muted-foreground w-5 text-right shrink-0"
                    >
                      {i + 1}
                    </span>
                    <div className="w-8 h-10 rounded bg-secondary/40 overflow-hidden shrink-0">
                      {(card.thumbnailUrl || card.originalUrl) && (
                        <img
                          src={card.thumbnailUrl || card.originalUrl || ""}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {card.playerName ?? "Unknown"}
                      </p>
                      <p
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[10px] text-muted-foreground truncate"
                      >
                        {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-sm text-[var(--color-green)] shrink-0"
                    >
                      ${parseFloat(card.estimatedValueCad ?? "0").toFixed(2)}
                    </span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Value Distribution */}
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Value Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ValueDistributionChart data={data.valueDistribution} />
          </CardContent>
        </Card>
      </div>

      {/* Grading Candidates */}
      {data.gradingCandidates.length > 0 && (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle
              style={{ fontFamily: "var(--font-display)" }}
              className="text-base font-normal text-white"
            >
              Grading Candidates
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cards where professional grading is projected to increase value
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {data.gradingCandidates.map((card) => (
                <Link
                  key={card.id}
                  href={`/cards/${card.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">
                      {card.playerName ?? "Unknown"}
                    </p>
                    <p
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] text-muted-foreground"
                    >
                      {card.year} {card.setName} &middot; Predicted PSA {card.predictedGrade}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-sm text-[var(--color-green)]"
                    >
                      +${card.netBenefit.toFixed(2)}
                    </p>
                    <p
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] text-muted-foreground"
                    >
                      ${card.rawEstimateUsd.toFixed(0)} raw → ${card.gradedEstimateUsd.toFixed(0)} graded
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    -${card.gradingCostUsd} fee
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle
            style={{ fontFamily: "var(--font-display)" }}
            className="text-base font-normal text-white"
          >
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No activity yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recentActivity.map((card) => {
                const isNew =
                  Math.abs(card.createdAt.getTime() - card.updatedAt.getTime()) < 60_000;
                return (
                  <Link
                    key={card.id}
                    href={`/cards/${card.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg p-2 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {card.playerName ?? "Unknown"}
                      </p>
                      <p
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[10px] text-muted-foreground"
                      >
                        {[card.year, card.setName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant={isNew ? "default" : "secondary"} className="text-[10px]">
                        {isNew ? "Added" : "Updated"}
                      </Badge>
                      <p
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[10px] text-muted-foreground mt-0.5"
                      >
                        {formatTimeAgo(card.updatedAt)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
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
