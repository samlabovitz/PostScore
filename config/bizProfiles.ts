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
  /** Concrete, type-appropriate ideas for the Growth page. */
  growActions: string[];
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

const SALON_PROFILE: BizProfile = {
  id: "salon",
  label: "Salon & Personal Care",
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
  competitorNoun: "salons",
  couponPresets: [
    {
      id: "pct_off_next_appt",
      label: "10% off your next appointment",
      description: "A simple loyalty nudge — give it to anyone who books their next visit before leaving.",
    },
    {
      id: "flat_off_rebook",
      label: "$15 off your next visit when you rebook today",
      description: "Rewards booking ahead specifically, which smooths out your schedule.",
    },
    {
      id: "bring_a_friend",
      label: "Bring a friend: you both get 15% off",
      description: "Turns an existing client into new foot traffic without any ad spend.",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_special",
      label: "New client special: 20% off your first appointment",
      description: "The single highest-converting offer for a service business — removes the risk of trying someone new.",
    },
    {
      id: "referral_credit",
      label: "Referral reward: $10 credit for you and your friend",
      description: "Pairs well with the coupon above — give both people a reason to act.",
    },
  ],
  couponAngles: {
    firstTime: "New client special: 20% off your first appointment",
    seasonal: "Holiday styling special: book your seasonal look this week",
    slowDay: "20% off Tuesday & Wednesday appointments",
  },
  growActions: [
    "Ask every client at checkout for a Google review — the best time is right after a great appointment.",
    "Post real before/after photos weekly; personal-care listings live and die on photos.",
    "Offer a small rebooking discount right at checkout so the next visit gets locked in.",
    "Run a seasonal styling special around holidays or events people book ahead for.",
  ],
  faq: [
    {
      question: "Do I need an appointment at {businessName}?",
      answer: "We recommend booking ahead to guarantee your preferred time, though walk-ins may be available depending on the day.",
    },
    {
      question: "What areas does {businessName} serve near {city}?",
      answer: "We're located in {city} and welcome clients from the surrounding area.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "pct_off_both",
      referrerReward: "$15 off your next visit",
      friendReward: "20% off their first visit",
      description: "The classic salon referral — rewards loyalty and removes the risk of trying someone new.",
    },
    {
      id: "free_addon",
      referrerReward: "A free add-on (blowout, brow wax, etc.) on your next visit",
      friendReward: "10% off their first appointment",
      description: "Costs you time and product, not cash — a good option if you'd rather not discount services directly.",
    },
  ],
  pricingExamples: ["Women's Haircut", "Men's Haircut", "Color & Highlights"],
  pricingTips: [
    {
      id: "anchor_premium",
      label: "Anchor with your premium service",
      description:
        "List your most premium color or treatment service first on your menu — even clients who choose a basic cut anchor their expectations against it, making your mid-tier services feel reasonably priced by comparison.",
    },
    {
      id: "consult_price_chemical",
      label: "Price chemical services by consultation",
      description:
        "Hair length and thickness vary enormously; a flat price for color or treatments either underpays you on thick, long hair or overprices thin, short hair. Quote those after a quick look, not off a fixed menu price.",
    },
    {
      id: "good_better_best",
      label: "Offer a good/better/best tier",
      description:
        "A basic blowout, a deluxe version, and a premium add-on let clients self-select their spend instead of you guessing one price that's wrong for everyone.",
    },
    {
      id: "raise_when_booked_out",
      label: "Raise prices when you're consistently booked 1-2 weeks out",
      description:
        "A steadily full calendar — not just a busy Saturday — is the honest signal you're underpriced relative to demand.",
    },
  ],
};

const RESTAURANT_PROFILE: BizProfile = {
  id: "restaurant",
  label: "Restaurant & Food Service",
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
  competitorNoun: "restaurants",
  couponPresets: [
    {
      id: "free_item_with_purchase",
      label: "Free appetizer or dessert with any entrée",
      description: "Feels generous without discounting your core menu price.",
    },
    {
      id: "pct_off_pickup",
      label: "15% off pickup or online orders",
      description: "Pushes traffic toward your cheapest-to-fulfill order channel.",
    },
    {
      id: "bogo_entree",
      label: "Buy one entrée, get one 50% off (dine-in only)",
      description: "A classic slow-night traffic driver — restrict it to your quietest hours.",
    },
  ],
  offerTemplates: [
    {
      id: "happy_hour",
      label: "Happy hour: 20% off drinks, 4–6pm",
      description: "Fills the gap between lunch and dinner rushes.",
    },
    {
      id: "first_online_order",
      label: "First-time online order: free delivery",
      description: "Removes the biggest friction point for a customer trying you for the first time.",
    },
  ],
  couponAngles: {
    firstTime: "First-time online order: free delivery",
    seasonal: "Seasonal menu special: this month's feature, 15% off",
    slowDay: "Buy one entrée, get one 50% off — dine-in, Sunday–Tuesday",
  },
  growActions: [
    "Ask happy diners for a Google review before they leave, or on the receipt.",
    "Post daily or weekly specials as real photos — food photos are the single biggest driver of clicks.",
    "Make sure your menu and prices are current on your Google listing.",
    "Run a promotion on your slowest night of the week instead of discounting your busiest.",
  ],
  faq: [
    {
      question: "Does {businessName} take reservations?",
      answer: "Give us a call or check our website to see reservation availability.",
    },
    {
      question: "Does {businessName} offer takeout or delivery?",
      answer: "Yes — order for pickup directly, or through your preferred delivery app.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_item_both",
      referrerReward: "A free appetizer or dessert on your next visit",
      friendReward: "A free appetizer or dessert on their first order",
      description: "Free items cost less than a straight discount and feel generous to both sides.",
    },
    {
      id: "pct_off_both",
      referrerReward: "$10 off your next order",
      friendReward: "15% off their first order",
      description: "Straightforward cash-off works well for takeout and delivery orders.",
    },
  ],
  pricingExamples: ["Entrée", "Appetizer", "Dessert"],
  pricingTips: [
    {
      id: "anchor_standout_dish",
      label: "Anchor with one standout high-price dish",
      description:
        "A single $32 entrée on the menu makes every $18-22 entrée look reasonable by comparison, even if few people actually order the anchor item itself.",
    },
    {
      id: "steer_to_margin",
      label: "Steer orders to your best-margin items",
      description:
        "Highlighting a strong-margin dish (bolding it, adding \"chef's favorite\") lifts orders toward it without discounting anything.",
    },
    {
      id: "review_prices_periodically",
      label: "Review menu prices on a schedule, not by feel",
      description:
        "Many restaurants underprice for years because reprinting the menu feels like a hassle. A quarterly price review against your real food costs avoids slow margin erosion.",
    },
    {
      id: "bundle_combo",
      label: "Use combo or bundle pricing",
      description:
        "Pairing an app or side with an entrée at a set combined price increases the average ticket without feeling like a price hike to the customer.",
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
const LIQUOR_WINE_PROFILE: BizProfile = {
  id: "liquor_wine",
  label: "Liquor & Wine Store",
  match: ["liquor", "wine shop", "spirits", "package store", "beer store"],
  placesType: ["liquor_store"],
  competitorNoun: "liquor stores",
  couponPresets: [
    {
      id: "flat_off_purchase",
      label: "$5 off a $30+ purchase",
      description: "A simple threshold discount that nudges a single-bottle visit into a bigger basket.",
    },
    {
      id: "bottle_bogo_pct",
      label: "Buy 2 bottles, get 10% off",
      description: "Rewards buying more than one bottle without discounting your best sellers outright.",
    },
    {
      id: "case_discount",
      label: "10% off when you buy a full case (12 bottles)",
      description: "Standard retail case-discount math — moves volume and rewards your best customers.",
    },
  ],
  offerTemplates: [
    {
      id: "featured_bottle_month",
      label: "Featured wine or spirit of the month: 15% off",
      description: "Gives repeat customers a reason to check back, and lets you move a specific bottle.",
    },
    {
      id: "new_customer_pct",
      label: "New customer: 10% off your first purchase",
      description: "Low-risk way to get a first-time shopper to choose you over a bigger chain store.",
    },
  ],
  couponAngles: {
    firstTime: "New customer: 10% off your first purchase",
    seasonal: "Holiday case discount: 15% off mixed cases through New Year's",
    slowDay: "10% off purchases on your slowest weekday",
  },
  growActions: [
    "Ask regulars for a Google review at checkout — it's the fastest way to build trust with first-time shoppers.",
    "Post real photos of new arrivals, seasonal picks, and your featured bottle of the month.",
    "Highlight a weekly or monthly staff pick — gives repeat customers a reason to check back.",
    "Run a case-discount promotion around holidays (Thanksgiving, New Year's, summer cookouts) when case buying spikes.",
  ],
  faq: [
    {
      question: "Does {businessName} offer tastings or take special orders?",
      answer: "Call or stop by to ask about upcoming tastings and special-order requests.",
    },
    {
      question: "What are {businessName}'s hours near {city}?",
      answer: "See our current hours on our Google Business Profile listing.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "$5 credit toward your next purchase",
      friendReward: "$5 off their first purchase",
      description: "Simple cash-off works well for a straightforward retail purchase.",
    },
    {
      id: "case_discount_referral",
      referrerReward: "10% off your next case",
      friendReward: "10% off their first purchase",
      description: "Rewards your best (case-buying) customers specifically for bringing in new ones.",
    },
  ],
  pricingExamples: ["Bottle of Wine", "Six-Pack of Beer", "Case (12 bottles)"],
  pricingTips: [
    {
      id: "loss_leader_traffic",
      label: "Use a few loss-leader items to drive traffic",
      description:
        "A handful of well-known, aggressively-priced bottles get people in the door; make it back on higher-margin wine and spirits they buy alongside them.",
    },
    {
      id: "case_bulk_discount",
      label: "Price cases to reward bulk buying",
      description:
        "A standard 10-15% case discount is expected in this category — not offering one pushes case-sized purchases to a competitor who does.",
    },
    {
      id: "feature_margin_bottles",
      label: "Feature your best-margin bottles at eye level",
      description:
        "Placement and a \"staff pick\" tag lift sales on your best-margin bottles more effectively than discounting your worst-margin ones.",
    },
    {
      id: "seasonal_pricing",
      label: "Plan promotions around real seasonal demand spikes",
      description:
        "Holidays, tailgate season, and summer cookouts are when case-sized purchases naturally happen — put your promotional budget there instead of spreading it evenly all year.",
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
const GROCERY_MARKET_PROFILE: BizProfile = {
  id: "grocery_market",
  label: "Grocery / Market",
  match: ["grocery", "supermarket", "convenience store", "mini mart", "corner store"],
  placesType: ["grocery_store", "supermarket", "convenience_store"],
  competitorNoun: "grocery stores",
  couponPresets: [
    {
      id: "flat_off_basket",
      label: "$5 off a $40+ basket",
      description: "A threshold discount sized to your typical basket, not a single item.",
    },
    {
      id: "weekly_special",
      label: "This week's special: featured items discounted",
      description: "Keeps the store feeling fresh and gives shoppers a reason to check back weekly.",
    },
    {
      id: "loyalty_repeat",
      label: "Loyalty: every 10th shop, $10 off",
      description: "Rewards shopping frequency directly — the real driver of grocery revenue.",
    },
  ],
  offerTemplates: [
    {
      id: "new_shopper_special",
      label: "New shopper special: $10 off your first $40+ order",
      description: "Removes the risk of switching from wherever a shopper usually goes.",
    },
    {
      id: "seasonal_produce_sale",
      label: "Seasonal produce sale: this week's fresh picks discounted",
      description: "Moves perishable inventory while it's at its best, and reads as genuinely fresh.",
    },
  ],
  couponAngles: {
    firstTime: "New shopper special: $10 off your first $40+ order",
    seasonal: "Seasonal produce sale: this week's fresh picks discounted",
    slowDay: "$5 off a $40+ basket on your slowest shopping day",
  },
  growActions: [
    "Ask regular shoppers for a Google review at checkout.",
    "Post real photos of fresh produce and this week's specials — food photos drive foot traffic.",
    "Keep your weekly specials and hours current on your Google listing.",
    "Start a simple loyalty program (e.g. every 10th shop, $10 off) to reward repeat shoppers.",
  ],
  faq: [
    {
      question: "Does {businessName} offer delivery or curbside pickup?",
      answer: "Call or check our website to see current delivery and pickup options.",
    },
    {
      question: "What are {businessName}'s hours near {city}?",
      answer: "See our current hours on our Google Business Profile listing.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "$10 credit toward your next shop",
      friendReward: "$10 off their first $40+ order",
      description: "Store credit brings the referrer back for another shop, not just a one-time reward.",
    },
    {
      id: "pct_off_both",
      referrerReward: "10% off your next shop",
      friendReward: "10% off their first shop",
      description: "Simple and universally understood for a basket-based purchase.",
    },
  ],
  pricingExamples: ["Weekly Basket", "Featured Special Item", "Bulk/Case Item"],
  pricingTips: [
    {
      id: "loss_leader_weekly_specials",
      label: "Use weekly specials as loss leaders",
      description:
        "A few aggressively-priced staples each week pull shoppers in; the rest of their basket is where the real margin comes from.",
    },
    {
      id: "bulk_case_pricing",
      label: "Price bulk and case items to reward bigger baskets",
      description: "A modest per-unit discount on multi-packs increases average basket size without discounting everyday single items.",
    },
    {
      id: "seasonal_produce_pricing",
      label: "Adjust produce pricing to real seasonal supply costs",
      description: "Produce cost swings with the season — repricing it on a schedule protects margin better than a fixed year-round price.",
    },
    {
      id: "loyalty_raises_frequency",
      label: "Use loyalty rewards to raise visit frequency, not to discount margin",
      description: "A repeat-shop reward (every 10th visit, say) grows revenue by bringing shoppers back more often, rather than cutting the price of every visit.",
    },
  ],
};

/**
 * Counter-service coffee/baked-goods retail — sold by the item or drink,
 * not the entrée. Split out from RESTAURANT_PROFILE because a café or
 * bakery genuinely has no entrée to build an "appetizer or dessert with
 * your entrée" offer around; the unit here is the drink or the pastry.
 */
const CAFE_BAKERY_PROFILE: BizProfile = {
  id: "cafe_bakery",
  label: "Café & Bakery",
  match: ["cafe", "café", "coffee", "espresso", "bakery", "patisserie", "bakeshop"],
  placesType: ["cafe", "coffee_shop", "bakery"],
  competitorNoun: "cafes",
  couponPresets: [
    {
      id: "flat_off_order",
      label: "$2 off any order of $10+",
      description: "A low, easy threshold that fits a typical coffee-and-pastry order.",
    },
    {
      id: "free_item_with_purchase",
      label: "Free pastry or drink with any $15+ purchase",
      description: "Feels generous without discounting your core menu price.",
    },
    {
      id: "loyalty_punch",
      label: "Buy 9 drinks, get the 10th free",
      description: "The classic café loyalty structure — rewards habitual repeat visits.",
    },
  ],
  offerTemplates: [
    {
      id: "first_visit_special",
      label: "First-time customer: free drink or pastry with any purchase",
      description: "Removes the risk of trying somewhere new for their morning coffee run.",
    },
    {
      id: "morning_slow_hours",
      label: "20% off orders before 9am",
      description: "Fills your early slow hours instead of discounting your rush.",
    },
  ],
  couponAngles: {
    firstTime: "First-time customer: free drink or pastry with any purchase",
    seasonal: "Seasonal drink or pastry: try it this month, 15% off",
    slowDay: "20% off orders during your slowest afternoon hours",
  },
  growActions: [
    "Ask happy customers for a Google review before they leave.",
    "Post daily photos of fresh pastries, seasonal drinks, and the space itself.",
    "Keep your menu and prices current on your Google listing.",
    "Run a loyalty punch card (physical or digital) to reward regulars.",
  ],
  faq: [
    {
      question: "Does {businessName} have Wi-Fi or seating to work from?",
      answer: "Yes — stop in and ask about seating and Wi-Fi availability.",
    },
    {
      question: "Does {businessName} take special orders for cakes or catering?",
      answer: "Call or stop by to ask about special orders and catering.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_item_both",
      referrerReward: "A free drink or pastry on your next visit",
      friendReward: "A free drink or pastry on their first visit",
      description: "Free items cost less than a straight discount and feel generous to both sides.",
    },
    {
      id: "pct_off_both",
      referrerReward: "$5 off your next order",
      friendReward: "15% off their first order",
      description: "Straightforward cash-off for a typical coffee-shop order.",
    },
  ],
  pricingExamples: ["Coffee/Espresso Drink", "Pastry/Baked Good", "Sandwich or Light Bite"],
  pricingTips: [
    {
      id: "anchor_specialty_drink",
      label: "Anchor with a specialty or premium drink",
      description: "A $7 specialty latte on the board makes your $4.50 standard latte feel like the reasonable choice.",
    },
    {
      id: "bundle_combo",
      label: "Use combo pricing for a drink + pastry",
      description: "A set combined price for a drink and a pastry lifts average ticket without feeling like a price hike.",
    },
    {
      id: "review_ingredient_costs",
      label: "Review prices as ingredient costs shift",
      description: "Coffee, dairy, and flour costs move often; check menu pricing against real costs on a schedule rather than by feel.",
    },
    {
      id: "loyalty_over_discount",
      label: "Use a loyalty punch card instead of blanket discounts",
      description: "Rewarding the 10th visit costs less over time than discounting every visit, and it drives repeat frequency specifically.",
    },
  ],
};

const LAWYER_PROFILE: BizProfile = {
  id: "lawyer",
  label: "Legal Services",
  match: ["lawyer", "attorney", "law firm", "law office", "legal services", "legal"],
  placesType: ["lawyer", "legal_services"],
  competitorNoun: "firms",
  couponPresets: [
    {
      id: "free_consultation",
      label: "Free 30-minute initial consultation",
      description: "The standard, ethically uncomplicated way most firms lower the barrier to a first call.",
    },
    {
      id: "flat_fee_review",
      label: "Flat-fee case review for a set price",
      description: "Gives a price-anxious prospective client a known cost to get real advice.",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_doc_review",
      label: "New client discount on document preparation",
      description: "A concrete, bounded discount that doesn't touch contingency or hourly case work.",
    },
  ],
  couponAngles: {
    firstTime: "Free 30-minute initial consultation",
    seasonal: "Year-end document review special — get your paperwork in order",
    slowDay: "Flat-fee case review, available this week",
  },
  growActions: [
    "Ask satisfied clients for a Google review once their matter is resolved, where doing so is ethically appropriate.",
    "Publish a short, plain-language FAQ answering the questions {city} clients actually ask before calling.",
    "Keep your practice areas and attorney bios current — this is often the deciding factor between two firms.",
    "Respond calmly and professionally to any negative review; how a firm handles criticism is itself evidence to a prospective client.",
  ],
  faq: [
    {
      question: "Does {businessName} offer a free consultation?",
      answer: "Yes — call or use our contact form to schedule an initial consultation.",
    },
    {
      question: "What areas of law does {businessName} practice?",
      answer: "See our practice areas page for the specific matters we handle.",
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
  pricingExamples: ["Initial Consultation", "Flat-Fee Document Review", "Hourly Rate"],
  pricingTips: [
    {
      id: "flat_fee_commodity_work",
      label: "Use flat fees for commodity work",
      description:
        "For predictable matters like document review or uncontested filings, a known flat fee removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust.",
    },
    {
      id: "tiered_consultation",
      label: "Offer a tiered consultation",
      description:
        "A free 15-minute phone screen plus a paid 1-hour strategy session lets price-sensitive prospects self-select in without you working for free indefinitely.",
    },
    {
      id: "raise_when_turning_away_work",
      label: "Raise rates when you're turning away work",
      description:
        "Consistently declining matters you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase.",
    },
    {
      id: "scope_in_writing",
      label: "Put what's included in writing",
      description:
        "Being explicit about what a flat fee covers (and what triggers hourly billing) up front prevents fee disputes later.",
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
const PROFESSIONAL_SERVICES_PROFILE: BizProfile = {
  id: "professional_services",
  label: "Accounting & Tax",
  match: ["accountant", "accounting", "cpa", "tax service", "bookkeeping"],
  placesType: ["accounting"],
  competitorNoun: "accounting firms",
  couponPresets: [
    {
      id: "free_consultation",
      label: "Free 30-minute initial consultation",
      description: "Lowers the barrier to a first call for a prospect who isn't sure what they need yet.",
    },
    {
      id: "flat_fee_package",
      label: "Flat-fee package for a simple return or bookkeeping setup",
      description: "Gives a price-anxious prospective client a known cost instead of an open-ended hourly estimate.",
    },
    {
      id: "new_client_pct",
      label: "10% off your first year of service",
      description: "A bounded discount that doesn't touch your ongoing engagement rate.",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_return_discount",
      label: "New client discount: $50 off your first tax return",
      description: "A concrete, low-risk reason to switch from a prior preparer.",
    },
    {
      id: "bundle_bookkeeping_tax",
      label: "Bundle monthly bookkeeping and annual tax prep into one flat package price",
      description: "Packaging recurring and annual work together increases what a client books with you at once.",
    },
  ],
  couponAngles: {
    firstTime: "Free 30-minute initial consultation",
    seasonal: "Tax season special: book your return early and save",
    slowDay: "Flat-fee bookkeeping setup review, available this week",
  },
  growActions: [
    "Ask satisfied clients for a Google review once their return or engagement is complete.",
    "Publish a short FAQ answering the tax/bookkeeping questions {city} clients actually ask.",
    "Keep your services and credentials current on your listing — clients compare this directly.",
    "Offer a free consultation to convert price-sensitive prospects who are still deciding.",
  ],
  faq: [
    {
      question: "Does {businessName} offer a free consultation?",
      answer: "Yes — call or use our contact form to schedule an initial consultation.",
    },
    {
      question: "What services does {businessName} provide?",
      answer: "See our services page for the specific accounting and tax services we offer.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "$25 credit toward your next invoice",
      friendReward: "$50 off their first service",
      description: "Invoice credit keeps the referrer engaged as an ongoing client rather than a one-time discount.",
    },
    {
      id: "pct_off_both",
      referrerReward: "10% off your next year of service",
      friendReward: "10% off their first year",
      description: "Simple and proportional for an ongoing engagement rather than a one-off purchase.",
    },
  ],
  pricingExamples: ["Individual Tax Return", "Business Tax Return", "Monthly Bookkeeping"],
  pricingTips: [
    {
      id: "flat_fee_commodity_work",
      label: "Use flat fees for straightforward returns",
      description: "A known flat fee for a simple return removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust.",
    },
    {
      id: "tiered_by_complexity",
      label: "Tier pricing by complexity, not by client",
      description: "A simple/standard/complex return tier lets clients self-select based on their actual situation instead of one flat price under- or over-charging most of them.",
    },
    {
      id: "retainer_for_ongoing",
      label: "Use a monthly retainer for ongoing bookkeeping",
      description: "A predictable monthly retainer for recurring bookkeeping work is easier for a client to budget for than variable hourly billing, and smooths your own revenue.",
    },
    {
      id: "raise_when_turning_away_work",
      label: "Raise rates when you're turning away work",
      description: "Consistently declining new engagements you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase.",
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
const PRACTITIONER_PROFILE: BizProfile = {
  id: "practitioner",
  label: "Practitioner, Coaching & Classes",
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
  competitorNoun: "practitioners",
  couponPresets: [
    {
      id: "pct_off_next_session",
      label: "10% off your next session or class",
      description: "The direct equivalent of a loyalty discount when there's no product to discount instead.",
    },
    {
      id: "free_intro_consult",
      label: "Free consultation or intro session for new clients",
      description: "Lets a new client experience your style before committing money.",
    },
    {
      id: "class_pack_bonus",
      label: "Buy a 5-session pack, get 1 free",
      description: "Rewards commitment and smooths out your booking calendar.",
    },
  ],
  offerTemplates: [
    {
      id: "new_client_special",
      label: "New client special: 20% off your first session",
      description: "Same logic as any service business — remove the risk of trying someone new.",
    },
    {
      id: "referral_free_class",
      label: "Refer a friend: you both get a free class",
      description: "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    },
  ],
  couponAngles: {
    firstTime: "Free consultation or intro session for new clients",
    seasonal: "New season, new goals: 15% off a fresh session pack",
    slowDay: "10% off weekday morning sessions",
  },
  growActions: [
    "Ask clients for a Google review right after a session that clearly went well.",
    "Share a short client testimonial or result monthly — this stands in for the photos a storefront business would post.",
    "List your specialties and formats (virtual, in-person, group, 1:1) clearly, since you may not have a menu or storefront to show instead.",
    "Offer a free intro session or class to convert new leads who are still deciding.",
  ],
  faq: [
    {
      question: "Does {businessName} offer virtual or remote sessions?",
      answer: "Yes — ask about virtual options if an in-person session near {city} doesn't fit your schedule.",
    },
    {
      question: "Do I need to book an appointment with {businessName} in advance?",
      answer: "Yes, sessions are by appointment — reach out to check current availability.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_session_both",
      referrerReward: "A free class or session",
      friendReward: "A free class or session",
      description: "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    },
    {
      id: "credit_toward_session",
      referrerReward: "$15 credit toward your next session",
      friendReward: "20% off their first session",
      description: "Works well for 1:1 appointment-based practices where a free slot is a real cost.",
    },
  ],
  pricingExamples: ["1:1 Session", "Group Class", "Intro Session"],
  pricingTips: [
    {
      id: "package_pricing",
      label: "Sell session packages, not just singles",
      description:
        "A 5- or 10-session bundle rewards commitment and smooths your calendar, and clients who've prepaid rarely no-show.",
    },
    {
      id: "low_cost_intro",
      label: "Use a free or low-cost intro session to convert",
      description:
        "A short intro session converts hesitant leads without permanently discounting your real rate — keep it clearly framed as a one-time offer.",
    },
    {
      id: "raise_when_booked_out",
      label: "Raise your rate when you're consistently booked out",
      description:
        "A calendar that's full 2+ weeks ahead, week after week, is real demand — not just a busy stretch — and the honest signal it's time to raise your rate.",
    },
    {
      id: "price_by_format",
      label: "Price the same expertise differently by format",
      description:
        "A group class and a 1:1 session use the same skill but cost you very differently to deliver — price each by format rather than discounting your core 1:1 rate.",
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
const GYM_FITNESS_PROFILE: BizProfile = {
  id: "gym_fitness",
  label: "Gym & Fitness Studio",
  match: ["gym", "fitness center", "fitness studio", "crossfit", "yoga studio", "pilates studio"],
  placesType: ["gym", "fitness_center", "yoga_studio"],
  competitorNoun: "gyms",
  couponPresets: [
    {
      id: "first_month_pct",
      label: "50% off your first month",
      description: "The standard, highest-converting gym offer — removes the risk of committing to a new place.",
    },
    {
      id: "no_enrollment_fee",
      label: "No enrollment fee for new members this month",
      description: "Removes a common friction point without discounting your actual membership rate.",
    },
    {
      id: "class_pack_bonus",
      label: "Buy a 10-class pack, get 2 classes free",
      description: "Rewards commitment and smooths out class attendance without discounting drop-in rate.",
    },
  ],
  offerTemplates: [
    {
      id: "new_member_special",
      label: "New member special: 50% off your first month, no enrollment fee",
      description: "Stacks the two lowest-risk offers into one strong first-time hook.",
    },
    {
      id: "bring_a_friend",
      label: "Bring a friend: you both get a free class or session",
      description: "Costs you one class slot, not cash — effective since a class has near-zero marginal cost per extra person.",
    },
  ],
  couponAngles: {
    firstTime: "New member special: 50% off your first month, no enrollment fee",
    seasonal: "New Year, new goals: 50% off your first month",
    slowDay: "20% off off-peak (mid-day) class sign-ups",
  },
  growActions: [
    "Ask members for a Google review after a great class or a real milestone.",
    "Post real photos of classes, the space, and member results (with permission).",
    "Keep your class schedule and current promotions up to date on your listing.",
    "Run a 'bring a friend' week where existing members can bring a guest free.",
  ],
  faq: [
    {
      question: "Does {businessName} offer a free trial class or day pass?",
      answer: "Yes — ask about trial options when you stop by or call.",
    },
    {
      question: "What is {businessName}'s class schedule?",
      answer: "See our current class schedule on our website or by calling.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "free_month_both",
      referrerReward: "A free month of membership",
      friendReward: "50% off their first month",
      description: "Membership is your recurring revenue, so rewarding with more of it costs you less than it's worth to a member.",
    },
    {
      id: "free_session_both",
      referrerReward: "A free class or session",
      friendReward: "A free class or session",
      description: "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    },
  ],
  pricingExamples: ["Monthly Membership", "Drop-in Class", "Personal Training Session"],
  pricingTips: [
    {
      id: "tiered_membership",
      label: "Offer tiered membership levels",
      description: "A basic, unlimited, and premium-with-training tier lets members self-select their spend instead of one price fitting everyone poorly.",
    },
    {
      id: "annual_discount",
      label: "Discount annual memberships to lock in commitment",
      description: "A modest discount for paying annually improves your cash flow and retention more than it costs you in margin.",
    },
    {
      id: "off_peak_pricing",
      label: "Price off-peak sessions lower to fill slow hours",
      description: "Discounting mid-day or early-morning slots fills capacity that would otherwise sit empty, without touching your peak-hour rate.",
    },
    {
      id: "raise_when_classes_full",
      label: "Raise rates when classes are consistently full",
      description: "Waitlisted classes week after week are the honest signal you're underpriced relative to demand.",
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
const TRADES_PROFILE: BizProfile = {
  id: "trades",
  label: "Trades & Home Services",
  match: ["plumber", "plumbing", "electrician", "electrical", "auto repair", "mechanic", "landscap", "lawn care", "cleaning service", "house cleaning"],
  placesType: ["plumber", "electrician", "car_repair", "landscaper", "house_cleaning"],
  competitorNoun: "service providers",
  couponPresets: [
    {
      id: "flat_off_first_call",
      label: "$25 off your first service call",
      description: "Removes the risk of trying a new provider for a job that's otherwise hard to price-shop.",
    },
    {
      id: "seasonal_tuneup",
      label: "Seasonal tune-up special: $20 off an inspection or maintenance visit",
      description: "Fills your slower season with real, useful maintenance work instead of sitting idle.",
    },
    {
      id: "bundle_multiple_jobs",
      label: "10% off when you bundle two or more jobs in one visit",
      description: "Rewards a bigger ticket per trip out, which is where your real margin is (less drive time per dollar billed).",
    },
  ],
  offerTemplates: [
    {
      id: "new_customer_first_call",
      label: "New customer special: $25 off your first service call",
      description: "The single highest-converting offer for a trade — lowers the risk of trying someone new.",
    },
    {
      id: "seasonal_maintenance",
      label: "Seasonal maintenance special (e.g. AC tune-up before summer, furnace check before winter)",
      description: "Turns a predictable seasonal need into booked revenue before it becomes an emergency call.",
    },
  ],
  couponAngles: {
    firstTime: "New customer special: $25 off your first service call",
    seasonal: "Seasonal tune-up special: $20 off an inspection before the season changes",
    slowDay: "10% off service calls booked on weekday mornings",
  },
  growActions: [
    "Ask every satisfied customer for a Google review right after the job's done.",
    "Post real before/after photos of completed jobs.",
    "Keep your service area and emergency-availability info current on your listing.",
    "Offer a seasonal tune-up special to fill your slower season with booked work.",
  ],
  faq: [
    {
      question: "Does {businessName} offer emergency or same-day service?",
      answer: "Call to check current availability for emergency or same-day appointments.",
    },
    {
      question: "What areas near {city} does {businessName} serve?",
      answer: "We serve {city} and the surrounding area — call to confirm we cover your location.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "flat_off_both",
      referrerReward: "$25 off your next service call",
      friendReward: "$25 off their first service call",
      description: "Straightforward cash-off for a straightforward service-call business.",
    },
    {
      id: "pct_off_both",
      referrerReward: "10% off your next service",
      friendReward: "10% off their first service",
      description: "Scales with the job size instead of a flat amount that might be too small for a big job or too generous for a small one.",
    },
  ],
  pricingExamples: ["Service Call", "Standard Job", "Seasonal Tune-Up"],
  pricingTips: [
    {
      id: "flat_vs_hourly",
      label: "Decide flat-rate vs. hourly per job type",
      description: "A predictable job (a drain clog, an outlet swap) is a good flat-rate candidate; open-ended diagnostic work is better billed hourly so you're not eating the risk of the unknown.",
    },
    {
      id: "travel_radius_pricing",
      label: "Price a trip charge for jobs outside your core area",
      description: "A modest travel fee for farther jobs protects your margin without turning away work closer to home that doesn't need one.",
    },
    {
      id: "seasonal_demand_pricing",
      label: "Raise prices in your peak season, discount your slow one",
      description: "Demand for most trades swings hard by season — pricing flat all year leaves money on the table in peak months and idle capacity in slow ones.",
    },
    {
      id: "bundle_multiple_jobs",
      label: "Bundle multiple jobs at one property",
      description: "A small discount for handling two or three jobs in one visit still nets you more per hour than two separate trips.",
    },
  ],
};

/**
 * Purchase-based general retail — clothing, gifts, hardware, flowers, and
 * similar storefronts where the customer buys a physical item outright.
 * The offer structure centers on the purchase itself (a dollar threshold,
 * a multi-item deal) rather than a visit, a session, or a service call.
 */
const RETAIL_PROFILE: BizProfile = {
  id: "retail",
  label: "Retail Store",
  match: ["boutique", "clothing store", "apparel", "gift shop", "shoe store", "retail store", "hardware store", "hardware", "florist", "flower shop", "floral"],
  placesType: ["clothing_store", "gift_shop", "shoe_store", "hardware_store", "florist"],
  competitorNoun: "retailers",
  couponPresets: [
    {
      id: "flat_off_threshold",
      label: "$10 off a $50+ purchase",
      description: "A threshold discount that nudges a smaller purchase into a bigger one.",
    },
    {
      id: "bogo",
      label: "Buy one, get one 50% off select items",
      description: "A classic retail traffic driver — great for moving seasonal or overstocked items.",
    },
    {
      id: "bulk_discount",
      label: "10% off when you buy 3 or more",
      description: "Rewards a bigger basket without discounting a single-item purchase.",
    },
  ],
  offerTemplates: [
    {
      id: "welcome_offer",
      label: "New customer welcome offer: 15% off your first purchase",
      description: "Give first-time customers a clear reason to choose you over a competitor.",
    },
    {
      id: "seasonal_clearance",
      label: "Seasonal sale: discount last season's stock to make room for new arrivals",
      description: "Moves aging inventory while giving repeat customers a reason to check back.",
    },
  ],
  couponAngles: {
    firstTime: "New customer welcome offer: 15% off your first purchase",
    seasonal: "Seasonal sale — tied to the season or an upcoming holiday",
    slowDay: "$10 off a $50+ purchase on your slowest shopping day",
  },
  growActions: [
    "Ask happy customers for a Google review at checkout.",
    "Post real photos of new arrivals and in-store displays weekly.",
    "Keep your hours and current promotions up to date on your Google listing.",
    "Run a seasonal clearance sale to move older stock and highlight new arrivals.",
  ],
  faq: [
    {
      question: "Does {businessName} accept returns or exchanges?",
      answer: "Yes — ask about our return and exchange policy at checkout.",
    },
    {
      question: "What are {businessName}'s hours near {city}?",
      answer: "See our current hours on our Google Business Profile listing.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "$10 store credit",
      friendReward: "$10 off their first purchase",
      description: "Store credit keeps the referrer coming back rather than a one-time cash reward.",
    },
    {
      id: "pct_off_both",
      referrerReward: "10% off your next purchase",
      friendReward: "15% off their first purchase",
      description: "Simple and universally understood for a straightforward retail purchase.",
    },
  ],
  pricingExamples: ["Standard Item", "Featured/New Arrival", "Bulk/Multi-pack"],
  pricingTips: [
    {
      id: "anchor_pricing",
      label: "Anchor with your highest-priced item",
      description: "Showing a premium option first makes your mid-tier items feel reasonably priced by comparison.",
    },
    {
      id: "bulk_bundle_pricing",
      label: "Price bundles or multi-packs to increase average sale",
      description: "A modest per-unit discount on a bundle lifts average sale size without discounting a single-item purchase.",
    },
    {
      id: "seasonal_markdowns",
      label: "Plan a seasonal markdown schedule",
      description: "A planned clearance cadence (end of season, holiday) protects margin better than ad hoc discounting whenever inventory feels stale.",
    },
    {
      id: "raise_on_demand",
      label: "Raise prices on items that consistently sell out",
      description: "An item that sells out every time you restock it is underpriced relative to real demand.",
    },
  ],
};

/**
 * The fallback for anything unrecognized. Must be genuinely useful on
 * its own — never a "we couldn't categorize you" dead end — since a
 * business's Google category can be missing, generic, or just not one
 * we've written a specific profile for yet.
 */
const DEFAULT_PROFILE: BizProfile = {
  id: "default",
  label: "General Business",
  match: [],
  placesType: [],
  competitorNoun: "businesses",
  couponPresets: [
    {
      id: "flat_off_purchase",
      label: "$10 off a $50+ purchase or visit",
      description: "Works for almost any transaction-based business without assuming how you charge.",
    },
    {
      id: "pct_off_new_customer",
      label: "10% off for new customers",
      description: "A low-risk, universally understood way to convert a first-time visitor.",
    },
  ],
  offerTemplates: [
    {
      id: "welcome_offer",
      label: "New customer welcome offer",
      description: "Give first-time customers a clear reason to choose you over a competitor.",
    },
    {
      id: "seasonal_special",
      label: "Seasonal special",
      description: "Tie a promotion to a real calendar moment relevant to your customers.",
    },
  ],
  couponAngles: {
    firstTime: "10% off for new customers",
    seasonal: "Seasonal special — tied to what's happening this month",
    slowDay: "$10 off a $50+ purchase or visit on your slowest day of the week",
  },
  growActions: [
    "Ask happy customers for a Google review — it's the single highest-leverage thing most small businesses skip.",
    "Keep your hours, phone number, and website current on your Google listing.",
    "Add a few recent, real photos of your business.",
    "Reply to every review you get, positive or negative — it's visible to every future customer.",
  ],
  faq: [
    {
      question: "How can I contact {businessName}?",
      answer: "Call us or use the contact information on our Google listing.",
    },
    {
      question: "What are {businessName}'s hours?",
      answer: "See our current hours on our Google Business Profile listing.",
    },
  ],
  referralOk: true,
  referralPresets: [
    {
      id: "credit_both",
      referrerReward: "$10 account credit",
      friendReward: "$10 off their first purchase",
      description: "Account credit keeps them coming back; works for almost any retail or transaction-based business.",
    },
    {
      id: "pct_off_both",
      referrerReward: "10% off your next purchase",
      friendReward: "10% off their first purchase",
      description: "A simple, universally understood reward for both sides.",
    },
  ],
  pricingExamples: ["Standard Service", "Service Call", "Product/Item"],
  pricingTips: [
    {
      id: "anchor_pricing",
      label: "Anchor with your highest-priced option",
      description:
        "Showing your highest-priced option first makes your mid-tier option feel like the reasonable middle ground, even if few customers pick the anchor itself.",
    },
    {
      id: "good_better_best",
      label: "Offer a good/better/best tier",
      description:
        "A basic, a standard, and a premium option each give price-sensitive and premium customers a natural fit — one price is rarely right for both.",
    },
    {
      id: "raise_when_consistently_busy",
      label: "Raise prices on sustained demand, not a hunch",
      description:
        "Being consistently busy for weeks — not just one good week — is the honest signal you're underpriced, not how long it's been since your last increase.",
    },
    {
      id: "bundle_package",
      label: "Bundle or package related work",
      description:
        "Combining related services or items into one package price can lift your average sale without feeling like a price increase to the customer.",
    },
  ],
};

export { DEFAULT_PROFILE };

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
  | "default";

const CONTENT_PROFILES: Record<ContentProfileId, BizProfile> = {
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
  label: string;
  /**
   * Keywords matched case-insensitively against the business's Google
   * category (display name) and primary type (machine slug). Checked in
   * the order BUSINESS_TYPE_OPTIONS lists them, first hit wins — so a
   * narrower type (e.g. "barbershop") is listed ahead of the broader
   * type it would otherwise be swallowed by (e.g. generic "salon") and
   * no keyword is reused across two entries.
   */
  match: string[];
  /** Representative Google Places type slugs — informational metadata,
   * not a rewiring of lib/competitors.ts's own matching. */
  placesType: string[];
  /** Which hand-written content this type's coupons/offers/growth ideas/
   * FAQ/pricing tips/referral rules actually come from. */
  contentProfileId: ContentProfileId;
  /**
   * Overrides the content profile's own competitorNoun (e.g. "barbershops"
   * instead of the salon content's "salons") — every other field is
   * reused as-is. Omit to just use the content profile's own noun.
   */
  competitorNoun?: string;
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
    label: "Barbershop",
    match: ["barber"],
    placesType: ["barber_shop"],
    contentProfileId: "salon",
    competitorNoun: "barbershops",
  },
  {
    id: "spa",
    label: "Spa & Wellness",
    match: ["spa", "massage", "day spa"],
    placesType: ["spa", "day_spa", "massage"],
    contentProfileId: "salon",
    competitorNoun: "spas",
  },
  {
    id: "nail_salon",
    label: "Nail Salon",
    match: ["nail salon", "nail", "lash", "brow"],
    placesType: ["nail_salon"],
    contentProfileId: "salon",
    competitorNoun: "nail salons",
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
    label: "Café / Coffee Shop",
    match: ["cafe", "café", "coffee", "espresso"],
    placesType: ["cafe", "coffee_shop"],
    contentProfileId: "cafe_bakery",
    competitorNoun: "cafes",
  },
  {
    id: "bar",
    label: "Bar / Pub",
    match: ["bar", "pub", "tavern", "brewery", "taproom"],
    placesType: ["bar", "pub", "night_club"],
    contentProfileId: "restaurant",
    competitorNoun: "bars",
  },
  {
    id: "bakery",
    label: "Bakery",
    match: ["bakery", "patisserie", "bakeshop"],
    placesType: ["bakery"],
    contentProfileId: "cafe_bakery",
    competitorNoun: "bakeries",
  },
  {
    id: "liquor_store",
    label: "Liquor & Wine Store",
    match: ["liquor", "wine shop", "spirits", "package store", "beer store"],
    placesType: ["liquor_store"],
    contentProfileId: "liquor_wine",
    competitorNoun: "liquor stores",
  },
  {
    id: "grocery_market",
    label: "Grocery / Market",
    match: ["grocery", "supermarket", "convenience store", "mini mart", "corner store"],
    placesType: ["grocery_store", "supermarket", "convenience_store"],
    contentProfileId: "grocery_market",
    competitorNoun: "grocery stores",
  },
  {
    id: "restaurant",
    label: RESTAURANT_PROFILE.label,
    match: ["restaurant", "pizza", "diner", "burger", "taco", "sushi", "deli", "food", "eatery", "grill", "bistro", "bbq"],
    placesType: ["restaurant", "meal_takeaway"],
    contentProfileId: "restaurant",
  },

  // Retail
  {
    id: "hardware_store",
    label: "Hardware Store",
    match: ["hardware store", "hardware"],
    placesType: ["hardware_store"],
    contentProfileId: "retail",
    competitorNoun: "hardware stores",
  },
  {
    id: "florist",
    label: "Florist",
    match: ["florist", "flower shop", "floral"],
    placesType: ["florist"],
    contentProfileId: "retail",
    competitorNoun: "florists",
  },
  {
    id: "retail_boutique",
    label: "Retail / Boutique",
    match: ["boutique", "clothing store", "apparel", "gift shop", "shoe store", "retail store"],
    placesType: ["clothing_store", "gift_shop", "shoe_store"],
    contentProfileId: "retail",
    competitorNoun: "boutiques",
  },

  // Health, fitness & pets — narrower types (pet_services' own "clinic"-
  // free keywords, dentist) ahead of the broad "medical_clinic" catch-all
  // so a "Veterinary Clinic" or dental listing doesn't match on "clinic"
  // first.
  {
    id: "gym_fitness",
    label: "Gym & Fitness Studio",
    match: ["gym", "fitness center", "fitness studio", "crossfit", "yoga studio", "pilates studio"],
    placesType: ["gym", "fitness_center", "yoga_studio"],
    contentProfileId: "gym_fitness",
    competitorNoun: "gyms",
  },
  {
    id: "pet_services",
    label: "Pet Services",
    match: ["veterinary", "vet clinic", "pet grooming", "dog walking", "pet sitting", "kennel", "pet store"],
    placesType: ["veterinary_care", "pet_store"],
    contentProfileId: "default",
    competitorNoun: "pet-service businesses",
  },
  {
    id: "dentist",
    label: "Dentist",
    match: ["dentist", "dental", "orthodont"],
    placesType: ["dentist"],
    contentProfileId: "lawyer",
    competitorNoun: "dental practices",
  },
  {
    id: "medical_clinic",
    label: "Medical / Clinic",
    match: ["doctor", "medical center", "physician", "urgent care", "chiropractor", "optometrist", "clinic"],
    placesType: ["doctor", "medical_clinic", "physiotherapist"],
    contentProfileId: "lawyer",
    competitorNoun: "medical practices",
  },

  // Professional & advisory services
  {
    id: "lawyer",
    label: "Law Firm",
    match: ["lawyer", "attorney", "law firm", "law office", "legal services", "legal"],
    placesType: ["lawyer", "legal_services"],
    contentProfileId: "lawyer",
  },
  {
    id: "accountant",
    label: "Accounting & Tax",
    match: ["accountant", "accounting", "cpa", "tax service", "bookkeeping"],
    placesType: ["accounting"],
    contentProfileId: "professional_services",
    competitorNoun: "accounting firms",
  },
  {
    id: "real_estate",
    label: "Real Estate",
    match: ["real estate", "realtor", "realty"],
    placesType: ["real_estate_agency"],
    contentProfileId: "practitioner",
    competitorNoun: "real estate agencies",
  },
  {
    id: "consultant",
    label: "Consulting",
    match: ["consultant", "consulting", "advisory"],
    placesType: ["consultant"],
    contentProfileId: "practitioner",
    competitorNoun: "consultants",
  },
  {
    id: "coach",
    label: "Coaching",
    match: ["coach", "coaching"],
    placesType: ["life_coach"],
    contentProfileId: "practitioner",
    competitorNoun: "coaches",
  },
  {
    id: "tutor_education",
    label: "Tutoring & Education",
    match: ["tutor", "tutoring", "learning center", "test prep", "driving school", "music lessons"],
    placesType: ["tutoring_service"],
    contentProfileId: "practitioner",
    competitorNoun: "tutoring services",
  },
  {
    id: "photographer",
    label: "Photography",
    match: ["photographer", "photography", "photo studio"],
    placesType: ["photography_studio"],
    contentProfileId: "practitioner",
    competitorNoun: "photographers",
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
    label: "Auto Repair",
    match: ["auto repair", "mechanic", "car repair", "auto body", "tire shop"],
    placesType: ["car_repair"],
    contentProfileId: "trades",
    competitorNoun: "auto shops",
  },
  {
    id: "plumber",
    label: "Plumbing",
    match: ["plumber", "plumbing"],
    placesType: ["plumber"],
    contentProfileId: "trades",
    competitorNoun: "plumbers",
  },
  {
    id: "electrician",
    label: "Electrical",
    match: ["electrician", "electrical contractor", "electrical service"],
    placesType: ["electrician"],
    contentProfileId: "trades",
    competitorNoun: "electricians",
  },
  {
    id: "landscaper",
    label: "Landscaping",
    match: ["landscap", "lawn care", "lawn service", "tree service"],
    placesType: ["landscaper"],
    contentProfileId: "trades",
    competitorNoun: "landscapers",
  },
  {
    id: "cleaning_service",
    label: "Cleaning Service",
    match: ["cleaning service", "house cleaning", "janitorial", "maid service"],
    placesType: ["house_cleaning"],
    contentProfileId: "trades",
    competitorNoun: "cleaning services",
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
function buildResolvedProfile(option: BusinessTypeOption): BizProfile {
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
 */
export function bizProfile(
  category: string | null | undefined,
  primaryType?: string | null
): BizProfile {
  const haystack = `${category ?? ""} ${primaryType ?? ""}`.toLowerCase();
  if (!haystack.trim()) return buildResolvedProfile(DEFAULT_OPTION);

  for (const option of BUSINESS_TYPE_OPTIONS) {
    if (option.match.some((keyword) => haystack.includes(keyword))) {
      return buildResolvedProfile(option);
    }
  }

  return buildResolvedProfile(DEFAULT_OPTION);
}

export interface BizProfileOption {
  id: string;
  label: string;
}

/** For the "correct your business type" dropdown — every supported
 * business type's id/label, in the same order they're matched. */
export const BIZ_PROFILE_OPTIONS: BizProfileOption[] = BUSINESS_TYPE_OPTIONS.map((o) => ({
  id: o.id,
  label: o.label,
}));

/** Looks up a business type by its own id (e.g. "barbershop") — used only
 * to apply an owner's manual override. Returns null for a missing or
 * unrecognized id rather than guessing, so callers can cleanly fall back
 * to auto-detection. */
export function bizProfileById(id: string | null | undefined): BizProfile | null {
  if (!id) return null;
  const option = BUSINESS_TYPE_OPTIONS.find((o) => o.id === id);
  return option ? buildResolvedProfile(option) : null;
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
  override?: string | null
): BizProfile {
  return bizProfileById(override) ?? bizProfile(category, primaryType);
}

/** Best-effort city extraction from a Google formatted address (typically
 * "Street, City, State ZIP, Country") for FAQ copy only — never used for
 * scoring or matching, so an imprecise guess here is low-stakes. Falls
 * back honestly rather than guessing wrong when the shape is unexpected. */
function extractCity(address: string | null | undefined): string {
  if (!address) return "your area";
  const parts = address.split(",").map((p) => p.trim());
  return parts.length >= 2 && parts[1] ? parts[1] : "your area";
}

/** Fills {businessName} / {city} tokens in a profile's FAQ with a real
 * business's actual data. */
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
