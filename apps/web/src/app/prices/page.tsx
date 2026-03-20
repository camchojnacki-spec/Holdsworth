import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, TrendingDown, Minus, BarChart3, Package, ArrowUpRight } from "lucide-react";
import { getPortfolioStats } from "@/actions/portfolio";
import { PortfolioValueChart } from "@/components/portfolio/value-chart";
import { SetCompletionTracker } from "@/components/portfolio/set-tracker";

export default async function PortfolioPage() {
  const stats = await getPortfolioStats();

  const hasValue = stats.totalValueUsd > 0;
  const gainIsPositive = stats.unrealizedGainCad >= 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
          Portfolio
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Collection value and market intelligence</p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-[var(--color-burg-light)]">
              ${stats.totalValueCad.toFixed(2)}
            </div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
              ~${stats.totalValueUsd.toFixed(2)} USD · {stats.pricedCards} of {stats.totalCards} priced
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {gainIsPositive ? "Unrealized Gain" : "Unrealized Loss"}
            </CardTitle>
            {gainIsPositive ? (
              <TrendingUp className="h-4 w-4 text-[var(--color-green-light)]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[var(--color-burg)]" />
            )}
          </CardHeader>
          <CardContent>
            <div
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-2xl font-medium ${gainIsPositive ? "text-[var(--color-green-light)]" : "text-[var(--color-burg)]"}`}
            >
              {gainIsPositive ? "+" : ""}{stats.unrealizedGainCad.toFixed(2)}
            </div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
              Cost basis: ${stats.totalCostCad.toFixed(2)} CAD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              {stats.byStatus.inCollection}
            </div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
              {stats.byStatus.forSale > 0 && `${stats.byStatus.forSale} for sale · `}
              {stats.byStatus.sold > 0 && `${stats.byStatus.sold} sold · `}
              {stats.totalCards} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Card Value</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              {stats.pricedCards > 0 ? `$${(stats.totalValueCad / stats.pricedCards).toFixed(2)}` : "--"}
            </div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
              CAD per card
            </p>
          </CardContent>
        </Card>
      </div>

      {/* B-007: Portfolio Value Chart */}
      <PortfolioValueChart />

      {/* B-009: Set Completion Tracker */}
      <SetCompletionTracker />

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top 5 Most Valuable */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
              Most Valuable
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topCards.length > 0 ? (
              <div className="space-y-3">
                {stats.topCards.map((card, i) => (
                  <Link
                    key={card.id}
                    href={`/cards/${card.id}`}
                    className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors group"
                  >
                    <span
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] text-muted-foreground w-4 text-right"
                    >
                      {i + 1}
                    </span>
                    {card.thumbnailUrl ? (
                      <img
                        src={card.thumbnailUrl}
                        alt={card.playerName}
                        className="w-8 h-11 rounded object-cover"
                      />
                    ) : (
                      <div className="w-8 h-11 rounded bg-secondary/30 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">
                        {card.playerName}
                      </p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                        {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                        {card.parallelVariant && ` · ${card.parallelVariant}`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)]">
                        ${card.valueUsd.toFixed(2)}
                      </p>
                      <TrendIndicator trend={card.trend} pct={card.trendPct} />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState message="No priced cards yet" sub="Scan cards to start tracking values" />
            )}
          </CardContent>
        </Card>

        {/* Biggest Movers */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
              Market Movers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.biggestMovers.length > 0 ? (
              <div className="space-y-3">
                {stats.biggestMovers.map((card) => (
                  <Link
                    key={card.id}
                    href={`/cards/${card.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">
                        {card.playerName}
                      </p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                        {card.setName ?? "Unknown set"} · ${card.valueUsd.toFixed(2)} USD
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <TrendIndicator trend={card.trend} pct={card.trendPct} large />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState message="No trend data yet" sub="Movers appear after a card is re-scouted" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Market Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">
              Recent Market Activity
            </CardTitle>
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
              Latest comps across your collection
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {stats.recentComps.length > 0 ? (
            <div className="space-y-2">
              {stats.recentComps.map((comp, i) => (
                <Link
                  key={i}
                  href={`/cards/${comp.cardId}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors group"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">
                      {comp.listingTitle
                        ? (comp.listingTitle.length > 70 ? comp.listingTitle.substring(0, 67) + "..." : comp.listingTitle)
                        : comp.playerName}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                      {comp.saleDate ? new Date(comp.saleDate).toLocaleDateString() : "recent"} · {comp.sourceName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)]">
                      ${parseFloat(comp.priceUsd).toFixed(2)}
                    </span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="No market activity" sub="Comp data appears as cards are priced" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Helpers ──

function TrendIndicator({ trend, pct, large }: { trend: string; pct: number; large?: boolean }) {
  if (pct === 0 || trend === "stable") {
    return (
      <span
        style={{ fontFamily: "var(--font-mono)" }}
        className={`flex items-center gap-0.5 text-muted-foreground ${large ? "text-xs" : "text-[9px]"}`}
      >
        <Minus className={large ? "h-3 w-3" : "h-2.5 w-2.5"} /> stable
      </span>
    );
  }

  const isUp = trend === "up";
  const color = isUp ? "text-[var(--color-green-light)]" : "text-[var(--color-burg)]";
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span
      style={{ fontFamily: "var(--font-mono)" }}
      className={`flex items-center gap-0.5 ${color} ${large ? "text-xs" : "text-[9px]"}`}
    >
      <Icon className={large ? "h-3 w-3" : "h-2.5 w-2.5"} />
      {isUp ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-center">
      <div>
        <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">{message}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </div>
    </div>
  );
}
