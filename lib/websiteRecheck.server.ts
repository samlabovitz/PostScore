// "Re-check my website" (implementation; the server actions are in
// app/actions/websiteRecheck.ts, which load this on demand): the website half of a scan only — the site read
// (Browserless when needed), PageSpeed and Safe Browsing, exactly as a
// full scan runs them (analyzeWebsiteForSave) — and never a Google Places
// call. Saved as a normal scan (scores row, scanKind "website_recheck"),
// so history, reports, rank and the weekly goal read it like any scan,
// and action-plan tasks are confirmed by it the same way. 3 per business
// per local day (lib/websiteRecheckPolicy.ts), separate from the daily
// full re-scan.

import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeWebsiteForSave } from "@/lib/websiteAnalysisForSave";
import { resolveBizProfile } from "@/config/bizProfiles";
import { extraServicesKeywordsFor } from "@/lib/pagePresenceDetection";
import { parseListingMode } from "@/lib/listingMode";
import { businessTimeZone } from "@/lib/businessTimeZone";
import { saveScoreSnapshotWithClient } from "@/app/actions/scoring";
import type { ScoreBreakdown } from "@/lib/scoring";
import {
  WEBSITE_RECHECK_KIND,
  websiteCheckChanges,
  websiteRecheckAvailability,
  websiteScoreOf,
  type WebsiteCheckChange,
  type WebsiteRecheckAvailability,
} from "@/lib/websiteRecheckPolicy";

export type WebsiteRecheckStatus =
  | { status: "ok"; availability: WebsiteRecheckAvailability; hasWebsite: boolean }
  | { status: "not_found" }
  | { status: "unauthenticated" };

export type WebsiteRecheckResult =
  | {
      status: "ok";
      scoreBefore: number | null;
      scoreAfter: number;
      websiteBefore: number | null;
      websiteAfter: number | null;
      changes: WebsiteCheckChange[];
      tasksConfirmed: number;
      pointsConfirmed: number;
      availability: WebsiteRecheckAvailability;
    }
  | { status: "limit_reached"; availability: WebsiteRecheckAvailability }
  | { status: "no_website" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type BusinessRow = {
  id: string;
  name: string | null;
  website: string | null;
  verified_website_url: string | null;
  phone: string | null;
  address: string | null;
  opening_hours_periods: unknown;
  category: string | null;
  primary_type: string | null;
  categories: string[] | null;
  business_type_override: string | null;
  website_analysis_json: unknown;
  listing_mode: string | null;
  lat: number | null;
  lng: number | null;
};

const BUSINESS_COLUMNS =
  "id, name, website, verified_website_url, phone, address, opening_hours_periods, category, primary_type, categories, business_type_override, website_analysis_json, listing_mode, lat, lng";

/** The site a re-check reads: the listing's website, else a verified one. */
function siteToCheck(row: Pick<BusinessRow, "website" | "verified_website_url">): string | null {
  const verified = row.verified_website_url?.trim() || null;
  return row.website?.trim() || verified;
}

/** Re-checks that ran in the last two days (enough to count "today" in
 * any time zone). */
async function recentRecheckDates(supabase: SupabaseClient, businessId: string, now: Date): Promise<string[]> {
  const { data } = await supabase
    .from("scores")
    .select("created_at, scan_kind:breakdown_json->>scanKind")
    .eq("business_id", businessId)
    .gte("created_at", new Date(now.getTime() - 2 * 86_400_000).toISOString());
  return ((data ?? []) as Array<{ created_at: string; scan_kind: string | null }>)
    .filter((r) => r.scan_kind === WEBSITE_RECHECK_KIND)
    .map((r) => r.created_at);
}

async function loadBusiness(supabase: SupabaseClient, businessId: string): Promise<BusinessRow | null> {
  const { data } = await supabase.from("businesses").select(BUSINESS_COLUMNS).eq("id", businessId).maybeSingle();
  return (data as BusinessRow | null) ?? null;
}

export async function getWebsiteRecheckStatusWithClient(supabase: SupabaseClient, businessId: string, now: Date = new Date()): Promise<WebsiteRecheckStatus> {
  const row = await loadBusiness(supabase, businessId);
  if (!row || parseListingMode(row.listing_mode) === "website_only") return { status: "not_found" };
  const availability = websiteRecheckAvailability(await recentRecheckDates(supabase, businessId, now), now, businessTimeZone(row.lat, row.lng));
  return { status: "ok", availability, hasWebsite: siteToCheck(row) !== null };
}


export async function recheckWebsiteWithClient(
  supabase: SupabaseClient,
  businessId: string,
  deps: { analyze?: typeof analyzeWebsiteForSave; now?: () => Date } = {}
): Promise<WebsiteRecheckResult> {
  const analyze = deps.analyze ?? analyzeWebsiteForSave;
  const now = deps.now ?? (() => new Date());
  const row = await loadBusiness(supabase, businessId);
  // A website-only business has its own re-check (recheckWebsiteOnlyBusiness).
  if (!row || parseListingMode(row.listing_mode) === "website_only") return { status: "not_found" };
  const site = siteToCheck(row);
  if (!site) return { status: "no_website" };

  // The limit is checked before any PageSpeed / render call.
  const timeZone = businessTimeZone(row.lat, row.lng);
  const availability = websiteRecheckAvailability(await recentRecheckDates(supabase, businessId, now()), now(), timeZone);
  if (!availability.allowed) return { status: "limit_reached", availability };

  const { data: beforeRow } = await supabase
    .from("scores")
    .select("total, breakdown_json")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const before = (beforeRow as { total: number; breakdown_json: ScoreBreakdown } | null) ?? null;

  const typeId = resolveBizProfile(row.category, row.primary_type, row.business_type_override, "en", row.categories, row.name).id;
  let analyzed: Awaited<ReturnType<typeof analyzeWebsiteForSave>>;
  try {
    analyzed = await analyze({
      analysisUrl: site,
      listingWebsite: row.website,
      existingAnalysisJson: row.website_analysis_json,
      // Screenshots aren't part of a re-check ("Refresh screenshots" does that).
      skipScreenshots: true,
      extraServicesKeywords: extraServicesKeywordsFor(typeId),
      listingFacts: {
        phone: row.phone,
        address: row.address,
        openingHoursPeriods: (row.opening_hours_periods ?? null) as Parameters<typeof analyzeWebsiteForSave>[0]["listingFacts"]["openingHoursPeriods"],
      },
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : "Website check failed." };
  }

  const { websiteAnalysis, httpsStatus, checkedAt } = analyzed;
  const { error: updateError } = await supabase
    .from("businesses")
    .update({
      https_status: httpsStatus,
      https_checked_at: httpsStatus ? checkedAt : null,
      website_analysis_json: websiteAnalysis,
      website_analysis_checked_at: websiteAnalysis ? checkedAt : null,
    })
    .eq("id", businessId);
  if (updateError) return { status: "error", message: updateError.message };

  const saved = await saveScoreSnapshotWithClient(supabase, businessId, WEBSITE_RECHECK_KIND);
  if (saved.status !== "saved") {
    return saved.status === "error" ? saved : saved.status === "unauthenticated" ? { status: "unauthenticated" } : { status: "not_found" };
  }
  const { data: afterRow } = await supabase.from("scores").select("total, breakdown_json").eq("id", saved.scoreId).maybeSingle();
  const after = afterRow as { total: number; breakdown_json: ScoreBreakdown } | null;
  if (!after) return { status: "error", message: "The re-check was saved but couldn't be read back." };

  const sameVersion = !before || before.breakdown_json?.scoringVersion === after.breakdown_json.scoringVersion;
  return {
    status: "ok",
    scoreBefore: before?.total ?? null,
    scoreAfter: after.total,
    websiteBefore: websiteScoreOf(before?.breakdown_json ?? null),
    websiteAfter: websiteScoreOf(after.breakdown_json),
    // Only compare like with like: a scoring update isn't the owner's doing.
    changes: sameVersion ? websiteCheckChanges(before?.breakdown_json ?? null, after.breakdown_json) : [],
    tasksConfirmed: saved.tasksConfirmed,
    pointsConfirmed: saved.pointsConfirmed,
    availability: { used: availability.used + 1, left: Math.max(0, availability.left - 1), allowed: availability.left - 1 > 0 },
  };
}

