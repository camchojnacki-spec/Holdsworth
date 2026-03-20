import { NextResponse } from "next/server";
import { db, cards } from "@holdsworth/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    // Quick DB ping
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(cards);

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      db: "connected",
      cards: result?.count ?? 0,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        db: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
