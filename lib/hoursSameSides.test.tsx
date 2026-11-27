// Nov 27 (the Hair Express Website page): "Matches your Google listing" still used the scan's old sentence ("Your
// website's Hours say Thursday 9:30 AM–6:00 PM; Google says Thursday 9:30 AM–6:00 PM") and told the owner to change
// the website. Everywhere now — Website page, Overview breakdown, PostAI, reports — goes through the same rule:
// waiting on Google is never the website's to fix, a real difference names the days and each side's source, and a
// line whose two sides read the same never says they differ.
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1/website" }));

import { LocaleProvider, t, type Locale } from "@/lib/i18n";
import { hoursExplanation, hoursShownSame, type HoursCheckState } from "@/lib/hoursCheck";
import { WebsiteScoreBreakdown, hoursNotWebsites } from "@/app/business/[id]/website/WebsiteScoreBreakdown";
import { CategoryCard } from "@/components/scoring/CategoryCard";
import { HoursDiffLines } from "@/components/scoring/HoursCheck";
import { sameShown } from "@/lib/monthlyReportExtras";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);

const line = (locale: Locale, site: string, google: string) => t(locale, "content.checks.website.info_consistency.explanation.conflictHoursLabelled", { label: "Hours", site, google });
const SAME = line("en", "Thursday 9:30 AM–6:00 PM", "Thursday 9:30 AM–6:00 PM");
const REAL = line("en", "Thursday 9:30 AM–6:00 PM", "Thursday 10:00 AM–5:00 PM");
const check = (explanation: string) => ({ id: "website.info_consistency", label: "Matches your Google listing", category: "website", maxPoints: 1, earnedPoints: 0.5, confidence: "VERIFIED", explanation }) as never;
const category = (explanation: string) => ({ id: "website", label: "Website", earnedPoints: 0.5, possiblePoints: 1, relativeScore: 50, weight: 30, checks: [check(explanation)] }) as never;
const page = (explanation: string, hoursCheck: HoursCheckState | null, locale: Locale = "en") =>
  wrap(<WebsiteScoreBreakdown websiteCategory={category(explanation)} websiteAnalysis={null} websiteSuggestions={[{ checkId: "website.info_consistency", advice: "Ask your web person to update the hours." } as never]} hoursCheck={hoursCheck} />, locale);
const WAITING: HoursCheckState = { kind: "differs", days: [], profileAhead: true, waitingSince: "2026-11-11T12:00:00Z" };

describe("the rule: both sides read the same → never 'they differ'", () => {
  test("the scan's line with the same hours on both sides is replaced (EN + ES); a real difference stays", () => {
    expect(hoursShownSame([SAME])).toBe(true);
    expect(hoursExplanation(check(SAME), "en")).toBe("Your website and your Google listing show the same hours now; Google Maps still showed different hours at your last scan. Your next scan updates this.");
    expect(hoursExplanation(check(line("es", "jueves 9:30–18:00", "jueves 9:30–18:00")), "es")).toContain("Su sitio web y su ficha de Google muestran ahora el mismo horario");
    expect(hoursExplanation(check(REAL), "en")).toBe(REAL);
  });
  test("the Overview breakdown row and the Website page row never render the same-sides line", () => {
    for (const html of [wrap(<CategoryCard category={category(SAME)} embedded businessId="b1" />), page(SAME, null)]) {
      expect(text(html)).not.toContain("Google says Thursday 9:30 AM–6:00 PM");
      expect(text(html)).toContain("show the same hours now");
    }
  });
  test("reports: a mismatch whose two sides read the same is never listed ('update whichever is wrong')", () => {
    expect(sameShown("Thursday: 9:30 AM – 6:00 PM", "Thursday 9:30 AM–6:00 PM")).toBe(true);
    expect(sameShown("Thursday 9:30 AM–6:00 PM", "Thursday 10:00 AM–5:00 PM")).toBe(false);
    expect(readFileSync("lib/monthlyReportExtras.ts", "utf8")).toContain(".filter((v) => sameShown(v.site, v.google) === false)");
  });
  test("PostAI reads the same rule (its facts and its context)", () => {
    expect(readFileSync("lib/postaiFacts.ts", "utf8")).toContain('explanation: hoursExplanation(c, "en"),');
    expect(readFileSync("lib/assistant.ts", "utf8")).toContain("hoursExplanation({ id: c.checkId, explanation: c.explanation }, locale)");
  });
});

describe("Website page: the same logic as Overview and Fix plan", () => {
  test("waiting on Google: the pill, 'Your Business Profile already matches your website…', the 7-day line — no web-person fix, no copy message (EN + ES)", () => {
    const html = page(REAL, WAITING);
    const words = text(html);
    expect(html).toContain('data-testid="hours-waiting"');
    expect(words).toContain("Waiting for Google");
    expect(words).toContain("Your Business Profile already matches your website; Google Maps hasn't published it yet.");
    expect(html).toContain('data-testid="hours-still-waiting"');
    expect(words).not.toContain("Ask your web person");
    expect(words).not.toContain("Google says");
    expect(hoursNotWebsites(check(REAL), WAITING)).toBe(true);
    expect(text(page(REAL, WAITING, "es"))).toContain("Su Perfil de Empresa ya coincide con su sitio web; Google Maps aún no lo ha publicado.");
  });
  test("the live compare is loaded on the Website page (the same loader as Overview and Fix plan)", () => {
    const src = readFileSync("app/business/[id]/website/page.tsx", "utf8");
    expect(src).toContain("const hoursCheck = hasWebsite ? await websiteHoursCheck(params.id, data.websiteCategory) : null;");
    expect(src).toContain("loadHoursCheck(businessId, scored.scoringBusiness ?? scored.business,");
  });
  test("a real difference: the days, each side's real source ('Google Maps …'), never the same value on both sides", () => {
    const day = (open: number, close: number) => ({ mode: "open", ranges: [{ open, close }] }) as never;
    const differs: HoursCheckState = { kind: "differs", days: [{ day: 4, website: day(570, 1080), google: day(600, 1020) }, { day: 5, website: day(570, 1080), google: day(570, 1080) }], profileAhead: false, googleSource: "maps" };
    const words = text(wrap(<HoursDiffLines state={differs as Extract<HoursCheckState, { kind: "differs" }>} />));
    expect(words).toMatch(/Thursday: website .* · Google Maps /);
    expect(words).not.toMatch(/Friday/);
    const profile = text(wrap(<HoursDiffLines state={{ ...(differs as Extract<HoursCheckState, { kind: "differs" }>), googleSource: "profile" }} />, "es"));
    expect(profile).toContain("Perfil de Empresa");
    expect(hoursNotWebsites(check(REAL), differs)).toBe(false);
  });
});
