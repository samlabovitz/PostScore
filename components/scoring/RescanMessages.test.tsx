import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
vi.mock("@/app/actions/scoring", () => ({ rescanBusiness: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { RescanCompetitorsNote, RESCAN_BUTTON_ID, RescanButton, rescanHeadline, SnapshotNotice } from "./ScanStatusStrip";
import { ScoreBreakdownPanel } from "@/components/overview/ScoreBreakdownPanel";
import { getScoreWithSuggestions, scoreBasisPoints } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";

// Re-scanning, made obvious: the snapshot message under "Last scanned",
// the Free notes, the toast, and the Score breakdown's controls.

const NOW = "2026-10-22T16:00:00Z";
const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const notice = (over: Partial<Parameters<typeof SnapshotNotice>[0]> = {}, locale: "en" | "es" = "en") =>
  wrap(<SnapshotNotice businessId="b1" lastScanAt="2026-10-21T15:00:00Z" now={NOW} nextAt={null} free={false} {...over} />, locale);

describe("the snapshot message (under “Last scanned”)", () => {
  test("re-scan available: the snapshot sentence, and a link to the Re-scan now button", () => {
    const html = notice();
    expect(html).toContain('data-state="available"');
    expect(text(html)).toBe("Your score and Google listing info are a snapshot from your last scan. Changed something on Google? Re-scan to update your score and breakdown.");
    expect(html).toContain(`href="#${RESCAN_BUTTON_ID}"`);
    expect(wrap(<RescanButton state={{ kind: "idle" }} nextAt={null} onClick={() => {}} />)).toContain(`id="${RESCAN_BUTTON_ID}"`);
  });

  test("not available yet: “Next re-scan available {date}” — on Free also “Paid plans can re-scan every day” → the plans", () => {
    const paid = notice({ nextAt: "2026-10-23T15:00:00Z" });
    expect(paid).toContain('data-state="waiting"');
    expect(text(paid)).toContain("Next re-scan available Oct 23, 2026.");
    expect(paid).not.toContain('data-testid="snapshot-paid-daily"');
    expect(paid).not.toContain(`href="#${RESCAN_BUTTON_ID}"`);
    const free = notice({ nextAt: "2026-10-28T15:00:00Z", free: true });
    expect(text(free)).toContain("Next re-scan available Oct 28, 2026. Paid plans can re-scan every day");
    const link = free.match(/<a [^>]*data-testid="snapshot-paid-daily"[^>]*>|<a [^>]*>(?=Paid plans)/)![0];
    expect(link).toContain('href="/business/b1/settings#compare-plans"');
  });

  test("7+ days old: amber and “Your score is N days old.”; under 7 days: plain", () => {
    const old = notice({ lastScanAt: "2026-10-13T15:00:00Z" });
    expect(old).toContain('data-old="true"');
    expect(text(old)).toMatch(/^Your score is 9 days old\. Your score and Google listing info/);
    expect(old).toContain("text-amber");
    const six = notice({ lastScanAt: "2026-10-16T15:00:00Z" });
    expect(six).toContain('data-old="false"');
    expect(text(six)).not.toContain("days old");
  });

  test("Spanish (usted)", () => {
    expect(text(notice({}, "es"))).toContain("Su puntuación y la información de su ficha de Google son una instantánea de su último escaneo. ¿Cambió algo en Google? Vuelva a escanear");
    expect(text(notice({ lastScanAt: "2026-10-13T15:00:00Z", nextAt: "2026-10-28T15:00:00Z", free: true }, "es"))).toContain("Su puntuación tiene 9 días.");
    expect(text(notice({ nextAt: "2026-10-28T15:00:00Z", free: true }, "es"))).toContain("Los planes de pago pueden escanear todos los días");
  });

  test("it replaces the grey sentence under the score card, on every plan", () => {
    const view = readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    expect(view).not.toContain("updateOnlyOnRescan");
    expect(view).toContain("note={<SnapshotNotice businessId={businessId} lastScanAt={lastScanAt} now={now} nextAt={rescan.nextAt} free={free} />}");
  });
});

describe("Free: re-scans don't refresh competitors — said plainly", () => {
  test("beside the Re-scan button, one line per plan — Free and Grow link to the plans, Premium/Multi don't", () => {
    const note = (plan: "free" | "grow" | "premium" | "multi") => wrap(<RescanCompetitorsNote businessId="b1" plan={plan} latestCompetitorScanAt="2026-10-20T15:00:00Z" now={NOW} />);
    expect(text(note("free"))).toContain("Competitors don't update on Free — upgrade to refresh them.");
    expect(text(note("grow"))).toContain("Competitors update once a week. Next competitor update: Oct 27, 2026.");
    for (const plan of ["free", "grow"] as const) expect(note(plan)).toContain('href="/business/b1/settings#compare-plans"');
    for (const plan of ["premium", "multi"] as const) {
      expect(text(note(plan))).toBe("Every re-scan also updates your competitors.");
      expect(note(plan)).not.toContain("compare-plans");
    }
    expect(readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8")).toContain("<RescanCompetitorsNote businessId={businessId} plan={plan}");
  });

  test("the success toast says whether competitors were updated this time", () => {
    const summary = { scoreBefore: 47, scoreAfter: 49, scoringUpdated: false, checksChanged: 2 };
    expect(rescanHeadline({ ...summary, plan: "free", competitors: "skipped" }, "en")).toBe("Score 47 → 49 · 2 checks changed. Competitors don't update on Free.");
    expect(rescanHeadline({ ...summary, plan: "premium", competitors: "refreshed" }, "en")).toBe("Score 47 → 49 · 2 checks changed. Competitors updated too.");
    expect(rescanHeadline({ ...summary, plan: "grow", competitors: "skipped" }, "es")).toContain("La competencia no se actualizó esta vez");
    expect(rescanHeadline(summary, "en")).toBe("Score 47 → 49 · 2 checks changed.");
  });
});

describe("Score breakdown: “As of your last scan”, and on Free a collapsed card with an obvious open control", () => {
  const { breakdown } = getScoreWithSuggestions(scoringInput());
  const count = breakdown.categories.reduce((n, c) => n + c.checks.length, 0);
  const panel = (audit: boolean, locale: "en" | "es" = "en") =>
    wrap(<ScoreBreakdownPanel businessId="b1" categories={breakdown.categories} hasWebsite scoreBasis={scoreBasisPoints(breakdown.categories)} audit={audit} websiteFixCount={null} lastScanAt="2026-10-21T15:00:00Z" />, locale);

  test("Free starts collapsed: the gold “See all N checks” button (real count) and the clickable bottom strip, both aria-expanded=false", () => {
    const html = panel(true);
    expect(text(html)).toContain(`See all ${count} checks`);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="breakdown-toggle"[^>]*class="[^"]*bg-brass/);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="breakdown-strip"/);
    // The summaries stay; the individual check rows don't render until opened.
    for (const c of breakdown.categories) expect(text(html)).toContain(c.label);
    expect(html).not.toContain('data-testid="locked-fix-blur"');
    expect(text(panel(true, "es"))).toContain(`Ver las ${count} revisiones`);
  });

  test("“As of your last scan, {date}” at the top; every plan gets the same collapsed card and gold “See all N checks” button", () => {
    for (const audit of [true, false]) expect(text(panel(audit))).toContain("As of your last scan, Oct 21, 2026");
    const paid = panel(false);
    expect(text(paid)).toContain(`See all ${count} checks`);
    expect(paid).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="breakdown-toggle"[^>]*class="[^"]*bg-brass/);
    expect(paid).toMatch(/<button[^>]*aria-expanded="false"[^>]*data-testid="breakdown-strip"/);
  });

  test("Growth and Google Profile steps that change something on Google remind the owner to re-scan", () => {
    const plan = readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    const block = plan.indexOf("{task.ownerActionOnGoogle && (");
    expect(block).toBeGreaterThan(-1);
    expect(plan.indexOf('t(locale, "dashboard.rescan.afterGoogleChange")', block)).toBeGreaterThan(block);
    expect(plan.indexOf('t(locale, "dashboard.rescan.afterGoogleChange")', block) - block).toBeLessThan(700);
    expect(readFileSync("components/gbp/GoogleProfilePanel.tsx", "utf8")).toContain('t(locale, "dashboard.rescan.afterGoogleChange")');
  });
});
