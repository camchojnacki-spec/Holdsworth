/**
 * Build optimized search queries for a card.
 * Returns multiple query variants ordered from most specific to broadest.
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

  // Most specific: card number + player + auto + parallel
  if (card.cardNumber) {
    queries.push(
      [card.year, card.manufacturer || "Topps", card.cardNumber, playerName, autoTag, parallelTag]
        .filter(Boolean).join(" ")
    );
  }

  // With set name + auto
  if (card.setName) {
    queries.push(
      [card.year, card.setName, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // With insert set name
  if (insertName) {
    queries.push(
      [card.year, insertName, playerName, autoTag]
        .filter(Boolean).join(" ")
    );
  }

  // Broadest: year + player + auto + manufacturer
  queries.push(
    [card.year, playerName, autoTag, card.manufacturer || "Topps"]
      .filter(Boolean).join(" ")
  );

  return queries;
}
