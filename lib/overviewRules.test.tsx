import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";

vi.mock("@/app/actions/scoring", () => ({ rescanBusiness: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { RESCAN_COOLDOWN_HOURS, rescanAvailability, scanFreshness } from "./rescanPolicy";
import { freshnessLabel, rescanToast, ScanStatusStrip } from "@/components/scoring/ScanStatusStrip";
import { generateSuggestions, ratingBand, scoreBusiness, SCORING_VERSION } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { CategoryCard, checkOutcome } from "@/components/scoring/CategoryCard";
import { AnimatedScoreRing } from "@/components/overview/AnimatedScoreRing";

const NOW = new Date("2026-10-16T18:00:00Z");
const NY = "America/New_York";

describe("one re-scan per business per 24 hours", () => {
  test("allowed with no scan, or 24h+ after the last one", () => {
    expect(rescanAvailability(null, NOW)).toEqual({ allowed: true, nextAvailableAt: null });
    expect(rescanAvailability("2026-10-15T17:59:00Z", NOW).allowed).toBe(true);
    expect(RESCAN_COOLDOWN_HOURS).toBe(24);
  });
  test("used → refused, with the exact time it opens", () => {
    expect(rescanAvailability("2026-10-16T09:30:00Z", NOW)).toEqual({ allowed: false, nextAvailableAt: "2026-10-17T09:30:00.000Z" });
  });
  test("the Overview shows 'Next re-scan available …' and disables the button", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone={NY}>
        <ScanStatusStrip businessId="b" lastScanAt="2026-10-16T09:30:00Z" now={NOW.toISOString()} mode="button" scoringVersion="1.11.0" />
      </LocaleProvider>
    );
    expect(html).toContain("Next re-scan available Oct 17, 2026");
    expect(html).toMatch(/<button[^>]*disabled/);
    expect(html).toContain("Your score, history and competitor comparison update only when you re-scan.");
  });
});

describe("freshness, in the business's own time zone", () => {
  test("today (green), N days (neutral), 30+ days (amber), never", () => {
    expect(freshnessLabel("2026-10-16T13:00:00Z", NOW, NY, "en")).toEqual({ text: "Scanned today", tone: "green" });
    expect(freshnessLabel("2026-10-15T13:00:00Z", NOW, NY, "en")).toEqual({ text: "Scanned 1 day ago", tone: "neutral" });
    expect(freshnessLabel("2026-10-07T13:00:00Z", NOW, NY, "en")).toEqual({ text: "Scanned 9 days ago", tone: "neutral" });
    expect(freshnessLabel("2026-09-10T13:00:00Z", NOW, NY, "en")).toEqual({ text: "Scanned 36 days ago — re-scan for current results", tone: "amber" });
    expect(freshnessLabel(null, NOW, NY, "en").text).toBe("Not scanned yet");
    expect(freshnessLabel("2026-10-07T13:00:00Z", NOW, NY, "es").text).toBe("Escaneado hace 9 días");
  });
  test("a late-evening Pacific scan is 'today' for an LA business but 'yesterday' in New York terms", () => {
    const lateLA = "2026-10-16T05:30:00Z"; // Oct 15, 10:30 PM in LA
    expect(scanFreshness(lateLA, new Date("2026-10-16T06:30:00Z"), "America/Los_Angeles").kind).toBe("today");
  });
  test("other pages link to the Overview's button; Competitors adds its own refresh rule", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <ScanStatusStrip businessId="b" lastScanAt="2026-10-16T13:00:00Z" now={NOW.toISOString()} mode="link" note="Competitors refresh separately, once every 30 days." />
      </LocaleProvider>
    );
    expect(html).toContain('href="/business/b#rescan"');
    expect(html).toContain("Competitors refresh separately, once every 30 days.");
  });
});

describe("the after-scan summary is honest", () => {
  test("score change and checks changed; a scoring update says so instead", () => {
    expect(rescanToast({ scoreBefore: 86, scoreAfter: 87, scoringUpdated: false, checksChanged: 2 }, "en")).toBe("Score 86 → 87 · 2 checks changed");
    expect(rescanToast({ scoreBefore: 86, scoreAfter: 86, scoringUpdated: false, checksChanged: 0 }, "en")).toBe("Score 86 → 86 · no checks changed");
    expect(rescanToast({ scoreBefore: 80, scoreAfter: 87, scoringUpdated: true, checksChanged: 0 }, "en")).toBe("PostScore updated how it scores — your score is now 87.");
  });
});

describe("rating wording — no scoring change", () => {
  const rated = (rating: number, reviewCount: number) => ({ ...scoringInput(), rating, reviewCount });
  const ratingCheck = (rating: number, reviewCount: number, locale: "en" | "es" = "en") =>
    scoreBusiness(rated(rating, reviewCount), locale).checks.find((c) => c.id === "visibility.rating")!;

  test("Hair express on Broadway: 5.0★ with 30 reviews is 'Excellent', never 'Needs work' (still 14.4 / 16 points)", () => {
    const c = ratingCheck(5.0, 30);
    expect(c.earnedPoints).toBe(14.4);
    expect(checkOutcome(c)).toBe("excellent");
    expect(c.explanation).toBe("5.0★ on Google. Your rating counts fully as you get more reviews (30 now — full credit at 40+).");
    expect(ratingCheck(5.0, 30, "es").explanation).toBe("5.0★ en Google. Su calificación cuenta por completo a medida que obtiene más reseñas (30 ahora — puntos completos a partir de 40).");
    const advice = generateSuggestions(scoreBusiness(rated(5.0, 30))).find((s) => s.checkId === "visibility.rating")!.advice;
    expect(advice).toMatch(/^Get more Google reviews/);
    expect(advice).not.toMatch(/Improve your average star rating/);
  });

  test("4.3–4.5★ is 'Good'; under 4.3★ is 'Needs work' with service + reply advice", () => {
    expect(ratingBand(4.4)).toBe("good");
    expect(checkOutcome(ratingCheck(4.4, 100))).toBe("good");
    const low = ratingCheck(4.1, 100);
    expect(checkOutcome(low)).toBe("needs_work");
    expect(low.explanation).toBe("Rated 4.1★ on Google — below the 4.3★ or higher most customers look for.");
    const advice = generateSuggestions(scoreBusiness(rated(4.1, 100))).find((s) => s.checkId === "visibility.rating")!.advice;
    expect(advice).toMatch(/reply to every review/);
  });

  test("points are unchanged (still version 1.11.0)", () => {
    expect(SCORING_VERSION).toBe("1.11.0");
    expect(ratingCheck(4.5, 40).earnedPoints).toBe(12.8);
  });

  test("the Reviews page / Overview row reads 'Excellent' in EN and 'Excelente' in ES", () => {
    for (const [locale, word] of [["en", "Excellent"], ["es", "Excelente"]] as const) {
      const visibility = scoreBusiness(rated(5.0, 30), locale).categories.find((c) => c.id === "visibility")!;
      const html = renderToStaticMarkup(<LocaleProvider locale={locale}><CategoryCard category={visibility} /></LocaleProvider>);
      expect(html).toContain(word);
    }
  });
});

describe("the hero ring renders the real score on the server (no hydration mismatch)", () => {
  test("server HTML already shows the final number", () => {
    const html = renderToStaticMarkup(<AnimatedScoreRing score={86} businessId="b" />);
    expect(html).toContain(">86<");
    expect(html).toContain('aria-label="86 / 100"');
  });
});
