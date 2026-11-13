// The ONE switch for how PostScore describes editing the Google listing and
// posting review replies. Both are built — Edit on Google and the Google
// reviews inbox, labeled Beta — but they only write to Google for the
// businesses on GOOGLE_WRITES_LIVE_PLACES (lib/gbpReviewPractice.ts). So
// until that is on for real customers, every plan line, card and Compare
// plans cell about them says Beta (built, switched on for a few businesses
// so far, never promised as live for everyone), and the Premium plan bullet
// keeps "Posting replies to Google: coming soon".
//
// LAUNCH: set GOOGLE_WRITES_FOR_EVERYONE to true when GOOGLE_WRITES_LIVE_PLACES
// is on for real customers. Every wording below flips with it, in English
// and Spanish, and so do Compare plans, the promo "coming soon" chips and
// PostAI's plan facts. A constant, not an env read: these lines render in
// client components. Pure.

import type { MessageKey } from "./i18n";

export const GOOGLE_WRITES_FOR_EVERYONE = false;

/** Each wording: [until launch (Beta / coming soon), after launch]. */
const COPY = {
  // Google Profile tab → Google connection card.
  connectBody: ["dashboard.googleProfile.connectBody", "dashboard.googleProfile.connectBodyLive"],
  // The read-only reply check's Premium upsell (Overview, Reviews).
  premiumUpsell: ["dashboard.gbp.premiumUpsell", "dashboard.gbp.premiumUpsellLive"],
  // Settings → Compare plans: the Premium card.
  premiumPromise: ["dashboard.settings.plans.promise.premium", "dashboard.settings.plans.promise.premiumLive"],
  fixesBullet: ["dashboard.settings.plans.bullet.premium.fixes", "dashboard.settings.plans.bullet.premium.fixesLive"],
  repliesBullet: ["dashboard.settings.plans.bullet.premium.replies", "dashboard.settings.plans.bullet.premium.repliesLive"],
  // Settings → Compare plans: the "AI review replies" Premium cell.
  repliesValue: ["dashboard.settings.plans.value.repliesUnlimited", "dashboard.settings.plans.value.repliesUnlimitedLive"],
  // Reviews → Reply assistant: the Premium plan line.
  reviewsPlanLine: ["dashboard.websiteReviews.premiumRepliesLine", "dashboard.websiteReviews.premiumRepliesLineLive"],
  // Promos: the Google Profile unlock line, showroom bullet, chip, plan list and promo box line.
  unlockConnect: ["dashboard.upgrade.unlock.connect", "dashboard.upgrade.unlock.connectLive"],
  showroomGrowthP1: ["dashboard.free.showroom.growth.p1", "dashboard.free.showroom.growth.p1Live"],
  doneForYouChip: ["dashboard.upgrade.chip.doneForYou", "dashboard.upgrade.chip.doneForYouLive"],
  planListGoogleProfile: ["dashboard.free.planList.googleProfile.h", "dashboard.free.planList.googleProfile.hLive"],
  promoGoogleProfileB1: ["dashboard.upgrade.feature.googleProfile.b1", "dashboard.upgrade.feature.googleProfile.b1Live"],
} as const satisfies Record<string, readonly [MessageKey, MessageKey]>;

export type GoogleWritesCopy = keyof typeof COPY;

/** The wording for now: Beta until launch, plain after. */
export function googleWritesCopy(id: GoogleWritesCopy, launched: boolean = GOOGLE_WRITES_FOR_EVERYONE): MessageKey {
  return COPY[id][launched ? 1 : 0];
}

/** Every pair, for tests. */
export const GOOGLE_WRITES_COPY = COPY;

/** Posting review replies to Google stays "coming soon" in the promo chips,
 * the plan list and the promo box until launch (the Premium bullet decides). */
export function postingRepliesSoon(launched: boolean = GOOGLE_WRITES_FOR_EVERYONE): boolean {
  return !launched;
}
