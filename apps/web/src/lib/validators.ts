import { z } from "zod";

export const createCardSchema = z.object({
  playerName: z.string().min(1, "Player name is required").max(200),
  team: z.string().max(100).optional(),
  position: z.string().max(50).optional(),
  year: z.number().int().min(1850).max(2030).optional(),
  setName: z.string().max(300).optional(),
  manufacturer: z.string().max(200).optional(),
  cardNumber: z.string().max(50).optional(),
  parallelVariant: z.string().max(200).optional(),
  isRookieCard: z.boolean().optional(),
  condition: z.string().max(100).optional(),
  conditionNotes: z.string().max(1000).optional(),
  graded: z.boolean().optional(),
  gradingCompany: z.string().max(50).optional(),
  grade: z.string().max(20).optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  purchasePrice: z.string().max(20).optional(),
  purchaseCurrency: z.string().max(3).optional(),
  purchaseDate: z.string().max(30).optional(),
  purchaseSource: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  aiRawResponse: z.record(z.string(), z.unknown()).optional(),
  photoUrl: z.string().optional(),
  backPhotoUrl: z.string().optional(),
  isAutograph: z.boolean().optional(),
  isRelic: z.boolean().optional(),
  subsetOrInsert: z.string().max(200).optional(),
  referenceCardId: z.string().uuid().optional(),
  aiCorrected: z.boolean().optional(),
});

export const settingsSchema = z.object({
  province: z.string().length(2),
  updateFrequency: z.enum(["daily", "weekly", "manual"]),
  alertThreshold: z.number().int().min(1).max(100),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
