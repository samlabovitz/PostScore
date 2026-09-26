"use server";

import { cancelSubscription, type CancellationFeedback } from "@/lib/subscription";

/**
 * Thin server-action wrapper so the Settings page (a Server Component)
 * can pass a real callable to CancelSubscriptionFlow (a Client
 * Component) — a Server Action is the one kind of function Next.js can
 * serialize across that boundary, same as `<form action={logout}>`
 * elsewhere in this app. Not implemented yet: see lib/subscription.ts's
 * own TODO — this throws until a real Stripe subscription exists.
 * CancelSubscriptionFlow's own success message is built from the
 * periodEndDate it was already given, not this call's return value, so
 * this deliberately discards cancelSubscription()'s result rather than
 * widening onConfirm's prop type to carry it.
 */
export async function cancelSubscriptionAction(feedback: CancellationFeedback): Promise<void> {
  await cancelSubscription(feedback);
}
