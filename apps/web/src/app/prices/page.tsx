import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, BarChart3 } from "lucide-react";

export default function PricesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-light tracking-wide text-white">
          Comps
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Market comps and collection value</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-[var(--color-burg-light)]">
              $0.00 CAD
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Mover</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-lg text-muted-foreground">--</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sources</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div style={{ fontFamily: "var(--font-mono)" }} className="text-2xl font-medium text-white">0</div>
            <p className="text-xs text-muted-foreground">active scrapers</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-xl font-normal text-white">
            Value Over Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            <div className="text-center">
              <BarChart3 className="mx-auto h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm">No comp data</p>
              <p className="text-xs mt-1">Tracking begins when cards are added to your binder</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-xl font-normal text-white">
            Market Movers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">No trending data available</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
