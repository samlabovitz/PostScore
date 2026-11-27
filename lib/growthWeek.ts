// Day 25B §2d "One home per task": the Growth plan's week is Growth-type only — repeat actions that bring customers
// in, whatever the score — and never a copy of a Fix plan row. Besides this week's Google post and fresh photos (the
// Google tasks, lib/tabIdeas.ts weekKinds), every week has these, so the plan always holds 3–5 tasks:
//   - ask for reviews (share the review link / QR with recent customers);
//   - start or refresh an offer (coupon, referral, first-time);
//   - a seasonal idea tied to the next holiday (within SEASONAL_WINDOW_DAYS).
// Each is checked off ("I did this", weekly_checks), so it counts toward the tier like any told action. Pure.

import { upcomingHolidays, type HolidayId } from "@/lib/gbpListingFields";
import { NEW_PAGES_LIVE } from "@/lib/routes";

export type GrowthExtraId = "share_review_link" | "start_offer" | "seasonal_idea";

/** A holiday this close gets a seasonal idea. */
export const SEASONAL_WINDOW_DAYS = 45;

export interface GrowthExtra {
  id: GrowthExtraId;
  /** seasonal_idea: the holiday and its date (YYYY-MM-DD). */
  holiday?: { id: HolidayId; date: string };
}

/** The next holiday within SEASONAL_WINDOW_DAYS, or null. */
export function nextHoliday(now: Date): { id: HolidayId; date: string } | null {
  const h = upcomingHolidays(now, Math.ceil(SEASONAL_WINDOW_DAYS / 7))[0];
  if (!h) return null;
  const date = `${h.date.year}-${String(h.date.month).padStart(2, "0")}-${String(h.date.day).padStart(2, "0")}`;
  const days = (Date.parse(`${date}T12:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000;
  return days <= SEASONAL_WINDOW_DAYS ? { id: h.id, date } : null;
}

/** This week's Growth-only tasks besides the Google ones, in the order they're shown (after the ranked Google tasks).
 * The new design only (NEW_PAGES_LIVE); today's Growth page keeps its own routine. */
export function growthExtras(now: Date, newDesign: boolean = NEW_PAGES_LIVE): GrowthExtra[] {
  if (!newDesign) return [];
  const holiday = nextHoliday(now);
  return [{ id: "share_review_link" }, { id: "start_offer" }, ...(holiday ? [{ id: "seasonal_idea" as const, holiday }] : [])];
}
