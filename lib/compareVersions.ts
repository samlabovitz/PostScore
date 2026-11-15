// The "two versions" choice (components/gbp/CompareVersions.tsx): Google's
// version on the left, the owner's (or the website's) on the right, hours
// day by day with the differing days marked in both. Used by section 6's
// "Suggested edits Google accepted" and the hours-mismatch chooser. Pure.

import { decodeWeek, type EditedField } from "@/lib/gbpGoogleEdits";
import { formatTime } from "@/lib/gbpProfileEdits";
import { compareRows, dayName, dayText } from "@/lib/hoursChooser";
import type { WeeklyHours } from "@/lib/gbpProfileEdits";
import type { WatchedField } from "@/lib/googleProfileTab";

export interface DayLine {
  label: string;
  google: string;
  mine: string;
  differs: boolean;
}

export type Versions = { kind: "text"; google: string | null; mine: string | null } | { kind: "days"; days: DayLine[] };

/** Mon-first index (0 = Monday) → Google's day number (0 = Sunday). */
const googleDay = (monFirst: number) => (monFirst + 1) % 7;

function codedText(ranges: Array<[number, number]>, locale: "en" | "es"): string {
  if (ranges.length === 0) return locale === "es" ? "Cerrado" : "Closed";
  return ranges.map(([o, c]) => `${formatTime(o, locale)} – ${formatTime(c % 1440, locale)}`).join(", ");
}

/** Section 6: two stored values. Hours (per-day codes) → days; anything else → text. */
export function versionsOfEdit(field: EditedField, google: string | null, mine: string | null, locale: "en" | "es"): Versions {
  if (field === "hours") {
    const g = decodeWeek(google);
    const m = decodeWeek(mine);
    if (g || m) {
      const none = locale === "es" ? "(ninguno)" : "(none)";
      return {
        kind: "days",
        days: [0, 1, 2, 3, 4, 5, 6].map((i) => {
          const gd = g?.find((d) => d.day === i);
          const md = m?.find((d) => d.day === i);
          const gt = g ? codedText(gd?.ranges ?? [], locale) : none;
          const mt = m ? codedText(md?.ranges ?? [], locale) : none;
          return { label: capital(dayName(googleDay(i), locale)), google: gt, mine: mt, differs: gt !== mt };
        }),
      };
    }
  }
  return { kind: "text", google, mine };
}

/** The hours chooser: Google's week vs the website's week. */
export function versionsOfHours(google: WeeklyHours | null, site: WeeklyHours | null, locale: "en" | "es", googleLines: string[] | null = null): Versions {
  return { kind: "days", days: compareRows(google, site, locale, googleLines).map((r) => ({ label: capital(dayName(r.day, locale)), google: r.google, mine: r.site, differs: r.differs })) };
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A stored per-day code (lib/gbpGoogleEdits.ts weekCode) as a week (Google's day numbers). */
export function codedToWeek(code: string | null | undefined): WeeklyHours | null {
  const days = decodeWeek(code);
  if (!days) return null;
  const week: WeeklyHours = Array.from({ length: 7 }, () => ({ mode: "closed" as const }));
  for (const d of days) week[googleDay(d.day)] = d.ranges.length ? { mode: "open", ranges: d.ranges.map(([open, close]) => ({ open, close })) } : { mode: "closed" };
  return week;
}

/** "Mon closed · Tue–Wed 9:30 AM – 5:00 PM · …": consecutive days with the same hours share one part. */
export function shortWeek(week: WeeklyHours | null, locale: "en" | "es"): string {
  if (!week) return "";
  const order = [1, 2, 3, 4, 5, 6, 0];
  const text = order.map((d) => dayText(week[d], locale));
  const short = (d: number) => capital(dayName(d, locale)).slice(0, 3);
  const parts: string[] = [];
  for (let i = 0; i < 7; ) {
    let j = i;
    while (j + 1 < 7 && text[j + 1] === text[i]) j++;
    parts.push(`${i === j ? short(order[i]) : `${short(order[i])}–${short(order[j])}`} ${text[i].toLowerCase() === "closed" || text[i].toLowerCase() === "cerrado" ? text[i].toLowerCase() : text[i]}`);
    i = j + 1;
  }
  return parts.join(" · ");
}

/** Section 6's "Name, phone, address, hours, website" line: the fields that
 * changed between scans plus the ones Google changed (listed above it) —
 * "Unchanged" only when there are none. */
export function watchedSummary(betweenScans: WatchedField[], googleEdited: EditedField[]): WatchedField[] {
  const fromGoogle = googleEdited.map((f): WatchedField | null => (f === "title" ? "name" : f === "phone" || f === "address" || f === "hours" || f === "website" ? f : null)).filter((f): f is WatchedField => f !== null);
  const order: WatchedField[] = ["name", "phone", "address", "hours", "website"];
  return order.filter((f) => betweenScans.includes(f) || fromGoogle.includes(f));
}
