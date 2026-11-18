// Tests only: "Google's values as read now" = the test row's own listing
// values (Day 23 2d-4 — pages and syncs read the listing live, never the
// saved columns; a test row stands in for Google). Use with
//   vi.mock("@/lib/ownerListing.server", async (orig) => ownerListingFromRows(await orig()));
import { vi } from "vitest";
import { LISTING_SCORING_COLUMN_NAMES, type ListingScoringColumns } from "@/lib/listingScoringRow";
import { withLiveListing, type ListingColumns, type LiveListing } from "@/lib/ownerListing";

type Row = Record<string, unknown> & { place_id?: string | null; listing_mode?: string | null };

export function liveFromRow(row: Row): LiveListing {
  if (!row.place_id || row.listing_mode === "website_only") return { status: "none" };
  const columns = Object.fromEntries(LISTING_SCORING_COLUMN_NAMES.filter((k) => k in row).map((k) => [k, row[k] ?? null])) as unknown as ListingScoringColumns;
  const v = (k: string) => (row[k] ?? null) as never;
  return {
    status: "ok",
    source: "places",
    values: { name: v("name"), address: v("address"), rating: v("rating"), reviewCount: v("review_count"), phone: v("phone"), website: v("website"), openingHours: v("opening_hours"), openingHoursPeriods: v("opening_hours_periods"), businessStatus: v("business_status"), photoCount: v("photo_count"), googleMapsUri: v("google_maps_uri") },
    columns,
  };
}

export function ownerListingFromRows<T extends object>(actual: T): T {
  return {
    ...actual,
    liveListingForRow: vi.fn(async (_db: unknown, _id: string, row: Row) => liveFromRow(row)),
    withLiveListingFor: vi.fn(async (_db: unknown, _id: string, row: Row & ListingColumns) => withLiveListing(row, liveFromRow(row))),
  };
}
