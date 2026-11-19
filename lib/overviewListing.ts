// Day 23B: which of the Google Profile tab's rows the Overview card shows,
// and where each opens. Pure.
import type { ListingGroup, ListingRow } from "@/lib/googleProfileTab";

export const OVERVIEW_LISTING_ROWS = 3;

/** The rows that open on the tab (editor rows answer to #edit-…). */
const ROW_HASH: Record<string, string> = {
  hours: "edit-hours",
  phone: "edit-phone",
  website: "edit-website-link",
  customerDetails: "edit-customer-details",
  photos: "edit-photos",
  booking: "edit-booking",
  messaging: "edit-messaging",
  holiday: "edit-holiday",
  services: "edit-services",
  description: "edit-description",
};

/** Up to 3 rows to fix (✕) first, then to improve (!), in the tab's order. */
export function overviewListingRows(groups: ListingGroup[], max: number = OVERVIEW_LISTING_ROWS): ListingRow[] {
  const rows = groups.flatMap((g) => g.rows);
  return [...rows.filter((r) => r.status === "bad"), ...rows.filter((r) => r.status === "warn")].slice(0, max);
}

/** That row on the Google Profile tab, its editor open where it has one. */
export function rowHref(businessId: string, row: ListingRow): string {
  const tab = `/business/${businessId}/growth?tab=google`;
  // The booking steps panel (case B) has its own hash.
  if (row.id === "booking" && row.action?.kind === "editor" && row.action.editor === "booking_steps") return `${tab}#edit-booking-steps`;
  if (ROW_HASH[row.id]) return `${tab}#${ROW_HASH[row.id]}`;
  if (row.action?.kind === "link" && !row.action.external) return row.action.href;
  return `${tab}#listing-${row.id}`;
}
