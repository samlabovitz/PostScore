// The business details the owner confirmed (or edited) for their starter
// website — name, type of business, address, phone — stored as
// "provided by you" (businesses.starter_site_details,
// supabase/starter-site-details.sql). The builder pre-fills them from the
// Google listing; only what the owner confirms goes on their own site
// (Google's terms: no Google Maps content there; first-party data the
// owner enters isn't restricted — docs/google-maps-support-reply-2026-10-21.md).
// Website only: scoring never reads this column.

export interface StarterSiteDetails {
  name: string;
  category: string;
  address: string;
  phone: string;
  /** When the owner confirmed them (ISO). */
  confirmedAt: string;
}

export type StarterSiteDetailFields = Omit<StarterSiteDetails, "confirmedAt">;

export const DETAIL_MAX: Record<keyof StarterSiteDetailFields, number> = { name: 100, category: 60, address: 200, phone: 40 };
export const DETAIL_FIELDS = Object.keys(DETAIL_MAX) as Array<keyof StarterSiteDetailFields>;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Trimmed, length-capped fields; null unless the name is there. */
export function sanitizeDetailFields(input: unknown): StarterSiteDetailFields | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const out = Object.fromEntries(DETAIL_FIELDS.map((k) => [k, clean(v[k], DETAIL_MAX[k])])) as StarterSiteDetailFields;
  return out.name ? out : null;
}

/** A stored row, or null when it's missing or malformed. */
export function sanitizeStarterSiteDetails(input: unknown): StarterSiteDetails | null {
  const fields = sanitizeDetailFields(input);
  const at = (input as { confirmedAt?: unknown } | null)?.confirmedAt;
  if (!fields || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { ...fields, confirmedAt: at };
}

export function sameDetails(a: StarterSiteDetailFields, b: StarterSiteDetailFields): boolean {
  return DETAIL_FIELDS.every((k) => a[k].trim() === b[k].trim());
}
