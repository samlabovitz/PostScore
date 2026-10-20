// Counter tools for the Reviews page — things that make leaving a review
// easy (tap-to-review NFC stands and cards, QR table tents, counter
// signs). They never reward a review: Google forbids offering anything
// in exchange for one.
//
// Affiliate products go in COUNTER_TOOL_PRODUCTS below — one entry per
// product. Until it has entries, the Reviews page shows only the "Counter
// tools — coming soon" card (no links, no prices). Each product shows only
// to the plans listed, with a commission disclosure and rel="sponsored".

import type { Plan } from "./plan";
import type { Locale } from "./i18n";

export interface CounterToolProduct {
  id: string;
  name: Record<Locale, string>;
  /** https URL or a /public path. */
  image: string;
  /** US dollars, as the store lists it. */
  priceUsd: number;
  /** The affiliate link (https only). */
  url: string;
  /** Which plans see it. */
  plans: Plan[];
}

export const COUNTER_TOOL_PRODUCTS: CounterToolProduct[] = [];

/** The products this plan may see — only complete, https entries. */
export function visibleCounterProducts(plan: Plan, products: CounterToolProduct[] = COUNTER_TOOL_PRODUCTS): CounterToolProduct[] {
  return products.filter(
    (p) =>
      p.plans.includes(plan) &&
      /^https:\/\//.test(p.url) &&
      (/^https:\/\//.test(p.image) || p.image.startsWith("/")) &&
      Number.isFinite(p.priceUsd) &&
      p.priceUsd > 0 &&
      !!p.name.en.trim() &&
      !!p.name.es.trim()
  );
}

export function formatUsd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "es" ? "es-US" : "en-US", { style: "currency", currency: "USD" }).format(amount);
}
