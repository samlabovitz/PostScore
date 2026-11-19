// Day 23B: the Overview's "Your Google listing" card, the details-mismatch
// tasks and their "now match" question, "← Back to your score", and the
// Day 22B booking case B for a partner other than Square.
import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const search = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useParams: () => ({ id: "b1" }), useSearchParams: () => search.value, usePathname: () => "/business/b1" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { GbpEditProvider, type GbpEditState } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleListingCard } from "@/components/overview/GoogleListingCard";
import { DetailsMismatchTasks } from "@/components/overview/DetailsMismatchTasks";
import { NowMatchPrompt } from "@/components/gbp/NowMatchPrompt";
import { BackToScore } from "@/components/layout/BackToScore";
import { overviewListingRows, rowHref } from "@/lib/overviewListing";
import { listingGroups, type ListingInput } from "@/lib/googleProfileTab";
import { detailsMismatches, mismatchesCoveredBy, nowMatchPrompt } from "@/lib/detailsMismatch";
import { closedWeek, type WeeklyHours } from "@/lib/gbpProfileEdits";
import type { OwnerDetails } from "@/lib/ownerDetails";
import type { CheckResult } from "@/lib/scoring";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const wrap = (node: ReactNode, edit: Omit<GbpEditState, "enabled"> | null = null, locale: Locale = "en") =>
  renderToStaticMarkup(<LocaleProvider locale={locale}>{edit ? <GbpEditProvider value={edit}>{node}</GbpEditProvider> : node}</LocaleProvider>);

const check = (id: string, earned: number, max: number): CheckResult => ({ id, label: id, earnedPoints: earned, maxPoints: max, confidence: "VERIFIED", explanation: "" }) as unknown as CheckResult;
const INPUT: ListingInput = {
  businessId: "b1",
  checks: [check("completeness.phone", 4, 4), check("completeness.website_link", 4, 4), check("completeness.hours", 0, 4), check("completeness.categories", 3, 3), check("completeness.customer_details", 1, 3), check("visibility.review_replies", 6, 6)],
  phone: "+1 914-320-3012",
  website: "https://hairexpress.example",
  category: "Hair salon",
  openingHours: null,
  photoCount: 8,
  rating: 5,
  reviewCount: 30,
  messagingOn: true,
  replies: { replied: 20, inWindow: 20 },
};
const DATA = { input: INPUT, saved: null, syncedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), scan: { website: INPUT.website, phone: INPUT.phone } };

describe("the Overview's “Your Google listing” card", () => {
  test("connected: pill, counts from the tab's own rows, up to 3 rows (✕ first, then !), each opening its editor on the tab", () => {
    const html = wrap(<GoogleListingCard businessId="b1" connected canStart data={DATA} />);
    const words = text(html);
    expect(words).toContain("Your Google listing");
    expect(words).toContain("Connected · synced 2 h ago");
    expect(html).toContain('href="/business/b1/growth?tab=google#listing"');
    expect(words).toMatch(/\d+ OK · \d+ to fix · \d+ to improve/);
    const rows = overviewListingRows(listingGroups(INPUT));
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows[0].status).toBe("bad");
    expect(rows.map((r) => r.status)).toEqual([...rows.map((r) => r.status)].sort((a, b) => (a === "bad" ? -1 : b === "bad" ? 1 : 0)));
    expect(html).toContain('data-testid="google-listing-row-hours"');
    expect(html).toContain('href="/business/b1/growth?tab=google#edit-hours"');
    expect(html).not.toContain("isn't wired up");
  });

  test("where each row opens", () => {
    expect(rowHref("b1", { id: "phone", status: "bad", value: null, note: null, action: { kind: "editor", editor: "phone" } })).toBe("/business/b1/growth?tab=google#edit-phone");
    expect(rowHref("b1", { id: "booking", status: "warn", value: null, note: null, action: { kind: "editor", editor: "booking_steps" } })).toBe("/business/b1/growth?tab=google#edit-booking-steps");
    expect(rowHref("b1", { id: "posts", status: "warn", value: null, note: null, action: { kind: "link", href: "/business/b1/growth#ways-to-grow", external: false } })).toBe("/business/b1/growth#ways-to-grow");
    expect(rowHref("b1", { id: "category", status: "warn", value: null, note: null, action: { kind: "link", href: "https://business.google.com/", external: true } })).toBe("/business/b1/growth?tab=google#listing-category");
  });

  test("nothing needs work: “Everything on your listing looks right ✓” (EN + ES)", () => {
    const allGood = { ...DATA, input: { ...INPUT, checks: INPUT.checks.map((c) => ({ ...c, earnedPoints: c.maxPoints })), openingHours: ["Monday: 9 AM – 5 PM"] } };
    expect(overviewListingRows(listingGroups(allGood.input))).toEqual([]);
    expect(text(wrap(<GoogleListingCard businessId="b1" connected canStart data={allGood} />))).toContain("Everything on your listing looks right ✓");
    expect(text(wrap(<GoogleListingCard businessId="b1" connected canStart data={allGood} />, null, "es"))).toContain("Todo en su ficha se ve bien ✓");
  });

  test("Google changed something: that line first, with Review →", () => {
    const saved = { googleEdits: { available: true, open: [{ id: "e1", field: "hours", owner_value: "a", google_value: "b", detected_at: "2026-11-14T10:00:00Z" }], checkedAt: null }, businessStatus: "OPERATIONAL" } as never;
    const html = wrap(<GoogleListingCard businessId="b1" connected canStart data={{ ...DATA, saved }} />);
    expect(html).toContain('data-testid="google-listing-changed"');
    expect(text(html)).toContain("Review →");
    expect(html.indexOf("google-listing-changed")).toBeLessThan(html.indexOf("google-listing-row-"));
  });

  test("not connected: one short card and the Connect button, no placeholder (EN + ES)", () => {
    const html = wrap(<GoogleListingCard businessId="b1" connected={false} canStart data={null} />);
    expect(text(html)).toContain("Connect your Google listing to see and fix it here.");
    expect(html).toContain('data-testid="google-listing-connect"');
    expect(text(wrap(<GoogleListingCard businessId="b1" connected={false} canStart={false} data={null} />, null, "es"))).toContain("Conecte su ficha de Google para verla y corregirla aquí.");
  });
});

const MON_9_5: WeeklyHours = closedWeek().map((d, day) => (day === 1 ? { mode: "open" as const, ranges: [{ open: 540, close: 1020 }] } : d));
const OWNER: OwnerDetails = { name: "Hair express", address: "9 S Broadway, Tarrytown, NY 10591", phone: "(914) 320-3012", hours: { kind: "regular", week: MON_9_5 } };
const PERIODS_9_5 = [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }];
const PERIODS_10_5 = [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }];

describe("details that don't match (lib/detailsMismatch.ts)", () => {
  test("no confirmed details: nothing; the same details: nothing", () => {
    expect(detailsMismatches({ owner: null, google: { phone: "x", address: "y", openingHoursPeriods: null }, site: [] })).toEqual([]);
    expect(detailsMismatches({ owner: OWNER, google: { phone: "+1 914-320-3012", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_9_5 }, site: [] })).toEqual([]);
  });

  test("Google differs (phone, hours); only the website differs (phone)", () => {
    const bare = (ms: ReturnType<typeof detailsMismatches>) => ms.map(({ field, google, website }) => ({ field, google, website }));
    expect(bare(detailsMismatches({ owner: OWNER, google: { phone: "+1 914-555-0199", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_10_5 }, site: [] }))).toEqual([
      { field: "phone", google: true, website: false },
      { field: "hours", google: true, website: false },
    ]);
    expect(bare(detailsMismatches({ owner: OWNER, google: { phone: "+1 914-320-3012", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_9_5 }, site: [{ field: "phone", siteValue: "Call (914) 555-0199", siteWeek: undefined }] }))).toEqual([{ field: "phone", google: false, website: true }]);
  });

  test("Google can't be read: no Google tasks (never a guess)", () => {
    expect(detailsMismatches({ owner: OWNER, google: null, site: [] })).toEqual([]);
  });

  const LIVE = { premium: true, connected: true, undo: null, canEdit: true };
  test("Premium + connected: “PostScore can do this for you” → the editor; address has no editor → the steps on Google", () => {
    const html = wrap(<DetailsMismatchTasks businessId="b1" owner={OWNER} mismatches={[{ field: "phone", google: true, website: false }, { field: "address", google: true, website: false }]} />, LIVE);
    const phone = html.split('data-testid="details-mismatch-address"')[0];
    expect(phone).toMatch(/data-kind="do_it"[^>]*>|href="\/business\/b1\/growth\?tab=google#edit-phone"/);
    expect(phone).toContain('href="/business/b1/growth?tab=google#edit-phone"');
    const address = html.split('data-testid="details-mismatch-address"')[1];
    expect(address).toContain('href="https://business.google.com/"');
    expect(address).not.toContain('data-kind="do_it"');
    // One dark button per task.
    for (const part of html.split("<li").slice(1)) expect((part.match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
    expect(text(html)).toContain("This doesn't change your score.");
  });

  test("Grow, or not connected: the steps + “Open on Google ↗”; Premium not connected also “Connect Google so PostScore can do this for you” (EN + ES)", () => {
    const grow = wrap(<DetailsMismatchTasks businessId="b1" owner={OWNER} mismatches={[{ field: "hours", google: true, website: false }]} />, { premium: false, connected: true, undo: null, canEdit: true });
    expect(text(grow)).toContain("On Google: Edit profile → Hours, then Save.");
    expect(text(grow)).toContain("Open on Google ↗");
    expect(grow).not.toContain("details-mismatch-connect");
    const notConnected = wrap(<DetailsMismatchTasks businessId="b1" owner={OWNER} mismatches={[{ field: "hours", google: true, website: false }]} />, { premium: true, connected: false, undo: null });
    expect(notConnected).toContain('data-testid="details-mismatch-connect"');
    const es = text(wrap(<DetailsMismatchTasks businessId="b1" owner={OWNER} mismatches={[{ field: "hours", google: true, website: false }]} />, { premium: true, connected: false, undo: null }, "es"));
    expect(es).toContain("Su horario en Google no coincide con los datos que confirmó");
    expect(es).toContain("Conecte Google para que PostScore pueda hacerlo por usted");
  });

  test("only the website differs: the Website page's fix steps", () => {
    const html = wrap(<DetailsMismatchTasks businessId="b1" owner={OWNER} mismatches={[{ field: "phone", google: false, website: true }]} />, LIVE);
    expect(html).toContain('href="/business/b1/website#check-info_consistency"');
    expect(text(html)).toContain("Your website's phone number doesn't match the details you confirmed");
  });

  test("“Your {field} now match…”: once, after PostScore's change is live; “Waiting for Google” while it's reviewed", () => {
    const google = { phone: "+1 914-555-0199", address: null, openingHoursPeriods: null };
    const live = { status: "live", at: "2026-11-19T10:00:00Z", key: "match-phone-2026-11-19T10:00:00" };
    expect(nowMatchPrompt({ field: "phone", change: live, owner: OWNER, google, asked: false })).toBe("ask");
    expect(nowMatchPrompt({ field: "phone", change: live, owner: OWNER, google, asked: true })).toBeNull();
    expect(nowMatchPrompt({ field: "phone", change: { ...live, status: "reviewing" }, owner: OWNER, google, asked: false })).toBe("waiting");
    // Already the same: nothing to ask.
    expect(nowMatchPrompt({ field: "phone", change: live, owner: { ...OWNER, phone: "(914) 555-0199" }, google, asked: false })).toBeNull();
    expect(nowMatchPrompt({ field: "phone", change: null, owner: OWNER, google, asked: false })).toBeNull();
    const ask = text(wrap(<NowMatchPrompt businessId="b1" field="hours" prompt={{ state: "ask", key: "k" }} />));
    expect(ask).toContain("Your hours now match. Save them as your confirmed details?");
    expect(text(wrap(<NowMatchPrompt businessId="b1" field="phone" prompt={{ state: "waiting", key: "k" }} />, null, "es"))).toContain("Esperando a Google. Le preguntaremos cuando esté publicado.");
  });

  test("the score never reads them", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/scoring.ts", "utf8")).not.toMatch(/owner_details|detailsMismatch/);
  });
});

describe("“← Back to your score”", () => {
  test("only when the page was opened from the Overview's fix buttons (?from=score), EN + ES", () => {
    search.value = new URLSearchParams("tab=google&from=score");
    expect(wrap(<BackToScore />)).toContain('href="/business/b1#score-breakdown"');
    expect(text(wrap(<BackToScore />, null, "es"))).toContain("Volver a su puntuación");
    search.value = new URLSearchParams("tab=google");
    expect(wrap(<BackToScore />)).toBe("");
  });
});

describe("Day 22B booking case B with another partner (the owner's own Vagaro link, 0 Google bookings)", () => {
  test("loadBookingState → “Turn on Google booking in Vagaro”", async () => {
    vi.doMock("@/lib/gbpRealListing.server", () => ({
      readRealListingCached: async () => ({ ok: true, listing: { placeActionLinks: [{ name: "x/1", providerType: "MERCHANT", isEditable: true, uri: "https://www.vagaro.com/hairexpress/book-now", placeActionType: "APPOINTMENT" }] } }),
    }));
    const { loadBookingState } = await import("@/lib/gbpInsights.server");
    const admin = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } as never;
    const months = [{ month: "2026-09", bookings: 0, foodOrders: 0 }, { month: "2026-10", bookings: 0, foodOrders: 0 }] as never;
    const state = await loadBookingState(admin, "b1", months, new Date("2026-11-19T00:00:00Z"));
    expect(state?.tracking).toEqual({ kind: "turn_on", provider: "Vagaro", partnerId: "vagaro", still: false });
    const { BookingTaskCard } = await import("@/components/gbp/BookingSteps");
    expect(text(wrap(<BookingTaskCard businessId="b1" provider="Vagaro" still={false} />))).toContain("Turn on Google booking in Vagaro");
    const page = (await import("node:fs")).readFileSync("app/business/[id]/growth/page.tsx", "utf8");
    expect(page).toContain('bookingTask={bookingState?.tracking.kind === "turn_on" ? { provider: bookingState.tracking.provider, still: bookingState.tracking.still } : null}');
  });
});

describe("one task per field: the details mismatch merged into “Matches your Google listing”", () => {
  const hoursMismatch = detailsMismatches({
    owner: OWNER,
    google: { phone: "+1 914-320-3012", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_10_5 },
    // Google 10–5, the website 9–5, you confirmed 9–5: Google and the website differ from each other.
    site: [{ field: "hours", siteValue: "Monday 9–5", siteWeek: [{ day: 1, closed: false, open: 540, close: 1020 }] }],
  });
  const scored = { checkId: "website.info_consistency", category: "website", label: "Matches your Google listing", status: "open", effort: "quick_win", weightedPoints: 1, weightedPointsHigh: null, mismatchFields: ["hours"], action: "Check which is correct.", why: "", fix: "" } as never;
  const reviews = { checkId: "visibility.review_count", category: "visibility", label: "Reviews", status: "open", effort: "weekly", weightedPoints: 13, weightedPointsHigh: null, action: "Get 3+ new reviews.", why: "", fix: "" } as never;

  test("which mismatches a task covers; every version kept", () => {
    expect(hoursMismatch).toEqual([{ field: "hours", google: true, website: false, versions: { owner: { hours: OWNER.hours }, google: expect.objectContaining({ hours: expect.objectContaining({ kind: "regular" }) }), website: expect.objectContaining({ hours: expect.objectContaining({ kind: "regular" }) }) } }]);
    expect(mismatchesCoveredBy(scored, hoursMismatch).map((m) => m.field)).toEqual(["hours"]);
    expect(mismatchesCoveredBy({ ...(scored as object), mismatchFields: ["phone"] } as never, hoursMismatch)).toEqual([]);
    expect(mismatchesCoveredBy(reviews, hoursMismatch)).toEqual([]);
  });

  test("Overview: ONE hours task — first, Urgent, +1 pt, “You confirmed · Google · Website”, one button, the small link; no second hours task (EN + ES)", async () => {
    const { TopRecommendations } = await import("@/components/overview/TopRecommendations");
    const { topRecommendations } = await import("@/lib/overviewTiles");
    const recs = topRecommendations([reviews, scored], null, "b1", {}, Infinity);
    const LIVE = { premium: true, connected: true, undo: null, canEdit: true };
    const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: hoursMismatch, owner: OWNER }} />, LIVE);
    const items = html.split("<li").slice(1);
    expect(items[0]).toContain('data-merged="hours"');
    expect(items[0]).toContain('data-priority="urgent"');
    expect(text(items[0])).toContain("Your hours don't match everywhere");
    expect(text(items[0])).toContain("+1 pt");
    expect(text(items[0])).toMatch(/You confirmed .*Google .*Website /);
    expect((items[0].match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
    expect(items[0]).toContain("compare-hours");
    expect(items[0]).toContain('data-testid="details-mismatch-keep"');
    // Not shown twice.
    expect(html).not.toContain('data-testid="details-mismatch-hours"');
    expect((html.match(/Matches your Google listing/g) ?? []).length).toBe(0);
    const es = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: hoursMismatch, owner: OWNER }} />, LIVE, "es"));
    expect(es).toContain("Su horario no coincide en todas partes");
    expect(es).toMatch(/Usted confirmó .*Google .*Sitio web /);
  });

  test("Grow: the same one task, its button the how-to (the Website page's fix steps)", async () => {
    const { TopRecommendations } = await import("@/components/overview/TopRecommendations");
    const { topRecommendations } = await import("@/lib/overviewTiles");
    const recs = topRecommendations([reviews, scored], null, "b1", {}, Infinity);
    const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: hoursMismatch, owner: OWNER }} />, { premium: false, connected: true, undo: null, canEdit: true });
    const first = html.split("<li").slice(1)[0];
    expect(first).toContain('href="/business/b1/website?from=score#check-info_consistency"');
    expect(first).not.toContain('data-kind="do_it"');
  });

  test("Growth recap: the merged step first and Urgent; the versions in place of the current status; one button", async () => {
    const { TaskListCard } = await import("@/app/business/[id]/ActionPlanSection");
    const html = wrap(<TaskListCard tasks={[{ ...(scored as object), urgent: true } as never, reviews]} businessId="b1" context="weekly" emptyMessage="" detailsMismatches={hoursMismatch} />, { premium: true, connected: true, undo: null, canEdit: true });
    const first = html.split("<li").slice(1)[0];
    expect(text(first)).toContain("Your hours don't match everywhere");
    expect(first).toContain('data-testid="task-urgent"');
    expect(first).toContain('data-testid="details-versions"');
    expect((first.match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
    expect(first).toContain('data-testid="details-mismatch-keep"');
    const view = (await import("node:fs")).readFileSync("app/business/[id]/growth/GrowthView.tsx", "utf8");
    expect(view).toContain("tasks={mergedFirst(actionPlan.weeklyTasks)}");
    expect(view).toContain("{standaloneMismatches.length > 0 && <DetailsMismatchTasks");
  });
});

describe("the merged hours task: who's out of step", () => {
  const scored = { checkId: "website.info_consistency", category: "website", label: "Matches your Google listing", status: "open", effort: "quick_win", weightedPoints: 1, weightedPointsHigh: null, mismatchFields: ["hours"], action: "Your website and Google listing show different hours — check which is correct and update the other.", why: "", fix: "" } as never;
  const LIVE = { premium: true, connected: true, undo: null, canEdit: true };
  const GROW = { premium: false, connected: true, undo: null, canEdit: true };
  const owner = detailsMismatches({
    owner: OWNER,
    google: { phone: "+1 914-320-3012", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_10_5 },
    site: [{ field: "hours", siteValue: "Monday 10–5", siteWeek: [{ day: 1, closed: false, open: 600, close: 1020 }] }],
  });
  const sides = detailsMismatches({
    owner: OWNER,
    google: { phone: "+1 914-320-3012", address: "9 S Broadway, Tarrytown, NY 10591, USA", openingHoursPeriods: PERIODS_10_5 },
    site: [{ field: "hours", siteValue: "Monday 11–5", siteWeek: [{ day: 1, closed: false, open: 660, close: 1020 }] }],
  });

  test("the rule: Google and the website agree → only the confirmed details are off", async () => {
    const { mergedKind, sidesAgree } = await import("@/lib/detailsMismatch");
    expect(sidesAgree(owner[0])).toBe(true);
    expect(mergedKind(owner)).toBe("owner_only");
    expect(mergedKind(sides)).toBe("sides_differ");
  });

  for (const [plan, edit] of [["Premium", LIVE], ["Grow", GROW]] as const) {
    test(`only the confirmed hours differ (${plan}): the confirmed-hours wording, Urgent, no points, “Update your confirmed hours” → Settings filled in, “Or change them on Google and your website” (EN + ES)`, async () => {
      const { TopRecommendations } = await import("@/components/overview/TopRecommendations");
      const { topRecommendations } = await import("@/lib/overviewTiles");
      const recs = topRecommendations([scored], null, "b1", {}, Infinity);
      const html = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: owner, owner: OWNER }} />, edit);
      const first = html.split("<li").slice(1)[0];
      expect(text(first)).toContain("Your confirmed hours differ from Google and your website");
      expect(first).toContain('data-priority="urgent"');
      expect(text(first)).not.toMatch(/\+1 pt/);
      expect((first.match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
      expect(first).toContain('href="/business/b1/settings?use=google&amp;field=hours#details"');
      expect(text(first)).toContain("Update your confirmed hours →");
      expect(text(first)).toContain("Or change them on Google and your website");
      expect(first).toContain(plan === "Premium" ? "growth?tab=google#compare-hours" : "/website#check-info_consistency");
      expect(first).not.toContain("details-mismatch-keep");
      const es = text(wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: owner, owner: OWNER }} />, edit, "es"));
      expect(es).toContain("Su horario confirmado no coincide con Google ni con su sitio web");
      expect(es).toContain("Actualice su horario confirmado");
      expect(es).toContain("O cámbielo en Google y en su sitio web");
    });
  }

  test("Google and the website differ from each other: today's wording, the fix button, “+1 pt” (singular)", async () => {
    const { TopRecommendations } = await import("@/components/overview/TopRecommendations");
    const { topRecommendations } = await import("@/lib/overviewTiles");
    const recs = topRecommendations([scored], null, "b1", {}, Infinity);
    const first = wrap(<TopRecommendations businessId="b1" recommendations={recs} limit={3} detailsMismatch={{ mismatches: sides, owner: OWNER }} />, LIVE).split("<li").slice(1)[0];
    expect(text(first)).toContain("Your hours don't match everywhere");
    expect(text(first)).toContain("+1 pt");
    expect(text(first)).not.toContain("+1 pts");
    expect(first).toContain("compare-hours");
    expect(first).toContain('data-testid="details-mismatch-keep"');
  });

  test("Growth recap: owner-only drops the scan's line and points; Google ≠ website keeps them as “Up to +1 pt”; one main button + “I did this”; the re-check sits in “How to fix it”", async () => {
    const { TaskListCard, taskPointsLabel } = await import("@/app/business/[id]/ActionPlanSection");
    const card = (ms: typeof owner) => wrap(<TaskListCard tasks={[scored]} businessId="b1" context="weekly" emptyMessage="" detailsMismatches={ms} websiteRecheck={{ left: 3, hasWebsite: true }} />, LIVE).split("<li").slice(1)[0];
    const o = card(owner);
    expect(text(o)).toContain("Your confirmed hours differ from Google and your website");
    expect(text(o)).not.toContain("show different hours");
    expect(text(o)).not.toMatch(/\+1 pt/);
    expect(o).toContain('href="/business/b1/settings?use=google&amp;field=hours#details"');
    expect(o).toContain('data-testid="details-change-everywhere"');
    const sd = card(sides);
    expect(text(sd)).toContain("show different hours");
    expect(text(sd)).toContain("Up to +1 pt");
    expect(text(sd)).not.toContain("+1 pts");
    for (const c of [o, sd]) {
      // One dark button; "I did this" is the only other button; no re-check on the card (it's in the collapsed steps).
      expect((c.match(/data-testid="fix-button"/g) ?? []).length).toBe(1);
      expect(c).not.toContain("Re-check my website");
    }
    expect(taskPointsLabel({ ...(scored as object), weightedPoints: 1 } as never, "weekly", "es")).toBe("Hasta +1 pt");
    const src = (await import("node:fs")).readFileSync("app/business/[id]/ActionPlanSection.tsx", "utf8");
    expect(src).toContain('data-testid="how-to-recheck"');
  });

  test("Settings opens on Google's version of the field to confirm", async () => {
    const src = (await import("node:fs")).readFileSync("app/business/[id]/settings/page.tsx", "utf8");
    expect(src).toContain('useGoogle: searchParams.use === "google"');
    const { OwnerDetailsCard } = await import("@/components/settings/OwnerDetailsCard");
    const suggested = { ...OWNER, hours: { kind: "regular" as const, week: closedWeek() } };
    const html = wrap(<OwnerDetailsCard businessId="b1" card={{ details: OWNER, confirmedAt: "2026-11-17T00:00:00Z", liveUnavailable: false, noListing: false, noGoogleHours: false, suggested }} />);
    expect(html).toContain('data-testid="owner-details-suggested"');
    expect(text(html)).toContain("Filled in with what Google and your website show now. Check it, then confirm.");
    expect(html).toContain('data-testid="owner-details"');
  });
});
