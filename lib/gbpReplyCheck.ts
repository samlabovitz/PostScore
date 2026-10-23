// Server: whether the Reviews-area "Replying to reviews" connect shows, and
// what it says. Free and Grow only — Premium and Multi connect from the
// Google Profile page (the same single connection). Hidden for everyone
// while GBP_CONNECT_PUBLIC is off.
import type { GbpReplyCheckState } from "@/components/gbp/GbpReplyCheckConnect";
import type { GetGbpConnectionStatusResult } from "@/app/actions/gbp";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { parseGbpResult } from "@/lib/gbpLanding";
import { canConnectGbp, canUseGoogleProfilePage } from "@/lib/premium";
import type { Plan } from "@/lib/plan";

export function gbpReplyCheckState(
  plan: Plan,
  status: GetGbpConnectionStatusResult,
  resultParam: string | null | undefined
): GbpReplyCheckState | null {
  if (!canConnectGbp() || canUseGoogleProfilePage(plan)) return null;
  const connected = status.status === "ok" && status.connected;
  return {
    connected,
    connectedAt: status.status === "ok" ? status.connectedAt : null,
    configured: isGbpOAuthConfigured(),
    result: parseGbpResult(resultParam),
  };
}
