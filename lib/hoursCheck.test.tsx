// Day 23B: the scored hours check as it is now — matching (re-scan, no
// points, out of Biggest boost) or the exact days that differ.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { hoursCheckState, withoutStaleHours } from "@/lib/hoursCheck";
import { weekFromSite } from "@/lib/gbpProfileEdits";
import { weekFromPlacesPeriods } from "@/lib/hoursEditor";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import { TaskListCard } from "@/app/business/[id]/ActionPlanSection";
import { biggestBoostFrom, topRecommendations } from "@/lib/overviewTiles";
import { HoursComparePanel } from "@/components/hours/HoursMismatchChooser";
import { readFileSync } from "fs";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const wrap = (node: ReactNode, locale: Locale = "en", edit = { premium: true, connected: true, undo: null, canEdit: true }) =>
  renderToStaticMarkup(<LocaleProvider locale={locale}><GbpEditProvider value={edit}>{node}</GbpEditProvider></LocaleProvider>);

// Hair Express (Nov 19): the website and the Business Profile at 9:30; Google Maps' public listing still at 10:00.
const SITE = weekFromSite([
  { day: 2, open: 570, close: 1020, closed: false },
  { day: 3, open: 570, close: 1020, closed: false },
  { day: 4, open: 570, close: 1080, closed: false },
  { day: 5, open: 570, close: 1080, closed: false },
  { day: 6, open: 540, close: 1020, closed: false },
  { day: 0, open: 660, close: 960, closed: false },
  { day: 1, open: null, close: null, closed: true },
]);
const p = (day: number, oh: number, om: number, ch: number) => ({ open: { day, hour: oh, minute: om }, close: { day, hour: ch, minute: 0 } });
const MAPS = weekFromPlacesPeriods([p(0, 11, 0, 16), p(2, 10, 0, 17), p(3, 10, 0, 17), p(4, 10, 0, 17), p(5, 10, 0, 18), p(6, 9, 0, 17)]);
const PROFILE = weekFromPlacesPeriods([p(0, 11, 0, 16), p(2, 9, 30, 17), p(3, 9, 30, 17), p(4, 9, 30, 18), p(5, 9, 30, 18), p(6, 9, 0, 17)]);

const CHECK = { checkId: "website.info_consistency", category: "website", label: "Matches your Google listing", status: "open", effort: "quick_win", weightedPoints: 0.6, weightedPointsHigh: null, mismatchFields: ["hours"], action: "Your website and Google listing show different hours — check which is correct and update the other.", problem: "Your website's “Hours” say Thursday 9:30 AM–6:00 PM; Google says Thursday 9:30 AM–6:00 PM.", why: "", fix: "" } as never;
const REVIEWS = { checkId: "visibility.review_count", category: "visibility", label: "Reviews", status: "pending_verification", effort: "weekly", weightedPoints: 13, weightedPointsHigh: null, action: "Get reviews.", why: "", fix: "" } as never;

describe("the rule", () => {
  test("Hair Express now: a real difference — Tue, Wed, Thu, Fri at 9:30 on the website vs 10:00 on Google Maps; the Business Profile is already ahead", () => {
    const state = hoursCheckState(SITE, MAPS, PROFILE);
    expect(state?.kind).toBe("differs");
    if (state?.kind !== "differs") return;
    expect(state.days.map((d) => d.day)).toEqual([2, 3, 4, 5]);
    expect(state.profileAhead).toBe(true);
  });
  test("they match now: stale; unknown on either side: nothing to say", () => {
    expect(hoursCheckState(SITE, PROFILE)).toEqual({ kind: "stale" });
    expect(hoursCheckState(null, MAPS)).toBeNull();
    expect(hoursCheckState(SITE, null)).toBeNull();
  });
});

describe("Overview", () => {
  const recs = topRecommendations([CHECK, REVIEWS], null, "b1", {}, Infinity);
  test("stale: “Changed since your last scan · Re-scan to update”, the Re-scan button, no points, no “show different hours”; out of Biggest boost (EN + ES)", () => {
    const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} />);
    const item = html.split("<li").slice(1).find((li) => li.includes("hours-stale"))!;
    expect(text(item)).toContain("Changed since your last scan · Re-scan to update");
    expect(item).toContain('data-kind="rescan"');
    expect(text(item)).not.toMatch(/\+\d+ pts?\b|show different hours/);
    expect(biggestBoostFrom(withoutStaleHours(recs, { kind: "stale" }), [], "en")?.label).not.toBe("Matches your Google listing");
    // No live compare: the scan's own line decides — the same hours on both sides is stale too (Day 25B polish)…
    // No live compare: the scan's own points stand (never "matches now" from the page's words); waiting on Google: out.
    expect(biggestBoostFrom(withoutStaleHours(recs, null), [], "en")?.label).toBe("Matches your Google listing");
    expect(biggestBoostFrom(withoutStaleHours(recs, { kind: "differs", days: [], profileAhead: true }), [], "en")?.label).not.toBe("Matches your Google listing");
    // …and a line with different hours stays a fix.
    const differs = topRecommendations([{ ...(CHECK as object), problem: "Your website's “Hours” say Thursday 9:30 AM–6:00 PM; Google says Thursday 10:00 AM–6:00 PM." } as never, REVIEWS], null, "b1", {}, Infinity);
    expect(biggestBoostFrom(withoutStaleHours(differs, null), [], "en")?.label).toBe("Matches your Google listing");
    expect(text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} />, "es"))).toContain("Cambió desde su último análisis · Vuelva a analizar para actualizar");
  });
  test("a real difference: the exact days, website vs Google, and that Google Maps hasn't published the Business Profile's hours yet (EN + ES)", () => {
    const state = hoursCheckState(SITE, MAPS, PROFILE)!;
    const words = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={state} />));
    expect(words).toContain("Tuesday: website 9:30 AM – 5:00 PM · Google Maps 10:00 AM – 5:00 PM");
    expect(words).toContain("Thursday: website 9:30 AM – 6:00 PM · Google Maps 10:00 AM – 5:00 PM");
    expect(words).toContain("+1 more");
    expect(words).toContain("Google Maps hasn't published them yet");
    expect(words).not.toContain("show different hours");
    expect(words).toMatch(/\+1 pt|\+0\.6|pt/);
    const es = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={state} />, "es"));
    expect(es).toMatch(/jueves: sitio web 9:30 a\.\s?m\. – 6:00 p\.\s?m\. · Google Maps 10:00 a\.\s?m\. – 5:00 p\.\s?m\./);
  });
});

describe("Growth recap", () => {
  test("stale: the re-scan title and button, no points, no “I did this”; a difference: the days in place of the scan's sentence", () => {
    const stale = wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={{ kind: "stale" }} />).split("<li").slice(1)[0];
    expect(text(stale)).toContain("Changed since your last scan · Re-scan to update");
    expect(stale).toContain('data-kind="rescan"');
    expect(text(stale)).not.toMatch(/Up to|I did this|show different hours/);
    const differs = wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={hoursCheckState(SITE, MAPS, PROFILE)} />).split("<li").slice(1)[0];
    expect(text(differs)).toContain("Thursday: website 9:30 AM – 6:00 PM · Google Maps 10:00 AM – 5:00 PM");
    expect(text(differs)).not.toContain("show different hours");
    // Never the scan's sentence next to the days (it read Google's side from the Business Profile: "Google says Thursday 9:30 AM–6:00 PM").
    expect(text(differs)).not.toMatch(/Google says/);
    // Day 25B step 3: one decimal under 10 (the saved check's own points).
    expect(text(differs)).toContain("Up to +0.6 pts");
  });
});

// Day 25B step 3: when Google now shows the website's hours, every hours row
// says "Changed since your last scan · Re-scan to update" — never "differs".
describe("Google matches the website again", () => {
  const view = (google: unknown) => ({ status: "ok", google, googleLines: null, live: true, site: SITE, builder: null, siteUrl: null, canEdit: false, tab: false }) as never;

  test("the compare panel: the changed line and Re-scan, no 'different hours' question or choices (EN + ES)", () => {
    const html = wrap(<HoursComparePanel businessId="b1" initialView={view(PROFILE)} />);
    expect(html).toContain('data-matches-now="true"');
    expect(text(html)).toContain("Changed since your last scan · Re-scan to update");
    expect(text(html)).not.toContain("show different hours");
    expect(html).not.toContain("choice-google");
    expect(text(wrap(<HoursComparePanel businessId="b1" initialView={view(PROFILE)} />, "es"))).toContain("Cambió desde su último análisis · Vuelva a analizar para actualizar");
    // Still different: the two versions and the choice, as before.
    expect(wrap(<HoursComparePanel businessId="b1" initialView={view(MAPS)} />)).toContain("choice-google");
  });

  test("Spanish: Google's column uses the same days, 'Cerrado' and time format as the website's", () => {
    const es = text(wrap(<HoursComparePanel businessId="b1" initialView={view(MAPS)} readOnly />, "es"));
    expect(es).toContain("Lunes Cerrado");
    expect(es).not.toMatch(/Closed|\d AM|\d PM/);
    // The server reads Google's week (not its English lines) whenever it can.
    expect(readFileSync("app/actions/hoursChooser.ts", "utf8")).toContain("google = weekFromPlacesPeriods(");
  });


  test("the Google listing's Hours row: the changed note, no Compare", () => {
    const src = readFileSync("components/gbp/GoogleListingPage.tsx", "utf8");
    expect(src).toContain('const compare = row.id === "hours" && props.hoursMismatch === true && props.hoursMatchNow !== true;');
    expect(src).toContain('props.hoursMismatch && props.hoursMatchNow ? { note: t(locale, "dashboard.hoursCheck.staleTitle") }');
  });
});

// Day 25B step 3 (after a real re-scan, Nov 23): a check that matches now keeps
// its real title, never first, no pill; and never "Re-scan now" before it's open.
describe("an hours check that matches now, right after a scan", () => {
  const recs = topRecommendations([CHECK, { ...(REVIEWS as object), status: "open", when: "weeks" } as never], null, "b1", {}, 3);
  const justScanned = new Date(Date.now() - 2 * 3_600_000).toISOString();

  test("Overview: the fix's real title with the note under it, no priority pill, after every other item (EN + ES)", () => {
    const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} lastScanAt={justScanned} />);
    const items = html.split("<li").slice(1);
    expect(text(items[0])).not.toContain("Changed since your last scan");
    const hours = items[items.length - 1];
    expect(text(hours)).toContain("Match your website's hours to Google");
    expect(text(hours)).toContain("Changed since your last scan · Re-scan to update");
    expect(hours).not.toContain("data-priority");
    expect(text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} lastScanAt={justScanned} />, "es"))).toContain("Haga que el horario de su sitio coincida con Google");
  });

  test("no 'Re-scan now' while the next re-scan isn't open: 'Next re-scan available …' instead; the button once it is", () => {
    const soon = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} lastScanAt={justScanned} />);
    expect(soon).not.toContain('data-kind="rescan"');
    expect(text(soon)).toMatch(/Next re-scan available [A-Z][a-z]{2} \d{1,2}/);
    const open = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} lastScanAt={new Date(Date.now() - 30 * 3_600_000).toISOString()} />);
    expect(open).toContain('data-kind="rescan"');
    const card = wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={{ kind: "stale" }} lastScanAt={justScanned} />);
    expect(text(card)).toContain("Match your website's hours to Google");
    expect(card).not.toContain('data-kind="rescan"');
    expect(text(wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={{ kind: "stale" }} lastScanAt={justScanned} />, "es"))).toContain("Próximo análisis disponible el");
  });
});
