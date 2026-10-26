import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { canConnectGbp, canUseGoogleProfilePage, getPlan } from "@/lib/premium";
import { gbpReplyCheckPath, parseGbpResult } from "@/lib/gbpLanding";
import { ConnectGbpView } from "./ConnectGbpView";

/**
 * Reachable directly today (no Stripe/subscription flow exists yet) —
 * once subscribe-and-pay is built, its post-payment success step can
 * simply redirect here, same as any owner reaching this page any other
 * way. Nothing about this page depends on how the owner arrived.
 */
export default async function ConnectGbpPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { gbp?: string };
}) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const plan = await getPlan();
  // The Premium connect page is Premium and Multi only. Free and Grow are
  // never shown it: they connect (for the "Replying to reviews" check),
  // see their status and disconnect in their own reviews area.
  if (!canUseGoogleProfilePage(plan)) {
    redirect(gbpReplyCheckPath(params.id, plan));
  }

  const gbp = await getGbpConnectionStatus(params.id);
  const ok = gbp.status === "ok" ? gbp : null;
  // Only known codes, never raw text from the URL.
  const result = parseGbpResult(searchParams.gbp);

  return (
    <DashboardShell business={summary.business} plan={plan}>
      <ConnectGbpView
        businessId={params.id}
        businessName={summary.business.name}
        businessAddress={summary.business.address ?? null}
        connected={!!ok?.connected}
        connectedAt={ok?.connectedAt ?? null}
        locationTitle={ok?.locationTitle ?? null}
        locationAddress={ok?.locationAddress ?? null}
        needsReconnect={!!ok?.needsReconnect}
        justConnected={result === "connected"}
        error={result && result !== "connected" ? result : null}
        oauthConfigured={isGbpOAuthConfigured()}
        // Disabled "coming soon" unless GBP_CONNECT_PUBLIC=true.
        connectOpen={canConnectGbp()}
      />
    </DashboardShell>
  );
}
