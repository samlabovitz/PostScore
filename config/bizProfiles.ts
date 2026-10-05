// Business-type profiles: the one config that lets the whole app adapt
// its copy and presets to what kind of business this actually is,
// without any per-type branching in UI code. Adding a new vertical is
// meant to be exactly one new entry in BIZ_PROFILES below — never a
// change to a page or component.
//
// This module is pure content + a resolver. It never touches scoring —
// lib/scoring.ts has no idea business profiles exist, and nothing here
// changes a check, a point value, or a grade. It only decides which
// copy (competitor noun, coupon/offer presets, growth ideas, FAQ) and
// which features (like referrals) apply to a given business.
//
// Step L8 (beat 1): every user-facing string below is authored as an
// i18n MessageKey (see lib/i18n/messages.ts's bizProfiles.*/
// bizProfileOptions.* namespace), not literal English — see
// BizProfileSource and localizeBizProfile() further down for how a
// source profile becomes a real, localized BizProfile. The public
// interfaces immediately below (BizProfile, CouponPreset, etc.) are
// deliberately UNCHANGED from before this beat: they describe what a
// caller of bizProfile()/resolveBizProfile()/bizProfileById() gets back
// — real, resolved text — never the authoring-time key shape, so no
// consumer elsewhere in the app needs to change.

import { DEFAULT_LOCALE, t, type Locale, type MessageKey } from "@/lib/i18n";

export interface CouponPreset {
  id: string;
  /** What the coupon says, e.g. "10% off your next appointment". */
  label: string;
  /** When/why an owner would use this one. */
  description: string;
}

export interface OfferTemplate {
  id: string;
  label: string;
  description: string;
}

/**
 * Ready-to-use offer copy for the three marketing angles the coupon
 * builder always offers (Growth → Coupons). The ANGLES themselves are
 * universal marketing strategy (get someone in the door the first
 * time; ride a calendar moment; fill an empty slot) — what has to be
 * type-tailored is the STRUCTURE of the offer behind each one, exactly
 * like couponPresets/offerTemplates above. Hand-written per profile so
 * "Use this offer" always pre-fills something that actually fits how
 * this kind of business makes money, never a generic string reused
 * across verticals.
 */
export interface CouponAngles {
  /** The lowest-risk offer to get a first-time customer in the door. */
  firstTime: string;
  /** An offer tied to a calendar moment (a season, a holiday, an event). */
  seasonal: string;
  /** An offer aimed at the business's own quiet hours/days. */
  slowDay: string;
}

/**
 * A referral reward structure, hand-written per profile exactly like
 * CouponPreset — the reward has to fit how this kind of business makes
 * money (a salon can afford a service discount; a restaurant can
 * afford a free item; retail can afford a flat credit), so it's never
 * generated or shared across verticals.
 */
export interface ReferralPreset {
  id: string;
  /** What the person doing the referring gets, e.g. "$15 off your next visit". */
  referrerReward: string;
  /** What the new customer they refer gets, e.g. "20% off their first visit". */
  friendReward: string;
  /** When/why an owner would use this one — same purpose as CouponPreset.description. */
  description: string;
}

export interface FaqEntry {
  /** May contain {businessName} / {city} tokens — see renderFaq(). */
  question: string;
  answer: string;
}

/** A single curated pricing-strategy tip for the Pricing page's "Pricing
 * tips for [type]" section. Static, hand-written content — no API call,
 * no invented numbers, just genuine small-business pricing strategy
 * (anchoring, tiering, when to raise prices) tailored to how this kind
 * of business actually sells. */
export interface PricingTip {
  id: string;
  /** Short strategy name, e.g. "Anchor with your premium option". */
  label: string;
  /** 1-2 sentences of concrete, type-specific guidance. */
  description: string;
}

export interface BizProfile {
  id: string;
  /** Human-readable name for this profile, shown nowhere critical — just for our own clarity. */
  label: string;
  /**
   * Keywords matched case-insensitively against the business's Google
   * category (display name) and primary type (machine slug). The first
   * profile in BIZ_PROFILES whose match list hits wins — order matters.
   */
  match: string[];
  /**
   * Representative Google Places type slugs for this vertical. Informational
   * metadata describing the profile, not a rewiring of lib/competitors.ts's
   * own (already real-data-driven) nearby-search matching.
   */
  placesType: string[];
  /** The word used in place of generic "businesses" — e.g. "salons", "restaurants", "firms". */
  competitorNoun: string;
  /**
   * CRITICAL: these differ in structure per vertical, not just wording —
   * a coupon only makes sense if it matches how the business actually
   * makes money. Appointment businesses discount the next visit;
   * transactional retail discounts a purchase; restaurants give an item
   * or a percentage off an order; trades discount a service call.
   */
  couponPresets: CouponPreset[];
  offerTemplates: OfferTemplate[];
  /** See CouponAngles. */
  couponAngles: CouponAngles;
  faq: FaqEntry[];
  /**
   * False hides the referral segment entirely. Concretely false today
   * for "lawyer": many bar associations' ethics rules restrict giving
   * anything of value in exchange for referring clients (e.g. ABA Model
   * Rule 7.2), so PostScore doesn't suggest a referral incentive for
   * that vertical. True everywhere else a referral program is just a
   * normal, unrestricted marketing tactic.
   */
  referralOk: boolean;
  /**
   * Ready-made referrer/friend reward pairs for the Refer a friend
   * builder — always populated when referralOk is true, always empty
   * when it's false (the referral segment never mounts in that case,
   * so there's nothing to populate it with).
   */
  referralPresets: ReferralPreset[];
  /**
   * Type-appropriate example service names for the Pricing page's
   * "Your services & prices" table (e.g. "Entrée" for a restaurant,
   * "Service Call" for a general/trades business) — placeholder text
   * only, never a real price, never sent as data to the AI assessment.
   */
  pricingExamples: string[];
  /** See PricingTip. Always at least 2 entries. */
  pricingTips: PricingTip[];
}


// ---------------------------------------------------------------------------
// Authoring-time "source" shapes — internal only, never exported, never
// seen outside this module. Every text field here holds an i18n
// MessageKey; pricingExamples/faq additionally carry a
// stable `id` per item (this beat's one real restructure) so each array
// item can be its own translatable key exactly like couponPresets/
// offerTemplates/referralPresets/pricingTips already were. See
// localizeBizProfile() below for the one place a BizProfileSource turns
// into the real, resolved BizProfile every other module already knows.
// ---------------------------------------------------------------------------

interface KeyedLabelDescriptionSource {
  id: string;
  label: MessageKey;
  description: MessageKey;
}

interface ReferralPresetSource {
  id: string;
  referrerReward: MessageKey;
  friendReward: MessageKey;
  description: MessageKey;
}

interface CouponAnglesSource {
  firstTime: MessageKey;
  seasonal: MessageKey;
  slowDay: MessageKey;
}

interface PricingExampleSource {
  id: string;
  text: MessageKey;
}

interface FaqEntrySource {
  id: string;
  /** May contain {businessName} / {city} tokens, same as FaqEntry.question
   * — resolved to real text by localizeBizProfile() first, then those
   * tokens are substituted afterward, at render time, by renderFaq(). */
  question: MessageKey;
  answer: MessageKey;
}

interface BizProfileSource {
  id: string;
  label: MessageKey;
  match: string[];
  placesType: string[];
  competitorNoun: MessageKey;
  couponPresets: KeyedLabelDescriptionSource[];
  offerTemplates: KeyedLabelDescriptionSource[];
  couponAngles: CouponAnglesSource;
  faq: FaqEntrySource[];
  referralOk: boolean;
  referralPresets: ReferralPresetSource[];
  pricingExamples: PricingExampleSource[];
  pricingTips: KeyedLabelDescriptionSource[];
}

/**
 * The one place a BizProfileSource's i18n keys become real, localized
 * text — called by bizProfile()/bizProfileById() (and so, transitively,
 * resolveBizProfile()) right before returning. pricingExamples
 * deliberately flattens back to plain string[] here (its per-item `id`
 * was only ever needed to give each one a stable translation key — no
 * consumer reads it), same reasoning as faq's `id` being dropped:
 * FaqEntry stays exactly {question, answer}, matching the shape
 * renderFaq() and every caller already expects.
 */
function localizeBizProfile(source: BizProfileSource, locale: Locale): BizProfile {
  return {
    id: source.id,
    label: t(locale, source.label),
    match: source.match,
    placesType: source.placesType,
    competitorNoun: t(locale, source.competitorNoun),
    couponPresets: source.couponPresets.map((p) => ({
      id: p.id,
      label: t(locale, p.label),
      description: t(locale, p.description),
    })),
    offerTemplates: source.offerTemplates.map((o) => ({
      id: o.id,
      label: t(locale, o.label),
      description: t(locale, o.description),
    })),
    couponAngles: {
      firstTime: t(locale, source.couponAngles.firstTime),
      seasonal: t(locale, source.couponAngles.seasonal),
      slowDay: t(locale, source.couponAngles.slowDay),
    },
    faq: source.faq.map((f) => ({
      question: t(locale, f.question),
      answer: t(locale, f.answer),
    })),
    referralOk: source.referralOk,
    referralPresets: source.referralPresets.map((r) => ({
      id: r.id,
      referrerReward: t(locale, r.referrerReward),
      friendReward: t(locale, r.friendReward),
      description: t(locale, r.description),
    })),
    pricingExamples: source.pricingExamples.map((p) => t(locale, p.text)),
    pricingTips: source.pricingTips.map((p) => ({
      id: p.id,
      label: t(locale, p.label),
      description: t(locale, p.description),
    })),
  };
}
const SALON_PROFILE: BizProfileSource = {
  id: "salon",
  label: "bizProfiles.salon.label",
  match: [
    "salon",
    "hair",
    "barber",
    "spa",
    "beauty",
    "nail",
    "lash",
    "brow",
    "tanning",
    "massage",
  ],
  placesType: ["hair_salon", "beauty_salon", "nail_salon", "barber_shop", "spa", "day_spa"],
  competitorNoun: "bizProfiles.salon.competitorNoun",
  couponPresets: [
    {
      id: "pct_off_next_appt",
      label: "bizProfiles.salon.couponPresets.pct_off_next_appt.label",
      description: "bizProfiles.salon.couponPresets.pct_off_next_appt.description",
    },
    {
      id: "flat_off_rebook",
      label: "bizProfiles.salon.couponPresets.flat_off_rebook.label",
      description: "bizProfiles.salon.couponPresets.flat_off_rebook.description",
    },
    {
      id: "bring_a_friend",
      label: "bizProfiles.salon.couponPresets.bring_a_friend.label",
      description: "bizProfiles.salon.couponPresets.bring_a_friend.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_special",
      label: "bizProfiles.salon.offerTemplates.new_client_special.label",
      description: "bizProfiles.salon.offerTemplates.new_client_special.description",
    },
    {
      id: "referral_credit",
      label: "bizProfiles.salon.offerTemplates.referral_credit.label",
      description: "bizProfiles.salon.offerTemplates.referral_credit.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.salon.couponAngles.firstTime",
    seasonal: "bizProfiles.salon.couponAngles.seasonal",
    slowDay: "bizProfiles.salon.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.salon.faq.item1.question",
      answer: "bizProfiles.salon.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.salon.faq.item2.question",
      answer: "bizProfiles.salon.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.salon.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.salon.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.salon.referralPresets.pct_off_both.description",
    },
    {
      id: "free_addon",
      referrerReward: "bizProfiles.salon.referralPresets.free_addon.referrerReward",
      friendReward: "bizProfiles.salon.referralPresets.free_addon.friendReward",
      description: "bizProfiles.salon.referralPresets.free_addon.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.salon.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.salon.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.salon.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "anchor_premium",
      label: "bizProfiles.salon.pricingTips.anchor_premium.label",
      description: "bizProfiles.salon.pricingTips.anchor_premium.description",
    },
    {
      id: "consult_price_chemical",
      label: "bizProfiles.salon.pricingTips.consult_price_chemical.label",
      description: "bizProfiles.salon.pricingTips.consult_price_chemical.description",
    },
    {
      id: "good_better_best",
      label: "bizProfiles.salon.pricingTips.good_better_best.label",
      description: "bizProfiles.salon.pricingTips.good_better_best.description",
    },
    {
      id: "raise_when_booked_out",
      label: "bizProfiles.salon.pricingTips.raise_when_booked_out.label",
      description: "bizProfiles.salon.pricingTips.raise_when_booked_out.description",
    },
  ],
};

const RESTAURANT_PROFILE: BizProfileSource = {
  id: "restaurant",
  label: "bizProfiles.restaurant.label",
  match: [
    "restaurant",
    "cafe",
    "coffee",
    "bakery",
    "pizza",
    "bar",
    "diner",
    "burger",
    "taco",
    "sushi",
    "deli",
    "food",
  ],
  placesType: ["restaurant", "cafe", "bakery", "bar", "meal_takeaway"],
  competitorNoun: "bizProfiles.restaurant.competitorNoun",
  couponPresets: [
    {
      id: "free_item_with_purchase",
      label: "bizProfiles.restaurant.couponPresets.free_item_with_purchase.label",
      description: "bizProfiles.restaurant.couponPresets.free_item_with_purchase.description",
    },
    {
      id: "pct_off_pickup",
      label: "bizProfiles.restaurant.couponPresets.pct_off_pickup.label",
      description: "bizProfiles.restaurant.couponPresets.pct_off_pickup.description",
    },
    {
      id: "bogo_entree",
      label: "bizProfiles.restaurant.couponPresets.bogo_entree.label",
      description: "bizProfiles.restaurant.couponPresets.bogo_entree.description",
    },
  ],
  offerTemplates: [
    {
      id: "happy_hour",
      label: "bizProfiles.restaurant.offerTemplates.happy_hour.label",
      description: "bizProfiles.restaurant.offerTemplates.happy_hour.description",
    },
    {
      id: "first_online_order",
      label: "bizProfiles.restaurant.offerTemplates.first_online_order.label",
      description: "bizProfiles.restaurant.offerTemplates.first_online_order.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.restaurant.couponAngles.firstTime",
    seasonal: "bizProfiles.restaurant.couponAngles.seasonal",
    slowDay: "bizProfiles.restaurant.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.restaurant.faq.item1.question",
      answer: "bizProfiles.restaurant.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.restaurant.faq.item2.question",
      answer: "bizProfiles.restaurant.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_item_both",
      referrerReward: "bizProfiles.restaurant.referralPresets.free_item_both.referrerReward",
      friendReward: "bizProfiles.restaurant.referralPresets.free_item_both.friendReward",
      description: "bizProfiles.restaurant.referralPresets.free_item_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.restaurant.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.restaurant.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.restaurant.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.restaurant.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.restaurant.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.restaurant.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "anchor_standout_dish",
      label: "bizProfiles.restaurant.pricingTips.anchor_standout_dish.label",
      description: "bizProfiles.restaurant.pricingTips.anchor_standout_dish.description",
    },
    {
      id: "steer_to_margin",
      label: "bizProfiles.restaurant.pricingTips.steer_to_margin.label",
      description: "bizProfiles.restaurant.pricingTips.steer_to_margin.description",
    },
    {
      id: "review_prices_periodically",
      label: "bizProfiles.restaurant.pricingTips.review_prices_periodically.label",
      description: "bizProfiles.restaurant.pricingTips.review_prices_periodically.description",
    },
    {
      id: "bundle_combo",
      label: "bizProfiles.restaurant.pricingTips.bundle_combo.label",
      description: "bizProfiles.restaurant.pricingTips.bundle_combo.description",
    },
  ],
};

/**
 * Purchase-based alcohol retail — bottles/cases sold to take away, not
 * food served to eat in. Deliberately separate from RESTAURANT_PROFILE:
 * a liquor store has no entrées, no appetizers, no dine-in service, so
 * "free dessert with your entrée" is meaningless here — every offer is
 * built around the bottle/case as the unit of purchase instead.
 */
const LIQUOR_WINE_PROFILE: BizProfileSource = {
  id: "liquor_wine",
  label: "bizProfiles.liquor_wine.label",
  match: ["liquor", "wine shop", "spirits", "package store", "beer store"],
  placesType: ["liquor_store"],
  competitorNoun: "bizProfiles.liquor_wine.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_purchase",
      label: "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.label",
      description: "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.description",
    },
    {
      id: "bottle_bogo_pct",
      label: "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.label",
      description: "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.description",
    },
    {
      id: "case_discount",
      label: "bizProfiles.liquor_wine.couponPresets.case_discount.label",
      description: "bizProfiles.liquor_wine.couponPresets.case_discount.description",
    },
  ],
  offerTemplates: [
    {
      id: "featured_bottle_month",
      label: "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.label",
      description: "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.description",
    },
    {
      id: "new_customer_pct",
      label: "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.label",
      description: "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.liquor_wine.couponAngles.firstTime",
    seasonal: "bizProfiles.liquor_wine.couponAngles.seasonal",
    slowDay: "bizProfiles.liquor_wine.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.liquor_wine.faq.item1.question",
      answer: "bizProfiles.liquor_wine.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.liquor_wine.faq.item2.question",
      answer: "bizProfiles.liquor_wine.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "bizProfiles.liquor_wine.referralPresets.credit_both.referrerReward",
      friendReward: "bizProfiles.liquor_wine.referralPresets.credit_both.friendReward",
      description: "bizProfiles.liquor_wine.referralPresets.credit_both.description",
    },
    {
      id: "case_discount_referral",
      referrerReward: "bizProfiles.liquor_wine.referralPresets.case_discount_referral.referrerReward",
      friendReward: "bizProfiles.liquor_wine.referralPresets.case_discount_referral.friendReward",
      description: "bizProfiles.liquor_wine.referralPresets.case_discount_referral.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.liquor_wine.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.liquor_wine.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.liquor_wine.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "loss_leader_traffic",
      label: "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.label",
      description: "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.description",
    },
    {
      id: "case_bulk_discount",
      label: "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.label",
      description: "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.description",
    },
    {
      id: "feature_margin_bottles",
      label: "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.label",
      description: "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.description",
    },
    {
      id: "seasonal_pricing",
      label: "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.label",
      description: "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.description",
    },
  ],
};

/**
 * Basket-based grocery/convenience retail — repeat, high-frequency
 * purchases of everyday items, not a single big-ticket sale. Distinct
 * from both LIQUOR_WINE_PROFILE (single-category, less frequent) and
 * RESTAURANT_PROFILE (no prepared entrées here) — the offer structure
 * revolves around basket size and shopping frequency instead.
 */
const GROCERY_MARKET_PROFILE: BizProfileSource = {
  id: "grocery_market",
  label: "bizProfiles.grocery_market.label",
  match: ["grocery", "supermarket", "convenience store", "mini mart", "corner store"],
  placesType: ["grocery_store", "supermarket", "convenience_store"],
  competitorNoun: "bizProfiles.grocery_market.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_basket",
      label: "bizProfiles.grocery_market.couponPresets.flat_off_basket.label",
      description: "bizProfiles.grocery_market.couponPresets.flat_off_basket.description",
    },
    {
      id: "weekly_special",
      label: "bizProfiles.grocery_market.couponPresets.weekly_special.label",
      description: "bizProfiles.grocery_market.couponPresets.weekly_special.description",
    },
    {
      id: "loyalty_repeat",
      label: "bizProfiles.grocery_market.couponPresets.loyalty_repeat.label",
      description: "bizProfiles.grocery_market.couponPresets.loyalty_repeat.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_shopper_special",
      label: "bizProfiles.grocery_market.offerTemplates.new_shopper_special.label",
      description: "bizProfiles.grocery_market.offerTemplates.new_shopper_special.description",
    },
    {
      id: "seasonal_produce_sale",
      label: "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.label",
      description: "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.grocery_market.couponAngles.firstTime",
    seasonal: "bizProfiles.grocery_market.couponAngles.seasonal",
    slowDay: "bizProfiles.grocery_market.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.grocery_market.faq.item1.question",
      answer: "bizProfiles.grocery_market.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.grocery_market.faq.item2.question",
      answer: "bizProfiles.grocery_market.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "bizProfiles.grocery_market.referralPresets.credit_both.referrerReward",
      friendReward: "bizProfiles.grocery_market.referralPresets.credit_both.friendReward",
      description: "bizProfiles.grocery_market.referralPresets.credit_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.grocery_market.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.grocery_market.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.grocery_market.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.grocery_market.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.grocery_market.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.grocery_market.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "loss_leader_weekly_specials",
      label: "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.label",
      description: "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.description",
    },
    {
      id: "bulk_case_pricing",
      label: "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.label",
      description: "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.description",
    },
    {
      id: "seasonal_produce_pricing",
      label: "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.label",
      description: "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.description",
    },
    {
      id: "loyalty_raises_frequency",
      label: "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.label",
      description: "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.description",
    },
  ],
};

/**
 * Counter-service coffee/baked-goods retail — sold by the item or drink,
 * not the entrée. Split out from RESTAURANT_PROFILE because a café or
 * bakery genuinely has no entrée to build an "appetizer or dessert with
 * your entrée" offer around; the unit here is the drink or the pastry.
 */
const CAFE_BAKERY_PROFILE: BizProfileSource = {
  id: "cafe_bakery",
  label: "bizProfiles.cafe_bakery.label",
  match: ["cafe", "café", "coffee", "espresso", "bakery", "patisserie", "bakeshop"],
  placesType: ["cafe", "coffee_shop", "bakery"],
  competitorNoun: "bizProfiles.cafe_bakery.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_order",
      label: "bizProfiles.cafe_bakery.couponPresets.flat_off_order.label",
      description: "bizProfiles.cafe_bakery.couponPresets.flat_off_order.description",
    },
    {
      id: "free_item_with_purchase",
      label: "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.label",
      description: "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.description",
    },
    {
      id: "loyalty_punch",
      label: "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.label",
      description: "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.description",
    },
  ],
  offerTemplates: [
    {
      id: "first_visit_special",
      label: "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.label",
      description: "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.description",
    },
    {
      id: "morning_slow_hours",
      label: "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.label",
      description: "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.cafe_bakery.couponAngles.firstTime",
    seasonal: "bizProfiles.cafe_bakery.couponAngles.seasonal",
    slowDay: "bizProfiles.cafe_bakery.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.cafe_bakery.faq.item1.question",
      answer: "bizProfiles.cafe_bakery.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.cafe_bakery.faq.item2.question",
      answer: "bizProfiles.cafe_bakery.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_item_both",
      referrerReward: "bizProfiles.cafe_bakery.referralPresets.free_item_both.referrerReward",
      friendReward: "bizProfiles.cafe_bakery.referralPresets.free_item_both.friendReward",
      description: "bizProfiles.cafe_bakery.referralPresets.free_item_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.cafe_bakery.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.cafe_bakery.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.cafe_bakery.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.cafe_bakery.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.cafe_bakery.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.cafe_bakery.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "anchor_specialty_drink",
      label: "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.label",
      description: "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.description",
    },
    {
      id: "bundle_combo",
      label: "bizProfiles.cafe_bakery.pricingTips.bundle_combo.label",
      description: "bizProfiles.cafe_bakery.pricingTips.bundle_combo.description",
    },
    {
      id: "review_ingredient_costs",
      label: "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.label",
      description: "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.description",
    },
    {
      id: "loyalty_over_discount",
      label: "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.label",
      description: "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.description",
    },
  ],
};

const LAWYER_PROFILE: BizProfileSource = {
  id: "lawyer",
  label: "bizProfiles.lawyer.label",
  match: ["lawyer", "attorney", "law firm", "law office", "legal services", "legal"],
  placesType: ["lawyer", "legal_services"],
  competitorNoun: "bizProfiles.lawyer.competitorNoun",
  couponPresets: [
    {
      id: "free_consultation",
      label: "bizProfiles.lawyer.couponPresets.free_consultation.label",
      description: "bizProfiles.lawyer.couponPresets.free_consultation.description",
    },
    {
      id: "flat_fee_review",
      label: "bizProfiles.lawyer.couponPresets.flat_fee_review.label",
      description: "bizProfiles.lawyer.couponPresets.flat_fee_review.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_doc_review",
      label: "bizProfiles.lawyer.offerTemplates.new_client_doc_review.label",
      description: "bizProfiles.lawyer.offerTemplates.new_client_doc_review.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.lawyer.couponAngles.firstTime",
    seasonal: "bizProfiles.lawyer.couponAngles.seasonal",
    slowDay: "bizProfiles.lawyer.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.lawyer.faq.item1.question",
      answer: "bizProfiles.lawyer.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.lawyer.faq.item2.question",
      answer: "bizProfiles.lawyer.faq.item2.answer",
    },
  ],
  // See the field's own doc comment above: referral fee arrangements are
  // restricted for attorneys under most states' rules of professional
  // conduct, so PostScore doesn't suggest one here. Empty rather than
  // omitted so the field stays required across every profile — this
  // array is simply never read, since the referral segment never
  // mounts when referralOk is false.
  referralOk: false,
  referralPresets: [],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.lawyer.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.lawyer.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.lawyer.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "flat_fee_commodity_work",
      label: "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.label",
      description: "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.description",
    },
    {
      id: "tiered_consultation",
      label: "bizProfiles.lawyer.pricingTips.tiered_consultation.label",
      description: "bizProfiles.lawyer.pricingTips.tiered_consultation.description",
    },
    {
      id: "raise_when_turning_away_work",
      label: "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.label",
      description: "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.description",
    },
    {
      id: "scope_in_writing",
      label: "bizProfiles.lawyer.pricingTips.scope_in_writing.label",
      description: "bizProfiles.lawyer.pricingTips.scope_in_writing.description",
    },
  ],
};

/**
 * Advisory professional services billed by engagement or return, not by
 * visit or session — accounting, tax, and bookkeeping. Shares LAWYER_
 * PROFILE's consultation/flat-fee offer structure (the right shape for
 * this kind of work) but is its own profile rather than reusing that one
 * directly: unlike attorney referral-fee ethics rules (see referralOk on
 * LAWYER_PROFILE), accounting has no comparable blanket restriction on a
 * simple client referral discount, so referrals stay on here.
 */
const PROFESSIONAL_SERVICES_PROFILE: BizProfileSource = {
  id: "professional_services",
  label: "bizProfiles.professional_services.label",
  match: ["accountant", "accounting", "cpa", "tax service", "bookkeeping"],
  placesType: ["accounting"],
  competitorNoun: "bizProfiles.professional_services.competitorNoun",
  couponPresets: [
    {
      id: "free_consultation",
      label: "bizProfiles.professional_services.couponPresets.free_consultation.label",
      description: "bizProfiles.professional_services.couponPresets.free_consultation.description",
    },
    {
      id: "flat_fee_package",
      label: "bizProfiles.professional_services.couponPresets.flat_fee_package.label",
      description: "bizProfiles.professional_services.couponPresets.flat_fee_package.description",
    },
    {
      id: "new_client_pct",
      label: "bizProfiles.professional_services.couponPresets.new_client_pct.label",
      description: "bizProfiles.professional_services.couponPresets.new_client_pct.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_return_discount",
      label: "bizProfiles.professional_services.offerTemplates.new_client_return_discount.label",
      description: "bizProfiles.professional_services.offerTemplates.new_client_return_discount.description",
    },
    {
      id: "bundle_bookkeeping_tax",
      label: "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.label",
      description: "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.professional_services.couponAngles.firstTime",
    seasonal: "bizProfiles.professional_services.couponAngles.seasonal",
    slowDay: "bizProfiles.professional_services.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.professional_services.faq.item1.question",
      answer: "bizProfiles.professional_services.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.professional_services.faq.item2.question",
      answer: "bizProfiles.professional_services.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "bizProfiles.professional_services.referralPresets.credit_both.referrerReward",
      friendReward: "bizProfiles.professional_services.referralPresets.credit_both.friendReward",
      description: "bizProfiles.professional_services.referralPresets.credit_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.professional_services.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.professional_services.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.professional_services.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.professional_services.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.professional_services.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.professional_services.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "flat_fee_commodity_work",
      label: "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.label",
      description: "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.description",
    },
    {
      id: "tiered_by_complexity",
      label: "bizProfiles.professional_services.pricingTips.tiered_by_complexity.label",
      description: "bizProfiles.professional_services.pricingTips.tiered_by_complexity.description",
    },
    {
      id: "retainer_for_ongoing",
      label: "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.label",
      description: "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.description",
    },
    {
      id: "raise_when_turning_away_work",
      label: "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.label",
      description: "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.description",
    },
  ],
};

/**
 * Appointment- or class-based service providers who often have no
 * storefront, menu, products, or single fixed address to point to:
 * consultants, coaches, yoga/pilates/fitness instructors, tutors,
 * therapists and counselors, studios. This profile is the proof that a
 * business with none of those "physical" signals still gets a real,
 * useful plan — see bizProfile() and the Day 8 test notes.
 */
const PRACTITIONER_PROFILE: BizProfileSource = {
  id: "practitioner",
  label: "bizProfiles.practitioner.label",
  match: [
    "consultant",
    "consulting",
    "coach",
    "coaching",
    "tutor",
    "tutoring",
    "therapist",
    "therapy",
    "counselor",
    "counseling",
    "personal trainer",
    "fitness instructor",
    "yoga studio",
    "pilates studio",
    "dance studio",
    "training studio",
    "music lessons",
    "driving school",
  ],
  placesType: ["consultant", "tutoring_service", "yoga_studio"],
  competitorNoun: "bizProfiles.practitioner.competitorNoun",
  couponPresets: [
    {
      id: "pct_off_next_session",
      label: "bizProfiles.practitioner.couponPresets.pct_off_next_session.label",
      description: "bizProfiles.practitioner.couponPresets.pct_off_next_session.description",
    },
    {
      id: "free_intro_consult",
      label: "bizProfiles.practitioner.couponPresets.free_intro_consult.label",
      description: "bizProfiles.practitioner.couponPresets.free_intro_consult.description",
    },
    {
      id: "class_pack_bonus",
      label: "bizProfiles.practitioner.couponPresets.class_pack_bonus.label",
      description: "bizProfiles.practitioner.couponPresets.class_pack_bonus.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_special",
      label: "bizProfiles.practitioner.offerTemplates.new_client_special.label",
      description: "bizProfiles.practitioner.offerTemplates.new_client_special.description",
    },
    {
      id: "referral_free_class",
      label: "bizProfiles.practitioner.offerTemplates.referral_free_class.label",
      description: "bizProfiles.practitioner.offerTemplates.referral_free_class.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.practitioner.couponAngles.firstTime",
    seasonal: "bizProfiles.practitioner.couponAngles.seasonal",
    slowDay: "bizProfiles.practitioner.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.practitioner.faq.item1.question",
      answer: "bizProfiles.practitioner.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.practitioner.faq.item2.question",
      answer: "bizProfiles.practitioner.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_session_both",
      referrerReward: "bizProfiles.practitioner.referralPresets.free_session_both.referrerReward",
      friendReward: "bizProfiles.practitioner.referralPresets.free_session_both.friendReward",
      description: "bizProfiles.practitioner.referralPresets.free_session_both.description",
    },
    {
      id: "credit_toward_session",
      referrerReward: "bizProfiles.practitioner.referralPresets.credit_toward_session.referrerReward",
      friendReward: "bizProfiles.practitioner.referralPresets.credit_toward_session.friendReward",
      description: "bizProfiles.practitioner.referralPresets.credit_toward_session.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.practitioner.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.practitioner.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.practitioner.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "package_pricing",
      label: "bizProfiles.practitioner.pricingTips.package_pricing.label",
      description: "bizProfiles.practitioner.pricingTips.package_pricing.description",
    },
    {
      id: "low_cost_intro",
      label: "bizProfiles.practitioner.pricingTips.low_cost_intro.label",
      description: "bizProfiles.practitioner.pricingTips.low_cost_intro.description",
    },
    {
      id: "raise_when_booked_out",
      label: "bizProfiles.practitioner.pricingTips.raise_when_booked_out.label",
      description: "bizProfiles.practitioner.pricingTips.raise_when_booked_out.description",
    },
    {
      id: "price_by_format",
      label: "bizProfiles.practitioner.pricingTips.price_by_format.label",
      description: "bizProfiles.practitioner.pricingTips.price_by_format.description",
    },
  ],
};

/**
 * Membership-based fitness businesses — the economics are recurring
 * membership dues plus drop-in classes, not a single per-session fee the
 * way PRACTITIONER_PROFILE's 1:1 coaching/consulting is. Split out on
 * purpose: "50% off your first month" and "bring a friend" are the real
 * offers gyms run, not a "session pack" a solo practitioner would sell.
 */
const GYM_FITNESS_PROFILE: BizProfileSource = {
  id: "gym_fitness",
  label: "bizProfiles.gym_fitness.label",
  match: ["gym", "fitness center", "fitness studio", "crossfit", "yoga studio", "pilates studio"],
  placesType: ["gym", "fitness_center", "yoga_studio"],
  competitorNoun: "bizProfiles.gym_fitness.competitorNoun",
  couponPresets: [
    {
      id: "first_month_pct",
      label: "bizProfiles.gym_fitness.couponPresets.first_month_pct.label",
      description: "bizProfiles.gym_fitness.couponPresets.first_month_pct.description",
    },
    {
      id: "no_enrollment_fee",
      label: "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.label",
      description: "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.description",
    },
    {
      id: "class_pack_bonus",
      label: "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.label",
      description: "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_member_special",
      label: "bizProfiles.gym_fitness.offerTemplates.new_member_special.label",
      description: "bizProfiles.gym_fitness.offerTemplates.new_member_special.description",
    },
    {
      id: "bring_a_friend",
      label: "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.label",
      description: "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.gym_fitness.couponAngles.firstTime",
    seasonal: "bizProfiles.gym_fitness.couponAngles.seasonal",
    slowDay: "bizProfiles.gym_fitness.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.gym_fitness.faq.item1.question",
      answer: "bizProfiles.gym_fitness.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.gym_fitness.faq.item2.question",
      answer: "bizProfiles.gym_fitness.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_month_both",
      referrerReward: "bizProfiles.gym_fitness.referralPresets.free_month_both.referrerReward",
      friendReward: "bizProfiles.gym_fitness.referralPresets.free_month_both.friendReward",
      description: "bizProfiles.gym_fitness.referralPresets.free_month_both.description",
    },
    {
      id: "free_session_both",
      referrerReward: "bizProfiles.gym_fitness.referralPresets.free_session_both.referrerReward",
      friendReward: "bizProfiles.gym_fitness.referralPresets.free_session_both.friendReward",
      description: "bizProfiles.gym_fitness.referralPresets.free_session_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.gym_fitness.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.gym_fitness.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.gym_fitness.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "tiered_membership",
      label: "bizProfiles.gym_fitness.pricingTips.tiered_membership.label",
      description: "bizProfiles.gym_fitness.pricingTips.tiered_membership.description",
    },
    {
      id: "annual_discount",
      label: "bizProfiles.gym_fitness.pricingTips.annual_discount.label",
      description: "bizProfiles.gym_fitness.pricingTips.annual_discount.description",
    },
    {
      id: "off_peak_pricing",
      label: "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.label",
      description: "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.description",
    },
    {
      id: "raise_when_classes_full",
      label: "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.label",
      description: "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.description",
    },
  ],
};

/**
 * Service-call trades — plumbers, electricians, auto repair, landscaping,
 * cleaning. The unit of work is a job/visit priced by the call or the
 * project, not a product purchase or a recurring appointment, so the
 * offers are built around the first service call and seasonal
 * maintenance work instead of a purchase threshold or a booked session.
 */
const TRADES_PROFILE: BizProfileSource = {
  id: "trades",
  label: "bizProfiles.trades.label",
  match: ["plumber", "plumbing", "electrician", "electrical", "auto repair", "mechanic", "landscap", "lawn care", "cleaning service", "house cleaning"],
  placesType: ["plumber", "electrician", "car_repair", "landscaper", "house_cleaning"],
  competitorNoun: "bizProfiles.trades.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_first_call",
      label: "bizProfiles.trades.couponPresets.flat_off_first_call.label",
      description: "bizProfiles.trades.couponPresets.flat_off_first_call.description",
    },
    {
      id: "seasonal_tuneup",
      label: "bizProfiles.trades.couponPresets.seasonal_tuneup.label",
      description: "bizProfiles.trades.couponPresets.seasonal_tuneup.description",
    },
    {
      id: "bundle_multiple_jobs",
      label: "bizProfiles.trades.couponPresets.bundle_multiple_jobs.label",
      description: "bizProfiles.trades.couponPresets.bundle_multiple_jobs.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_customer_first_call",
      label: "bizProfiles.trades.offerTemplates.new_customer_first_call.label",
      description: "bizProfiles.trades.offerTemplates.new_customer_first_call.description",
    },
    {
      id: "seasonal_maintenance",
      label: "bizProfiles.trades.offerTemplates.seasonal_maintenance.label",
      description: "bizProfiles.trades.offerTemplates.seasonal_maintenance.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.trades.couponAngles.firstTime",
    seasonal: "bizProfiles.trades.couponAngles.seasonal",
    slowDay: "bizProfiles.trades.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.trades.faq.item1.question",
      answer: "bizProfiles.trades.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.trades.faq.item2.question",
      answer: "bizProfiles.trades.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.trades.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.trades.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.trades.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.trades.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.trades.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.trades.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.trades.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.trades.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.trades.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "flat_vs_hourly",
      label: "bizProfiles.trades.pricingTips.flat_vs_hourly.label",
      description: "bizProfiles.trades.pricingTips.flat_vs_hourly.description",
    },
    {
      id: "travel_radius_pricing",
      label: "bizProfiles.trades.pricingTips.travel_radius_pricing.label",
      description: "bizProfiles.trades.pricingTips.travel_radius_pricing.description",
    },
    {
      id: "seasonal_demand_pricing",
      label: "bizProfiles.trades.pricingTips.seasonal_demand_pricing.label",
      description: "bizProfiles.trades.pricingTips.seasonal_demand_pricing.description",
    },
    {
      id: "bundle_multiple_jobs",
      label: "bizProfiles.trades.pricingTips.bundle_multiple_jobs.label",
      description: "bizProfiles.trades.pricingTips.bundle_multiple_jobs.description",
    },
  ],
};

/**
 * Purchase-based general retail — clothing, gifts, hardware, flowers, and
 * similar storefronts where the customer buys a physical item outright.
 * The offer structure centers on the purchase itself (a dollar threshold,
 * a multi-item deal) rather than a visit, a session, or a service call.
 */
const RETAIL_PROFILE: BizProfileSource = {
  id: "retail",
  label: "bizProfiles.retail.label",
  match: ["boutique", "clothing store", "apparel", "gift shop", "shoe store", "retail store", "hardware store", "hardware", "florist", "flower shop", "floral"],
  placesType: ["clothing_store", "gift_shop", "shoe_store", "hardware_store", "florist"],
  competitorNoun: "bizProfiles.retail.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_threshold",
      label: "bizProfiles.retail.couponPresets.flat_off_threshold.label",
      description: "bizProfiles.retail.couponPresets.flat_off_threshold.description",
    },
    {
      id: "bogo",
      label: "bizProfiles.retail.couponPresets.bogo.label",
      description: "bizProfiles.retail.couponPresets.bogo.description",
    },
    {
      id: "bulk_discount",
      label: "bizProfiles.retail.couponPresets.bulk_discount.label",
      description: "bizProfiles.retail.couponPresets.bulk_discount.description",
    },
  ],
  offerTemplates: [
    {
      id: "welcome_offer",
      label: "bizProfiles.retail.offerTemplates.welcome_offer.label",
      description: "bizProfiles.retail.offerTemplates.welcome_offer.description",
    },
    {
      id: "seasonal_clearance",
      label: "bizProfiles.retail.offerTemplates.seasonal_clearance.label",
      description: "bizProfiles.retail.offerTemplates.seasonal_clearance.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.retail.couponAngles.firstTime",
    seasonal: "bizProfiles.retail.couponAngles.seasonal",
    slowDay: "bizProfiles.retail.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.retail.faq.item1.question",
      answer: "bizProfiles.retail.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.retail.faq.item2.question",
      answer: "bizProfiles.retail.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "bizProfiles.retail.referralPresets.credit_both.referrerReward",
      friendReward: "bizProfiles.retail.referralPresets.credit_both.friendReward",
      description: "bizProfiles.retail.referralPresets.credit_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.retail.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.retail.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.retail.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.retail.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.retail.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.retail.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "anchor_pricing",
      label: "bizProfiles.retail.pricingTips.anchor_pricing.label",
      description: "bizProfiles.retail.pricingTips.anchor_pricing.description",
    },
    {
      id: "bulk_bundle_pricing",
      label: "bizProfiles.retail.pricingTips.bulk_bundle_pricing.label",
      description: "bizProfiles.retail.pricingTips.bulk_bundle_pricing.description",
    },
    {
      id: "seasonal_markdowns",
      label: "bizProfiles.retail.pricingTips.seasonal_markdowns.label",
      description: "bizProfiles.retail.pricingTips.seasonal_markdowns.description",
    },
    {
      id: "raise_on_demand",
      label: "bizProfiles.retail.pricingTips.raise_on_demand.label",
      description: "bizProfiles.retail.pricingTips.raise_on_demand.description",
    },
  ],
};

/**
 * The fallback for anything unrecognized. Must be genuinely useful on
 * its own — never a "we couldn't categorize you" dead end — since a
 * business's Google category can be missing, generic, or just not one
 * we've written a specific profile for yet.
 */
const DEFAULT_PROFILE: BizProfileSource = {
  id: "default",
  label: "bizProfiles.default.label",
  match: [],
  placesType: [],
  competitorNoun: "bizProfiles.default.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_purchase",
      label: "bizProfiles.default.couponPresets.flat_off_purchase.label",
      description: "bizProfiles.default.couponPresets.flat_off_purchase.description",
    },
    {
      id: "pct_off_new_customer",
      label: "bizProfiles.default.couponPresets.pct_off_new_customer.label",
      description: "bizProfiles.default.couponPresets.pct_off_new_customer.description",
    },
  ],
  offerTemplates: [
    {
      id: "welcome_offer",
      label: "bizProfiles.default.offerTemplates.welcome_offer.label",
      description: "bizProfiles.default.offerTemplates.welcome_offer.description",
    },
    {
      id: "seasonal_special",
      label: "bizProfiles.default.offerTemplates.seasonal_special.label",
      description: "bizProfiles.default.offerTemplates.seasonal_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.default.couponAngles.firstTime",
    seasonal: "bizProfiles.default.couponAngles.seasonal",
    slowDay: "bizProfiles.default.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.default.faq.item1.question",
      answer: "bizProfiles.default.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.default.faq.item2.question",
      answer: "bizProfiles.default.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "bizProfiles.default.referralPresets.credit_both.referrerReward",
      friendReward: "bizProfiles.default.referralPresets.credit_both.friendReward",
      description: "bizProfiles.default.referralPresets.credit_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.default.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.default.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.default.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.default.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.default.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.default.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "anchor_pricing",
      label: "bizProfiles.default.pricingTips.anchor_pricing.label",
      description: "bizProfiles.default.pricingTips.anchor_pricing.description",
    },
    {
      id: "good_better_best",
      label: "bizProfiles.default.pricingTips.good_better_best.label",
      description: "bizProfiles.default.pricingTips.good_better_best.description",
    },
    {
      id: "raise_when_consistently_busy",
      label: "bizProfiles.default.pricingTips.raise_when_consistently_busy.label",
      description: "bizProfiles.default.pricingTips.raise_when_consistently_busy.description",
    },
    {
      id: "bundle_package",
      label: "bizProfiles.default.pricingTips.bundle_package.label",
      description: "bizProfiles.default.pricingTips.bundle_package.description",
    },
  ],
};

export { DEFAULT_PROFILE };

/**
 * On-site, project/service-call businesses — general contractors,
 * roofers, HVAC, painters, remodelers, and similar home-improvement
 * trades. Distinct from TRADES_PROFILE's plumber/electrician/
 * landscaper/auto-repair/cleaning set: those are single-visit service
 * calls priced per job; this profile leans toward bigger, quoted
 * projects (a roof, a remodel) alongside smaller service calls, so the
 * offer structure centers on a free estimate and licensing/insurance
 * trust signals rather than just a flat first-call discount.
 */
const HOME_SERVICES_PROFILE: BizProfileSource = {
  id: "home_services",
  label: "bizProfiles.home_services.label",
  match: [
    "general contractor",
    "contractor",
    "roofing",
    "roofer",
    "hvac",
    "remodeling contractor",
    "renovation",
    "handyman",
    "home improvement",
  ],
  placesType: ["general_contractor", "roofing_contractor", "hvac_contractor"],
  competitorNoun: "bizProfiles.home_services.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_first_project",
      label: "bizProfiles.home_services.couponPresets.flat_off_first_project.label",
      description: "bizProfiles.home_services.couponPresets.flat_off_first_project.description",
    },
    {
      id: "seasonal_inspection",
      label: "bizProfiles.home_services.couponPresets.seasonal_inspection.label",
      description: "bizProfiles.home_services.couponPresets.seasonal_inspection.description",
    },
    {
      id: "bundle_multiple_projects",
      label: "bizProfiles.home_services.couponPresets.bundle_multiple_projects.label",
      description: "bizProfiles.home_services.couponPresets.bundle_multiple_projects.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_customer_free_estimate",
      label: "bizProfiles.home_services.offerTemplates.new_customer_free_estimate.label",
      description: "bizProfiles.home_services.offerTemplates.new_customer_free_estimate.description",
    },
    {
      id: "seasonal_maintenance",
      label: "bizProfiles.home_services.offerTemplates.seasonal_maintenance.label",
      description: "bizProfiles.home_services.offerTemplates.seasonal_maintenance.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.home_services.couponAngles.firstTime",
    seasonal: "bizProfiles.home_services.couponAngles.seasonal",
    slowDay: "bizProfiles.home_services.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.home_services.faq.item1.question",
      answer: "bizProfiles.home_services.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.home_services.faq.item2.question",
      answer: "bizProfiles.home_services.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.home_services.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.home_services.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.home_services.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.home_services.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.home_services.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.home_services.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.home_services.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.home_services.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.home_services.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "quote_vs_flat",
      label: "bizProfiles.home_services.pricingTips.quote_vs_flat.label",
      description: "bizProfiles.home_services.pricingTips.quote_vs_flat.description",
    },
    {
      id: "license_insurance_trust",
      label: "bizProfiles.home_services.pricingTips.license_insurance_trust.label",
      description: "bizProfiles.home_services.pricingTips.license_insurance_trust.description",
    },
    {
      id: "seasonal_demand_pricing",
      label: "bizProfiles.home_services.pricingTips.seasonal_demand_pricing.label",
      description: "bizProfiles.home_services.pricingTips.seasonal_demand_pricing.description",
    },
    {
      id: "bundle_multiple_projects",
      label: "bizProfiles.home_services.pricingTips.bundle_multiple_projects.label",
      description: "bizProfiles.home_services.pricingTips.bundle_multiple_projects.description",
    },
  ],
};

/**
 * Drop-off, per-item repair and garment-care businesses — shoe repair,
 * tailoring/alterations, phone/computer/watch/jewelry/appliance repair,
 * dry cleaning, laundromats. The unit of work is a small, individually
 * priced item with a turnaround time, not a quoted project or a
 * recurring appointment — so the offers are built around per-item and
 * bundle pricing, and the FAQ centers on turnaround time, the one thing
 * every drop-off customer actually wants to know.
 */
const REPAIR_DROPOFF_PROFILE: BizProfileSource = {
  id: "repair_dropoff",
  label: "bizProfiles.repair_dropoff.label",
  match: [
    "dry cleaner",
    "dry cleaning",
    "laundromat",
    "laundry",
    "tailor",
    "alterations",
    "shoe repair",
    "cobbler",
    "phone repair",
    "computer repair",
    "watch repair",
    "jewelry repair",
    "appliance repair",
    "locksmith",
  ],
  placesType: ["laundry"],
  competitorNoun: "bizProfiles.repair_dropoff.competitorNoun",
  couponPresets: [
    {
      id: "pct_off_first_item",
      label: "bizProfiles.repair_dropoff.couponPresets.pct_off_first_item.label",
      description: "bizProfiles.repair_dropoff.couponPresets.pct_off_first_item.description",
    },
    {
      id: "loyalty_punch",
      label: "bizProfiles.repair_dropoff.couponPresets.loyalty_punch.label",
      description: "bizProfiles.repair_dropoff.couponPresets.loyalty_punch.description",
    },
    {
      id: "bundle_multiple_items",
      label: "bizProfiles.repair_dropoff.couponPresets.bundle_multiple_items.label",
      description: "bizProfiles.repair_dropoff.couponPresets.bundle_multiple_items.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_customer_first_item",
      label: "bizProfiles.repair_dropoff.offerTemplates.new_customer_first_item.label",
      description: "bizProfiles.repair_dropoff.offerTemplates.new_customer_first_item.description",
    },
    {
      id: "slow_season_special",
      label: "bizProfiles.repair_dropoff.offerTemplates.slow_season_special.label",
      description: "bizProfiles.repair_dropoff.offerTemplates.slow_season_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.repair_dropoff.couponAngles.firstTime",
    seasonal: "bizProfiles.repair_dropoff.couponAngles.seasonal",
    slowDay: "bizProfiles.repair_dropoff.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.repair_dropoff.faq.item1.question",
      answer: "bizProfiles.repair_dropoff.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.repair_dropoff.faq.item2.question",
      answer: "bizProfiles.repair_dropoff.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.repair_dropoff.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.repair_dropoff.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.repair_dropoff.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.repair_dropoff.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.repair_dropoff.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.repair_dropoff.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.repair_dropoff.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.repair_dropoff.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.repair_dropoff.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "per_item_vs_bundle",
      label: "bizProfiles.repair_dropoff.pricingTips.per_item_vs_bundle.label",
      description: "bizProfiles.repair_dropoff.pricingTips.per_item_vs_bundle.description",
    },
    {
      id: "rush_fee",
      label: "bizProfiles.repair_dropoff.pricingTips.rush_fee.label",
      description: "bizProfiles.repair_dropoff.pricingTips.rush_fee.description",
    },
    {
      id: "seasonal_demand_pricing",
      label: "bizProfiles.repair_dropoff.pricingTips.seasonal_demand_pricing.label",
      description: "bizProfiles.repair_dropoff.pricingTips.seasonal_demand_pricing.description",
    },
    {
      id: "raise_when_backlog",
      label: "bizProfiles.repair_dropoff.pricingTips.raise_when_backlog.label",
      description: "bizProfiles.repair_dropoff.pricingTips.raise_when_backlog.description",
    },
  ],
};

/**
 * Ticketed entertainment venues — bowling, arcades, escape rooms,
 * trampoline parks, mini golf, laser tag. The unit of business is
 * admission (a ticket or a time slot), often bought in groups and for
 * birthday parties, not a purchase, a service call, or a recurring
 * membership — so the offers center on admission discounts, group
 * rates, and party packages.
 */
const RECREATION_PROFILE: BizProfileSource = {
  id: "recreation",
  label: "bizProfiles.recreation.label",
  match: [
    "bowling",
    "arcade",
    "escape room",
    "trampoline park",
    "mini golf",
    "golf range",
    "golf course",
    "driving range",
    "laser tag",
    "paintball",
    "axe throwing",
    "skating rink",
    "amusement",
  ],
  placesType: ["bowling_alley", "amusement_center"],
  competitorNoun: "bizProfiles.recreation.competitorNoun",
  couponPresets: [
    {
      id: "pct_off_admission",
      label: "bizProfiles.recreation.couponPresets.pct_off_admission.label",
      description: "bizProfiles.recreation.couponPresets.pct_off_admission.description",
    },
    {
      id: "group_discount",
      label: "bizProfiles.recreation.couponPresets.group_discount.label",
      description: "bizProfiles.recreation.couponPresets.group_discount.description",
    },
    {
      id: "birthday_party_special",
      label: "bizProfiles.recreation.couponPresets.birthday_party_special.label",
      description: "bizProfiles.recreation.couponPresets.birthday_party_special.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_visitor_special",
      label: "bizProfiles.recreation.offerTemplates.new_visitor_special.label",
      description: "bizProfiles.recreation.offerTemplates.new_visitor_special.description",
    },
    {
      id: "slow_weekday_special",
      label: "bizProfiles.recreation.offerTemplates.slow_weekday_special.label",
      description: "bizProfiles.recreation.offerTemplates.slow_weekday_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.recreation.couponAngles.firstTime",
    seasonal: "bizProfiles.recreation.couponAngles.seasonal",
    slowDay: "bizProfiles.recreation.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.recreation.faq.item1.question",
      answer: "bizProfiles.recreation.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.recreation.faq.item2.question",
      answer: "bizProfiles.recreation.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "friend_ticket_both",
      referrerReward: "bizProfiles.recreation.referralPresets.friend_ticket_both.referrerReward",
      friendReward: "bizProfiles.recreation.referralPresets.friend_ticket_both.friendReward",
      description: "bizProfiles.recreation.referralPresets.friend_ticket_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.recreation.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.recreation.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.recreation.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.recreation.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.recreation.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.recreation.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "time_slot_pricing",
      label: "bizProfiles.recreation.pricingTips.time_slot_pricing.label",
      description: "bizProfiles.recreation.pricingTips.time_slot_pricing.description",
    },
    {
      id: "group_and_party_packages",
      label: "bizProfiles.recreation.pricingTips.group_and_party_packages.label",
      description: "bizProfiles.recreation.pricingTips.group_and_party_packages.description",
    },
    {
      id: "anchor_premium_package",
      label: "bizProfiles.recreation.pricingTips.anchor_premium_package.label",
      description: "bizProfiles.recreation.pricingTips.anchor_premium_package.description",
    },
    {
      id: "raise_when_booked_out",
      label: "bizProfiles.recreation.pricingTips.raise_when_booked_out.label",
      description: "bizProfiles.recreation.pricingTips.raise_when_booked_out.description",
    },
  ],
};

/**
 * One-date, booked-in-advance celebration vendors — wedding planners,
 * DJs, caterers, party rental companies, photo booths, event venues.
 * The unit of business is a single booked date sold as a package, not a
 * repeat visit or a per-item purchase — so the offers center on booking
 * the date itself (an early-booking or off-season discount, a deposit
 * to hold it) rather than a return-visit discount.
 */
const EVENTS_PROFILE: BizProfileSource = {
  id: "events",
  label: "bizProfiles.events.label",
  match: [
    "wedding planner",
    "wedding venue",
    "banquet hall",
    "event venue",
    "event space",
    "event planning",
    "party rental",
    "photo booth",
  ],
  placesType: ["banquet_hall", "wedding_venue"],
  competitorNoun: "bizProfiles.events.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_booking",
      label: "bizProfiles.events.couponPresets.flat_off_booking.label",
      description: "bizProfiles.events.couponPresets.flat_off_booking.description",
    },
    {
      id: "early_booking_discount",
      label: "bizProfiles.events.couponPresets.early_booking_discount.label",
      description: "bizProfiles.events.couponPresets.early_booking_discount.description",
    },
    {
      id: "off_season_discount",
      label: "bizProfiles.events.couponPresets.off_season_discount.label",
      description: "bizProfiles.events.couponPresets.off_season_discount.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_booking_special",
      label: "bizProfiles.events.offerTemplates.new_client_booking_special.label",
      description: "bizProfiles.events.offerTemplates.new_client_booking_special.description",
    },
    {
      id: "off_peak_date_special",
      label: "bizProfiles.events.offerTemplates.off_peak_date_special.label",
      description: "bizProfiles.events.offerTemplates.off_peak_date_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.events.couponAngles.firstTime",
    seasonal: "bizProfiles.events.couponAngles.seasonal",
    slowDay: "bizProfiles.events.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.events.faq.item1.question",
      answer: "bizProfiles.events.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.events.faq.item2.question",
      answer: "bizProfiles.events.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.events.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.events.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.events.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.events.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.events.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.events.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.events.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.events.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.events.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "package_tiers",
      label: "bizProfiles.events.pricingTips.package_tiers.label",
      description: "bizProfiles.events.pricingTips.package_tiers.description",
    },
    {
      id: "deposit_to_hold_date",
      label: "bizProfiles.events.pricingTips.deposit_to_hold_date.label",
      description: "bizProfiles.events.pricingTips.deposit_to_hold_date.description",
    },
    {
      id: "peak_vs_offpeak_pricing",
      label: "bizProfiles.events.pricingTips.peak_vs_offpeak_pricing.label",
      description: "bizProfiles.events.pricingTips.peak_vs_offpeak_pricing.description",
    },
    {
      id: "raise_when_booked_out",
      label: "bizProfiles.events.pricingTips.raise_when_booked_out.label",
      description: "bizProfiles.events.pricingTips.raise_when_booked_out.description",
    },
  ],
};

/**
 * Vehicle wash and cosmetic-detailing businesses — car washes, auto
 * detailers, window tinting, vehicle wraps. Deliberately separate from
 * TRADES_PROFILE's auto_repair: nothing here is being fixed, so a
 * "mechanic" FAQ or a repair-call coupon would be the wrong copy. The
 * offers center on wash packages and memberships instead.
 */
const CAR_WASH_DETAILING_PROFILE: BizProfileSource = {
  id: "car_wash_detailing",
  label: "bizProfiles.car_wash_detailing.label",
  match: ["car wash", "auto detailing", "car detailing", "window tinting", "vehicle wrap"],
  placesType: ["car_wash"],
  competitorNoun: "bizProfiles.car_wash_detailing.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_first_wash",
      label: "bizProfiles.car_wash_detailing.couponPresets.flat_off_first_wash.label",
      description: "bizProfiles.car_wash_detailing.couponPresets.flat_off_first_wash.description",
    },
    {
      id: "free_upgrade_first_visit",
      label: "bizProfiles.car_wash_detailing.couponPresets.free_upgrade_first_visit.label",
      description: "bizProfiles.car_wash_detailing.couponPresets.free_upgrade_first_visit.description",
    },
    {
      id: "detailing_bundle",
      label: "bizProfiles.car_wash_detailing.couponPresets.detailing_bundle.label",
      description: "bizProfiles.car_wash_detailing.couponPresets.detailing_bundle.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_customer_first_wash",
      label: "bizProfiles.car_wash_detailing.offerTemplates.new_customer_first_wash.label",
      description: "bizProfiles.car_wash_detailing.offerTemplates.new_customer_first_wash.description",
    },
    {
      id: "membership_trial",
      label: "bizProfiles.car_wash_detailing.offerTemplates.membership_trial.label",
      description: "bizProfiles.car_wash_detailing.offerTemplates.membership_trial.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.car_wash_detailing.couponAngles.firstTime",
    seasonal: "bizProfiles.car_wash_detailing.couponAngles.seasonal",
    slowDay: "bizProfiles.car_wash_detailing.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.car_wash_detailing.faq.item1.question",
      answer: "bizProfiles.car_wash_detailing.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.car_wash_detailing.faq.item2.question",
      answer: "bizProfiles.car_wash_detailing.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_wash_both",
      referrerReward: "bizProfiles.car_wash_detailing.referralPresets.free_wash_both.referrerReward",
      friendReward: "bizProfiles.car_wash_detailing.referralPresets.free_wash_both.friendReward",
      description: "bizProfiles.car_wash_detailing.referralPresets.free_wash_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.car_wash_detailing.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.car_wash_detailing.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.car_wash_detailing.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.car_wash_detailing.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.car_wash_detailing.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.car_wash_detailing.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "tiered_wash_packages",
      label: "bizProfiles.car_wash_detailing.pricingTips.tiered_wash_packages.label",
      description: "bizProfiles.car_wash_detailing.pricingTips.tiered_wash_packages.description",
    },
    {
      id: "membership_for_recurring_revenue",
      label: "bizProfiles.car_wash_detailing.pricingTips.membership_for_recurring_revenue.label",
      description: "bizProfiles.car_wash_detailing.pricingTips.membership_for_recurring_revenue.description",
    },
    {
      id: "detailing_by_vehicle_size",
      label: "bizProfiles.car_wash_detailing.pricingTips.detailing_by_vehicle_size.label",
      description: "bizProfiles.car_wash_detailing.pricingTips.detailing_by_vehicle_size.description",
    },
    {
      id: "off_peak_pricing",
      label: "bizProfiles.car_wash_detailing.pricingTips.off_peak_pricing.label",
      description: "bizProfiles.car_wash_detailing.pricingTips.off_peak_pricing.description",
    },
  ],
};

/**
 * Enrollment-based childcare and early education — daycares,
 * preschools, Montessori programs, after-school programs, summer
 * camps. The unit of business is a recurring enrollment (like a
 * membership) rather than a single visit, but the offers center on
 * touring and enrolling rather than a trial class, and the FAQ leans on
 * safety and availability — the two things a parent actually needs
 * reassurance on before committing their child to a new provider.
 */
const CHILDCARE_PROFILE: BizProfileSource = {
  id: "childcare",
  label: "bizProfiles.childcare.label",
  match: [
    "daycare",
    "day care",
    "child care center",
    "child care",
    "preschool",
    "montessori",
    "after-school program",
    "childcare",
  ],
  placesType: ["child_care_agency", "preschool"],
  competitorNoun: "bizProfiles.childcare.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_enrollment",
      label: "bizProfiles.childcare.couponPresets.flat_off_enrollment.label",
      description: "bizProfiles.childcare.couponPresets.flat_off_enrollment.description",
    },
    {
      id: "waived_registration_fee",
      label: "bizProfiles.childcare.couponPresets.waived_registration_fee.label",
      description: "bizProfiles.childcare.couponPresets.waived_registration_fee.description",
    },
    {
      id: "sibling_discount",
      label: "bizProfiles.childcare.couponPresets.sibling_discount.label",
      description: "bizProfiles.childcare.couponPresets.sibling_discount.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_family_special",
      label: "bizProfiles.childcare.offerTemplates.new_family_special.label",
      description: "bizProfiles.childcare.offerTemplates.new_family_special.description",
    },
    {
      id: "seasonal_enrollment_push",
      label: "bizProfiles.childcare.offerTemplates.seasonal_enrollment_push.label",
      description: "bizProfiles.childcare.offerTemplates.seasonal_enrollment_push.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.childcare.couponAngles.firstTime",
    seasonal: "bizProfiles.childcare.couponAngles.seasonal",
    slowDay: "bizProfiles.childcare.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.childcare.faq.item1.question",
      answer: "bizProfiles.childcare.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.childcare.faq.item2.question",
      answer: "bizProfiles.childcare.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.childcare.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.childcare.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.childcare.referralPresets.flat_off_both.description",
    },
    {
      id: "free_week_both",
      referrerReward: "bizProfiles.childcare.referralPresets.free_week_both.referrerReward",
      friendReward: "bizProfiles.childcare.referralPresets.free_week_both.friendReward",
      description: "bizProfiles.childcare.referralPresets.free_week_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.childcare.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.childcare.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.childcare.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "tuition_tiers_by_schedule",
      label: "bizProfiles.childcare.pricingTips.tuition_tiers_by_schedule.label",
      description: "bizProfiles.childcare.pricingTips.tuition_tiers_by_schedule.description",
    },
    {
      id: "waitlist_signals_room_to_raise",
      label: "bizProfiles.childcare.pricingTips.waitlist_signals_room_to_raise.label",
      description: "bizProfiles.childcare.pricingTips.waitlist_signals_room_to_raise.description",
    },
    {
      id: "bundle_sibling_discount",
      label: "bizProfiles.childcare.pricingTips.bundle_sibling_discount.label",
      description: "bizProfiles.childcare.pricingTips.bundle_sibling_discount.description",
    },
    {
      id: "registration_fee_covers_admin",
      label: "bizProfiles.childcare.pricingTips.registration_fee_covers_admin.label",
      description: "bizProfiles.childcare.pricingTips.registration_fee_covers_admin.description",
    },
  ],
};

/**
 * Nightly-rate overnight stays — hotels, motels, bed & breakfasts,
 * hostels, RV parks, glamping sites. The unit of business is a night
 * (or a multi-night stay), sold at a rate that swings hard by season
 * and day of week, so the offers center on length-of-stay and
 * off-season discounts rather than a purchase or a per-visit coupon.
 */
const LODGING_PROFILE: BizProfileSource = {
  id: "lodging",
  label: "bizProfiles.lodging.label",
  match: ["hotel", "motel", "bed and breakfast", "hostel", "rv park", "campground", "glamping"],
  placesType: ["lodging", "hotel", "motel"],
  competitorNoun: "bizProfiles.lodging.competitorNoun",
  couponPresets: [
    {
      id: "pct_off_first_stay",
      label: "bizProfiles.lodging.couponPresets.pct_off_first_stay.label",
      description: "bizProfiles.lodging.couponPresets.pct_off_first_stay.description",
    },
    {
      id: "extended_stay_discount",
      label: "bizProfiles.lodging.couponPresets.extended_stay_discount.label",
      description: "bizProfiles.lodging.couponPresets.extended_stay_discount.description",
    },
    {
      id: "off_season_discount",
      label: "bizProfiles.lodging.couponPresets.off_season_discount.label",
      description: "bizProfiles.lodging.couponPresets.off_season_discount.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_guest_special",
      label: "bizProfiles.lodging.offerTemplates.new_guest_special.label",
      description: "bizProfiles.lodging.offerTemplates.new_guest_special.description",
    },
    {
      id: "off_peak_stay_special",
      label: "bizProfiles.lodging.offerTemplates.off_peak_stay_special.label",
      description: "bizProfiles.lodging.offerTemplates.off_peak_stay_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.lodging.couponAngles.firstTime",
    seasonal: "bizProfiles.lodging.couponAngles.seasonal",
    slowDay: "bizProfiles.lodging.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.lodging.faq.item1.question",
      answer: "bizProfiles.lodging.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.lodging.faq.item2.question",
      answer: "bizProfiles.lodging.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.lodging.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.lodging.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.lodging.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.lodging.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.lodging.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.lodging.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.lodging.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.lodging.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.lodging.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "peak_vs_offpeak_pricing",
      label: "bizProfiles.lodging.pricingTips.peak_vs_offpeak_pricing.label",
      description: "bizProfiles.lodging.pricingTips.peak_vs_offpeak_pricing.description",
    },
    {
      id: "length_of_stay_discount",
      label: "bizProfiles.lodging.pricingTips.length_of_stay_discount.label",
      description: "bizProfiles.lodging.pricingTips.length_of_stay_discount.description",
    },
    {
      id: "raise_when_booked_out",
      label: "bizProfiles.lodging.pricingTips.raise_when_booked_out.label",
      description: "bizProfiles.lodging.pricingTips.raise_when_booked_out.description",
    },
    {
      id: "bundle_add_ons",
      label: "bizProfiles.lodging.pricingTips.bundle_add_ons.label",
      description: "bizProfiles.lodging.pricingTips.bundle_add_ons.description",
    },
  ],
};

/**
 * Tattoo, piercing, and permanent body-art studios — a genuinely
 * distinct business from salon/spa beauty services: work is priced per
 * session/piece rather than per visit, a deposit is standard practice
 * to hold a booking, and the FAQ centers on consultations and portfolio
 * availability rather than walk-in appointments.
 */
const TATTOO_BODY_ART_PROFILE: BizProfileSource = {
  id: "tattoo_body_art",
  label: "bizProfiles.tattoo_body_art.label",
  match: ["tattoo", "piercing", "body art", "tattoo studio", "tattoo parlor", "microblading", "permanent makeup"],
  placesType: ["tattoo_parlor"],
  competitorNoun: "bizProfiles.tattoo_body_art.competitorNoun",
  couponPresets: [
    {
      id: "flat_off_first_session",
      label: "bizProfiles.tattoo_body_art.couponPresets.flat_off_first_session.label",
      description: "bizProfiles.tattoo_body_art.couponPresets.flat_off_first_session.description",
    },
    {
      id: "free_touchup",
      label: "bizProfiles.tattoo_body_art.couponPresets.free_touchup.label",
      description: "bizProfiles.tattoo_body_art.couponPresets.free_touchup.description",
    },
    {
      id: "flash_day_special",
      label: "bizProfiles.tattoo_body_art.couponPresets.flash_day_special.label",
      description: "bizProfiles.tattoo_body_art.couponPresets.flash_day_special.description",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_first_session",
      label: "bizProfiles.tattoo_body_art.offerTemplates.new_client_first_session.label",
      description: "bizProfiles.tattoo_body_art.offerTemplates.new_client_first_session.description",
    },
    {
      id: "slow_weekday_special",
      label: "bizProfiles.tattoo_body_art.offerTemplates.slow_weekday_special.label",
      description: "bizProfiles.tattoo_body_art.offerTemplates.slow_weekday_special.description",
    },
  ],
  couponAngles: {
    firstTime: "bizProfiles.tattoo_body_art.couponAngles.firstTime",
    seasonal: "bizProfiles.tattoo_body_art.couponAngles.seasonal",
    slowDay: "bizProfiles.tattoo_body_art.couponAngles.slowDay",
  },
  faq: [
    {
      id: "item1",
      question: "bizProfiles.tattoo_body_art.faq.item1.question",
      answer: "bizProfiles.tattoo_body_art.faq.item1.answer",
    },
    {
      id: "item2",
      question: "bizProfiles.tattoo_body_art.faq.item2.question",
      answer: "bizProfiles.tattoo_body_art.faq.item2.answer",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "bizProfiles.tattoo_body_art.referralPresets.flat_off_both.referrerReward",
      friendReward: "bizProfiles.tattoo_body_art.referralPresets.flat_off_both.friendReward",
      description: "bizProfiles.tattoo_body_art.referralPresets.flat_off_both.description",
    },
    {
      id: "pct_off_both",
      referrerReward: "bizProfiles.tattoo_body_art.referralPresets.pct_off_both.referrerReward",
      friendReward: "bizProfiles.tattoo_body_art.referralPresets.pct_off_both.friendReward",
      description: "bizProfiles.tattoo_body_art.referralPresets.pct_off_both.description",
    },
  ],
  pricingExamples: [
    { id: "example1", text: "bizProfiles.tattoo_body_art.pricingExamples.example1" },
    { id: "example2", text: "bizProfiles.tattoo_body_art.pricingExamples.example2" },
    { id: "example3", text: "bizProfiles.tattoo_body_art.pricingExamples.example3" },
  ],
  pricingTips: [
    {
      id: "deposit_protects_time",
      label: "bizProfiles.tattoo_body_art.pricingTips.deposit_protects_time.label",
      description: "bizProfiles.tattoo_body_art.pricingTips.deposit_protects_time.description",
    },
    {
      id: "price_by_time_not_just_size",
      label: "bizProfiles.tattoo_body_art.pricingTips.price_by_time_not_just_size.label",
      description: "bizProfiles.tattoo_body_art.pricingTips.price_by_time_not_just_size.description",
    },
    {
      id: "flash_vs_custom_pricing",
      label: "bizProfiles.tattoo_body_art.pricingTips.flash_vs_custom_pricing.label",
      description: "bizProfiles.tattoo_body_art.pricingTips.flash_vs_custom_pricing.description",
    },
    {
      id: "raise_when_booked_weeks_out",
      label: "bizProfiles.tattoo_body_art.pricingTips.raise_when_booked_weeks_out.label",
      description: "bizProfiles.tattoo_body_art.pricingTips.raise_when_booked_weeks_out.description",
    },
  ],
};

/**
 * The hand-written content sources — coupons, offers, growth ideas, FAQ,
 * referral rules, pricing tips — every business type ultimately reuses.
 * Writing genuinely distinct monetization content for every one of the
 * ~35 narrow business types below isn't realistic (a "barbershop" doesn't
 * need different coupon math than a "salon"), so a narrow type picks
 * whichever of these actually matches how it makes money — see each
 * BusinessTypeOption's `contentProfileId` below. Each one here is a
 * genuinely distinct MONEY MODEL (purchase-based retail vs. a basket-
 * based grocery shop vs. a service call vs. a membership vs. a booked
 * session, etc.) — never just a copy/paste of another with the nouns
 * swapped, since the whole point is that the offer STRUCTURE has to
 * match how that kind of business actually earns money.
 */
type ContentProfileId =
  | "salon"
  | "restaurant"
  | "liquor_wine"
  | "grocery_market"
  | "cafe_bakery"
  | "lawyer"
  | "professional_services"
  | "practitioner"
  | "gym_fitness"
  | "trades"
  | "retail"
  | "default"
  | "home_services"
  | "repair_dropoff"
  | "recreation"
  | "events"
  | "car_wash_detailing"
  | "childcare"
  | "lodging"
  | "tattoo_body_art";

const CONTENT_PROFILES: Record<ContentProfileId, BizProfileSource> = {
  salon: SALON_PROFILE,
  restaurant: RESTAURANT_PROFILE,
  liquor_wine: LIQUOR_WINE_PROFILE,
  grocery_market: GROCERY_MARKET_PROFILE,
  cafe_bakery: CAFE_BAKERY_PROFILE,
  lawyer: LAWYER_PROFILE,
  professional_services: PROFESSIONAL_SERVICES_PROFILE,
  practitioner: PRACTITIONER_PROFILE,
  gym_fitness: GYM_FITNESS_PROFILE,
  trades: TRADES_PROFILE,
  retail: RETAIL_PROFILE,
  default: DEFAULT_PROFILE,
  home_services: HOME_SERVICES_PROFILE,
  repair_dropoff: REPAIR_DROPOFF_PROFILE,
  recreation: RECREATION_PROFILE,
  events: EVENTS_PROFILE,
  car_wash_detailing: CAR_WASH_DETAILING_PROFILE,
  childcare: CHILDCARE_PROFILE,
  lodging: LODGING_PROFILE,
  tattoo_body_art: TATTOO_BODY_ART_PROFILE,
};

/**
 * One selectable/detectable business type. Distinct from BizProfile
 * itself: this carries only IDENTITY (what it's called, what Google/the
 * owner calls it) and points at the CONTENT it reuses, rather than
 * duplicating a full BizProfile's coupon/FAQ/pricing content per narrow
 * type. See buildResolvedProfile() below for how the two combine.
 */
interface BusinessTypeOption {
  id: string;
  label: MessageKey;
  /**
   * Keywords matched case-insensitively against the business's Google
   * category (display name) and primary type (machine slug). Checked in
   * the order BUSINESS_TYPE_OPTIONS lists them, first hit wins — so a
   * narrower type (e.g. "barbershop") is listed ahead of the broader
   * type it would otherwise be swallowed by (e.g. generic "salon") and
   * no keyword is reused across two entries.
   */
  match: string[];
  /** Representative Google Places type slugs — informational metadata
   * for most profiles (not a rewiring of lib/competitors.ts's own
   * matching), but for "lawyer" specifically ALSO the real set
   * bizProfile()'s secondary-Google-type check (see isLikelyLawFirm)
   * matches a business's full real `categories` list against, not just
   * its single primary type. */
  placesType: string[];
  /** Which hand-written content this type's coupons/offers/growth ideas/
   * FAQ/pricing tips/referral rules actually come from. */
  contentProfileId: ContentProfileId;
  /**
   * Overrides the content profile's own competitorNoun (e.g. "barbershops"
   * instead of the salon content's "salons") — every other field is
   * reused as-is. Omit to just use the content profile's own noun.
   */
  competitorNoun?: MessageKey;
}

/**
 * Every business type PostScore recognizes — the single source of truth
 * for both auto-detection (bizProfile(), matched against Google's real
 * category/primary type) and the owner's manual-correction dropdown
 * (BIZ_PROFILE_OPTIONS). Order matters: the first entry whose `match`
 * list hits wins, so more specific types are listed ahead of the general
 * bucket they'd otherwise fall into (e.g. "pet_services" ahead of
 * "medical_clinic" so "Veterinary Clinic" doesn't match on "clinic"
 * first). "default" is last and matches everything as the final
 * catch-all — see bizProfile()'s empty-match-list check.
 */
const BUSINESS_TYPE_OPTIONS: BusinessTypeOption[] = [
  // Salon & personal care — narrow types first, generic "salon" last so
  // it doesn't swallow the others (its own keywords, "salon"/"hair"/
  // "beauty", never overlap theirs).
  {
    id: "barbershop",
    label: "bizProfileOptions.barbershop.label",
    match: ["barber"],
    placesType: ["barber_shop"],
    contentProfileId: "salon",
    competitorNoun: "bizProfileOptions.barbershop.competitorNoun",
  },
  {
    id: "spa",
    label: "bizProfileOptions.spa.label",
    match: ["spa", "massage", "day spa"],
    placesType: ["spa", "day_spa", "massage"],
    contentProfileId: "salon",
    competitorNoun: "bizProfileOptions.spa.competitorNoun",
  },
  {
    id: "nail_salon",
    label: "bizProfileOptions.nail_salon.label",
    match: ["nail salon", "nail", "lash", "brow"],
    placesType: ["nail_salon"],
    contentProfileId: "salon",
    competitorNoun: "bizProfileOptions.nail_salon.competitorNoun",
  },
  {
    id: "salon",
    label: SALON_PROFILE.label,
    match: ["salon", "hair", "beauty", "tanning"],
    placesType: ["hair_salon", "beauty_salon"],
    contentProfileId: "salon",
  },

  // Food & drink — narrow types first, generic "restaurant" last.
  {
    id: "cafe",
    label: "bizProfileOptions.cafe.label",
    match: ["cafe", "café", "coffee", "espresso"],
    placesType: ["cafe", "coffee_shop"],
    contentProfileId: "cafe_bakery",
    competitorNoun: "bizProfileOptions.cafe.competitorNoun",
  },
  {
    id: "bar",
    label: "bizProfileOptions.bar.label",
    match: ["bar", "pub", "tavern", "brewery", "taproom", "brewpub", "gastropub"],
    placesType: ["bar", "pub", "night_club"],
    contentProfileId: "restaurant",
    competitorNoun: "bizProfileOptions.bar.competitorNoun",
  },
  {
    id: "bakery",
    label: "bizProfileOptions.bakery.label",
    match: ["bakery", "patisserie", "bakeshop"],
    placesType: ["bakery"],
    contentProfileId: "cafe_bakery",
    competitorNoun: "bizProfileOptions.bakery.competitorNoun",
  },
  {
    id: "liquor_store",
    label: "bizProfileOptions.liquor_store.label",
    match: ["liquor", "wine shop", "spirits", "package store", "beer store"],
    placesType: ["liquor_store"],
    contentProfileId: "liquor_wine",
    competitorNoun: "bizProfileOptions.liquor_store.competitorNoun",
  },
  {
    id: "grocery_market",
    label: "bizProfileOptions.grocery_market.label",
    match: ["grocery", "supermarket", "convenience store", "mini mart", "corner store"],
    placesType: ["grocery_store", "supermarket", "convenience_store"],
    contentProfileId: "grocery_market",
    competitorNoun: "bizProfileOptions.grocery_market.competitorNoun",
  },
  {
    id: "restaurant",
    label: RESTAURANT_PROFILE.label,
    match: ["restaurant", "pizza", "diner", "burger", "taco", "sushi", "deli", "food", "eatery", "grill", "bistro", "bbq", "cafeteria"],
    placesType: ["restaurant", "meal_takeaway"],
    contentProfileId: "restaurant",
  },

  // Retail
  {
    id: "hardware_store",
    label: "bizProfileOptions.hardware_store.label",
    match: ["hardware store", "hardware"],
    placesType: ["hardware_store"],
    contentProfileId: "retail",
    competitorNoun: "bizProfileOptions.hardware_store.competitorNoun",
  },
  {
    id: "florist",
    label: "bizProfileOptions.florist.label",
    match: ["florist", "flower shop", "floral"],
    placesType: ["florist"],
    contentProfileId: "retail",
    competitorNoun: "bizProfileOptions.florist.competitorNoun",
  },
  {
    id: "retail_boutique",
    label: "bizProfileOptions.retail_boutique.label",
    match: ["boutique", "clothing store", "apparel", "gift shop", "shoe store", "retail store"],
    placesType: ["clothing_store", "gift_shop", "shoe_store"],
    contentProfileId: "retail",
    competitorNoun: "bizProfileOptions.retail_boutique.competitorNoun",
  },

  // Health, fitness & pets — narrower types (pet_services' own "clinic"-
  // free keywords, dentist) ahead of the broad "medical_clinic" catch-all
  // so a "Veterinary Clinic" or dental listing doesn't match on "clinic"
  // first.
  {
    id: "gym_fitness",
    label: "bizProfileOptions.gym_fitness.label",
    match: ["gym", "fitness center", "fitness studio", "crossfit", "yoga studio", "pilates studio"],
    placesType: ["gym", "fitness_center", "yoga_studio"],
    contentProfileId: "gym_fitness",
    competitorNoun: "bizProfileOptions.gym_fitness.competitorNoun",
  },
  {
    id: "pet_services",
    label: "bizProfileOptions.pet_services.label",
    match: ["veterinary", "vet clinic", "pet grooming", "dog walking", "pet sitting", "kennel", "pet store"],
    placesType: ["veterinary_care", "pet_store"],
    contentProfileId: "default",
    competitorNoun: "bizProfileOptions.pet_services.competitorNoun",
  },
  {
    id: "dentist",
    label: "bizProfileOptions.dentist.label",
    match: ["dentist", "dental", "orthodont"],
    placesType: ["dentist"],
    contentProfileId: "lawyer",
    competitorNoun: "bizProfileOptions.dentist.competitorNoun",
  },
  {
    id: "medical_clinic",
    label: "bizProfileOptions.medical_clinic.label",
    match: ["doctor", "medical center", "physician", "urgent care", "chiropractor", "optometrist", "clinic"],
    placesType: ["doctor", "medical_clinic", "physiotherapist"],
    contentProfileId: "lawyer",
    competitorNoun: "bizProfileOptions.medical_clinic.competitorNoun",
  },

  // Professional & advisory services
  {
    id: "lawyer",
    label: "bizProfileOptions.lawyer.label",
    match: ["lawyer", "attorney", "law firm", "law office", "legal services", "legal"],
    placesType: ["lawyer", "legal_services"],
    contentProfileId: "lawyer",
  },
  {
    id: "accountant",
    label: "bizProfileOptions.accountant.label",
    match: ["accountant", "accounting", "cpa", "tax service", "bookkeeping"],
    placesType: ["accounting"],
    contentProfileId: "professional_services",
    competitorNoun: "bizProfileOptions.accountant.competitorNoun",
  },
  {
    id: "real_estate",
    label: "bizProfileOptions.real_estate.label",
    match: ["real estate", "realtor", "realty"],
    placesType: ["real_estate_agency"],
    contentProfileId: "practitioner",
    competitorNoun: "bizProfileOptions.real_estate.competitorNoun",
  },
  {
    id: "consultant",
    label: "bizProfileOptions.consultant.label",
    match: ["consultant", "consulting", "advisory"],
    placesType: ["consultant"],
    contentProfileId: "practitioner",
    competitorNoun: "bizProfileOptions.consultant.competitorNoun",
  },
  {
    id: "coach",
    label: "bizProfileOptions.coach.label",
    match: ["coach", "coaching"],
    placesType: ["life_coach"],
    contentProfileId: "practitioner",
    competitorNoun: "bizProfileOptions.coach.competitorNoun",
  },
  {
    id: "tutor_education",
    label: "bizProfileOptions.tutor_education.label",
    match: ["tutor", "tutoring", "learning center", "test prep", "driving school", "music lessons"],
    placesType: ["tutoring_service"],
    contentProfileId: "practitioner",
    competitorNoun: "bizProfileOptions.tutor_education.competitorNoun",
  },
  {
    id: "photographer",
    label: "bizProfileOptions.photographer.label",
    match: ["photographer", "photography", "photo studio"],
    placesType: ["photography_studio"],
    contentProfileId: "practitioner",
    competitorNoun: "bizProfileOptions.photographer.competitorNoun",
  },
  {
    id: "practitioner",
    label: PRACTITIONER_PROFILE.label,
    match: ["therapist", "therapy", "counselor", "counseling", "personal trainer", "fitness instructor", "dance studio", "training studio"],
    placesType: ["consultant"],
    contentProfileId: "practitioner",
  },

  // Trades & home services — share the "trades" service-call content
  // profile (see TRADES_PROFILE): a plumber and an electrician run their
  // business the same way (priced by the call/job, not a purchase or a
  // booked session), so they reuse one hand-written content set rather
  // than each getting their own.
  {
    id: "auto_repair",
    label: "bizProfileOptions.auto_repair.label",
    match: ["auto repair", "mechanic", "car repair", "auto body", "tire shop"],
    placesType: ["car_repair"],
    contentProfileId: "trades",
    competitorNoun: "bizProfileOptions.auto_repair.competitorNoun",
  },
  {
    id: "plumber",
    label: "bizProfileOptions.plumber.label",
    match: ["plumber", "plumbing"],
    placesType: ["plumber"],
    contentProfileId: "trades",
    competitorNoun: "bizProfileOptions.plumber.competitorNoun",
  },
  {
    id: "electrician",
    label: "bizProfileOptions.electrician.label",
    match: ["electrician", "electrical contractor", "electrical service"],
    placesType: ["electrician"],
    contentProfileId: "trades",
    competitorNoun: "bizProfileOptions.electrician.competitorNoun",
  },
  {
    id: "landscaper",
    label: "bizProfileOptions.landscaper.label",
    match: ["landscap", "lawn care", "lawn service", "tree service"],
    placesType: ["landscaper"],
    contentProfileId: "trades",
    competitorNoun: "bizProfileOptions.landscaper.competitorNoun",
  },
  // repair_dropoff is deliberately positioned here — right before
  // cleaning_service, rather than in the "Day 2 new business types"
  // block below with the other 7 — so its own "dry cleaner"/"dry
  // cleaning" keywords get checked before cleaning_service's "cleaning
  // service" keyword. Without this, "Dry cleaning service" would match
  // cleaning_service's broader "cleaning service" keyword first, even
  // though it's a repair_dropoff business, not a house-cleaning one.
  // Every one of the 29 entries above this is still checked first, so
  // this can only ever take a business away from cleaning_service (the
  // one case it's meant to fix) or from something later in the list —
  // never from anything already resolved above. "House cleaning
  // service" still resolves to cleaning_service unchanged: none of
  // repair_dropoff's keywords appear in it.
  {
    id: "repair_dropoff",
    label: REPAIR_DROPOFF_PROFILE.label,
    match: REPAIR_DROPOFF_PROFILE.match,
    placesType: REPAIR_DROPOFF_PROFILE.placesType,
    contentProfileId: "repair_dropoff",
  },
  {
    id: "cleaning_service",
    label: "bizProfileOptions.cleaning_service.label",
    match: ["cleaning service", "house cleaning", "janitorial", "maid service"],
    placesType: ["house_cleaning"],
    contentProfileId: "trades",
    competitorNoun: "bizProfileOptions.cleaning_service.competitorNoun",
  },

  // Day 2 new business types — each owns its own dedicated content
  // profile (not shared), so `label` reuses that profile's own label
  // key directly, same as "salon"/"restaurant"/"default" above.
  // Deliberately appended at the very end, after every existing type
  // (repair_dropoff excepted — see above) and right before the
  // "default" catch-all: every entry above is still checked first for
  // any haystack, so no new keyword here can ever take over a business
  // an existing type already correctly detects — see the "Auto-detect
  // safety" section of ~/Desktop/new-types-review.md for the full
  // collision analysis.
  {
    id: "home_services",
    label: HOME_SERVICES_PROFILE.label,
    match: HOME_SERVICES_PROFILE.match,
    placesType: HOME_SERVICES_PROFILE.placesType,
    contentProfileId: "home_services",
  },
  {
    id: "recreation",
    label: RECREATION_PROFILE.label,
    match: RECREATION_PROFILE.match,
    placesType: RECREATION_PROFILE.placesType,
    contentProfileId: "recreation",
  },
  {
    id: "events",
    label: EVENTS_PROFILE.label,
    match: EVENTS_PROFILE.match,
    placesType: EVENTS_PROFILE.placesType,
    contentProfileId: "events",
  },
  {
    id: "car_wash_detailing",
    label: CAR_WASH_DETAILING_PROFILE.label,
    match: CAR_WASH_DETAILING_PROFILE.match,
    placesType: CAR_WASH_DETAILING_PROFILE.placesType,
    contentProfileId: "car_wash_detailing",
  },
  {
    id: "childcare",
    label: CHILDCARE_PROFILE.label,
    match: CHILDCARE_PROFILE.match,
    placesType: CHILDCARE_PROFILE.placesType,
    contentProfileId: "childcare",
  },
  {
    id: "lodging",
    label: LODGING_PROFILE.label,
    match: LODGING_PROFILE.match,
    placesType: LODGING_PROFILE.placesType,
    contentProfileId: "lodging",
  },
  {
    id: "tattoo_body_art",
    label: TATTOO_BODY_ART_PROFILE.label,
    match: TATTOO_BODY_ART_PROFILE.match,
    placesType: TATTOO_BODY_ART_PROFILE.placesType,
    contentProfileId: "tattoo_body_art",
  },

  // Catch-all — empty match list, so it's never reached by the keyword
  // scan below and only ever returned as the explicit final fallback.
  {
    id: "default",
    label: DEFAULT_PROFILE.label,
    match: [],
    placesType: [],
    contentProfileId: "default",
  },
];

const DEFAULT_OPTION = BUSINESS_TYPE_OPTIONS[BUSINESS_TYPE_OPTIONS.length - 1];

/** Combines one BusinessTypeOption's identity with its content profile's
 * actual coupon/offer/FAQ/pricing content into the BizProfile shape every
 * call site already expects. */
/** Combines one BusinessTypeOption's identity with its content profile's
 * actual coupon/offer/FAQ/pricing content into the BizProfileSource shape
 * localizeBizProfile() below can resolve — structural merge only, still
 * i18n keys throughout, not yet real text. */
function buildResolvedProfileSource(option: BusinessTypeOption): BizProfileSource {
  const content = CONTENT_PROFILES[option.contentProfileId];
  return {
    ...content,
    id: option.id,
    label: option.label,
    match: option.match,
    placesType: option.placesType,
    competitorNoun: option.competitorNoun ?? content.competitorNoun,
  };
}

/**
 * Resolves a business's real Google category/primary type to the right
 * business type. Never returns nothing — an unrecognized or missing
 * category (including the "too generic" case, e.g. a listing typed only
 * as "store" or "point_of_interest") falls through to the general
 * default, which is deliberately built to be useful on its own.
 *
 * Pure auto-detection only — does not know about an owner's manual
 * correction. Use resolveBizProfile() at any call site that should honor
 * business_type_override once one might exist.
 *
 * `locale` resolves every returned string (label, competitorNoun, coupon/
 * offer/referral/pricing copy, FAQ) in that language —
 * defaults to DEFAULT_LOCALE so every existing call site that hasn't been
 * updated to thread a real locale yet keeps getting exactly the English
 * text it always has.
 */
/**
 * A short keyword (5 characters or fewer, e.g. "deli", "spa", "bar",
 * "gym") is too likely to appear as a substring INSIDE an unrelated
 * word — "deli" inside "Delivery service", "lash" inside "Splash pad",
 * "bar" inside "Barbecue" — to safely match with plain substring
 * containment. Those match as a whole word only (word boundaries on
 * both sides), with an optional trailing "s" so "deli"/"delis" and
 * "nail"/"nails" both match. A longer keyword (more than 5 characters)
 * keeps today's plain substring matching, since that's exactly what
 * lets a prefix keyword like "landscap" (matches "landscaper" and
 * "landscaping" alike) or "orthodont" keep working.
 */
function keywordMatches(haystack: string, keyword: string): boolean {
  if (keyword.length > 5) return haystack.includes(keyword);
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`).test(haystack);
}

/**
 * Whole words/phrases a real law firm's own business name genuinely
 * uses — never a bare "law" stem, which would also match "Lawn Care"
 * or "Lawson's Bakery". Every alternative requires a real word boundary
 * on both sides (`\b`), so "Lawn"/"Lawson's" can never match "law firm"/
 * "law office(s)"/"lawyer(s)" — none of those phrases are substrings of
 * either name. Case-insensitive since a real business name's casing is
 * never guaranteed.
 */
const LAWYER_NAME_PATTERN = /\blaw\s+(?:firm|offices?)\b|\battorneys?\b|\blawyers?\b|\besq\.?\b/i;

/**
 * Conservative, lawyer-specific signal Google's own free-text category/
 * primary-type sometimes misses entirely (see Kimmel & Silverman PC,
 * Delaware Lemon Law Firm — real category "Consultant", real primary
 * type "consultant", neither of which contains any lawyer keyword) —
 * checked against two REAL, independent facts instead:
 *   1. Any of the business's REAL Google types (primary type, plus every
 *      secondary type in `categories` — Google often tags a listing with
 *      several) is a real legal Places type slug ("lawyer"/
 *      "legal_services", taken from the "lawyer" BusinessTypeOption's
 *      own placesType — never a second, separately-maintained list).
 *   2. The business's own real name matches LAWYER_NAME_PATTERN above.
 * Both are strong, specific, low-false-positive signals — never a bare
 * substring like "law" — so this is safe to let override a looser
 * generic-category match (e.g. "Consultant") elsewhere in bizProfile().
 */
function isLikelyLawFirm(
  primaryType: string | null | undefined,
  categories: string[] | null | undefined,
  name: string | null | undefined
): boolean {
  const lawyerOption = BUSINESS_TYPE_OPTIONS.find((o) => o.id === "lawyer");
  const legalPlacesTypes = new Set((lawyerOption?.placesType ?? []).map((t) => t.toLowerCase()));
  const realGoogleTypes = [primaryType, ...(categories ?? [])].filter((t): t is string => !!t);
  if (realGoogleTypes.some((t) => legalPlacesTypes.has(t.toLowerCase()))) return true;
  return !!name && LAWYER_NAME_PATTERN.test(name);
}

export function bizProfile(
  category: string | null | undefined,
  primaryType?: string | null,
  locale: Locale = DEFAULT_LOCALE,
  /** Every real secondary Google type for this business (businesses.
   * categories) — optional and appended last so every existing caller
   * keeps compiling and behaving identically without passing it; only
   * feeds isLikelyLawFirm's secondary-type check above. */
  categories?: string[] | null,
  /** The business's own real name — optional, same reasoning as
   * `categories`; only feeds isLikelyLawFirm's name-pattern check. */
  name?: string | null
): BizProfile {
  // Checked FIRST, ahead of the generic keyword loop below: a real
  // secondary Google type or a real name match is strong enough
  // evidence to correctly override a looser generic match (e.g.
  // "Consultant") the loop would otherwise return for a real law firm
  // Google itself mis-categorized. An owner's own manual correction
  // still always wins over this — see resolveBizProfile(), which only
  // ever calls this function as the no-override fallback.
  if (isLikelyLawFirm(primaryType, categories, name)) {
    const lawyerOption = BUSINESS_TYPE_OPTIONS.find((o) => o.id === "lawyer")!;
    return localizeBizProfile(buildResolvedProfileSource(lawyerOption), locale);
  }

  const haystack = `${category ?? ""} ${primaryType ?? ""}`.toLowerCase();
  if (!haystack.trim()) return localizeBizProfile(buildResolvedProfileSource(DEFAULT_OPTION), locale);

  for (const option of BUSINESS_TYPE_OPTIONS) {
    if (option.match.some((keyword) => keywordMatches(haystack, keyword))) {
      return localizeBizProfile(buildResolvedProfileSource(option), locale);
    }
  }

  return localizeBizProfile(buildResolvedProfileSource(DEFAULT_OPTION), locale);
}

export interface BizProfileOption {
  id: string;
  label: string;
}

/** For the "correct your business type" dropdown — every supported
 * business type's id/label, in the same order they're matched. A
 * function (not a static export) because each label now resolves from an
 * i18n key: the one real client-side consumer (BusinessMemoryPanel.tsx)
 * calls this with its own useLocale() value. */
export function getBizProfileOptions(locale: Locale = DEFAULT_LOCALE): BizProfileOption[] {
  return BUSINESS_TYPE_OPTIONS.map((o) => ({
    id: o.id,
    label: t(locale, o.label),
  }));
}

/** Looks up a business type by its own id (e.g. "barbershop") — used only
 * to apply an owner's manual override. Returns null for a missing or
 * unrecognized id rather than guessing, so callers can cleanly fall back
 * to auto-detection. */
export function bizProfileById(id: string | null | undefined, locale: Locale = DEFAULT_LOCALE): BizProfile | null {
  if (!id) return null;
  const option = BUSINESS_TYPE_OPTIONS.find((o) => o.id === id);
  return option ? localizeBizProfile(buildResolvedProfileSource(option), locale) : null;
}

/**
 * The business-type resolver every call site should use once an owner
 * override might exist: prefers a manual correction (business_type_
 * override, set from the assistant's "What I know about your business"
 * panel) when it names a real, still-supported type, and only falls back
 * to Google-category auto-detection (bizProfile()) when there's no
 * override on file. bizProfile() itself stays the pure auto-detection
 * primitive underneath.
 */
export function resolveBizProfile(
  category: string | null | undefined,
  primaryType: string | null | undefined,
  override?: string | null,
  locale: Locale = DEFAULT_LOCALE,
  /** Same optional, appended-last reasoning as bizProfile()'s own
   * `categories`/`name` params — only used when there's no override to
   * apply, since a manual correction always wins regardless of either. */
  categories?: string[] | null,
  name?: string | null
): BizProfile {
  return bizProfileById(override, locale) ?? bizProfile(category, primaryType, locale, categories, name);
}

/** Best-effort city extraction from a Google formatted address (typically
 * "Street, City, State ZIP, Country") for FAQ copy only — never used for
 * scoring or matching, so an imprecise guess here is low-stakes. Falls
 * back honestly rather than guessing wrong when the shape is unexpected.
 *
 * The fallback string itself isn't localized (no `locale` param here) —
 * its one real caller (app/business/[id]/website/page.tsx) calls this
 * once per site language and only ever hits this fallback for a business
 * with no usable address at all, same low-stakes reasoning as the rest
 * of this function. */
function extractCity(address: string | null | undefined): string {
  if (!address) return "your area";
  const parts = address.split(",").map((p) => p.trim());
  return parts.length >= 2 && parts[1] ? parts[1] : "your area";
}

/** Fills {businessName} / {city} tokens in a profile's FAQ with a real
 * business's actual data. The `faq` passed in should already be the
 * resolution for whichever site language the caller wants — pass the
 * result of resolveBizProfile(..., locale).faq for each language you
 * need (see app/business/[id]/website/page.tsx, which calls this once
 * per site language and lets the generator's own "Site language"
 * selector choose between them at render time). */
export function renderFaq(
  faq: FaqEntry[],
  business: { name: string | null; address: string | null }
): FaqEntry[] {
  const tokens: Record<string, string> = {
    businessName: business.name ?? "this business",
    city: extractCity(business.address),
  };
  const substitute = (text: string) =>
    text.replace(/\{(\w+)\}/g, (_match, key: string) => tokens[key] ?? `{${key}}`);

  return faq.map((entry) => ({
    question: substitute(entry.question),
    answer: substitute(entry.answer),
  }));
}
