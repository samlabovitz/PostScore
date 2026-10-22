import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/business/b1/website-reviews",
}));

import { LocaleProvider, messages } from "@/lib/i18n";
import { REVIEW_GUIDE_OPEN_KEY, ReviewGuide, readGuideOpen, rememberGuideOpen, reviewScript } from "./ReviewGuide";
import { CounterTools } from "./CounterTools";
import { ReviewsView } from "@/app/business/[id]/website-reviews/ReviewsView";
import { COUNTER_TOOL_PRODUCTS, visibleCounterProducts, type CounterToolProduct } from "@/lib/counterTools";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { scoreBusiness } from "@/lib/scoring";
import { scoringInput } from "@/emails/sampleMonthlyReportContent";
import { ASSISTANT_SYSTEM_RULES } from "@/lib/assistant";
import type { Plan } from "@/lib/plan";

const PLACE_ID = "ChIJN1t_tDeuEmsRUsoyG83frY4";
const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("Get more reviews, the right way", () => {
  test("when to ask, what to say (EN + ES with the real link), where to put the QR, why replying matters, and the rule", () => {
    const t = text(wrap(<ReviewGuide placeId={PLACE_ID} />));
    expect(t).toContain("Get more reviews, the right way");
    expect(t).toContain("Never offer a discount or gift for a review — it's against Google's rules and can get reviews removed.");
    expect(t).toContain("Right after the visit — at checkout or pickup");
    expect(t).toContain("Ask every customer the same way");
    expect(t).toContain("At the register or checkout counter");
    expect(t).toContain("Reply to every review.");
    expect(t).toContain(reviewScript("en", PLACE_ID));
    expect(t).toContain(reviewScript("es", PLACE_ID));
    expect(reviewScript("en", PLACE_ID)).toContain(buildGoogleReviewUrl(PLACE_ID));
    expect(reviewScript("es", PLACE_ID)).toMatch(/^¡Muchas gracias por visitarnos hoy!.*Aquí tiene el enlace: https:/);
    // No place id: the script without a made-up link.
    expect(reviewScript("en", null)).not.toMatch(/https?:/);
  });

  test("Spanish dashboard: Spanish script first, guide in Spanish (usted)", () => {
    const html = wrap(<ReviewGuide placeId={PLACE_ID} />, "es");
    const t = text(html);
    expect(t).toContain("Consiga más reseñas, de la manera correcta");
    expect(t).toContain("Nunca ofrezca un descuento ni un regalo a cambio de una reseña");
    expect(html.indexOf('lang="es"')).toBeLessThan(html.indexOf('lang="en"'));
  });

  test("the Reviews page shows the guide and the counter tools", () => {
    const visibility = scoreBusiness(scoringInput()).categories.find((c) => c.id === "visibility")!;
    const html = wrap(
      <ReviewsView
        businessId="b1"
        plan="free"
        reviews={{ businessName: "Modern Liquors", address: null, category: null, primaryType: null, language: "en", timeZone: "America/New_York", placeId: PLACE_ID, rating: 4.5, reviewCount: 15, visibilityCategory: visibility, gbpConnected: false, verifiedSocials: [] }}
      />
    );
    expect(html).toContain('data-testid="review-guide"');
    expect(html).toContain('data-testid="counter-tools"');
    expect(html.indexOf('id="get-more-reviews"')).toBeLessThan(html.indexOf('data-testid="review-guide"'));
  });
});

describe("the guide is collapsible, closed by default", () => {
  const content = (html: string) => html.match(/<div[^>]*data-testid="review-guide-content"[^>]*>/)?.[0] ?? "";
  const beforeContent = (html: string) => html.slice(0, html.indexOf('data-testid="review-guide-content"'));

  test("closed: one header button (title, summary, chevron) with aria-expanded, the rule still visible, the rest hidden", () => {
    const html = wrap(<ReviewGuide placeId={PLACE_ID} />);
    const button = html.match(/<button[^>]*data-testid="review-guide-toggle"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(button).toContain('aria-expanded="false"');
    expect(button).toContain('type="button"');
    expect(html).toMatch(/<h2[^>]*><button/);
    const id = button.match(/aria-controls="([^"]+)"/)![1];
    expect(content(html)).toContain(`id="${id}"`);
    expect(content(html)).toContain('hidden=""');
    expect(text(button)).toContain("Get more reviews, the right way");
    expect(text(button)).toContain("When to ask, what to say, where to put your QR code");
    expect(button).toContain("<svg");
    // The rule sits outside the hidden part.
    expect(text(beforeContent(html))).toContain("Never offer a discount or gift for a review — it's against Google's rules and can get reviews removed.");
    expect(html).toContain('data-open="false"');
  });

  test("Spanish (usted) summary", () => {
    const t = text(wrap(<ReviewGuide placeId={PLACE_ID} />, "es"));
    expect(t).toContain("Cuándo pedirla, qué decir, dónde poner su código QR");
    expect(messages.es["dashboard.websiteReviews.guide.summary"]).not.toMatch(/\btu\b|\bpide\b/i);
  });

  test("Free: the same header and rule; the contents stay locked inside", () => {
    const html = wrap(<ReviewGuide placeId={PLACE_ID} locked />);
    expect(html).toContain('data-testid="review-guide-toggle"');
    expect(text(beforeContent(html))).toContain("When to ask, what to say, where to put your QR code");
    expect(text(beforeContent(html))).toContain("Never offer a discount or gift for a review");
    expect(html.slice(html.indexOf('data-testid="review-guide-content"'))).toContain('data-testid="locked-preview-content"');
    expect(text(html)).not.toContain("Thanks so much for coming in today");
  });

  test("open/closed is remembered per device; blocked storage means closed, never a crash", () => {
    const store = new Map<string, string>();
    const fake = () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    expect(readGuideOpen(fake)).toBe(false);
    rememberGuideOpen(true, fake);
    expect(store.get(REVIEW_GUIDE_OPEN_KEY)).toBe("1");
    expect(readGuideOpen(fake)).toBe(true);
    rememberGuideOpen(false, fake);
    expect(readGuideOpen(fake)).toBe(false);
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(readGuideOpen(blocked)).toBe(false);
    expect(() => rememberGuideOpen(true, blocked)).not.toThrow();
    expect(readGuideOpen(() => null)).toBe(false);
  });
});

describe("Counter tools — coming soon", () => {
  test("no products yet: the three kinds and 'shop coming soon' — no links, no prices", () => {
    expect(COUNTER_TOOL_PRODUCTS).toEqual([]);
    const html = wrap(<CounterTools plan="grow" />);
    const t = text(html);
    expect(t).toContain("Counter tools — coming soon");
    expect(t).toContain("they never reward it");
    for (const s of ["Tap-to-review NFC stands and cards", "QR table tents", "Counter signs", "Our shop is coming soon."]) expect(t).toContain(s);
    expect(html).not.toContain("<a ");
    expect(t).not.toMatch(/\$\d/);
    expect(html).not.toContain('data-testid="counter-shop"');
  });

  const product = (over: Partial<CounterToolProduct> = {}): CounterToolProduct => ({
    id: "nfc-stand",
    name: { en: "NFC review stand", es: "Soporte NFC para reseñas" },
    image: "https://example.com/stand.png",
    priceUsd: 24.99,
    url: "https://example.com/aff/stand",
    plans: ["grow", "premium", "multi"],
    ...over,
  });

  test("products from the one config file: only for the listed plans, sponsored links, commission note", () => {
    const products = [product(), product({ id: "premium-only", plans: ["premium"] }), product({ id: "bad", url: "http://insecure.example" })];
    expect(visibleCounterProducts("grow", products).map((p) => p.id)).toEqual(["nfc-stand"]);
    expect(visibleCounterProducts("premium", products).map((p) => p.id)).toEqual(["nfc-stand", "premium-only"]);
    expect(visibleCounterProducts("free" as Plan, products)).toEqual([]);
    const html = wrap(<CounterTools plan="grow" products={products} />);
    expect(html).toContain('data-testid="counter-shop"');
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(text(html)).toContain("$24.99");
    expect(text(html)).toContain("PostScore may earn a commission");
    expect(html).not.toContain("insecure.example");
    expect(text(wrap(<CounterTools plan="free" products={products} />))).toContain("Our shop is coming soon.");
  });
});

describe("Never a reward for a review", () => {
  // Words that would mean "give something for a review", near a review word.
  const REWARD = /(discount|% off|coupon|gift|free(bie)?\b|reward|raffle|giveaway|prize|entry|points|descuento|cup[oó]n|regalo|gratis|premio|sorteo|recompensa)/i;
  const REVIEW = /(review|reseña)/i;
  const ALLOWED = new Set([
    "dashboard.websiteReviews.guide.rule",
    "dashboard.websiteReviews.counter.intro",
    "dashboard.websiteReviews.counter.heading",
    // The Campaigns guide's own "never reward reviews" rule (checked below).
    "dashboard.campaigns.guide.rule",
    // Free Overview's "Get more Google reviews" tip line: the same rule.
    "dashboard.overview.growBanner.reviews.tipsRule",
  ]);

  test("the Free Overview's review tip line forbids rewarding reviews, in both languages", () => {
    expect(messages.en["dashboard.overview.growBanner.reviews.tipsRule"]).toBe("Never offer a discount or gift for a review — it's against Google's rules.");
    expect(messages.es["dashboard.overview.growBanner.reviews.tipsRule"]).toMatch(/^Nunca ofrezca un descuento o regalo a cambio de una reseña/);
  });

  test("the Campaigns guide's rule forbids rewarding reviews, in both languages", () => {
    expect(messages.en["dashboard.campaigns.guide.rule"]).toMatch(/^Never reward reviews\. Don't give/);
    expect(messages.es["dashboard.campaigns.guide.rule"]).toMatch(/^Nunca premie las reseñas\. No dé/);
  });

  test("no message, in either language, pairs a reward with asking for a review", () => {
    const offenders: string[] = [];
    for (const locale of ["en", "es"] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        if (!value || ALLOWED.has(key)) continue;
        // Within one sentence.
        for (const sentence of value.split(/(?<=[.!?])\s+|—/)) {
          if (REVIEW.test(sentence) && REWARD.test(sentence) && /\b(ask|get|leave|write|pida|deje|escrib|consig|for a review|por una reseña|a cambio)/i.test(sentence)) offenders.push(`${locale} ${key}: ${sentence}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("review tips never ask only 'happy' customers (review gating)", () => {
    const tips = ["content.checks.visibility.rating.advice", "content.actionPlan.visibility.rating.action", "content.actionPlan.visibility.rating.weeklyAction", "dashboard.growth.checklist.items.shareReviewLink.title"] as const;
    for (const locale of ["en", "es"] as const) {
      for (const key of tips) expect(messages[locale][key], `${locale} ${key}`).not.toMatch(/happ(y|iest)|satisfech/i);
    }
  });

  test("PostAI is told the rule: no rewards for reviews, no review gating", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("never suggest offering anything in exchange for a review");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Never suggest asking only the customers you expect to be happy");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never the review link");
  });
});
