import { NextResponse } from "next/server";
import { db, cards } from "@holdsworth/db";
import { count, isNull } from "drizzle-orm";

export async function GET() {
  try {
    const [result] = await db
      .select({ total: count() })
      .from(cards)
      .where(isNull(cards.deletedAt));

    return NextResponse.json({ total: result.total, cards: [] });
  } catch {
    return NextResponse.json({ total: 0, cards: [] }, { status: 500 });
  }
}
