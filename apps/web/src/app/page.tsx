import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, ScanLine, DollarSign, TrendingUp, TrendingDown, Plus, ArrowUpRight } from "lucide-react";
import { getDashboardStats, getCards } from "@/actions/cards";
import { getPortfolioStats } from "@/actions/portfolio";

export default async function DashboardPage() {
  const [stats, portfolio, { cards: recentCards }] = await Promise.all([
    getDashboardStats(),
    getPortfolioStats(),
    getCards(),
  ]);

  const gainPositive = portfolio.unrealizedGainCad >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
            Home
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Your binder at a glance</p>
        </div>
        <div className="flex gap-2">
          <Link href="/scan">
            <Button variant="outline" className="gap-2">
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
          </Link>
          <Link href="/cards/new">
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Catalogue
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Binder</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              {stats.totalCards ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">cards in collection</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Portfolio Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-[var(--color-burg-light)]">
              ${portfolio.totalValueCad.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              ~${portfolio.totalValueUsd.toFixed(2)} USD
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {gainPositive ? "Gain" : "Loss"}
            </CardTitle>
            {gainPositive ? (
              <TrendingUp className="h-4 w-4 text-[var(--color-green-light)]" />
            ) : (
              <TrendingDown className="h-4 w-4 text-[var(--color-burg)]" />
            )}
          </CardHeader>
          <CardContent>
            <div
              style={{ fontFamily: "var(--font-mono)" }}
              className={`text-2xl font-medium ${gainPositive ? "text-[var(--color-green-light)]" : "text-[var(--color-burg)]"}`}
            >
              {gainPositive ? "+" : ""}{portfolio.unrealizedGainCad.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              vs ${portfolio.totalCostCad.toFixed(2)} cost basis
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Priced</CardTitle>
            <ScanLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              {portfolio.pricedCards}
            </div>
            <p className="text-xs text-muted-foreground">
              of {stats.totalCards} cards valued
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-xl font-normal text-white">
              Recent Pulls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCards.length > 0 ? (
              <div className="space-y-3">
                {recentCards.slice(0, 5).map((card) => (
                  <Link key={card.id} href={`/cards/${card.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/20 transition-colors group">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white group-hover:text-[var(--color-burg-light)] transition-colors">{card.playerName ?? "Unknown Player"}</p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                        {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {card.estimatedValueUsd && (
                        <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-[var(--color-burg-light)]">
                          ${parseFloat(card.estimatedValueUsd).toFixed(2)}
                        </span>
                      )}
                      {card.parallelVariant && (
                        <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">{card.parallelVariant}</span>
                      )}
                    </div>
                  </Link>
                ))}
                <Link href="/cards" className="block text-center">
                  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-[var(--color-burg-light)]">
                    View all <ArrowUpRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <Library className="mx-auto h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Your binder is empty</p>
                  <p className="text-xs mt-1">Pull your first card to begin</p>
                  <Link href="/scan">
                    <Button size="sm" className="mt-4 gap-2">
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-xl font-normal text-white">
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
          <CardContent>
            {portfolio.topCards.length > 0 ? (
              <div className="space-y-3">
                {portfolio.topCards.slice(0, 5).map((card, i) => (
                  <Link key={card.id} href={`/cards/${card.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-secondary/20 transition-colors group">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground w-3 text-right">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate group-hover:text-[var(--color-burg-light)] transition-colors">{card.playerName}</p>
                        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                          {[card.year, card.setName].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)] flex-shrink-0">
                      ${card.valueUsd.toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="mx-auto h-10 w-10 mb-3 opacity-30" />
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
