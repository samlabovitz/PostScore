// Day 25B step 6, Part B: the Growth plan (spec §2 Growth plan, §2c, §6,
// mockups 03, 03b, 06) — the tier card, this week's plan ranked for the
// tier with its top line, the Free preview (never a made-up tier), the real
// tier on the Overview line, and the shared list on Google results.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1/growth" }));
vi.mock("@/app/actions/weeklyChecklist", () => ({ setWeeklyCheckItem: vi.fn() }));
// The shared list itself is tested with Google results; here only where it sits.
vi.mock("@/components/gbp/GoogleResults", () => ({ ThisWeek: () => <div data-testid="list-premium" />, GrowThisWeek: () => <div data-testid="list-steps" /> }));
vi.mock("@/components/gbp/MoreWaysCards", () => ({ MoreWaysCards: () => <div data-testid="more-ways-cards" /> }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { TIER_RULES, resultsRuleMet, type GrowthFacts } from "@/lib/growthTier";
import { growthState, rankWeek, tierLines } from "@/lib/growthPlan";
import { GrowthFreePreview, TierCard, tierLineText } from "@/components/growth/GrowthPlanView";
import { weekHabits } from "@/lib/growthHabits";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const TZ = "America/New_York";
const facts = (over: Partial<GrowthFacts> = {}): GrowthFacts => ({ timeZone: TZ, actions: [], countTestRows: false, countsFrom: null, insights: [], connected: true, reviewIncreases: [], offerUseLogSince: null, neutralWeeks: {}, freePeriods: [], ...over });
const verifiedOn = (date: string) => ({ at: `${date}T16:00:00Z`, kind: "verified" as const, source: "listing_change" });

// Hair Express-like: active weeks of Oct 19, Oct 26, Nov 9 and Nov 16; R1 met (October 152 vs 102).
const HE = facts({
  actions: ["2026-10-21", "2026-10-28", "2026-11-11", "2026-11-18"].map(verifiedOn),
  insights: [{ month: "2026-10", calls: 60, directions: 92, bookings: 0, websiteClicks: 0 }, { month: "2025-10", calls: 40, directions: 62, bookings: 0, websiteClicks: 0 }],
});

describe("this week's plan, ranked by what it does for the tier (§2c)", () => {
  const kinds = ["posts", "replies", "answers", "photos"] as const;
  test("this week already counts: the Monday post (next week) comes first, 'Do this one first'", () => {
    const ctx = { thisWeek: "2026-11-16", thisWeekCounts: true, postDate: "2026-11-23", connected: true };
    expect(rankWeek([...kinds], ctx)).toEqual({ order: ["posts", "replies", "answers", "photos"], first: "posts" });
    const lines = tierLines([...kinds], ctx, { tier: 3, monday: "2026-11-30" });
    expect(lines.posts).toMatchObject({ key: "goesOutNextWeekTier", first: true, tier: 3, date: "2026-11-30" });
    expect(lines.replies).toMatchObject({ key: "alreadyCounts", first: false });
    expect(lines.photos.key).toBe("photos");
    expect(tierLineText(lines.posts, "en")).toBe("Goes out Mon, Nov 23, so next week counts → Growing on Mon, Nov 30");
    expect(tierLineText(lines.replies, "en")).toBe("Goes out today, in a week that already counts");
    expect(tierLineText(lines.posts, "es")).toMatch(/^Sale el .*Creciendo el /);
  });
  test("this week doesn't count yet: the first task that goes out now comes first", () => {
    const ctx = { thisWeek: "2026-11-16", thisWeekCounts: false, postDate: "2026-11-23", connected: true };
    expect(rankWeek([...kinds], ctx)).toEqual({ order: ["replies", "posts", "answers", "photos"], first: "replies" });
    expect(tierLines([...kinds], ctx, null).replies.key).toBe("makesThisWeek");
  });
  test("not connected: check-offs (2 make a week count)", () => {
    const ctx = { thisWeek: "2026-11-16", thisWeekCounts: false, postDate: null, connected: false };
    expect(tierLines(["posts"], ctx, null).posts.key).toBe("checkOff");
  });
});

describe("the tier state", () => {
  test("Hair Express-like on Sat Nov 21: Building, this week counts, Growing on Mon Nov 30 if next week counts", () => {
    const s = growthState(HE, new Date("2026-11-21T17:00:00Z"));
    expect(s.tier).toBe(2);
    expect(s.thisWeekCounts).toBe(true);
    expect(s.onTrack).toEqual({ tier: 3, monday: "2026-11-30" });
    expect(s.weeks).toHaveLength(8);
    expect(s.weeks.filter((w) => w.active).map((w) => w.weekStart)).toEqual(["2026-10-19", "2026-10-26", "2026-11-09"]);
    expect(s.results.R1).toBe("met");
    expect(s.results.R3).toBe("unavailable");
  });
  test("the dev-only preview tier shows instead, never with a change or warning", () => {
    const s = growthState(HE, new Date("2026-11-21T17:00:00Z"), 4);
    expect(s.tier).toBe(4);
    expect(s.preview).toBe(true);
    expect(s.change).toBeNull();
  });
});

describe("the tier card (mockup 03)", () => {
  const state = growthState(HE, new Date("2026-11-21T17:00:00Z"));
  test("name, Tier N of 5, on track, active weeks (last 8), the 5-step track, To reach … and After that; tier terms only (EN + ES)", () => {
    const html = wrap(<TierCard state={state} testAccount />);
    const words = text(html);
    expect(words).toContain("Your Growth tier · updated Mondays");
    expect(words).toContain("Building");
    expect(words).toContain("Test account");
    expect(words).toContain("Tier 2 of 5");
    expect(words).toContain("On track for Growing on Mon, Nov 30");
    expect(html.match(/data-active="true"/g)?.length).toBe(3);
    expect(words).toContain("Starting out Tier 1 Building Tier 2 · you Growing Tier 3 Thriving Tier 4 Local favorite Tier 5");
    expect(words).toContain("To reach Growing");
    expect(words).toContain("5 active weeks out of the last 6");
    expect(words).toContain("One real result");
    expect(words).toContain("After that: Thriving");
    expect(words).not.toMatch(/\bpts?\b|\/100/);
    expect(text(wrap(<TierCard state={state} testAccount={false} />, "es"))).toContain("Nivel 2 de 5");
  });
  test("one quiet week: the warning, never a surprise drop; a drop says why in plain words", () => {
    const warned = { ...state, warning: true, onTrack: null, keep: "quiet" as const };
    expect(text(wrap(<TierCard state={warned} testAccount={false} />))).toContain("Last week was quiet. One task by Sunday keeps Building; two quiet weeks in a row drop you to Starting out.");
    const dropped = { ...state, tier: 1 as const, change: { kind: "down_quiet" as const, quietWeeks: ["2026-11-30", "2026-12-07"] } };
    expect(text(wrap(<TierCard state={dropped} testAccount={false} />))).toContain("You moved to Starting out: no activity the weeks of Nov 30 and Dec 7. Two active weeks bring Building back.");
    const up = { ...state, change: { kind: "up" as const, activeWeeks: 5, of: 6 } };
    expect(text(wrap(<TierCard state={up} testAccount={false} />))).toContain("You moved up to Building: 5 active weeks and customer actions from Google up on last year.");
  });
});

describe("the tier card's requirement rows: ✓ only when met", () => {
  const state = growthState(HE, new Date("2026-11-21T17:00:00Z"));
  const card = (html: string, tier: number) => html.slice(html.indexOf(`data-testid="tier-needs" data-tier="${tier}"`)).split('data-testid="tier-needs"')[1];
  const row = (html: string, id: string) => html.slice(html.indexOf(`data-testid="${id}"`)).split("</p>")[0];
  test("Hair Express: To reach Growing has one result (met ✓) but 3 of 5 active weeks (open circle) → 1 of 2", () => {
    expect(state.next).toMatchObject({ tier: 3, activeNow: 3, activeWeeks: 5, activeMet: false, resultsNow: 1, resultsMet: true });
    const html = card(wrap(<TierCard state={state} testAccount={false} />), 3);
    expect(row(html, "needs-active")).toContain('data-mark="open"');
    expect(row(html, "needs-active")).not.toContain('data-mark="met"');
    expect(row(html, "needs-active")).not.toContain("data-met");
    expect(row(html, "needs-results")).toContain('data-mark="met"');
    expect(row(html, "needs-results")).toContain('data-met="true"');
    expect(text(row(html, "needs-progress"))).toContain("1 of 2");
  });
  test("Hair Express: Thriving needs two results (one measured); one isn't enough → both rows open, 0 of 2", () => {
    expect(state.after).toMatchObject({ tier: 4, results: 2, measured: 1, resultsNow: 1, resultsMet: false, activeMet: false });
    const html = card(wrap(<TierCard state={state} testAccount={false} />), 4);
    expect(row(html, "needs-active")).toContain('data-mark="open"');
    expect(row(html, "needs-results")).toContain('data-mark="open"');
    expect(row(html, "needs-results")).not.toContain('data-mark="met"');
    expect(text(row(html, "needs-progress"))).toContain("0 of 2");
  });
  test("every row met: green ✓ on both and 2 of 2 (EN + ES)", () => {
    const next = { ...state.next!, activeNow: 5, activeMet: true, resultsMet: true };
    const html = wrap(<TierCard state={{ ...state, next, after: null }} testAccount={false} />);
    expect(row(html, "needs-active")).toContain('data-mark="met"');
    expect(row(html, "needs-results")).toContain('data-mark="met"');
    expect(html).not.toContain('data-mark="open"');
    expect(text(row(html, "needs-progress"))).toContain("2 of 2");
    expect(text(row(wrap(<TierCard state={{ ...state, next, after: null }} testAccount={false} />, "es"), "needs-progress"))).toMatch(/2 de 2/);
  });
  test("results count alone isn't enough: the measured part must hold too", () => {
    expect(resultsRuleMet({ R1: "not_met", R2: "not_met", R3: "unavailable", R4: "met", R5: "unavailable" }, { results: 1, measured: 1 })).toEqual({ now: 1, measuredNow: 0, met: false });
    expect(resultsRuleMet({ R1: "met", R2: "not_met", R3: "unavailable", R4: "met", R5: "unavailable" }, TIER_RULES[4])).toEqual({ now: 2, measuredNow: 1, met: true });
    expect(resultsRuleMet({ R1: "met", R2: "not_checked", R3: "unavailable", R4: "not_met", R5: "unavailable" }, TIER_RULES[4]).met).toBe(false);
  });
  test("Local favorite's stay card: open circle for what isn't met", () => {
    const html = wrap(<TierCard state={{ ...state, tier: 5, next: null, after: null, stay: { activeNow: 11, of: 12, activeOk: true, results: 3, resultsNow: 2, resultsOk: false } }} testAccount={false} />);
    expect(html.slice(html.indexOf('data-testid="top-active"')).split("</li>")[0]).toContain('data-mark="met"');
    const results = html.slice(html.indexOf('data-testid="top-results"')).split("</li>")[0];
    expect(results).toContain('data-mark="open"');
    expect(results).not.toContain("data-met");
  });
});

describe("Free (mockup 06): never a made-up tier", () => {
  test("'?', Locked, what it would measure, real task titles blurred, Grow vs Premium (EN + ES)", () => {
    // The checklist's real habits, the how-to blurred (never the score fixes: those are Fix plan's).
    const habits = weekHabits(new Date("2026-11-27T12:00:00Z"), { reviews: true, photos: false });
    const html = wrap(<GrowthFreePreview businessId="b1" habits={habits} />);
    const words = text(html);
    expect(words).toContain("?");
    expect(words).toContain("Locked");
    expect(words).toContain("Active weeks: the weeks you do something from your plan");
    expect(html).toContain("blur-[3px]");
    expect(words).not.toMatch(/Tier \d|Nivel \d/);
    expect(html).toContain('data-testid="growth-free-grow"');
    expect(html).toContain('data-testid="growth-free-premium"');
    expect(words).toContain("Your weekly habits");
    expect(words).toContain("Ask 3 customers for a review");
    expect(words).not.toContain("Reply to");
    expect(text(wrap(<GrowthFreePreview businessId="b1" habits={habits} />, "es"))).toContain("Bloqueado");
  });
});

describe("wiring (the new design only)", () => {
  test("/growth on the preview is the Growth plan; localhost:3000 keeps today's page", () => {
    const page = readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(page).toContain("if (NEW_PAGES_LIVE) return <GrowthPlanPage businessId={params.id} gbp={searchParams.gbp} />;");
    expect(page.indexOf("if (NEW_PAGES_LIVE) return <GrowthPlanPage")).toBeLessThan(page.indexOf("freeShowroom(params.id"));
  });
  test("More customers: off the Overview on the preview, and off the Growth plan too (the sidebar has those tools)", () => {
    expect(readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8")).toContain("{!NEW_PAGES_LIVE && (\n        <GrowMoreCustomers");
    expect(readFileSync("app/business/[id]/growth/GrowthPlanPage.tsx", "utf8")).not.toContain("growthPlan: true,");
  });
  test("Google results: the numbers only, no task list (the checklist is on Growth plan)", () => {
    const page = readFileSync("app/business/[id]/google-results/page.tsx", "utf8");
    expect(page).not.toContain("TierPlanProvider");
    expect(readFileSync("components/gbp/GoogleResults.tsx", "utf8")).not.toContain('id={"this-week"');
  });
  test("'Since you did this': test offers never for a real owner; the empty state", () => {
    expect(readFileSync("lib/googleActions.server.ts", "utf8")).toContain("filter((p) => opts.includeTestOffers || !p.is_test)");
    expect(readFileSync("components/gbp/GoogleResults.tsx", "utf8")).toContain('page ? "dashboard.growthPlan.sinceNone"');
  });
  test("the Monday job stays off; nothing here saves a tier", () => {
    for (const f of ["lib/growthPlan.server.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/);
  });
});
