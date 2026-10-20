// In-app upgrade promotion (Free and Grow only), kept helpful rather than
// pushy:
// - the promo box opens ONLY when the owner clicks something locked (or
//   "See what's included" on the strip) — never by itself;
// - the showcase strip sits at the bottom of the main pages, can be
//   hidden for 14 days, and is never shown on Premium or Multi (except one
//   PostStudio line on the Website page for Premium);
// - every number comes from the business's own data, and a line whose
//   data is missing is left out; anything not built says "Coming soon".
// Checkout doesn't exist: nothing here charges or pretends to — "See
// plans" opens Settings → Plan & billing → Compare plans. Pure.

import { t, type Locale, type MessageKey } from "./i18n";
import { isPremiumPlan, type Plan } from "./plan";
import { PLAN_COPY } from "./planComparison";

export type ShowcasePage = "overview" | "growth" | "campaigns" | "reviews" | "website" | "competitors" | "pricing" | "reports";
export const SHOWCASE_PAGES: ShowcasePage[] = ["overview", "growth", "campaigns", "reviews", "website", "competitors", "pricing", "reports"];

/** Real facts about the business, from its latest scan and competitor
 * scan. null = not known — a line that needs it isn't shown. */
export interface PromoFacts {
  businessName: string | null;
  score: number | null;
  /** Points the score would gain if every current fix were done (the
   * scoring's own projection, never a guess). */
  fixPoints: number | null;
  issueCount: number | null;
  /** A basic listing field that is entirely missing. */
  missingIssue: MissingIssue | null;
  websiteFailed: number | null;
  builderName: string | null;
  rank: number | null;
  total: number | null;
  reviewCount: number | null;
  reviewAvg: number | null;
  /** The plural noun for competitors ("salons"), in the business's language. */
  competitorNoun: string | null;
}

export type MissingIssue = "hours" | "phone" | "website" | "photos" | "address";

export const NO_FACTS: PromoFacts = {
  businessName: null,
  score: null,
  fixPoints: null,
  issueCount: null,
  missingIssue: null,
  websiteFailed: null,
  builderName: null,
  rank: null,
  total: null,
  reviewCount: null,
  reviewAvg: null,
  competitorNoun: null,
};

const U = (s: string) => `dashboard.upgrade.${s}` as MessageKey;

// ---------------------------------------------------------------------------
// The Free "unlock" lines (saved for 5f) — each only when its data is real.
// ---------------------------------------------------------------------------

export type UnlockLineId = "missing" | "reviews" | "rank" | "website" | "plan" | "recheck" | "designs" | "hub" | "connect";

export function unlockLine(id: UnlockLineId, f: PromoFacts, locale: Locale): string | null {
  switch (id) {
    case "missing":
      return f.missingIssue ? t(locale, U("unlock.missing"), { issue: t(locale, U(`missing.${f.missingIssue}`)) }) : null;
    case "reviews":
      // Only when there IS a gap to close.
      if (f.reviewCount === null || f.reviewAvg === null || !f.competitorNoun || f.reviewCount >= f.reviewAvg) return null;
      return t(locale, U(f.reviewCount === 1 ? "unlock.reviewsOne" : "unlock.reviews"), { n: f.reviewCount, type: f.competitorNoun, avg: f.reviewAvg });
    case "rank":
      return f.rank !== null && f.total !== null && f.total > 1 && f.rank > 1 ? t(locale, U("unlock.rank"), { rank: f.rank, total: f.total }) : null;
    case "website":
      if (!f.websiteFailed || !f.builderName) return null;
      return t(locale, U(f.websiteFailed === 1 ? "unlock.websiteOne" : "unlock.website"), { n: f.websiteFailed, builder: f.builderName });
    case "plan":
      return f.issueCount ? t(locale, U("unlock.plan")) : null;
    case "recheck":
    case "designs":
    case "hub":
    case "connect":
      return t(locale, U(`unlock.${id}`));
  }
}

// ---------------------------------------------------------------------------
// The promo box: what opens when a locked thing is clicked.
// ---------------------------------------------------------------------------

export type PromoFeature = "designs" | "print" | "reviewSign" | "googleProfile" | "campaignHub" | "postStudio" | "premium" | "grow";

export interface PromoLine {
  text: string;
  soon: boolean;
}
export interface PromoContent {
  /** The plan it needs (PostStudio is an add-on shown with Premium). */
  plan: "grow" | "premium";
  title: string;
  promise: string | null;
  lines: PromoLine[];
}

/** Which plan a feature needs. */
export function featurePlan(feature: PromoFeature): "grow" | "premium" {
  return feature === "print" || feature === "reviewSign" || feature === "grow" ? "grow" : "premium";
}

export function promoContent(feature: PromoFeature, f: PromoFacts, locale: Locale): PromoContent {
  const plan = featurePlan(feature);
  const planName = t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey);
  const line = (key: MessageKey, soon = false): PromoLine => ({ text: t(locale, key), soon });
  const fact = (id: UnlockLineId): PromoLine[] => {
    const text = unlockLine(id, f, locale);
    return text ? [{ text, soon: false }] : [];
  };
  const named = (id: string, lines: PromoLine[]): PromoContent => ({
    plan,
    title: t(locale, U("box.title"), { feature: t(locale, U(`feature.${id}.name`)), plan: planName }),
    promise: null,
    lines,
  });
  switch (feature) {
    case "designs":
      return named("designs", [line(U("feature.designs.b1")), line(U("feature.designs.b2")), line(U("feature.designs.b3"))]);
    case "print":
      return named("print", [line(U("unlock.designs")), line(U("feature.print.b2"))]);
    case "reviewSign":
      return named("reviewSign", [...fact("reviews"), line(U("feature.reviewSign.b1")), line(U("feature.reviewSign.b2"))].slice(0, 3));
    case "googleProfile":
      return named("googleProfile", [line(U("feature.googleProfile.b1"), true), line(U("feature.googleProfile.b2"), true), line(U("feature.googleProfile.b3"), true)]);
    case "campaignHub":
      return named("campaignHub", [line(U("feature.campaignHub.b1")), line(U("feature.campaignHub.b2"), true)]);
    case "postStudio":
      return { plan, title: t(locale, U("feature.postStudio.name")), promise: null, lines: [line(U("feature.postStudio.b1"), true), line(U("feature.postStudio.b2"))] };
    case "premium":
    case "grow": {
      const copy = PLAN_COPY[plan];
      // Grow leads with up to two of the business's own real gaps.
      const facts = plan === "grow" ? (["missing", "rank", "reviews", "website"] as UnlockLineId[]).flatMap(fact).slice(0, 2) : [];
      return {
        plan,
        title: `${planName} · ${t(locale, copy.price)}`,
        promise: copy.promise ? t(locale, copy.promise) : null,
        lines: [...facts, ...copy.bullets.map((k) => line(k))],
      };
    }
  }
}

/** The box opens only on a click on something locked (or "See what's
 * included"), and closes with ×, "Not now", Esc or a tap outside. */
export type BoxState = { open: false } | { open: true; feature: PromoFeature };
export type BoxAction = { type: "lockedClick"; feature: PromoFeature } | { type: "close"; reason: "x" | "notNow" | "esc" | "outside" };
export const BOX_CLOSED: BoxState = { open: false };

export function boxReducer(state: BoxState, action: BoxAction): BoxState {
  if (action.type === "lockedClick") return { open: true, feature: action.feature };
  return BOX_CLOSED;
}

/** Promos only ever show on Free and Grow (PostStudio also on Premium,
 * which doesn't include it). */
export function promosFor(plan: Plan, feature: PromoFeature): boolean {
  if (plan === "multi") return false;
  if (plan === "premium") return feature === "postStudio";
  return !(plan === "grow" && featurePlan(feature) === "grow");
}

// ---------------------------------------------------------------------------
// The showcase strip at the bottom of the main pages.
// ---------------------------------------------------------------------------

export type StripAudience = "grow" | "premium" | "postStudio";

/** Free sees Grow (their next step) on the Overview and Growth, Premium
 * elsewhere; Grow sees Premium; Premium only a PostStudio line on the
 * Website page; Multi nothing. */
export function stripAudience(plan: Plan, page: ShowcasePage): StripAudience | null {
  if (plan === "multi") return null;
  if (isPremiumPlan(plan)) return page === "website" ? "postStudio" : null;
  if (plan === "free" && (page === "overview" || page === "growth")) return "grow";
  return "premium";
}

export interface Chip {
  key: MessageKey;
  soon: boolean;
}
const chip = (id: string, soon = false): Chip => ({ key: U(`chip.${id}`), soon });

const PREMIUM_CHIPS: Record<ShowcasePage, Chip[]> = {
  overview: [chip("doneForYou", true), chip("aiReplies", true), chip("postai"), chip("designs")],
  growth: [chip("doneForYou", true), chip("searchInsights", true), chip("postai"), chip("aiReplies", true)],
  campaigns: [chip("campaignHub"), chip("campaignChannels", true), chip("designs"), chip("postai")],
  reviews: [chip("aiReplies", true), chip("designs"), chip("postai"), chip("doneForYou", true)],
  website: [chip("postStudio", true), chip("doneForYou", true), chip("postai"), chip("searchInsights", true)],
  competitors: [chip("searchInsights", true), chip("doneForYou", true), chip("postai"), chip("aiReplies", true)],
  pricing: [chip("postai"), chip("searchInsights", true), chip("doneForYou", true), chip("campaignHub")],
  reports: [chip("pdfReports"), chip("searchInsights", true), chip("postai"), chip("doneForYou", true)],
};
const GROW_CHIPS: Chip[] = [chip("fixGuides"), chip("weeklyPlan"), chip("recheck"), chip("starterSite"), chip("printTools")];

export function stripChips(audience: StripAudience, page: ShowcasePage): Chip[] {
  if (audience === "grow") return GROW_CHIPS;
  if (audience === "premium") return PREMIUM_CHIPS[page];
  return [];
}

/** The 3 chips shown at a given step; they rotate one at a time. */
export function visibleChips(chips: Chip[], step: number, count = 3): Chip[] {
  if (chips.length <= count) return chips;
  return Array.from({ length: count }, (_, i) => chips[(step + i) % chips.length]);
}

// ---------------------------------------------------------------------------
// Hiding for 14 days (per user + business in the database when
// supabase/promo-dismissals.sql has been run; on this device otherwise).
// ---------------------------------------------------------------------------

export const PROMO_HIDE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function stripPromoKey(page: ShowcasePage): string {
  return `strip.${page}`;
}

export function isValidPromoKey(key: string): boolean {
  return SHOWCASE_PAGES.some((p) => stripPromoKey(p) === key);
}

export function hiddenUntilFrom(now: Date): string {
  return new Date(now.getTime() + PROMO_HIDE_DAYS * DAY_MS).toISOString();
}

export function isHidden(until: string | null | undefined, now: Date): boolean {
  if (!until) return false;
  const time = Date.parse(until);
  return Number.isFinite(time) && time > now.getTime();
}

export function promoStorageKey(businessId: string, key: string): string {
  return `postscore.promoHidden.${businessId}.${key}`;
}

/** This device's hide (never throws — private windows, blocked storage). */
export function readLocalHidden(businessId: string, key: string): string | null {
  try {
    return window.localStorage.getItem(promoStorageKey(businessId, key));
  } catch {
    return null;
  }
}

export function writeLocalHidden(businessId: string, key: string, until: string): void {
  try {
    window.localStorage.setItem(promoStorageKey(businessId, key), until);
  } catch {
    // Storage unavailable — the database copy (if any) still applies.
  }
}
