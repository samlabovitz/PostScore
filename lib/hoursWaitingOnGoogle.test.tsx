// Nov 24 (Hair Express after a real re-scan): Google Maps can't be read
// (the live-read cap) → never "matches now" from the Business Profile; and
// when the Business Profile already shows the website's hours but Maps
// hasn't published them, the fix waits on Google: "Waiting for Google", out
// of the Overview's top 3, still in Fix plan's This week (Nov 26: the owner's
// part is a quick fix, so it counts in This week's total) and in "View all".
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));
vi.mock("@/app/actions/actionPlan", () => ({ markTaskDone: vi.fn() }));
const publicListing = vi.fn();
vi.mock("@/lib/ownerListing.server", () => ({ publicPlacesListing: (...args: unknown[]) => publicListing(...args) }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { hoursCheckState, hoursWaitingOnGoogle, LONG_WAIT_DAYS, waitingLong, waitingSince } from "@/lib/hoursCheck";
import { StillWaitingLine } from "@/components/scoring/HoursCheck";
import { loadHoursCheck } from "@/lib/hoursCheck.server";
import { weekFromPlacesPeriods } from "@/lib/hoursEditor";
import { TopRecommendations } from "@/components/overview/TopRecommendations";
import { TaskCard, TaskListCard } from "@/app/business/[id]/ActionPlanSection";
import { topRecommendations } from "@/lib/overviewTiles";
import { buildFixPlan } from "@/lib/fixPlan";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const wrap = (node: ReactNode, locale: Locale = "en") =>
  renderToStaticMarkup(<LocaleProvider locale={locale}><GbpEditProvider value={{ premium: true, connected: true, undo: null, canEdit: true }}>{node}</GbpEditProvider></LocaleProvider>);

const p = (day: number, oh: number, om: number, ch: number) => ({ open: { day, hour: oh, minute: om }, close: { day, hour: ch, minute: 0 } });
// The website and the Business Profile: Thursday 9:30–6; Google Maps still 10–5.
const PROFILE_PERIODS = [p(0, 11, 0, 16), p(2, 9, 30, 17), p(3, 9, 30, 17), p(4, 9, 30, 18), p(5, 9, 30, 18), p(6, 9, 0, 17)];
const MAPS_PERIODS = [p(0, 11, 0, 16), p(2, 9, 30, 17), p(3, 9, 30, 17), p(4, 10, 0, 17), p(5, 9, 30, 18), p(6, 9, 0, 17)];
const SITE_WEEK = [
  { day: 2, open: 570, close: 1020, closed: false },
  { day: 3, open: 570, close: 1020, closed: false },
  { day: 4, open: 570, close: 1080, closed: false },
  { day: 5, open: 570, close: 1080, closed: false },
  { day: 6, open: 540, close: 1020, closed: false },
  { day: 0, open: 660, close: 960, closed: false },
  { day: 1, open: null, close: null, closed: true },
];
const ANALYSIS = { checkedAt: "2026-11-23T17:14:00Z", websiteTrust: { infoConflicts: [{ field: "hours", siteWeek: SITE_WEEK }] } };
vi.mock("@/lib/scoring", async (importOriginal) => ({ ...(await importOriginal<object>()), parseWebsiteAnalysis: (raw: unknown) => raw }));

const CONNECTED = { place_id: "p1", opening_hours_periods: PROFILE_PERIODS, website_analysis_json: ANALYSIS, live_source: "business_profile" };
const HOURS_TASK = { checkId: "website.info_consistency", mismatchFields: ["hours"] };

const CHECK = { checkId: "website.info_consistency", category: "website", label: "Matches your Google listing", status: "open", effort: "quick_win", weightedPoints: 0.5, weightedPointsHigh: null, mismatchFields: ["hours"], when: "this_week", action: "", why: "", fix: "" } as never;
const OTHERS = [
  { checkId: "visibility.review_replies", category: "visibility", label: "Reply to reviews", status: "open", effort: "quick_win", weightedPoints: 6, weightedPointsHigh: null, when: "this_week", action: "", why: "", fix: "" },
  { checkId: "completeness.customer_details", category: "completeness", label: "Customer details", status: "open", effort: "quick_win", weightedPoints: 2, weightedPointsHigh: null, when: "this_week", action: "", why: "", fix: "" },
  { checkId: "visibility.reviews_merged", category: "visibility", label: "Get 3 new reviews", status: "open", effort: "weekly", weightedPoints: 4.7, weightedPointsHigh: null, when: "weeks", action: "", why: "", fix: "" },
] as never[];

describe("Google Maps can't be read", () => {
  test("Maps can't be read: never 'matches now' — the Business Profile matching the website is 'waiting on Google' (Nov 25 spec)", async () => {
    publicListing.mockResolvedValueOnce({ status: "unavailable" });
    const state = await loadHoursCheck("b1", CONNECTED, [HOURS_TASK]);
    expect(state).toEqual({ kind: "differs", days: [], profileAhead: true });
    expect(hoursWaitingOnGoogle(state)).toBe(true);
  });
  test("Maps read: Business Profile ahead of Maps → the days that differ and 'waiting on Google'", async () => {
    publicListing.mockResolvedValueOnce({ status: "ok", values: { openingHoursPeriods: MAPS_PERIODS } });
    const state = await loadHoursCheck("b1", CONNECTED, [HOURS_TASK]);
    expect(state).toMatchObject({ kind: "differs", profileAhead: true });
    expect(state?.kind === "differs" && state.days.map((d) => d.day)).toEqual([4]);
    expect(hoursWaitingOnGoogle(state)).toBe(true);
  });
  test("Maps read and it matches the website: matches now", async () => {
    publicListing.mockResolvedValueOnce({ status: "ok", values: { openingHoursPeriods: PROFILE_PERIODS } });
    expect(await loadHoursCheck("b1", CONNECTED, [HOURS_TASK])).toEqual({ kind: "stale" });
  });
});

describe("waiting on Google", () => {
  const site = weekFromPlacesPeriods(PROFILE_PERIODS);
  const waiting = hoursCheckState(site, weekFromPlacesPeriods(MAPS_PERIODS), site)!;
  const notConnected = hoursCheckState(site, weekFromPlacesPeriods(MAPS_PERIODS))!;
  const tasks = [CHECK, ...OTHERS] as Array<{ checkId: string; when?: string }>;

  test("only a Business Profile ahead of Maps is 'waiting'; not connected, it's a real difference", () => {
    expect(hoursWaitingOnGoogle(waiting)).toBe(true);
    expect(hoursWaitingOnGoogle(notConnected)).toBe(false);
  });

  test("Overview: out of the top 3; 'View all' (every item) still lists it last with the note (EN + ES)", () => {
    const recs = topRecommendations(tasks as never, null, "b1", {}, Infinity);
    const top = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} hoursCheck={waiting} />);
    expect(text(top)).not.toContain("Google Maps hasn't published them yet");
    const all = wrap(<TopRecommendations businessId="b1" recommendations={recs} hoursCheck={waiting} />).split("<li").slice(1);
    expect(text(all[all.length - 1])).toContain("Your Business Profile already shows your website's hours, but Google Maps hasn't published them yet");
    const es = wrap(<TopRecommendations businessId="b1" recommendations={recs} hoursCheck={waiting} />, "es");
    expect(text(es)).toContain("Su Perfil de Empresa ya muestra el horario de su sitio web, pero Google Maps aún no lo ha publicado");
  });

  test("Fix plan: still in This week with the replies and customer details, so This week's total is 78 → 87, with the note", () => {
    const plan = buildFixPlan({ tasks: tasks as never, websiteBanner: null, breakdown: { total: 78, grade: "C", categories: [], checks: [] } as never });
    const row = plan.rows.find((r) => r.kind === "task" && r.task.checkId === "website.info_consistency");
    expect(row?.when).toBe("this_week");
    expect(plan.thisWeekCount).toBe(3);
    expect(plan.thisWeek).toBe(87);
    for (const page of ["app/business/[id]/fix-plan/page.tsx", "app/business/[id]/page.tsx", "app/business/[id]/growth/page.tsx"]) expect(readFileSync(page, "utf8")).not.toContain("withHoursWhen");
    const card = wrap(<TaskListCard tasks={[tasks[0]] as never} businessId="b1" context="weekly" emptyMessage="" hoursCheck={waiting} />);
    expect(text(card)).toContain("Google Maps hasn't published them yet");
  });

  test("no priority pill anywhere, only 'Waiting for Google' (EN + ES)", () => {
    const plan = buildFixPlan({ tasks: tasks as never, websiteBanner: null, breakdown: { total: 78, grade: "C", categories: [], checks: [] } as never });
    const row = plan.rows.find((r) => r.kind === "task" && r.task.checkId === "website.info_consistency")!;
    const fixPlanCard = (locale: Locale) =>
      wrap(<TaskCard task={(row as unknown as { task: never }).task} businessId="b1" context="weekly" step={1} hoursCheck={waiting} fixPlan={{ priority: row.priority, running: row.running, locked: false }} />, locale);
    for (const html of [fixPlanCard("en"), wrap(<TaskListCard tasks={[tasks[0]] as never} businessId="b1" context="weekly" emptyMessage="" hoursCheck={waiting} />)]) {
      expect(html).toContain('data-testid="fix-waiting-google"');
      expect(text(html)).toContain("Waiting for Google");
      expect(html).not.toContain('data-testid="fix-priority"');
      expect(html).not.toContain('data-testid="fix-when"');
    }
    expect(text(fixPlanCard("es"))).toContain("Esperando a Google");
    const recs = topRecommendations(tasks as never, null, "b1", {}, Infinity);
    const all = wrap(<TopRecommendations businessId="b1" recommendations={recs} hoursCheck={waiting} />).split("<li").slice(1);
    const hoursItem = all[all.length - 1];
    expect(text(hoursItem)).toContain("Waiting for Google");
    expect(hoursItem).not.toContain("data-priority");
  });
});

describe("waiting more than a week: what the owner can check", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
  test("the wait starts at the hours change sent to the Business Profile, else the first scan of the latest run that saw the mismatch", () => {
    expect(waitingSince(ago(9), [{ at: ago(1), mismatch: true }])).toBe(ago(9));
    expect(waitingSince(null, [{ at: ago(1), mismatch: true }, { at: ago(5), mismatch: true }, { at: ago(12), mismatch: false }, { at: ago(20), mismatch: true }])).toBe(ago(5));
    expect(waitingSince(null, [{ at: ago(1), mismatch: false }])).toBeNull();
  });
  test("after 7 days: 'Still not on Google Maps after a week?' + 'Open your Business Profile ↗' (EN + ES); not before, never when it isn't waiting", () => {
    const state = (since: string | null, profileAhead = true) => ({ kind: "differs" as const, days: [], profileAhead, waitingSince: since });
    expect(LONG_WAIT_DAYS).toBe(7);
    expect(waitingLong(state(ago(8)), now)).toBe(true);
    expect(waitingLong(state(ago(6)), now)).toBe(false);
    expect(waitingLong(state(null), now)).toBe(false);
    expect(waitingLong(state(ago(30), false), now)).toBe(false);
    const en = text(wrap(<StillWaitingLine state={state(ago(30))} />));
    expect(en).toContain("Still not on Google Maps after a week? Check your Business Profile for an 'Under review' note, or re-save the hours. Open your Business Profile ↗");
    expect(wrap(<StillWaitingLine state={state(ago(30))} />)).toContain('href="https://business.google.com/"');
    expect(text(wrap(<StillWaitingLine state={state(ago(30))} />, "es"))).toContain("¿Todavía no aparece en Google Maps después de una semana?");
    expect(wrap(<StillWaitingLine state={state(ago(2))} />)).toBe("");
  });
  test("loaded from our own change log and saved scans (never Google's values); any failed read: no line", () => {
    const src = readFileSync("lib/hoursCheck.server.ts", "utf8");
    expect(src).toContain('.eq("field", "hours").in("status", ["sent", "pending_review"]).is("undone_at", null)');
    expect(src).toContain("} catch {\n    return state;");
  });
});
