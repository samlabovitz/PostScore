import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { renderPdf } from "@/lib/signStudio/pdf";
import { calendarDaysAgo } from "@/lib/i18n";
import { LETTER, layoutReport, periodLabel, shareHeadline, type ReportData } from "./reportPdf";

const read = async (f: string) => new Uint8Array(await readFile(path.join(process.cwd(), "public", "sign-fonts", f)));

// The real Modern Liquors pair that showed "(1 day)": Oct 16 8:23 pm →
// Oct 18 12:58 am in New York — 28.6 hours, but two calendar days.
const FROM = "2026-10-17T00:23:10Z";
const TO = "2026-10-18T04:58:32Z";
const NY = "America/New_York";

const DATA: ReportData = {
  locale: "en",
  timeZone: NY,
  generatedAt: "2026-10-19T15:00:00Z",
  business: { name: "Modern Liquors", address: "2134 Broadway, New York, NY 10023" },
  score: { total: 71, grade: "B" },
  period: { from: FROM, to: TO, days: 2, fromScore: 66, toScore: 71, comparable: true },
  categories: [
    { label: "Google listing", points: 33.6, weight: 40, earned: 0.84, unchecked: 0, done: 9, needsWork: 2, couldntCheck: 0 },
    { label: "Reviews", points: 21.2, weight: 30, earned: 0.7, unchecked: 0, done: 3, needsWork: 2, couldntCheck: 0 },
    { label: "Website", points: 16.4, weight: 30, earned: 0.5, unchecked: 0.12, done: 6, needsWork: 4, couldntCheck: 2 },
  ],
  rank: { rank: 3, of: 10, noun: "liquor stores", previousRank: 4 },
  changes: { listing: ["Rating changed from 4.5 to 4.6"], listingUnavailable: false, fixesConfirmed: 1 },
  nextSteps: [
    { title: "Add photos", detail: "Add 5 photos this week.", points: "+4 pts" },
    { title: "Reply to reviews", detail: "Reply to the 3 newest.", points: "+3 pts" },
    { title: "Improve your website", detail: "4 improvements.", points: "about +6 pts" },
  ],
  reviews: { rating: 4.6, count: 219, countChange: 7, nearbyAverage: 184 },
};

async function pageText(data: ReportData) {
  const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read);
  const page = layoutReport(data, createMeasurer(fonts));
  const texts = page.panels.flatMap((p) => p.elements).flatMap((e) => (e.kind === "text" ? [e.text] : []));
  return { page, fonts, all: texts.join(" ") };
}

describe("day count in the business's time zone", () => {
  test("Oct 16 evening → Oct 18 after midnight is 2 days (it used to say 1)", () => {
    expect(calendarDaysAgo(FROM, new Date(TO), NY)).toBe(2);
    expect(periodLabel({ from: FROM, to: TO, days: 2 }, "en", NY)).toBe("Oct 16, 2026 – Oct 18, 2026 (2 days)");
    // Same instants seen from UTC are Oct 17 → Oct 18: the zone matters.
    expect(calendarDaysAgo(FROM, new Date(TO), "UTC")).toBe(1);
  });
});

describe("Share appears only with good news", () => {
  const base = { locale: "en" as const, timeZone: NY, generatedAt: DATA.generatedAt, business: { name: "Modern Liquors" } };
  test("score up on comparable scans", () => {
    expect(shareHeadline({ ...base, period: DATA.period, rank: null })).toBe("Modern Liquors' PostScore rose 66 → 71 this month");
    expect(shareHeadline({ ...base, business: { name: "Joe Pizza" }, period: DATA.period, rank: null })).toBe("Joe Pizza's PostScore rose 66 → 71 this month");
  });
  test("rank improved (score flat)", () => {
    const flat = { ...DATA.period!, toScore: 66 };
    expect(shareHeadline({ ...base, period: flat, rank: DATA.rank })).toBe("Modern Liquors moved up to #3 of 10 nearby liquor stores");
  });
  test("no good news → no Share", () => {
    expect(shareHeadline({ ...base, period: { ...DATA.period!, toScore: 60 }, rank: { ...DATA.rank!, previousRank: 2 } })).toBeNull();
    expect(shareHeadline({ ...base, period: { ...DATA.period!, comparable: false }, rank: null })).toBeNull();
    expect(shareHeadline({ ...base, period: null, rank: { ...DATA.rank!, previousRank: null } })).toBeNull();
  });
  test("Spanish", () => {
    expect(shareHeadline({ ...base, locale: "es", period: DATA.period, rank: null })).toBe("La PostScore de Modern Liquors subió de 66 a 71 este mes");
  });
});

describe("the one-page report", () => {
  test("letter size, one page, every section", async () => {
    const { page, fonts, all } = await pageText(DATA);
    expect([page.width, page.height]).toEqual([LETTER.width, LETTER.height]);
    for (const s of [
      "POSTSCORE REPORT",
      "Modern Liquors",
      "2134 Broadway, New York, NY 10023",
      "Generated October 19, 2026",
      "71",
      "Grade B",
      "Oct 16, 2026 – Oct 18, 2026 (2 days)",
      "#3 of 10 nearby liquor stores",
      "up from #4",
      "Google listing",
      "34 / 40",
      "2 couldn't check",
      "Rating changed from 4.5 to 4.6",
      "Action-plan fixes confirmed by a re-scan: 1",
      "TOP 3 NEXT STEPS",
      "Reply to reviews",
      "REVIEWS SNAPSHOT",
      "+7 since the previous scan",
      "Scores use real public signals; items we couldn't check are marked.",
    ])
      expect(all, s).toContain(s);
    const { bytes } = await renderPdf([page], { qrs: {}, fontBytes: fonts, title: "Report" });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  test("nothing changed → one short line; first scan says so", async () => {
    const quiet = await pageText({ ...DATA, changes: { listing: [], listingUnavailable: false, fixesConfirmed: 0 } });
    expect(quiet.all).toContain("No listing changes or confirmed fixes in this period.");
    const first = await pageText({ ...DATA, period: null, rank: null });
    expect(first.all).toContain("First scan — nothing earlier to compare yet.");
    expect(first.all).toContain("No competitor scan yet.");
  });

  test("Spanish version", async () => {
    const { all } = await pageText({ ...DATA, locale: "es", rank: { ...DATA.rank!, noun: "licorerías" } });
    for (const s of ["INFORME POSTSCORE", "Generado el 19 de octubre de 2026", "Calificación B", "Puesto 3 de 10 entre licorerías de la zona", "LOS 3 PRÓXIMOS PASOS", "(2 días)", "Las puntuaciones usan señales públicas reales"]) expect(all, s).toContain(s);
  });

  test("no text runs off the page", async () => {
    const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, read);
    const m = createMeasurer(fonts);
    const long = { ...DATA, business: { name: "The Very Long Named Neighborhood Wine & Spirits Emporium of Upper Broadway", address: DATA.business.address }, nextSteps: DATA.nextSteps.map((s) => ({ ...s, detail: s.detail.repeat(8) })) };
    const page = layoutReport(long, m);
    for (const e of page.panels[0].elements) {
      if (e.kind !== "text") continue;
      expect(e.x + m.width(e.text, e.role, e.size, e.letterSpacing ?? 0), e.text).toBeLessThanOrEqual(LETTER.width - 47);
      expect(e.y, e.text).toBeLessThan(LETTER.height - 20);
    }
  });
});
