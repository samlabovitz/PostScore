import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { MonthlyRecap, ReportsScoreRow } from "@/app/actions/reports";
import { MonthlyRecapCard } from "./MonthlyRecapCard";
import { VerifiedFixesCard } from "./VerifiedFixesCard";

const row = (created_at: string, total: number): ReportsScoreRow => ({ id: created_at, total, grade: "C", created_at, profile_snapshot_json: null, scoring_version: "v1", categories: null });
const RECAP: MonthlyRecap = {
  previous: row("2026-10-17T00:23:10Z", 71),
  current: row("2026-10-18T04:58:32Z", 71),
  scoreDelta: 0,
  daysBetween: 2,
  changes: [],
  changesUnavailable: false,
};
const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("Monthly recap card", () => {
  test("'Download report (PDF)'; the period in the business's zone with the right day count", () => {
    const html = wrap(<MonthlyRecapCard businessId="b1" recap={RECAP} shareHeadline={null} />);
    expect(text(html)).toContain("Download report (PDF)");
    expect(html).toMatch(/data-testid="recap-range"[^>]*>Oct 16, 2026 – Oct 18, 2026 \(2 days\)</);
    expect(text(html)).toContain("What changed · Oct 16, 2026 – Oct 18, 2026 (2 days)");
  });

  test("Share only with good news", () => {
    expect(wrap(<MonthlyRecapCard businessId="b1" recap={RECAP} shareHeadline={null} />)).not.toContain("share-good-news");
    const good = wrap(<MonthlyRecapCard businessId="b1" recap={{ ...RECAP, previous: row(RECAP.previous.created_at, 66), scoreDelta: 5 }} shareHeadline="Modern Liquors' PostScore rose 66 → 71 this month" />);
    expect(good).toContain('data-testid="share-good-news"');
    expect(text(good)).toContain("Share the good news");
  });

  test("first scan: still downloadable", () => {
    expect(text(wrap(<MonthlyRecapCard businessId="b1" recap={null} shareHeadline={null} />))).toContain("Download report (PDF)");
  });

  test("Spanish", () => {
    const es = text(wrap(<MonthlyRecapCard businessId="b1" recap={RECAP} shareHeadline={null} />, "es"));
    expect(es).toContain("Descargar informe (PDF)");
    expect(es).toContain("(2 días)");
  });
});

describe("What we've verified agrees with What changed", () => {
  test("the all-time count names its period and the latest period's own count", () => {
    const html = text(wrap(<VerifiedFixesCard businessId="b1" confirmedFixCount={0} listingChangesDetected={2} listingChangesSince="2026-09-07T04:57:45Z" latestPeriodChanges={0} gbpConnected={false} />));
    expect(html).toContain("Listing changes detected");
    expect(html).toContain("All scans since Sep 7, 2026. In the latest period: 0.");
  });
});
