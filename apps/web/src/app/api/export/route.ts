import { NextRequest, NextResponse } from "next/server";
import { db, cards, players, sets, manufacturers, cardPhotos, priceEstimates } from "@holdsworth/db";
import { eq, desc, ilike, and, or } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const search = searchParams.get("search") || undefined;
  const year = searchParams.get("year") || undefined;
  const status = searchParams.get("status") || undefined;
  const format = searchParams.get("format") || "csv";

  // Build conditions (mirrors getCards logic)
  const conditions = [];
  if (status) conditions.push(eq(cards.status, status));
  if (year) {
    const yearNum = parseInt(year);
    if (!isNaN(yearNum)) conditions.push(eq(cards.year, yearNum));
  }
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(players.name, term),
        ilike(sets.name, term),
        ilike(cards.cardNumber, term)
      )
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      playerName: players.name,
      playerTeam: players.team,
      year: cards.year,
      setName: sets.name,
      manufacturer: manufacturers.name,
      cardNumber: cards.cardNumber,
      parallelVariant: cards.parallelVariant,
      isRookieCard: cards.isRookieCard,
      isAutograph: cards.isAutograph,
      condition: cards.condition,
      graded: cards.graded,
      gradingCompany: cards.gradingCompany,
      grade: cards.grade,
      status: cards.status,
      purchasePrice: cards.purchasePrice,
      purchaseCurrency: cards.purchaseCurrency,
      purchaseDate: cards.purchaseDate,
      purchaseSource: cards.purchaseSource,
      salePrice: cards.salePrice,
      saleCurrency: cards.saleCurrency,
      saleDate: cards.saleDate,
      salePlatform: cards.salePlatform,
      estimatedValueUsd: priceEstimates.estimatedValueUsd,
      estimatedValueCad: priceEstimates.estimatedValueCad,
      notes: cards.notes,
      createdAt: cards.createdAt,
    })
    .from(cards)
    .leftJoin(players, eq(cards.playerId, players.id))
    .leftJoin(sets, eq(cards.setId, sets.id))
    .leftJoin(manufacturers, eq(sets.manufacturerId, manufacturers.id))
    .leftJoin(priceEstimates, eq(priceEstimates.cardId, cards.id))
    .where(whereClause)
    .orderBy(desc(cards.createdAt));

  if (format === "json") {
    return NextResponse.json(rows, {
      headers: {
        "Content-Disposition": `attachment; filename="holdsworth-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  }

  // CSV
  const headers = [
    "Player", "Team", "Year", "Set", "Manufacturer", "Card #", "Parallel",
    "Rookie", "Auto", "Condition", "Graded", "Grading Co", "Grade",
    "Status", "Purchase Price", "Currency", "Purchase Date", "Source",
    "Sale Price", "Sale Currency", "Sale Date", "Sale Platform",
    "Est Value USD", "Est Value CAD", "Notes", "Date Added",
  ];

  const csvRows = rows.map(r => [
    esc(r.playerName),
    esc(r.playerTeam),
    r.year ?? "",
    esc(r.setName),
    esc(r.manufacturer),
    esc(r.cardNumber),
    esc(r.parallelVariant),
    r.isRookieCard ? "Yes" : "No",
    r.isAutograph ? "Yes" : "No",
    esc(r.condition),
    r.graded ? "Yes" : "No",
    esc(r.gradingCompany),
    esc(r.grade),
    r.status ?? "in_collection",
    r.purchasePrice ?? "",
    r.purchaseCurrency ?? "CAD",
    r.purchaseDate ? new Date(r.purchaseDate).toISOString().slice(0, 10) : "",
    esc(r.purchaseSource),
    r.salePrice ?? "",
    r.saleCurrency ?? "",
    r.saleDate ? new Date(r.saleDate).toISOString().slice(0, 10) : "",
    esc(r.salePlatform),
    r.estimatedValueUsd ?? "",
    r.estimatedValueCad ?? "",
    esc(r.notes),
    r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
  ]);

  const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="holdsworth-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function esc(val: string | null | undefined): string {
  if (!val) return "";
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}
