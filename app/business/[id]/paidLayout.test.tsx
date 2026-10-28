import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

// Grow, Premium and Multi keep each page's layout and order from before the
// Free redesign (commit 1623491). The only intended paid-plan changes:
// the review goal ("beat the leader") on the Overview, Growth's review task,
// Reviews and Competitors; Grow's "How to run it" guides on Campaigns; and
// the Website page's two paths (tested in components/plan/FreeWebsite.test.tsx).
// Each test lists the page's components in order, as they were.

const read = (f: string) => readFileSync(f, "utf8");
/** Every component tag in order (icons left out). */
// The Google Maps attribution (required by Google's terms, tested in
// lib/googleMapsAttribution.test.tsx) is left out of the layout lists.
const tags = (src: string) => Array.from(src.matchAll(/<([A-Z][A-Za-z]+)/g), (m) => m[1]).filter((tag) => !tag.startsWith("Icon") && tag !== "GoogleMapsAttribution");
const without = (list: string[], drop: string[]) => list.filter((tag) => !drop.includes(tag));

describe("paid plans keep their pre-batch layout, page by page", () => {
  test("Overview (Free's structure): header, score, breakdown, More customers, then rank, next steps, since last scan, PostStudio, live listing, history — no PostAI card", () => {
    const view = read("app/business/[id]/BusinessScoreView.tsx");
    const paid = view.slice(view.indexOf('  return (\n    <div className="flex flex-col gap-5 nav:gap-6">'));
    expect(without(tags(paid), ["Card", "SectionHeading", "Link", "RankUnlockLine"]).filter((tag) =>
      ["HackedSiteBanner", "ScoreBand", "RescanMessages", "AssistantLauncher", "GrowMoreCustomers", "LocalBenchmarkTile", "ScoreBreakdownPanel", "TopRecommendations", "SinceLastScanCard", "StudioComingSoon", "LiveListingSection", "ScanHistory"].includes(tag)
    )).toEqual(["HackedSiteBanner", "ScoreBand", "RescanMessages", "ScoreBreakdownPanel", "GrowMoreCustomers", "LocalBenchmarkTile", "TopRecommendations", "SinceLastScanCard", "StudioComingSoon", "LiveListingSection", "ScanHistory"]);
    // The header is the same block as before, just shared with Free.
    expect(paid.indexOf("{header}")).toBeLessThan(paid.indexOf("<ScoreBand"));
    expect(paid).not.toMatch(/FreePostAI|FreeReviews|UnlockMore|locked\b/);
  });

  test("Growth: celebration, routine, Premium connect card (Grow too), plan, bigger projects, completed, ways to grow, Google Profile", () => {
    const view = read("app/business/[id]/growth/GrowthView.tsx");
    const paid = view.slice(view.indexOf("<WeeklyGoalCelebration"));
    expect(without(tags(paid), ["ReviewGoalLinesContext", "FreeGrowthMoves"])).toEqual([
      "WeeklyGoalCelebration", "ProjectedSummary", "WeeklyChecklist", "Card", "SectionHeading", "PremiumConnectCard", "TaskListCard", "SectionHeading", "WebsiteBannerCard", "TaskListCard", "CompletedTasksCard", "SectionHeading", "GrowthMoveCard", "GoogleProfilePanel",
    ]);
    expect(view).toContain("{!gbpConnected && !actionPlan.weeklyTasks.some((task) => task.checkId === CONNECT_GOOGLE_STEP_ID) && (");
  });

  test("Campaigns: Grow and Premium open on All campaigns — the tracking home — then the design-only Coupons and Referrals; Grow's guides", () => {
    const view = read("app/business/[id]/campaigns/CampaignsView.tsx");
    const body = view.slice(view.indexOf("  return (\n"));
    expect(without(tags(body), ["HowToRunIt"])).toEqual(["Link", "SegmentedControl", "Card", "AllCampaigns", "Card", "SectionTitle", "SoonList", "SoonRow", "SoonRow", "SoonRow", "CouponsSection", "ReferralSection"]);
    expect(view).toContain('const tab = campaignsTabFromParam(searchParams.get("tab"), profile);');
    expect(view).not.toContain("LockedPreview");
    expect(view).toContain('{plan === "grow" && (tab === "coupons" || tab === "referrals") && <HowToRunIt kind={tab} />}');
  });

  test("Reviews: stats, the review link & sign, the guide, counter tools, social proof, the rubric, replies — plus the review goal and 'Reply to a review' (the AI reply drafts)", () => {
    const view = read("app/business/[id]/website-reviews/ReviewsView.tsx");
    expect(without(tags(view), ["ReviewGapLine"])).toEqual([
      "Card", "ProgressBar", "SectionHeading", "StatCard", "StatCard", "Pill", "Pill", "Card", "Link", "GetMoreReviews", "ReviewGuide", "CounterTools", "ReviewSocialProof", "SectionHeading", "CategoryCard", "GbpReplyCheckConnect", "ReviewReplyDrafter", "ComingSoonCard", "ConnectToUnlockCard", "ComingSoonCard",
    ]);
    // Premium/Multi: the honest replies line (posting for them is coming soon).
    expect(view).toContain('{isPremiumPlan(plan) && (\n          <p data-testid="ai-replies-soon"');
  });

  test("Competitors: unchanged apart from the review goal card (and Free's locked Refresh), plus the one-time competitor-picking note, the distance note and “Also nearby”", () => {
    const view = read("app/business/[id]/competitors/CompetitorsView.tsx");
    const goalFn = view.indexOf("function CompetitorsReviewGoal(");
    const withoutGoal = view.slice(0, goalFn) + view.slice(view.indexOf("\n}\n", goalFn) + 3);
    const freeStart = withoutGoal.indexOf('if (upgrade?.plan === "free")');
    const paidOnly = withoutGoal.slice(0, freeStart) + withoutGoal.slice(withoutGoal.indexOf("    );\n", freeStart) + 7);
    expect(without(tags(paidOnly), ["CompetitorsReviewGoal"])).toEqual([
      "GetCompetitorsResult", "CompareView", "CompareView", "CompetitorScope", "Link", "ScoringProgressNote", "CompetitorSelectionNote", "ScanInfo", "Card", "Card", "RefreshButton", "Card", "RefreshButton", "Hero", "CompetitorGroups", "SegmentedControl", "CompareView", "Comparison", "LeadTrail", "SectionHeading", "DistanceNote", "RankedList", "AlsoNearby", "OverTime", "OkResult", "RefreshButton", "Button", "Card", "Lineup", "Stat", "Stat", "Stat", "Stat", "Lane", "HTMLDivElement", "Card", "Bar", "Bar", "Bar", "Bar", "Bar", "Bar", "Link", "Card", "GapItem", "Card", "GapItem", "CompetitorCard", "CheckDetail", "Card",
    ]);
  });

  test("Price check, Reports and Settings: the same pages (Free gets its showroom first)", () => {
    expect(tags(read("app/business/[id]/pricing/page.tsx"))).toEqual(["DashboardShell", "Card", "DashboardShell", "Card", "DashboardShell", "StaleScanNotice", "PricingView"]);
    expect(tags(read("app/business/[id]/reports/page.tsx"))).toEqual(["DashboardShell", "StaleScanNotice", "ReportsView"]);
    expect(tags(read("app/business/[id]/settings/page.tsx"))).toEqual([
      "DashboardShell", "Link", "SettingsNav", "SettingsSection", "BusinessLanguageToggle", "SettingsSection", "Link", "Link", "Link", "SettingsSection", "PlanCard", "CancelPlanButton", "Link", "SettingsSection", "MonthlyEmailFreeNote", "MonthlyEmailReportCard", "Card", "UnsubscribeAllButton", "SettingsSection", "NichePicker", "BusinessTypeSetting", "SettingsSection", "LegalLinks", "SavedToast",
    ]);
  });

  test("the bottom of the pages: Grow sees the Premium card; Premium and Multi nothing (PostStudio's one mention is the Website card)", async () => {
    const { promoCardsFor } = await import("@/lib/upgradePromos");
    expect(promoCardsFor("grow")).toEqual(["premium"]);
    expect(promoCardsFor("premium")).toEqual([]);
    expect(promoCardsFor("multi")).toEqual([]);
  });

  test("locks on Grow look as they did (one link / button / chip); only the box they open is new", () => {
    const trigger = read("components/upgrade/UpgradeTrigger.tsx");
    expect(trigger).toContain('if (up.plan !== "free") {');
    expect(read("components/studio/StudioControls.tsx")).toContain('<UpgradeTrigger feature="designs" variant="button" label={t(locale, "dashboard.upgrade.trigger.unlockPremium")} />');
  });
});
