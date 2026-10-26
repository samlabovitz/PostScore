"use client";

import type { GbpConnectResult } from "@/lib/gbpLanding";
import { t, type Locale } from "@/lib/i18n";

/** Our own words for a connect result (never raw text from the URL,
 * Google or the database). The no-match messages name the business from
 * PostScore's own record. */
export function gbpResultText(
  locale: Locale,
  result: GbpConnectResult,
  business: { name: string | null; address: string | null }
): string {
  if (result === "no_match" || result === "no_match_unverified") {
    const name = business.name ?? t(locale, "dashboard.common.businessFallback");
    const named = business.address ? t(locale, "dashboard.gbpResult.businessAt", { name, address: business.address }) : name;
    return t(locale, `dashboard.gbpResult.${result}`, { business: named });
  }
  return t(locale, `dashboard.gbpResult.${result}`);
}

/** "Connected: Hair express on Broadway, 9 S Broadway, …" once matched. */
export function gbpConnectedText(locale: Locale, title: string | null, address: string | null): string | null {
  const place = [title, address].filter(Boolean).join(", ");
  return place ? t(locale, "dashboard.gbp.connectedTo", { place }) : null;
}
