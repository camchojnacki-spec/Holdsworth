/**
 * Build optimized search queries for a card.
 * Returns multiple query variants ordered from most specific to broadest.
 *
 * Strategy:
 * - Most specific query first (card number + set + player + parallel)
 * - Progressively broader fallbacks
 * - For parallels, always include the variant name in at least one query
 * - For autographs, always tag "auto" or "autograph"
 * - When reference data is available, generate much more precise queries
 */
export function buildSearchQueries(card: {
  playerName: string;
  year?: number;
  setName?: string;
  manufacturer?: string;
  cardNumber?: string;
  parallelVariant?: string;
  isAutograph?: boolean;
  subsetOrInsert?: string;
  graded?: boolean;
  gradingCompany?: string;
  grade?: string;
  // Reference data when available (from reference DB)
  referenceCardId?: string;
  confirmedSetProduct?: string;  // exact set product name from reference DB
  confirmedParallel?: { name: string; printRun: number | null; colorFamily?: string | null };
}): string[] {
  const queries: string[] = [];

  // Remove accents for search compatibility
  const playerName = card.playerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const autoTag = card.isAutograph ? "autograph" : "";
  const insertName = card.subsetOrInsert || "";

  // For specific parallels, include variant name in queries
  const parallelTag = card.parallelVariant &&
    !["base", "base card"].includes(card.parallelVariant.toLowerCase())
    ? card.parallelVariant
    : "";

  // Grade tag for graded cards
  const gradeTag = card.graded && card.gradingCompany
    ? `${card.gradingCompany} ${card.grade || ""}`.trim()
    : "";

  // ── Reference-enhanced queries (when we have confirmed data) ──
  if (card.confirmedSetProduct) {
    const setProduct = card.confirmedSetProduct;
    const cardNum = card.cardNumber ? `#${card.cardNumber}` : "";

    // Build parallel tag with print run when available
    const refParallelTag = card.confirmedParallel
      ? buildParallelTag(card.confirmedParallel)
      : parallelTag;

    // Query 1 (most specific): Year + Set Product + Card# + Player + Parallel /printRun + auto
    // e.g. "2025 Topps Series 1 #65 Gunnar Henderson Gold /2025"
    if (cardNum) {
      queries.push(
        [card.year, setProduct, cardNum, playerName, autoTag, refParallelTag]
          .filter(Boolean).join(" ")
      );
    }

    // Query 2: Year + Set Product + Player + Parallel /printRun (no card#)
    // e.g. "2025 Topps Series 1 Gunnar Henderson Gold /2025"
    queries.push(
      [card.year, setProduct, playerName, autoTag, refParallelTag]
        .filter(Boolean).join(" ")
    );

    // Query 3: Year + Set Product + Player + Parallel (no print run)
    // e.g. "2025 Topps Series 1 Gunnar Henderson Gold"
    const parallelNameOnly = card.confirmedParallel?.name || parallelTag;
    if (parallelNameOnly && parallelNameOnly !== refParallelTag) {
      queries.push(
        [card.year, setProduct, playerName, autoTag, parallelNameOnly]
          .filter(Boolean).join(" ")
      );
    }

    // Query 4: Year + Set Product + Player (no parallel — for base comps)
    if (refParallelTag) {
      queries.push(
        [card.year, setProduct, playerName, autoTag]
          .filter(Boolean).join(" ")
      );
    }
  }

  // ── Standard queries (always generated, serve as fallbacks) ──

  // Query: Most specific — card number + manufacturer + year + player + parallel + auto
  if (card.cardNumber) {
    queries.push(
      [card.year, card.setName || card.manufacturer || "Topps", card.cardNumber, playerName, autoTag, parallelTag]
        .filter(Boolean).join(" ")
    );
  }

  // Query: Set name + player + parallel (no card number — sometimes card numbers vary in listings)
  if (card.setName) {
    queries.push(
      [card.year, card.setName, playerName, autoTag, parallelTag]
        .filter(Boolean).join(" ")
    );
  }

  // Query: Set name + player WITHOUT parallel (for finding base card comps when parallel is specified)
  if (card.setName && parallelTag) {
    queries.push(
      [card.year, card.setName, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // Query: Insert/subset specific
  if (insertName) {
    queries.push(
      [card.year, insertName, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // Query: Broadest — year + player + auto + manufacturer
  queries.push(
    [card.year, playerName, autoTag, card.manufacturer || "Topps"]
      .filter(Boolean).join(" ")
  );

  // Query: For graded cards, include the grade in a search
  if (gradeTag) {
    queries.push(
      [card.year, card.setName || card.manufacturer, playerName, gradeTag]
        .filter(Boolean).join(" ")
    );
  }

  // Deduplicate (some queries might be identical if fields are missing)
  return [...new Set(queries)];
}

/**
 * Build a parallel tag string with print run when available.
 * e.g. "Gold /2025" or "Red Foil /75" or just "Sapphire"
 */
function buildParallelTag(parallel: { name: string; printRun: number | null; colorFamily?: string | null }): string {
  const name = parallel.name
    // Strip trailing print run from name if already included (e.g. "Gold /2025" → "Gold")
    .replace(/\s*\/\s*\d+\s*$/, "")
    .trim();

  if (parallel.printRun && parallel.printRun > 0) {
    return `${name} /${parallel.printRun}`;
  }
  return name;
}
