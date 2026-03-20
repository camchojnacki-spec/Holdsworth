import { NextRequest, NextResponse } from "next/server";
import { takePortfolioSnapshot } from "@/actions/portfolio";

/**
 * POST /api/cron/portfolio-snapshot
 *
 * Triggered by an external scheduler (e.g. Google Cloud Scheduler).
 * Takes a daily portfolio snapshot capturing total value, card count, etc.
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
    const result = await takePortfolioSnapshot();

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Snapshot failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      snapshot: result.snapshot,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/portfolio-snapshot] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
