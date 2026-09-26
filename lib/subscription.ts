// The cancellation framework — built and previewable (see
// components/settings/CancelSubscriptionFlow.tsx and
// app/dev/cancel-flow) before any real subscription exists. Nothing
// here is wired to Stripe yet: hasActiveSubscription() always returns
// false (so the Settings page's Subscription section never renders for
// a real user, and this UI is never shown outside the dev preview), and
// cancelSubscription() always throws. Never hardcode or guess a period-
// end date anywhere in this file or its callers — it must come from the
// real Stripe subscription once one exists.

import type { Locale } from "./i18n";

export type CancellationReasonCode =
  | "too_expensive"
  | "not_enough_results"
  | "no_time"
  | "didnt_work"
  | "switching"
  | "business_changing"
  | "short_term"
  | "other"
  | "prefer_not_to_say";

/**
 * Everything a canceling owner optionally told us, captured once at the
 * moment they confirm cancellation. Every field below reasonCode/detail/
 * improvement is nullable because every question in the flow is
 * optional — canceling can never be blocked on answering them.
 */
export interface CancellationFeedback {
  reasonCode: CancellationReasonCode | null;
  /** The reason-specific follow-up text — "What went wrong?" for
   * didnt_work, "Which one? (optional)" for switching, "Tell us more"
   * for other — null unless the chosen reason has one and the owner
   * filled it in. */
  detail: string | null;
  /** The separate, always-available "anything we could have done
   * better?" field — independent of whichever reason (if any) was
   * picked. */
  improvement: string | null;
  locale: Locale;
  businessId: string;
  createdAt: string;
}

export interface CancelSubscriptionResult {
  /** ISO timestamp of the real Stripe subscription's period end — once
   * this actually calls Stripe, this is what the confirm/success UI's
   * {date} comes from. Never guessed or hardcoded by this function or
   * any caller. */
  periodEnd: string;
}

/**
 * TODO(stripe): Not implemented yet. Once a real Stripe subscription
 * exists, this must:
 *   1. Cancel the business's Stripe subscription at period end — never
 *      immediately; the owner keeps what they already paid for through
 *      the date already on file.
 *   2. Persist `feedback` (reasonCode/detail/improvement) somewhere
 *      real — RLS- or service-role-scoped to this business — for
 *      product follow-up, never discarded.
 *   3. Return the real period-end date from Stripe's own subscription
 *      object, so the UI can show exactly when access actually ends.
 * Until all three are real, this throws rather than pretending to
 * succeed — never called from the dev preview (app/dev/cancel-flow),
 * which fakes its own success state instead.
 */
export async function cancelSubscription(
  // Not read yet — this throws before ever needing it — but kept named
  // (not _feedback) so the real implementation's signature is already
  // right; see the TODO above for what it must actually do with this.
  feedback: CancellationFeedback
): Promise<CancelSubscriptionResult> {
  void feedback;
  throw new Error("Not implemented");
}

/**
 * TODO(stripe): Not implemented yet — always returns false, so no
 * caller can ever show the cancellation flow (or any other
 * subscription-gated UI) to a real user until this actually checks
 * Stripe for a real active subscription on this business.
 */
export async function hasActiveSubscription(businessId: string): Promise<boolean> {
  void businessId;
  return false;
}
