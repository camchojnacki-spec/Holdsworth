"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, Trash2, TrendingUp, TrendingDown, Percent } from "lucide-react";
import { deletePriceAlert, togglePriceAlert, type PriceAlertWithCard } from "@/actions/price-alerts";
import { useRouter } from "next/navigation";

function AlertTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "above":
      return <TrendingUp className="h-4 w-4 text-green-400" />;
    case "below":
      return <TrendingDown className="h-4 w-4 text-red-400" />;
    case "change_pct":
      return <Percent className="h-4 w-4 text-amber-400" />;
    default:
      return null;
  }
}

function alertTypeLabel(type: string): string {
  switch (type) {
    case "above": return "Price goes above";
    case "below": return "Price drops below";
    case "change_pct": return "Changes by";
    default: return type;
  }
}

function StatusBadge({ active, triggered }: { active: boolean; triggered: boolean }) {
  if (triggered) {
    return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Triggered</Badge>;
  }
  if (active) {
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
  }
  return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Paused</Badge>;
}

export function AlertsList({ alerts }: { alerts: PriceAlertWithCard[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleToggle(alertId: string) {
    startTransition(async () => {
      await togglePriceAlert(alertId);
      router.refresh();
    });
  }

  function handleDelete(alertId: string) {
    startTransition(async () => {
      await deletePriceAlert(alertId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const currentValue = alert.thresholdCurrency === "USD"
          ? alert.estimatedValueUsd
          : alert.estimatedValueCad;
        const displayValue = currentValue ? parseFloat(currentValue).toFixed(2) : null;

        return (
          <Card key={alert.id} className={`transition-opacity ${isPending ? "opacity-60" : ""}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="mt-1 shrink-0">
                    <AlertTypeIcon type={alert.alertType} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-white font-medium truncate">
                      {alert.playerName ?? "Unknown Player"}
                    </p>
                    <p
                      style={{ fontFamily: "var(--font-mono)" }}
                      className="text-[10px] tracking-wider uppercase text-muted-foreground"
                    >
                      {[alert.year, alert.setName, alert.cardNumber ? `#${alert.cardNumber}` : null]
                        .filter(Boolean)
                        .join(" \u00B7 ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                      <span
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-xs text-muted-foreground"
                      >
                        {alertTypeLabel(alert.alertType)}{" "}
                        <span className="text-white">
                          {alert.alertType === "change_pct"
                            ? `${alert.thresholdValue}%`
                            : `$${parseFloat(alert.thresholdValue).toFixed(2)} ${alert.thresholdCurrency}`}
                        </span>
                      </span>
                      {displayValue && (
                        <span
                          style={{ fontFamily: "var(--font-mono)" }}
                          className="text-xs text-muted-foreground"
                        >
                          Current:{" "}
                          <span className="text-white">
                            ${displayValue} {alert.thresholdCurrency}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge active={alert.active} triggered={alert.triggered} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={isPending}
                    onClick={() => handleToggle(alert.id)}
                    title={alert.active ? "Pause alert" : "Resume alert"}
                  >
                    {alert.active ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(alert.id)}
                    title="Delete alert"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
