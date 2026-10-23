// Where an owner lands after a Google connect attempt (or a refused one).
// Premium and Multi connect from the Google Profile page's connect page;
// Free and Grow connect from the Reviews area only for the read-only
// "Replying to reviews" check — the Free Overview's reviews section, or
// the Reviews page on Grow.
import type { Plan } from "@/lib/plan";
import { isPremiumPlan } from "@/lib/plan";

/** Never raw error text from Google or the database — only these codes. */
export type GbpConnectResult = "connected" | "denied" | "failed" | "setup";

export const GBP_CONNECT_RESULTS: readonly GbpConnectResult[] = ["connected", "denied", "failed", "setup"];

export function parseGbpResult(value: string | null | undefined): GbpConnectResult | null {
  return GBP_CONNECT_RESULTS.includes(value as GbpConnectResult) ? (value as GbpConnectResult) : null;
}

/** The anchor the Reviews-area connect sits under. */
export const GBP_REPLY_CHECK_ANCHOR = "reply-check";

export function gbpLandingPath(businessId: string, plan: Plan, result: GbpConnectResult): string {
  if (isPremiumPlan(plan)) {
    return result === "connected"
      ? `/business/${businessId}/connect-gbp?connected=1`
      : `/business/${businessId}/connect-gbp?error=${result}`;
  }
  const page = plan === "free" ? `/business/${businessId}` : `/business/${businessId}/website-reviews`;
  return `${page}?gbp=${result}#${GBP_REPLY_CHECK_ANCHOR}`;
}
