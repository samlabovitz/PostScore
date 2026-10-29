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
  /** An ordering, booking or other page link ("Order on DoorDash") — the
   * site's big button. "" = none. */
  link: string;
  /** When the owner confirmed them (ISO). */
  confirmedAt: string;
  /** False on rows saved before the link field existed: the builder then
   * pre-fills it from the listing (lib/socialLinkCheck.ts platformPage). */
  linkSaved?: boolean;
}

export type StarterSiteDetailFields = Omit<StarterSiteDetails, "confirmedAt" | "linkSaved">;

export const DETAIL_MAX: Record<keyof StarterSiteDetailFields, number> = { name: 100, category: 60, address: 200, phone: 40, link: 500 };
export const DETAIL_FIELDS = Object.keys(DETAIL_MAX) as Array<keyof StarterSiteDetailFields>;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Trimmed, length-capped fields; null unless the name is there. */
export function sanitizeDetailFields(input: unknown): StarterSiteDetailFields | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const out = Object.fromEntries(DETAIL_FIELDS.map((k) => [k, clean(v[k], DETAIL_MAX[k])])) as StarterSiteDetailFields;
  // Only a real web address becomes a button.
  out.link = safeLink(out.link);
  return out.name ? out : null;
}

/** An http(s) address, or "". */
export function safeLink(value: string): string {
  const v = value.trim();
  if (!v) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

/** A stored row, or null when it's missing or malformed. */
export function sanitizeStarterSiteDetails(input: unknown): StarterSiteDetails | null {
  const fields = sanitizeDetailFields(input);
  const at = (input as { confirmedAt?: unknown } | null)?.confirmedAt;
  if (!fields || typeof at !== "string" || Number.isNaN(Date.parse(at))) return null;
  return { ...fields, confirmedAt: at, linkSaved: typeof (input as { link?: unknown }).link === "string" };
}

export function sameDetails(a: StarterSiteDetailFields, b: StarterSiteDetailFields): boolean {
  return DETAIL_FIELDS.every((k) => a[k].trim() === b[k].trim());
}
