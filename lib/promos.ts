// Pure helpers for the "Active promotions" / share / draft-content parts
// of the Growth → Coupons feature (Day 9 pass 2b). Persistence itself
// lives in app/actions/promos.ts (server actions) and
// supabase/schema.sql (the `promos` table + its enforced 2-active
// limit) — this module is just presentation logic: shaping a promo row
// for display, and generating the hand-off text the owner copies and
// posts themselves.

import { DEFAULT_LOCALE, t, tPlural, type Locale } from "@/lib/i18n";

/** The database also enforces this via a trigger (see
 * enforce_max_active_promos in supabase/schema.sql) — this constant is
 * only for UI copy/disabling, never the actual guarantee. */
export const MAX_ACTIVE_PROMOS = 2;

/** Mirrors the `promos` table's columns exactly (see supabase/schema.sql). */
export interface PromoRow {
  id: string;
  business_id: string;
  type: string;
  offer: string;
  code: string;
  instructions: string | null;
  terms: string | null;
  expiry: string | null;
  redemptions: number;
  active: boolean;
  created_at: string;
}

/** A short, honest label for how a promo is doing — never implies
 * anything beyond the real stored tally. `locale` defaults to
 * DEFAULT_LOCALE, same reasoning as lib/scoring.ts's scoreBusiness(), so
 * every existing caller that doesn't pass one keeps getting the exact
 * same English text this file used to hardcode. */
export function redemptionLabel(count: number, locale: Locale = DEFAULT_LOCALE): string {
  if (count === 0) return t(locale, "dashboard.common.noRedemptionsLogged");
  return tPlural(locale, "dashboard.common.redemptionCount", count);
}

interface CaptionInput {
  businessName: string;
  offer: string;
  code: string;
  expiryLabel: string;
  phone?: string | null;
}

/** A single pre-written caption combining the offer, business name,
 * code, expiry, and phone — meant to be copied verbatim into a Google
 * post, an Instagram/Facebook caption, or a text to regulars. The app
 * never sends this anywhere itself; see ShareCouponModal. */
export function buildShareCaption({ businessName, offer, code, expiryLabel, phone }: CaptionInput): string {
  const lines = [
    `${offer} at ${businessName}!`,
    `Show code ${code} to redeem. ${expiryLabel}.`,
  ];
  if (phone) lines.push(`Questions? Call ${phone}.`);
  return lines.join(" ");
}

// Day 23E: the copy-it-yourself Google post and FAQ drafts are gone — a
// coupon is posted on Google through the post flow (components/gbp/WeekPost.tsx,
// a Google Offer post on Premium), and the FAQ is the answers preview's
// website FAQ (lib/googleAnswers.ts faqHtml).
