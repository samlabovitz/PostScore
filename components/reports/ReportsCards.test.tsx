import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/weekly", () => ({ getPastReports: vi.fn(), openBusinessVisit: vi.fn(), runFreshScan: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { VerifiedFixesCard } from "./VerifiedFixesCard";
import { WeeklyRecapCard } from "./WeeklyRecapCard";
import { PastReports } from "./PastReports";
import { SinceLastVisitBody, claimVisit } from "@/components/visits/SinceLastVisit";
import type { WeeklyView } from "@/lib/weekly/weeklyView";
import type { SinceLastVisitData } from "@/lib/weekly/weeklyData.server";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const VIEW: WeeklyView = {
  weekStart: "2026-10-12",
  weekEnd: "2026-10-18",
  isCurrentWeek: true,
  frozen: false,
  olderScoringVersion: null,
  scanCount: 1,
  score: 71,
  grade: "C",
  lastKnown: null,
  change: { delta: 5, comparable: true, comparedDate: "2026-10-09T15:00:00Z", comparedInWeek: false, fromScore: 66 },
  categories: [
    { id: "listing", before: 80, after: 86 },
    { id: "website", before: 50, after: 50 },
    { id: "reviews", before: 70, after: 68 },
  ],
  rank: { rank: 3, of: 11, previous: 5 },
  headToHead: null,
  listingChanges: ["Your hours changed."],
  changesUnavailable: false,
  fixesConfirmed: 2,
  reviews: { count: 104, countChange: 4, rating: 4.7, ratingChange: 0.1 },
  sparkline: [60, 63, 66, 71],
};
const LABELS = { "2026-10-12": "Oct 12 – Oct 18, 2026", "2026-10-05": "Oct 5 – Oct 11, 2026" };
const card = (view: WeeklyView, locale: "en" | "es" = "en", share: string | null = null) =>
  wrap(<WeeklyRecapCard businessId="b1" view={view} weeks={["2026-10-12", "2026-10-05"]} weekLabels={LABELS} rankNoun="liquor stores" shareHeadline={share} />, locale);

describe("Weekly recap card", () => {
  test("hero: ring, +5 chip, rank chip, sparkline; compared with the last scan before the week — never '(0 days)'", () => {
    const html = card(VIEW);
    const t = text(html);
    expect(html).toMatch(/data-testid="change-chip"[^>]*>\+5</);
    expect(t).toContain("#3 of 11 nearby liquor stores");
    expect(t).toContain("66 → 71 · Compared with Oct 9, 2026");
    expect(html).toContain("<polyline");
    expect(t).not.toMatch(/0 days/);
    expect(t).toContain("This week (Oct 12 – Oct 18, 2026)");
    expect(t).toContain("Download weekly report (PDF)");
  });

  test("What changed rows and this week's verified stats", () => {
    const t = text(card(VIEW));
    expect(t).toContain("Google listing: 80 → 86 (+6)");
    expect(t).toContain("Reviews: 70 → 68 (−2)");
    expect(t).not.toContain("Website: 50 → 50");
    expect(t).toContain("Your hours changed.");
    expect(t).toContain("+4 reviews (104 total)");
    expect(t).toContain("2 Fixes confirmed 1 Listing changes 1 Scans this week");
  });

  test("a week with no scan: grey 'No new scan this week' and the last known score", () => {
    const html = card({ ...VIEW, score: null, grade: null, change: null, scanCount: 0, lastKnown: { score: 66, date: "2026-10-09T15:00:00Z" }, listingChanges: [] });
    expect(html).toMatch(/data-testid="change-chip" class="[^"]*bg-ink\/5[^"]*">No new scan this week</);
    expect(text(html)).toContain("Last scan Oct 9, 2026: 66");
  });

  test("an old week scored with another version says so; Share only with good news on this week", () => {
    expect(text(card({ ...VIEW, isCurrentWeek: false, frozen: true, olderScoringVersion: "1.10.0" }))).toContain("Scored with v1.10.0");
    expect(card(VIEW)).not.toContain("share-good-news");
    expect(card(VIEW, "en", "Modern Liquors' PostScore rose 66 → 71 this month")).toContain('data-testid="share-good-news"');
  });

  test("Spanish", () => {
    const t = text(card(VIEW, "es"));
    expect(t).toContain("Comparado con el 9 oct 2026");
    expect(t).toContain("Descargar informe semanal (PDF)");
    expect(t).toContain("Esta semana (Oct 12 – Oct 18, 2026)");
  });
});

describe("Past reports", () => {
  const rows = [
    { weekStart: "2026-10-12", weekEnd: "2026-10-18", score: 71, delta: 5, olderScoringVersion: null },
    { weekStart: "2026-10-05", weekEnd: "2026-10-11", score: 66, delta: null, olderScoringVersion: null },
    { weekStart: "2026-09-28", weekEnd: "2026-10-04", score: 66, delta: 0, olderScoringVersion: "1.10.0" },
  ];
  test("grouped by month, newest first; compact rows; 'Show older' when there's more", () => {
    const html = wrap(<PastReports businessId="b1" initial={{ rows, total: 20, years: [2026] }} />);
    const t = text(html);
    expect(t.indexOf("October 2026")).toBeLessThan(t.indexOf("September 2026"));
    expect(html.match(/data-testid="past-report"/g)).toHaveLength(3);
    expect(t).toContain("Oct 12, 2026 – Oct 18, 2026 71 +5 Download");
    expect(t).toContain("Scored with v1.10.0");
    expect(t).toContain("Show older");
    expect(t).not.toContain("All years");
  });
  test("a year filter once there's more than a year", () => {
    expect(text(wrap(<PastReports businessId="b1" initial={{ rows, total: 3, years: [2026, 2025] }} />))).toContain("All years");
  });
});

describe("Since your last visit", () => {
  const DATA: SinceLastVisitData = {
    since: "2026-10-02T15:00:00Z",
    timeZone: "America/New_York",
    noNewScan: false,
    weekStart: "2026-10-12",
    baselineScore: 66,
    latestScore: 71,
    delta: 5,
    comparable: true,
    categories: [{ id: "listing", before: 80, after: 86 }],
    rank: { now: 3, then: 5, of: 11 },
    fixesConfirmed: 2,
    reviews: { count: 104, countChange: 4, rating: 4.7, ratingChange: 0.1 },
    nextSteps: [{ title: "Add 5 photos", detail: "", points: "+3 pts" }],
    rescan: { allowed: true, nextAvailableAt: null },
  };
  test("'Since Oct 2: 66 → 71 (+5)', categories, rank, fixes, reviews, next steps", () => {
    const t = text(wrap(<SinceLastVisitBody businessId="b1" data={DATA} />));
    expect(t).toContain("Since Oct 2, 2026: 66 → 71 (+5)");
    expect(t).toContain("80 → 86");
    expect(t).toContain("#3 / 11 (was #5)");
    expect(t).toContain("+4 new reviews · rating 4.6 → 4.7");
    expect(t).toContain("Add 5 photos");
  });
  test("no new scan: says so (never 'no change') and offers a fresh scan, or the next time one is allowed", () => {
    const t = text(wrap(<SinceLastVisitBody businessId="b1" data={{ ...DATA, noNewScan: true }} />));
    expect(t).toContain("We haven't re-scanned since your last visit.");
    expect(t).toContain("Run a fresh scan");
    expect(t).not.toMatch(/no change/i);
    const limited = text(wrap(<SinceLastVisitBody businessId="b1" data={{ ...DATA, noNewScan: true, rescan: { allowed: false, nextAvailableAt: "2026-10-20T15:00:00Z" } }} />));
    expect(limited).toContain("You can run your next scan Oct 20, 2026");
  });
  test("once per browser session per business", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(claimVisit(storage, "b1")).toBe(true);
    expect(claimVisit(storage, "b1")).toBe(false);
    expect(claimVisit(storage, "b2")).toBe(true);
  });
  test("Spanish", () => {
    expect(text(wrap(<SinceLastVisitBody businessId="b1" data={DATA} />, "es"))).toContain("Desde el 2 oct 2026: 66 → 71 (+5)");
  });
});

describe("What we've verified agrees with What changed", () => {
  test("the all-time count names its period and the latest period's own count", () => {
    const html = text(wrap(<VerifiedFixesCard businessId="b1" confirmedFixCount={0} listingChangesDetected={2} listingChangesSince="2026-09-07T04:57:45Z" latestPeriodChanges={0} gbpConnected={false} />));
    expect(html).toContain("Listing changes detected");
    expect(html).toContain("All scans since Sep 7, 2026. In the latest period: 0.");
  });
});
