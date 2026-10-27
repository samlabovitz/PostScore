// Where an owner lands after a Google connect attempt (or a refused one):
// back where they started. Free connects from its own Overview card
// ("Free tools you can use now", after PostAI), Grow from the Reviews
// page — both only for the read-only "Replying to reviews" check, and
// never sent to the Premium pages.
// Premium and Multi connect from the Google Profile tab or its connect
// page. It's one connection either way.
import type { Plan } from "@/lib/plan";
import { isPremiumPlan } from "@/lib/plan";

/** Never raw error text from Google or the database — only these codes. */
export type GbpConnectResult =
  | "connected"
  /** Cancelled on Google's consent screen. */
  | "denied"
  /** The connect attempt expired, or didn't match this browser/session. */
  | "state"
  /** Google refused to trade the sign-in code for tokens. */
  | "exchange_failed"
  | "no_match"
  | "no_match_unverified"
  /** A Business Profile API call failed (not enabled, quota, …). */
  | "google_api"
  /** Anything else (e.g. saving the connection). */
  | "failed"
  | "setup";

export const GBP_CONNECT_RESULTS: readonly GbpConnectResult[] = [
  "connected",
  "denied",
  "state",
  "exchange_failed",
  "no_match",
  "no_match_unverified",
  "google_api",
  "failed",
  "setup",
];

export function parseGbpResult(value: string | null | undefined): GbpConnectResult | null {
  return GBP_CONNECT_RESULTS.includes(value as GbpConnectResult) ? (value as GbpConnectResult) : null;
}

export type GbpOrigin = "overview" | "reviews" | "profile" | "connect";

/** The anchor of the Free Overview card and the Grow Reviews-page box. */
export const GBP_REPLY_CHECK_ANCHOR = "reply-check";
/** The Google Profile tab's connection card. */
export const GBP_PROFILE_ANCHOR = "google-connection";

/** Where this plan may start (and so return to). Free and Grow only ever
 * get their reviews area; Premium the Google Profile tab or connect page. */
export function resolveGbpOrigin(plan: Plan, requested: string | null | undefined): GbpOrigin {
  if (isPremiumPlan(plan)) return requested === "profile" ? "profile" : "connect";
  return plan === "free" ? "overview" : "reviews";
}

/** The Reviews-area connect for Free and Grow (their only connect spot). */
export function gbpReplyCheckPath(businessId: string, plan: Plan): string {
  return plan === "free" ? `/business/${businessId}#${GBP_REPLY_CHECK_ANCHOR}` : `/business/${businessId}/website-reviews#${GBP_REPLY_CHECK_ANCHOR}`;
}

export function gbpLandingPath(businessId: string, origin: GbpOrigin, result: GbpConnectResult): string {
  switch (origin) {
    case "overview":
      return `/business/${businessId}?gbp=${result}#${GBP_REPLY_CHECK_ANCHOR}`;
    case "reviews":
      return `/business/${businessId}/website-reviews?gbp=${result}#${GBP_REPLY_CHECK_ANCHOR}`;
    case "profile":
      return `/business/${businessId}/growth?tab=google-profile&gbp=${result}#${GBP_PROFILE_ANCHOR}`;
    case "connect":
      return `/business/${businessId}/connect-gbp?gbp=${result}`;
  }
}

/** The connect link for a spot in the app. */
export function gbpConnectHref(businessId: string, origin: GbpOrigin): string {
  return `/api/gbp/connect?businessId=${businessId}&from=${origin}`;
}
