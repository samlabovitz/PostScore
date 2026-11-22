import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Card } from "@/components/ui/Card";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { getCustomerDetailsUndo } from "@/app/actions/gbpCustomerDetails";
import { getWebsiteLinkUndoForPage, googleWritesPageState } from "@/app/actions/gbpWebsiteLink";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { hasPremium } from "@/lib/premium";
import type { ShowcasePage } from "@/lib/upgradePromos";
import type { GooglePageData } from "@/lib/googlePages.server";
import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";

// Day 25B step 2: the shell both new Google pages share — the dashboard,
// the stale-scan notice and the Google edit state (undo, writes allowed)
// the old Growth page gave its Google tab. Server only.

export async function GooglePageShell<P extends GoogleProfileTabProps>({ data, promoPage, render }: { data: GooglePageData<P>; promoPage: ShowcasePage; render: (props: P) => ReactNode }) {
  if (data.status !== "ok") {
    if (data.status === "error") {
      return (
        <DashboardShell business={data.business}>
          <Card className="p-5 text-sm text-red">{data.message}</Card>
        </DashboardShell>
      );
    }
    if (data.status === "unauthenticated") redirect("/login");
    notFound();
  }
  const { props, plan } = data;
  const id = props.businessId;
  const [upgrade, undo, websiteUndo, writes] = await Promise.all([loadUpgradeContext(id, promoPage), getCustomerDetailsUndo(id), getWebsiteLinkUndoForPage(id), googleWritesPageState(id)]);
  return (
    <DashboardShell upgrade={upgrade} business={data.business}>
      {showRescanNotice(props.lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={id} lastScanAt={props.lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
      <GbpEditProvider
        value={{
          premium: hasPremium(plan),
          connected: props.connected,
          undo,
          websiteUndo,
          ...writes,
          websiteSuggested: data.websiteSuggested,
        }}
      >
        {render(props)}
      </GbpEditProvider>
    </DashboardShell>
  );
}
