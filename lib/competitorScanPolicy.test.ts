import { describe, expect, test } from "vitest";
import {
  COMPETITOR_REFRESH_COOLDOWN_DAYS,
  competitorScanCostRange,
  competitorScanTargets,
  isScanFresh,
  competitorRefreshAvailability,
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

describe("competitorRefreshAvailability: by plan", () => {
  const AT = "2026-10-29T12:00:00Z";
  const at = (iso: string) => new Date(iso);
  test("no scan yet: every plan, right away", () => {
    for (const plan of ["free", "grow", "premium", "multi"] as const) expect(competitorRefreshAvailability(plan, null, at(AT))).toEqual({ allowed: true, nextAvailableAt: null });
  });
  test("Free: never after the first scan — unless it found no competitors", () => {
    expect(competitorRefreshAvailability("free", AT, at("2027-01-01T00:00:00Z"))).toEqual({ allowed: false, nextAvailableAt: null });
    expect(competitorRefreshAvailability("free", AT, at("2026-10-29T13:00:00Z"), true)).toEqual({ allowed: true, nextAvailableAt: null });
  });
  test("Grow: once every 7 days", () => {
    expect(competitorRefreshAvailability("grow", AT, at("2026-11-05T11:59:00Z"))).toEqual({ allowed: false, nextAvailableAt: "2026-11-05T12:00:00.000Z" });
    expect(competitorRefreshAvailability("grow", AT, at("2026-11-05T12:00:00Z"))).toEqual({ allowed: true, nextAvailableAt: null });
  });
  test("Premium and Multi: every 24 hours, like their re-scan", () => {
    for (const plan of ["premium", "multi"] as const) {
      expect(competitorRefreshAvailability(plan, AT, at("2026-10-30T11:00:00Z"))).toEqual({ allowed: false, nextAvailableAt: "2026-10-30T12:00:00.000Z" });
      expect(competitorRefreshAvailability(plan, AT, at("2026-10-30T12:00:00Z"))).toEqual({ allowed: true, nextAvailableAt: null });
    }
  });
});
