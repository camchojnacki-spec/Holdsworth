"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [pollTrigger, setPollTrigger] = useState(0);

  const handleRescout = async () => {
    setRescouting(true);
    setComps(null);
    setJobStatus("pending");
    setLoading(true);
    await rescoutCard(cardId);
    setRescouting(false);
    // Bump trigger to restart polling useEffect
    setPollTrigger((t) => t + 1);
  };

  const fetchData = useCallback(async () => {
    const [compsData, statusData] = await Promise.all([
      getCardComps(cardId),
      getCardPricingStatus(cardId),
    ]);
    setComps(compsData);
    setJobStatus(statusData.status);
    setJobError(statusData.errorMessage);
    return { hasData: compsData.estimate !== null, isDone: statusData.status === "completed" || statusData.status === "failed" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, pollTrigger]);

  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function poll() {
      const { hasData, isDone } = await fetchData();
      if (hasData || isDone) {
        setLoading(false);
        if (pollInterval) clearInterval(pollInterval);
      }
    }

    poll();

    // Poll every 3 seconds while waiting
    pollInterval = setInterval(poll, 3000);

    // Stop after 2 minutes max
    const timeout = setTimeout(() => {
      if (pollInterval) clearInterval(pollInterval);
      setLoading(false);
    }, 120_000);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [fetchData]);

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

            {comps.history.length > 0 && (
              <>
                <div style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground pt-1">
                  {comps.history.length} comparable {comps.history.some(h => h.sourceName?.includes("Sold")) ? "sales" : "listings"}
                </div>
                <div className="space-y-2">
                  {comps.history.map((h, i) => (
                    <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                      <div className="min-w-0 flex-1 mr-3">
                        {h.listingUrl ? (
                          <a href={h.listingUrl} target="_blank" rel="noopener noreferrer"
                            className="text-sm text-white truncate block hover:text-[var(--color-burg-light)] transition-colors">
                            {h.sourceName} listing
                            <ExternalLink className="inline h-3 w-3 ml-1.5 opacity-40" />
                          </a>
                        ) : (
                          <p className="text-sm text-white">{h.sourceName} listing</p>
                        )}
                        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground">
                          {h.saleDate ? new Date(h.saleDate).toLocaleDateString() : "active"} · {h.sourceName}
                        </p>
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)" }} className="text-sm font-medium text-[var(--color-burg-light)] flex-shrink-0">
                        ${parseFloat(h.priceUsd).toFixed(2)}
                      </span>
                    </div>
                  ))}
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
              onClick={async () => {
                setJobStatus("pending");
                setLoading(true);
                // Re-trigger by directly calling the server action
                const { getCardPricingStatus: refresh } = await import("@/actions/cards");
                // The retry will be handled by the engine on next poll
              }}
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
