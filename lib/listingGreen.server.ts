import "server-only";

// "Get your Google listing to all green" for Fix plan and the Overview: the Google listing page's own rows (read the
// same way: lib/googlePages.server.ts loadGoogleListing), counted by lib/listingGreen.ts. Null when the listing can't
// be read (not connected and not practice: the page's rows come from the last scan only, and the count is the same).

import { listingGroups } from "@/lib/googleProfileTab";
import { listingGreen, listingInputFrom, reviewingRows, type ListingGreen } from "@/lib/listingGreen";

export async function loadListingGreen(businessId: string): Promise<ListingGreen | null> {
  const { loadGoogleListing } = await import("@/lib/googlePages.server");
  const data = await loadGoogleListing(businessId).catch(() => null);
  if (!data || data.status !== "ok") return null;
  const props = data.props;
  const groups = listingGroups(listingInputFrom(props as never, true));
  return listingGreen(groups, props.checks, { reviewing: reviewingRows(props.saved?.made ?? null) });
}
