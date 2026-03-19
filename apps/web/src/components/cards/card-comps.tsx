"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RotateCcw } from "lucide-react";
import { getCardComps, getCardPricingStatus, rescoutCard, type CachedComps } from "@/actions/cards";

interface CardCompsProps {
  cardId: string;
}

type JobStatus = "none" | "pending" | "running" | "completed" | "failed";

export function CardComps({ cardId }: CardCompsProps) {
  const [comps, setComps] = useState<CachedComps | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("none");
  const [jobError, setJobError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rescouting, setRescouting] = useState(false);
  const pollRef = useRef(0);

  const handleRescout = async () => {
    setRescouting(true);
    setComps(null);
    setJobStatus("pending");
    setJobError(null);
    setLoading(true);
    await rescoutCard(cardId);
    setRescouting(false);
    // Bump poll generation to restart the polling loop
    pollRef.current += 1;
    startPolling(pollRef.current);
  };

  function startPolling(generation: number) {
    let stopped = false;

    async function poll() {
      if (stopped || pollRef.current !== generation) return;

      const [compsData, statusData] = await Promise.all([
        getCardComps(cardId),
        getCardPricingStatus(cardId),
      ]);

      // Stale generation — a newer rescout happened
      if (stopped || pollRef.current !== generation) return;

      setComps(compsData);
      setJobStatus(statusData.status);
      setJobError(statusData.errorMessage);

      const hasData = compsData.estimate !== null;
      const isDone = statusData.status === "completed" || statusData.status === "failed";

      if (hasData || isDone) {
        setLoading(false);
        return; // Stop polling
      }

      // Continue polling
      setTimeout(poll, 3000);
    }

    poll();

    // Safety timeout: stop after 2 minutes
    const timeout = setTimeout(() => {
      stopped = true;
      setLoading(false);
    }, 120_000);

    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }

  // Initial poll on mount
  useEffect(() => {
    const cleanup = startPolling(pollRef.current);
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const hasData = comps?.estimate !== null;
  const isRealData = comps?.estimate && comps.estimate.confidence !== "low";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Market Comps</CardTitle>
          <div className="flex items-center gap-3">
            {hasData && (
              <span style={{ fontFamily: "var(--font-mono)" }} className={`text-[10px] tracking-wider uppercase ${isRealData ? "text-[var(--color-green-light)]" : "text-muted-foreground"}`}>
                {isRealData ? `${comps!.estimate!.sampleSize} comps` : "AI Estimated"}
              </span>
            )}
            {(hasData || jobStatus === "completed" || jobStatus === "failed" || jobStatus === "none") && !rescouting && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRescout}
                className="gap-1.5 text-muted-foreground hover:text-[var(--color-burg-light)] h-7 px-2"
              >
                <RotateCcw className="h-3 w-3" />
                <span style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase">Re-scout</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {hasData && comps?.estimate ? (
          <div className="space-y-4">
            <div className="bg-secondary/30 rounded-lg p-4 text-center">
              <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                {isRealData ? "Fair Market Value" : "Estimated Value"}
              </label>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl font-medium text-[var(--color-burg-light)] mt-1">
                ${comps.estimate.valueUsd.toFixed(2)}
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
                ~${comps.estimate.valueCad.toFixed(2)} CAD
              </p>
            </div>

            {/* Price History Bar Chart */}
            {comps.history.length > 1 && (
              <PriceBarChart
                history={comps.history.filter(h => h.saleDate && parseFloat(h.priceUsd) > 0)}
                estimateUsd={comps.estimate.valueUsd}
              />
            )}

            {comps.history.length > 0 && (
              <>
                <div style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground pt-1">
                  {comps.history.length} comparable {comps.history.some(h => h.sourceName === "130point") ? "sales" : "listings"}
                </div>
                <div className="space-y-2">
                  {comps.history.map((h, i) => {
                    const displayTitle = h.listingTitle
                      ? (h.listingTitle.length > 65 ? h.listingTitle.substring(0, 62) + "..." : h.listingTitle)
                      : `${h.sourceName} listing`;
                    const hasLink = !!h.listingUrl;
                    const is130point = h.sourceName === "130point";

                    return (
                      <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                        <div className="min-w-0 flex-1 mr-3">
                          {hasLink ? (
                            <a href={h.listingUrl!} target="_blank" rel="noopener noreferrer"
                              className="text-sm text-white truncate block hover:text-[var(--color-burg-light)] transition-colors">
                              {displayTitle}
                              <ExternalLink className="inline h-3 w-3 ml-1.5 opacity-40" />
                            </a>
                          ) : (
                            <p className="text-sm text-white truncate">{displayTitle}</p>
                          )}
                          <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                            {h.saleDate ? new Date(h.saleDate).toLocaleDateString() : "active"}
                            {" · "}
                            {is130point ? (
                              <a href="https://130point.com/sales/" target="_blank" rel="noopener noreferrer"
                                className="hover:text-[var(--color-burg-light)] transition-colors underline decoration-dotted underline-offset-2">
                                130point
                              </a>
                            ) : (
                              h.sourceName
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {h.matchScore != null && (
                            <span
                              style={{ fontFamily: "var(--font-mono)" }}
                              className={`text-[9px] px-1.5 py-0.5 rounded ${
                                h.matchScore >= 80
                                  ? "bg-[var(--color-green)]/20 text-[var(--color-green-light)]"
                                  : "bg-secondary/30 text-muted-foreground"
                              }`}
                            >
                              {h.matchScore}%
                            </span>
                          )}
                          <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)]">
                            ${parseFloat(h.priceUsd).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground pt-1">
              Last updated: {new Date(comps.estimate.lastUpdated).toLocaleDateString()}
            </p>
          </div>
        ) : jobStatus === "pending" || jobStatus === "running" ? (
          <div className="py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-48 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="absolute h-full w-1/3 rounded-full"
                  style={{ background: "var(--color-burg)", animation: "scanSweep 2s cubic-bezier(0.16, 1, 0.3, 1) infinite" }}
                />
              </div>
              <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
                {jobStatus === "pending" ? "Queued for pricing engine" : "Scouting the market"}
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                {jobStatus === "pending"
                  ? "Waiting for engine to pick up job"
                  : "Searching eBay sold · 130point · Aggregating comps"}
              </p>
            </div>
          </div>
        ) : jobStatus === "failed" ? (
          <div className="py-8 text-center">
            <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
              Pricing lookup failed
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {jobError || "The pricing engine encountered an error"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-2"
              onClick={handleRescout}
              disabled={rescouting}
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="py-8 text-center">
            <p style={{ fontFamily: "var(--font-display)" }} className="text-base font-light text-white">
              No comps available
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {loading ? "Checking pricing engine..." : "No pricing job found for this card"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Price Trend Bar Chart ──

interface PriceBarChartProps {
  history: Array<{
    priceUsd: string;
    priceCad: string;
    saleDate: Date | null;
    listingUrl: string | null;
    sourceName: string;
  }>;
  estimateUsd: number;
}

function PriceBarChart({ history, estimateUsd }: PriceBarChartProps) {
  if (history.length < 2) return null;

  // Sort by date ascending
  const sorted = [...history]
    .filter(h => h.saleDate)
    .sort((a, b) => new Date(a.saleDate!).getTime() - new Date(b.saleDate!).getTime());

  if (sorted.length < 2) return null;

  const prices = sorted.map(h => parseFloat(h.priceUsd));
  const maxPrice = Math.max(...prices, estimateUsd);
  const minPrice = Math.min(...prices);
  const range = maxPrice - minPrice || 1;

  // Bar width based on count
  const barCount = sorted.length;

  return (
    <div className="space-y-2">
      <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
        Price Trend
      </label>
      <div className="relative bg-secondary/20 rounded-lg p-3 pb-6">
        {/* Estimate line */}
        <div
          className="absolute left-3 right-3 border-t border-dashed opacity-30"
          style={{
            borderColor: "var(--color-burg-light)",
            bottom: `${((estimateUsd - minPrice) / range) * 80 + 16}%`,
          }}
        />

        {/* Bars */}
        <div className="flex items-end gap-[2px] h-24" style={{ justifyContent: barCount <= 8 ? "center" : "flex-start" }}>
          {sorted.map((h, i) => {
            const price = parseFloat(h.priceUsd);
            const heightPct = ((price - minPrice) / range) * 80 + 20; // min 20% height
            const isAboveEstimate = price > estimateUsd * 1.15;
            const isBelowEstimate = price < estimateUsd * 0.85;

            return (
              <div
                key={i}
                className="group relative flex-1 min-w-[6px] max-w-[24px] rounded-t transition-colors"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: isAboveEstimate
                    ? "var(--color-green)"
                    : isBelowEstimate
                    ? "var(--color-burg)"
                    : "var(--color-burg-light)",
                  opacity: 0.8,
                }}
              >
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-white">
                      ${price.toFixed(2)}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
                      {new Date(h.saleDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis date labels */}
        <div className="flex justify-between mt-1">
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
            {new Date(sorted[0].saleDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
          <span style={{ fontFamily: "var(--font-mono)" }} className="text-[9px] text-muted-foreground">
            {new Date(sorted[sorted.length - 1].saleDate!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    </div>
  );
}
