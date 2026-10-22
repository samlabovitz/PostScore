import { describe, expect, test } from "vitest";
import {
  COMPETITOR_REFRESH_COOLDOWN_DAYS,
  competitorScanCostRange,
  competitorScanTargets,
  isScanFresh,
  refreshAvailability,
} from "./competitorScanPolicy";

const NOW = new Date("2026-10-16T16:00:00Z");

describe("30-day refresh limit", () => {
  test("never scanned → allowed; 29 days → not yet (with the date); 30 days → allowed", () => {
    expect(COMPETITOR_REFRESH_COOLDOWN_DAYS).toBe(30);
    expect(refreshAvailability(null, NOW)).toEqual({ allowed: true, nextAvailableAt: null });
    expect(refreshAvailability("2026-09-17T16:00:00Z", NOW)).toEqual({ allowed: false, nextAvailableAt: "2026-10-17T16:00:00.000Z" });
    expect(refreshAvailability("2026-09-16T16:00:00Z", NOW)).toEqual({ allowed: true, nextAvailableAt: null });
  });

  test("the monthly report reuses a scan under 30 days old", () => {
    expect(isScanFresh("2026-10-01T00:00:00Z", NOW)).toBe(true);
    expect(isScanFresh("2026-09-10T00:00:00Z", NOW)).toBe(false);
    expect(isScanFresh(null, NOW)).toBe(false);
  });
});

describe("rescan-all competitor flag", () => {
  const businesses = [
    { id: "never", latestCompetitorScanAt: null, plan: "premium" as const },
    { id: "old", latestCompetitorScanAt: "2026-08-01T00:00:00Z", plan: "premium" as const },
    { id: "recent", latestCompetitorScanAt: "2026-10-10T00:00:00Z", plan: "premium" as const },
  ];
  test("without a flag: no competitor scans, ever", () => {
    expect(competitorScanTargets(businesses, { withCompetitors: false, competitorsOnly: false }, NOW)).toEqual([]);
  });
  test("--with-competitors: only businesses due (30+ days or never)", () => {
    expect(competitorScanTargets(businesses, { withCompetitors: true, competitorsOnly: false }, NOW)).toEqual(["never", "old"]);
  });
  test("Free: never refreshed after the first scan — --with-competitors only runs a missing first scan", () => {
    const free = [
      { id: "free-never", latestCompetitorScanAt: null, plan: "free" as const },
      { id: "free-old", latestCompetitorScanAt: "2026-01-01T00:00:00Z", plan: "free" as const },
    ];
    expect(competitorScanTargets(free, { withCompetitors: true, competitorsOnly: false }, NOW)).toEqual(["free-never"]);
    expect(competitorScanTargets(free, { withCompetitors: false, competitorsOnly: true }, NOW)).toEqual(["free-never"]);
  });
  test("--competitors-only (backfill): only businesses with no saved scan", () => {
    expect(competitorScanTargets(businesses, { withCompetitors: false, competitorsOnly: true }, NOW)).toEqual(["never"]);
  });
  test("cost: 1–3 Nearby Search calls at $0.035 each", () => {
    const c = competitorScanCostRange(10);
    expect(c.min).toBeCloseTo(0.35);
    expect(c.max).toBeCloseTo(1.05);
  });
});
