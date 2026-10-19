// Subscription compliance — the rules checkout MUST follow when it ships.
// Checkout isn't built yet (every account is Free; see lib/premium.ts),
// so nothing here charges anyone. These are the exact wordings and the
// TODO list, kept in code so checkout can't be built without them.
// Full checklist and reasoning: docs/billing-compliance.md.
//
// TODO(checkout): build every item in CHECKOUT_REQUIREMENTS before the
// first paid plan goes live, and add a test for each.

import { POLICY_VERSION, legalHref, type PolicyLocale } from "@/lib/legal/policies";

export { POLICY_VERSION };

/** Visible right next to the Subscribe button (not behind a link). */
export function priceDisclosure(locale: PolicyLocale, monthlyPrice: string): string {
  return locale === "es"
    ? `${monthlyPrice} al mes. Se renueva cada mes hasta que usted cancele. Cancele cuando quiera en línea, en Configuración → Plan y facturación.`
    : `${monthlyPrice} a month. Renews monthly until you cancel. Cancel anytime online in Settings → Plan & billing.`;
}

/** Required, UNTICKED by default. */
export function renewalConsentLabel(locale: PolicyLocale, monthlyPrice: string): string {
  return locale === "es"
    ? `Acepto que mi plan se renueve cada mes a ${monthlyPrice} hasta que lo cancele.`
    : `I agree my plan renews monthly at ${monthlyPrice} until I cancel.`;
}

/** EU/UK consumers only: a second required, UNTICKED checkbox. */
export function withdrawalWaiverLabel(locale: PolicyLocale): string {
  return locale === "es"
    ? "Empezar mi plan ahora. Entiendo que pierdo mi derecho de desistimiento de 14 días una vez que el servicio comienza."
    : "Start my plan now. I understand I lose my 14-day withdrawal right once the service begins.";
}

/** What to store for every consent — kept for at least 3 years. */
export interface ConsentRecord {
  userId: string;
  acceptedAt: string; // ISO timestamp
  plan: "grow" | "premium" | "multi";
  monthlyPrice: string;
  currency: string;
  ip: string;
  /** The exact wording version shown (POLICY_VERSION). */
  wordingVersion: string;
  renewalConsent: true;
  /** EU/UK only. */
  withdrawalWaiver: boolean | null;
}
export const CONSENT_RETENTION_YEARS = 3;

/** At most this many clicks after "Cancel subscription" to finish. */
export const MAX_CANCEL_CLICKS = 2;
/** Notice before a price change applies. */
export const PRICE_CHANGE_NOTICE_DAYS = 30;

export const CHECKOUT_REQUIREMENTS = [
  "Next to Subscribe: price, “renews monthly until you cancel”, and how to cancel — visible text (priceDisclosure).",
  "Required unticked checkbox: renewalConsentLabel; store a ConsentRecord (timestamp, plan, price, IP, wording version) for ≥ 3 years.",
  "EU/UK consumers: second required unticked checkbox (withdrawalWaiverLabel); without it, a withdrawal within 14 days is refunded pro-rated.",
  "Purchase confirmation email: plan, price, renewal terms, cancel link, refund policy — and it must respect the email safety flags (MONTHLY_REPORTS_LIVE / ALLOW_SEND_ONE / REPORT_TEST_EMAIL).",
  "Cancel online in Settings → Plan & billing, the same place they signed up, in ≤ 2 clicks after “Cancel subscription”; at most one save offer, with a clear “No thanks, cancel” button; send a cancellation confirmation email.",
  "Price change: email ≥ 30 days before the new price applies, with how to cancel.",
  "If annual plans or free trials are added: a reminder email before each renewal / trial end.",
] as const;

export function refundPolicyHref(locale: PolicyLocale): string {
  return legalHref("refund", locale);
}
