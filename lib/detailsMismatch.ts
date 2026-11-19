// Day 23B (docs/plans/business-details-flow.md): when the owner's confirmed
// details (lib/ownerDetails.ts) differ from their Google listing (read now)
// or their website (the last scan's read), a task to fix it at the source.
// Phone, address and hours — with the website check's own comparers, so
// "differs" means the same here as on the Website page. Never points: the
// score comes from Google and the website only. Pure.

import type { OpeningHoursPeriod } from "@/lib/google/places";
import { sameWeek, weekFromSite, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { weekFromPlacesPeriods } from "@/lib/hoursEditor";
import type { OwnerDetails } from "@/lib/ownerDetails";
import { compareAddress, comparePhone, type InfoFieldFinding } from "@/lib/websiteTrust";

export type DetailsField = "phone" | "address" | "hours";
export const DETAILS_FIELDS: readonly DetailsField[] = ["phone", "address", "hours"];

/** One side's value, for "You confirmed … · Google … · Website …". */
export type DetailsVersion = { text: string } | { hours: OwnerDetails["hours"] };

export interface DetailsMismatch {
  field: DetailsField;
  /** Google shows something else (or nothing) for it. */
  google: boolean;
  /** The website shows something else for it (last scan). */
  website: boolean;
  /** Every version known, side by side (null: that side shows none, or wasn't read). */
  versions?: { owner: DetailsVersion; google: DetailsVersion | null; website: DetailsVersion | null };
}

export interface DetailsMismatchInput {
  owner: OwnerDetails | null;
  /** The listing as Google shows it now; null when it couldn't be read (then no Google tasks). */
  google: { phone: string | null; address: string | null; openingHoursPeriods: OpeningHoursPeriod[] | null } | null;
  /** The last scan's website reads (websiteTrust.infoConflicts); empty when none. */
  site: Array<Pick<InfoFieldFinding, "field" | "siteValue" | "siteWeek">>;
}

const differs = (f: InfoFieldFinding) => f.comparison === "conflicts";

function phoneDiffers(owner: string, other: string | null): boolean {
  if (!owner) return false;
  if (!other) return true;
  return differs(comparePhone(other, owner));
}

function addressDiffers(owner: string, other: string | null): boolean {
  if (!owner) return false;
  if (!other) return true;
  return differs(compareAddress(other, owner));
}

function hoursDiffer(owner: OwnerDetails["hours"], other: WeeklyHours | null): boolean {
  // Only a regular week is compared ("By appointment" / "No hours" have nothing to line up).
  if (owner.kind !== "regular" || !other) return false;
  return !sameWeek(owner.week, other);
}

export function detailsMismatches(input: DetailsMismatchInput): DetailsMismatch[] {
  const o = input.owner;
  if (!o) return [];
  const site = (field: DetailsField) => input.site.find((s) => s.field === field && s.siteValue);
  const out: DetailsMismatch[] = [];
  for (const field of DETAILS_FIELDS) {
    const g = input.google;
    const s = site(field);
    const google =
      !!g &&
      (field === "phone" ? phoneDiffers(o.phone, g.phone) : field === "address" ? addressDiffers(o.address, g.address) : hoursDiffer(o.hours, weekFromPlacesPeriods(g.openingHoursPeriods)));
    const website =
      !!s &&
      (field === "phone" ? phoneDiffers(o.phone, s.siteValue) : field === "address" ? addressDiffers(o.address, s.siteValue) : hoursDiffer(o.hours, weekFromSite(s.siteWeek)));
    if (google || website) out.push({ field, google, website, versions: versionsOf(field, o, g, s) });
  }
  return out;
}

const week = (w: WeeklyHours | null): DetailsVersion | null => (w ? { hours: { kind: "regular", week: w } } : null);
const textOf = (v: string | null | undefined): DetailsVersion | null => (v && v.trim() ? { text: v.trim() } : null);

function versionsOf(field: DetailsField, o: OwnerDetails, g: DetailsMismatchInput["google"], s: DetailsMismatchInput["site"][number] | undefined): NonNullable<DetailsMismatch["versions"]> {
  if (field === "hours") return { owner: { hours: o.hours }, google: g ? week(weekFromPlacesPeriods(g.openingHoursPeriods)) : null, website: s ? week(weekFromSite(s.siteWeek)) : null };
  return { owner: { text: field === "phone" ? o.phone : o.address }, google: g ? textOf(field === "phone" ? g.phone : g.address) : null, website: s ? textOf(s.siteValue) : null };
}

/**
 * The details mismatches a scored "Matches your Google listing" task covers
 * (the website and Google differ on the same field): ONE task shows them,
 * with every version side by side (Day 23B). Other tasks cover none.
 */
export function mismatchesCoveredBy(task: { checkId: string; mismatchFields?: string[] | null }, mismatches: DetailsMismatch[]): DetailsMismatch[] {
  if (task.checkId !== "website.info_consistency") return [];
  const fields = new Set(task.mismatchFields ?? []);
  return mismatches.filter((m) => fields.has(m.field));
}

/** Hours and phone mix-ups send customers to a closed door or a dead number: Urgent. */
export const URGENT_DETAILS: readonly DetailsField[] = ["hours", "phone"];

/** The Google Profile tab row (and its editor) for each field; address has no PostScore editor. */
export const DETAILS_EDITOR_HASH: Record<DetailsField, string | null> = { phone: "edit-phone", hours: "edit-hours?use=own", address: null };

/**
 * "Your {field} now match. Save these as your confirmed details?" — asked
 * once, after a change PostScore made to that field is live on Google (read
 * back), when the confirmed details still say something else (or there are
 * none). While Google reviews the change: "Waiting for Google" instead.
 */
export function nowMatchPrompt(input: {
  field: DetailsField;
  /** PostScore's latest change to this field: its status and when. */
  change: { status: string; at: string; key: string } | null;
  owner: OwnerDetails | null;
  google: DetailsMismatchInput["google"];
  /** Already asked for this change (answered either way). */
  asked: boolean;
}): "ask" | "waiting" | null {
  const c = input.change;
  if (!c || input.asked) return null;
  if (c.status === "reviewing" || c.status === "held") return "waiting";
  if (c.status !== "live" && c.status !== "undo") return null;
  if (!input.google) return null;
  if (!input.owner) return "ask";
  const m = detailsMismatches({ owner: input.owner, google: input.google, site: [] }).find((x) => x.field === input.field);
  return m?.google ? "ask" : null;
}

/** Google and the website (as last read) show the same thing for this field —
 * only the confirmed details differ. Unknown on either side: not agreed. */
export function sidesAgree(m: DetailsMismatch): boolean {
  const g = m.versions?.google;
  const w = m.versions?.website;
  if (!g || !w) return false;
  if ("hours" in g && "hours" in w) return g.hours.kind === "regular" && w.hours.kind === "regular" && sameWeek(g.hours.week, w.hours.week);
  if ("text" in g && "text" in w) {
    const f = m.field === "phone" ? comparePhone(w.text, g.text) : compareAddress(w.text, g.text);
    return f.comparison === "matches";
  }
  return false;
}

/**
 * "owner_only": Google and the website agree; only the confirmed details
 * differ → "Your confirmed hours differ…", update the details (no points:
 * nothing on Google or the website is wrong). "sides_differ": Google and the
 * website differ from each other → fix them (the scored check's points).
 */
export function mergedKind(ms: DetailsMismatch[]): "owner_only" | "sides_differ" {
  return ms.length > 0 && ms.every(sidesAgree) ? "owner_only" : "sides_differ";
}

/** The values Google and the website agree on, as the confirmed details' field (for Settings' pre-fill). */
export function agreedValue(m: DetailsMismatch): { phone?: string; address?: string; hours?: OwnerDetails["hours"] } | null {
  if (!sidesAgree(m)) return null;
  const g = m.versions!.google!;
  if ("hours" in g) return { hours: g.hours };
  return m.field === "phone" ? { phone: g.text } : { address: g.text };
}
