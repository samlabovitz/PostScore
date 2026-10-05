import { describe, expect, test } from "vitest";
import { growthMoveOverlapsActionPlan, type OverlapCheckableTask } from "./growthMoveOverlap";

function task(checkId: string, mergedCheckIds: string[] | null = null): OverlapCheckableTask {
  return { checkId, mergedCheckIds };
}

describe("growthMoveOverlapsActionPlan", () => {
  test("improve_website overlaps when a real Performance & mobile task is open", () => {
    const openTasks = [task("website.performance_mobile")];
    expect(growthMoveOverlapsActionPlan("improve_website", openTasks)).toBe(true);
  });

  test("improve_website overlaps when a real Contact & conversion task is open", () => {
    const openTasks = [task("website.contact_conversion")];
    expect(growthMoveOverlapsActionPlan("improve_website", openTasks)).toBe(true);
  });

  test("improve_website does NOT overlap when neither of its real checks is currently open", () => {
    const openTasks = [task("visibility.review_count"), task("completeness.hours")];
    expect(growthMoveOverlapsActionPlan("improve_website", openTasks)).toBe(false);
  });

  test("add_photos_vs_competitors overlaps when the real Photos check is open (the 0-photos case)", () => {
    const openTasks = [task("completeness.photos")];
    expect(growthMoveOverlapsActionPlan("add_photos_vs_competitors", openTasks)).toBe(true);
  });

  test("add_photos_vs_competitors does NOT overlap when Photos isn't open (the 1-9 photos case — that check is already at full points)", () => {
    const openTasks = [task("website.performance_mobile"), task("visibility.rating")];
    expect(growthMoveOverlapsActionPlan("add_photos_vs_competitors", openTasks)).toBe(false);
  });

  test("start_coupon never overlaps — coupons are never a scored check, regardless of what's open", () => {
    const openTasks = [task("completeness.photos"), task("website.performance_mobile")];
    expect(growthMoveOverlapsActionPlan("start_coupon", openTasks)).toBe(false);
  });

  test("start_referral never overlaps — referrals are never a scored check", () => {
    const openTasks = [task("completeness.photos")];
    expect(growthMoveOverlapsActionPlan("start_referral", openTasks)).toBe(false);
  });

  test("run_price_check never overlaps — pricing is never a scored check", () => {
    const openTasks = [task("website.performance_mobile")];
    expect(growthMoveOverlapsActionPlan("run_price_check", openTasks)).toBe(false);
  });

  test("build_starter_site overlaps via a merged website card's real mergedCheckIds, not just its own checkId", () => {
    const openTasks = [task("website.starter_site_merged", ["website.has_website", "completeness.website_link"])];
    expect(growthMoveOverlapsActionPlan("build_starter_site", openTasks)).toBe(true);
  });

  test("no overlap at all when the open-task list is empty", () => {
    expect(growthMoveOverlapsActionPlan("improve_website", [])).toBe(false);
    expect(growthMoveOverlapsActionPlan("add_photos_vs_competitors", [])).toBe(false);
  });
});
