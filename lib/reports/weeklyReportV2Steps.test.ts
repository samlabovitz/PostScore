import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { distinctBullets, distinctRecs, planStep, recChecks, sameInstruction } from "./weeklyReportV2Data.server";
import { pointsText } from "@/lib/pointRange";
import { t } from "@/lib/i18n";
import type { Recommendation } from "@/lib/overviewTiles";

// Page 2 (and page 1's top 3) never show two steps for the same check —
// the real Lulu's Tacos case: "Link your website on Google" and "Get a
// website" both about the listing's website link. The higher-priority one
// stays; the next real step fills the place.

const task = (checkId: string, mergedCheckIds?: string[]): Recommendation =>
  ({ key: checkId, source: { kind: "task", task: { checkId, mergedCheckIds } }, points: 4, pointsHigh: null, priority: null, href: "", linkLabel: null, pending: false, urgent: false }) as unknown as Recommendation;
const banner = (kind: "improve" | "get_website"): Recommendation =>
  ({ key: kind, source: { kind: "website", banner: kind === "improve" ? { kind, score: 80, earned: 28, of: 30, improvements: 2, points: 2 } : { kind, low: 30, high: null } }, points: 30, pointsHigh: null, priority: null, href: "", linkLabel: null, pending: false, urgent: false }) as unknown as Recommendation;

describe("distinct steps", () => {
  test("Lulu's Tacos: phone, website link, get a website, reviews → the website link stays, reviews fills the third place", () => {
    const picked = distinctRecs([task("completeness.phone"), task("completeness.website_link"), banner("get_website"), task("visibility.review_count")], 3);
    expect(picked.map((r) => r.key)).toEqual(["completeness.phone", "completeness.website_link", "visibility.review_count"]);
  });

  test("the higher-priority one stays whichever comes first", () => {
    expect(distinctRecs([banner("get_website"), task("completeness.website_link"), task("completeness.hours")], 3).map((r) => r.key)).toEqual(["get_website", "completeness.hours"]);
  });

  test("the merged reviews card covers its checks; “improve your website” covers every website check", () => {
    expect(distinctRecs([task("visibility.reviews_merged", ["visibility.review_count", "visibility.review_recency"]), task("visibility.review_recency"), task("completeness.hours")], 3).map((r) => r.key)).toEqual(["visibility.reviews_merged", "completeness.hours"]);
    expect(distinctRecs([banner("improve"), task("website.about_presence"), task("completeness.phone")], 3).map((r) => r.key)).toEqual(["improve", "completeness.phone"]);
    expect(recChecks(banner("get_website"))).toEqual(["website.has_website", "completeness.website_link"]);
  });

  test("never more than asked, and fewer when fewer real steps exist", () => {
    expect(distinctRecs([task("a"), task("b"), task("c"), task("d")], 3)).toHaveLength(3);
    expect(distinctRecs([task("a"), task("a")], 3)).toHaveLength(1);
  });
});

describe("inside a step", () => {
  // Lulu's Tacos' real phone step (Spanish): the action and the fix say the same thing.
  const ADD = t("es", "content.actionPlan.completeness.phone.action");
  const UPDATE = t("es", "content.actionPlan.completeness.phone.fix");

  test("never the same instruction twice (Lulu's phone step: “Agregue…” and “Actualice…”)", () => {
    expect(sameInstruction(ADD, UPDATE)).toBe(true);
    expect(sameInstruction(ADD, "Pida una reseña al final de cada visita.")).toBe(false);
    const step = { label: "", title: t("es", "content.actionPlan.title.completeness.phone"), urgent: false, minutes: 5, points: "+4 pts", summary: "", why: "", bullets: [ADD, UPDATE], script: null };
    expect(distinctBullets(step).bullets).toEqual([ADD]);
  });

  const ctx = { locale: "en" as const, profileId: "restaurant", name: "Lulu's Tacos", typeLabel: null, town: null, rating: 4.5, reviewCount: 187, checks: [], hasMetaDescription: null };
  const replies = { ...task("visibility.review_replies"), source: { kind: "task", task: { checkId: "visibility.review_replies", label: "Reply to your reviews", action: "Reply to your recent reviews", fix: "Open your reviews on Google (or draft replies in PostScore's reply drafter), then post a reply.", why: "Customers read how you answer." } } } as unknown as Recommendation;

  test("Premium with Google connected: a step with a built editor points to “Fix it with PostScore”, not Google", () => {
    const step = planStep(replies, { ...ctx, fixInApp: true });
    expect(step.bullets.join(" ")).toContain("In PostScore, open Reviews and click “Fix it with PostScore”.");
    expect(step.bullets.join(" ")).not.toContain("Open your reviews on Google");
    expect(planStep(replies, { ...ctx, fixInApp: false }).bullets.join(" ")).toContain("Open your reviews on Google");
    // No editor for this check: unchanged.
    expect(planStep(task("visibility.photos"), { ...ctx, fixInApp: true }).bullets.join(" ")).not.toContain("Fix it with PostScore");
  });

  test("plurals: “+1 pt”, “+4 pts” (EN + ES)", () => {
    expect(pointsText("en", 1)).toBe("+1 pt");
    expect(pointsText("en", 4)).toBe("+4 pts");
    expect(pointsText("en", 1, true)).toBe("about +1 pt");
    expect(pointsText("es", 1)).toBe("+1 pt");
    expect(pointsText("es", 3, true)).toBe("unos +3 pts");
    expect(t("en", "dashboard.reports.v2.website.summary.one", { earned: 28, of: 30 })).toBe("Your website scores 28/30, with 1 improvement available.");
  });
});
