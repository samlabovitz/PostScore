// Google's own edits to the listing: the fields Google shows differently
// from what the owner entered (Business Information getGoogleUpdated →
// diffMask), as short text, plus the bookkeeping that keeps one open row
// per field (supabase/gbp-step3b.sql). The reads and writes are
// lib/gbpGoogleEdits.server.ts. Pure.

export type EditedField = "title" | "phone" | "address" | "hours" | "website" | "categories" | "description";
export const EDITED_FIELDS: readonly EditedField[] = ["title", "phone", "address", "hours", "website", "categories", "description"];

/** The location fields each one reads (and diffMask names). */
export const EDITED_FIELD_MASK: Record<EditedField, string> = {
  title: "title",
  phone: "phoneNumbers",
  address: "storefrontAddress",
  hours: "regularHours",
  website: "websiteUri",
  categories: "categories",
  description: "profile",
};
export const GOOGLE_EDITS_READ_MASK = EDITED_FIELDS.map((f) => EDITED_FIELD_MASK[f]).join(",");

/** "Change it back" from PostScore: the fields the app already edits.
 * Name, address and categories can send the listing back to verification,
 * so those are always done on Google. */
export type RevertableField = "phone" | "hours" | "website";
export function canChangeBack(field: EditedField): field is RevertableField {
  return field === "phone" || field === "hours" || field === "website";
}

export const CHECK_NOW_MIN_MS = 10 * 60 * 1000;

/** The fields a diffMask names ("phoneNumbers.primaryPhone" → phone). */
export function fieldsInMask(mask: string | null | undefined): EditedField[] {
  const parts = (mask ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return EDITED_FIELDS.filter((f) => parts.some((p) => p === EDITED_FIELD_MASK[f] || p.startsWith(`${EDITED_FIELD_MASK[f]}.`)));
}

interface Period {
  openDay?: string;
  openTime?: { hours?: number; minutes?: number };
  closeDay?: string;
  closeTime?: { hours?: number; minutes?: number };
}
export interface EditedLocation {
  title?: string;
  phoneNumbers?: { primaryPhone?: string };
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string };
  regularHours?: { periods?: Period[] };
  websiteUri?: string;
  categories?: { primaryCategory?: { displayName?: string }; additionalCategories?: Array<{ displayName?: string }> };
  profile?: { description?: string };
}

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_SHORT = { en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], es: ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] };

function clock(t: Period["openTime"], locale: "en" | "es"): string {
  const h = t?.hours ?? 0;
  const m = t?.minutes ?? 0;
  if (locale === "es") return `${h}:${String(m).padStart(2, "0")}`;
  const hh = ((h + 11) % 12) + 1;
  return `${hh}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 || h === 24 ? "AM" : "PM"}`;
}

/** "Mon–Fri 9 AM–6 PM, Sat 9 AM–5 PM, Sun closed": consecutive days with
 * the same hours share one part. */
export function hoursText(periods: Period[] | null | undefined, locale: "en" | "es" = "en"): string | null {
  if (!periods || periods.length === 0) return null;
  const perDay = DAYS.map((d) =>
    periods
      .filter((p) => p.openDay === d)
      .map((p) => `${clock(p.openTime, locale)}–${clock(p.closeTime, locale)}`)
      .join(", ")
  );
  const closed = locale === "es" ? "cerrado" : "closed";
  const parts: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && perDay[j + 1] === perDay[i]) j++;
    const days = i === j ? DAY_SHORT[locale][i] : `${DAY_SHORT[locale][i]}–${DAY_SHORT[locale][j]}`;
    parts.push(`${days} ${perDay[i] || closed}`);
    i = j + 1;
  }
  return parts.join(", ");
}

/** Hours as a short per-day code, Monday first ("0|570-1020\n1|c\n…",
 * minutes after midnight, "c" closed) — compared day by day and shown in
 * the owner's language by decodeWeek. */
export function weekCode(periods: Period[] | null | undefined): string | null {
  if (!periods || periods.length === 0) return null;
  const min = (t: Period["openTime"]) => (t?.hours ?? 0) * 60 + (t?.minutes ?? 0);
  return DAYS.map((d, i) => {
    const ranges = periods
      .filter((p) => p.openDay === d)
      .map((p) => [min(p.openTime), p.closeDay && p.closeDay !== d && min(p.closeTime) === 0 ? 1440 : min(p.closeTime)])
      .sort((a, b) => a[0] - b[0]);
    return `${i}|${ranges.length ? ranges.map(([o, c]) => `${o}-${c}`).join(",") : "c"}`;
  }).join("\n");
}

export interface CodedDay {
  /** 0 = Monday … 6 = Sunday. */
  day: number;
  /** Minutes after midnight; empty: closed. */
  ranges: Array<[number, number]>;
}

export function decodeWeek(code: string | null | undefined): CodedDay[] | null {
  if (!code || !/^\d\|/.test(code)) return null;
  return code.split("\n").map((line) => {
    const [d, r] = line.split("|");
    return { day: Number(d), ranges: r === "c" || !r ? [] : r.split(",").map((x) => x.split("-").map(Number) as [number, number]) };
  });
}

const clip = (s: string | null | undefined, max = 400) => {
  const v = (s ?? "").trim();
  return v ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null;
};

/** One field's value as short text (what the row shows and the table keeps; hours as weekCode). */
export function fieldText(field: EditedField, loc: EditedLocation): string | null {
  switch (field) {
    case "title":
      return clip(loc.title);
    case "phone":
      return clip(loc.phoneNumbers?.primaryPhone);
    case "address": {
      const a = loc.storefrontAddress;
      if (!a) return null;
      return clip([...(a.addressLines ?? []), a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(" ")].filter((x) => x && String(x).trim()).join(", "));
    }
    case "hours":
      return weekCode(loc.regularHours?.periods);
    case "website":
      return clip(loc.websiteUri);
    case "categories":
      return clip([loc.categories?.primaryCategory?.displayName, ...(loc.categories?.additionalCategories ?? []).map((c) => c.displayName)].filter(Boolean).join(", "));
    case "description":
      return clip(loc.profile?.description);
  }
}

export interface FoundEdit {
  field: EditedField;
  ownerValue: string | null;
  googleValue: string | null;
}

/** The fields Google changed: named in diffMask AND showing a different
 * value (a mask entry whose text is the same — e.g. only a hidden
 * sub-field — isn't shown as a change). */
export function googleEditsFrom(diffMask: string | null | undefined, owner: EditedLocation, google: EditedLocation): FoundEdit[] {
  return fieldsInMask(diffMask)
    .map((field) => ({ field, ownerValue: fieldText(field, owner), googleValue: fieldText(field, google) }))
    .filter((e) => e.ownerValue !== e.googleValue);
}

export interface GoogleEditRow {
  id: string;
  field: EditedField;
  owner_value: string | null;
  google_value: string | null;
  detected_at: string;
  resolved_at: string | null;
  resolution: "kept" | "changed_back" | "gone" | null;
}

/** What one check changes: new open rows, open rows whose values moved
 * (updated in place), and open rows Google no longer shows ("gone"). A
 * field the owner kept stays quiet until Google changes it again. */
export function syncGoogleEdits(open: GoogleEditRow[], found: FoundEdit[], kept: GoogleEditRow[] = []): { create: FoundEdit[]; update: Array<{ id: string; edit: FoundEdit }>; gone: string[] } {
  const create: FoundEdit[] = [];
  const update: Array<{ id: string; edit: FoundEdit }> = [];
  for (const e of found) {
    const row = open.find((r) => r.field === e.field);
    if (row) {
      if (row.owner_value !== e.ownerValue || row.google_value !== e.googleValue) update.push({ id: row.id, edit: e });
      continue;
    }
    const lastKept = kept.filter((r) => r.field === e.field).sort((a, b) => (b.resolved_at ?? "").localeCompare(a.resolved_at ?? ""))[0];
    if (lastKept && lastKept.google_value === e.googleValue && lastKept.owner_value === e.ownerValue) continue;
    create.push(e);
  }
  const gone = open.filter((r) => !found.some((e) => e.field === r.field)).map((r) => r.id);
  return { create, update, gone };
}

/** "Check now": at most once every 10 minutes per business. */
export function checkNowAllowed(lastCheckedAt: string | null | undefined, now: number): boolean {
  if (!lastCheckedAt) return true;
  const at = Date.parse(lastCheckedAt);
  return !Number.isFinite(at) || now - at >= CHECK_NOW_MIN_MS;
}

/** The notification key for one field (notifications.type = "google"). */
export const editNotificationKey = (field: EditedField) => `edit_${field}`;
export function fieldOfNotificationKey(key: string): EditedField | null {
  const f = key.replace(/^edit_/, "");
  return key.startsWith("edit_") && (EDITED_FIELDS as readonly string[]).includes(f) ? (f as EditedField) : null;
}

// ---------------------------------------------------------------------------
// The tab's banner (and the Overview notification)
// ---------------------------------------------------------------------------

const hostOf = (v: string | null | undefined) => {
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return v.toLowerCase();
  }
};
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

/** Google filled in a field the owner left empty, and it matches what our
 * scan found (e.g. the website): information only — no banner, no
 * notification; section 6 says "Google added this · looks right ✓". */
export function isInfoOnly(e: Pick<GoogleEditRow, "field" | "owner_value" | "google_value">, scan: { website?: string | null; phone?: string | null }): boolean {
  if (e.owner_value || !e.google_value) return false;
  if (e.field === "website") return !!scan.website && hostOf(scan.website) === hostOf(e.google_value);
  if (e.field === "phone") return !!scan.phone && digits(scan.phone) === digits(e.google_value) && digits(scan.phone).length >= 10;
  return false;
}

/** The banner's fields, in a natural order ("hours, phone and website"). */
const BANNER_ORDER: EditedField[] = ["title", "address", "hours", "phone", "website", "categories", "description"];
export function bannerEdits(open: GoogleEditRow[], scan: { website?: string | null; phone?: string | null }): GoogleEditRow[] {
  return open.filter((e) => !isInfoOnly(e, scan)).sort((a, b) => BANNER_ORDER.indexOf(a.field) - BANNER_ORDER.indexOf(b.field));
}

/** Red, with "Review" only (no "I know, that's right"): the name or address
 * changed, or Google shows the business as closed. */
export function bannerSerious(fields: EditedField[], businessStatus: string | null | undefined): boolean {
  return fields.includes("title") || fields.includes("address") || businessStatus === "CLOSED_TEMPORARILY" || businessStatus === "CLOSED_PERMANENTLY";
}

/** "hours" · "hours and website" · "hours, phone and website". */
export function joinFields(names: string[], and: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${and} ${names[names.length - 1]}`;
}

/** Plural nouns take "were" / "se cambiaron" in the one-field sentence. */
export const PLURAL_FIELDS: readonly EditedField[] = ["hours", "categories"];
