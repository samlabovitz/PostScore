// The Growth page's "Your weekly routine" checklist: five real Google
// habits PostScore has no way to verify itself (it can't see posts,
// review replies, or exactly which photo got added when) — so this is
// an honest, owner-marked log, never a scored check. Kept entirely
// separate from lib/scoring.ts and lib/actionPlan.ts on purpose, same
// as lib/growthMoves.ts: a checklist item never earns points and is
// never counted in the projected score.

import { DEFAULT_LOCALE, t, type Locale, type MessageKey } from "@/lib/i18n";

export type WeeklyChecklistItemId =
  | "post_update"
  | "reply_reviews"
  | "share_review_link"
  | "add_photo"
  | "check_hours";

export const WEEKLY_CHECKLIST_ITEM_IDS: readonly WeeklyChecklistItemId[] = [
  "post_update",
  "reply_reviews",
  "share_review_link",
  "add_photo",
  "check_hours",
];

export interface WeeklyChecklistItem {
  id: WeeklyChecklistItemId;
  title: string;
  howTo: string;
}

const ITEM_MESSAGE_KEYS: Record<WeeklyChecklistItemId, { title: MessageKey; howTo: MessageKey }> = {
  post_update: {
    title: "dashboard.growth.checklist.items.postUpdate.title",
    howTo: "dashboard.growth.checklist.items.postUpdate.howTo",
  },
  reply_reviews: {
    title: "dashboard.growth.checklist.items.replyReviews.title",
    howTo: "dashboard.growth.checklist.items.replyReviews.howTo",
  },
  share_review_link: {
    title: "dashboard.growth.checklist.items.shareReviewLink.title",
    howTo: "dashboard.growth.checklist.items.shareReviewLink.howTo",
  },
  add_photo: {
    title: "dashboard.growth.checklist.items.addPhoto.title",
    howTo: "dashboard.growth.checklist.items.addPhoto.howTo",
  },
  check_hours: {
    title: "dashboard.growth.checklist.items.checkHours.title",
    howTo: "dashboard.growth.checklist.items.checkHours.howTo",
  },
};

/** The real, localized copy for all five checklist items, in the fixed
 * display order above. Pure — no DB/business-specific data needed,
 * since every item's title/how-to is the same for every business. */
export function buildWeeklyChecklistItems(locale: Locale = DEFAULT_LOCALE): WeeklyChecklistItem[] {
  return WEEKLY_CHECKLIST_ITEM_IDS.map((id) => ({
    id,
    title: t(locale, ITEM_MESSAGE_KEYS[id].title),
    howTo: t(locale, ITEM_MESSAGE_KEYS[id].howTo),
  }));
}

/**
 * businesses has no stored timezone column today, so every business
 * uses this single fallback — America/New_York, per the "otherwise
 * America/New_York" instruction. If a real per-business timezone is
 * ever added, thread it through here instead of this constant (see
 * getWeeklyChecklistState in app/actions/weeklyChecklist.ts, the one
 * place this is read).
 */
export const WEEKLY_CHECKLIST_TIMEZONE = "America/New_York";

function localDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Adds (or subtracts, for a negative count) whole days to a plain
 * "YYYY-MM-DD" date string — pure calendar arithmetic, no timezone
 * involved (a stored week_start is already a specific calendar date,
 * not a moment in time). */
function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday (as "YYYY-MM-DD") of the calendar week containing `date`,
 * in `timeZone` — the checklist's one real reset boundary. Computed
 * from `date`'s LOCAL calendar date in that timezone (via Intl, not a
 * date library), so "Monday" always means Monday where the business
 * actually is, never a UTC-shifted Sunday night or Tuesday morning.
 */
export function weekStartFor(date: Date, timeZone: string = WEEKLY_CHECKLIST_TIMEZONE): string {
  const { year, month, day } = localDateParts(date, timeZone);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = asUtc.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  asUtc.setUTCDate(asUtc.getUTCDate() - daysSinceMonday);
  return asUtc.toISOString().slice(0, 10);
}

/** Shape of a row from the `weekly_checks` table — only the fields the
 * checklist needs. */
export interface WeeklyCheckRow {
  week_start: string;
  item_id: string;
}

/** Every past week (as "YYYY-MM-DD" week_start values) where all five
 * checklist items were checked — real rows only, never inferred. */
function fullyCompletedWeeks(rows: WeeklyCheckRow[]): Set<string> {
  const itemsByWeek = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!itemsByWeek.has(row.week_start)) itemsByWeek.set(row.week_start, new Set());
    itemsByWeek.get(row.week_start)!.add(row.item_id);
  }
  const completed = new Set<string>();
  for (const [week, items] of Array.from(itemsByWeek.entries())) {
    if (WEEKLY_CHECKLIST_ITEM_IDS.every((id) => items.has(id))) completed.add(week);
  }
  return completed;
}

/**
 * Consecutive PAST weeks (strictly before `currentWeekStart`) that were
 * fully completed, walking backward week by week and stopping at the
 * first gap — never counts the current, still-in-progress week, even if
 * it's already fully checked (it isn't "past" until the next Monday).
 * Real weeks only: a week with no rows at all breaks the streak exactly
 * like a week with some-but-not-all items checked.
 */
export function computeStreakWeeks(rows: WeeklyCheckRow[], currentWeekStart: string): number {
  const completedWeeks = fullyCompletedWeeks(rows);
  let streak = 0;
  let cursor = addDays(currentWeekStart, -7);
  while (completedWeeks.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export interface WeeklyChecklistState {
  /** This week's Monday, "YYYY-MM-DD" — the key every read/write is
   * scoped to. */
  weekStart: string;
  /** Item ids checked so far THIS week. */
  checkedItemIds: Set<WeeklyChecklistItemId>;
  /** See computeStreakWeeks — 0 means "don't show a streak." */
  streakWeeks: number;
}

/** Combines every real weekly_checks row for a business into the
 * current display state — pure function, no DB access, so it's fully
 * testable without a fake Supabase client. `now`/`timezone` are
 * explicit (never read from the ambient clock directly) so tests can
 * simulate any real moment or week boundary. */
export function buildWeeklyChecklistState(
  rows: WeeklyCheckRow[],
  now: Date = new Date(),
  timezone: string = WEEKLY_CHECKLIST_TIMEZONE
): WeeklyChecklistState {
  const weekStart = weekStartFor(now, timezone);
  const checkedItemIds = new Set(
    rows.filter((r) => r.week_start === weekStart).map((r) => r.item_id as WeeklyChecklistItemId)
  );
  return { weekStart, checkedItemIds, streakWeeks: computeStreakWeeks(rows, weekStart) };
}

/** Real outcome of one optimistic checkbox toggle, once the server has
 * actually answered — never assumed from the optimistic click alone. */
export type ToggleOutcome =
  | { kind: "committed"; checkedItemIds: WeeklyChecklistItemId[]; streakWeeks: number }
  | { kind: "reverted"; checkedItemIds: WeeklyChecklistItemId[] };

/**
 * Decides what the checklist should actually show after a toggle's
 * server round-trip — the server's real, confirmed state on success, or
 * EXACTLY the state from before the optimistic click on failure. A
 * failed save must never be silently accepted as if it worked: the
 * checkbox has to visibly revert, which is why this always returns the
 * pre-toggle ids on anything other than a real "ok" result, rather than
 * trying to guess or partially apply the intended change.
 */
export function resolveToggleOutcome(
  beforeCheckedItemIds: WeeklyChecklistItemId[],
  result: { status: string; state?: { checkedItemIds: WeeklyChecklistItemId[]; streakWeeks: number } }
): ToggleOutcome {
  if (result.status === "ok" && result.state) {
    return { kind: "committed", checkedItemIds: result.state.checkedItemIds, streakWeeks: result.state.streakWeeks };
  }
  return { kind: "reverted", checkedItemIds: beforeCheckedItemIds };
}
