// Pure display helpers for Google's price-level enum (e.g.
// "PRICE_LEVEL_MODERATE"), as returned by lib/google/places.ts's
// `priceLevel` field. This is Google's own honest signal for how a
// listing prices itself relative to others nearby — never a number we
// compute or guess ourselves. A listing with no price data on Google
// (common for salons, lawyers, and most non-restaurant services) maps
// to null throughout, and every caller must show that honestly rather
// than defaulting to a guessed tier.

const SYMBOL_BY_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "Free",
  PRICE_LEVEL_INEXPENSIVE: "$",
  PRICE_LEVEL_MODERATE: "$$",
  PRICE_LEVEL_EXPENSIVE: "$$$",
  PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
};

/** "$$" / "Free" for a recognized level, or null when Google has no
 * price data (including the literal PRICE_LEVEL_UNSPECIFIED). */
export function priceLevelToSymbol(level: string | null): string | null {
  if (!level) return null;
  return SYMBOL_BY_LEVEL[level] ?? null;
}
