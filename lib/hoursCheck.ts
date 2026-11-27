// Day 23B: the scored "Matches your Google listing" check about the hours,
// against the hours as they are NOW — the website's (last read) and Google
// Maps' public listing (what customers see and what a scan scores):
//   - "stale": they match now → "Your website and Google now match — re-scan
//     to update your score" (no points, out of Biggest boost);
//   - "differs": the exact days that differ, website vs Google; and when the
//     owner's Business Profile already shows the website's hours, that Google
//     Maps hasn't published them yet.
// Unknown on either side: null (the scan's own words stay). Pure.

import { sameWeek, type DayHours, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { SUPPORTED_LOCALES, t } from "@/lib/i18n";

export type HoursCheckState =
  | { kind: "stale" }
  | {
      kind: "differs";
      days: Array<{ day: number; website: DayHours; google: DayHours }>;
      profileAhead: boolean;
      /** Where the Google side of `days` was read: Google Maps (what customers see), or the owner's Business Profile
       * (when Maps couldn't be read). */
      googleSource?: "maps" | "profile";
      /** Waiting on Google since (waitingSince): when the hours change was sent to the Business Profile, else the
       * first scan in a row that saw the mismatch. */
      waitingSince?: string | null;
    };

const sameDay = (a: DayHours, b: DayHours) => sameWeek([a], [b]);

/** `site` / `google`: index = Google's day number (0 Sunday). `profile`: the connected owner's Business Profile week (null when not connected). */
export function hoursCheckState(site: WeeklyHours | null, google: WeeklyHours | null, profile: WeeklyHours | null = null, googleSource: "maps" | "profile" = "maps"): HoursCheckState | null {
  if (!site || !google) return null;
  // Monday first, like every hours list.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = order.filter((d) => !sameDay(site[d], google[d])).map((day) => ({ day, website: site[day], google: google[day] }));
  if (days.length === 0) return { kind: "stale" };
  return { kind: "differs", days, profileAhead: !!profile && sameWeek(profile, site), googleSource };
}

/** The scored "Matches your Google listing" check about the hours. */
export function isHoursCheck(task: { checkId: string; mismatchFields?: string[] | null }): boolean {
  return task.checkId === "website.info_consistency" && (task.mismatchFields ?? []).includes("hours");
}

/** Out of Biggest boost: a check that matches now is a re-scan away, and one waiting on Google isn't the owner's. */
export function withoutStaleHours<T extends { source: { kind: string; task?: { checkId: string; mismatchFields?: string[] | null; problem?: string | null; problemLines?: string[] | null } } }>(recs: T[] | null, state: HoursCheckState | null): T[] | null {
  if (!recs) return recs;
  // Stale (a live Maps read matches the website now) or waiting on Google to publish the Business Profile's hours:
  // a re-scan or Google, never the owner's points to win.
  return recs.filter((r) => {
    if (r.source.kind !== "task" || !r.source.task) return true;
    const shown = shownHoursState(r.source.task, state);
    return !(shown?.kind === "stale" || hoursWaitingOnGoogle(shown));
  });
}

/** The owner's Business Profile already shows the website's hours; Google
 * Maps hasn't published them yet: waiting on Google, not on the owner. */
export function hoursWaitingOnGoogle(state: HoursCheckState | null | undefined): boolean {
  return state?.kind === "differs" && state.profileAhead;
}

/** A wait this long gets "Still not on Google Maps after a week?". */
export const LONG_WAIT_DAYS = 7;

/**
 * When the wait on Google started: the newest hours change sent to the Business Profile, else the first scan of
 * the latest unbroken run of scans that saw the mismatch (`scans` newest first, `mismatch` per scan). Pure.
 */
export function waitingSince(changeAt: string | null, scans: Array<{ at: string; mismatch: boolean }>): string | null {
  if (changeAt) return changeAt;
  let first: string | null = null;
  for (const scan of scans) {
    if (!scan.mismatch) break;
    first = scan.at;
  }
  return first;
}

/** Waiting on Google for more than LONG_WAIT_DAYS. */
export function waitingLong(state: HoursCheckState | null | undefined, now: Date = new Date()): boolean {
  if (!hoursWaitingOnGoogle(state) || state?.kind !== "differs" || !state.waitingSince) return false;
  const since = Date.parse(state.waitingSince);
  return Number.isFinite(since) && now.getTime() - since > LONG_WAIT_DAYS * 86_400_000;
}

// The scan's own hours line, as shown: "Your website's Hours say Thursday 9:30 AM–6:00 PM; Google says Thursday
// 9:30 AM–6:00 PM." When both sides shown are the same, Google changed since that scan (or the scan read another
// block): never "show different hours" — "Changed since your last scan · Re-scan to update", the stale rule.
const HOURS_LINE_KEYS = ["content.checks.website.info_consistency.explanation.conflictHoursLabelled", "content.checks.website.info_consistency.explanation.conflictHours"] as const;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tidy = (v: string) => v.replace(/[\u202f\u2009\u00a0]/g, " ").replace(/\s*[–-]\s*/g, "–").replace(/\s+/g, " ").replace(/^(\w+):/, "$1").trim().toLowerCase();

/** "Matches your Google listing" as any page, report or PostAI shows it without a live hours read: never the scan's
 * hours line when both of its sides read the same (the Google side is rebuilt from the listing values at hand, and
 * for a connected owner that's the Business Profile, which can already match while Maps still differs). */
export function hoursExplanation(check: { id: string; explanation: string }, locale: (typeof SUPPORTED_LOCALES)[number]): string {
  if (check.id === "website.info_consistency" && hoursShownSame([check.explanation])) return t(locale, "dashboard.hoursCheck.sameNow");
  return check.explanation;
}

/** The scan's hours line shows the same hours on both sides (any language). */
export function hoursShownSame(lines: ReadonlyArray<string | null | undefined>): boolean {
  for (const line of lines) {
    if (!line) continue;
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of HOURS_LINE_KEYS) {
        const pattern = escape(t(locale, key, { label: "\u0001", site: "\u0002", google: "\u0003" }))
          .replace("\u0001", ".+?")
          .replace("\u0002", "(.+?)")
          .replace("\u0003", "(.+?)");
        const m = new RegExp(`^${pattern}$`).exec(line.trim());
        if (m && tidy(m[1]) === tidy(m[2])) return true;
      }
    }
  }
  return false;
}

/** The hours check as the page should show it: the live compare when there is one; otherwise "stale" when the
 * scan's own line shows the same hours on both sides (hours the only field that differs). */
export function shownHoursState(
  task: { checkId: string; mismatchFields?: string[] | null; problem?: string | null; problemLines?: string[] | null },
  live: HoursCheckState | null | undefined
): HoursCheckState | null {
  if (!isHoursCheck(task)) return null;
  // Only a live read of Google Maps can say the hours match now. The page's own line is never evidence: for a
  // connected owner its Google side is the Business Profile, which can be ahead of Maps (the real Hair Express case,
  // Nov 25: the Business Profile matched the website, Maps still opened at 10:00 Tue–Fri).
  return live ?? null;
}
