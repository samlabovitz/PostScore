// Pure helpers for the "Active promotions" / share / draft-content parts
// of the Growth → Coupons feature (Day 9 pass 2b). Persistence itself
// lives in app/actions/promos.ts (server actions) and
// supabase/schema.sql (the `promos` table + its enforced 2-active
// limit) — this module is just presentation logic: shaping a promo row
// for display, and generating the hand-off text the owner copies and
// posts themselves.

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
 * anything beyond the real stored tally. */
export function redemptionLabel(count: number): string {
  if (count === 0) return "No redemptions logged yet";
  if (count === 1) return "1 redemption logged";
  return `${count} redemptions logged`;
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

interface GooglePostInput {
  businessName: string;
  offer: string;
  code: string;
  expiryLabel: string;
}

/** Draft text for a Google Business Profile "Update" post. This is
 * copy-and-paste text for the owner to post themselves on their own
 * Google Business Profile — PostScore never posts to Google. */
export function buildGooglePostDraft({ businessName, offer, code, expiryLabel }: GooglePostInput): string {
  return [
    `${offer}`,
    "",
    `Come see us at ${businessName} — show this post or mention code ${code} to redeem in-store. ${expiryLabel}.`,
    "",
    "No app or sign-up needed, just show it at checkout.",
  ].join("\n");
}

interface FaqInput {
  businessName: string;
  offer: string;
  code: string;
  expiryLabel: string;
  terms?: string | null;
}

/** Draft Q&A text for a Google Business Profile "Questions & answers"
 * section or a website FAQ page. Copy-and-paste for the owner to post
 * themselves — PostScore never posts this to Google or anywhere else. */
export function buildFaqDraft({ businessName, offer, code, expiryLabel, terms }: FaqInput): string {
  const pairs = [
    ["Do you have any current offers?", `Yes — ${offer}. Just show code ${code} at checkout.`],
    [
      "How do I redeem the offer?",
      `Show the coupon — printed, texted, or from our Google/Instagram post — to our staff at ${businessName}. They'll apply it right there. No app or account needed.`,
    ],
    ["When does it expire?", `${expiryLabel}.`],
  ];
  if (terms) pairs.push(["Are there any restrictions?", terms]);

  return pairs.map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n");
}
