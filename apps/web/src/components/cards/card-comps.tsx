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
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const startTime = Date.now();
    const timer = setInterval(() => {
      if (!cancelled) setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    async function fetchComps() {
      const timeout = setTimeout(() => {
        if (!cancelled) {
          setComps({
            success: false, query: "", sourceUrls: {}, listings: [], stats: null,
            estimatedValue: null, marketNotes: null, dataSources: [],
            error: "Market lookup timed out after 60 seconds. Try refreshing."
          });
          setLoading(false);
        }
      }, 60000);

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
        clearTimeout(timeout);
        if (!cancelled) setComps(result);
      } catch {
        clearTimeout(timeout);
        if (!cancelled) setComps({
          success: false, query: "", sourceUrls: {}, listings: [], stats: null,
          estimatedValue: null, marketNotes: null, dataSources: [], error: "Lookup failed"
        });
      } finally {
        clearInterval(timer);
        if (!cancelled) setLoading(false);
      }
    }

    fetchComps();
    return () => { cancelled = true; clearInterval(timer); };
  }, [card]);

  const hasRealData = comps?.dataSources?.some(s => !s.includes("AI Estimate"));
  const sourceLabel = hasRealData ? "Live Market Data" : "AI Estimated";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Market Comps</CardTitle>
          {!loading && (
            <span style={{ fontFamily: "var(--font-mono)" }} className={`text-[10px] tracking-wider uppercase ${hasRealData ? "text-[var(--color-green-light)]" : "text-muted-foreground"}`}>
              {sourceLabel}
            </span>
          )}
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
                Searching eBay sold · 130point · Aggregating comps
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground/50">
                {elapsed}s
              </p>
            </div>
          </div>
        ) : comps?.success && (comps.estimatedValue || comps.stats) ? (
          <div className="space-y-4">
            {/* Estimated value headline */}
            {comps.estimatedValue && (
              <div className="bg-secondary/30 rounded-lg p-4 text-center">
                <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                  {hasRealData ? "Fair Market Value" : "Estimated Market Value"}
                </label>
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
                <StatBox label="Avg Comp" value={`$${comps.stats.avgPrice.toFixed(2)}`} />
                <StatBox label="Median" value={`$${comps.stats.medianPrice.toFixed(2)}`} />
                <StatBox label="Low" value={`$${comps.stats.lowPrice.toFixed(2)}`} color="green" />
                <StatBox label="High" value={`$${comps.stats.highPrice.toFixed(2)}`} />
              </div>
            )}

            {/* Market notes */}
            {comps.marketNotes && (
              <p className="text-sm text-muted-foreground leading-relaxed">{comps.marketNotes}</p>
            )}

            {/* Source links */}
            {(comps.sourceUrls?.ebay || comps.sourceUrls?.oneThirtyPoint) && (
              <div className="flex flex-wrap gap-3 pt-1">
                {comps.sourceUrls.ebay && (
                  <a href={comps.sourceUrls.ebay} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-burg-light)] hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    View on eBay
                  </a>
                )}
                {comps.sourceUrls.oneThirtyPoint && (
                  <a href={comps.sourceUrls.oneThirtyPoint} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--color-burg-light)] hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    View on 130point
                  </a>
                )}
              </div>
            )}

            {/* Comparable sales with source links */}
            {comps.listings.length > 0 && (
              <>
                <div style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground pt-1">
                  {comps.listings.length} comparable sales
                </div>
                <div className="space-y-2">
                  {comps.listings.map((listing, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors"
                    >
                      <div className="min-w-0 flex-1 mr-3">
                        {listing.url ? (
                          <a href={listing.url} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-white truncate block hover:text-[var(--color-burg-light)] transition-colors">
                            {listing.title}
                            <ExternalLink className="inline h-3 w-3 ml-1.5 opacity-40" />
                          </a>
                        ) : (
                          <p className="text-sm text-white truncate">{listing.title}</p>
                        )}
                        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                          {listing.date || "no date"} · {listing.source}
                          {listing.shippingPrice !== undefined && listing.shippingPrice !== null && (
                            <span> · {listing.shippingPrice === 0 ? "free ship" : `+$${listing.shippingPrice.toFixed(2)} ship`}</span>
                          )}
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

            {/* Data sources footer */}
            <div className="pt-2 border-t border-border/50">
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                Sources: {comps.dataSources?.join(" · ") || "AI Estimate"}
                {comps.query && <span> · Search: &ldquo;{comps.query}&rdquo;</span>}
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Could not find comps for this card</p>
            {comps?.error && <p className="text-xs text-destructive mt-1">{comps.error}</p>}
            {comps?.query && (
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-2">
                Search: &ldquo;{comps.query}&rdquo;
              </p>
            )}
            {/* Still show source links so user can manually search */}
            {comps?.sourceUrls?.ebay && (
              <a href={comps.sourceUrls.ebay} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-burg-light)] hover:underline mt-3">
                <ExternalLink className="h-3 w-3" />
                Search eBay manually
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: "green" }) {
  return (
    <div className="bg-secondary/30 rounded-lg p-3">
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">{label}</label>
      <p style={{ fontFamily: "var(--font-mono)" }} className={`text-lg font-medium ${color === "green" ? "text-[var(--color-green-light)]" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}
