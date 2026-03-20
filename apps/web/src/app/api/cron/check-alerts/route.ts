import { NextRequest, NextResponse } from "next/server";
import { db, priceAlerts, priceEstimates, cards, players, sets, notifications } from "@holdsworth/db";
import { eq, and } from "drizzle-orm";

/**
 * POST /api/cron/check-alerts
 *
 * Triggered by an external scheduler (e.g. Google Cloud Scheduler).
 * Checks all active price alerts against current estimates and creates
 * notifications for any that trigger.
 *
 * Requires CRON_SECRET env var for authentication.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 }
    );
  }

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all active, non-triggered alerts with card info + current prices
    const activeAlerts = await db
      .select({
        id: priceAlerts.id,
        cardId: priceAlerts.cardId,
        alertType: priceAlerts.alertType,
        thresholdValue: priceAlerts.thresholdValue,
        thresholdCurrency: priceAlerts.thresholdCurrency,
        estimatedValueCad: priceEstimates.estimatedValueCad,
        estimatedValueUsd: priceEstimates.estimatedValueUsd,
        trendPercentage: priceEstimates.trendPercentage,
        playerName: players.name,
        year: cards.year,
        setName: sets.name,
        cardNumber: cards.cardNumber,
      })
      .from(priceAlerts)
      .innerJoin(cards, eq(priceAlerts.cardId, cards.id))
      .leftJoin(players, eq(cards.playerId, players.id))
      .leftJoin(sets, eq(cards.setId, sets.id))
      .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
      .where(and(eq(priceAlerts.active, true), eq(priceAlerts.triggered, false)));

    let triggeredCount = 0;
    const now = new Date();

    for (const alert of activeAlerts) {
      const threshold = parseFloat(alert.thresholdValue);
      const currentValue = alert.thresholdCurrency === "USD"
        ? parseFloat(alert.estimatedValueUsd ?? "0")
        : parseFloat(alert.estimatedValueCad ?? "0");

      let shouldTrigger = false;

      switch (alert.alertType) {
        case "above":
          shouldTrigger = currentValue >= threshold;
          break;
        case "below":
          shouldTrigger = currentValue > 0 && currentValue <= threshold;
          break;
        case "change_pct": {
          const pctChange = Math.abs(parseFloat(alert.trendPercentage ?? "0"));
          shouldTrigger = pctChange >= threshold;
          break;
        }
      }

      // Update lastCheckedAt for all alerts
      if (shouldTrigger) {
        await db
          .update(priceAlerts)
          .set({ triggered: true, triggeredAt: now, lastCheckedAt: now })
          .where(eq(priceAlerts.id, alert.id));

        // Build a human-readable card label
        const cardLabel = [alert.playerName, alert.year, alert.setName, alert.cardNumber ? `#${alert.cardNumber}` : null]
          .filter(Boolean)
          .join(" \u00B7 ");

        // Build notification message
        const currency = alert.thresholdCurrency;
        const formattedValue = `$${currentValue.toFixed(2)} ${currency}`;
        const formattedThreshold = `$${threshold.toFixed(2)} ${currency}`;

        let title: string;
        let message: string;

        switch (alert.alertType) {
          case "above":
            title = `Price above ${formattedThreshold}`;
            message = `${cardLabel} is now valued at ${formattedValue}, exceeding your threshold of ${formattedThreshold}.`;
            break;
          case "below":
            title = `Price below ${formattedThreshold}`;
            message = `${cardLabel} has dropped to ${formattedValue}, below your threshold of ${formattedThreshold}.`;
            break;
          case "change_pct":
            title = `Price changed ${Math.abs(parseFloat(alert.trendPercentage ?? "0")).toFixed(1)}%`;
            message = `${cardLabel} price has shifted by ${parseFloat(alert.trendPercentage ?? "0").toFixed(1)}%, exceeding your ${threshold}% threshold.`;
            break;
          default:
            title = "Price alert triggered";
            message = `${cardLabel} triggered a price alert.`;
        }

        // Create a notification
        await db.insert(notifications).values({
          type: "price_alert",
          title,
          message,
          cardId: alert.cardId,
          metadata: {
            alertId: alert.id,
            alertType: alert.alertType,
            threshold: alert.thresholdValue,
            currentValue: String(currentValue),
            currency,
          },
        });

        triggeredCount++;
      } else {
        await db
          .update(priceAlerts)
          .set({ lastCheckedAt: now })
          .where(eq(priceAlerts.id, alert.id));
      }
    }

    return NextResponse.json({
      ok: true,
      checked: activeAlerts.length,
      triggered: triggeredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/check-alerts] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
