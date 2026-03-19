"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { lookupCardPrice, type PriceLookupResult } from "@/actions/prices";

interface CardCompsProps {
  card: {
    playerName: string;
    year?: number | null;
    setName?: string | null;
    cardNumber?: string | null;
    parallelVariant?: string | null;
    manufacturerName?: string | null;
    graded?: boolean | null;
    gradingCompany?: string | null;
    grade?: string | null;
  };
}

export function CardComps({ card }: CardCompsProps) {
  const [comps, setComps] = useState<PriceLookupResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchComps() {
      try {
        const result = await lookupCardPrice({
          playerName: card.playerName,
          year: card.year,
          setName: card.setName,
          cardNumber: card.cardNumber,
          parallelVariant: card.parallelVariant,
          manufacturer: card.manufacturerName,
          graded: card.graded ?? false,
          gradingCompany: card.gradingCompany,
          grade: card.grade,
        });
        if (!cancelled) setComps(result);
      } catch {
        if (!cancelled) setComps({ success: false, query: "", listings: [], stats: null, error: "Lookup failed" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchComps();
    return () => { cancelled = true; };
  }, [card]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Market Comps</CardTitle>
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
            eBay Sold
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8">
            <div className="flex flex-col items-center gap-4">
              {/* Scanning animation */}
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="absolute h-full w-1/3 rounded-full"
                  style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
                />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                Scouting the market
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                Searching sold listings · Calculating comps
              </p>
            </div>
          </div>
        ) : comps?.success && comps.stats ? (
          <div className="space-y-4">
            {/* Price summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-secondary/30 rounded-lg p-3">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Avg Price</label>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-lg font-medium text-[var(--color-burg-light)]">
                  ${comps.stats.avgPrice.toFixed(2)}
                </p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                  ~${comps.stats.avgPriceCad.toFixed(2)} CAD
                </p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Median</label>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-lg font-medium text-white">
                  ${comps.stats.medianPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Low</label>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-lg font-medium text-[var(--color-green-light)]">
                  ${comps.stats.lowPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-3">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">High</label>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-lg font-medium text-white">
                  ${comps.stats.highPrice.toFixed(2)}
                </p>
              </div>
            </div>

            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
              {comps.stats.count} sold listings found
            </p>

            {/* Recent sold listings */}
            <div className="space-y-2">
              {comps.listings.slice(0, 8).map((listing, i) => (
                <a
                  key={i}
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-primary/[0.03] transition-colors group"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm text-white truncate">{listing.title}</p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                      {listing.dateSold}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)]">
                      ${listing.price.toFixed(2)}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </a>
              ))}
            </div>

            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground pt-1">
              Search: &quot;{comps.query}&quot;
            </p>
          </div>
        ) : comps?.success && !comps.stats ? (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No sold listings found for this card</p>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
              Search: &quot;{comps?.query}&quot;
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Could not reach the market</p>
            {comps?.error && <p className="text-xs text-destructive mt-1">{comps.error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
