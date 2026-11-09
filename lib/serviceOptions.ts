// Online ordering, step 1 (Nov 10): Google's service options — takeout,
// delivery, curbside pickup, dine-in — shown as information on the Google
// Listing Completeness card for food businesses. No points. Never worded
// as "online ordering": these say how customers get the food, not that
// they can order online. Pure.

import { SERVICE_OPTION_FIELDS, type ServiceOption, type ServiceOptions } from "@/lib/google/places";
import { t, type Locale, type MessageKey } from "@/lib/i18n";

/** Food businesses (lib/bizProfiles ids): restaurants, cafés, bakeries, dessert shops. */
export const FOOD_PROFILE_IDS: readonly string[] = ["restaurant", "cafe", "bakery", "dessert_shop"];

export function isFoodBusiness(profileId: string | null | undefined): boolean {
  return !!profileId && FOOD_PROFILE_IDS.includes(profileId);
}

/** A saved businesses.google_service_options value: only real true/false
 * flags; null when never fetched (or unreadable). */
export function parseServiceOptions(value: unknown): ServiceOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: ServiceOptions = {};
  for (const f of SERVICE_OPTION_FIELDS) {
    const v = (value as Record<string, unknown>)[f];
    if (typeof v === "boolean") out[f] = v;
  }
  return out;
}

const ORDER: readonly ServiceOption[] = ["takeout", "delivery", "curbsidePickup", "dineIn"];

/** "Google shows: Takeout ✓ · Delivery ✓ · Curbside — not listed · Dine-in ✓".
 * A missing flag is "not listed" — never "no". */
export function serviceOptionsLine(options: ServiceOptions, locale: Locale): string {
  const parts = ORDER.map((f) => {
    const label = t(locale, `dashboard.serviceOptions.${f}` as MessageKey);
    const v = options[f];
    return v === true ? `${label} ✓` : v === false ? t(locale, "dashboard.serviceOptions.no", { label }) : t(locale, "dashboard.serviceOptions.notListed", { label });
  });
  return t(locale, "dashboard.serviceOptions.line", { list: parts.join(" · ") });
}
