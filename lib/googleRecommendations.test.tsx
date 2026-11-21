// Day 23C: every Google Profile tab recommendation says how many, what type
// and when, from real data and fixed rules; "Since you did this" compares
// the 30 days after with the 30 days before (14-day rule); the revenue
// estimate shows its math with the owner's own assumptions; Premium's one
// button vs Grow's steps.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/business/b1" }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import {
  beforeAfter,
  busiestCallDays,
  change,
  chartMarkers,
  cleanShare,
  descriptionPlan,
  detailsPlan,
  holidayPlan,
  leftMoney,
  monthSoFar,
  within,
  markerX,
  parseSharePercent,
  photoPlan,
  postPlan,
  recButton,
  recommendations,
  replyPlan,
  revenueMath,
  servicesPlan,
  shareChoice,
  sinceActions,
  sinceStatus,
  type DayNumbers,
  type Rec,
} from "@/lib/googleRecommendations";
import { dailyNumbers, type InsightsMonth } from "@/lib/gbpInsights";
import { groupActions } from "@/lib/googleActions.server";
import { RecItem, recText } from "@/components/gbp/GoogleRecs";

const TZ = "America/New_York";
// Thursday Nov 19, 2026, 3 pm in New York.
const NOW = Date.parse("2026-11-19T20:00:00Z");
const month = (m: string, callsByWeekday: number[] | null): InsightsMonth => ({ month: m, viewsSearchMobile: 100, viewsMapsMobile: 0, viewsSearchDesktop: 0, viewsMapsDesktop: 0, calls: 10, directions: 5, bookings: 0, websiteClicks: 5, conversations: 0, foodOrders: 0, callsByWeekday, topKeywords: null });

describe("photos: count + types the listing is missing", () => {
  test("a hair salon missing inside / team photos: those first, then the type's most useful", () => {
    const plan = photoPlan("hair", { count: 4, newestAt: "2026-09-01T00:00:00Z", categories: ["AT_WORK", "EXTERIOR"] }, NOW);
    expect(plan).toEqual({ count: 3, types: ["INTERIOR", "TEAMS", "PRODUCT"], fromMissing: true });
    expect(recText({ kind: "photos", plan: plan! }, "en", "hair").text).toBe("Add 3 photos this week: 1 inside your salon, 1 of your team, 1 of the products you use or sell");
  });
  test("types not read yet: the type's own top 3 (never claimed missing); a restaurant gets food first", () => {
    const plan = photoPlan("hair", { count: 4, newestAt: "2026-09-01T00:00:00Z" }, NOW)!;
    expect(plan).toEqual({ count: 3, types: ["INTERIOR", "AT_WORK", "TEAMS"], fromMissing: false });
    expect(recText({ kind: "photos", plan }, "en", "hair")).toEqual({ text: "Add 3 photos this week: 1 inside your salon, 1 of finished work, 1 of your team", sub: null });
    expect(recText({ kind: "photos", plan }, "es", "hair").text).toBe("Agregue 3 fotos esta semana: 1 del interior de su salón, 1 de un trabajo terminado, 1 de su equipo");
    expect(photoPlan("restaurant", { count: 0, newestAt: null }, NOW)!.types[0]).toBe("FOOD_AND_DRINK");
  });
  test("a photo in the last 30 days: nothing to do; photos not read: no rule", () => {
    expect(photoPlan("hair", { count: 9, newestAt: "2026-11-10T00:00:00Z" }, NOW)).toBeNull();
    expect(photoPlan("hair", null, NOW)).toBeNull();
  });
});

describe("review replies", () => {
  test("the newest unanswered, at most 10, about 2 minutes each", () => {
    expect(replyPlan({ replied: 0, inWindow: 20 })).toEqual({ count: 10, minutes: 20, left: 10, replied: 0, total: 20 });
    expect(replyPlan({ replied: 17, inWindow: 20 })).toEqual({ count: 3, minutes: 6, left: 0, replied: 17, total: 20 });
    expect(replyPlan({ replied: 20, inWindow: 20 })).toBeNull();
    expect(replyPlan(null)).toBeNull();
    expect(recText({ kind: "replies", plan: replyPlan({ replied: 0, inWindow: 20 })! }, "en", null).text).toBe("Reply to your 10 newest unanswered reviews, oldest first (about 20 min)");
    expect(recText({ kind: "replies", plan: replyPlan({ replied: 0, inWindow: 20 })! }, "es", null).text).toBe("Responda sus 10 reseñas más recientes sin respuesta, empezando por la más antigua (unos 20 min)");
  });
});

describe("Google posts: the day before the busiest call days", () => {
  test("Tue–Thu busiest (section 2's groups) → post Monday, the next one from today (Thu Nov 19 → Mon Nov 23)", () => {
    // Sunday first: Tue–Thu 37, Fri–Sat 13, Sun–Mon 4 — though Saturday alone beats Tuesday.
    const months = [month("2026-09", [1, 2, 4, 9, 5, 3, 8]), month("2026-10", [0, 1, 3, 8, 8, 1, 1])];
    expect(busiestCallDays(months)).toBe("midweek");
    const plan = postPlan({ last30: 0 }, months, "hair", NOW, TZ)!;
    expect(plan).toEqual({ weekday: 1, date: "2026-11-23", busiest: "midweek", topic: "hair" });
    const text = recText({ kind: "posts", plan }, "en", "hair");
    expect(text.text).toBe("Post 1 update on Monday (Nov 23), the day before your busiest call days (Tue–Thu)");
    // A general topic (no invented story) — a real before-and-after is the owner's optional upgrade.
    expect(text.sub).toBe("Idea: an invitation to book a new color or cut this season.");
    expect(recText({ kind: "posts", plan }, "es", "hair").text).toContain("Publique 1 novedad el lunes");
  });
  test("Fri–Sat busiest → Thursday, today's date; no call data → 'this week'; 2+ posts in 30 days → nothing", () => {
    expect(postPlan({ last30: 1 }, [month("2026-10", [0, 0, 0, 0, 0, 9, 4])], null, NOW, TZ)).toMatchObject({ weekday: 4, date: "2026-11-19", busiest: "weekend" });
    expect(postPlan({ last30: 0 }, [month("2026-10", [5, 4, 0, 0, 0, 0, 0])], null, NOW, TZ)).toMatchObject({ weekday: 6, date: "2026-11-21", busiest: "sunMon" });
    expect(postPlan({ last30: 0 }, [month("2026-10", null)], null, NOW, TZ)).toEqual({ weekday: null, date: null, busiest: null, topic: "default" });
    expect(postPlan({ last30: 2 }, [], null, NOW, TZ)).toBeNull();
    expect(postPlan(null, [], null, NOW, TZ)).toBeNull();
  });
});

describe("holiday hours: two days before", () => {
  test("Thanksgiving (Nov 26) not set → by Nov 24; set → the next one", () => {
    expect(holidayPlan([], NOW, TZ)).toEqual({ holiday: "thanksgiving", date: "2026-11-26", by: "2026-11-24", today: false });
    const set = [{ startDate: { year: 2026, month: 11, day: 26 }, closed: true }];
    expect(holidayPlan(set, NOW, TZ)).toMatchObject({ holiday: "christmasEve", by: "2026-12-22" });
    expect(holidayPlan(null, NOW, TZ)).toBeNull();
  });
  test("under 2 days away → today", () => {
    const wed = Date.parse("2026-11-25T15:00:00Z");
    expect(holidayPlan([], wed, TZ)).toEqual({ holiday: "thanksgiving", date: "2026-11-26", by: "2026-11-25", today: true });
    expect(recText({ kind: "holiday", plan: holidayPlan([], wed, TZ)! }, "en", null).text).toBe("Set Thanksgiving hours today (Thanksgiving is Nov 26)");
    expect(recText({ kind: "holiday", plan: holidayPlan([], NOW, TZ)! }, "en", null).text).toBe("Set Thanksgiving hours by Nov 24");
  });
});

describe("exact targets", () => {
  test("description: aim for 250+, you have N; details: about 1 minute each; services: the list", () => {
    expect(descriptionPlan("Hair salon")).toEqual({ target: 250, have: 10, minutes: 5 });
    expect(descriptionPlan("x".repeat(250))).toBeNull();
    expect(descriptionPlan(undefined)).toBeNull();
    expect(recText({ kind: "description", plan: descriptionPlan("Hair salon")! }, "en", null).text).toBe("Description: aim for 250+ characters, you have 10 (about 5 min)");
    expect(recText({ kind: "details", plan: detailsPlan(["parking", "accessibility"])! }, "en", null).text).toBe("Add parking + accessibility, about 2 minutes");
    expect(recText({ kind: "details", plan: detailsPlan(["parking", "accessibility"])! }, "es", null).text).toBe("Agregue estacionamiento + accesibilidad, unos 2 minutos");
    expect(detailsPlan([])).toBeNull();
    expect(recText({ kind: "services", plan: servicesPlan(["Balayage", "Highlights"])! }, "en", null).text).toBe("Add 2 services: Balayage, Highlights, about 2 min");
  });
  test("the list: a holiday within 14 days first, then replies, photos, posts, the listing targets", () => {
    const recs = recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: { replied: 0, inWindow: 20 }, photos: { count: 4, newestAt: "2026-09-01T00:00:00Z" }, posts: { last30: 0 }, months: [], specialPeriods: [], description: "Hair salon", missingDetails: ["parking"], missingServices: [] });
    expect(recs.map((r) => r.kind)).toEqual(["holiday", "replies", "photos", "posts", "description", "details"]);
    // Nothing read (not connected): nothing guessed.
    expect(recommendations({ type: "hair", now: NOW, timeZone: TZ, replies: null, photos: null, posts: null, months: [], specialPeriods: null })).toEqual([]);
  });
});

describe("one button: Premium does it, Grow gets the steps", () => {
  const html = (rec: Rec, premium: boolean, canEdit: boolean, locale: Locale = "en") =>
    renderToStaticMarkup(
      <LocaleProvider locale={locale}>
        <RecItem rec={rec} businessId="b1" premium={premium} canEdit={canEdit} type="hair" />
      </LocaleProvider>
    );
  const photos: Rec = { kind: "photos", plan: { count: 3, types: ["INTERIOR", "AT_WORK", "TEAMS"], fromMissing: false } };
  const posts: Rec = { kind: "posts", plan: { weekday: 1, date: "2026-11-23", busiest: "midweek", topic: "hair" } };
  const replies: Rec = { kind: "replies", plan: { count: 10, minutes: 20, left: 10, replied: 0, total: 20 } };

  test("the rule", () => {
    expect(recButton("photos", { premium: true, canEdit: true })).toEqual({ kind: "do_it" });
    expect(recButton("photos", { premium: true, canEdit: false })).toEqual({ kind: "verb" });
    // Day 23E: PostScore publishes the post (and applies the answers) for Premium.
    expect(recButton("posts", { premium: true, canEdit: true })).toEqual({ kind: "do_it" });
    expect(recButton("answers", { premium: true, canEdit: true })).toEqual({ kind: "do_it" });
    expect(recButton("posts", { premium: true, canEdit: false })).toEqual({ kind: "verb" });
    expect(recButton("photos", { premium: false, canEdit: true })).toEqual({ kind: "steps", premiumLine: true });
    expect(recButton("posts", { premium: false, canEdit: false })).toEqual({ kind: "steps", premiumLine: true });
  });
  test("Premium, writes allowed: one button to the editor; no steps, no Premium line — photos: 'Upload your photos' (Day 23E)", () => {
    const h = html(photos, true, true);
    expect(h).toContain(">Upload your photos<");
    expect(h).not.toContain("PostScore can do this for you");
    expect(html(posts, true, true)).toContain("PostScore can do this for you");
    expect(html(photos, true, true, "es")).toContain(">Suba sus fotos<");
    expect(h).toContain('href="#edit-photos"');
    expect((h.match(/data-testid="rec-button-/g) ?? []).length).toBe(1);
    expect(h).not.toContain("premium-one-click");
    expect(h).not.toContain("How to do it");
    expect(html(replies, true, true)).toContain('href="/business/b1/website-reviews#google-reviews"');
    expect(html(posts, true, true, "es")).toContain("PostScore puede hacerlo por usted");
  });
  test("Premium, writes off for the place: the editor's own verb (it opens read only)", () => {
    const h = html(photos, true, false);
    expect(h).not.toContain("PostScore can do this for you");
    expect(h).toContain(">Add photos<");
  });
  test("Premium posts: no more 'See post ideas' — the post's own preview in This week", () => {
    expect(html(posts, true, true)).not.toContain("See post ideas");
    expect(html(posts, true, true)).toContain('href="#google-tab-this-week"');
    expect(html(posts, true, false)).toContain(">Preview this week&#x27;s post<");
  });
  test("Grow: 'How to do it' + the Premium line where Premium does it — posts too (Day 23E)", () => {
    const h = html(photos, false, false);
    expect(h).toContain("How to do it");
    expect(h).toContain('data-testid="premium-one-click"');
    expect(h).toContain("Premium does this for you in one click →");
    expect(h).not.toContain("PostScore can do this for you");
    expect(html(posts, false, false)).toContain("premium-one-click");
    expect(html(photos, false, false, "es")).toContain("Premium lo hace por usted con un clic →");
  });
});

describe("actions on the chart", () => {
  const months = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  test("a date sits at its month's point, moved by the day; outside the chart → none", () => {
    expect(markerX("2026-05-01", months)).toBe(0);
    expect(markerX("2026-10-16", months)).toBe(100);
    expect(markerX("2026-07-16", months)).toBe(40);
    expect(markerX("2026-07-01", months)).toBe(30.3);
    expect(markerX("2026-11-03", months)).toBeNull();
  });
  test("one marker per day, that day's actions together", () => {
    const m = chartMarkers([{ date: "2026-10-03", kind: "replies", count: 10 }, { date: "2026-10-03", kind: "photos", count: 2 }, { date: "2026-11-03", kind: "listing", count: 1, what: ["customer_details"] }], months);
    expect(m).toHaveLength(1);
    expect(m[0].events.map((e) => e.kind)).toEqual(["replies", "photos"]);
  });
  test("the log grouped by day and kind (business time zone); undone, failed, practice and undos left out", () => {
    const events = groupActions(
      {
        replies: [
          { action: "post", status: "ok", created_at: "2026-11-03T15:00:00Z" },
          { action: "post", status: "unconfirmed", created_at: "2026-11-03T16:00:00Z" },
          { action: "post", status: "failed", created_at: "2026-11-03T16:00:00Z" },
          // 11 pm Nov 3 in New York.
          { action: "post", status: "ok", created_at: "2026-11-04T04:00:00Z" },
        ],
        changes: [
          { batch_id: "a", kind: "photos", field: "photo", status: "sent", approved_at: "2026-11-05T15:00:00Z" },
          { batch_id: "a", kind: "photos", field: "photo", status: "sent", approved_at: "2026-11-05T15:00:00Z" },
          { batch_id: "b", kind: "profile_info", field: "hours", status: "sent", approved_at: "2026-11-05T16:00:00Z" },
          { batch_id: "c", kind: "profile_info", field: "phone", status: "sent", approved_at: "2026-11-05T16:00:00Z", undone_at: "2026-11-06T00:00:00Z" },
          { batch_id: "d", kind: "profile_info", field: "phone", status: "failed", approved_at: "2026-11-05T16:00:00Z" },
          { batch_id: "e", kind: "profile_info_practice", field: "phone", status: "sent", approved_at: "2026-11-05T16:00:00Z" },
        ],
        promos: [{ created_at: "2026-11-07T15:00:00Z" }],
        referrals: [],
      },
      { timeZone: TZ, practice: false }
    );
    expect(events).toEqual([
      { date: "2026-11-03", kind: "replies", count: 3 },
      { date: "2026-11-05", kind: "listing", count: 1, what: ["hours"] },
      { date: "2026-11-05", kind: "photos", count: 2 },
      { date: "2026-11-07", kind: "campaign", count: 1 },
    ]);
  });
});

describe("Since you did this", () => {
  const days = (from: string, n: number, f: (i: number) => Partial<DayNumbers>): DayNumbers[] =>
    Array.from({ length: n }, (_, i) => {
      const date = new Date(Date.parse(`${from}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
      return { date, views: 10, calls: 1, directions: 0, websiteClicks: 0, actions: 1, ...f(i) };
    });

  test("the 14-day rule: shown from day 14; before, 'Check back on' the 14th day", () => {
    expect(sinceStatus("2026-11-05", "2026-11-19")).toEqual({ ready: true, days: 14 });
    expect(sinceStatus("2026-11-06", "2026-11-19")).toEqual({ ready: false, checkBack: "2026-11-20" });
  });
  test("30 days after (not counting the day itself) vs 30 days before", () => {
    // Oct 3 action: Sep 3–Oct 2 before (1 call a day), Oct 4–Nov 2 after (2 calls a day, 1 website click).
    const series = days("2026-09-01", 70, (i) => (i > 32 ? { calls: 2, websiteClicks: 1, actions: 3 } : {}));
    const r = beforeAfter(series, "2026-10-03", "2026-11-09")!;
    expect(r.days).toBe(30);
    expect(r.before).toEqual({ views: 300, calls: 30, directions: 0, websiteClicks: 0, actions: 30, rate: 10 });
    expect(r.after).toEqual({ views: 300, calls: 60, directions: 0, websiteClicks: 30, actions: 90, rate: 30 });
    expect(change(r.before.calls, r.after.calls, "count")).toEqual({ dir: "up", value: 30 });
    expect(change(r.before.rate, r.after.rate, "rate")).toEqual({ dir: "up", value: 20 });
    expect(change(10, 10.3, "rate")).toEqual({ dir: "same", value: 0 });
  });
  test("Google's numbers stop sooner: the same shorter window both sides; under 14 days of data → none", () => {
    const series = days("2026-09-01", 80, () => ({}));
    expect(beforeAfter(series, "2026-10-20", "2026-11-09")!.days).toBe(20);
    expect(beforeAfter(series, "2026-10-20", "2026-11-09")!.before.calls).toBe(20);
    expect(beforeAfter(series, "2026-10-30", "2026-11-09")).toBeNull();
  });
  test("up to 3 actions, newest first", () => {
    const e = (date: string) => ({ date, kind: "replies" as const, count: 1 });
    expect(sinceActions([e("2026-08-01"), e("2026-11-01"), e("2026-10-01"), e("2026-09-01")]).map((x) => x.date)).toEqual(["2026-11-01", "2026-10-01", "2026-09-01"]);
  });
  test("Google's daily series → one row per day, and the last day Google has", () => {
    const res = {
      multiDailyMetricTimeSeries: [
        {
          dailyMetricTimeSeries: [
            { dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 1 }, value: "20" }, { date: { year: 2026, month: 11, day: 2 } }] } },
            { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 1 }, value: "3" }] } },
            { dailyMetric: "BUSINESS_BOOKINGS", timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 1 }, value: "1" }] } },
          ],
        },
      ],
    };
    expect(dailyNumbers(res)).toEqual({
      days: [
        { date: "2026-11-01", views: 20, calls: 3, directions: 0, websiteClicks: 0, actions: 4 },
        { date: "2026-11-02", views: 0, calls: 0, directions: 0, websiteClicks: 0, actions: 0 },
      ],
      dataThrough: "2026-11-01",
    });
  });
});

describe("the revenue estimate's math, with the owner's assumptions", () => {
  test("default: a third to all", () => {
    const m = revenueMath(152, 50, null)!;
    expect(m.source).toBe("default");
    expect(m.exact[0]).toBeCloseTo(2533.33, 1);
    expect([m.low, m.high]).toEqual([2550, 7600]);
  });
  test("the owner's share: one number, and 'Left on the table' at the same share", () => {
    expect(revenueMath(152, 50, 0.5)).toMatchObject({ source: "owner", exact: [3800, 3800], low: 3800, high: 3800 });
    expect(revenueMath(152, 80, 0.75)).toMatchObject({ low: 9100, high: 9100 });
    expect(leftMoney(21, 50, null)).toEqual({ low: 350, high: 1050 });
    expect(leftMoney(21, 50, 0.5)).toEqual({ low: 550, high: 550 });
    expect(revenueMath(152, null, 0.5)).toBeNull();
    expect(revenueMath(0, 50, null)).toBeNull();
  });
  test("choices and the owner's own %", () => {
    expect(shareChoice(null)).toBe("default");
    expect(shareChoice(1 / 3)).toBe("third");
    expect(shareChoice(0.3333)).toBe("third");
    expect(shareChoice(0.5)).toBe("half");
    expect(shareChoice(0.75)).toBe("most");
    expect(shareChoice(0.4)).toBe("own");
    expect(parseSharePercent("40")).toBe(0.4);
    expect(parseSharePercent("12,5 %")).toBe(0.125);
    for (const bad of ["0", "101", "abc", ""]) expect(parseSharePercent(bad)).toBe("invalid");
    expect(cleanShare("0.5")).toBe(0.5);
    expect(cleanShare(2)).toBeNull();
    expect(cleanShare(null)).toBeNull();
  });
});

describe("November so far, and never stuck loading", () => {
  const day = (date: string, calls: number): DayNumbers => ({ date, views: 10, calls, directions: 1, websiteClicks: 2, actions: calls + 3 });
  test("the month's days up to the last one Google has", () => {
    const days = [day("2026-10-31", 9), day("2026-11-01", 1), day("2026-11-02", 2), day("2026-11-17", 3), day("2026-11-18", 0)];
    expect(monthSoFar(days, "2026-11-01", "2026-11-17")).toEqual({ through: "2026-11-17", calls: 6, websiteClicks: 6, directions: 3 });
    expect(monthSoFar(days, "2026-11-01", null)).toBeNull();
    expect(monthSoFar(days, "2026-11-01", "2026-10-31")).toBeNull();
  });
  test("a read that fails or takes too long → failed ('Couldn't load from Google right now')", async () => {
    vi.useFakeTimers();
    const slow = within(new Promise<string>(() => undefined), 20_000, "failed");
    vi.advanceTimersByTime(20_000);
    await expect(slow).resolves.toBe("failed");
    vi.useRealTimers();
    await expect(within(Promise.reject(new Error("x")), 1000, "failed")).resolves.toBe("failed");
    await expect(within(Promise.resolve("ok"), 1000, "failed")).resolves.toBe("ok");
  });
});
