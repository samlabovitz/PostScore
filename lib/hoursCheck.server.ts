// Server-only. Day 23B: the hours check as it is now (lib/hoursCheck.ts) —
// the website's hours from the last read, and Google Maps' public listing:
// the visit's live read when it IS the public listing (Places), else (a
// connected owner reads Business Profile) one capped, cached Places read.
import "server-only";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { weekFromSite } from "@/lib/gbpProfileEdits";
import { weekFromPlacesPeriods } from "@/lib/hoursEditor";
import { hoursCheckState, type HoursCheckState } from "@/lib/hoursCheck";
import { parseWebsiteAnalysis } from "@/lib/scoring";

export async function loadHoursCheck(
  businessId: string,
  business: { place_id?: string | null; opening_hours_periods?: unknown; website_analysis_json?: unknown; live_source?: string; live_unavailable?: boolean },
  /** Only when the scored hours check needs work (else no read at all). */
  tasks: Array<{ checkId: string; mismatchFields?: string[] | null }>
): Promise<HoursCheckState | null> {
  if (!tasks.some((t) => t.checkId === "website.info_consistency" && (t.mismatchFields ?? []).includes("hours"))) return null;
  if (business.live_unavailable) return null;
  const finding = parseWebsiteAnalysis(business.website_analysis_json)?.websiteTrust?.infoConflicts.find((f) => f.field === "hours");
  const site = weekFromSite(finding?.siteWeek);
  if (!site) return null;
  const visit = weekFromPlacesPeriods((business.opening_hours_periods as OpeningHoursPeriod[] | null) ?? null);
  if (business.live_source !== "business_profile") return hoursCheckState(site, visit);
  if (!business.place_id) return null;
  const { publicPlacesListing } = await import("@/lib/ownerListing.server");
  const pub = await publicPlacesListing(businessId, business.place_id).catch(() => null);
  if (pub?.status !== "ok") return null;
  return hoursCheckState(site, weekFromPlacesPeriods(pub.values.openingHoursPeriods), visit);
}
