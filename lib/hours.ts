// Turns Google's structured regularOpeningHours.periods (see
// lib/google/places.ts's OpeningHoursPeriod) into locale-formatted
// display lines — the one place that reads that column for display, so
// every owner-facing hours line stays consistent if this ever needs to
// change. Never guesses or fills in a day/time Google didn't actually
// return; a periods array that's missing, empty, or doesn't parse into
// something honestly displayable returns null so the caller can fall
// back to the existing (English) opening_hours weekday descriptions.

import { t, type Locale } from "./i18n";
import type { OpeningHoursPeriod } from "./google/places";

/** Intl locale tag used to render day names and times — "es-US" for
 * Spanish specifically (not "es"/"es-ES"), which is what gives the
 * "a. m."/"p. m." 12-hour style this app's Spanish businesses expect,
 * as opposed to a 24-hour clock. */
const INTL_LOCALE_TAG: Record<Locale, string> = {
  en: "en-US",
  es: "es-US",
};

// Google's day numbering: 0 = Sunday ... 6 = Saturday. Display order
// here is Monday through Sunday, matching the order the existing
// English weekdayDescriptions lines already display in.
const DISPLAY_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// An arbitrary UTC reference week used only to hand Intl.DateTimeFormat
// a real Date to read a weekday name or a wall-clock time off of — never
// treated as a real calendar date. UTC throughout so the runtime's own
// timezone can never shift a period's hour/minute or roll its weekday.
// January 2, 2000 was a Sunday (Google day 0); day N is that + N.
const REFERENCE_SUNDAY_UTC_DATE = Date.UTC(2000, 0, 2);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ValidPoint {
  day: number;
  hour: number;
  minute: number;
}

interface ValidPeriod {
  open: ValidPoint;
  /** null means Google reported this period with no close time at all —
   * open 24 hours starting from `open`. */
  close: ValidPoint | null;
}

function asValidPoint(point: OpeningHoursPeriod["open"]): ValidPoint | null {
  if (!point) return null;
  const { day, hour, minute } = point;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) return null;
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (typeof minute !== "number" || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return { day, hour, minute };
}

/** Validates and normalizes every period, or returns null the moment any
 * single one doesn't hold up — a partially-honest schedule (some days
 * real, one day guessed) would be worse than honestly falling back. */
function validatePeriods(periods: OpeningHoursPeriod[]): ValidPeriod[] | null {
  const result: ValidPeriod[] = [];
  for (const period of periods) {
    const open = asValidPoint(period.open);
    if (!open) return null;
    let close: ValidPoint | null = null;
    if (period.close !== undefined) {
      close = asValidPoint(period.close);
      if (!close) return null;
    }
    result.push({ open, close });
  }
  return result;
}

function dayNameFor(googleDay: number, localeTag: string): string {
  const date = new Date(REFERENCE_SUNDAY_UTC_DATE + googleDay * MS_PER_DAY);
  const name = new Intl.DateTimeFormat(localeTag, { weekday: "long", timeZone: "UTC" }).format(date);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function timeFor(hour: number, minute: number, localeTag: string): string {
  const date = new Date(Date.UTC(2000, 0, 1, hour, minute));
  return new Intl.DateTimeFormat(localeTag, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

/**
 * Formats Google's regularOpeningHours.periods into 7 lines, Monday
 * through Sunday. A day with no period shows "Closed"/"Cerrado"; a
 * period with no close time shows "Open 24 hours"/"Abierto las 24
 * horas"; multiple periods in one day (e.g. a lunch/dinner split) join
 * with ", "; a close time after midnight is shown as that time — this
 * never labels it as "next day", it just reads the close hour/minute
 * Google returned, same as the weekday it's attached to reads the open
 * side. Returns null when `periods` is null, empty, or doesn't parse —
 * callers must fall back to the existing opening_hours lines rather than
 * show a partial or guessed schedule.
 */
export function formatOpeningHours(
  periods: OpeningHoursPeriod[] | null,
  locale: Locale
): string[] | null {
  if (!periods || periods.length === 0) return null;

  const valid = validatePeriods(periods);
  if (!valid) return null;

  const byDay = new Map<number, ValidPeriod[]>();
  for (const period of valid) {
    const list = byDay.get(period.open.day) ?? [];
    list.push(period);
    byDay.set(period.open.day, list);
  }

  const localeTag = INTL_LOCALE_TAG[locale];

  return DISPLAY_DAY_ORDER.map((day) => {
    const name = dayNameFor(day, localeTag);
    const dayPeriods = byDay.get(day);
    if (!dayPeriods || dayPeriods.length === 0) {
      return `${name}: ${t(locale, "dashboard.overview.hoursClosed")}`;
    }
    const ranges = dayPeriods.map((period) =>
      period.close
        ? `${timeFor(period.open.hour, period.open.minute, localeTag)} – ${timeFor(
            period.close.hour,
            period.close.minute,
            localeTag
          )}`
        : t(locale, "dashboard.overview.hoursOpen24")
    );
    return `${name}: ${ranges.join(", ")}`;
  });
}
