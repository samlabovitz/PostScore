// Where a page's live competitor read searches (lib/placesLive.server.ts):
// the business's point, its own specific search types, and the phrase its
// competitor scan searched — the same words the Competitors page shows in
// "Compared with … search “…”". Pure.

import { bizProfileById } from "@/config/bizProfiles";
import { isGenericType } from "@/lib/competitors";
import { nicheScanFields } from "@/lib/competitorNicheRule";
import { competitorQueryNoun, competitorTextQuery } from "@/lib/competitorQuery";
import { nicheSearchTypes } from "@/lib/competitorScope";
import type { BusinessNicheState } from "@/lib/businessNiche.server";

export interface LiveCompetitorQuery {
  lat: number | null;
  lng: number | null;
  includedTypes: string[];
  /** "hair salons in Westfield, NJ", or null. */
  textQuery: string | null;
}

export interface LiveQueryBusinessRow {
  address: string | null;
  primary_type: string | null;
  categories: string[] | null;
  business_type_override: string | null;
  website: string | null;
  verified_website_url: string | null;
  lat: number | null;
  lng: number | null;
}

/** The saved columns liveQueryFromRow reads — our own and the owner's.
 * The address, types and website are Google's, read live and laid over
 * them (Day 23 2d-5: lib/placesLive.server.ts withLiveCompetitorValuesFor). */
export const LIVE_QUERY_COLUMNS = "place_id, listing_mode, business_type_override, verified_website_url, lat, lng";

/** Google place types for the owner's PostScore business type (only used
 * when Google's own listing types are all generic). */
export function ownerTypePlaceTypes(businessTypeOverride: string | null): string[] {
  return bizProfileById(businessTypeOverride)?.placesType ?? [];
}

/** The query words a scan of this business uses (lib/competitorQuery.ts) —
 * the same niche rules as the scan itself. */
export function comparedWithFor(row: Pick<LiveQueryBusinessRow, "address" | "primary_type" | "categories" | "website" | "verified_website_url">, niche: BusinessNicheState | null): { noun: string | null; query: string | null } {
  const { queryNiche } = nicheScanFields(niche?.resolved, niche?.scope, row.website ?? row.verified_website_url);
  const primaryType = [row.primary_type, ...(row.categories ?? [])].find((t) => !!t && !isGenericType(t)) ?? null;
  const subject = { nicheId: queryNiche?.id, nicheLabelEn: queryNiche?.labelEn, nicheParent: queryNiche?.parent, primaryType, address: row.address };
  return { noun: competitorQueryNoun(subject), query: competitorTextQuery(subject) };
}

export function liveQueryFromRow(row: LiveQueryBusinessRow, niche: BusinessNicheState | null): LiveCompetitorQuery {
  return {
    lat: row.lat,
    lng: row.lng,
    includedTypes: Array.from(new Set([row.primary_type, ...((niche && nicheSearchTypes(niche.scope)?.directTypes) ?? []), ...ownerTypePlaceTypes(row.business_type_override)])).filter(
      (type): type is string => !!type && !isGenericType(type)
    ),
    textQuery: comparedWithFor(row, niche).query,
  };
}
