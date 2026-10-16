import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { ReportsScoreRow } from "@/app/actions/reports";
import { ScoreHistoryChart } from "./ScoreHistoryChart";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T16:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

function row(id: string, created_at: string, total: number, scoring_version: string | null): ReportsScoreRow {
  return {
    id,
    total,
    grade: total >= 70 ? "C" : "D",
    created_at,
    profile_snapshot_json: null,
    scoring_version,
    categories: null,
  };
}
const HISTORY: ReportsScoreRow[] = [
  row("a", "2026-09-07T14:00:00Z", 74, "1.7.0"),
  row("b", "2026-09-07T20:00:00Z", 76, "1.7.0"),
  row("c", "2026-10-11T18:00:00Z", 72, "1.7.0"),
  row("d", "2026-10-16T13:00:00Z", 71, "1.9.0"),
];

function render(history: ReportsScoreRow[], locale: "en" | "es" = "en") {
  return renderToStaticMarkup(
    <LocaleProvider locale={locale}>
      <ScoreHistoryChart history={history} />
    </LocaleProvider>
  ).replace(/&#x27;/g, "'");
}

describe("Score over time chart", () => {
  test("default 90-day range: zoomed axis note, 'Scoring updated' marker, summary with the scoring-update note", () => {
    const html = render(HISTORY);
    expect(html).toContain("Score axis shows 60–80 — it doesn't start at 0.");
    expect(html).toContain("Scoring updated");
    expect(html).toContain("76 → 71");
    expect(html).toContain("includes a scoring update");
    expect(html).toContain("Scans in this range");
    expect(html).toContain(">4<"); // 4 real scans in range
    expect(html).toContain("Today");
    // The old chip row ("Sep 7 · 74 (C)") is gone.
    expect(html).not.toMatch(/· 74 \(C\)/);
  });

  test("a range with fewer than two days of scans shows the honest empty state, not a flat line", () => {
    const html = render([row("x", "2026-10-15T14:00:00Z", 70, "1.9.0"), row("y", "2026-10-15T18:00:00Z", 71, "1.9.0")]);
    expect(html).toContain("Not enough scans in this range yet.");
    expect(html).not.toContain("<svg width=");
  });

  test("the 'By category' toggle shows only when the saved scans have category scores", () => {
    expect(render(HISTORY)).not.toContain("By category");
    const withCats = HISTORY.map((r, i) => ({ ...r, categories: { listing: { percent: 100, points: 30, weight: 30 }, website: { percent: 80 - i, points: 24, weight: 30 }, reviews: { percent: 85, points: 34, weight: 40 } } }));
    expect(render(withCats)).toContain("By category");
  });

  test("two scoring updates a day apart share one label (×2), with both dates in its tooltip", () => {
    const close = [
      row("a", "2026-09-07T14:00:00Z", 76, "1.7.0"),
      row("b", "2026-10-10T18:00:00Z", 74, "1.7.0"),
      row("c", "2026-10-11T18:00:00Z", 72, "1.8.0"), // marker between Oct 10 and 11
      row("d", "2026-10-12T18:00:00Z", 72, "1.9.0"), // marker between Oct 11 and 12
      row("e", "2026-10-16T13:00:00Z", 71, "1.9.0"),
    ];
    const html = render(close);
    expect(html).toContain("Scoring updated ×2");
    expect(html.match(/>Scoring updated</g)).toBeNull();
    expect(render(close, "es")).toContain("Método de puntuación actualizado ×2");
  });

  test("ES (usted)", () => {
    const html = render(HISTORY, "es");
    expect(html).toContain("Método de puntuación actualizado");
    expect(html).toContain("incluye una actualización de la puntuación");
    expect(html).toContain("Hoy");
  });
});
