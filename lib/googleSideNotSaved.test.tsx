import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/weekly", () => ({ getPastReports: vi.fn(), openBusinessVisit: vi.fn(), runFreshScan: vi.fn() }));
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { googleSideOf, withoutGoogleSide, type InfoFieldFinding } from "./websiteTrust";
import { snapshotFromWeek } from "./weekly/snapshots";
import { weeklyViewFromSnapshot } from "./weekly/weeklyView";
import { buildWeekSummary, type WeeklyScan } from "./weekly/weeklyReport";
import { cleanWeeklySnapshots } from "./weeklySnapshotsCleanup.server";
import { cleanInfoConflicts } from "./infoConflictsCleanup.server";
import { LocaleProvider } from "./i18n";
import { WeeklyRecapCard } from "@/components/reports/WeeklyRecapCard";

const src = (f: string) => readFileSync(f, "utf8");
const NY = "America/New_York";

describe("website vs Google: Google's side is never saved, and rebuilt when shown", () => {
  const finding = (field: InfoFieldFinding["field"], siteValue: string | null, googleValue: string | null = null): InfoFieldFinding => ({ field, comparison: "conflicts", siteValue, googleValue });
  const listing = { phone: "(908) 555-0199", address: "1 Main St, Westfield, NJ", openingHours: ["Monday: 3:00 – 10:00 PM", "Tuesday: 11:00 AM – 2:00 PM", "Sunday: Closed"] };

  test("phone, address, and the listing's own hours for the day the site disagrees on (in the same format as before)", () => {
    expect(googleSideOf(finding("phone", "908-555-0100"), listing)).toBe("(908) 555-0199");
    expect(googleSideOf(finding("address", "9 Elm St"), listing)).toBe("1 Main St, Westfield, NJ");
    expect(googleSideOf(finding("hours", "Monday: 1:00 PM–9:00 PM"), listing)).toBe("Monday: 3:00 PM–10:00 PM");
    expect(googleSideOf(finding("hours", "Tuesday: Closed"), listing)).toBe("Tuesday: 11:00 AM–2:00 PM");
    expect(googleSideOf(finding("hours", "Sunday: 9:00 AM–1:00 PM"), listing)).toBe("Sunday: Closed");
  });

  test("nothing at hand: a finding saved before keeps its old value; otherwise nothing (never made up)", () => {
    expect(googleSideOf(finding("phone", "1", "555"), {})).toBe("555");
    expect(googleSideOf(finding("hours", "Friday: 9–5"), listing)).toBeNull();
  });

  test("new analyses drop it at the one place findings are made; saved ones are cleaned", () => {
    expect(src("lib/websiteAnalysis.ts")).toContain(".map((f) => ({ ...f, googleValue: null })),");
    const saved = withoutGoogleSide({ websiteTrust: { infoConflicts: [{ field: "phone", comparison: "conflicts", siteValue: "908-555-0100", googleValue: "(908) 555-0199" }] } });
    expect(JSON.stringify(saved)).not.toContain("googleValue");
    expect(JSON.stringify(saved)).toContain("908-555-0100");
    expect(src("lib/scoring.ts")).toContain("google: googleSideOf(first, input) ?? \"\"");
    expect(src("lib/monthlyReportExtras.ts")).toContain("google: googleSideOf(f, input)");
  });

  test("cleanup: dry run counts, live strips Google's side only", async () => {
    const rows = [
      { id: "b1", website_analysis_json: { websiteTrust: { infoConflicts: [{ field: "phone", googleValue: "(908) 555-0199", siteValue: "1" }, { field: "hours", googleValue: null }] } } },
      { id: "b2", website_analysis_json: { websiteTrust: { infoConflicts: [{ field: "phone", googleValue: null }] } } },
    ];
    const updates: Array<{ id: unknown; value: Record<string, unknown> }> = [];
    const db = {
      from: () => ({
        select: () => ({ not: async () => ({ data: rows, error: null }) }),
        update: (value: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => (updates.push({ id, value }), { error: null }) }),
      }),
    } as unknown as SupabaseClient;
    expect(await cleanInfoConflicts(db, { dryRun: true })).toEqual({ businesses: 2, withGoogleSide: 1, findings: 1 });
    expect(updates).toEqual([]);
    await cleanInfoConflicts(db, { dryRun: false });
    expect(updates.map((u) => u.id)).toEqual(["b1"]);
    expect(JSON.stringify(updates[0].value)).not.toContain("555-0199");
  });
});

describe("weekly snapshots keep our own changes, not Google's counts", () => {
  const scan = (id: string, createdAt: string, changes: WeeklyScan["changes"]): WeeklyScan => ({
    id, total: 70, grade: "C", createdAt, scoringVersion: "1.15.0", categories: null, profile: { rating: 4.6, reviewCount: 58 } as WeeklyScan["profile"], fpKey: "k", changes,
  });
  const scans = [scan("w1", "2026-09-29T15:00:00Z", []), scan("w2", "2026-10-07T15:00:00Z", [{ field: "reviews", direction: "changed", delta: null }, { field: "rating", direction: "changed", delta: null }])];
  const week = buildWeekSummary("2026-10-05", scans, NY, "en");
  const row = snapshotFromWeek("b1", week, { rank: null, rankOf: null, prevRank: null, fixesConfirmed: 0 })!;

  test("a new snapshot saves no rating or review count; the change says only that it changed", () => {
    expect(row).toMatchObject({ review_count: null, rating: null, review_count_change: null, rating_change: null, listing_changes: ["rating", "reviews"] });
  });

  test("a past week reads 'changed' from its fields; exact new reviews show without a total it no longer has (EN + ES)", () => {
    const view = weeklyViewFromSnapshot(row, week, "1.15.0");
    expect(view.reviews).toMatchObject({ count: null, rating: null, countChanged: true, ratingChanged: true });
    const exact = weeklyViewFromSnapshot({ ...row, review_count_change: 3, listing_changes: ["reviews"] }, week, "1.15.0");
    const html = (locale: "en" | "es") => renderToStaticMarkup(<LocaleProvider locale={locale}><WeeklyRecapCard view={exact} businessId="b1" weeks={[exact.weekStart]} weekLabels={{ [exact.weekStart]: "Oct 5 – Oct 11, 2026" }} rankNoun="salons" /></LocaleProvider>);
    expect(html("en")).toContain("+3 reviews");
    expect(html("en")).not.toContain("total");
    expect(html("es")).toContain("+3 reseñas");
  });

  test("the past week's PDF shows today's rating and count, labelled '(today)'", () => {
    expect(src("lib/weekly/weeklyData.server.ts")).toMatch(/rating: business\.rating \?\? null,\s+count: business\.review_count \?\? null,\s+asOfToday: true,/);
    expect(src("lib/reports/reportPdf.ts")).toContain('today(t(locale, "dashboard.reports.pdf.rating"))');
  });

  test("cleanup of saved rows: dry run counts; live clears the counts and recomputes the changes from our records", async () => {
    const rows = [
      { id: "s1", business_id: "b1", scan_id: "w2", compared_scan_id: "w1", review_count: 58, rating: 4.6, review_count_change: 2, rating_change: 0.1, listing_changes: ["rating", "reviews"] },
      { id: "s2", business_id: "b1", scan_id: "w1", compared_scan_id: null, review_count: null, rating: null, review_count_change: null, rating_change: null, listing_changes: [] },
    ];
    const scores = [{ id: "w1", created_at: "2026-09-29T15:00:00Z", fp_key: "k" }, { id: "w2", created_at: "2026-10-07T15:00:00Z", fp_key: "k" }];
    const changes = [{ score_id: "w2", field: "reviews", direction: "changed", delta: null }, { score_id: "w2", field: "rating", direction: "changed", delta: null }];
    const updates: Array<{ id: unknown; value: Record<string, unknown> }> = [];
    const db = {
      from(table: string) {
        let data: Array<Record<string, unknown>> = table === "weekly_snapshots" ? rows : table === "scores" ? scores : changes;
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "gte", "lte"]) chain[m] = () => chain;
        chain.in = (col: string, ids: string[]) => ((data = data.filter((r) => ids.includes(String(r[col])))), chain);
        chain.then = (resolve: (v: unknown) => void) => resolve({ data, error: null });
        chain.update = (value: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => (updates.push({ id, value }), { error: null }) });
        return chain;
      },
    } as unknown as SupabaseClient;
    expect(await cleanWeeklySnapshots(db, { dryRun: true })).toMatchObject({ rows: 2, withGoogleValues: 1, changesRecomputed: 1, updated: 0 });
    expect(updates).toEqual([]);
    await cleanWeeklySnapshots(db, { dryRun: false });
    expect(updates).toEqual([{ id: "s1", value: { review_count: null, rating: null, review_count_change: null, rating_change: null, listing_changes: ["rating", "reviews"] } }]);
  });
});
