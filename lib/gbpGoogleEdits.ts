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

const clip = (s: string | null | undefined, max = 400) => {
  const v = (s ?? "").trim();
  return v ? (v.length > max ? `${v.slice(0, max - 1)}…` : v) : null;
};

/** One field's value as short text (what the row shows and the table keeps). */
export function fieldText(field: EditedField, loc: EditedLocation, locale: "en" | "es" = "en"): string | null {
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
      return clip(hoursText(loc.regularHours?.periods, locale));
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
