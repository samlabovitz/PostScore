import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { businessRowToScoringInput, scoreBusiness, type BusinessScoringRow, type ScoreBreakdown } from "./scoring";
import { breakdownWithoutQuotes } from "./breakdownStorage";
import { sameTotal, savedScoreMatches, withSavedScore, type SavedScoreRow } from "./savedScore";
import { autoDetectedBizProfile, resolveBizProfile, savedBizTypeId } from "@/config/bizProfiles";

const src = (f: string) => readFileSync(f, "utf8");

const row = (over: Partial<BusinessScoringRow> = {}): BusinessScoringRow =>
  ({
    name: "Hair Express",
    rating: 4.6,
    review_count: 30,
    phone: "(555) 010-0000",
    address: "1 Main St",
    opening_hours: ["Monday: 9:00 AM – 5:00 PM"],
    website: null,
    categories: ["hair_salon"],
    category: "Hair salon",
    primary_type: "hair_salon",
    photo_count: 8,
    business_status: "OPERATIONAL",
    https_status: null,
    website_analysis_json: null,
    ...over,
  }) as BusinessScoringRow;

const saved = (b: ScoreBreakdown, over: Partial<SavedScoreRow> = {}): SavedScoreRow => ({
  id: "s1",
  total: b.total,
  grade: b.grade,
  scoring_version: b.scoringVersion,
  breakdown_json: JSON.parse(JSON.stringify(breakdownWithoutQuotes(b))),
  ...over,
});

describe("pages show the saved score (Day 23 2d-1)", () => {
  test("the saved scan's total, grade and points, with today's words", () => {
    const then = scoreBusiness(businessRowToScoringInput(row({ review_count: 3 })));
    const now = scoreBusiness(businessRowToScoringInput(row()));
    expect(now.total).not.toBe(then.total);
    const shown = withSavedScore(now, saved(then))!;
    expect(shown.total).toBe(then.total);
    expect(shown.grade).toBe(then.grade);
    const count = (b: ScoreBreakdown) => b.checks.find((c) => c.id === "visibility.review_count")!;
    expect(count(shown).earnedPoints).toBe(count(then).earnedPoints);
    expect(count(shown).explanation).toBe(count(now).explanation);
    expect(count(shown).explanation).not.toBe("");
    const visibility = (b: ScoreBreakdown) => b.categories.find((c) => c.id === "visibility")!;
    expect(visibility(shown).earnedPoints).toBe(visibility(then).earnedPoints);
    expect(visibility(shown).checks.find((c) => c.id === "visibility.review_count")!.earnedPoints).toBe(count(then).earnedPoints);
    expect(savedScoreMatches(now, shown)).toBe(false);
    expect(sameTotal(now, saved(then))).toBe(false);
    expect(sameTotal(now, saved(now))).toBe(true);
    expect(sameTotal(now, saved(now, { scoring_version: "1.0.0" }))).toBe(false);
  });

  test("an unchanged business shows exactly today's breakdown", () => {
    const now = scoreBusiness(businessRowToScoringInput(row()));
    const shown = withSavedScore(now, saved(now))!;
    expect(savedScoreMatches(now, shown)).toBe(true);
    expect(shown).toEqual(now);
  });

  test("no saved scan, another scoring version or another set of checks: no stand-in (a new scan is saved first)", () => {
    const now = scoreBusiness(businessRowToScoringInput(row()));
    expect(withSavedScore(now, null)).toBeNull();
    expect(withSavedScore(now, saved(now, { scoring_version: "1.0.0" }))).toBeNull();
    const fewer = { ...now, checks: now.checks.slice(1) };
    expect(withSavedScore(now, saved(fewer))).toBeNull();
    expect(withSavedScore(now, saved(now, { breakdown_json: null }))).toBeNull();
  });

  test("every page, report and notification reads the saved scan; only a changed check set (a scoring update) saves a new one first, the preview never writes", () => {
    const scoring = src("app/actions/scoring.ts");
    expect(scoring).toContain("return scoreForDisplayWithClient(supabase, businessId, locale);");
    // Day 23 2d-4: a Google change never saves a scan from a page (it's marked instead).
    expect(scoring).toMatch(/if \(shown\) return \{ \.\.\.scored, business, scoringBusiness, result: \{ \.\.\.scored\.result, breakdown: shown \} \};[\s\S]{0,300}if \(saved && options\.save !== false && scored\.live !== "unavailable"\) await syncScoreSnapshotWithClient\(supabase, businessId, "page"\);/);
    expect(src("app/api/cron/monthly-reports/route.ts")).toContain("await scoreForDisplayWithClient(supabase, businessId, locale)");
    expect(src("scripts/preview-report.ts")).toContain("(supabase, businessId, locale, { save: false })");
    expect(src("lib/notifications.server.ts")).toContain("urgentIssuesFromSavedRow(row, await latestSavedScore(admin, row.id))");
    expect(src("app/actions/actionPlan.ts")).toContain("withSavedScore(now, await latestSavedScore(supabase, businessId), { liveUnavailable:");
    expect(src("app/actions/reviews.ts")).toContain("withSavedScore(now, await latestSavedScore(supabase, businessId), { liveUnavailable:");
    expect(src("app/actions/website.ts")).toContain("withSavedScore(realNow, await latestSavedScore(supabase, businessId), { liveUnavailable:");
    // The switcher: the saved scan's own total and grade, no re-score.
    expect(src("app/actions/businesses.ts")).toContain("const breakdown = last ? { total: last.total, grade: last.grade as Grade } : null;");
  });
});

describe("our own saved business type (Day 23 2d-1)", () => {
  test("a scan saves our reading of Google's category and types, never the category", () => {
    expect(savedBizTypeId("Hair salon", "hair_salon", ["hair_salon"])).toBe(resolveBizProfile("Hair salon", "hair_salon", null, "en", ["hair_salon"], null).id);
    expect(src("app/actions/businesses.ts")).toContain("biz_type_resolved: savedBizTypeId(place.primaryCategory, place.primaryType, place.categories),");
  });

  test("with Google's category gone, the saved type gives the same answer; the owner's correction and the name still win", () => {
    const saved = savedBizTypeId("Hair salon", "hair_salon", ["hair_salon"]);
    expect(resolveBizProfile(null, null, null, "en", null, "Hair Express", saved).id).toBe(resolveBizProfile("Hair salon", "hair_salon", null, "en", ["hair_salon"], "Hair Express").id);
    expect(resolveBizProfile(null, null, "barbershop", "en", null, "Hair Express", saved).id).toBe("barbershop");
    // A YMCA typed "gym" by Google: the name decides, as before.
    const gym = savedBizTypeId("Gym", "gym", ["gym"]);
    expect(resolveBizProfile(null, null, null, "en", null, "Downtown YMCA", gym).id).toBe(resolveBizProfile("Gym", "gym", null, "en", ["gym"], "Downtown YMCA").id);
    // A legal Google type beats the name, as before.
    const legal = savedBizTypeId("Consultant", "consultant", ["consultant", "lawyer"]);
    expect(legal).toBe("lawyer");
    expect(resolveBizProfile(null, null, null, "en", null, "Community Center Legal Aid", legal).id).toBe("lawyer");
    // No saved type yet: Google's fields, as before.
    expect(resolveBizProfile("Hair salon", "hair_salon", null, "en", ["hair_salon"], "Hair Express", null).id).toBe(saved);
  });

  test("Settings' and PostAI's 'auto-detected' type is the saved reading", () => {
    expect(autoDetectedBizProfile(null, null, "en", null, "barbershop").id).toBe("barbershop");
    expect(autoDetectedBizProfile("Hair salon", "hair_salon", "en", ["hair_salon"], null).id).toBe(savedBizTypeId("Hair salon", "hair_salon", ["hair_salon"]));
    expect(src("app/business/[id]/settings/page.tsx")).toContain("autoDetectedBizProfile(business.category, business.primary_type, locale, business.categories, business.biz_type_resolved)");
  });
});
