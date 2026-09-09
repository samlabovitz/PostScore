import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
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

  const gbp = await getGbpConnectionStatus(params.id);
  const connected = gbp.status === "ok" ? gbp.connected : false;
  const connectedAt = gbp.status === "ok" ? gbp.connectedAt : null;

  return (
    <DashboardShell business={summary.business}>
      <ConnectGbpView
        businessId={params.id}
        businessName={summary.business.name}
        connected={connected}
        connectedAt={connectedAt}
        justConnected={searchParams.connected === "1"}
        error={searchParams.error ?? null}
        oauthConfigured={isGbpOAuthConfigured()}
      />
    </DashboardShell>
  );
}
