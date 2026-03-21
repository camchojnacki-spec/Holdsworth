import { NextRequest, NextResponse } from "next/server";
import { db, correctionLog, notifications } from "@holdsworth/db";
import { sql, gt } from "drizzle-orm";

/**
 * POST /api/cron/correction-digest
 *
 * Weekly cron job that mines correction_log for systematic AI errors.
 * Surfaces top patterns as notifications for prompt engineering improvements.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.nextUrl.searchParams.get("secret");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query top correction patterns from the last 30 days
    const patterns = await db
      .select({
        fieldName: correctionLog.fieldName,
        aiOriginalValue: correctionLog.aiOriginalValue,
        userCorrectedValue: correctionLog.userCorrectedValue,
        frequency: sql<number>`COUNT(*)::int`,
      })
      .from(correctionLog)
      .where(gt(correctionLog.createdAt, thirtyDaysAgo))
      .groupBy(
        correctionLog.fieldName,
        correctionLog.aiOriginalValue,
        correctionLog.userCorrectedValue
      )
      .having(sql`COUNT(*) >= 2`)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(20);

    if (patterns.length > 0) {
      // Build summary message
      const topPatterns = patterns.slice(0, 10).map((p) =>
        `• ${p.fieldName}: "${p.aiOriginalValue}" → "${p.userCorrectedValue}" (${p.frequency}x)`
      ).join("\n");

      await db.insert(notifications).values({
        type: "system",
        title: "AI Correction Patterns (30-day digest)",
        message: `Top correction patterns:\n${topPatterns}`,
        metadata: { patterns, totalPatterns: patterns.length },
      });
    }

    // Also count total corrections and unique cards corrected
    const [stats] = await db
      .select({
        totalCorrections: sql<number>`COUNT(*)::int`,
        uniqueCards: sql<number>`COUNT(DISTINCT ${correctionLog.cardId})::int`,
      })
      .from(correctionLog)
      .where(gt(correctionLog.createdAt, thirtyDaysAgo));

    return NextResponse.json({
      ok: true,
      patternsFound: patterns.length,
      totalCorrections: stats?.totalCorrections ?? 0,
      uniqueCards: stats?.uniqueCards ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
