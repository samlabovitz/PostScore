import "server-only";

// Day 25B step 2 (docs/plans/day25a-spec.md §2, §3): the data for the two
// pages split out of the Google Profile tab. Each loads only its own data:
//   Google results (Growth) — insights, booking, average visit, actions;
//   Google listing (Presence) — listing extras, edits, protection,
//     photos/posts, undo state.
// The same live-read rules as the tab: Google data is read when shown and
// never written here; the stored monthly numbers are PostScore's own copy
// of the owner's Business Profile insights, read from the database.
// While NEW_PAGES_LIVE is false, only the dev test login (under `next dev`)
// may open them; everyone else is sent to the old tab.

import { NEW_PAGES_LIVE } from "@/lib/routes";
import { isDevTestLoginEmail } from "@/lib/offerTesting";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessSummary } from "@/app/actions/businesses";
import { getLastScanAt, scoreBusinessById } from "@/app/actions/scoring";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { getPlan, canConnectGbp, hasPremium } from "@/lib/premium";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { parseGbpResult } from "@/lib/gbpLanding";
import { googleWritesAllowed, reviewRepliesPracticeOn } from "@/lib/gbpReviewPractice";
import { businessRowToScoringInput, type ScoreBreakdown } from "@/lib/scoring";
import { reportCategories } from "@/lib/reports/reportCategories";
import { loadGoogleTabSaved } from "@/lib/googleProfileTab.server";
import { loadBookingState, loadInsights, loadInsightsSyncedAt } from "@/lib/gbpInsights.server";
import { insightsStateFor } from "@/lib/gbpInsights";
import { loadPhotosAndPosts, refreshPhotosAndPosts } from "@/lib/gbpMediaPosts.server";
import { listingExtras } from "@/lib/gbpRealListing.server";
import { loadAverageVisit, loadVisitShare } from "@/lib/averageVisit.server";
import { loadNowMatchPrompts } from "@/lib/detailsMismatch.server";
import { mismatchedFields } from "@/lib/actionPlan";
import { shownWebsite } from "@/lib/businessWebsite";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n";
import type { Plan } from "@/lib/plan";
import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";
import type { GoogleResultsProps } from "@/components/gbp/GoogleResults";
import type { GoogleListingPageProps } from "@/components/gbp/GoogleListingPage";

/** Who may open the new pages: everyone once they're live; before that,
 * only the dev test login, only under `next dev`. Pure. */
export function newGooglePagesAllowed(input: { live: boolean; nodeEnv: string | undefined; devEmail: string | undefined; userEmail: string | null | undefined }): boolean {
  if (input.live) return true;
  if (input.nodeEnv !== "development" || !input.devEmail || !input.userEmail) return false;
  return input.userEmail.trim().toLowerCase() === input.devEmail.trim().toLowerCase();
}

export async function canOpenNewGooglePages(): Promise<boolean> {
  if (NEW_PAGES_LIVE) return true;
  if (process.env.NODE_ENV !== "development") return false;
  const { data } = await createClient().auth.getUser();
  return newGooglePagesAllowed({ live: NEW_PAGES_LIVE, nodeEnv: process.env.NODE_ENV, devEmail: process.env.DEV_TEST_LOGIN_EMAIL, userEmail: data.user?.email ?? null });
}

type Summary = Extract<Awaited<ReturnType<typeof getBusinessSummary>>, { status: "ok" }>;
type Scored = Extract<Awaited<ReturnType<typeof scoreBusinessById>>, { status: "ok" }>;

export type GooglePageBase =
  | { status: "unauthenticated" | "not_found" }
  | { status: "error"; message: string; business: Summary["business"] }
  | { status: "ok"; business: Summary["business"]; scored: Scored; plan: Plan; common: GoogleProfileTabProps; gbpConnected: boolean; timeZone: string; websiteSuggested: string | null };

/** What both pages need: the business, its saved scan, the plan and the
 * Google connection (no Google reads). */
async function loadBase(businessId: string, gbpParam: string | undefined): Promise<GooglePageBase> {
  const [summary, scored, plan, gbpStatus, lastScanAt] = await Promise.all([getBusinessSummary(businessId), scoreBusinessById(businessId, "business"), getPlan(), getGbpConnectionStatus(businessId), getLastScanAt(businessId)]);
  if (summary.status === "unauthenticated" || scored.status === "unauthenticated") return { status: "unauthenticated" };
  if (summary.status === "not_found" || scored.status === "not_found") return { status: "not_found" };
  if (scored.status === "error") return { status: "error", message: scored.message, business: summary.business };
  const row = scored.business;
  const gbpConnected = gbpStatus.status === "ok" && gbpStatus.connected;
  const practice = reviewRepliesPracticeOn();
  const website = reportCategories(scored.result.breakdown.categories).find((_, i) => scored.result.breakdown.categories[i].id === "website");
  const hasWebsite = scored.result.breakdown.checks.find((c) => c.id === "website.has_website")?.earnedPoints !== 0;
  const common: GoogleProfileTabProps = {
    businessId,
    connected: gbpConnected,
    practice,
    needsReconnect: gbpStatus.status === "ok" && gbpStatus.needsReconnect,
    canStart: canConnectGbp() && isGbpOAuthConfigured(),
    result: parseGbpResult(gbpParam),
    business: { name: row.name ?? null, address: row.address ?? null },
    listing: {
      rating: row.rating,
      reviewCount: row.review_count,
      photoCount: row.photo_count,
      phone: row.phone,
      website: row.website,
      category: row.category,
      categories: row.categories ?? null,
      openingHours: row.opening_hours ?? null,
      googleMapsUri: row.google_maps_uri ?? null,
    },
    checks: scored.result.breakdown.checks,
    website: website && hasWebsite && website.points !== null ? { earned: website.points, of: website.weight, fixes: website.needsWork } : null,
    replyCounts: gbpStatus.status === "ok" ? gbpStatus.replyCounts : null,
    messagingOn: null,
    saved: null,
    lastScanAt,
    nicheId: (row as { niche_id?: string | null }).niche_id ?? null,
    // Writes from PostScore: Premium only, in practice or on the live list.
    canEditGoogle: hasPremium(plan) && (practice || googleWritesAllowed((row as { place_id?: string | null }).place_id ?? null)),
  };
  // The website link editor's suggestion: a verified site that isn't the listing's own link.
  const shown = shownWebsite(row);
  const websiteSuggested = shown.kind === "site" && shown.source !== "listing" ? shown.url : null;
  return { status: "ok", business: summary.business, scored, plan, common, gbpConnected, timeZone: summary.business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE, websiteSuggested };
}

/** The website's hours from the last scan, its builder and tel: link (the same as the old tab). */
async function websiteHoursFor(row: Scored["business"]): Promise<GoogleProfileTabProps["websiteHours"]> {
  const [{ parseWebsiteAnalysis }, { weekFromSite }, { WEBSITE_BUILDER_NAMES }, { managedSiteContact }] = await Promise.all([import("@/lib/scoring"), import("@/lib/gbpProfileEdits"), import("@/lib/websiteBuilder"), import("@/lib/hoursChooser")]);
  const analysis = parseWebsiteAnalysis((row as { website_analysis_json?: unknown }).website_analysis_json);
  const builderId = (analysis as { builder?: { id?: import("@/lib/websiteBuilder").WebsiteBuilderId | null } } | null)?.builder?.id ?? null;
  const siteUrl = (row as { verified_website_url?: string | null }).verified_website_url ?? row.website ?? null;
  return {
    week: weekFromSite(analysis?.websiteTrust?.infoConflicts.find((f) => f.field === "hours")?.siteWeek),
    builder: builderId ? { id: builderId, name: WEBSITE_BUILDER_NAMES[builderId] } : null,
    siteUrl,
    managedEmail: managedSiteContact(siteUrl, { MANAGED_SITE_HOSTS: process.env.MANAGED_SITE_HOSTS, MANAGED_SITE_CONTACT_EMAIL: process.env.MANAGED_SITE_CONTACT_EMAIL }),
    hasPhoneLink: analysis?.content ? analysis.content.hasPhoneLink : null,
  };
}

/** Photos and posts: read from Google when the last check is over a day old (the old tab's rule). */
async function mediaFor(businessId: string) {
  const db = createClient();
  let media = await loadPhotosAndPosts(db, businessId);
  if (media?.stale) {
    const r = await refreshPhotosAndPosts(createAdminClient(), businessId).catch(() => null);
    if (r?.ok) media = await loadPhotosAndPosts(db, businessId);
  }
  return media ? { photos: media.photos, posts: media.posts, checkedAt: media.checkedAt } : null;
}

export type GooglePageData<P> = Exclude<GooglePageBase, { status: "ok" }> | { status: "ok"; business: Summary["business"]; plan: Plan; websiteSuggested: string | null; props: P };

/** Growth → Google results: the monthly numbers and what they need. Free
 * sees no numbers, so nothing beyond the base loads. */
export async function loadGoogleResults(businessId: string, gbpParam?: string): Promise<GooglePageData<GoogleResultsProps>> {
  const base = await loadBase(businessId, gbpParam);
  if (base.status !== "ok") return base;
  const { common, plan, gbpConnected, scored, timeZone } = base;
  const practice = common.practice;
  if (plan === "free" || !(gbpConnected || practice)) {
    // Not connected: no numbers; only when they were last read (shown while reconnecting).
    const lastInsightsAt = plan !== "free" && common.needsReconnect ? await loadInsightsSyncedAt(createClient(), businessId).catch(() => null) : null;
    return { status: "ok", business: base.business, plan, websiteSuggested: base.websiteSuggested, props: { ...common, plan, lastInsightsAt } };
  }
  const db = createClient();
  const stored = gbpConnected ? await loadInsights(db, businessId) : null;
  const months = stored?.ok ? stored.months : [];
  const syncedAt = gbpConnected ? await loadInsightsSyncedAt(db, businessId) : null;
  const [saved, booking, media, extras, averageVisit, visitShare, actionEvents, websiteHours] = await Promise.all([
    loadGoogleTabSaved(db, businessId, { timeZone, practice, businessStatus: scored.business.business_status ?? null }),
    gbpConnected ? loadBookingState(createAdminClient(), businessId, months).catch(() => null) : Promise.resolve(null),
    gbpConnected ? mediaFor(businessId).catch(() => null) : Promise.resolve(null),
    gbpConnected ? listingExtras(createAdminClient(), businessId).catch(() => null) : Promise.resolve(null),
    gbpConnected ? loadAverageVisit(db, businessId) : Promise.resolve(null),
    gbpConnected ? loadVisitShare(db, businessId) : Promise.resolve(null),
    (await import("@/lib/googleActions.server")).loadActionEvents(db, businessId, { timeZone, practice, includeTestOffers: await viewerIsDevTestLogin() }).catch(() => []),
    websiteHoursFor(scored.business),
  ]);
  return {
    status: "ok",
    business: base.business,
    plan,
    websiteSuggested: base.websiteSuggested,
    props: {
      ...common,
      plan,
      saved,
      insights: months,
      insightsState: gbpConnected ? insightsStateFor(months.map((m) => m.month), syncedAt, new Date()) : "ready",
      booking,
      media,
      extras,
      averageVisit,
      visitShare,
      actionEvents,
      websiteHours,
    },
  };
}

/** The Google listing category's points in the saved scan ("28 / 30 pts"). */
export function listingCategoryPoints(breakdown: Pick<ScoreBreakdown, "categories">): { points: number; weight: number } | null {
  const i = breakdown.categories.findIndex((c) => c.id === "completeness");
  if (i < 0) return null;
  const cat = reportCategories(breakdown.categories)[i];
  return cat && cat.points !== null ? { points: cat.points, weight: cat.weight } : null;
}

/** Presence → Google listing: the rows, ideas, protection and undo state. */
export async function loadGoogleListing(businessId: string, gbpParam?: string): Promise<GooglePageData<GoogleListingPageProps>> {
  const base = await loadBase(businessId, gbpParam);
  if (base.status !== "ok") return base;
  const { common, plan, gbpConnected, scored, timeZone } = base;
  const practice = common.practice;
  const row = scored.business;
  const input = businessRowToScoringInput(scored.scoringBusiness ?? scored.business);
  // The website shows different hours (the same filter the scoring check uses).
  const hoursMismatch = mismatchedFields(input).includes("hours");
  const mismatchCheck = scored.result.breakdown.checks.find((c) => c.id === "website.info_consistency");
  // The mismatch fix's points belong to the Hours row only when hours are the only mismatch.
  const hoursMismatchPoints = hoursMismatch && mismatchedFields(input).length === 1 && mismatchCheck && mismatchCheck.earnedPoints !== null ? Math.max(0, mismatchCheck.maxPoints - mismatchCheck.earnedPoints) : null;
  // Google shows the website's hours now (the same check as the Overview's): "Changed since your last scan".
  const hoursMatchNow = hoursMismatch
    ? (await (await import("@/lib/hoursCheck.server")).loadHoursCheck(businessId, scored.scoringBusiness ?? scored.business, [{ checkId: "website.info_consistency", mismatchFields: ["hours"] }]).catch(() => null))?.kind === "stale"
    : false;
  const listingPoints = listingCategoryPoints(scored.result.breakdown);
  const score = scored.result.breakdown.total;
  if (!(gbpConnected || practice)) {
    return { status: "ok", business: base.business, plan, websiteSuggested: base.websiteSuggested, props: { ...common, plan, listingPoints, score, hoursMismatch, hoursMismatchPoints, hoursMatchNow, websiteHours: await websiteHoursFor(row) } };
  }
  const db = createClient();
  // A real change stuck on "Google reviewing" for 3+ days: read again (read only).
  // Only PostScore's own changes (Premium) can be stuck there.
  if (gbpConnected && !practice && hasPremium(plan)) await (await import("@/lib/gbpStaleChanges.server")).refreshStaleReviews(createAdminClient(), businessId).catch(() => null);
  const stored = gbpConnected ? await loadInsights(db, businessId).catch(() => null) : null;
  const months = stored?.ok ? stored.months : [];
  const [saved, booking, media, extras, messagingOn, practiceSource, websiteHours] = await Promise.all([
    loadGoogleTabSaved(db, businessId, { timeZone, practice, businessStatus: row.business_status ?? null }),
    gbpConnected ? loadBookingState(createAdminClient(), businessId, months).catch(() => null) : Promise.resolve(null),
    gbpConnected ? mediaFor(businessId).catch(() => null) : Promise.resolve(null),
    gbpConnected ? listingExtras(createAdminClient(), businessId).catch(() => null) : Promise.resolve(null),
    // Read-only: is a texting/WhatsApp option on the owner's location?
    gbpConnected ? (await import("@/lib/gbpMessaging.server")).readGbpMessaging(businessId).catch(() => null) : Promise.resolve(null),
    practice ? (await import("@/lib/gbpProfilePractice.server")).seedPracticeListing(businessId) : Promise.resolve(null),
    websiteHoursFor(row),
  ]);
  // "Not yet: … turning on Google booking" while case B stands (as on the old tab).
  if (booking?.tracking.kind === "turn_on" && !saved.recap.notYet.includes("booking")) saved.recap.notYet.push("booking");
  const nowMatch = gbpConnected ? await loadNowMatchPrompts(db, businessId, { made: saved.made ?? [], google: scored.scoringBusiness ?? scored.business }).catch(() => ({})) : {};
  return {
    status: "ok",
    business: base.business,
    plan,
    websiteSuggested: base.websiteSuggested,
    props: {
      ...common,
      plan,
      listingPoints,
      score,
      hoursMismatch,
      hoursMismatchPoints,
      hoursMatchNow,
      saved,
      // Only for "Show up for more" (search terms behind the service ideas); no numbers are shown.
      insights: months,
      booking,
      media,
      extras,
      messagingOn,
      practiceSource,
      websiteHours,
      nowMatch,
    },
  };
}

/** The dev test login sees its own test offers in "Since you did this" (spec §6.2 exception); real owners never. */
async function viewerIsDevTestLogin(): Promise<boolean> {
  const { data } = await createClient().auth.getUser();
  return isDevTestLoginEmail(data.user?.email);
}
