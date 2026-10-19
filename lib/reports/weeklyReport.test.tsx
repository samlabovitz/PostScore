import { beforeAll, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import type { Measurer, PrintPage } from "@/lib/signStudio/elements";
import { LocaleProvider } from "@/lib/i18n";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { compactWeekLabel, layoutReport, type ReportData } from "./reportPdf";
import { reportCategories } from "./reportCategories";
import { weeklyReportDataWithClient } from "@/lib/weekly/weeklyData.server";

const read = async (f: string) => new Uint8Array(await readFile(path.join(process.cwd(), "public", "sign-fonts", f)));
let m: Measurer;
beforeAll(async () => {
  m = createMeasurer(await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read));
}, 30_000);
const texts = (page: PrintPage) => page.panels.flatMap((p) => p.elements).flatMap((e) => (e.kind === "text" ? [e.text] : [])).join(" | ");

const breakdown = scoreBusiness(scoringInput(), "en");
const WEEKLY: ReportData = {
  locale: "en",
  timeZone: "America/New_York",
  generatedAt: "2026-10-21T15:00:00Z",
  business: { name: "Hudson Shears", address: "20 W Main St #1, Irvington, NY 10533" },
  score: { total: breakdown.total, grade: breakdown.grade },
  period: { from: "2026-10-16T15:00:00Z", to: "2026-10-20T15:00:00Z", days: 0, fromScore: 35, toScore: breakdown.total, comparable: true },
  categories: reportCategories(breakdown.categories),
  rank: { rank: 6, of: 7, noun: "salons", previousRank: null },
  changes: { listing: ["Your hours changed."], listingUnavailable: false, fixesConfirmed: 1 },
  nextSteps: [{ title: "Add photos", detail: "Show your work.", points: "+3 pts" }],
  reviews: { rating: 4.7, count: 10, countChange: 1, nearbyAverage: 120 },
  weekly: { weekStart: "2026-10-19", weekEnd: "2026-10-25", noNewScanSince: null, comparedWith: "2026-10-16T15:00:00Z", comparedInWeek: false, routine: { done: 0, total: 5 }, pastWeek: false },
};

describe("weekly report: the one-page report layout", () => {
  test("PDF categories match the Overview breakdown exactly (real categories, real maxes, whole points)", () => {
    const panel = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <ScoreBreakdownPanel businessId="b1" categories={breakdown.categories} hasWebsite scoreBasis={100} />
      </LocaleProvider>
    );
    // "Visibility & Reputation … 15 / 40" as the Overview shows each category.
    const overview = Array.from(panel.matchAll(/<h3[^>]*>([^<]+)<\/h3><span[^>]*>(\d+|—)<span[^>]*> \/ (\d+)<\/span>/g)).map((x) => [x[1].replace(/&amp;/g, "&"), x[2], x[3]]);
    const pdf = WEEKLY.categories.map((c) => [c.label, c.points === null ? "—" : String(c.points), String(c.weight)]);
    expect(overview).toHaveLength(3);
    expect(pdf).toEqual(overview);
    expect(pdf.map((c) => c[2])).toEqual(["40", "30", "30"]);
    expect(pdf.map((c) => c[0])).toEqual(["Visibility & Reputation", "Google Listing Completeness", "Website"]);
    const t = texts(layoutReport(WEEKLY, m));
    for (const [label, points, max] of pdf) {
      expect(t).toContain(label);
      expect(t).toContain(`${points} / ${max}`);
    }
    expect(t).not.toMatch(/\/ 100\b|\d+\.\d+ \/ \d+/);
  });

  test("the week in the header, 'Compared with Oct 16', never '(0 days)'; one page", () => {
    const page = layoutReport(WEEKLY, m);
    expect([page.width, page.height]).toEqual([612, 792]);
    const t = texts(page);
    expect(t).toContain("WEEKLY REPORT · OCT 19–25, 2026");
    expect(t).toContain("Compared with Oct 16, 2026");
    expect(t).not.toMatch(/0 days|\(\d+ days?\)/);
    expect(t).toContain("Weekly routine: 0 of 5 done");
    expect(t).toContain("NEXT STEPS");
    expect(t).toContain("CHANGE THIS WEEK");
  });

  test("no new scan this week: says so with the last scan's date; the ring stays brass", () => {
    const quiet = layoutReport({ ...WEEKLY, period: null, weekly: { ...WEEKLY.weekly!, noNewScanSince: "2026-10-16T15:00:00Z", comparedWith: null } }, m);
    const t = texts(quiet);
    expect(t).toContain("No new scan this week — last scan Oct 16, 2026");
    expect(t).not.toContain("first scan");
    const arcs = quiet.panels[0].elements.filter((e) => e.kind === "path" && e.fill === "none");
    expect(arcs.some((e) => e.kind === "path" && e.stroke === "#b8862f")).toBe(true);
  });

  test("a past week: no next steps from today", () => {
    const t = texts(layoutReport({ ...WEEKLY, nextSteps: [], weekly: { ...WEEKLY.weekly!, pastWeek: true } }, m));
    expect(t).toContain("Next steps are about today");
  });

  test("Spanish", () => {
    const t = texts(layoutReport({ ...WEEKLY, locale: "es" }, m));
    expect(t).toContain("INFORME SEMANAL · 19–25 OCT 2026");
    expect(t).toContain("Comparado con el 16 oct 2026");
    expect(t).toContain("Rutina semanal: 0 de 5 hechas");
  });

  test("compact week labels", () => {
    expect(compactWeekLabel("2026-10-19", "2026-10-25", "en")).toBe("Oct 19–25, 2026");
    expect(compactWeekLabel("2026-09-28", "2026-10-04", "en")).toBe("Sep 28 – Oct 4, 2026");
    expect(compactWeekLabel("2025-12-29", "2026-01-04", "en")).toBe("Dec 29, 2025 – Jan 4, 2026");
    expect(compactWeekLabel("2026-10-19", "2026-10-25", "es")).toBe("19–25 oct 2026");
  });
});

describe("weekly report data", () => {
  const scanRow = (id: string, created_at: string, total: number) => ({
    id,
    total,
    grade: "C",
    created_at,
    scoring_version: breakdown.scoringVersion,
    profile_snapshot_json: { phone: null, website: null, openingHours: null, categories: null, photoCount: 5, rating: 4.7, reviewCount: 10, businessStatus: null },
    breakdown_categories: breakdown.categories,
    breakdown_json: breakdown,
  });
  const scans = [scanRow("s1", "2026-10-16T15:00:00Z", 35), scanRow("s2", "2026-10-20T15:00:00Z", breakdown.total)];
  const db = {
    from: (table: string) => {
      let byId: string | null = null;
      const result = () => {
        if (table === "businesses") return { data: { name: "Hudson Shears", address: "20 W Main St", language: "en", lat: 41.04, lng: -73.87, category: null, primary_type: null, business_type_override: null, categories: null } };
        if (table === "scores") return byId ? { data: scans.find((s) => s.id === byId) ?? null } : { data: scans };
        if (table === "weekly_snapshots") return { data: null };
        if (table === "tasks") return { count: 0 };
        return { data: [] };
      };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain,
        eq: (col: string, v: string) => ((col === "id" ? (byId = v) : null), chain),
        neq: () => chain,
        in: () => chain,
        lte: () => chain,
        gte: () => chain,
        lt: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      });
      return chain;
    },
  } as unknown as SupabaseClient;

  test("this week: the live report's categories (the Overview's), the week's comparison in the change box", async () => {
    const now = new Date("2026-10-21T15:00:00Z");
    const data = (await weeklyReportDataWithClient(db, "b1", null, { current: async () => ({ ...WEEKLY, weekly: undefined, period: null }) }, now))!;
    expect(data.categories).toEqual(reportCategories(breakdown.categories));
    expect(data.weekly).toMatchObject({ weekStart: "2026-10-19", comparedWith: "2026-10-16T15:00:00Z", noNewScanSince: null, pastWeek: false });
    expect(data.period).toMatchObject({ fromScore: 35, toScore: breakdown.total, comparable: true });
  });

  test("a past week: categories from that week's own saved scan, no next steps", async () => {
    const now = new Date("2026-10-28T15:00:00Z");
    const data = (await weeklyReportDataWithClient(db, "b1", "2026-10-19", { current: async () => null }, now))!;
    expect(data.categories).toEqual(reportCategories(breakdown.categories));
    expect(data.nextSteps).toEqual([]);
    expect(data.weekly?.pastWeek).toBe(true);
  });
});
