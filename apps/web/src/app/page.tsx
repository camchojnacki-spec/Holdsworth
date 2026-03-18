import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Library, ScanLine, DollarSign, TrendingUp, Plus } from "lucide-react";
import { getDashboardStats, getCards } from "@/actions/cards";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const recentCards = await getCards();
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
            <p className="text-xs text-muted-foreground">cards in binder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Binder Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-[var(--color-burg-light)]">
              ${(stats.totalValue ?? 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">estimated CAD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scanned</CardTitle>
            <ScanLine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              {recentCards.length}
            </div>
            <p className="text-xs text-muted-foreground">total in library</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alerts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">
              0
            </div>
            <p className="text-xs text-muted-foreground">unread</p>
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
                  <Link key={card.id} href={`/cards/${card.id}`} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-primary/[0.03] transition-colors">
                    <div>
                      <p className="text-sm text-white">{card.playerName ?? "Unknown Player"}</p>
                      <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                        {[card.year, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {card.parallelVariant && (
                      <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-[var(--color-burg-light)]">{card.parallelVariant}</span>
                    )}
                  </Link>
                ))}
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
            <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-xl font-normal text-white">
              Market Comps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <div className="text-center">
                <TrendingUp className="mx-auto h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No comp data</p>
                <p className="text-xs mt-1">Comps begin tracking with your first card</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
