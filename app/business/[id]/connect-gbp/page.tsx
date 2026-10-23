import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { canConnectGbp, canUseGoogleProfilePage, getPlan } from "@/lib/premium";
import { parseGbpResult } from "@/lib/gbpLanding";
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
  searchParams: { connected?: string; error?: string };
}) {
  const summary = await getBusinessSummary(params.id);

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const plan = await getPlan();
  // The Google Profile page is Premium and Multi only. Free and Grow see
  // the locked preview here even when they've connected (for the
  // "Replying to reviews" check) — their status and Disconnect live in
  // the Reviews area instead.
  const profilePage = canUseGoogleProfilePage(plan);
  const gbp = await getGbpConnectionStatus(params.id);
  const connected = profilePage && gbp.status === "ok" ? gbp.connected : false;
  const connectedAt = gbp.status === "ok" ? gbp.connectedAt : null;

  return (
    <DashboardShell business={summary.business} plan={plan}>
      <ConnectGbpView
        businessId={params.id}
        businessName={summary.business.name}
        connected={connected}
        connectedAt={connectedAt}
        justConnected={searchParams.connected === "1"}
        // Only known codes, never raw text from the URL.
        error={searchParams.error ? (parseGbpResult(searchParams.error) ?? "failed") : null}
        oauthConfigured={isGbpOAuthConfigured()}
        // Read-only "coming soon" unless GBP_CONNECT_PUBLIC=true; this
        // page's button is Premium only (Free and Grow connect from the
        // Reviews area).
        connectOpen={canConnectGbp() && profilePage}
      />
    </DashboardShell>
  );
}
