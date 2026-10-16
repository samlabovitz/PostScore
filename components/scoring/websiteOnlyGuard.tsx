// Day 2b: server-side guard for the pages that only work with a Google
// listing. For a website-only business it returns the whole page (shell
// + an honest "needs a Google listing" card) before any of that page's
// own data loading runs; for every other business it returns null.

import { DashboardShell } from "@/components/layout/DashboardShell";
import { NeedsGoogleListing, type ListingOnlyPage } from "@/components/scoring/NeedsGoogleListing";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getListingMode } from "@/lib/listingMode";
import { createClient } from "@/lib/supabase/server";

export async function websiteOnlyGuard(businessId: string, page: ListingOnlyPage) {
  if ((await getListingMode(createClient(), businessId)) !== "website_only") return null;
  const summary = await getBusinessSummary(businessId);
  return (
    <DashboardShell business={summary.status === "ok" ? summary.business : null}>
      <NeedsGoogleListing businessId={businessId} page={page} />
    </DashboardShell>
  );
}
