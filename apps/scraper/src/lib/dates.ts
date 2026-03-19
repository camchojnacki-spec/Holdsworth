/**
 * Safe date parsing — returns null instead of throwing on invalid dates.
 * This fixes the "RangeError: Invalid time value" that crashed the old pipeline.
 */
export function parseSaleDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr === "active" || dateStr.trim() === "") return null;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}
