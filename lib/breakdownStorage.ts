// Day 23 2c-3: a SAVED score breakdown — the owner's scans (scores) and
// competitors' (competitor_scans) — keeps PostScore's own results only:
// each check's points, confidence, our flags (meta) and gaps. Never the
// text that quotes Google's values ("5.0★ on Google", "30 reviews",
// "8 photos on the listing", Google's phone or hours): pages show the
// live score's own explanations (lib/scoreChanges.ts resolveChangeDisplay),
// built from the values read when shown. Every check appears twice in a
// breakdown — the flat `checks` list and each category's `checks` — and
// both are cleaned. Pure.

/** Meta that quotes a count from Google's reviews (the explanation says
 * the rest). */
const QUOTED_META_KEYS = new Set(["recentReviews"]);

interface CheckLike {
  explanation?: unknown;
  note?: unknown;
  meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

function checkWithoutQuotes(c: CheckLike): CheckLike {
  const { note: _note, ...rest } = c;
  void _note;
  const meta = c.meta && typeof c.meta === "object" ? Object.fromEntries(Object.entries(c.meta).filter(([k]) => !QUOTED_META_KEYS.has(k))) : c.meta;
  return { ...rest, explanation: "", ...(meta !== undefined ? { meta } : {}) };
}

function checkHasQuotes(c: CheckLike): boolean {
  return (typeof c.explanation === "string" && c.explanation !== "") || c.note !== undefined || Object.keys(c.meta ?? {}).some((k) => QUOTED_META_KEYS.has(k));
}

function checksOf(breakdown: unknown): { flat: CheckLike[]; byCategory: CheckLike[][] } {
  const b = (breakdown && typeof breakdown === "object" ? breakdown : {}) as { checks?: unknown; categories?: unknown };
  const flat = Array.isArray(b.checks) ? (b.checks as CheckLike[]) : [];
  const byCategory = Array.isArray(b.categories) ? (b.categories as Array<{ checks?: unknown }>).map((c) => (Array.isArray(c?.checks) ? (c.checks as CheckLike[]) : [])) : [];
  return { flat, byCategory };
}

/** A breakdown as it may be saved: no explanation text, notes or quoted
 * counts — in the flat list and in every category. */
export function breakdownWithoutQuotes<T>(breakdown: T): T {
  if (!breakdown || typeof breakdown !== "object") return breakdown;
  const b = breakdown as { checks?: unknown; categories?: unknown };
  return {
    ...(breakdown as object),
    ...(Array.isArray(b.checks) ? { checks: (b.checks as CheckLike[]).map(checkWithoutQuotes) } : {}),
    ...(Array.isArray(b.categories)
      ? { categories: (b.categories as Array<Record<string, unknown>>).map((cat) => (Array.isArray(cat?.checks) ? { ...cat, checks: (cat.checks as CheckLike[]).map(checkWithoutQuotes) } : cat)) }
      : {}),
  } as T;
}

/** Whether a saved breakdown still holds text that quotes Google. */
export function breakdownHasQuotes(breakdown: unknown): boolean {
  const { flat, byCategory } = checksOf(breakdown);
  return flat.some(checkHasQuotes) || byCategory.some((cs) => cs.some(checkHasQuotes));
}
