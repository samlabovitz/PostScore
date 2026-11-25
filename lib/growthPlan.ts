// Day 25B step 6 (spec §2c): the Growth plan's "jump" — this week's plan
// ranked by what each task does for the tier, one tier line per task, "Do
// this one first", and the top line ("Do 1 task → on track for Growing on
// Mon, Nov 30") from the real tier rules (lib/growthTier.ts). Tier terms
// only: never PostScore points. Pure.

import type { KeepState } from "@/lib/devTier";
import { TIER_RULES, addDays, computeTiers, localDate, mondayOf, nextTierNeeds, resultsAt, weekRecord, type GrowthFacts, type ResultId, type TierNumber } from "@/lib/growthTier";

export type WeekKind = "posts" | "replies" | "answers" | "photos";

export interface TierLine {
  /** What the task does for the tier (see TIER_LINE keys). */
  key: "goesOutNextWeek" | "goesOutNextWeekTier" | "makesThisWeek" | "alreadyCounts" | "photos" | "checkOff";
  /** "Mon, Nov 23" (the post's day); "Mon, Nov 30" (when the tier moves up). */
  day?: string;
  date?: string;
  tier?: TierNumber;
  first?: boolean;
}

export interface WeekPlanContext {
  /** The week in progress (Monday) and whether it already counts. */
  thisWeek: string;
  thisWeekCounts: boolean;
  /** The scheduled post's day ("YYYY-MM-DD"), when there's one. */
  postDate: string | null;
  connected: boolean;
}

/** The tier the owner reaches if the week `weekStart` counts (one more verified action in it), and when. */
export function onTrackIfWeekCounts(facts: GrowthFacts, tier: TierNumber, weekStart: string): { tier: TierNumber; monday: string } | null {
  if (tier >= 5) return null;
  const at = `${addDays(weekStart, 2)}T16:00:00Z`;
  const withOne: GrowthFacts = { ...facts, actions: [...facts.actions, { at, kind: "verified", source: "planned" }] };
  const monday = addDays(weekStart, 7);
  const tiers = computeTiers(withOne, addDays(monday, -7 * 24), monday);
  const last = tiers[tiers.length - 1];
  return last && last.tier > tier ? { tier: last.tier, monday } : null;
}

/** §2c: the first task that makes a not-yet-counted week count, then the rest in the list's own order. */
export function rankWeek(kinds: WeekKind[], ctx: WeekPlanContext): { order: WeekKind[]; first: WeekKind | null } {
  const goesOutNow = (k: WeekKind) => k !== "posts" || !ctx.postDate || ctx.postDate < addDays(ctx.thisWeek, 7);
  let first: WeekKind | null = null;
  if (!ctx.thisWeekCounts) first = kinds.find(goesOutNow) ?? null;
  else first = kinds.find((k) => k === "posts" && !goesOutNow(k)) ?? null;
  const order = first ? [first, ...kinds.filter((k) => k !== first)] : kinds;
  return { order, first };
}

/** One tier line per task. */
export function tierLines(kinds: WeekKind[], ctx: WeekPlanContext, nextWeekTier: { tier: TierNumber; monday: string } | null): Record<WeekKind, TierLine> {
  const { first } = rankWeek(kinds, ctx);
  const out = {} as Record<WeekKind, TierLine>;
  for (const k of kinds) {
    const nextWeek = k === "posts" && !!ctx.postDate && ctx.postDate >= addDays(ctx.thisWeek, 7);
    let line: TierLine;
    if (!ctx.connected) line = { key: "checkOff" };
    else if (k === "photos") line = { key: "photos" };
    else if (nextWeek) line = nextWeekTier ? { key: "goesOutNextWeekTier", day: ctx.postDate!, date: nextWeekTier.monday, tier: nextWeekTier.tier } : { key: "goesOutNextWeek", day: ctx.postDate! };
    else line = ctx.thisWeekCounts ? { key: "alreadyCounts" } : { key: "makesThisWeek" };
    out[k] = { ...line, first: k === first };
  }
  return out;
}

/** The result to work on next for the next tier, never one that can't count yet. */
export function nextResult(facts: GrowthFacts, monday: string): ResultId | null {
  const r = resultsAt(facts, monday);
  for (const id of ["R2", "R4", "R1"] as ResultId[]) if (r[id] === "not_met") return id;
  return null;
}

export interface GrowthState {
  tier: TierNumber;
  /** The dev-only preview tier is showing (never saved, never counted). */
  preview: boolean;
  /** The last closed week's Monday the tier was computed on. */
  monday: string;
  /** The week in progress and whether it already counts. */
  thisWeek: string;
  thisWeekCounts: boolean;
  /** The last 8 closed weeks, oldest first. */
  weeks: Array<{ weekStart: string; active: boolean; neutral: boolean }>;
  next: ReturnType<typeof nextTierNeeds>;
  after: ReturnType<typeof nextTierNeeds>;
  results: ReturnType<typeof resultsAt>;
  /** Doing one task this week (or next, when this one already counts) → this tier on this Monday. */
  onTrack: { tier: TierNumber; monday: string } | null;
  /** The latest change, when it happened on the last Monday ("You moved to Building: …"). */
  change: { kind: "up" | "down_quiet" | "down_results" | "restored"; quietWeeks?: string[]; activeWeeks?: number; of?: number } | null;
  /** One quiet week: "Keep Building: one thing from this week's plan by Sunday keeps your tier." */
  warning: boolean;
  nextResult: ResultId | null;
  connected: boolean;
  /** "Keep your tier" (§6.4): this week already counts ("set"); one thing by Sunday keeps it ("due");
   * last week was quiet, two in a row step down ("quiet"); this week is marked closed ("closed"). */
  keep: KeepState;
  /** When the tier is next worked out: the coming Monday. */
  nextUpdate: string;
  /** Local favorite: what it takes to stay (§6.4) — no two quiet weeks in a row, and the results held. */
  stay: { activeNow: number; of: number; activeOk: boolean; results: number; resultsNow: number } | null;
}

/** Everything the Growth pages show about the tier, as of `now`. */
export function growthState(facts: GrowthFacts, now: Date, previewTier: TierNumber | null = null, previewKeep: KeepState | null = null): GrowthState {
  const today = localDate(now.toISOString(), facts.timeZone);
  const thisWeek = mondayOf(today);
  const monday = thisWeek;
  const tiers = computeTiers(facts, addDays(monday, -7 * 24), monday);
  const latest = tiers[tiers.length - 1];
  const computed = (latest?.tier ?? 1) as TierNumber;
  const tier = previewTier ?? computed;
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const w = weekRecord(facts, addDays(monday, -7 * (8 - i)));
    return { weekStart: w.weekStart, active: w.active, neutral: !!w.neutral };
  });
  const current = weekRecord(facts, thisWeek);
  const thisWeekCounts = current.active;
  const target = thisWeekCounts ? addDays(thisWeek, 7) : thisWeek;
  const next = nextTierNeeds(facts, monday, tier);
  const after = tier < 4 ? nextTierNeeds(facts, monday, (tier + 1) as TierNumber) : null;
  const change = latest && !previewTier && (latest.change === "up" || latest.change === "restored" || latest.change === "down_quiet" || latest.change === "down_results")
    ? { kind: latest.change, quietWeeks: latest.reason.quietWeeks, activeWeeks: latest.reason.activeWeeks, of: latest.reason.of }
    : null;
  return {
    tier,
    preview: previewTier !== null,
    monday,
    thisWeek,
    thisWeekCounts,
    weeks,
    next,
    after,
    results: resultsAt(facts, monday),
    onTrack: onTrackIfWeekCounts(facts, tier, target),
    change,
    warning: previewKeep ? previewKeep === "quiet" : !previewTier && !!latest?.warning && !thisWeekCounts,
    keep: previewKeep ?? (current.neutral ? "closed" : thisWeekCounts ? "set" : !previewTier && latest?.warning ? "quiet" : "due"),
    nextUpdate: addDays(thisWeek, 7),
    stay: tier === 5 ? stayAtTop(facts, monday, weeks) : null,
    nextResult: nextResult(facts, monday),
    connected: facts.connected,
  };
}

/** Local favorite's "what it takes to stay": active weeks of the last 12, never two quiet weeks in a row
 * (the decay rule), and 3 real results (§6.3–6.4). */
function stayAtTop(facts: GrowthFacts, monday: string, weeks: GrowthState["weeks"]): NonNullable<GrowthState["stay"]> {
  const rule = TIER_RULES[5];
  const last12 = Array.from({ length: rule.of }, (_, i) => weekRecord(facts, addDays(monday, -7 * (rule.of - i))));
  const quiet = (w: { active: boolean; neutral: boolean }) => !w.active && !w.neutral;
  const [a, b] = weeks.slice(-2);
  const results = resultsAt(facts, monday);
  return {
    activeNow: last12.filter((w) => w.active).length,
    of: rule.of,
    activeOk: !(a && b && quiet(a) && quiet(b)),
    results: rule.results,
    resultsNow: (Object.keys(results) as ResultId[]).filter((id) => results[id] === "met").length,
  };
}
