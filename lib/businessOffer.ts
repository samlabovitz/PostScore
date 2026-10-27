// How "What PostAI knows about your business" talks about what a business
// sells — and what a typical sale is called — for its business type
// (config/bizProfiles.ts). Owner-entered values only; these are just the
// words around them. Pure.
//
// The values live where they always have: businesses.services ("what you
// offer") and avg_job_value_low/high ("typical spend"), plus
// businesses.differentiator ("what makes you different",
// supabase/business-differentiator.sql).

import { t, type Locale, type MessageKey } from "@/lib/i18n";

export type OfferKind = "services" | "products" | "menu" | "programs" | "neutral";

/** Every business type's kind. A type missing here gets the neutral wording. */
export const OFFER_KIND_BY_TYPE: Record<string, OfferKind> = {
  // Services: salons, trades, consultants, law, health…
  barbershop: "services",
  spa: "services",
  nail_salon: "services",
  salon: "services",
  pet_services: "services",
  dentist: "services",
  medical_clinic: "services",
  lawyer: "services",
  accountant: "services",
  real_estate: "services",
  consultant: "services",
  coach: "services",
  photographer: "services",
  practitioner: "services",
  auto_repair: "services",
  plumber: "services",
  electrician: "services",
  landscaper: "services",
  repair_dropoff: "services",
  cleaning_service: "services",
  home_services: "services",
  car_wash_detailing: "services",
  tattoo_body_art: "services",
  events: "services",
  // Products & brands: stores.
  liquor_store: "products",
  grocery_market: "products",
  hardware_store: "products",
  florist: "products",
  retail_boutique: "products",
  specialty_store: "products",
  // Menu favorites: food and drink.
  dessert_shop: "menu",
  cafe: "menu",
  bar: "menu",
  bakery: "menu",
  restaurant: "menu",
  // Programs & classes.
  community_center: "programs",
  gym_fitness: "programs",
  tutor_education: "programs",
  childcare: "programs",
  recreation: "programs",
  // Neutral: lodging, nonprofit, place_of_worship, default.
};

/** Types with their own example (the rest use their kind's). */
const TYPE_EXAMPLES = new Set([
  "salon",
  "nail_salon",
  "barbershop",
  "spa",
  "bakery",
  "dessert_shop",
  "cafe",
  "restaurant",
  "bar",
  "specialty_store",
  "liquor_store",
  "grocery_market",
  "florist",
  "hardware_store",
  "retail_boutique",
  "gym_fitness",
  "tutor_education",
  "plumber",
  "electrician",
  "lawyer",
  "auto_repair",
  "dentist",
]);

export function offerKindFor(businessTypeId: string | null | undefined): OfferKind {
  return (businessTypeId && OFFER_KIND_BY_TYPE[businessTypeId]) || "neutral";
}

export interface OfferWording {
  kind: OfferKind;
  /** "Services" / "Products & brands" / "Menu favorites" / … */
  offerLabel: string;
  /** "e.g. Balayage, keratin" */
  offerExample: string;
  /** Empty "what you offer": one friendly line. */
  offerPrompt: string;
  /** "Typical price per service" / "Typical purchase" / … */
  spendLabel: string;
  spendPrompt: string;
  differentLabel: string;
  differentExample: string;
  differentPrompt: string;
}

const k = (key: string) => key as MessageKey;

export function offerWording(businessTypeId: string | null | undefined, locale: Locale): OfferWording {
  const kind = offerKindFor(businessTypeId);
  const base = `dashboard.memory.kind.${kind}`;
  const example = businessTypeId && TYPE_EXAMPLES.has(businessTypeId) ? `dashboard.memory.example.${businessTypeId}` : `${base}.example`;
  return {
    kind,
    offerLabel: t(locale, k(`${base}.offer`)),
    offerExample: t(locale, k(example)),
    offerPrompt: t(locale, k(`${base}.prompt`)),
    spendLabel: t(locale, k(`${base}.spend`)),
    spendPrompt: t(locale, "dashboard.memory.spendPrompt"),
    differentLabel: t(locale, "dashboard.memory.differentLabel"),
    differentExample: t(locale, "dashboard.memory.differentExample"),
    differentPrompt: t(locale, "dashboard.memory.differentPrompt"),
  };
}

/** "$40–$120" (whole dollars stay whole). */
export function formatSpendRange(low: number, high: number): string {
  const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  return low === high ? money(low) : `${money(low)}–${money(high)}`;
}

/** The longest "what makes you different" line we keep. */
export const DIFFERENTIATOR_MAX = 160;

/** The owner's entries, as PostAI's context and FACTS block need them. */
export interface OwnerProvided {
  businessTypeId: string;
  services: string[];
  avgJobValueLow: number | null;
  avgJobValueHigh: number | null;
  differentiator?: string | null;
}

/** The owner's own entries from "What PostAI knows about your business",
 * labeled for the business type and as owner-provided — never verified by
 * PostScore. Also in the FACTS block (lib/postaiFacts.ts). */
export function ownerProvidedLines(profile: OwnerProvided): string[] {
  const words = offerWording(profile.businessTypeId, "en");
  return [
    profile.services.length > 0
      ? `${words.offerLabel} (owner-provided): ${profile.services.join(", ")}.`
      : `${words.offerLabel}: not added yet — the owner hasn't listed them in "What PostAI knows about your business".`,
    profile.avgJobValueLow !== null && profile.avgJobValueHigh !== null
      ? `${words.spendLabel} (owner-provided): ${formatSpendRange(profile.avgJobValueLow, profile.avgJobValueHigh)}.`
      : `${words.spendLabel}: not added yet.`,
    profile.differentiator ? `${words.differentLabel} (owner-provided): ${profile.differentiator}` : `${words.differentLabel}: not added yet.`,
  ];
}
