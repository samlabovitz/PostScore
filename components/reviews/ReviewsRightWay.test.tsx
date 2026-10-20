import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/business/b1/website-reviews",
}));

import { LocaleProvider, messages } from "@/lib/i18n";
import { ReviewGuide, reviewScript } from "./ReviewGuide";
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
  ]);

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
