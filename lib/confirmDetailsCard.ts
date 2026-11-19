// Day 23 2d-5: the Overview's "Confirm your business details" card —
// shown after a business's first scan until the owner confirms their name,
// address, phone and hours (lib/ownerDetails.ts), so what they gave becomes
// what PostScore shows. "Not now" hides it until the next scan, once; a
// second "Not now" hides it for good. Kept in promo_dismissals
// (supabase/promo-dismissals.sql), per owner and business. Pure.

/** The first "Not now": `hidden_until` holds when it was pressed (the card
 * comes back after a scan saved later). */
export const CONFIRM_DETAILS_NOT_NOW_1 = "owner-details-not-now-1";
/** The second "Not now": hidden for good. */
export const CONFIRM_DETAILS_NOT_NOW_2 = "owner-details-not-now-2";

export interface ConfirmDetailsCardState {
  confirmed: boolean;
  /** No Google listing (website only): the owner already gave their details. */
  noListing: boolean;
  /** When the first "Not now" was pressed; null when it wasn't. */
  firstNotNowAt: string | null;
  secondNotNow: boolean;
  /** The newest real scan (never a scoring update); null before the first. */
  lastScanAt: string | null;
}

export function confirmDetailsCardShown(s: ConfirmDetailsCardState): boolean {
  if (s.confirmed || s.noListing || s.secondNotNow || !s.lastScanAt) return false;
  if (!s.firstNotNowAt) return true;
  // Back once, after the next scan.
  return Date.parse(s.lastScanAt) > Date.parse(s.firstNotNowAt);
}

/** The key "Not now" writes now. */
export function confirmDetailsNotNowKey(firstNotNowAt: string | null): typeof CONFIRM_DETAILS_NOT_NOW_1 | typeof CONFIRM_DETAILS_NOT_NOW_2 {
  return firstNotNowAt ? CONFIRM_DETAILS_NOT_NOW_2 : CONFIRM_DETAILS_NOT_NOW_1;
}
