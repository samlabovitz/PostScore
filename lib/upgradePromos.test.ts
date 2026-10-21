import { afterEach, describe, expect, test } from "vitest";
import { messages, t, type MessageKey } from "./i18n";
import { PLANS } from "./plan";
import {
  BOX_CLOSED,
  NO_FACTS,
  SHOWCASE_PAGES,
  boxReducer,
  featurePlan,
  hiddenUntilFrom,
  isHidden,
  isValidPromoKey,
  promoContent,
  promoStorageKey,
  promosFor,
  readLocalHidden,
  promoCardsFor,
  cardChips,
  cardPromoKey,
  unlockLine,
  visibleChips,
  writeLocalHidden,
  type PromoFacts,
  type PromoFeature,
} from "./upgradePromos";
import { factsFromScore } from "./upgradeFacts";
import type { ScoreWithSuggestions } from "./scoring";

const FACTS: PromoFacts = {
  businessName: "Test Salon",
  score: 37,
  fixPoints: 18,
  issueCount: 6,
  missingIssue: "hours",
  websiteFailed: 4,
  builderName: "Wix",
  rank: 6,
  total: 8,
  reviewCount: 10,
  reviewAvg: 84,
  competitorNoun: "salons",
  reviewLeader: { name: "Leader Salon", count: 57 },
};

describe("who sees which promo card", () => {
  test("Free: Grow and Premium; Grow: Premium; Premium and Multi: none (PostStudio has its own Website card)", () => {
    expect(promoCardsFor("free")).toEqual(["grow", "premium"]);
    expect(promoCardsFor("grow")).toEqual(["premium"]);
    expect(promoCardsFor("premium")).toEqual([]);
    expect(promoCardsFor("multi")).toEqual([]);
  });

  test("Free's Website page has no PostStudio chip (its own PostStudio card is the one mention); Grow keeps it, as before", () => {
    expect(cardChips("premium", "website", "free").some((c) => c.key.endsWith(".postStudio"))).toBe(false);
    expect(cardChips("premium", "website", "grow")[0].key).toBe("dashboard.upgrade.chip.postStudio");
  });

  test("each card's chips are relevant to the page; 3 show at a time, rotating one by one", () => {
    expect(cardChips("premium", "reviews")[0].key).toBe("dashboard.upgrade.chip.aiReplies");
    expect(cardChips("premium", "campaigns")[0].key).toBe("dashboard.upgrade.chip.campaignChannels");
    expect(cardChips("grow", "campaigns").map((c) => c.key)).toContain("dashboard.upgrade.chip.trackAll");
    expect(cardChips("grow", "reviews")[0].key).toBe("dashboard.upgrade.chip.reviewSign");
    expect(cardChips("grow", "pricing")[0].key).toBe("dashboard.upgrade.chip.priceCheck");
    const chips = cardChips("premium", "overview");
    expect(visibleChips(chips, 0)).toEqual(chips.slice(0, 3));
    expect(visibleChips(chips, 1)).toEqual(chips.slice(1, 4));
  });

  test("anything not built is marked soon", () => {
    const all = SHOWCASE_PAGES.flatMap((p) => cardChips("premium", p));
    for (const id of ["aiReplies", "doneForYou", "searchInsights", "campaignChannels", "postStudio"])
      expect(all.filter((c) => c.key.endsWith(`.${id}`)).every((c) => c.soon), id).toBe(true);
    expect(SHOWCASE_PAGES.flatMap((p) => cardChips("grow", p)).every((c) => !c.soon)).toBe(true);
  });
});

describe("the promo box", () => {
  test("opens only on a click on something locked, and every way of closing closes it", () => {
    expect(BOX_CLOSED).toEqual({ open: false });
    const open = boxReducer(BOX_CLOSED, { type: "lockedClick", feature: "designs" });
    expect(open).toEqual({ open: true, feature: "designs" });
    for (const reason of ["x", "notNow", "esc", "outside"] as const) expect(boxReducer(open, { type: "close", reason })).toEqual({ open: false });
  });

  test("no promos on Premium or Multi (Premium only for the PostStudio add-on); Grow isn't sold what it has", () => {
    const features: PromoFeature[] = ["designs", "print", "reviewSign", "googleProfile", "campaignHub", "postStudio", "recheck", "premium", "grow"];
    for (const f of features) {
      expect(promosFor("multi", f)).toBe(false);
      expect(promosFor("premium", f)).toBe(f === "postStudio");
      expect(promosFor("free", f)).toBe(true);
      expect(promosFor("grow", f)).toBe(featurePlan(f) === "premium");
    }
  });

  test("title names the feature and the plan; not-built lines say Coming soon", () => {
    const g = promoContent("googleProfile", FACTS, "en");
    expect(g.feature?.title).toBe("Google Profile · Premium");
    expect(g.feature?.lines.every((l) => l.soon)).toBe(true);
    const hub = promoContent("campaignHub", FACTS, "en");
    // Only email, text and social campaigns are Premium now — and not built yet.
    expect(hub.feature?.title).toBe("Email, text & social campaigns · Premium");
    expect(hub.feature?.lines.map((l) => [l.text, l.soon])).toEqual([
      ["Send your offers to customers by email and text", true],
      ["Post them to your social pages from PostScore", true],
    ]);
    expect(promoContent("designs", FACTS, "en").feature?.title).toBe("Every design tool · Premium");
    expect(promoContent("reviewSign", FACTS, "es").feature?.title).toBe("Letrero de reseñas · Grow");
  });

  test("ALWAYS both plans side by side: Premium marked Best value, the clicked plan highlighted", () => {
    for (const f of ["designs", "print", "reviewSign", "googleProfile", "campaignHub", "postStudio", "recheck", "premium", "grow"] as PromoFeature[]) {
      const c = promoContent(f, FACTS, "en");
      expect(c.plans.map((p) => p.plan).sort(), f).toEqual(["grow", "premium"]);
      expect(c.plans.find((p) => p.plan === "premium")?.best, f).toBe(true);
      expect(c.plans.filter((p) => p.highlighted), f).toHaveLength(1);
    }
    // Premium-only features lead with Premium; a Grow click highlights Grow.
    expect(promoContent("campaignHub", FACTS, "en").plans[0].plan).toBe("premium");
    expect(promoContent("print", FACTS, "en").plans[0].plan).toBe("grow");
    expect(promoContent("campaignHub", FACTS, "en", "grow").plans.find((p) => p.highlighted)?.plan).toBe("grow");
  });

  test("uses the business's real numbers, and leaves a line out when its data is missing", () => {
    const sign = promoContent("reviewSign", FACTS, "en");
    expect(sign.feature?.lines[0].text).toBe("You have 10 reviews. Your goal: beat Leader Salon (57). Grow gives you a plan to get there.");
    const noData = promoContent("reviewSign", NO_FACTS, "en");
    expect(noData.feature?.lines.map((l) => l.text)).toEqual(["Print a sign with your own review QR code", "Put it by your counter so every customer can leave a review"]);
    const grow = promoContent("grow", FACTS, "en");
    expect(grow.feature?.lines.map((l) => l.text)).toEqual([
      "Your listing is missing your business hours. Grow shows you exactly how to fix it, step by step.",
      "You're #6 of 8 nearby. See what's holding you back with Grow.",
    ]);
    // Without data: no feature lines at all — just the two plans.
    expect(promoContent("grow", NO_FACTS, "en").feature).toBeNull();
  });
});

describe("the Free unlock lines (real data only)", () => {
  test("each line with real data", () => {
    expect(unlockLine("missing", FACTS, "en")).toBe("Your listing is missing your business hours. Grow shows you exactly how to fix it, step by step.");
    expect(unlockLine("reviews", FACTS, "en")).toBe("You have 10 reviews. Your goal: beat Leader Salon (57). Grow gives you a plan to get there.");
    expect(unlockLine("rank", FACTS, "en")).toBe("You're #6 of 8 nearby. See what's holding you back with Grow.");
    expect(unlockLine("website", FACTS, "en")).toBe("Your website failed 4 checks. Grow shows how to fix each one in Wix.");
    expect(unlockLine("plan", FACTS, "en")).toBe("Your plan for this week is ready. Unlock it with Grow.");
    expect(unlockLine("recheck", FACTS, "en")).toBe("Fixed something? With Grow, re-check right away instead of waiting a month.");
    expect(unlockLine("designs", FACTS, "en")).toBe("Design and print your review sign, coupons and referral cards with Grow.");
    expect(unlockLine("hub", FACTS, "en")).toBe("Email, text and social campaigns — Premium, coming soon.");
    expect(unlockLine("tracking", FACTS, "en")).toBe("Track every coupon and referral card in one place, with +1 for each one used — with Grow.");
    expect(unlockLine("connect", FACTS, "en")).toBe("Connect Google and let PostScore fix your listing for you. Premium, coming soon.");
  });

  test("hidden when the data is missing or there's no gap; singular for 1", () => {
    for (const id of ["missing", "reviews", "rank", "website", "plan"] as const) expect(unlockLine(id, NO_FACTS, "en"), id).toBeNull();
    expect(unlockLine("reviews", { ...FACTS, reviewCount: 90 }, "en")).toBeNull();
    expect(unlockLine("reviews", { ...FACTS, reviewLeader: null }, "en")).toBeNull();
    expect(unlockLine("rank", { ...FACTS, rank: 1 }, "en")).toBeNull();
    expect(unlockLine("website", { ...FACTS, builderName: null }, "en")).toBeNull();
    expect(unlockLine("website", { ...FACTS, websiteFailed: 1 }, "en")).toBe("Your website failed 1 check. Grow shows how to fix it in Wix.");
    expect(unlockLine("reviews", { ...FACTS, reviewCount: 1 }, "en")).toBe("You have 1 review. Your goal: beat Leader Salon (57). Grow gives you a plan to get there.");
  });

  test("Spanish (usted)", () => {
    expect(unlockLine("rank", FACTS, "es")).toBe("Usted está en el puesto 6 de 8 en su zona. Vea qué lo está frenando con Grow.");
    expect(unlockLine("missing", FACTS, "es")).toBe("A su ficha le falta su horario de atención. Grow le muestra exactamente cómo arreglarlo, paso a paso.");
  });
});

describe("facts come from the real scan", () => {
  const check = (id: string, category: string, maxPoints: number, earnedPoints: number | null, confidence = "VERIFIED") => ({ id, category, maxPoints, earnedPoints, confidence, label: id, explanation: "", meta: null });
  const result = (checks: ReturnType<typeof check>[], total: number, projected: number, suggestions = 3) =>
    ({ breakdown: { total, checks }, projectedBreakdown: { total: projected }, suggestions: Array.from({ length: suggestions }) }) as unknown as ScoreWithSuggestions;

  test("score, fix points, the biggest fully-missing listing field, failed website checks, rank and review gap", () => {
    const r = result(
      [
        check("completeness.phone", "completeness", 3, 0),
        check("completeness.hours", "completeness", 5, 0),
        check("completeness.photos", "completeness", 4, 2),
        check("website.https", "website", 4, 0),
        check("website.content_depth", "website", 5, 3),
        check("website.security", "website", 2, null, "UNCERTAIN"),
        check("website.about_presence", "website", 2, 2),
      ],
      37,
      55
    );
    const facts = factsFromScore(
      { name: "Test Salon", review_count: 10, website: "https://testsalon.wixsite.com/salon", website_analysis_json: null },
      r,
      {
        rank: 6,
        peerCount: 8,
        competitorReviewAverage: 83.6,
        competitorNoun: "salons",
        reviewGoal: { kind: "beat", average: 84, leader: { name: "Leader Salon", reviewCount: 57, rating: null }, ownCount: 10, gap: 47, nextUp: null, runnerUp: null },
      }
    );
    expect(facts).toEqual({ ...FACTS, issueCount: 3, websiteFailed: 2 });
  });

  test("nothing known → nothing claimed", () => {
    const facts = factsFromScore({ name: null, review_count: null, website: null, website_analysis_json: null }, result([], 80, 80, 0), null);
    expect(facts.fixPoints).toBeNull();
    expect(facts.missingIssue).toBeNull();
    expect(facts.rank).toBeNull();
    expect(facts.reviewAvg).toBeNull();
    expect(facts.builderName).toBeNull();
  });
});

describe("hiding a card for 14 days", () => {
  const store = new Map<string, string>();
  afterEach(() => {
    store.clear();
    delete (globalThis as { window?: unknown }).window;
  });

  test("hidden for exactly 14 days, then back", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const until = hiddenUntilFrom(now);
    expect(until).toBe("2026-11-03T12:00:00.000Z");
    expect(isHidden(until, new Date("2026-11-03T11:59:59Z"))).toBe(true);
    expect(isHidden(until, new Date("2026-11-03T12:00:01Z"))).toBe(false);
    expect(isHidden(null, now)).toBe(false);
    expect(isHidden("garbage", now)).toBe(false);
  });

  test("per business and page on this device; storage errors never break the page", () => {
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
    writeLocalHidden("b1", cardPromoKey("premium", "reviews"), "2026-11-03T12:00:00.000Z");
    expect(readLocalHidden("b1", "card.premium.reviews")).toBe("2026-11-03T12:00:00.000Z");
    expect(readLocalHidden("b2", "card.premium.reviews")).toBeNull();
    expect(readLocalHidden("b1", "card.grow.reviews")).toBeNull();
    expect(promoStorageKey("b1", "card.premium.reviews")).toBe("postscore.promoHidden.b1.card.premium.reviews");
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readLocalHidden("b1", "card.premium.reviews")).toBeNull();
    expect(() => writeLocalHidden("b1", "card.premium.reviews", "x")).not.toThrow();
  });

  test("only the card keys can be saved", () => {
    for (const p of SHOWCASE_PAGES) for (const k of ["grow", "premium"] as const) expect(isValidPromoKey(cardPromoKey(k, p))).toBe(true);
    expect(isValidPromoKey("card.grow.settings")).toBe(false);
    expect(isValidPromoKey("strip.reviews")).toBe(false);
    expect(isValidPromoKey("anything")).toBe(false);
  });
});

describe("copy", () => {
  test("every upgrade and plan string exists in English and Spanish", () => {
    const keys = Object.keys(messages.en).filter((k) => k.startsWith("dashboard.upgrade.") || k.startsWith("dashboard.settings.plans.")) as MessageKey[];
    expect(keys.length).toBeGreaterThan(120);
    for (const k of keys) expect(messages.es[k], k).toBeTruthy();
  });

  test("every plan has the four plans' names in both languages", () => {
    for (const p of PLANS) for (const l of ["en", "es"] as const) expect(t(l, `dashboard.settings.plan.name.${p}` as MessageKey)).toBeTruthy();
  });
});
