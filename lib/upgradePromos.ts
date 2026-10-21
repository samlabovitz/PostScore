// In-app upgrade promotion (Free and Grow only), kept helpful rather than
// pushy:
// - the promo box opens ONLY when the owner clicks something locked (or
//   "See what's included" on the strip) — never by itself;
// - the promo cards sit at the bottom of the main pages (Free: Grow and
//   Premium side by side; Grow: Premium), each hidden for 14 days on its
//   own, never on Premium or Multi (PostStudio has its own card on the
//   Website page), and never on the Free showrooms;
// - every number comes from the business's own data, and a line whose
//   data is missing is left out; anything not built says "Coming soon".
// Checkout doesn't exist: nothing here charges or pretends to — "See
// plans" opens Settings → Plan & billing → Compare plans. Pure.

import { t, type Locale, type MessageKey } from "./i18n";
import type { Plan } from "./plan";
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
  /** The review leader to beat (the shared reviewGoal), when they trail. */
  reviewLeader: { name: string; count: number } | null;
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
  reviewLeader: null,
};

const U = (s: string) => `dashboard.upgrade.${s}` as MessageKey;

// ---------------------------------------------------------------------------
// The Free "unlock" lines (saved for 5f) — each only when its data is real.
// ---------------------------------------------------------------------------

export type UnlockLineId = "missing" | "reviews" | "rank" | "website" | "plan" | "recheck" | "designs" | "hub" | "connect" | "postai" | "routine" | "tools" | "postStudio" | "referrals" | "reviewSign" | "websiteFixes" | "starterSite" | "priceCheck" | "priceTips" | "weeklyRecap" | "pdfReports" | "aiReplies" | "postaiUnlimited" | "reportsPremium" | "faq" | "campaignGuides" | "tracking";

export function unlockLine(id: UnlockLineId, f: PromoFacts, locale: Locale): string | null {
  switch (id) {
    case "missing":
      return f.missingIssue ? t(locale, U("unlock.missing"), { issue: t(locale, U(`missing.${f.missingIssue}`)) }) : null;
    case "reviews":
      // Only when there IS a leader to beat (the shared review goal).
      if (f.reviewCount === null || !f.reviewLeader || f.reviewCount >= f.reviewLeader.count) return null;
      return t(locale, U(f.reviewCount === 1 ? "unlock.reviewsGoalOne" : "unlock.reviewsGoal"), { n: f.reviewCount, name: f.reviewLeader.name, count: f.reviewLeader.count });
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
    case "postai":
    case "routine":
    case "tools":
    case "postStudio":
    case "referrals":
    case "reviewSign":
    case "websiteFixes":
    case "starterSite":
    case "priceCheck":
    case "priceTips":
    case "weeklyRecap":
    case "pdfReports":
    case "aiReplies":
    case "postaiUnlimited":
    case "reportsPremium":
    case "faq":
    case "campaignGuides":
    case "tracking":
      return t(locale, U(`unlock.${id}`));
  }
}

/** Growth's "Bigger projects" line, from its real counts: "{n} website
 * fixes worth about {pts} points…" (website work), else "{n} bigger
 * projects worth about {pts} points…"; null when there's nothing. */
export function projectsUnlockLine(count: number, points: number, website: boolean, locale: Locale): string | null {
  if (count <= 0 || points <= 0) return null;
  const pts = Math.round(points);
  if (website) return count === 1 ? t(locale, U("unlock.projectsWebsiteOne"), { points: pts }) : t(locale, U("unlock.projectsWebsite"), { count, points: pts });
  return count === 1 ? t(locale, U("unlock.projectsOne"), { points: pts }) : t(locale, U("unlock.projects"), { count, points: pts });
}

/** A basic listing field's check, when it is the kind of thing that can be
 * entirely missing. */
export const MISSING_BY_CHECK: Record<string, MissingIssue> = {
  "completeness.hours": "hours",
  "completeness.phone": "phone",
  "completeness.website_link": "website",
  "completeness.photos": "photos",
  "completeness.address": "address",
};

/** The unlock line that matches one failing check (real data only; null
 * when no line has data for it). */
export function issueUnlockLine(checkId: string, fullyMissing: boolean, f: PromoFacts, locale: Locale): string | null {
  const issue = MISSING_BY_CHECK[checkId];
  if (issue && fullyMissing) return t(locale, U("unlock.missing"), { issue: t(locale, U(`missing.${issue}`)) });
  if (checkId.startsWith("website.")) return unlockLine("website", f, locale) ?? unlockLine("recheck", f, locale);
  if (checkId.startsWith("visibility.review") || checkId === "visibility.rating") return unlockLine("reviews", f, locale) ?? unlockLine("plan", f, locale);
  return unlockLine("plan", f, locale);
}

// ---------------------------------------------------------------------------
// The promo box: what opens when a locked thing is clicked.
// ---------------------------------------------------------------------------

export type PromoFeature = "designs" | "print" | "reviewSign" | "googleProfile" | "campaignHub" | "postStudio" | "recheck" | "replies" | "premium" | "grow";

export interface PromoLine {
  text: string;
  soon: boolean;
}

/** One plan in the promo box: name, price, tagline, its key benefits. */
export interface PromoPlan {
  plan: "grow" | "premium";
  name: string;
  price: string;
  tagline: string;
  bullets: string[];
  /** Premium is always "Best value". */
  best: boolean;
  /** The plan the owner clicked (or the one the feature needs). */
  highlighted: boolean;
}

/** What the promo box shows: an optional feature header (a feature-specific
 * lock leads with its own title and benefit lines), then ALWAYS both plans
 * side by side — Grow and Premium — with the clicked plan highlighted. A
 * Premium-only feature lists Premium first, Grow after as the cheaper
 * option. Every lock in the app shows both plans. */
export interface PromoContent {
  /** The plan it needs (PostStudio is an add-on shown with Premium). */
  plan: "grow" | "premium";
  feature: { title: string; lines: PromoLine[] } | null;
  plans: PromoPlan[];
}

/** The key benefits shown per plan (4–5 each, from the plan copy). */
const BOX_BULLETS: Record<"grow" | "premium", string[]> = {
  grow: ["guides", "plan", "tools", "tracking", "postai"],
  premium: ["designs", "postai", "fixes", "replies", "channels"],
};

/** Which plan a feature needs. */
export function featurePlan(feature: PromoFeature): "grow" | "premium" {
  return feature === "print" || feature === "reviewSign" || feature === "recheck" || feature === "grow" ? "grow" : "premium";
}

function boxPlans(highlight: "grow" | "premium", locale: Locale): PromoPlan[] {
  const order: Array<"grow" | "premium"> = highlight === "premium" ? ["premium", "grow"] : ["grow", "premium"];
  return order.map((plan) => {
    const copy = PLAN_COPY[plan];
    return {
      plan,
      name: t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey),
      price: t(locale, copy.price),
      tagline: t(locale, copy.tagline),
      bullets: BOX_BULLETS[plan].map((id) => t(locale, `dashboard.settings.plans.bullet.${plan}.${id}` as MessageKey)),
      best: plan === "premium",
      highlighted: plan === highlight,
    };
  });
}

/** Premium-only features: their Grow button reads "Not included in Grow".
 * (PostStudio is an add-on on both plans.) */
export function premiumOnly(feature: PromoFeature): boolean {
  return featurePlan(feature) === "premium" && feature !== "postStudio";
}

export function promoContent(feature: PromoFeature, f: PromoFacts, locale: Locale, highlight?: "grow" | "premium"): PromoContent {
  const plan = highlight ?? featurePlan(feature);
  const planName = t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey);
  const line = (key: MessageKey, soon = false): PromoLine => ({ text: t(locale, key), soon });
  const fact = (id: UnlockLineId): PromoLine[] => {
    const text = unlockLine(id, f, locale);
    return text ? [{ text, soon: false }] : [];
  };
  const named = (id: string, lines: PromoLine[]): PromoContent => ({
    plan,
    feature: { title: t(locale, U("box.title"), { feature: t(locale, U(`feature.${id}.name`)), plan: planName }), lines },
    plans: boxPlans(plan, locale),
  });
  switch (feature) {
    case "designs":
      return named("designs", [line(U("feature.designs.b1")), line(U("feature.designs.b2")), line(U("feature.designs.b3"))]);
    case "print":
      return named("print", [line(U("unlock.designs")), line(U("feature.print.b2"))]);
    case "reviewSign":
      return named("reviewSign", [...fact("reviews"), line(U("feature.reviewSign.b1")), line(U("feature.reviewSign.b2"))].slice(0, 3));
    case "recheck":
      return named("recheck", [...fact("website"), line(U("unlock.recheck"))]);
    case "googleProfile":
      return named("googleProfile", [line(U("feature.googleProfile.b1"), true), line(U("feature.googleProfile.b2"), true), line(U("feature.googleProfile.b3"), true)]);
    case "campaignHub":
      // Email, text and social campaigns — Premium, not built yet.
      return named("campaignHub", [line(U("feature.campaignHub.b1"), true), line(U("feature.campaignHub.b2"), true)]);
    case "replies":
      // After the 3 free AI review reply drafts: Premium is unlimited;
      // seeing every unanswered review and posting need Google connect.
      return named("replies", [line(U("feature.replies.b1")), line(U("feature.replies.b2"), true)]);
    case "postStudio":
      return { plan, feature: { title: t(locale, U("feature.postStudio.name")), lines: [line(U("feature.postStudio.b1"), true), line(U("feature.postStudio.b2"))] }, plans: boxPlans("premium", locale) };
    case "premium":
    case "grow": {
      // A plain "Unlock with Grow/Premium": both plans; Grow leads with up
      // to two of the business's own real gaps above them.
      const facts = plan === "grow" ? (["missing", "rank", "reviews", "website"] as UnlockLineId[]).flatMap(fact).slice(0, 2) : [];
      return { plan, feature: facts.length > 0 ? { title: t(locale, U("box.plansHeading")), lines: facts } : null, plans: boxPlans(plan, locale) };
    }
  }
}

/** The box opens only on a click on something locked (or "See what's
 * included"), and closes with ×, "Not now", Esc or a tap outside. */
export type BoxState = { open: false } | { open: true; feature: PromoFeature; highlight?: "grow" | "premium" };
export type BoxAction = { type: "lockedClick"; feature: PromoFeature; highlight?: "grow" | "premium" } | { type: "close"; reason: "x" | "notNow" | "esc" | "outside" };
export const BOX_CLOSED: BoxState = { open: false };

export function boxReducer(state: BoxState, action: BoxAction): BoxState {
  if (action.type === "lockedClick") return action.highlight ? { open: true, feature: action.feature, highlight: action.highlight } : { open: true, feature: action.feature };
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
// The promo cards at the bottom of the main pages.
// ---------------------------------------------------------------------------

export type PromoCardKind = "grow" | "premium";

/** Free: Grow AND Premium (Premium always shown, "Best value"); Grow: the
 * Premium card; Premium and Multi: nothing (on the Website page PostStudio
 * has its own card in path B — one mention). The same on every page. */
export function promoCardsFor(plan: Plan): PromoCardKind[] {
  if (plan === "multi" || plan === "premium") return [];
  if (plan === "grow") return ["premium"];
  return ["grow", "premium"];
}

export interface Chip {
  key: MessageKey;
  soon: boolean;
}
const chip = (id: string, soon = false): Chip => ({ key: U(`chip.${id}`), soon });

const PREMIUM_CHIPS: Record<ShowcasePage, Chip[]> = {
  overview: [chip("doneForYou", true), chip("aiReplies", true), chip("postai"), chip("designs")],
  growth: [chip("doneForYou", true), chip("searchInsights", true), chip("postai"), chip("aiReplies", true)],
  campaigns: [chip("campaignChannels", true), chip("designs"), chip("postai"), chip("doneForYou", true)],
  reviews: [chip("aiReplies", true), chip("designs"), chip("postai"), chip("doneForYou", true)],
  website: [chip("postStudio", true), chip("doneForYou", true), chip("postai"), chip("searchInsights", true)],
  competitors: [chip("searchInsights", true), chip("doneForYou", true), chip("postai"), chip("aiReplies", true)],
  pricing: [chip("postai"), chip("searchInsights", true), chip("doneForYou", true), chip("campaignChannels", true)],
  reports: [chip("pdfReports"), chip("searchInsights", true), chip("postai"), chip("doneForYou", true)],
};
const GROW_CHIPS: Record<ShowcasePage, Chip[]> = {
  overview: [chip("fixGuides"), chip("weeklyPlan"), chip("recheck"), chip("starterSite")],
  growth: [chip("weeklyPlan"), chip("fixGuides"), chip("recheck"), chip("printTools")],
  campaigns: [chip("couponsBasic"), chip("trackAll"), chip("printTools"), chip("weeklyPlan")],
  reviews: [chip("reviewSign"), chip("reviewPlan"), chip("weeklyPlan"), chip("fixGuides")],
  website: [chip("starterSite"), chip("recheck"), chip("fixGuides"), chip("weeklyPlan")],
  competitors: [chip("rankPlan"), chip("fixGuides"), chip("weeklyPlan"), chip("reviewPlan")],
  pricing: [chip("priceCheck"), chip("weeklyPlan"), chip("fixGuides"), chip("couponsBasic")],
  reports: [chip("reportsWeekly"), chip("weeklyPlan"), chip("fixGuides"), chip("recheck")],
};

/** A card's chips for this page (Grow or Premium; PostStudio has none). */
export function cardChips(kind: PromoCardKind, page: ShowcasePage, plan: Plan | null = null): Chip[] {
  if (kind === "grow") return GROW_CHIPS[page];
  // Free's Website page already has its one PostStudio card — no chip too.
  if (kind === "premium") return plan === "free" && page === "website" ? PREMIUM_CHIPS[page].filter((c) => !c.key.endsWith(".postStudio")) : PREMIUM_CHIPS[page];
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

const CARD_KINDS: PromoCardKind[] = ["grow", "premium"];

/** Each card is hidden on its own, per page: "card.grow.overview". */
export function cardPromoKey(kind: PromoCardKind, page: ShowcasePage): string {
  return `card.${kind}.${page}`;
}

export function isValidPromoKey(key: string): boolean {
  return SHOWCASE_PAGES.some((page) => CARD_KINDS.some((kind) => cardPromoKey(kind, page) === key));
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
