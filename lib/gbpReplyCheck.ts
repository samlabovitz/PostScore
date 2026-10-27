// Server: whether the "Replying to reviews" connect shows (Free: its own
// Overview card; Grow: the Reviews page), and what it says. Free and Grow only — Premium and Multi connect from the
// Google Profile page (the same single connection). Hidden for everyone
// while GBP_CONNECT_PUBLIC is off; NODE_ENV plays no part.
import type { GbpReplyCheckState } from "@/components/gbp/GbpReplyCheckConnect";
import type { GetGbpConnectionStatusResult } from "@/app/actions/gbp";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { parseGbpResult } from "@/lib/gbpLanding";
import { canConnectGbp, canUseGoogleProfilePage } from "@/lib/premium";
import type { Plan } from "@/lib/plan";

export function gbpReplyCheckState(
  plan: Plan,
  status: GetGbpConnectionStatusResult,
  resultParam: string | null | undefined,
  business: { name: string | null; address: string | null } = { name: null, address: null }
): GbpReplyCheckState | null {
  if (!canConnectGbp() || canUseGoogleProfilePage(plan)) return null;
  const ok = status.status === "ok" ? status : null;
  return {
    connected: !!ok?.connected,
    connectedAt: ok?.connectedAt ?? null,
    locationTitle: ok?.locationTitle ?? null,
    locationAddress: ok?.locationAddress ?? null,
    needsReconnect: !!ok?.needsReconnect,
    configured: isGbpOAuthConfigured(),
    result: parseGbpResult(resultParam),
    origin: plan === "free" ? "overview" : "reviews",
    business,
    replyCounts: ok?.replyCounts ?? null,
  };
}
