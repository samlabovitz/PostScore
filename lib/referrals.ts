// Pure helpers for the "Active referral" tracking part of the Growth →
// Refer a friend feature (Day 10 pass 2). Persistence itself lives in
// app/actions/referrals.ts (server actions) and supabase/schema.sql
// (the dedicated `referrals` table + its enforced 1-active limit) —
// this module is just presentation logic, mirroring lib/promos.ts.

/** The database also enforces this via a trigger (see
 * enforce_max_active_referrals in supabase/schema.sql) — this constant
 * is only for UI copy, never the actual guarantee. A referral program
 * is a single standing structure, unlike coupons (which can plausibly
 * run two at once), so the limit is 1, not MAX_ACTIVE_PROMOS's 2. */
export const MAX_ACTIVE_REFERRALS = 1;

/** Mirrors the `referrals` table's columns exactly (see supabase/schema.sql). */
export interface ReferralRow {
  id: string;
  business_id: string;
  referrer_reward: string;
  friend_reward: string;
  code: string;
  redemptions: number;
  active: boolean;
  created_at: string;
}

interface ReferralCaptionInput {
  businessName: string;
  referrerReward: string;
  friendReward: string;
  code: string;
  phone?: string | null;
}

/** A single pre-written caption combining both rewards, the business
 * name, the code, and the phone — meant to be copied verbatim into a
 * Google post, an Instagram/Facebook caption, or a text to regulars.
 * The app never sends this anywhere itself; see ShareModal. */
export function buildReferralShareCaption({
  businessName,
  referrerReward,
  friendReward,
  code,
  phone,
}: ReferralCaptionInput): string {
  const lines = [
    `Refer a friend to ${businessName}! You get: ${referrerReward}. They get: ${friendReward}.`,
    `Just mention code ${code}.`,
  ];
  if (phone) lines.push(`Questions? Call ${phone}.`);
  return lines.join(" ");
}
