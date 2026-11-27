import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/app/actions/gbpCustomerDetails", () => ({ applyCustomerDetailsAction: vi.fn(), loadCustomerDetailsEditorAction: vi.fn(), undoCustomerDetailsAction: vi.fn() }));
vi.mock("@/app/actions/gbpWebsiteLink", () => ({ openWebsiteLinkFix: vi.fn(), applyWebsiteLinkFix: vi.fn(), undoWebsiteLinkFix: vi.fn() }));
vi.mock("@/app/actions/gbpInsights", () => ({ syncGoogleNumbers: vi.fn(async () => ({ status: "busy" })) }));
vi.mock("@/app/actions/gbpProfileEdits", () => ({ openProfileEdits: vi.fn(async () => ({ status: "error" })), applyProfileEditAction: vi.fn(), undoProfileEditAction: vi.fn() }));
vi.mock("@/app/actions/gbpOrderLink", () => ({ openOrderLink: vi.fn(async () => ({ status: "error" })), applyOrderLinkAction: vi.fn(), undoOrderLinkAction: vi.fn() }));
import { LocaleProvider, messages, type Locale } from "@/lib/i18n";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { GoogleResults, resultsPageHref, type GoogleResultsProps } from "@/components/gbp/GoogleResults";
import { GoogleListingPage, listingPageHref, type GoogleListingPageProps } from "@/components/gbp/GoogleListingPage";
import { GoogleProfileTab } from "@/components/gbp/GoogleProfileTab";
import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";
import { newGooglePagesAllowed } from "@/lib/googlePages.server";
import { googleListingHref, googleResultsHref, NEW_PAGES_LIVE, offersHref } from "@/lib/routes";
import type { CheckResult } from "@/lib/scoring";
import type { Plan } from "@/lib/plan";
import { localizeHours, JUMP_SECTIONS, jumpIdFromHash, LISTING_SECTIONS, listingCounts, listingFixLine, listingGroups, pointsText, RESULTS_SECTIONS, rowPoints, SAMPLE_INSIGHTS } from "./googleProfileTab";

// Day 25B step 2 (docs/plans/day25a-spec.md §2, §3, §5): the Google Profile
// tab split into Growth → Google results and Presence → Google listing.
// Behind NEW_PAGES_LIVE; the old tab is unchanged.

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const check = (id: string, earned: number | null, max = 4, category = id.split(".")[0]): CheckResult => ({ id, label: id, category, maxPoints: max, earnedPoints: earned, confidence: "VERIFIED", explanation: `${id} explanation` }) as unknown as CheckResult;

const CHECKS = [check("completeness.phone", 4), check("completeness.website_link", 4), check("completeness.hours", 4), check("completeness.categories", 4), check("completeness.customer_details", 2), check("completeness.photos", 4), check("visibility.review_replies", 0, 6)];
const BASE: GoogleProfileTabProps = {
  businessId: "b1",
  connected: true,
  practice: false,
  needsReconnect: false,
  canStart: true,
  result: null,
  business: { name: "Hair express on Broadway", address: "9 S Broadway, Tarrytown, NY 10591, USA" },
  listing: { rating: 5, reviewCount: 30, photoCount: 12, phone: "(914) 320-3012", website: "https://www.hairexpressonbroadway.com/", category: "Hair salon", openingHours: ["Monday: Closed", "Tuesday: 9:30 AM – 5:00 PM"], googleMapsUri: "https://maps.google.com/?cid=1" },
  checks: CHECKS,
  website: { earned: 29, of: 30, fixes: 1 },
  replyCounts: { reviewsInWindow: 20, replied: 0, templatedShare: 0, hasRecentReview: true, allTimeReviews: 30, allTimeReplied: 0, allTimeCapped: false, checkedAt: "2026-11-14T10:00:00Z" },
  messagingOn: false,
  saved: { couponsRunning: 0, lastMonth: "2026-10", recap: { did: [], notYet: ["replies"] }, made: [], others: { fields: [], since: "2026-11-01T00:00:00Z" }, businessStatus: "OPERATIONAL" },
  lastScanAt: "2026-11-14T10:00:00Z",
};

const wrap = (node: React.ReactNode, plan: Plan, locale: Locale = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <GbpEditProvider value={{ premium: plan === "premium" || plan === "multi", connected: true, undo: null, canEdit: true, practice: false }}>{node}</GbpEditProvider>
    </LocaleProvider>
  );
const results = (plan: Plan, extra: Partial<GoogleResultsProps> = {}, locale: Locale = "en") => wrap(<GoogleResults {...BASE} insights={SAMPLE_INSIGHTS} plan={plan} {...extra} />, plan, locale);
const listing = (plan: Plan, extra: Partial<GoogleListingPageProps> = {}, locale: Locale = "en") =>
  wrap(<GoogleListingPage {...BASE} plan={plan} listingPoints={{ points: 28, weight: 30 }} score={78} hoursMismatch hoursMismatchPoints={0.6} {...extra} />, plan, locale);

describe("behind the switch: only the dev test login, only under next dev", () => {
  test("not live: the dev test login under `next dev` only; never production, never anyone else", () => {
    const dev = { live: false, nodeEnv: "development", devEmail: "dev@example.com" };
    expect(newGooglePagesAllowed({ ...dev, userEmail: "dev@example.com" })).toBe(true);
    expect(newGooglePagesAllowed({ ...dev, userEmail: " DEV@example.com " })).toBe(true);
    expect(newGooglePagesAllowed({ ...dev, userEmail: "owner@example.com" })).toBe(false);
    expect(newGooglePagesAllowed({ ...dev, userEmail: null })).toBe(false);
    expect(newGooglePagesAllowed({ ...dev, nodeEnv: "production", userEmail: "dev@example.com" })).toBe(false);
    expect(newGooglePagesAllowed({ ...dev, nodeEnv: "test", userEmail: "dev@example.com" })).toBe(false);
    expect(newGooglePagesAllowed({ ...dev, devEmail: undefined, userEmail: "dev@example.com" })).toBe(false);
    expect(newGooglePagesAllowed({ live: true, nodeEnv: "production", devEmail: undefined, userEmail: "owner@example.com" })).toBe(true);
  });

  test("the switch is still off: every link still goes to the old tab", () => {
    expect(NEW_PAGES_LIVE).toBe(false);
    expect(googleResultsHref("b1")).toBe("/business/b1/growth?tab=google");
    expect(googleListingHref("b1", { hash: "edit-hours" })).toBe("/business/b1/growth?tab=google#edit-hours");
  });

  test("each page checks access first and sends everyone else to the old tab (through the route helpers)", () => {
    for (const [file, helper] of [["google-results", "googleResultsHref"], ["google-listing", "googleListingHref"]] as const) {
      const src = readFileSync(`app/business/[id]/${file}/page.tsx`, "utf8");
      expect(src, file).toContain(`if (!(await canOpenNewGooglePages())) redirect(${helper}(params.id));`);
      expect(src.indexOf("canOpenNewGooglePages()) redirect"), file).toBeLessThan(src.indexOf("await loadGoogle"));
    }
  });

  test("the loaders never write: no insert, update, upsert or delete", () => {
    const src = readFileSync("lib/googlePages.server.ts", "utf8");
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});

describe("the two menus and their anchors", () => {
  test("Google results: Last month · Since you did this · Searches → actions · Search terms (no task list)", () => {
    expect(RESULTS_SECTIONS.map((s) => s.id)).toEqual(["last-month", "since", "funnel", "searches"]);
    expect(LISTING_SECTIONS.map((s) => s.id)).toEqual(["listing", "next", "protection"]);
    // The old tab keeps its six.
    expect(JUMP_SECTIONS.map((s) => s.id)).toEqual(["last-month", "funnel", "searches", "listing", "next", "protection"]);
  });

  test("hashes resolve per page: a row editor's #edit-… belongs only to Google listing", () => {
    expect(jumpIdFromHash("#edit-hours", LISTING_SECTIONS)).toBe("listing");
    expect(jumpIdFromHash("#edit-hours", RESULTS_SECTIONS)).toBeNull();
    expect(jumpIdFromHash("#since", RESULTS_SECTIONS)).toBe("since");
    expect(jumpIdFromHash("#protection", LISTING_SECTIONS)).toBe("protection");
    expect(jumpIdFromHash("#edit-hours")).toBe("listing");
  });

  test("today's anchor ids stay on the pages (spec §3 'anchor ids stay')", () => {
    const r = results("premium");
    for (const id of ["last-month", "since", "funnel", "searches", "google-tab-levers"]) expect(r, id).toContain(`id="${id}"`);
    expect(r).not.toContain('id="this-week"');
    const l = listing("premium");
    for (const id of ["listing", "next", "protection", "listing-hours", "listing-reviews", "others"]) expect(l, id).toContain(`id="${id}"`);
  });
});

describe("Google results (Growth)", () => {
  test("the hero: 'took action (called, got directions or visited your site)' and 'Down from … in …', no points", () => {
    const t = text(results("premium"));
    expect(t).toContain("of people who found you on Google took action (called, got directions or visited your site)");
    expect(t).toMatch(/(Down|Up) from \d+\.\d% in \w+|About the same as \w+/);
    expect(t).not.toContain("became customers");
    expect(t).toContain("How searches became actions");
    expect(t).toContain("Actions per 100 viewers");
    expect(t).toContain("From views to actions");
    expect(t).not.toMatch(/Customers per 100|From views to customers|Searches → customers/);
  });

  test("Growth content only: no listing rows, no OK / to fix / to improve counts, no '+N pts', no Presence box", () => {
    const html = results("premium");
    const t = text(html);
    expect(html).not.toContain("listing-row-");
    expect(t).not.toMatch(/\bto fix\b|to improve|\d+ OK\b|\+\d+(\.\d)? pts/);
    expect(html).not.toContain("google-edits-banner");
    expect(t).toContain("These numbers show results from Google. They don't change your PostScore score.");
    // The Website chip: ✓ or "needs work", never its points.
    expect(t).not.toMatch(/Website · \d+\/\d+/);
  });

  test("the one link to Presence is 'Fix your listing →' in the top bar", () => {
    const html = results("premium");
    expect(html.match(/data-testid="google-results-fix-listing"/g)).toHaveLength(1);
    expect(html).toContain(`href="${googleListingHref("b1").replace(/&/g, "&amp;")}"`);
    expect(text(html)).toContain("Fix your listing →");
    // Lever and advice links into Presence show as plain words on this page.
    expect(resultsPageHref("#edit-photos", "b1")).toBeNull();
    expect(resultsPageHref("/business/b1/website#website-checks", "b1")).toBeNull();
    expect(resultsPageHref("/business/b1/website-reviews#google-reviews", "b1")).toBeNull();
    expect(resultsPageHref("#this-week-post", "b1")).toBe("#this-week-post");
    expect(resultsPageHref(offersHref("b1", "coupons", { hash: "new-offer" }), "b1")).toBe(offersHref("b1", "coupons", { hash: "new-offer" }));
  });

  test("Since you did this: the note sits above the tables; decreases are gray, increases green", () => {
    const html = results("premium", { practice: true, insights: [] });
    const since = html.slice(html.indexOf('id="since"'), html.indexOf('id="funnel"'));
    expect(since).toContain('data-testid="since-note"');
    expect(since.indexOf("since-note")).toBeLessThan(since.indexOf("<table"));
    // Increases green; a decrease is gray on the page (red stays only on the old tab).
    expect(since).toMatch(/text-green" data-dir="up"/);
    expect(since).not.toContain("text-red");
    expect(readFileSync("components/gbp/GoogleResults.tsx", "utf8")).toContain('c?.dir === "up" ? "text-green" : c?.dir === "down" && !page ? "text-red" : "text-ink-mute"');
  });

  test("no tasks on any plan (the checklist is on Growth plan); Grow sees every number", () => {
    for (const plan of ["premium", "grow"] as const) {
      const html = results(plan);
      expect(html).not.toContain("approve-all-button");
      expect(html).toContain('data-testid="google-results-drivers"');
      expect(text(html)).toContain("Your weekly checklist is on Growth plan →");
    }
    const g = results("grow");
    // Grow sees the numbers (spec §9 decision 1).
    expect(g).toContain("google-tab-kpis");
    expect(g).toContain("google-tab-terms");
  });

  test("Free: a locked preview with no numbers", () => {
    const html = results("free");
    const t = text(html);
    expect(html).toContain("google-results-locked");
    expect(t).toContain("Connect Google with Grow to see your calls, direction requests and website clicks.");
    expect(t).toContain("Locked");
    expect(html).not.toContain("google-tab-kpis");
    expect(t).not.toMatch(/\d+\.\d%/);
  });

  test("not connected (04b): only the Connect card and 'Your weekly tasks are on Growth plan →' — no tasks, no numbers, no listing", () => {
    const html = results("premium", { connected: false, insights: [] });
    const t = text(html);
    expect(html).toContain("google-results-not-connected");
    expect(t).toContain("Connect your Google listing to see your results");
    expect(t).toContain("Your weekly tasks are on Growth plan →");
    expect(t).toContain("Connect Google");
    expect(html).not.toContain('id="this-week"');
    expect(html).not.toContain("google-tab-kpis");
    expect(html).not.toContain("listing-row-");
    // Lost connection: "Reconnect", and when the numbers were last read — never the numbers.
    const lost = text(results("premium", { connected: false, needsReconnect: true, insights: [], lastInsightsAt: "2026-11-02T09:00:00Z" }));
    expect(lost).toContain("Reconnect");
    expect(lost).toContain("Last update from Google: Nov 2, 2026.");
  });

  test("Spanish (usted)", () => {
    const t = text(results("premium", {}, "es"));
    expect(t).toContain("Resultados en Google");
    expect(t).toContain("de las personas que le encontraron en Google realizaron una acción");
    expect(t).toContain("Corrija su ficha →");
    expect(t).toContain("Acciones por cada 100 personas que le vieron");
  });
});

describe("Google listing (Presence)", () => {
  test("header: listing points, 'See what your listing brings in →', and 'Fix this 1 … (score 78 → 80). Fix plan →'", () => {
    const t = text(listing("premium"));
    expect(t).toContain("Google listing 28 / 30 pts");
    expect(t).toContain("See what your listing brings in →");
    expect(t).toContain("Fix this 1 and your Google listing goes 28 → 30 pts (score 78 → 80). Fix plan →");
  });

  test("the fix line comes from the saved scan's Google-listing checks only", () => {
    expect(listingFixLine(CHECKS, { points: 28, weight: 30 }, 78)).toEqual({ count: 1, from: 28, to: 30, scoreFrom: 78, scoreTo: 80 });
    const two = [...CHECKS.filter((c) => c.id !== "completeness.photos"), check("completeness.photos", 3)];
    expect(listingFixLine(two, { points: 27, weight: 30 }, 77)).toEqual({ count: 2, from: 27, to: 30, scoreFrom: 77, scoreTo: 80 });
    // Review replies are on Reviews, not in the listing's points.
    expect(listingFixLine(CHECKS.filter((c) => c.id !== "completeness.customer_details"), { points: 30, weight: 30 }, 80)).toBeNull();
    expect(text(listing("premium", { listingPoints: { points: 30, weight: 30 }, checks: CHECKS.filter((c) => c.id !== "completeness.customer_details") }))).not.toContain("Fix this");
  });

  test("rows show '+N pts' from the saved scan; Hours adds the mismatch fix's points", () => {
    expect(rowPoints("customerDetails", CHECKS)).toBe(2);
    expect(rowPoints("reviews", CHECKS)).toBe(6);
    expect(rowPoints("phone", CHECKS)).toBe(0);
    expect(rowPoints("hours", CHECKS, { hoursMismatchPoints: 0.6 })).toBe(0.6);
    expect(pointsText(0.6)).toBe("0.6");
    expect(pointsText(2)).toBe("2");
    const html = listing("premium");
    expect(text(html)).toContain("+2 pts");
    expect(text(html)).toContain("+6 pts");
    expect(text(html)).toContain("+0.6 pts");
    expect(html).not.toContain("listing-pts-phone");
  });

  test("Hours mismatch: orange (!) and counted as 'to improve' — on the page only, the old tab unchanged", () => {
    const input = { businessId: "b1", checks: CHECKS, phone: "1", website: "https://x.com", category: "Salon", openingHours: ["Monday: Closed"], photoCount: 4, rating: 5, reviewCount: 30, messagingOn: true, replies: null };
    const hours = (g: ReturnType<typeof listingGroups>) => g.flatMap((x) => x.rows).find((r) => r.id === "hours")!;
    expect(hours(listingGroups(input)).status).toBe("ok");
    expect(hours(listingGroups({ ...input, hoursMismatch: true })).status).toBe("warn");
    expect(listingCounts(listingGroups({ ...input, hoursMismatch: true })).improve).toBe(listingCounts(listingGroups(input)).improve + 1);
    expect(listing("premium")).toMatch(/data-testid="listing-row-hours" data-status="warn"/);
    // The old tab with the same mismatch keeps today's ✓.
    const old = wrap(<GoogleProfileTab {...BASE} hoursMismatch />, "premium");
    expect(old).toMatch(/data-testid="listing-row-hours" data-status="ok"/);
  });

  test("Reviews row: 'Reply in Reviews →' to Presence → Reviews", () => {
    const html = listing("premium");
    expect(text(html)).toContain("Reply in Reviews →");
    expect(html).toContain('href="/business/b1/website-reviews#google-reviews"');
  });

  test("phones: each row's buttons and points sit on their own line under the text, left-aligned (under 860px)", () => {
    const html = listing("premium");
    const actions = html.match(/class="([^"]*)" data-testid="listing-actions-hours"/)![1];
    expect(actions).toContain("row-start-3");
    expect(actions).toContain("justify-start");
    expect(actions).toContain("nav:justify-end");
  });

  test("closing line: 'Every score fix, ranked, is in Fix plan. Posts, offers and review asks are in Growth plan.'", () => {
    const t = text(listing("premium", { extras: { specialPeriods: [], services: ["Haircut"], categories: ["Hair salon"], description: "A long enough description ".repeat(12) } }));
    expect(t).toContain("Every score fix, ranked, is in Fix plan . Posts, offers and review asks are in Growth plan .");
    expect(t).not.toContain("Growth recap");
  });

  test("plans: Premium edits, Grow gets steps + the Premium line, Free sees rows and points but the steps are locked", () => {
    expect(listing("premium")).toContain('data-mode="edit"');
    const grow = listing("grow");
    expect(grow).toContain('data-mode="steps"');
    expect(text(grow)).toContain("with the steps to fix each one yourself");
    const free = listing("free");
    expect(free).toContain('data-mode="locked"');
    expect(text(free)).toContain("+2 pts");
    // Day 25B step 3: Free sees the hours side by side (read-only), the steps stay locked.
    expect(free).toContain("listing-action-compare");
  });

  test("not connected: the Connect card over the rows from the last scan; nothing read from Google, no ideas or protection", () => {
    const html = listing("premium", { connected: false });
    const t = text(html);
    expect(html).toContain("google-listing-not-connected");
    expect(t).toContain("Connect Google to edit your listing from here");
    expect(t).toContain("From your last scan");
    expect(t).toContain("Shown once Google is connected");
    expect(t).not.toContain("Couldn't load from Google");
    expect(html).not.toContain('id="next"');
    expect(html).not.toContain('id="protection"');
    expect(html).not.toContain("google-tab-jump");
  });

  test("the Posts row's preview link goes to Google results on this page", () => {
    expect(listingPageHref("#this-week-post", "b1")).toBe(googleResultsHref("b1", { hash: "#this-week-post" }));
    expect(listingPageHref("/business/b1/website-reviews#google-reviews", "b1")).toBe("/business/b1/website-reviews#google-reviews");
  });

  test("Spanish (usted)", () => {
    const t = text(listing("premium", {}, "es"));
    expect(t).toContain("Ficha de Google 28 / 30 pts");
    expect(t).toContain("Vea lo que le trae su ficha →");
    expect(t).toContain("Corrija esta 1 y su ficha de Google pasa de 28 → 30 pts (puntuación 78 → 80).");
    expect(t).toContain("Responda en Reseñas →");
  });
});

test("every new string has EN and ES", () => {
  const en = Object.keys(messages.en).filter((k) => k.startsWith("dashboard.googlePages."));
  const es = Object.keys(messages.es).filter((k) => k.startsWith("dashboard.googlePages."));
  expect(en.length).toBeGreaterThan(60);
  expect(es.sort()).toEqual(en.sort());
  for (const k of es) expect(messages.es[k as keyof typeof messages.es], k).not.toMatch(/\b(tú|tu ficha|puedes|quieres)\b/i);
});

describe("fixes before commit (Nov 22)", () => {
  const EXTRAS = { specialPeriods: [], services: ["Haircut"], categories: ["Hair salon"], description: "Short" };

  test("Google results: no empty 'Sources' heading at the bottom, no 'What to do this week'", () => {
    const html = results("premium");
    expect(html).not.toContain("google-tab-sources");
    expect(text(html)).not.toContain("What to do this week");
  });

  test("Google results: 'What this means for you' reads as advice — a plain bullet, no orange '!'", () => {
    const src = readFileSync("components/gbp/GoogleResults.tsx", "utf8");
    expect(src).toContain('page && it.status !== "ok" ? (');
    expect(src).toContain('data-testid="advice-bullet"');
  });

  test("Show up for more: Grow and Free get 'How to' (outlined; locked on Free) instead of a one-click button; Premium unchanged", () => {
    // Thanksgiving is 6 days away and not set: the holiday-hours idea shows.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T15:00:00Z"));
    const grow = listing("grow", { extras: EXTRAS });
    const free = listing("free", { extras: EXTRAS });
    const premium = listing("premium", { extras: EXTRAS, canEditGoogle: true });
    const action = (html: string, id: string) => html.match(new RegExp(`<a[^>]*class="([^"]*)"[^>]*data-testid="idea-action-${id}"[^>]*>([\\s\\S]*?)</a>`));
    vi.useRealTimers();
    const g = action(grow, "holiday")!;
    expect(g[1]).toContain("border-paper-line");
    expect(g[1]).not.toContain("bg-ink");
    expect(text(g[2]).trim()).toBe("How to");
    expect(action(free, "holiday")![2]).toContain("<svg");
    expect(action(premium, "holiday")![1]).toContain("bg-ink");
    expect(text(action(premium, "holiday")![2]).trim()).toBe("PostScore can do this for you");
  });

  test("normal spacing above 'Protection & changes'", () => {
    const html = listing("premium");
    expect(html).toMatch(/<section id="protection" class="[^"]*mt-8/);
  });

  test("Protection: Premium as before; Grow sees changes by anyone else, no 'Made from PostScore'; Free a locked teaser, no live details", () => {
    expect(listing("premium")).toContain("google-tab-made");
    const grow = listing("grow");
    expect(grow).toContain("google-tab-others");
    expect(grow).not.toContain("google-tab-made");
    const free = listing("free");
    expect(free).toContain("google-listing-protection-locked");
    expect(free).not.toContain("google-tab-others");
    expect(free).not.toContain("listing-status");
    expect(text(free)).toContain("With Grow, PostScore checks every day, tells you what changed and shows you how to change it back.");
    // Free not connected still gets the teaser.
    expect(listing("free", { connected: false })).toContain("google-listing-protection-locked");
  });

  test("not connected: the Photos row's note never says 'coming soon'", () => {
    const t = text(listing("premium", { connected: false }));
    expect(t).not.toMatch(/coming soon/i);
    expect(t).toContain("Your newest photo's date: shown once Google is connected.");
    expect(text(listing("premium", { connected: false }, "es"))).toContain("La fecha de su foto más reciente: se muestra cuando conecte Google.");
  });
});

describe("Grow gets Google results and the listing alerts — when the pages go live (NEW_PAGES_LIVE)", () => {
  test("Compare plans: Grow ✓ (with Google connected) only once live; Premium unchanged", async () => {
    const { compareRows } = await import("./planComparison");
    const cell = (live: boolean, key: string) => compareRows(false, live).find((r) => r.key === `dashboard.settings.plans.row.${key}`)!.cells;
    for (const key of ["googleResults", "protection"]) {
      expect(cell(false, key).grow, key).toEqual({ kind: "no" });
      expect(cell(true, key).grow, key).toMatchObject({ kind: "text", key: "dashboard.settings.plans.value.withGoogle" });
      expect(cell(true, key).premium, key).toEqual(cell(false, key).premium);
      expect(cell(true, key).free, key).toEqual({ kind: "no" });
    }
    // Today (switch off): the default is unchanged.
    expect(compareRows(false).find((r) => r.key === "dashboard.settings.plans.row.googleResults")!.cells.grow).toEqual({ kind: "no" });
  });

  test("the Premium promo card never sells Google results to Grow once live; Free still sees it", async () => {
    const { cardChips, SHOWCASE_PAGES } = await import("./upgradePromos");
    const has = (plan: Plan, live: boolean) => SHOWCASE_PAGES.some((p) => cardChips("premium", p, plan, live).some((c) => c.key.endsWith(".searchInsights")));
    expect(has("grow", false)).toBe(true);
    expect(has("grow", true)).toBe(false);
    expect(has("free", true)).toBe(true);
  });
});

test("Spanish: the hours row's days, 'Closed' and times in Spanish (the same time format as the compare columns); English unchanged", async () => {
  const { formatTime } = await import("@/lib/gbpProfileEdits");
  expect(localizeHours("Mon Closed · Tue–Wed 9:30 AM – 5:00 PM · Sun Open 24 hours", "es")).toBe(`lun Cerrado · mar–mié ${formatTime(570, "es")} – ${formatTime(1020, "es")} · dom Abierto las 24 horas`);
  expect(localizeHours("Sat 12:00 PM – 12:30 AM", "es")).toBe(`sáb ${formatTime(720, "es")} – ${formatTime(30, "es")}`);
  expect(localizeHours("Mon Closed", "en")).toBe("Mon Closed");
  expect(text(listing("premium", {}, "es"))).toContain("lun Cerrado");
});

test("Hours compare on Grow: the steps on Google and 'Premium does this for you in one click →', never the editor; Premium gets the editor", async () => {
  const { FixGoogle } = await import("@/components/hours/HoursMismatchChooser");
  const week = null;
  const grow = wrap(<FixGoogle businessId="b1" view={{ canEdit: false }} week={week} own={false} onTab />, "grow");
  expect(grow).toContain("fix-google-steps");
  expect(grow).not.toContain("open-hours-editor");
  expect(text(grow)).toContain("Premium does this for you in one click →");
  const premium = wrap(<FixGoogle businessId="b1" view={{ canEdit: true }} week={week} own={false} onTab />, "premium");
  expect(premium).toContain("open-hours-editor");
  expect(premium).not.toContain("premium-one-click");
  // canEdit comes from the server's write context, which requires Premium (outside practice mode).
  expect(readFileSync("lib/gbpWriteContext.server.ts", "utf8")).toContain("gbpEditGate(businessId, { requirePremium: true })");
});
