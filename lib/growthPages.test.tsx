// Day 25B step 5: the Growth pages on the new-design preview — Presence →
// Reviews (what customers say + replies), Get more reviews (asking only),
// Customer offers (Running now + summary, never test offers), Campaigns
// (email/text/social only), Print kit & QR, Local events; and the rule that
// marks test offers (docs/plans/day25a-spec.md §2, §3, §5, §6.2).
import { afterAll, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

// The new-design preview's links (npm run dev:new): the switch reads this at load.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW = "true";
});
afterAll(() => {
  delete process.env.NEXT_PUBLIC_NEW_DESIGN_PREVIEW;
});
let tabParam: string | null = null;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(tabParam ? `tab=${tabParam}` : ""),
  usePathname: () => "/business/b1/offers",
}));

import { LocaleProvider, type Locale } from "@/lib/i18n";
import { isInternalEmail, offerIsTest, offerSummary, showsTestOffers } from "@/lib/offerTesting";
import { OffersView, offersTabFromParam } from "@/app/business/[id]/offers/OffersView";
import { CampaignChannels } from "@/app/business/[id]/campaigns/CampaignChannels";
import { GetReviewsView } from "@/app/business/[id]/get-reviews/GetReviewsView";
import { PrintKitView } from "@/app/business/[id]/print-kit/PrintKitView";
import { ReviewsView } from "@/app/business/[id]/website-reviews/ReviewsView";
import { reviewsFixSummary } from "@/lib/fixPlan";
import { MERGED_REVIEW_CHECK_ID, REVIEWS_COUNT_CHECK_ID, REVIEWS_TRUST_CHECK_ID, type ActionPlanTask } from "@/lib/actionPlan";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { getReviewsHref, legacyRedirectIfLive, offersHref, printKitHref, localEventsHref, NEW_PAGES_LIVE } from "@/lib/routes";
import type { Plan } from "@/lib/plan";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const wrap = (node: ReactNode, locale: Locale = "en") => renderToStaticMarkup(<LocaleProvider locale={locale} timeZone="America/New_York">{node}</LocaleProvider>);
const ENV = { DEV_TEST_LOGIN_EMAIL: "dev@example.com", PLAN_SWITCHER_EMAILS: "sam@example.com, other@example.com" };

describe("test offers (spec §6.2, rule 4)", () => {
  test("made by an internal account (the dev test login or a plan switcher) → a test offer; real owners never", () => {
    expect(offerIsTest("Dev@Example.com", ENV)).toBe(true);
    expect(offerIsTest("other@example.com", ENV)).toBe(true);
    expect(offerIsTest("owner@salon.com", ENV)).toBe(false);
    expect(isInternalEmail(null, ENV)).toBe(false);
    // Only the dev test login sees its own test offers (the exception).
    expect(showsTestOffers("dev@example.com", ENV)).toBe(true);
    expect(showsTestOffers("sam@example.com", ENV)).toBe(false);
  });
  test("new coupons and referral programs are saved with is_test", () => {
    for (const f of ["app/actions/promos.ts", "app/actions/referrals.ts"]) expect(readFileSync(f, "utf8"), f).toContain("is_test: offerIsTest(user.email),");
    expect(readFileSync("supabase/offers-is-test.sql", "utf8")).toContain("add column if not exists is_test boolean not null default false");
  });
  test("the summary: test offers never counted for a real owner", () => {
    const rows = [
      { created_at: "2026-11-02T10:00:00Z", redemptions: 3, is_test: false },
      { created_at: "2026-10-20T10:00:00Z", redemptions: 9, is_test: true },
      { created_at: "2026-11-10T10:00:00Z", redemptions: 1, is_test: false },
    ];
    expect(offerSummary(rows, false)).toEqual({ count: 2, since: "2026-11-02T10:00:00Z", uses: 4 });
    expect(offerSummary(rows, true)).toEqual({ count: 3, since: "2026-10-20T10:00:00Z", uses: 13 });
    expect(offerSummary([], false)).toEqual({ count: 0, since: null, uses: 0 });
    const loader = readFileSync("lib/offers.server.ts", "utf8");
    expect(loader).toContain("const withTests = showsTestOffers(auth.user.email);");
    expect(loader).toContain("rows.filter((r) => withTests || !r.is_test)");
  });
});

describe("links and redirects on the preview", () => {
  test("every Growth item opens its own page", () => {
    expect(NEW_PAGES_LIVE).toBe(true);
    expect(getReviewsHref("b1")).toBe("/business/b1/get-reviews");
    expect(offersHref("b1")).toBe("/business/b1/offers");
    expect(offersHref("b1", "first-time")).toBe("/business/b1/offers?tab=first-time");
    // Print kit & QR is hidden until Day 34 / 37-Core: its links go to the review link & QR.
    expect(printKitHref("b1")).toBe("/business/b1/get-reviews#review-link");
    expect(localEventsHref("b1")).toBe("/business/b1/local-events");
  });
  test("old links: /website-reviews#get-more-reviews and #review-link → Get more reviews; /campaigns?tab=… → Customer offers", () => {
    expect(legacyRedirectIfLive({ pathname: "/business/b1/website-reviews", hash: "#get-more-reviews" })).toBe("/business/b1/get-reviews#get-more-reviews");
    expect(legacyRedirectIfLive({ pathname: "/business/b1/website-reviews", hash: "#review-link" })).toBe("/business/b1/get-reviews#review-link");
    expect(legacyRedirectIfLive({ pathname: "/business/b1/website-reviews", hash: "#reply-to-reviews" })).toBeNull();
    expect(legacyRedirectIfLive({ pathname: "/business/b1/campaigns", search: "tab=coupons" })).toBe("/business/b1/offers?tab=coupons");
    expect(legacyRedirectIfLive({ pathname: "/business/b1/campaigns", search: "tab=referral" })).toBe("/business/b1/offers?tab=referrals");
    expect(legacyRedirectIfLive({ pathname: "/business/b1/campaigns", search: "tab=all" })).toBe("/business/b1/offers");
    expect(legacyRedirectIfLive({ pathname: "/business/b1/campaigns" })).toBeNull();
  });
  test("each new page sends everyone else (localhost:3000, production) to today's page", () => {
    for (const p of ["offers", "get-reviews", "local-events"]) expect(readFileSync(`app/business/[id]/${p}/page.tsx`, "utf8"), p).toMatch(/if \(!NEW_PAGES_LIVE\) redirect\(/);
    // Print kit: also while it's hidden (PRINT_KIT_LIVE), to Get more reviews #review-link.
    expect(readFileSync("app/business/[id]/print-kit/page.tsx", "utf8")).toContain("if (!NEW_PAGES_LIVE || !PRINT_KIT_LIVE) redirect(printKitHref(params.id));");
  });
});

const PROFILE = { couponsOk: true, referralOk: true, label: "Hair salon" } as never;
const offers = (over: Partial<Parameters<typeof OffersView>[0]> = {}, locale: Locale = "en") =>
  wrap(<OffersView businessId="b1" businessName="Hair Express" businessPhone={null} profile={PROFILE} initialPromos={[]} initialReferral={null} summary={{ count: 3, since: "2026-11-04T15:00:00Z", uses: 5 }} plan="grow" printBusiness={null} {...over} />, locale);

describe("Customer offers", () => {
  test("opens on Running now: the summary on top, then the running offers; tabs Running now · Coupons · Referrals · First-time · Loyalty (EN + ES)", () => {
    tabParam = null;
    const html = offers();
    expect(text(html)).toContain("3 offers started since Nov 4, 2026 · 5 uses logged");
    expect(text(html)).toContain("Running now Coupons Referrals First-time customers Loyalty programs");
    expect(html).toContain('data-testid="offers-summary"');
    // The running offers (client-only list) load right under the summary.
    expect(html.indexOf('data-testid="offers-summary"')).toBeLessThan(html.indexOf("Email, text and social campaigns are in"));
    expect(text(offers({ summary: { count: 1, since: "2026-11-04T15:00:00Z", uses: 1 } }))).toContain("1 offer started since Nov 4, 2026 · 1 use logged");
    expect(text(offers({ summary: { count: 0, since: null, uses: 0 } }))).toContain("No offers started yet");
    expect(readFileSync("app/business/[id]/offers/OffersView.tsx", "utf8")).toContain('emptyKey="dashboard.offers.noneRunning"');
    expect(text(offers({}, "es"))).toContain("3 ofertas iniciadas desde el");
    expect(text(offers({}, "es"))).toContain("5 usos registrados");
    // Never a test tag for a real owner; the dev test login's own test offers are tagged.
    expect(html).not.toContain("offers-test-account");
    expect(text(offers({ testAccount: true }))).toContain("Test account");
  });
  test("First-time customers and Loyalty programs: Coming soon", () => {
    for (const tab of ["first-time", "loyalty"]) {
      tabParam = tab;
      const html = offers();
      expect(html).toContain(`data-testid="offers-soon-${tab}"`);
      expect(text(html)).toContain("Coming soon");
    }
    tabParam = null;
    expect(offersTabFromParam("coupons", { couponsOk: false, referralOk: true })).toBe("all");
    expect(offersTabFromParam("referral", { couponsOk: true, referralOk: true })).toBe("referrals");
  });
  test("Free: today's Campaigns showroom", () => {
    expect(readFileSync("app/business/[id]/offers/page.tsx", "utf8")).toContain('const showroom = await freeShowroom(params.id, "campaigns");');
  });
});

describe("Campaigns (new design): email, text and social only", () => {
  const channels = (plan: Plan, locale: Locale = "en") => wrap(<CampaignChannels businessId="b1" plan={plan} />, locale);
  test("Premium: Coming soon; Grow: locked with a Premium chip; one line to Customer offers (EN + ES)", () => {
    expect(text(channels("premium"))).toContain("Email campaigns");
    expect(channels("premium")).not.toContain("channel-premium");
    expect(channels("grow").match(/data-testid="channel-premium"/g)?.length).toBe(3);
    expect(channels("grow")).toContain('href="/business/b1/offers"');
    expect(text(channels("grow"))).toContain("Running coupons and referrals are in Customer offers →");
    expect(text(channels("grow", "es"))).toContain("Los cupones y referidos activos están en Ofertas para clientes →");
    expect(text(channels("grow"))).not.toMatch(/Running now|All campaigns/);
  });
  test("Free: locked (today's showroom), before the new page", () => {
    const page = readFileSync("app/business/[id]/campaigns/page.tsx", "utf8");
    expect(page.indexOf("freeShowroom(params.id")).toBeLessThan(page.indexOf("<CampaignChannels"));
  });
});

const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;
const DATA = { businessName: "Hair Express", address: null, category: null, primaryType: null, language: "en", timeZone: "America/New_York", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", rating: 5, reviewCount: 30, visibilityCategory: visibility, gbpConnected: false, verifiedSocials: [] };

describe("Reviews split", () => {
  test("Presence → Reviews: what customers say + replies; no asking parts; the fix line and 'Get more reviews (in Growth) →' (EN + ES)", () => {
    const fixLine = { count: 2, from: 21, to: 32, score: 78, after: 89, later: true };
    const html = wrap(<ReviewsView businessId="b1" reviews={DATA} plan="grow" split fixLine={fixLine} />);
    expect(text(html)).toContain("Fix these 2 and Visibility & Reputation goes 21 → 32 pts (score 78 → 89). The rest comes as your reviews grow.");
    // The gold button, twice: the fix line (right side) and the Review volume card; no "Back to…" (the sidebar navigates).
    expect(html.match(/href="\/business\/b1\/get-reviews#review-link"/g)?.length).toBe(2);
    expect(html).toContain('data-testid="reviews-get-more-volume"');
    expect(html.match(/data-testid="reviews-get-more[^"]*" class="[^"]*bg-brass/g)?.length).toBe(2);
    expect(html).not.toContain("Back to");
    expect(text(html)).toContain("Get more reviews (in Growth)");
    expect(html).toContain('id="reply-to-reviews"');
    expect(html).not.toContain('id="get-more-reviews"');
    expect(html).not.toContain('data-testid="review-guide"');
    // The review checks with "+N pts" (the points each still has to win).
    const gains = Array.from(html.matchAll(/data-testid="check-gain"[^>]*>([^<]+)</g)).map((m) => m[1]);
    const missing = visibility.checks.filter((c) => c.earnedPoints !== null && c.maxPoints > c.earnedPoints);
    expect(gains.length).toBe(missing.length);
    for (const g of gains) expect(g).toMatch(/^\+[\d.]+ pts$/);
    const es = text(wrap(<ReviewsView businessId="b1" reviews={DATA} plan="grow" split fixLine={fixLine} />, "es"));
    expect(es).toContain("Haga estas 2 correcciones y Visibilidad y reputación pasa de 21 a 32 pts (puntuación 78 → 89).");
    expect(es).toContain("Consiga más reseñas (en Crecimiento)");
    // Today's page (localhost:3000): unchanged.
    const today = wrap(<ReviewsView businessId="b1" reviews={DATA} plan="grow" />);
    expect(today).toContain('id="get-more-reviews"');
    expect(today).not.toContain("reviews-fix-line");
    expect(today).not.toContain("check-gain");
  });

  test("Free (spec §5): Reviews opens on the preview — rating, count, the goal, checks with +N pts, the fix line, the paste-a-review drafter (3 a week); the inbox and posting replies stay locked", () => {
    const page = readFileSync("app/business/[id]/website-reviews/page.tsx", "utf8");
    expect(page).toContain('if (!NEW_PAGES_LIVE) {\n    const showroom = await freeShowroom(params.id, "reviews");');
    const fixLine = { count: 2, from: 21, to: 32, score: 78, after: 89, later: true };
    const drafts = { status: "ok", used: 0, left: 3, resetsAt: "2026-11-30T05:00:00Z" } as const;
    const html = wrap(<ReviewsView businessId="b1" reviews={DATA} plan="free" split fixLine={fixLine} replyDrafts={drafts} />);
    expect(text(html)).toContain("Fix these 2 and Visibility & Reputation goes 21 → 32 pts");
    expect(html).toContain('id="reply-to-reviews"');
    // The paste-a-review drafter is there; the Google reviews inbox is a locked preview.
    expect(html).toContain('id="reply-to-a-review"');
    expect(html).toContain('id="google-reviews"');
    expect(html).not.toMatch(/data-testid="google-reviews-inbox"/);
    expect(text(wrap(<ReviewsView businessId="b1" reviews={DATA} plan="free" split fixLine={fixLine} replyDrafts={drafts} />, "es"))).toContain("Haga estas 2 correcciones");
  });

  test("the review goal line stays on Reviews after the split, on every plan (Hair Express: 'Businesses near you average 57 · Next up: ELite Hair Design, 36 reviews')", () => {
    const rival = (name: string, reviewCount: number) => ({ name, reviewCount }) as never;
    const goal = { kind: "next", average: 57, leader: rival("Salon Leader", 120), ownCount: 30, gap: 6, nextUp: rival("ELite Hair Design", 36), stretch: null, runnerUp: null } as never;
    for (const plan of ["free", "grow", "premium"] as const) {
      const html = text(wrap(<ReviewsView businessId="b1" reviews={DATA} plan={plan} split nearby={{ goal, group: "hair salons" }} />));
      expect(html, plan).toMatch(/average 57/);
      expect(html, plan).toContain("ELite Hair Design");
    }
    // No goal when the competitors' review counts couldn't be read live (never a partial average).
    expect(readFileSync("app/actions/competitors.ts", "utf8")).toContain("const countsKnown = !snapshot.liveUnavailable;");
  });

  test("Get more reviews: asking only — link + QR + PNG, the guide, counter tools, signs; #get-more-reviews and #review-link; 'See what customers say →' (EN + ES)", () => {
    const html = wrap(<GetReviewsView businessId="b1" businessName="Hair Express" placeId={DATA.placeId} verifiedSocials={[]} plan="grow" />);
    expect(html).toContain('id="get-more-reviews"');
    expect(html).toContain('id="review-link"');
    expect(html).toContain('id="review-guide"');
    expect(html).toContain('href="/business/b1/website-reviews"');
    expect(text(html)).toContain("See what customers say");
    expect(html).not.toMatch(/reply-to-reviews|ReviewReplyDrafter|google-reviews/);
    expect(text(wrap(<GetReviewsView businessId="b1" businessName="Hair Express" placeId={DATA.placeId} verifiedSocials={[]} plan="grow" />, "es"))).toContain("Vea lo que dicen sus clientes");
    expect(readFileSync("app/business/[id]/get-reviews/page.tsx", "utf8")).toContain('const showroom = await freeShowroom(params.id, "reviews");');
  });

  test("the fix line uses Fix plan's own review rows: replies + the next 3 reviews, never the rows that take months", () => {
    const task = (checkId: string, weightedPoints: number, when: ActionPlanTask["when"]) => ({ checkId, category: "visibility", weightedPoints, when, status: "open" }) as ActionPlanTask;
    const tasks = [task("visibility.review_replies", 6, "this_week"), task(MERGED_REVIEW_CHECK_ID, 4.7, "weeks"), task(REVIEWS_TRUST_CHECK_ID, 1.7, "months"), task(REVIEWS_COUNT_CHECK_ID, 6.8, "months"), { ...task("completeness.photos", 2, "this_week"), category: "completeness" } as ActionPlanTask];
    const breakdown = { total: 78, categories: [{ id: "visibility", relativeScore: 52.5, weight: 40 }] } as never;
    // 21 + 6 + 4.7 = 31.7 → shown "32 pts" (whole from 10 up); score 78 → 89.
    expect(reviewsFixSummary({ breakdown, tasks })).toEqual({ count: 2, from: 21, to: 32, score: 78, after: 89, later: true });
    expect(reviewsFixSummary({ breakdown, tasks: tasks.filter((t) => t.when === "months") })).toBeNull();
  });
});

describe("Print kit & QR", () => {
  const kit = (plan: Plan, locale: Locale = "en") => wrap(<PrintKitView businessId="b1" placeId={DATA.placeId} plan={plan} tools={{ couponsOk: true, referralOk: true }} uses={{ coupons: 4, referrals: 1 }} />, locale);
  const level = (html: string, id: string) => html.match(new RegExp(`data-testid="print-kit-${id}" data-level="([a-z]+)"`))?.[1];
  test("the review QR + PNG on every plan; the rest locked on Free, basic on Grow, the full designers on Premium", () => {
    for (const plan of ["free", "grow", "premium"] as const) {
      const html = kit(plan);
      expect(html).toContain('data-testid="print-kit-review-qr"');
      expect(text(html)).toContain("Download QR (PNG)");
    }
    expect(["sign", "coupons", "referrals"].map((id) => level(kit("free"), id))).toEqual(["locked", "locked", "locked"]);
    expect(["sign", "coupons", "referrals"].map((id) => level(kit("grow"), id))).toEqual(["basic", "basic", "basic"]);
    expect(["sign", "coupons", "referrals"].map((id) => level(kit("premium"), id))).toEqual(["full", "full", "full"]);
    expect(level(kit("premium"), "first-time")).toBe("soon");
    expect(level(kit("premium"), "loyalty")).toBe("soon");
  });
  test("cards link into their designers, with the uses logged; scan counts said honestly (EN + ES)", () => {
    const html = kit("grow");
    expect(html).toContain('href="/business/b1/offers?tab=coupons"');
    expect(html).toContain('href="/business/b1/offers?tab=referrals"');
    expect(html).toContain('href="/business/b1/get-reviews#get-more-reviews"');
    expect(text(html)).toContain("4 uses logged on the running ones");
    expect(text(html)).toContain("1 use logged on the running ones");
    expect(text(html)).toContain("Scan counts aren't tracked yet");
    expect(text(kit("free"))).not.toContain("uses logged");
    expect(text(kit("grow", "es"))).toContain("Todavía no contamos los escaneos");
  });
});

describe("Local events", () => {
  test("Coming soon + two lines, EN + ES; same on every plan", () => {
    const page = readFileSync("app/business/[id]/local-events/page.tsx", "utf8");
    expect(page).toContain('t(locale, "dashboard.localEvents.line1")');
    expect(page).toContain('t(locale, "dashboard.localEvents.line2")');
    expect(page).not.toContain("freeShowroom");
  });
});
