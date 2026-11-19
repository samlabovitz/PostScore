// Day 23 2d-3: the business details the OWNER confirmed or edited —
// name, address, phone and hours — saved as "provided by you"
// (businesses.owner_details, supabase/owner-details.sql). Settings →
// "Your business details" pre-fills them from a live read of the listing
// (lib/ownerListing.ts); only what the owner confirms is saved. The
// header, the business switcher, emails and Print studio show them once
// confirmed. Scoring never reads them. Pure.

import type { LiveListing, LiveListingValues } from "@/lib/ownerListing";
import { closedWeek, formatTime, hoursProblems, sameWeek, WEEK_ORDER, weekInput, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { dayName, weekFromPlacesPeriods } from "@/lib/hoursEditor";
import { t, type Locale } from "@/lib/i18n";

/** The owner's hours, saved structured (never as text):
 * a week (lib/gbpProfileEdits.ts WeeklyHours), by appointment only, or none shown. */
export type OwnerHours = { kind: "regular"; week: WeeklyHours } | { kind: "appointment" } | { kind: "none" };

export interface OwnerDetails {
  name: string;
  address: string;
  phone: string;
  hours: OwnerHours;
}

export const OWNER_DETAIL_MAX = { name: 100, address: 200, phone: 40 } as const;
/** The editor's "Add hours" stops at a split shift (Google's own hours may have more). */
export const OWNER_MAX_RANGES = 2;

/** Business types that usually work by appointment (config/bizProfiles.ts
 * ids): with no hours on Google, the card starts on "By appointment only". */
const BY_APPOINTMENT = new Set(["salon", "practitioner", "lawyer", "professional_services", "tattoo_body_art", "events", "home_services", "trades"]);
/** Niches (config/niches.ts) booked as classes, lessons or workshops, whatever their type. */
const BY_APPOINTMENT_NICHES = new Set([
  "art_classes",
  "music_lessons",
  "music_school",
  "language_school",
  "learning_center",
  "test_prep",
  "coding_stem",
  "driving_school",
  "personal_training",
  "dog_training",
]);
export const usuallyByAppointment = (profileId: string | null | undefined, nicheId: string | null | undefined = null) =>
  (!!nicheId && BY_APPOINTMENT_NICHES.has(nicheId)) || (!!profileId && BY_APPOINTMENT.has(profileId));

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Hours from the browser or the saved row; null when malformed or the
 * week has a problem (overlaps, a day with no times — hoursProblems). */
export function ownerHoursInput(raw: unknown): OwnerHours | null {
  const v = raw as { kind?: unknown; week?: unknown } | null;
  if (!v || typeof v !== "object") return null;
  if (v.kind === "appointment" || v.kind === "none") return { kind: v.kind };
  if (v.kind !== "regular") return null;
  const week = weekInput(v.week);
  return week && hoursProblems(week).length === 0 ? { kind: "regular", week } : null;
}

/** Trimmed, length-capped details; null unless the name is there. Hours
 * that don't read come back as none (the save checks them first). */
export function sanitizeOwnerDetails(input: unknown): OwnerDetails | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const name = clean(v.name, OWNER_DETAIL_MAX.name);
  if (!name) return null;
  return {
    name,
    address: clean(v.address, OWNER_DETAIL_MAX.address),
    phone: clean(v.phone, OWNER_DETAIL_MAX.phone),
    hours: ownerHoursInput(v.hours) ?? { kind: "none" },
  };
}

/**
 * The card's starting values: the listing as Google shows it now (empty
 * when it couldn't be read — never the saved Google columns). Hours are
 * Google's week; with none on Google, "By appointment only" for types
 * that usually work that way, else every day Closed.
 */
export function ownerDetailsPrefill(live: LiveListingValues | null, options: { byAppointment?: boolean } = {}): OwnerDetails {
  const week = weekFromPlacesPeriods(live?.openingHoursPeriods);
  return {
    name: clean(live?.name, OWNER_DETAIL_MAX.name),
    address: clean(live?.address, OWNER_DETAIL_MAX.address),
    phone: clean(live?.phone, OWNER_DETAIL_MAX.phone),
    hours: week ? { kind: "regular", week } : options.byAppointment ? { kind: "appointment" } : { kind: "regular", week: closedWeek() },
  };
}

/**
 * The name and address the header, switcher, emails and prints show: the
 * owner's once confirmed; before that, the listing as this visit read it
 * (`live`); otherwise none (Day 23 2d-5: never a saved Google value — the
 * page says "Couldn't load from Google right now" or a neutral label).
 */
export function withOwnerDetails<T extends { name?: string | null; address?: string | null }>(row: T, details: OwnerDetails | null, live: LiveListing | null = null): T {
  if (details) return { ...row, name: details.name, address: details.address || null };
  if (live?.status === "ok") return { ...row, name: live.values.name ?? null, address: live.values.address ?? null };
  return { ...row, name: null, address: null };
}

const sameHours = (a: OwnerHours, b: OwnerHours) => a.kind === b.kind && (a.kind !== "regular" || sameWeek(a.week, (b as { week: WeeklyHours }).week));

export function sameOwnerDetails(a: OwnerDetails, b: OwnerDetails): boolean {
  return a.name === b.name && a.address === b.address && a.phone === b.phone && sameHours(a.hours, b.hours);
}

const shortDay = (day: number, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + day))).replace(/\.$/, "");

/**
 * The hours in one line for the collapsed card: "Mon–Fri 9:00 AM – 5:00 PM ·
 * Sat 10:00 AM – 2:00 PM · Sun Closed" (days in a row with the same hours
 * together), "By appointment only", or "No hours".
 */
export function ownerHoursSummary(hours: OwnerHours, locale: Locale): string {
  if (hours.kind === "none") return t(locale, "dashboard.settings.details.hoursMode.none");
  if (hours.kind === "appointment") return t(locale, "dashboard.hoursEditor.byAppointment");
  const lines = ownerHoursLines(hours, locale)!;
  // The value after "Monday: ", per day, Monday first.
  const values = lines.map((l, i) => l.slice(dayName(WEEK_ORDER[i], locale).length + 2));
  const groups: Array<{ from: number; to: number; value: string }> = [];
  values.forEach((value, i) => {
    const last = groups[groups.length - 1];
    if (last && last.value === value) last.to = i;
    else groups.push({ from: i, to: i, value });
  });
  return groups
    .map((g) => `${shortDay(WEEK_ORDER[g.from], locale)}${g.to > g.from ? `–${shortDay(WEEK_ORDER[g.to], locale)}` : ""} ${g.value}`)
    .join(" · ");
}

/**
 * The hours as printed and emailed, in the owner's language, Monday
 * first: "Monday: 9:00 AM – 12:00 PM, 1:00 PM – 5:00 PM", "Friday:
 * 6:00 PM – 2:00 AM (next day)", "Sunday: Closed"; by appointment, one
 * line; no hours, null.
 */
export function ownerHoursLines(hours: OwnerHours, locale: Locale): string[] | null {
  if (hours.kind === "none") return null;
  if (hours.kind === "appointment") return [t(locale, "dashboard.hoursEditor.byAppointment")];
  return WEEK_ORDER.map((day) => {
    const d = hours.week[day];
    const value =
      d.mode === "closed"
        ? t(locale, "dashboard.overview.hoursClosed")
        : d.mode === "open24"
          ? t(locale, "dashboard.overview.hoursOpen24")
          : [...d.ranges]
              .sort((x, y) => x.open - y.open)
              .map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}${r.close < r.open && r.close !== 0 ? ` (${t(locale, "dashboard.gbpProfileEdits.hours.nextDayShort")})` : ""}`)
              .join(", ");
    return `${dayName(day, locale)}: ${value}`;
  });
}
