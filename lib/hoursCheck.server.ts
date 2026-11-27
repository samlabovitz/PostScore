// Server-only. Day 23B: the hours check as it is now (lib/hoursCheck.ts) —
// the website's hours from the last read, and Google Maps' public listing:
// the visit's live read when it IS the public listing (Places), else (a
// connected owner reads Business Profile) one capped, cached Places read.
import "server-only";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { weekFromSite } from "@/lib/gbpProfileEdits";
import { weekFromPlacesPeriods } from "@/lib/hoursEditor";
import { hoursCheckState, waitingSince, type HoursCheckState } from "@/lib/hoursCheck";
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
  if (pub?.status === "ok") return withWaitingSince(businessId, hoursCheckState(site, weekFromPlacesPeriods(pub.values.openingHoursPeriods), visit));
  // Maps couldn't be read (the cap, a failed read, or a dev run). The scan (which reads Maps) found a difference,
  // so it's never "changed since your scan". The Business Profile already shows the website's hours: waiting on
  // Google to publish them on Maps (which days still differ there is unknown without that read). Else the days
  // the Business Profile shows differently, side by side — those are the owner's to fix.
  if (!visit) return null;
  const profile = hoursCheckState(site, visit);
  if (profile?.kind === "stale") return withWaitingSince(businessId, { kind: "differs", days: [], profileAhead: true });
  return profile;
}

/** Waiting on Google: since when (lib/hoursCheck.ts waitingSince) — our own change log and saved scans, never
 * Google's values. Unknown on any failed read (no "after a week" line then). */
async function withWaitingSince(businessId: string, state: HoursCheckState | null): Promise<HoursCheckState | null> {
  if (state?.kind !== "differs" || !state.profileAhead) return state;
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const db = createClient();
    const [{ data: change }, { data: scans }] = await Promise.all([
      db.from("gbp_changes").select("approved_at").eq("business_id", businessId).eq("field", "hours").in("status", ["sent", "pending_review"]).is("undone_at", null).order("approved_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("scores").select("created_at, checks:breakdown_json->checks").eq("business_id", businessId).order("created_at", { ascending: false }).limit(20),
    ]);
    const runs = ((scans ?? []) as Array<{ created_at: string; checks: Array<{ id: string; earnedPoints: number | null; maxPoints: number }> | null }>).map((r) => {
      const check = (r.checks ?? []).find((c) => c.id === "website.info_consistency");
      return { at: r.created_at, mismatch: !!check && check.earnedPoints !== null && check.earnedPoints < check.maxPoints };
    });
    return { ...state, waitingSince: waitingSince((change as { approved_at?: string } | null)?.approved_at ?? null, runs) };
  } catch {
    return state;
  }
}
