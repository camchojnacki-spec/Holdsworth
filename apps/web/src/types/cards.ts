export interface CardWithDetails {
  id: string;
  playerName: string | null;
  playerTeam: string | null;
  setName: string | null;
  manufacturerName: string | null;
  cardNumber: string | null;
  year: number | null;
  parallelVariant: string | null;
  isRookieCard: boolean;
  condition: string | null;
  conditionNotes: string | null;
  graded: boolean;
  gradingCompany: string | null;
  grade: string | null;
  quantity: number;
  purchasePrice: string | null;
  purchaseCurrency: string;
  purchaseDate: Date | null;
  purchaseSource: string | null;
  status: string;
  notes: string | null;
  thumbnailUrl: string | null;
  originalUrl: string | null;
  estimatedValueCad: string | null;
  estimatedValueUsd: string | null;
  priceTrend: string | null;
  trendPercentage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CardStatus = "in_collection" | "for_sale" | "sold" | "traded";

export type CardCondition =
  | "Mint"
  | "Near Mint"
  | "Excellent"
  | "Very Good"
  | "Good"
  | "Poor";

export interface CardFilters {
  search: string;
  year: string;
  status: string;
  condition: string;
  graded: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface ScanResult {
  playerName: string;
  team: string;
  year: number;
  setName: string;
  cardNumber: string;
  manufacturer: string;
  parallelVariant: string | null;
  isRookieCard: boolean;
  conditionEstimate: string;
  conditionNotes: string;
  confidence: number;
  additionalNotes: string;
}
