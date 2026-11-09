import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The Urgent layer (Nov 9): customers hit a dead end or wrong info right
// now. It decides ORDER everywhere — never points. Pure; no Google calls.

import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { scoreBusiness, generateSuggestions, type BusinessScoringInput, type WebsiteTrustAnalysis } from "@/lib/scoring";
import { applyGrowthWebsiteRules, buildActionPlan, mergeReviewTasks, orderWeeklySteps } from "@/lib/actionPlan";
import { biggestBoostFrom, recommendationPriority, reportNextSteps, topRecommendations } from "@/lib/overviewTiles";
import { isUrgentTask, orderByUrgency, urgentCheckIds, urgentIssueForCheck, urgentIssues } from "@/lib/urgency";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import { LocaleProvider, t, type Locale } from "@/lib/i18n";

const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>);

function trust(overrides: Partial<WebsiteTrustAnalysis> = {}): WebsiteTrustAnalysis {
  return {
    spamSignals: [],
    safeBrowsingThreat: null,
    safeBrowsingChecked: true,
    infoConflicts: [
      { field: "phone", comparison: "matches", siteValue: "555-0100", googleValue: "555-0100" },
      { field: "address", comparison: "matches", siteValue: "44 Riverside Ave", googleValue: "44 Riverside Ave" },
    ],
    staleNotices: [],
    abandonedSignals: { newestDateFound: "2026-10-01", templateLeftovers: [], looksAbandoned: false },
    websiteKind: "independent",
    listingLinkBroken: false,
    checkedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as WebsiteTrustAnalysis;
}

function withTrust(t: WebsiteTrustAnalysis, overrides: Partial<BusinessScoringInput> = {}): BusinessScoringInput {
  const base = scoringInput();
  return { ...base, websiteAnalysis: { ...base.websiteAnalysis!, websiteTrust: t }, ...overrides };
}

/** The real Colorful Yun Nan shape: the listing links to a parked domain,
 * the verified real site is graded, and its phone differs from Google's. */
const CYN = withTrust(
  trust({
    listingLinkBroken: true,
    listingLinkParked: true,
    listingLinkErrorPageUrl: "https://www.colorfulyunnanorder.com/",
    infoConflicts: [
      { field: "phone", comparison: "conflicts", siteValue: "302-894-1998", googleValue: "+1 302-318-6743" },
      { field: "address", comparison: "matches", siteValue: "59 e main st", googleValue: "59 E Main St" },
    ],
  }),
  { website: "https://www.colorfulyunnanorder.com/", verifiedElsewhereUrl: "https://newarkcolorfulyunnan.com/", reviewCount: 40, rating: 4.1 }
);

function planFor(input: BusinessScoringInput) {
  const breakdown = scoreBusiness(input);
  const tasks = applyGrowthWebsiteRules(mergeReviewTasks(buildActionPlan(breakdown, generateSuggestions(breakdown), [], input), breakdown, input), input);
  const issues = urgentIssues(input, breakdown);
  return { breakdown, issues, tasks: orderByUrgency(tasks, issues) };
}

describe("what's urgent — exactly the six, nothing else", () => {
  test("Colorful Yun Nan: the parked website link and the phone mismatch", () => {
    expect(planFor(CYN).issues).toEqual(["listing_link", "phone_mismatch"]);
  });

  test("a normal business: nothing", () => {
    expect(planFor(withTrust(trust())).issues).toEqual([]);
  });

  test("no phone, no hours on the listing", () => {
    expect(planFor(withTrust(trust(), { phone: null, openingHours: null })).issues).toEqual(["no_phone", "no_hours"]);
  });

  test("website down (no answer at all) — never a timeout, a bot block or an HTTP error", () => {
    const down = (reason: "down" | "timed_out" | "blocked_automated_check" | "http_error") => {
      const base = withTrust(trust(), { httpsStatus: "unreachable" });
      return planFor({ ...base, websiteAnalysis: { ...base.websiteAnalysis!, httpsUnreachableReason: reason } }).issues;
    };
    expect(down("down")).toEqual(["site_down"]);
    expect(down("timed_out")).toEqual([]);
    expect(down("blocked_automated_check")).toEqual([]);
    expect(down("http_error")).toEqual([]);
  });

  test("flagged unsafe by Safe Browsing (spam signals alone aren't)", () => {
    expect(planFor(withTrust(trust({ safeBrowsingThreat: { threatFound: true, threatTypes: ["MALWARE"] } }))).issues).toEqual(["site_unsafe"]);
  });

  test("an address or hours mismatch, or a phone mismatch the owner said is fine, isn't urgent", () => {
    const addressOnly = trust({ infoConflicts: [{ field: "address", comparison: "conflicts", siteValue: "1 Elm", googleValue: "44 Riverside Ave" }] });
    expect(planFor(withTrust(addressOnly)).issues).toEqual([]);
    const phone = trust({ infoConflicts: [{ field: "phone", comparison: "conflicts", siteValue: "555-0199", googleValue: "555-0100" }] });
    expect(planFor(withTrust(phone, { websiteTrustOverrides: [{ key: "info_conflict:phone", at: "2026-11-01T00:00:00Z" } as never] })).issues).toEqual([]);
  });

  test("a website-only business: nothing about a Google listing is urgent", () => {
    const input = withTrust(trust(), { phone: null, openingHours: null });
    expect(urgentIssues(input, scoreBusiness(input), { hasListing: false })).toEqual([]);
  });

  test("which checks fix which issue", () => {
    expect(urgentIssueForCheck("completeness.website_link", ["listing_link"])).toBe("listing_link");
    expect(urgentIssueForCheck("website.info_consistency", ["phone_mismatch"])).toBe("phone_mismatch");
    expect(urgentIssueForCheck("website", ["site_down"])).toBe("site_down");
    expect(urgentIssueForCheck("visibility.review_count", ["listing_link", "phone_mismatch"])).toBeNull();
    expect(urgentCheckIds(["no_phone", "no_hours"])).toEqual(["completeness.phone", "completeness.hours"]);
    expect(isUrgentTask({ checkId: "visibility.reviews_merged", mergedCheckIds: ["visibility.rating"] }, ["listing_link"])).toBe(false);
  });
});

describe("order, not points", () => {
  test("Colorful Yun Nan: the website link and the phone mismatch come first, ahead of reviews — same points as before", () => {
    const { breakdown, tasks, issues } = planFor(CYN);
    const recs = topRecommendations(tasks, null, "cyn", {}, 3, issues);
    expect(recs.slice(0, 2).map((r) => r.key).sort()).toEqual(["completeness.website_link", "website.info_consistency"]);
    expect(recs.slice(0, 2).every((r) => r.urgent && r.priority === "urgent")).toBe(true);
    // Scores are untouched: urgency is computed from the breakdown, never fed back.
    expect(scoreBusiness(CYN).total).toBe(breakdown.total);
    // Each urgent card keeps its real points.
    const unordered = applyGrowthWebsiteRules(mergeReviewTasks(buildActionPlan(breakdown, generateSuggestions(breakdown), [], CYN), breakdown, CYN), CYN);
    for (const r of recs) expect(r.points).toBe(unordered.find((x) => x.checkId === r.key)!.weightedPoints);
  });

  test("Biggest boost stays points-only: the open item worth the most, never picked by urgency", () => {
    const { tasks, issues } = planFor(CYN);
    const all = topRecommendations(tasks, null, "cyn", {}, Infinity, issues);
    // The list starts with the urgent website link; Biggest boost is the reviews card.
    expect(all[0].urgent).toBe(true);
    const boost = biggestBoostFrom(all, [], "en")!;
    const most = all.filter((r) => !r.pending).reduce((a, r) => (r.points > a.points ? r : a));
    expect(most.urgent).toBe(false);
    expect(boost.label).toBe(most.source.kind === "task" ? most.source.task.label : "");
    expect(boost.weightedPoints).toBe(most.pointsHigh ?? most.points);
  });

  test("Biggest boost reads the full list: three urgent items can't hide the biggest one", () => {
    const { tasks } = planFor(withTrust(trust({ infoConflicts: [{ field: "phone", comparison: "conflicts", siteValue: "555-0199", googleValue: "555-0100" }] }), { phone: "555-0100", openingHours: null, reviewCount: 3 }));
    const issues = ["phone_mismatch", "no_hours"] as const;
    const all = topRecommendations(orderByUrgency(tasks, [...issues]), null, "b", {}, Infinity, [...issues]);
    const top3 = all.slice(0, 3);
    const most = all.filter((r) => !r.pending).reduce((a, r) => (r.points > a.points ? r : a));
    expect(biggestBoostFrom(all, [], "en")!.weightedPoints).toBe(most.pointsHigh ?? most.points);
    expect(biggestBoostFrom(top3, [], "en")!.weightedPoints).toBeLessThanOrEqual(biggestBoostFrom(all, [], "en")!.weightedPoints);
  });

  test("the Overview and PostAI hand Biggest boost the full list", () => {
    const src = (p: string) => readFileSync(p, "utf8");
    expect(src("app/business/[id]/page.tsx")).toContain("topRecommendations(actionPlan.tasks, actionPlan.websiteBanner, params.id, linkOptions, Infinity, actionPlan.urgentIssues)");
    expect(src("app/business/[id]/BusinessScoreView.tsx")).toContain("recommendations={recommendations?.slice(0, TOP_RECOMMENDATIONS) ?? null}");
    expect(src("app/actions/assistant.ts")).toContain("topRecommendations(actionPlanResult.tasks, actionPlanResult.websiteBanner, businessId, {}, Infinity, actionPlanResult.urgentIssues)");
  });

  test("marked-done items still go after every open one, urgent or not", () => {
    const { tasks, issues } = planFor(CYN);
    const done = tasks.map((x) => (x.checkId === "completeness.website_link" ? { ...x, status: "pending_verification" as const } : x));
    const recs = topRecommendations(done, null, "cyn", {}, Infinity, issues);
    expect(recs[recs.length - 1].key).toBe("completeness.website_link");
    expect(reportNextSteps(recs).some((r) => r.key === "completeness.website_link")).toBe(false);
    expect(reportNextSteps(recs)[0].key).toBe("website.info_consistency");
  });

  test("the Growth weekly plan's steps: urgent first, then points, setup last", () => {
    const steps = orderWeeklySteps([
      { weightedPoints: 9, effort: "quick_win" as const, urgent: false, id: "reviews" },
      { weightedPoints: 1, effort: "quick_win" as const, urgent: true, id: "phone" },
      { weightedPoints: 0, effort: "setup" as const, urgent: false, id: "connect" },
      { weightedPoints: 3, effort: "quick_win" as const, urgent: true, id: "link" },
    ]);
    expect(steps.map((s) => s.id)).toEqual(["link", "phone", "reviews", "connect"]);
  });

  test("the website summary is urgent when the site is down", () => {
    const banner = { kind: "improve", points: 4, improvements: 2, earned: 20, of: 30 } as never;
    const recs = topRecommendations([], banner, "b", {}, 3, ["site_down"]);
    expect(recs[0]).toMatchObject({ key: "website", urgent: true, priority: "urgent" });
  });

  test("priority labels: Urgent above High whatever the points", () => {
    expect(recommendationPriority(0.4, true)).toBe("urgent");
    expect(recommendationPriority(6)).toBe("high");
  });
});

describe("what the owner sees", () => {
  test("the red Urgent label and the footer note (EN + ES)", () => {
    const { tasks, issues } = planFor(CYN);
    const recs = topRecommendations(tasks, null, "cyn", {}, 3, issues);
    const en = wrap(<TopRecommendations businessId="cyn" recommendations={recs} />);
    expect(en).toContain('data-priority="urgent"');
    expect(en).toContain(">Urgent<");
    expect(en).toContain("Urgent: customers are hitting a problem right now.");
    const es = wrap(<TopRecommendations businessId="cyn" recommendations={recs} />, "es");
    expect(es).toContain(">Urgente<");
    expect(es).toContain("Urgente: sus clientes están teniendo un problema ahora mismo.");
  });

  test("the Overview has no red alert banner (urgent issues are in-app notifications instead)", () => {
    expect(readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8")).not.toContain("UrgentAlert");
  });

  test("every issue has its copy and fix label in both languages", () => {
    for (const locale of ["en", "es"] as const) {
      for (const issue of ["site_down", "site_unsafe", "phone_mismatch", "no_phone", "no_hours"] as const) {
        expect(t(locale, `dashboard.urgent.issue.${issue}`)).not.toContain("dashboard.");
        expect(t(locale, `dashboard.urgent.fix.${issue}`)).not.toContain("dashboard.");
      }
    }
  });
});
