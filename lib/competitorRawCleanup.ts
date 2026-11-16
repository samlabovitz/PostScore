// Day 23 2b-3: a saved competitor_scans row keeps only PostScore's own
// results — place_id, distance, score, grade, scoring version and the
// check points (with our own flags) — once its full scoring is done (or 24
// hours after the scan). Google's values (name, address, rating, review
// count, website, phone, hours, types, status, price, photos, service
// options) are read live when shown (lib/placesLive.server.ts). Pure.

/** The listing columns a scan saves from Google, blanked by the cleanup. */
export const COMPETITOR_RAW_COLUMNS = [
  "name",
  "address",
  "rating",
  "review_count",
  "has_website",
  "website_url",
  "phone",
  "opening_hours",
  "categories",
  "business_status",
  "price_level",
  "photo_count",
  "service_options",
] as const;

/** How long a scan may keep Google's values: its full scoring needs them. */
export const COMPETITOR_RAW_HOURS = 24;

/** Breakdown check fields that quote Google's values (never shown for a
 * competitor). The points, confidence and our own flags stay. */
const QUOTED_META_KEYS = new Set(["recentReviews"]);

interface CheckLike {
  explanation?: unknown;
  note?: unknown;
  meta?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/** A saved breakdown without the text that quotes Google's values ("Rated
 * 4.6★ on Google", "120 reviews") and without quoted counts in `meta`. */
export function breakdownWithoutQuotes<T>(breakdown: T): T {
  if (!breakdown || typeof breakdown !== "object") return breakdown;
  const b = breakdown as { checks?: unknown };
  if (!Array.isArray(b.checks)) return breakdown;
  return {
    ...(breakdown as object),
    checks: (b.checks as CheckLike[]).map((c) => {
      const { note: _note, ...rest } = c;
      void _note;
      const meta = c.meta && typeof c.meta === "object" ? Object.fromEntries(Object.entries(c.meta).filter(([k]) => !QUOTED_META_KEYS.has(k))) : c.meta;
      return { ...rest, explanation: "", ...(meta !== undefined ? { meta } : {}) };
    }),
  } as T;
}

/** A competitor's website analysis without Google's side of each
 * "website says / Google says" comparison (the website's side is ours). */
export function websiteAnalysisWithoutGoogle<T>(analysis: T): T {
  if (!analysis || typeof analysis !== "object") return analysis;
  return JSON.parse(JSON.stringify(analysis), (key, value) => (key === "googleValue" ? undefined : value)) as T;
}

/** "Also nearby" without Google's names and review counts (read live). */
export function alsoNearbyWithoutGoogle(list: unknown): unknown {
  if (!Array.isArray(list)) return list;
  return list
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof l.placeId === "string")
    .map((l) => ({
      placeId: l.placeId,
      distanceMeters: l.distanceMeters,
      ...(l.temporarilyClosed ? { temporarilyClosed: true } : {}),
    }));
}

/** A competitor's first score, kept for good when its scan's scoring was
 * closed after 24 hours: marked done, so its website shows "Website
 * couldn't be checked" — never "not checked yet" for a scan that won't
 * finish. The score itself is unchanged. */
export function closedFirstScore<T>(breakdown: T): T {
  if (!breakdown || typeof breakdown !== "object") return breakdown;
  const b = breakdown as { checks?: unknown };
  if (!Array.isArray(b.checks)) return breakdown;
  return {
    ...(breakdown as object),
    checks: (b.checks as CheckLike[]).map((c) => (c.id === "website.has_website" ? { ...c, meta: { ...(c.meta ?? {}), fullScore: "1" } } : c)),
  } as T;
}

export interface CompetitorRawRow {
  id: string;
  breakdown_json?: unknown;
  pending_breakdown_json?: unknown;
  website_analysis_json?: unknown;
  also_nearby_json?: unknown;
  [column: string]: unknown;
}

/** Whether a row still holds any of Google's values. */
export function hasRawValues(row: CompetitorRawRow): boolean {
  if (COMPETITOR_RAW_COLUMNS.some((c) => row[c] !== null && row[c] !== undefined)) return true;
  if (JSON.stringify(row.website_analysis_json ?? null).includes('"googleValue"')) return true;
  if (Array.isArray(row.also_nearby_json) && row.also_nearby_json.some((l) => l && typeof l === "object" && ("name" in l || "reviewCount" in l))) return true;
  const checks = (row.breakdown_json as { checks?: CheckLike[] } | null)?.checks ?? [];
  return checks.some((c) => (typeof c.explanation === "string" && c.explanation !== "") || c.note !== undefined || Object.keys(c.meta ?? {}).some((k) => QUOTED_META_KEYS.has(k)));
}

/** The update that leaves only our own results on a row. */
export function clearedRowPatch(row: CompetitorRawRow): Record<string, unknown> {
  const patch: Record<string, unknown> = Object.fromEntries(COMPETITOR_RAW_COLUMNS.map((c) => [c, null]));
  if (row.breakdown_json !== undefined) patch.breakdown_json = breakdownWithoutQuotes(row.breakdown_json);
  if (row.pending_breakdown_json !== undefined && row.pending_breakdown_json !== null) patch.pending_breakdown_json = breakdownWithoutQuotes(row.pending_breakdown_json);
  if (row.website_analysis_json !== undefined && row.website_analysis_json !== null) patch.website_analysis_json = websiteAnalysisWithoutGoogle(row.website_analysis_json);
  if (row.also_nearby_json !== undefined && row.also_nearby_json !== null) patch.also_nearby_json = alsoNearbyWithoutGoogle(row.also_nearby_json);
  return patch;
}

/** A cleared row: its full scoring can't be redone from it (the listing
 * facts are gone) — its saved result is kept instead. */
export function rawCleared(row: { name?: unknown; address?: unknown; has_website?: unknown; business_status?: unknown; categories?: unknown }): boolean {
  return row.name == null && row.address == null && row.has_website == null && row.business_status == null && row.categories == null;
}
