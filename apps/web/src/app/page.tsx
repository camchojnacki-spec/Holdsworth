import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Library, ScanLine, DollarSign, TrendingUp, TrendingDown, Plus, ArrowUpRight, Minus } from "lucide-react";
import { getDashboardStats, getCards } from "@/actions/cards";
import { getPortfolioStats } from "@/actions/portfolio";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

export default async function DashboardPage() {
  const [stats, portfolio, { cards: recentCards }] = await Promise.all([
    getDashboardStats(),
    getPortfolioStats(),
    getCards(),
  ]);

  const gainPositive = portfolio.unrealizedGainCad >= 0;
  const isEmpty = stats.totalCards === 0;

  return (
    <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
      {/* Header — compact on mobile */}
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-2xl sm:text-3xl font-light tracking-wide text-white">
            Home
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 sm:mt-1">Your binder at a glance</p>
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <Link href="/scan">
            <Button variant="outline" size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3">
              <ScanLine className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Scan</span>
            </Button>
          </Link>
          <Link href="/cards/new">
            <Button size="sm" className="gap-1.5 h-8 sm:h-9 px-2.5 sm:px-3">
              <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Catalogue</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Onboarding flow for new users */}
      {isEmpty && <WelcomeFlow />}

      {/* Stats grid — 2 cols mobile, 4 cols desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Binder</CardTitle>
            <Library className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-xl sm:text-2xl font-medium text-white">
              {stats.totalCards ?? 0}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">cards in collection</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Portfolio</CardTitle>
            <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-xl sm:text-2xl font-medium text-[var(--color-burg-light)]">
              ${portfolio.totalValueCad.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              ~${portfolio.totalValueUsd.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
              {gainPositive ? "Gain" : "Loss"}
            </CardTitle>
            {gainPositive ? (
              <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-green-light)]" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[var(--color-burg)]" />
            )}
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-xl sm:text-2xl font-medium ${gainPositive ? "text-[var(--color-green-light)]" : "text-[var(--color-burg)]"}`}
            >
              {gainPositive ? "+" : ""}{portfolio.unrealizedGainCad.toFixed(2)}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              vs ${portfolio.totalCostCad.toFixed(2)} cost basis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Priced</CardTitle>
            <ScanLine className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-xl sm:text-2xl font-medium text-white">
              {portfolio.pricedCards}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              of {stats.totalCards} cards valued
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Pulls + Top Holdings — responsive detail levels */}
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg sm:text-xl font-normal text-white">
              Recent Pulls
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {recentCards.length > 0 ? (
              <div className="space-y-1 sm:space-y-2">
                {recentCards.slice(0, 5).map((card) => (
                  <Link key={card.id} href={`/cards/${card.id}`} className="flex items-center gap-3 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg hover:bg-secondary/20 transition-colors group">
                    {/* Thumbnail — only on lg+ */}
                    {card.originalUrl && (
                      <div className="hidden lg:block w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-secondary/30">
                        <img src={card.originalUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white group-hover:text-[var(--color-burg-light)] transition-colors truncate">
                        {card.playerName ?? "Unknown Player"}
                      </p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground truncate">
                        {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                      {/* Parallel badge — md+ only */}
                      {card.parallelVariant && (
                        <span style={{ fontFamily: "var(--font-mono)" }} className="hidden md:inline text-[10px] text-muted-foreground max-w-[80px] truncate">
                          {card.parallelVariant}
                        </span>
                      )}
                      {/* Badges — lg+ only */}
                      <div className="hidden lg:flex gap-1">
                        {card.isRookieCard && <Badge variant="default" className="text-[9px] h-4 px-1">RC</Badge>}
                        {card.isAutograph && <Badge variant="default" className="text-[9px] h-4 px-1">Auto</Badge>}
                      </div>
                      {card.estimatedValueCad ? (
                        <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs sm:text-sm text-[var(--color-burg-light)]">
                          ${parseFloat(card.estimatedValueCad).toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-muted-foreground/50">--</span>
                      )}
                    </div>
                  </Link>
                ))}
                <Link href="/cards" className="block text-center pt-1">
                  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-[var(--color-burg-light)]">
                    View all <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 sm:py-8 text-muted-foreground">
                <div className="text-center">
                  <Library className="mx-auto h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 opacity-30" />
                  <p className="text-sm">Your binder is empty</p>
                  <p className="text-xs mt-1">Pull your first card to begin</p>
                  <Link href="/scan">
                    <Button size="sm" className="mt-3 sm:mt-4 gap-2">
                      <ScanLine className="h-3 w-3" />
                      Pull Card
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
            <div className="flex items-center justify-between">
              <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg sm:text-xl font-normal text-white">
                Top Holdings
              </CardTitle>
              <Link href="/prices">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-[var(--color-burg-light)] h-7 px-2">
                  <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase">Portfolio</span>
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            {portfolio.topCards.length > 0 ? (
              <div className="space-y-1 sm:space-y-2">
                {portfolio.topCards.slice(0, 5).map((card, i) => (
                  <Link key={card.id} href={`/cards/${card.id}`} className="flex items-center gap-2 sm:gap-3 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg hover:bg-secondary/20 transition-colors group">
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground w-3 text-right flex-shrink-0">{i + 1}</span>
                    {/* Thumbnail — lg+ only */}
                    {card.thumbnailUrl && (
                      <div className="hidden lg:block w-8 h-11 rounded overflow-hidden flex-shrink-0 bg-secondary/30">
                        <img src={card.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">
                        {card.playerName}
                      </p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground truncate">
                        {[card.year, card.setName].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {/* Trend indicator — md+ only */}
                    <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                      {card.trend === "up" && <TrendingUp className="h-3 w-3 text-[var(--color-green-light)]" />}
                      {card.trend === "down" && <TrendingDown className="h-3 w-3 text-[var(--color-burg)]" />}
                      {card.trend === "stable" && <Minus className="h-3 w-3 text-muted-foreground" />}
                      {card.trendPct != null && Math.abs(card.trendPct) > 0 && (
                        <span style={{ fontFamily: "var(--font-mono)" }} className={`text-[10px] ${card.trend === "up" ? "text-[var(--color-green-light)]" : card.trend === "down" ? "text-[var(--color-burg)]" : "text-muted-foreground"}`}>
                          {card.trendPct > 0 ? "+" : ""}{card.trendPct.toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs sm:text-sm font-medium text-[var(--color-burg-light)] flex-shrink-0">
                      ${card.valueCad.toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-6 sm:py-8 text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="mx-auto h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 opacity-30" />
                  <p className="text-sm">No comp data</p>
                  <p className="text-xs mt-1">Values populate as cards are priced</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
