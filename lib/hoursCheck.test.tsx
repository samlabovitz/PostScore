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
  test("stale: “Your website and Google now match — re-scan to update your score”, the Re-scan button, no points, no “show different hours”; out of Biggest boost (EN + ES)", () => {
    const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} />);
    const item = html.split("<li").slice(1).find((li) => li.includes("hours-stale"))!;
    expect(text(item)).toContain("Your website and Google now match — re-scan to update your score");
    expect(item).toContain('data-kind="rescan"');
    expect(text(item)).not.toMatch(/\+\d+ pts?\b|show different hours/);
    expect(biggestBoostFrom(withoutStaleHours(recs, { kind: "stale" }), [], "en")?.label).not.toBe("Matches your Google listing");
    expect(biggestBoostFrom(withoutStaleHours(recs, null), [], "en")?.label).toBe("Matches your Google listing");
    expect(text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={{ kind: "stale" }} />, "es"))).toContain("Su sitio web y Google ya coinciden; vuelva a analizar para actualizar su puntuación");
  });
  test("a real difference: the exact days, website vs Google, and that Google Maps hasn't published the Business Profile's hours yet (EN + ES)", () => {
    const state = hoursCheckState(SITE, MAPS, PROFILE)!;
    const words = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={state} />));
    expect(words).toContain("Tuesday: website 9:30 AM – 5:00 PM · Google 10:00 AM – 5:00 PM");
    expect(words).toContain("Thursday: website 9:30 AM – 6:00 PM · Google 10:00 AM – 5:00 PM");
    expect(words).toContain("+1 more");
    expect(words).toContain("Google Maps hasn't published them yet");
    expect(words).not.toContain("show different hours");
    expect(words).toMatch(/\+1 pt|\+0\.6|pt/);
    const es = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={state} />, "es"));
    expect(es).toMatch(/jueves: sitio web 9:30 a\.\s?m\. – 6:00 p\.\s?m\. · Google 10:00 a\.\s?m\. – 5:00 p\.\s?m\./);
  });
});

describe("Growth recap", () => {
  test("stale: the re-scan title and button, no points, no “I did this”; a difference: the days in place of the scan's sentence", () => {
    const stale = wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={{ kind: "stale" }} />).split("<li").slice(1)[0];
    expect(text(stale)).toContain("Your website and Google now match — re-scan to update your score");
    expect(stale).toContain('data-kind="rescan"');
    expect(text(stale)).not.toMatch(/Up to|I did this|show different hours/);
    const differs = wrap(<TaskListCard tasks={[CHECK]} businessId="b1" context="weekly" emptyMessage="" hoursCheck={hoursCheckState(SITE, MAPS, PROFILE)} />).split("<li").slice(1)[0];
    expect(text(differs)).toContain("Thursday: website 9:30 AM – 6:00 PM · Google 10:00 AM – 5:00 PM");
    expect(text(differs)).not.toContain("show different hours");
    // Never the scan's sentence next to the days (it read Google's side from the Business Profile: "Google says Thursday 9:30 AM–6:00 PM").
    expect(text(differs)).not.toMatch(/Google says/);
    expect(text(differs)).toContain("Up to +1 pt");
  });
});
