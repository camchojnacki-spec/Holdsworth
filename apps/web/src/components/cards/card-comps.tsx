"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        if (!cancelled) setComps({ success: false, query: "", listings: [], stats: null, estimatedValue: null, marketNotes: null, error: "Lookup failed" });
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
            AI Estimated
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8">
            <div className="flex flex-col items-center gap-4">
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
                Searching comps · Estimating value
              </p>
            </div>
          </div>
        ) : comps?.success && (comps.estimatedValue || comps.stats) ? (
          <div className="space-y-4">
            {/* Estimated value headline */}
            {comps.estimatedValue && (
              <div className="bg-secondary/30 rounded-lg p-4 text-center">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Estimated Market Value</label>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl font-medium text-[var(--color-burg-light)] mt-1">
                  ${comps.estimatedValue.mid.toFixed(2)}
                </p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-muted-foreground mt-1">
                  ${comps.estimatedValue.low.toFixed(2)} — ${comps.estimatedValue.high.toFixed(2)} {comps.estimatedValue.currency}
                </p>
                <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-0.5">
                  ~${(comps.estimatedValue.mid * 1.38).toFixed(2)} CAD
                </p>
              </div>
            )}

            {/* Price summary grid */}
            {comps.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-secondary/30 rounded-lg p-3">
                  <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">Avg Comp</label>
                  <p style={{ fontFamily: "var(--font-mono)" }} className="text-lg font-medium text-white">
                    ${comps.stats.avgPrice.toFixed(2)}
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
            )}

            {/* Market notes */}
            {comps.marketNotes && (
              <p className="text-sm text-muted-foreground leading-relaxed">{comps.marketNotes}</p>
            )}

            {/* Comparable sales */}
            {comps.listings.length > 0 && (
              <>
                <div style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground pt-1">
                  {comps.listings.length} comparable sales
                </div>
                <div className="space-y-2">
                  {comps.listings.map((listing, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10"
                    >
                      <div className="min-w-0 flex-1 mr-3">
                        <p className="text-sm text-white truncate">{listing.title}</p>
                        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                          {listing.date} · {listing.source}
                        </p>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)] flex-shrink-0">
                        ${listing.price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground pt-1">
              Powered by AI market analysis · Prices are estimates based on recent comparable sales
            </p>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Could not estimate value for this card</p>
            {comps?.error && <p className="text-xs text-destructive mt-1">{comps.error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
