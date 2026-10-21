import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => "/business/b1/campaigns",
}));
vi.mock("@/app/actions/promos", () => ({ startPromo: vi.fn(), incrementPromoRedemption: vi.fn(), endPromo: vi.fn() }));
vi.mock("@/app/actions/referrals", () => ({ startReferral: vi.fn(), incrementReferralRedemption: vi.fn(), endReferral: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { NO_FACTS, type PromoFacts } from "@/lib/upgradePromos";
import { UpgradeProvider } from "@/components/upgrade/UpgradeContext";
import { CouponsSection } from "@/app/business/[id]/campaigns/CouponsSection";
import { ReferralSection } from "@/app/business/[id]/campaigns/ReferralSection";
import { CampaignsView } from "@/app/business/[id]/campaigns/CampaignsView";
import { ReviewGuide } from "@/components/reviews/ReviewGuide";
import { ReviewGapLine, ReviewsView } from "@/app/business/[id]/website-reviews/ReviewsView";
import { campaignsTabFromParam } from "@/lib/campaignsTabs";
import { bizProfileById } from "@/config/bizProfiles";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import type { CardBusiness } from "@/lib/printStudio/design";
import type { PromoRow } from "@/lib/promos";
import type { Plan } from "@/lib/plan";
import type { ReviewGoal } from "@/lib/competitorComparison";

const FACTS: PromoFacts = { ...NO_FACTS, reviewCount: 10, reviewAvg: 57, competitorNoun: "salons", issueCount: 3, reviewLeader: { name: "Leader Salon", count: 90 } };
const GOAL: ReviewGoal = { kind: "beat", average: 57, leader: { name: "Leader Salon", reviewCount: 90, rating: null }, ownCount: 10, gap: 80, nextUp: null, runnerUp: null };
const wrap = (node: React.ReactNode, plan: Plan, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      <UpgradeProvider value={{ businessId: "b1", plan, facts: FACTS, cards: [] }}>{node}</UpgradeProvider>
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const SALON = bizProfileById("salon", "en")!;
const CARD: CardBusiness = { businessName: "Test Salon", placeId: "p1", googleMapsUri: null, website: null, address: "1 Main St", hours: null, icon: "star" };
const PROMO = { id: "pr1", business_id: "b1", offer: "20% off any color service", code: "COLOR20", expires_on: "2026-12-31", redemptions: 4, status: "active", created_at: "2026-10-01T00:00:00Z" } as unknown as PromoRow;
const coupons = (plan: Plan) =>
  wrap(<CouponsSection businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} promos={[PROMO]} plan={plan} printBusiness={CARD} />, plan);
const referrals = (plan: Plan) =>
  wrap(<ReferralSection businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} referral={null} plan={plan} printBusiness={CARD} />, plan);

describe("Campaigns on Free: every tab is a locked preview", () => {
  test("Coupons: a showroom — the real designer; Save & start / Share open the promo box; no running list or tally", () => {
    const html = coupons("free");
    expect(html).toContain('data-testid="designer-showroom"');
    expect(html).not.toContain("locked-preview");
    expect(html).toMatch(/data-testid="upgrade-button" data-feature="print"[^>]*aria-haspopup="dialog"|aria-haspopup="dialog"[^>]*data-testid="upgrade-button" data-feature="print"/);
    expect(text(html)).toContain("Save & start tracking");
    // The running coupon (and so its +1 tally) isn't shown on Free.
    expect(text(html)).not.toContain("COLOR20");
  });
  test("Referrals: the same", () => {
    const html = referrals("free");
    expect(html).toContain('data-testid="designer-showroom"');
    expect(text(html)).toContain("Save & start tracking");
  });
  test("All campaigns is the tracking home on Grow AND Premium: they open on it; every running campaign with type, code, start date, times used, +1, End; only email/text/social are Premium", () => {
    expect(campaignsTabFromParam(null, SALON)).toBe("all");
    nav.query = "";
    for (const plan of ["grow", "premium"] as Plan[]) {
      const html = wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[PROMO]} initialReferral={null} plan={plan} printBusiness={CARD} />, plan);
      expect(html, plan).toMatch(/role="tab" aria-selected="true"[^>]*>All campaigns</);
      // No lock on the tab for paid plans.
      expect(html.slice(0, html.indexOf("All campaigns<")), plan).not.toContain("tabler-icon-lock");
      expect(html, plan).not.toContain("locked-preview");
    }
    const grow = text(wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[PROMO]} initialReferral={null} plan="grow" printBusiness={CARD} />, "grow"));
    expect(grow).toContain("Premium");
    expect(grow).not.toContain("Coming soon");
  });
;
;
});

describe("Campaigns on Grow and Premium", () => {
  test("Grow: each Coupons/Referrals tab has the collapsible five-step 'How to run it' guide, with the never-reward-reviews rule", () => {
    for (const [query, kind] of [["tab=coupons", "coupons"], ["tab=referrals", "referrals"]] as const) {
      nav.query = query;
      const html = wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[]} initialReferral={null} plan="grow" printBusiness={CARD} />, "grow");
      expect(html, kind).toMatch(new RegExp(`<details data-testid="how-to-run-it" data-kind="${kind}"`));
      const t = text(html);
      for (const step of ["Pick an offer that fits your business", "Design and print it", "Share it", "Redeem and track it", "End it or refresh it"]) expect(t, `${kind}: ${step}`).toContain(step);
      expect(t).toContain("print shop");
      expect(t).toContain("+1 Redeemed on All campaigns");
      expect(t).toContain("Never reward reviews.");
    }
    nav.query = "tab=coupons";
    const es = text(wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[]} initialReferral={null} plan="grow" printBusiness={CARD} />, "grow", "es"));
    expect(es).toContain("Cómo hacerlo funcionar");
    expect(es).toContain("Nunca premie las reseñas.");
    nav.query = "";
  });

  test("Coupons and Referrals are design only: no running list or tally there; 'Save & start tracking →' and 'You'll track redemptions on All campaigns.'", () => {
    const html = coupons("grow");
    const t = text(html);
    expect(html).not.toContain("locked-preview");
    expect(t).not.toContain("COLOR20");
    expect(t).not.toContain("Active offers");
    expect(t).toContain("Save & start tracking →");
    expect(t).toContain("You'll track redemptions on All campaigns.");
    const ref = text(referrals("grow"));
    expect(ref).not.toContain("Active referrals");
    expect(ref).toContain("You'll track redemptions on All campaigns.");
    expect(text(wrap(<CouponsSection businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} promos={[]} plan="grow" printBusiness={CARD} />, "grow", "es"))).toContain("Llevará la cuenta de los canjes en Todas las campañas.");
  });

  test("after saving: the new one goes to the top of All campaigns, highlighted, with the toast 'Saved — track it on All campaigns'", async () => {
    const src = readFileSync("app/business/[id]/campaigns/CampaignsView.tsx", "utf8");
    expect(src).toMatch(/setPromos\(\(prev\) => \[promo, \.\.\.prev\]\);\s*saved\(promo\.id\);/);
    expect(src).toMatch(/function saved\(id: string\) \{\s*setJustSaved\(id\);\s*setTab\("all"\);/);
    expect(src).toContain('{t(locale, "dashboard.campaigns.savedToast")}');
    // The row itself: the type, the start date, "New" and the highlight.
    const { ActivePromotions } = await import("@/app/business/[id]/campaigns/ActivePromotions");
    const html = wrap(<ActivePromotions promos={[PROMO]} businessName="Test Salon" businessPhone={null} maxActive={3} onRedeem={async () => ({ status: "ok", redemptions: 5 }) as never} onEnd={async () => ({ status: "ok" }) as never} highlightId="pr1" />, "grow");
    const t = text(html);
    expect(html).toContain('data-highlighted="true"');
    for (const s of ["20% off any color service", "Coupon", "New", "COLOR20", "Started Sep 30, 2026", "+1 Redeemed", "End"]) expect(t, s).toContain(s);
  });
;
  test("Premium/Multi: no 'How to run it' guides (Grow only)", () => {
    for (const plan of ["premium", "multi"] as Plan[]) {
      nav.query = "tab=coupons";
      const html = wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[]} initialReferral={null} plan={plan} printBusiness={CARD} />, plan);
      expect(html, plan).not.toContain("how-to-run-it");
    }
    nav.query = "";
  });

  test("Premium/Multi: the hub is the real one (no preview), opened first", () => {
    for (const plan of ["premium", "multi"] as Plan[]) {
      nav.query = "";
      const html = wrap(<CampaignsView businessId="b1" businessName="Test Salon" businessPhone={null} profile={SALON} initialPromos={[]} initialReferral={null} plan={plan} printBusiness={CARD} />, plan);
      expect(html, plan).not.toContain("locked-preview");
      expect(text(html), plan).toContain("Email");
    }
  });
});

describe("Reviews", () => {
  const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;
  const view = (plan: Plan, locale: "en" | "es" = "en") =>
    wrap(
      <ReviewsView
        businessId="b1"
        plan={plan}
        nearby={{ goal: GOAL, group: "nearby salons" }}
        reviews={{ businessName: "Test Salon", address: null, category: null, primaryType: null, language: locale, timeZone: "America/New_York", placeId: "p1", rating: 4.6, reviewCount: 10, visibilityCategory: visibility, gbpConnected: false, verifiedSocials: [] }}
      />,
      plan,
      locale
    );

  test("Free: the rule stays visible; the guide shows its headings with the details locked", () => {
    const html = wrap(<ReviewGuide placeId="p1" locked />, "free");
    const t = text(html);
    expect(t).toContain("Never offer a discount or gift for a review — it's against Google's rules and can get reviews removed.");
    for (const h of ["When to ask", "What to say", "Where to put your QR code"]) expect(t).toContain(h);
    expect(t).not.toContain("Right after the visit");
    expect(t).not.toContain("At the register or checkout counter");
    expect(t).not.toContain("Thanks so much for coming in today");
    expect(html).toContain('data-testid="locked-preview-content"');
    expect(t).toContain("You have 10 reviews. Your goal: beat Leader Salon (90). Grow gives you a plan to get there.");
  });

  test("Grow: the guide is fully open", () => {
    const t = text(wrap(<ReviewGuide placeId="p1" />, "grow"));
    expect(t).toContain("Right after the visit");
    expect(t).toContain("At the register or checkout counter");
  });

  test("the review goal (beat the leader) is free on every plan", () => {
    for (const plan of ["free", "grow", "premium"] as Plan[]) {
      const t = text(view(plan));
      expect(t, plan).toContain("Nearby salons average 57 reviews.");
      expect(t, plan).toContain("Your goal: beat Leader Salon — 90 reviews (80 more than you).");
    }
    expect(wrap(<ReviewGapLine goal={null} group={null} />, "free")).toBe("");
  });

  test("the review link, QR and counter tools stay on Free; the sign designer stays a preview", () => {
    const html = view("free");
    expect(html).toContain('id="get-more-reviews"');
    expect(html).toContain('data-testid="counter-tools"');
    expect(html).toContain('data-testid="sign-locked"');
  });

  test("Premium and Multi see 'Unlimited replies; with Google connect … (coming soon)'; Grow doesn't", () => {
    for (const plan of ["premium", "multi"] as Plan[]) expect(text(view(plan)), plan).toContain("Unlimited replies; with Google connect, every unanswered review + posting for you (coming soon)");
    expect(view("grow")).not.toContain("ai-replies-soon");
  });

  test("'Reply to a review' on the Reviews page (Grow and up), in the reply assistant block, only with the draft status", () => {
    const withDrafts = (plan: Plan, left: number | null) =>
      wrap(
        <ReviewsView
          businessId="b1"
          plan={plan}
          replyDrafts={{ status: "ok", used: left === null ? 7 : 3 - left, left }}
          reviews={{ businessName: "Test Salon", address: null, category: null, primaryType: null, language: "en", timeZone: "America/New_York", placeId: "p1", rating: 4.6, reviewCount: 10, visibilityCategory: visibility, gbpConnected: false, verifiedSocials: [] }}
        />,
        plan
      );
    const grow = withDrafts("grow", 2);
    expect(text(grow)).toContain("Reply to a review");
    expect(text(grow)).toContain("2 of 3 free replies left");
    expect(text(grow)).toContain("Unlimited with Premium");
    expect(grow.indexOf('data-testid="review-reply-drafter"')).toBeGreaterThan(grow.indexOf("Reply assistant"));
    const premium = text(withDrafts("premium", null));
    expect(premium).toContain("Unlimited replies");
    expect(premium).not.toMatch(/free replies left|Unlimited with Premium/);
    expect(view("grow")).not.toContain("review-reply-drafter");
  });
;

  test("Spanish", () => {
    const t = text(view("free", "es"));
    expect(t).toContain("Nunca ofrezca un descuento ni un regalo a cambio de una reseña");
    expect(t).toContain("Cuándo pedirla");
    expect(t).toContain("Su meta: superar a Leader Salon");
  });

  test("no paid calls: the Reviews and Campaigns pages load nothing that calls Google, PageSpeed or the AI", () => {
    for (const f of ["app/business/[id]/website-reviews/page.tsx", "app/business/[id]/campaigns/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      for (const paid of ["recheckWebsite(", "rescanBusiness", "runAndSaveCompetitorScan", "callAnthropic", "sendAssistantMessage", "lookupBusinessByPlaceId", "searchNearby", "pagespeed"])
        expect(src, `${f}: ${paid}`).not.toMatch(new RegExp(paid.replace("(", "\\("), "i"));
    }
  });
});
