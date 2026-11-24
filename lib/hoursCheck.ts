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

export type HoursCheckState =
  | { kind: "stale" }
  | { kind: "differs"; days: Array<{ day: number; website: DayHours; google: DayHours }>; profileAhead: boolean };

const sameDay = (a: DayHours, b: DayHours) => sameWeek([a], [b]);

/** `site` / `google`: index = Google's day number (0 Sunday). `profile`: the connected owner's Business Profile week (null when not connected). */
export function hoursCheckState(site: WeeklyHours | null, google: WeeklyHours | null, profile: WeeklyHours | null = null): HoursCheckState | null {
  if (!site || !google) return null;
  // Monday first, like every hours list.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = order.filter((d) => !sameDay(site[d], google[d])).map((day) => ({ day, website: site[day], google: google[day] }));
  if (days.length === 0) return { kind: "stale" };
  return { kind: "differs", days, profileAhead: !!profile && sameWeek(profile, site) };
}

/** The scored "Matches your Google listing" check about the hours. */
export function isHoursCheck(task: { checkId: string; mismatchFields?: string[] | null }): boolean {
  return task.checkId === "website.info_consistency" && (task.mismatchFields ?? []).includes("hours");
}

/** Out of Biggest boost: a check that matches now is a re-scan away, not points to win. */
export function withoutStaleHours<T extends { source: { kind: string; task?: { checkId: string; mismatchFields?: string[] | null } } }>(recs: T[] | null, state: HoursCheckState | null): T[] | null {
  if (!recs || state?.kind !== "stale") return recs;
  return recs.filter((r) => !(r.source.kind === "task" && r.source.task && isHoursCheck(r.source.task)));
}

