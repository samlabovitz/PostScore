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
};

/**
 * Checked in order — the first profile whose `match` list hits wins.
 * Keep more specific keyword sets ahead of looser ones if that ever
 * matters; today's four sets don't overlap.
 */
const BIZ_PROFILES: BizProfile[] = [
  SALON_PROFILE,
  RESTAURANT_PROFILE,
  LAWYER_PROFILE,
  PRACTITIONER_PROFILE,
];

export { DEFAULT_PROFILE };

/**
 * Resolves a business's real Google category/primary type to the right
 * profile. Never returns nothing — an unrecognized or missing category
 * (including the "too generic" case, e.g. a listing typed only as
 * "store" or "point_of_interest") falls through to DEFAULT_PROFILE,
 * which is deliberately built to be useful on its own.
 */
export function bizProfile(
  category: string | null | undefined,
  primaryType?: string | null
): BizProfile {
  const haystack = `${category ?? ""} ${primaryType ?? ""}`.toLowerCase();
  if (!haystack.trim()) return DEFAULT_PROFILE;

  for (const profile of BIZ_PROFILES) {
    if (profile.match.some((keyword) => haystack.includes(keyword))) {
      return profile;
    }
  }

  return DEFAULT_PROFILE;
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
