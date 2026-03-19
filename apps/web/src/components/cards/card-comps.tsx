import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { getCardComps } from "@/actions/cards";

interface CardCompsProps {
  cardId: string;
}

export async function CardComps({ cardId }: CardCompsProps) {
  const comps = await getCardComps(cardId);
  const hasData = comps.estimate !== null;
  const isRealData = comps.estimate && comps.estimate.confidence !== "low";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle style={{ fontFamily: "var(--font-display)" }} className="text-lg font-normal text-white">Market Comps</CardTitle>
          {hasData && (
            <span style={{ fontFamily: "var(--font-mono)" }} className={`text-[10px] tracking-wider uppercase ${isRealData ? "text-[var(--color-green-light)]" : "text-muted-foreground"}`}>
              {isRealData ? `${comps.estimate!.sampleSize} comps` : "AI Estimated"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-4">
            <div className="bg-secondary/30 rounded-lg p-4 text-center">
              <label style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground">
                {isRealData ? "Fair Market Value" : "Estimated Value"}
              </label>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-3xl font-medium text-[var(--color-burg-light)] mt-1">
                ${comps.estimate!.valueUsd.toFixed(2)}
              </p>
              <p style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] text-muted-foreground mt-1">
                ~${comps.estimate!.valueCad.toFixed(2)} CAD
              </p>
            </div>

            {comps.history.length > 0 && (
              <>
                <div style={{ fontFamily: "var(--font-mono)" }} className="text-[10px] tracking-wider uppercase text-muted-foreground pt-1">
                  {comps.history.length} comparable sales
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
                          {h.saleDate ? new Date(h.saleDate).toLocaleDateString() : "no date"} · {h.sourceName}
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
              Last updated: {comps.estimate!.lastUpdated.toLocaleDateString()}
            </p>
          </div>
        ) : (
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
                Pricing runs in the background after cataloguing
              </p>
              <p className="text-xs text-muted-foreground mt-1">Refresh in a few moments to see results</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
