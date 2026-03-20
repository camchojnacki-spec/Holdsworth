"use client";

interface DistributionTier {
  tier: string;
  count: number;
  totalValue: number;
}

export function ValueDistributionChart({ data }: { data: DistributionTier[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const totalCards = data.reduce((sum, d) => sum + d.count, 0);

  if (totalCards === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No priced cards yet.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {data.map((tier) => {
        const pct = (tier.count / maxCount) * 100;
        const valuePct = totalCards > 0 ? Math.round((tier.count / totalCards) * 100) : 0;
        return (
          <div key={tier.tier} className="flex items-center gap-3">
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[11px] text-muted-foreground w-14 text-right shrink-0"
            >
              {tier.tier}
            </span>
            <div className="flex-1 h-5 bg-secondary/30 rounded-sm overflow-hidden relative">
              <div
                className="h-full rounded-sm transition-all duration-500"
                style={{
                  width: `${Math.max(pct, tier.count > 0 ? 2 : 0)}%`,
                  background: "linear-gradient(90deg, var(--color-burg) 0%, var(--color-burg-light) 100%)",
                }}
              />
              {tier.count > 0 && (
                <span
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="absolute inset-y-0 left-2 flex items-center text-[10px] text-white/80"
                >
                  {tier.count}
                </span>
              )}
            </div>
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="text-[10px] text-muted-foreground w-8 shrink-0"
            >
              {valuePct}%
            </span>
          </div>
        );
      })}
      <div className="pt-1 border-t border-border">
        <div className="flex justify-between">
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] text-muted-foreground"
          >
            {totalCards} cards priced
          </span>
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-[10px] text-muted-foreground"
          >
            ${data.reduce((sum, d) => sum + d.totalValue, 0).toFixed(2)} total
          </span>
        </div>
      </div>
    </div>
  );
}
