// Growth plan (new design): "This week's checklist" — a few habits each week that bring customers in. Not a second
// plan: score fixes (review replies, listing details, hours) live only on Fix plan. Each habit is checked off
// ("I did this", weekly_checks) or checked by PostScore when it can see it (lib/weeklyChecklist.ts autoChecks), so
// it drives the Growth tier like any check-off. The list resets Monday in the business's own time zone. Pure.
//   - Post on Google (PostScore checks it: sent from PostScore, or seen on Google);
//   - Ask 3 customers for a review;
//   - Add a photo to Google (PostScore checks it);
//   - Run or refresh an offer (checks itself when one is started in PostScore);
//   - a seasonal idea, only when a holiday is within SEASONAL_WINDOW_DAYS.
// "Also helps your score" only where the saved scan really has points left for it (reviews, photos).

import { upcomingHolidays, type HolidayId } from "@/lib/gbpListingFields";
import { addMonths, callsByDays, type CallDays, type InsightsMonth } from "@/lib/gbpInsights";
import { POST_DAY } from "@/lib/googleRecommendations";
import type { WeeklyChecklistItemId } from "@/lib/weeklyChecklist";

export type HabitId = Extract<WeeklyChecklistItemId, "post_update" | "share_review_link" | "add_photo" | "start_offer" | "seasonal_idea">;

/** A holiday this close gets a seasonal idea. */
export const SEASONAL_WINDOW_DAYS = 45;

/** How a habit gets its check: PostScore can see it (connected), started in PostScore, or the owner says so. */
export type HabitCheck = "google" | "postscore" | "owner";

export interface Habit {
  id: HabitId;
  check: HabitCheck;
  /** Points left on the saved scan this habit feeds ("Also helps your score: …"). */
  score: "reviews" | "photos" | null;
  /** seasonal_idea: the holiday and its date (YYYY-MM-DD). */
  holiday?: { id: HolidayId; date: string };
}

/** The next holiday within SEASONAL_WINDOW_DAYS, or null. */
export function nextHoliday(now: Date): { id: HolidayId; date: string } | null {
  const h = upcomingHolidays(now, Math.ceil(SEASONAL_WINDOW_DAYS / 7))[0];
  if (!h) return null;
  const date = `${h.date.year}-${String(h.date.month).padStart(2, "0")}-${String(h.date.day).padStart(2, "0")}`;
  const days = (Date.parse(`${date}T12:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000;
  return days >= 0 && days <= SEASONAL_WINDOW_DAYS ? { id: h.id, date } : null;
}

/** The saved scan's checks this list reads: points left on reviews and on photos. */
export interface ScoreRoom {
  reviews: boolean;
  photos: boolean;
}

const REVIEW_CHECKS = ["visibility.review_count", "visibility.review_recency", "visibility.rating"];

/** Points left, from the saved scan's checks (a check with no points yet, or unscored, isn't "room"). */
export function scoreRoom(checks: Array<{ id: string; earnedPoints: number | null; maxPoints: number }> | null): ScoreRoom {
  const open = (id: string) => {
    const c = checks?.find((x) => x.id === id);
    return !!c && c.earnedPoints !== null && c.earnedPoints < c.maxPoints;
  };
  return { reviews: REVIEW_CHECKS.some(open), photos: open("completeness.photos") };
}

/** This week's habits, in the order shown: 4, or 5 with a holiday coming. */
export function weekHabits(now: Date, room: ScoreRoom): Habit[] {
  const holiday = nextHoliday(now);
  return [
    { id: "post_update", check: "google", score: null },
    { id: "share_review_link", check: "owner", score: room.reviews ? "reviews" : null },
    { id: "add_photo", check: "google", score: room.photos ? "photos" : null },
    { id: "start_offer", check: "postscore", score: null },
    ...(holiday ? [{ id: "seasonal_idea" as const, check: "owner" as const, score: null, holiday }] : []),
  ];
}

/** The tier rule for a week (lib/growthTier.ts weekRecord): 1 verified action, or 2 check-offs. How many more
 * check-offs this week needs (0: it counts). */
export function checkOffsToCount(week: { verified: number; told: number }): number {
  if (week.verified >= 1) return 0;
  return Math.max(0, 2 - week.told);
}

/** Fewer calls than this over the last 6 months: not enough to call a day "busiest". */
export const BEST_DAY_MIN_CALLS = 10;

/** "Best day: Monday, before your busiest call days (Tue–Thu)": the day before the busiest call days (Google's
 * calls by weekday, the last 6 months — the same rule as the post's own day). Null without enough data. */
export function bestPostDay(months: InsightsMonth[] | null | undefined): { weekday: number; busiest: CallDays } | null {
  const sorted = [...(months ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1]?.month;
  const recent = last ? sorted.filter((m) => m.month > addMonths(last, -6)) : [];
  const calls = recent.reduce((n, m) => n + (m.callsByWeekday?.length === 7 ? m.callsByWeekday.reduce((a, b) => a + b, 0) : 0), 0);
  const days = callsByDays(recent);
  if (!days || calls < BEST_DAY_MIN_CALLS) return null;
  return { weekday: POST_DAY[days.top], busiest: days.top };
}

/** The Growth plan's proof line: last month's customer actions from Google (calls, directions, website clicks —
 * the latest full month PostScore has) and the change on the same month a year before. No year-ago month (or none
 * then): no comparison. No months at all: null (the line is hidden — never a made-up number). */
export function lastMonthProof(months: InsightsMonth[] | null | undefined): { month: string; count: number; change: { dir: "up" | "down" | "same"; pct: number } | null } | null {
  const sorted = [...(months ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const last = sorted[sorted.length - 1];
  if (!last) return null;
  const actions = (m: InsightsMonth) => m.calls + m.directions + m.websiteClicks;
  const count = actions(last);
  const before = sorted.find((m) => m.month === addMonths(last.month, -12));
  const was = before ? actions(before) : 0;
  if (!before || was <= 0) return { month: last.month, count, change: null };
  const pct = Math.round(((count - was) / was) * 100);
  return { month: last.month, count, change: { dir: pct > 0 ? "up" : pct < 0 ? "down" : "same", pct: Math.abs(pct) } };
}
