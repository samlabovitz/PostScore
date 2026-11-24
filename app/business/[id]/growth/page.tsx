import { GOOGLE_MISMATCH_CHECK_ID } from "@/lib/actionPlan";
import { loadHoursCheck } from "@/lib/hoursCheck.server";
import { withHoursWhen } from "@/lib/hoursCheck";
import { loadDetailsMismatches, loadNowMatchPrompts } from "@/lib/detailsMismatch.server";
import { googleWritesAllowed } from "@/lib/gbpReviewPractice";
import { parseGbpResult } from "@/lib/gbpLanding";
import { isGbpOAuthConfigured } from "@/lib/googleBusinessProfile";
import { notFound, redirect } from "next/navigation";
import { StaleScanNotice } from "@/components/scoring/StaleScanNotice";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { websiteOnlyGuard } from "@/components/scoring/websiteOnlyGuard";
import { freeShowroom } from "@/components/plan/freeShowroom";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { loadUpgradeContext } from "@/lib/upgradePromos.server";
import { getLocalBenchmark } from "@/app/actions/competitors";
import { reviewGoalLines } from "@/lib/reviewGoal";
import { Card } from "@/components/ui/Card";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById, getLastScanAt } from "@/app/actions/scoring";
import { getWebsiteRecheckStatus } from "@/app/actions/websiteRecheck";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getGrowthMoves } from "@/app/actions/growthMoves";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { getCustomerDetailsUndo } from "@/app/actions/gbpCustomerDetails";
import { getWebsiteLinkUndoForPage } from "@/app/actions/gbpWebsiteLink";
import { shownWebsite } from "@/lib/businessWebsite";
import { GbpEditProvider } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { googleWritesPageState } from "@/app/actions/gbpWebsiteLink";
import { businessRowToScoringInput } from "@/lib/scoring";
import { buildPriceCheckMove } from "@/lib/growthMoves";
import { buildWeeklyChecklistItems, weekStartFor } from "@/lib/weeklyChecklist";
import { resolveBizProfile } from "@/config/bizProfiles";
import { viewLocale } from "@/lib/viewLocale.server";
import { GrowthView } from "./GrowthView";
import { canConnectGbp, getPlan, hasPremium } from "@/lib/premium";
import { SEARCH_DEMAND_EXAMPLE } from "@/lib/gbp/searchDemand";
import { campaignsHref } from "@/lib/campaignsTabs";
import { isGoogleTabParam } from "@/lib/googleProfileTab";
import { loadGoogleTabSaved } from "@/lib/googleProfileTab.server";
import { loadBookingState, loadInsights, loadInsightsSyncedAt } from "@/lib/gbpInsights.server";
import { loadPhotosAndPosts, refreshPhotosAndPosts } from "@/lib/gbpMediaPosts.server";
import { listingExtras } from "@/lib/gbpRealListing.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { insightsStateFor } from "@/lib/gbpInsights";
import { loadAverageVisit } from "@/lib/averageVisit.server";
import { reportCategories } from "@/lib/reports/reportCategories";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_BUSINESS_TIMEZONE } from "@/lib/i18n";
import type { GoogleProfileTabProps } from "@/components/gbp/GoogleProfileTab";

export default async function GrowthPage({ params, searchParams = {} }: { params: { id: string }; searchParams?: { tab?: string; gbp?: string } }) {
  // Coupons and referrals moved to the Campaigns page: old links to
  // Growth's ?tab=coupons / ?tab=referral land on the matching tab there.
  if (searchParams.tab === "coupons") redirect(campaignsHref(params.id, "coupons"));
  if (searchParams.tab === "referral" || searchParams.tab === "referrals") redirect(campaignsHref(params.id, "referrals"));
  // Free: this tab is locked — its showroom, before any of its own data loads.
  const showroom = await freeShowroom(params.id, "growth");
  if (showroom) return showroom;

  // Independent loads run together; see lib/requestCache.ts for why the
  // repeated business/score reads cost one query each.
  const [websiteOnly, summary, scored, upgrade] = await Promise.all([
    websiteOnlyGuard(params.id, "growth"),
    getBusinessSummary(params.id),
    // The score reads the business's own language from its row.
    scoreBusinessById(params.id, "business"),
    loadUpgradeContext(params.id, "growth"),
  ]);
  if (websiteOnly) return websiteOnly;

  if (summary.status === "unauthenticated") {
    redirect("/login");
  }
  if (summary.status === "not_found") {
    notFound();
  }

  const { business } = summary;
  const locale = viewLocale(business.language);
  const profile = resolveBizProfile(
    business.category,
    business.primary_type,
    business.business_type_override,
    locale,
    business.categories,
    business.name,
    business.biz_type_resolved
  );

  // These need only the business, not its score — start them now.
  const checklistPromise = getWeeklyChecklistState(params.id);
  const lastScanPromise = getLastScanAt(params.id);
  const gbpPromise = getGbpConnectionStatus(params.id);
  // The Google Profile tab is Premium (Free/Grow see a preview).
  const plan = await getPlan();


  if (scored.status === "unauthenticated") {
    redirect("/login");
  }
  if (scored.status === "not_found") {
    notFound();
  }
  if (scored.status === "error") {
    return (
      <DashboardShell business={business}>
        <Card className="p-5 text-sm text-red">{scored.message}</Card>
      </DashboardShell>
    );
  }

  const input = businessRowToScoringInput(scored.scoringBusiness ?? scored.business);
  // "Connect Google" joins the Growth recap while it isn't connected.
  const gbpEarly = await gbpPromise;
  const connectGoogle = canConnectGbp() && !(gbpEarly.status === "ok" && gbpEarly.connected);
  const [actionPlanResult, growthMovesResult, checklistStateResult, lastScanAt, gbpStatus, recheckStatus, benchmark] = await Promise.all([
    getActionPlan(params.id, input, scored.result.breakdown, scored.result.suggestions, locale, {
      businessRow: scored.scoringBusiness ?? scored.business,
      businessName: business.name ?? "Your business",
      googleMapsUri: scored.business.google_maps_uri ?? null,
      profileId: profile.id,
    }, { plan, connectGoogle }),
    getGrowthMoves(params.id, scored.result.breakdown, profile, locale),
    checklistPromise,
    lastScanPromise,
    gbpPromise,
    getWebsiteRecheckStatus(params.id),
    // The shared review goal for the review task (DB only, request-cached).
    getLocalBenchmark(params.id),
  ]);

  // The price check always shows for every business (Step 2f) — even if
  // the rest of the growth signals couldn't load.
  const growthMoves =
    growthMovesResult.status === "ok" ? growthMovesResult.moves : [buildPriceCheckMove(params.id, null, locale, business.time_zone)];

  const weeklyChecklist = {
    items: buildWeeklyChecklistItems(locale),
    checkedItemIds: checklistStateResult.status === "ok" ? checklistStateResult.state.checkedItemIds : [],
    streakWeeks: checklistStateResult.status === "ok" ? checklistStateResult.state.streakWeeks : 0,
    weekStart: checklistStateResult.status === "ok" ? checklistStateResult.state.weekStart : weekStartFor(new Date(), business.time_zone ?? undefined),
    // What PostScore checked itself this week (connected Premium), and which note fits.
    auto: checklistStateResult.status === "ok" ? checklistStateResult.state.auto : {},
    notice: checklistStateResult.status === "ok" ? checklistStateResult.state.notice : ("self" as const),
  };

  const gbpConnected = gbpStatus.status === "ok" && gbpStatus.connected;
  const row = scored.business;
  const googleProfile = {
    listing: {
      rating: row.rating,
      reviewCount: row.review_count,
      photoCount: row.photo_count,
      hasHours: !!row.opening_hours && row.opening_hours.length > 0,
      phone: row.phone,
      website: row.website,
      category: row.category,
      googleMapsUri: row.google_maps_uri ?? null,
    },
    // Website-only businesses never reach this page (websiteOnlyGuard).
    websiteOnly: false,
    connected: gbpConnected,
    // Practice mode (never in production): "Edit on Google" on a sample listing, connected or not.
    practice: (await import("@/lib/gbpReviewPractice")).reviewRepliesPracticeOn(),
    // Read-only: is a texting/WhatsApp option on the owner's location (✓)?
    messagingOn: gbpConnected ? await (await import("@/lib/gbpMessaging.server")).readGbpMessaging(params.id) : null,
    // Same rule as search demand everywhere: example data under an
    // "Example" watermark until the connection is live.
    searchDemand: canConnectGbp() && hasPremium(await getPlan()) && gbpConnected ? ({ kind: "awaiting" } as const) : ({ kind: "preview", data: SEARCH_DEMAND_EXAMPLE } as const),
    connection: {
      locationTitle: gbpStatus.status === "ok" ? gbpStatus.locationTitle : null,
      locationAddress: gbpStatus.status === "ok" ? gbpStatus.locationAddress : null,
      needsReconnect: gbpStatus.status === "ok" && gbpStatus.needsReconnect,
      result: parseGbpResult(searchParams.gbp),
      canStart: canConnectGbp() && isGbpOAuthConfigured(),
      business: { name: row.name ?? null, address: row.address ?? null },
      replyCounts: gbpStatus.status === "ok" ? gbpStatus.replyCounts : null,
    },
  };

  // The booking button and whether Google can count its bookings (case B
  // adds a one-time task to the Growth recap; lib/bookingPartners.ts).
  const bookingState =
    hasPremium(plan) && gbpConnected
      ? await (async () => {
          const months = await loadInsights(createClient(), params.id);
          return loadBookingState(createAdminClient(), params.id, months.ok ? months.months : []).catch(() => null);
        })()
      : null;

  // Day 23C, Grow/Free: this week's Google to-dos (exact counts and dates),
  // each with the steps to do it yourself — from what's already read for
  // this business (0 Places calls): the reply check, the stored photo/post
  // summaries and monthly numbers, and the real listing when connected.
  const growRecs =
    !hasPremium(plan) && isGoogleTabParam(searchParams.tab)
      ? await (async () => {
          const { recommendations } = await import("@/lib/googleRecommendations");
          const { answersPlan } = await import("@/lib/googleAnswers");
          const { ideaTypeOf, listingIdeas } = await import("@/lib/listingIdeas");
          const db = createClient();
          const timeZone = business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE;
          const now = Date.now();
          const media = gbpConnected ? await loadPhotosAndPosts(db, params.id).catch(() => null) : null;
          const extras = gbpConnected ? await listingExtras(createAdminClient(), params.id).catch(() => null) : null;
          const stored = gbpConnected ? await loadInsights(db, params.id).catch(() => null) : null;
          const months = stored?.ok ? stored.months : [];
          const type = ideaTypeOf((row as { niche_id?: string | null }).niche_id ?? null, extras?.categories ?? row.categories ?? []);
          // Not connected: photos only when the scan's photo check isn't at full points (no dates to go by).
          const photoCheck = scored.result.breakdown.checks.find((c) => c.id === "completeness.photos");
          const photos = media?.photos ?? (photoCheck && photoCheck.earnedPoints !== null && photoCheck.earnedPoints < photoCheck.maxPoints ? { count: 0, newestAt: null } : null);
          const ideas = extras
            ? listingIdeas({ businessId: params.id, now, type, months, listing: { services: extras.services, categories: extras.categories, description: extras.description ?? null, specialPeriods: extras.specialPeriods, attributeIds: extras.attributeIds ?? null, details: extras.details ?? null }, photos: null, posts: null, messagingOn: null, bookingTurnOn: null })
            : [];
          const details = ideas.find((i) => i.id === "details");
          const services = ideas.find((i) => i.id === "services");
          const replyCounts = gbpStatus.status === "ok" ? gbpStatus.replyCounts : null;
          const list = recommendations({
            type,
            now,
            timeZone,
            replies: replyCounts ? { replied: replyCounts.replied, inWindow: replyCounts.reviewsInWindow } : null,
            photos,
            posts: media?.posts ?? null,
            months,
            specialPeriods: extras?.specialPeriods ?? null,
            description: extras && extras.description !== undefined ? extras.description : undefined,
            missingDetails: details?.id === "details" ? details.missing : [],
            missingServices: services?.id === "services" ? services.missing.map((m) => m.service) : [],
            // Day 23E, Grow: "Answer your customers' common questions" (Free keeps the separate items).
            answers: plan === "grow" && extras ? answersPlan({ description: extras.description, services: extras.services, pricedServices: extras.pricedServices, details: extras.details ?? null }) : null,
          });
          return { list, type, connected: gbpConnected };
        })().catch(() => null)
      : null;

  // Premium's Google Profile tab: its own saved data, only while it's open.
  const googleTab: GoogleProfileTabProps | null =
    hasPremium(plan) && isGoogleTabParam(searchParams.tab)
      ? await (async () => {
          const practice = googleProfile.practice;
          const db = createClient();
          // A real change stuck on "Google reviewing" for 3+ days: read again (read only).
          if (gbpConnected && !practice) await (await import("@/lib/gbpStaleChanges.server")).refreshStaleReviews(createAdminClient(), params.id).catch(() => null);
          const saved = gbpConnected || practice ? await loadGoogleTabSaved(db, params.id, { timeZone: business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE, practice, businessStatus: row.business_status ?? null }) : null;
          // "Not yet: … turning on Google booking" while case B stands.
          if (saved && bookingState?.tracking.kind === "turn_on" && !saved.recap.notYet.includes("booking")) saved.recap.notYet.push("booking");
          // Google's monthly numbers. Shown when the last full month is stored;
          // otherwise the tab syncs them (app/actions/gbpInsights.ts), unless a
          // sync in the last 6 hours found Google had nothing for that month.
          const stored = gbpConnected ? await loadInsights(db, params.id) : null;
          const syncedAt = gbpConnected ? await loadInsightsSyncedAt(db, params.id) : null;
          const insightsState = insightsStateFor(stored?.ok ? stored.months.map((m) => m.month) : [], syncedAt, new Date());
          // Practice mode: the fake Google starts as a copy of the real listing.
          const practiceSource = practice ? await (await import("@/lib/gbpProfilePractice.server")).seedPracticeListing(params.id) : null;
          // Photos and posts: read from Google when the last check is over a day old.
          let media = gbpConnected ? await loadPhotosAndPosts(db, params.id) : null;
          if (gbpConnected && media?.stale) {
            const r = await refreshPhotosAndPosts(createAdminClient(), params.id).catch(() => null);
            if (r?.ok) media = await loadPhotosAndPosts(db, params.id);
          }
          // Holiday hours, services and categories from the real listing (cached read).
          const extras = gbpConnected ? await listingExtras(createAdminClient(), params.id) : null;
          const averageVisit = gbpConnected ? await loadAverageVisit(db, params.id) : null;
          // Day 23C: the owner's "how many become paying visits", and what they did, by day.
          const visitShare = gbpConnected ? await (await import("@/lib/averageVisit.server")).loadVisitShare(db, params.id) : null;
          const actionEvents = gbpConnected || practice ? await (await import("@/lib/googleActions.server")).loadActionEvents(db, params.id, { timeZone: business.time_zone ?? DEFAULT_BUSINESS_TIMEZONE, practice }).catch(() => []) : [];
          const website = reportCategories(scored.result.breakdown.categories).find((_, i) => scored.result.breakdown.categories[i].id === "website");
          const hasWebsite = scored.result.breakdown.checks.find((c) => c.id === "website.has_website")?.earnedPoints !== 0;
          return {
            businessId: params.id,
            connected: gbpConnected,
            practice,
            needsReconnect: googleProfile.connection.needsReconnect,
            canStart: googleProfile.connection.canStart,
            result: googleProfile.connection.result,
            business: googleProfile.connection.business,
            listing: { ...googleProfile.listing, categories: row.categories ?? null, openingHours: row.opening_hours ?? null },
            checks: scored.result.breakdown.checks,
            website: website && hasWebsite && website.points !== null ? { earned: website.points, of: website.weight, fixes: website.needsWork } : null,
            replyCounts: gbpStatus.status === "ok" ? gbpStatus.replyCounts : null,
            messagingOn: googleProfile.messagingOn,
            saved,
            lastScanAt,
            insights: stored?.ok ? stored.months : [],
            insightsState: gbpConnected ? insightsState : "ready",
            averageVisit,
            visitShare,
            actionEvents,
            practiceSource,
            booking: bookingState,
            media: media ? { photos: media.photos, posts: media.posts, checkedAt: media.checkedAt } : null,
            extras,
            // "Change it back" / Undo from PostScore: practice, or on the live list.
            nicheId: (row as { niche_id?: string | null }).niche_id ?? null,
            // The website's hours from the last scan (section 6's hours card, "Website's version").
            websiteHours: await (async () => {
              const [{ parseWebsiteAnalysis }, { weekFromSite }, { WEBSITE_BUILDER_NAMES }, { managedSiteContact }] = await Promise.all([import("@/lib/scoring"), import("@/lib/gbpProfileEdits"), import("@/lib/websiteBuilder"), import("@/lib/hoursChooser")]);
              const analysis = parseWebsiteAnalysis((row as { website_analysis_json?: unknown }).website_analysis_json);
              const builderId = (analysis as { builder?: { id?: import("@/lib/websiteBuilder").WebsiteBuilderId | null } } | null)?.builder?.id ?? null;
              const siteUrl = (row as { verified_website_url?: string | null }).verified_website_url ?? row.website ?? null;
              return {
                week: weekFromSite(analysis?.websiteTrust?.infoConflicts.find((f) => f.field === "hours")?.siteWeek),
                builder: builderId ? { id: builderId, name: WEBSITE_BUILDER_NAMES[builderId] } : null,
                siteUrl,
                managedEmail: managedSiteContact(siteUrl, { MANAGED_SITE_HOSTS: process.env.MANAGED_SITE_HOSTS, MANAGED_SITE_CONTACT_EMAIL: process.env.MANAGED_SITE_CONTACT_EMAIL }),
                // A real tel: link on the site (section 2's "What this means for you").
                hasPhoneLink: analysis?.content ? analysis.content.hasPhoneLink : null,
              };
            })(),
            hoursMismatch: actionPlanResult.status === "ok" ? actionPlanResult.tasks.some((task) => task.checkId === GOOGLE_MISMATCH_CHECK_ID && (task.mismatchFields ?? []).includes("hours")) : undefined,
            canEditGoogle: practice || googleWritesAllowed((row as { place_id?: string | null }).place_id ?? null),
            // Day 23B: "Your {field} now match. Save these as your confirmed details?" (once per change).
            nowMatch: gbpConnected ? await loadNowMatchPrompts(db, params.id, { made: saved?.made ?? [], google: scored.scoringBusiness ?? scored.business }).catch(() => ({})) : {},
          };
        })()
      : null;

  // The scored hours check as it is now; waiting on Google → "Takes a few weeks".
  const hoursCheck = actionPlanResult.status === "ok" ? await loadHoursCheck(params.id, scored.scoringBusiness ?? scored.business, actionPlanResult.tasks).catch(() => null) : null;
  const actionPlan =
    actionPlanResult.status === "ok"
      ? {
          ...actionPlanResult,
          tasks: withHoursWhen(actionPlanResult.tasks, hoursCheck),
          weeklyTasks: withHoursWhen(actionPlanResult.weeklyTasks, hoursCheck),
          laterTasks: withHoursWhen(actionPlanResult.laterTasks, hoursCheck),
        }
      : {
          tasks: [],
          completed: [],
          weeklyTasks: [],
          laterTasks: [],
          weeklyProjectedBreakdown: scored.result.breakdown,
          weeklyProjectedBreakdownHigh: null,
          weeklyPointsWithinReach: 0,
          websiteBanner: null,
          error:
            actionPlanResult.status === "error"
              ? actionPlanResult.message
              : "Couldn't load your action plan — try refreshing.",
        };

  return (
    <DashboardShell upgrade={upgrade} business={business}>
      {showRescanNotice(lastScanAt, new Date()) && (
        <div className="mb-6">
          <StaleScanNotice businessId={params.id} lastScanAt={lastScanAt} now={new Date().toISOString()} />
        </div>
      )}
      {/* The Google Profile tab's Edit on Google also carries the website link and customer details (with their Undo). */}
      <GbpEditProvider
        value={{
          premium: hasPremium(plan),
          connected: gbpConnected,
          undo: await getCustomerDetailsUndo(params.id),
          websiteUndo: await getWebsiteLinkUndoForPage(params.id),
          ...(await googleWritesPageState(params.id)),
          websiteSuggested: (() => {
            const shown = shownWebsite(row);
            return shown.kind === "site" && shown.source !== "listing" ? shown.url : null;
          })(),
        }}
      >
      <GrowthView
        reviewGoalLines={benchmark.status === "ok" && benchmark.benchmark.reviewGoal ? reviewGoalLines(benchmark.benchmark.reviewGoal, benchmark.benchmark.reviewGroup, locale) : []}
        businessId={params.id}
        businessName={business.name}
        profile={profile}
        breakdown={scored.result.breakdown}
        googleProfile={{ ...googleProfile, recs: growRecs }}
        googleTab={googleTab}
        bookingTask={bookingState?.tracking.kind === "turn_on" ? { provider: bookingState.tracking.provider, still: bookingState.tracking.still } : null}
        hoursCheck={hoursCheck}
        detailsMismatch={await loadDetailsMismatches(createClient(), params.id, scored.scoringBusiness ?? scored.business).catch(() => null)}
        actionPlan={actionPlan}
        growthMoves={growthMoves}
        weeklyChecklist={weeklyChecklist}
        lastScanAt={lastScanAt}
        websiteRecheck={recheckStatus.status === "ok" ? { left: recheckStatus.availability.left, hasWebsite: recheckStatus.hasWebsite } : null}
        gbpConnected={gbpConnected}
        listingWebsite={row.website ?? null}
        linkOptions={{ referralOk: profile.referralOk, couponsOk: profile.couponsOk, pricingOk: profile.pricingOk }}
        plan={plan}
      />
      </GbpEditProvider>
    </DashboardShell>
  );
}
