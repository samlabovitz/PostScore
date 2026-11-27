// Day 25B step 6: the Growth tier engine (docs/plans/day25a-spec.md §6.2–6.4).
// Pure: from a business's own facts (dated actions, results inputs, neutral
// facts) to its tier on every Monday, with the reason for each change. No
// Google value is ever an input here except the Business Profile monthly
// numbers already saved for Google results (R1) and the review-count
// increases our scans recorded (R2).
//
//   - A week runs Monday–Sunday in the business's time zone; the tier is
//     recomputed each Monday from the week that just closed.
//   - Active week: ≥ 1 verified action, or ≥ 2 "You told us" check-offs.
//   - Neutral weeks are skipped (never quiet): "Closed this week", the
//     listing shown closed, the first 2 weeks on a paid plan, the first 2
//     weeks after Google disconnects, Google or PostScore failures.
//   - Tiers: 2 Building 3/4 · 3 Growing 5/6 + 1 result · 4 Thriving 7/8 + 2
//     (≥ 1 measured) · 5 Local favorite 11/12 + 3 (≥ 2 measured) + R1 three
//     months in a row. Up at most one tier per Monday.
//   - Down: two quiet weeks in a row → one tier (then one more per further two
//     quiet weeks); the tier's results bar missed 4 Mondays in a row → one
//     tier; never more than one step down per two weeks; never below 1.
//   - A warning after one quiet week; 2 active weeks in a row after a drop
//     restore the tier they had (if its results still hold).
//   - Plan changes: frozen while on Free; back within 60 days → resumes;
//     later → one step lower.

export type TierNumber = 1 | 2 | 3 | 4 | 5;
export const TIER_NAMES = ["", "Starting out", "Building", "Growing", "Thriving", "Local favorite"] as const;

export type ActionKind = "verified" | "told";
export interface GrowthAction {
  /** ISO time. */
  at: string;
  kind: ActionKind;
  /** e.g. "listing_change", "review_reply", "offer_started", "photo_seen", "task_marked", "routine_item", "offer_use". */
  source: string;
  /** Practice mode, an internal account, or an offer marked is_test (§6.2 rules 1, 2, 4). */
  test?: boolean;
  /** A Google change undone in its window, or the undo itself (rule 3: never counts, for anyone). */
  undone?: boolean;
}

export interface MonthInsights {
  /** "YYYY-MM". */
  month: string;
  calls: number;
  directions: number;
  bookings: number;
  websiteClicks: number;
}

export type NeutralReason = "closed_marked" | "listing_closed" | "new_plan" | "nothing_to_suggest" | "google_failure" | "postscore_failure" | "disconnected";

export interface GrowthFacts {
  timeZone: string;
  actions: GrowthAction[];
  /** The dev test login's business: test rows count (rules 1, 2, 4 skipped; never undone ones). */
  countTestRows: boolean;
  /** Nothing before this counts (a claim, or the tier reset). ISO or null. */
  countsFrom: string | null;
  /** Business Profile monthly numbers (R1). Empty when never connected. */
  insights: MonthInsights[];
  connected: boolean;
  /** Review-count increases seen on scans (R2): when and how many. */
  reviewIncreases: Array<{ at: string; delta: number }>;
  /** When dated +1 logging started (R4 can't be checked before it); null = not yet. */
  offerUseLogSince: string | null;
  /** Neutral weeks by Monday ("YYYY-MM-DD") with the reason. */
  neutralWeeks: Record<string, NeutralReason>;
  /** Free (no tier) periods by date ("YYYY-MM-DD"); the plan is paid outside them. */
  freePeriods: Array<{ from: string; to: string | null }>;
}

export type ResultId = "R1" | "R2" | "R3" | "R4" | "R5";
/** met / not met; not_checked = missing data (never counts against); unavailable = can't count yet (R3 until QR tracking, R5 until Day 37, R1 without Google). */
export type ResultStatus = "met" | "not_met" | "not_checked" | "unavailable";
export const MEASURED: Record<ResultId, boolean> = { R1: true, R2: true, R3: true, R4: false, R5: true };

export interface WeekRecord {
  weekStart: string;
  verified: number;
  told: number;
  active: boolean;
  neutral: NeutralReason | null;
}

export type TierChange = "start" | "up" | "down_quiet" | "down_results" | "restored" | "same" | "frozen" | "resumed";
export interface MondayTier {
  monday: string;
  tier: TierNumber;
  change: TierChange;
  /** The week that just closed. */
  week: WeekRecord;
  results: Record<ResultId, ResultStatus>;
  /** "Keep {tier}: one thing from this week's plan by Sunday keeps your tier." */
  warning: boolean;
  /** Plain facts behind the change (for "You moved to …: …"). */
  reason: { activeWeeks?: number; of?: number; results?: ResultId[]; quietWeeks?: string[]; missedMondays?: number; restoredFrom?: TierNumber };
}

// ---------------------------------------------------------------- dates

/** The local calendar date ("YYYY-MM-DD") of an instant in a time zone. */
export function localDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY);

/** The Monday on or before a date. */
export function mondayOf(date: string): string {
  const dow = new Date(toUtc(date)).getUTCDay(); // 0 Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Every Monday from `from` to `to` (both "YYYY-MM-DD"), oldest first. */
export function mondaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) if (m >= from) out.push(m);
  return out;
}

// ---------------------------------------------------------------- weeks

/** One week (Monday `weekStart`): its counted actions and whether it was active. */
export function weekRecord(facts: GrowthFacts, weekStart: string): WeekRecord {
  const end = addDays(weekStart, 7);
  const fromDate = facts.countsFrom ? localDate(facts.countsFrom, facts.timeZone) : null;
  let verified = 0;
  let told = 0;
  for (const a of facts.actions) {
    if (a.undone) continue;
    if (a.test && !facts.countTestRows) continue;
    const d = localDate(a.at, facts.timeZone);
    if (d < weekStart || d >= end) continue;
    if (fromDate && d < fromDate) continue;
    if (a.kind === "verified") verified++;
    else told++;
  }
  const active = verified >= 1 || told >= 2;
  const neutral = !active ? facts.neutralWeeks[weekStart] ?? null : null;
  return { weekStart, verified, told, active, neutral };
}

/** Before a claim or the reset: no week (the window simply starts later). */
function weekCounts(facts: GrowthFacts, weekStart: string): boolean {
  if (!facts.countsFrom) return true;
  return addDays(weekStart, 7) > localDate(facts.countsFrom, facts.timeZone);
}

/** The last `n` non-neutral weeks closed by Monday `monday` (newest first). */
function lastWeeks(facts: GrowthFacts, monday: string, n: number, cache: Map<string, WeekRecord>): WeekRecord[] {
  const out: WeekRecord[] = [];
  for (let w = addDays(monday, -7), guard = 0; out.length < n && guard < 104; w = addDays(w, -7), guard++) {
    if (!weekCounts(facts, w)) break;
    const rec = cache.get(w) ?? weekRecord(facts, w);
    cache.set(w, rec);
    if (rec.neutral) continue;
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------- results

const monthKey = (d: string) => d.slice(0, 7);
const prevMonth = (m: string, n = 1) => {
  const [y, mo] = m.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 - n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** R1 for one month: customer actions from Google vs the same month last year
 * (else the 3-month average before it). When either side has 0 website
 * clicks (Google's counting break), calls + directions alone. */
export function r1ForMonth(insights: MonthInsights[], month: string): ResultStatus {
  const by = new Map(insights.map((i) => [i.month, i]));
  const now = by.get(month);
  if (!now) return "not_checked";
  const lastYear = by.get(prevMonth(month, 12));
  const before = lastYear ? [lastYear] : [1, 2, 3].map((k) => by.get(prevMonth(month, k))).filter((x): x is MonthInsights => !!x);
  if (!lastYear && before.length < 3) return "not_checked";
  const brk = now.websiteClicks === 0 || before.some((b) => b.websiteClicks === 0);
  const total = (i: MonthInsights) => i.calls + i.directions + (brk ? 0 : i.bookings + i.websiteClicks);
  const base = before.reduce((s, b) => s + total(b), 0) / before.length;
  return total(now) >= base ? "met" : "not_met";
}

/** Every result as of Monday `monday`. */
export function resultsAt(facts: GrowthFacts, monday: string): Record<ResultId, ResultStatus> {
  // R1: the last full month; Google's numbers for it arrive by the 5th.
  const lastFull = prevMonth(monthKey(monday));
  // Never connected: R1 can't count ("counts once Google is connected"); a
  // month not in yet (before the 5th, or late) is "not checked", never failed.
  const r1: ResultStatus = !facts.connected && facts.insights.length === 0 ? "unavailable" : r1ForMonth(facts.insights, lastFull);
  // R2: ≥ 3 new reviews in the 30 days before Monday.
  const from = addDays(monday, -30);
  const newReviews = facts.reviewIncreases.filter((r) => {
    const d = localDate(r.at, facts.timeZone);
    return d >= from && d < monday;
  }).reduce((s, r) => s + Math.max(0, r.delta), 0);
  const r2: ResultStatus = newReviews >= 3 ? "met" : "not_met";
  // R4: ≥ 3 offer uses logged in 30 days — only once dated logging exists.
  let r4: ResultStatus;
  if (!facts.offerUseLogSince || localDate(facts.offerUseLogSince, facts.timeZone) > from) r4 = "not_checked";
  else {
    const uses = facts.actions.filter((a) => a.source === "offer_use" && !a.undone && (!a.test || facts.countTestRows)).filter((a) => {
      const d = localDate(a.at, facts.timeZone);
      return d >= from && d < monday;
    }).length;
    r4 = uses >= 3 ? "met" : "not_met";
  }
  // R3 waits for QR tracking (37-Core), R5 for email campaigns (Day 37): never failed.
  return { R1: r1, R2: r2, R3: "unavailable", R4: r4, R5: "unavailable" };
}

/** R1 met for the last three full months (Local favorite). */
export function r1ThreeMonths(facts: GrowthFacts, monday: string): boolean {
  const m = prevMonth(monthKey(monday));
  return [m, prevMonth(m), prevMonth(m, 2)].every((month) => r1ForMonth(facts.insights, month) === "met");
}

// ---------------------------------------------------------------- tiers

export const TIER_RULES: Record<2 | 3 | 4 | 5, { active: number; of: number; results: number; measured: number }> = {
  2: { active: 3, of: 4, results: 0, measured: 0 },
  3: { active: 5, of: 6, results: 1, measured: 0 },
  4: { active: 7, of: 8, results: 2, measured: 1 },
  5: { active: 11, of: 12, results: 3, measured: 2 },
};

/** Whether the results part of a tier's bar holds: met, or not failed because data is missing. */
function resultsBar(t: TierNumber, results: Record<ResultId, ResultStatus>, threeMonths: boolean): "met" | "pending" | "missed" {
  if (t < 3) return "met";
  const rule = TIER_RULES[t as 3 | 4 | 5];
  const ids = Object.keys(results) as ResultId[];
  const met = ids.filter((id) => results[id] === "met");
  const measured = met.filter((id) => MEASURED[id]);
  const extra = t === 5 ? threeMonths : true;
  if (met.length >= rule.results && measured.length >= rule.measured && extra) return "met";
  // Missing data never counts against the owner.
  const pending = ids.filter((id) => results[id] === "not_checked");
  const pendingMeasured = pending.filter((id) => MEASURED[id]);
  if (met.length + pending.length >= rule.results && measured.length + pendingMeasured.length >= rule.measured) return "pending";
  return "missed";
}

function qualifies(t: TierNumber, weeks: WeekRecord[], results: Record<ResultId, ResultStatus>, threeMonths: boolean): boolean {
  if (t === 1) return true;
  const rule = TIER_RULES[t as 2 | 3 | 4 | 5];
  if (weeks.length < rule.of) return false;
  const active = weeks.slice(0, rule.of).filter((w) => w.active).length;
  return active >= rule.active && resultsBar(t, results, threeMonths) === "met";
}

const isFree = (facts: GrowthFacts, date: string) => facts.freePeriods.some((p) => p.from <= date && (p.to === null || date < p.to));

/**
 * The tier on every Monday from `firstMonday` to `lastMonday`. The history
 * before `firstMonday` still counts toward the windows (the weeks exist);
 * the tier itself starts at 1 on `firstMonday`.
 */
export function computeTiers(facts: GrowthFacts, firstMonday: string, lastMonday: string): MondayTier[] {
  const cache = new Map<string, WeekRecord>();
  const out: MondayTier[] = [];
  let tier: TierNumber = 1;
  let quiet: string[] = [];
  let missed = 0;
  let restoreTo: TierNumber | null = null;
  let lastDown: string | null = null;
  let frozenSince: string | null = null;
  for (const monday of mondaysBetween(firstMonday, lastMonday)) {
    const weekStart = addDays(monday, -7);
    const week = cache.get(weekStart) ?? weekRecord(facts, weekStart);
    cache.set(weekStart, week);
    const results = resultsAt(facts, monday);
    const three = r1ThreeMonths(facts, monday);
    const base = { monday, week, results, warning: false };
    // Plan changes: no tier on Free (frozen); back within 60 days resumes, later one lower.
    if (isFree(facts, monday)) {
      frozenSince ??= monday;
      out.push({ ...base, tier, change: "frozen", reason: {} });
      continue;
    }
    if (frozenSince) {
      // Back on a paid plan: that Monday only resumes (never also a step up).
      const days = (toUtc(monday) - toUtc(frozenSince)) / DAY;
      if (days > 60 && tier > 1) tier = (tier - 1) as TierNumber;
      frozenSince = null;
      quiet = [];
      missed = 0;
      out.push({ ...base, tier, change: "resumed", reason: {} });
      continue;
    }
    if (out.length === 0) {
      out.push({ ...base, tier: 1, change: "start", reason: {} });
      // The first Monday can't move anyone; the next week is the first evaluated.
      if (!week.neutral) quiet = week.active ? [] : [weekStart];
      continue;
    }
    // Quiet streak: neutral weeks are skipped.
    if (!week.neutral) quiet = week.active ? [] : [...quiet, weekStart];
    const canDrop = !lastDown || toUtc(monday) - toUtc(lastDown) >= 14 * DAY;
    let change: TierChange = "same";
    const reason: MondayTier["reason"] = {};
    // Results slipping: the current tier's results bar missed 4 Mondays in a row.
    const bar = resultsBar(tier, results, three);
    missed = bar === "missed" ? missed + 1 : 0;

    if (quiet.length >= 2 && tier > 1 && canDrop) {
      restoreTo = (restoreTo && restoreTo > tier ? restoreTo : tier) as TierNumber;
      tier = (tier - 1) as TierNumber;
      change = "down_quiet";
      reason.quietWeeks = quiet.slice(-2);
      quiet = [];
      lastDown = monday;
    } else if (missed >= 4 && tier > 2 && canDrop) {
      restoreTo = (restoreTo && restoreTo > tier ? restoreTo : tier) as TierNumber;
      tier = (tier - 1) as TierNumber;
      change = "down_results";
      reason.missedMondays = missed;
      missed = 0;
      lastDown = monday;
    } else {
      const weeks = lastWeeks(facts, monday, 12, cache);
      // Coming back is quick: 2 active weeks in a row restore the tier they had, if its results hold.
      if (restoreTo && restoreTo > tier && weeks.length >= 2 && weeks[0].active && weeks[1].active && resultsBar(restoreTo, results, three) === "met") {
        reason.restoredFrom = tier;
        tier = restoreTo;
        restoreTo = null;
        change = "restored";
      } else if (tier < 5 && qualifies((tier + 1) as TierNumber, weeks, results, three)) {
        tier = (tier + 1) as TierNumber;
        const rule = TIER_RULES[tier as 2 | 3 | 4 | 5];
        reason.activeWeeks = weeks.slice(0, rule.of).filter((w) => w.active).length;
        reason.of = rule.of;
        reason.results = (Object.keys(results) as ResultId[]).filter((id) => results[id] === "met");
        change = "up";
        if (restoreTo && tier >= restoreTo) restoreTo = null;
      }
    }
    // One quiet week: a warning, never a surprise drop.
    const warning = tier > 1 && quiet.length === 1 && change !== "down_quiet";
    out.push({ ...base, tier, change, reason, warning });
  }
  return out;
}

/** What it takes to reach the next tier, from the current state (for "To reach Growing: …"). */
export interface TierNeeds {
  tier: TierNumber;
  activeWeeks: number;
  of: number;
  activeNow: number;
  results: number;
  resultsNow: number;
  /** How many of the results must be measured ones (MEASURED), and how many of the met ones are. */
  measured: number;
  measuredNow: number;
  /** Each requirement row's ✓: met only when the whole rule holds (count and measured). */
  activeMet: boolean;
  resultsMet: boolean;
  needsR1ThreeMonths: boolean;
}

/** Whether met results satisfy a rule's count and measured parts (Local favorite's three months aside). */
export function resultsRuleMet(results: Record<ResultId, ResultStatus>, rule: { results: number; measured: number }): { now: number; measuredNow: number; met: boolean } {
  const met = (Object.keys(results) as ResultId[]).filter((id) => results[id] === "met");
  const measuredNow = met.filter((id) => MEASURED[id]).length;
  return { now: met.length, measuredNow, met: met.length >= rule.results && measuredNow >= rule.measured };
}

export function nextTierNeeds(facts: GrowthFacts, monday: string, tier: TierNumber): TierNeeds | null {
  if (tier >= 5) return null;
  const next = (tier + 1) as 2 | 3 | 4 | 5;
  const rule = TIER_RULES[next];
  const weeks = lastWeeks(facts, monday, rule.of, new Map());
  const results = resultsAt(facts, monday);
  const activeNow = weeks.filter((w) => w.active).length;
  const r = resultsRuleMet(results, rule);
  return {
    tier: next,
    activeWeeks: rule.active,
    of: rule.of,
    activeNow,
    results: rule.results,
    resultsNow: r.now,
    measured: rule.measured,
    measuredNow: r.measuredNow,
    activeMet: activeNow >= rule.active,
    resultsMet: r.met,
    needsR1ThreeMonths: next === 5,
  };
}
