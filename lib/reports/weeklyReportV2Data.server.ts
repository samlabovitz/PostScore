import "server-only";

// The three-page weekly report's data (lib/reports/weeklyReportV2.ts), from
// saved data only: the week's ReportData (the one-page report's own
// numbers), the two compared scans' checks for "Where your points moved",
// the business type for the rank wording, the Google connection for the
// "waiting on Google" box, and the action plan's top 3 steps. The only
// live read is the business's own classes/events page, for real upcoming
// dates — read and thrown away, never stored. Nothing is invented: a
// missing piece leaves its section out.

import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_PROFILE_IDS } from "@/lib/gbpOrderLink";
import { isFoodBusiness } from "@/lib/serviceOptions";
import { loadBusinessNiche } from "@/lib/businessNiche.server";
import { isGeneralNiche, nicheById } from "@/lib/niches";
import { nicheGroupNoun, townStateFromAddress } from "@/lib/competitorQuery";
import { businessRowToScoringInput, checkLabelKey, type CheckResult, type ScoreBreakdown } from "@/lib/scoring";
import { pointsText, recRangeText, wholePointRange } from "@/lib/pointRange";
import { headToHeadScores } from "@/lib/competitorHeadToHead";
import { readListingPage } from "@/lib/websiteAnalysis";
import { t, tPlural, type Locale } from "@/lib/i18n";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { fixFlowCheck } from "@/lib/fixFlows";
import { googleWritesAllowed } from "@/lib/gbpReviewPractice";
import { GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
import type { Recommendation } from "@/lib/overviewTiles";
import type { ReportSources } from "./reportData.server";
import type { ReportData } from "./reportPdf";
import {
  capMovedRows,
  familyPostIdeas,
  headedItems,
  listingKind,
  pointsMovedRows,
  postFamily,
  todayItems,
  waitingOnGoogle,
  websitePostRows,
  type PlanStep,
  type PointsMoved,
  type Posts,
  type WeeklyReportV2Data,
} from "./weeklyReportV2";

const K = (key: string) => `dashboard.reports.v2.${key}` as Parameters<typeof t>[1];

/** Appointment and class businesses: no hours can mean "by appointment". */
const APPOINTMENT_PROFILES = new Set([...BOOKING_PROFILE_IDS, "tutor_education", "photographer", "childcare"]);
const REVIEW_CHECKS = new Set(["visibility.review_count", "visibility.reviews_merged", "visibility.review_recency"]);

const labelOf = (locale: Locale) => (check: CheckResult) => {
  const key = checkLabelKey(check.id);
  return key ? t(locale, key) : check.label;
};

function stepPoints(rec: Recommendation, locale: Locale): string {
  return rec.pointsHigh !== null
    ? recRangeText(locale, rec.points, rec.pointsHigh)
    : pointsText(locale, wholePointRange(rec.points, null).low, rec.source.kind === "website");
}

interface StepContext {
  locale: Locale;
  profileId: string;
  name: string;
  typeLabel: string | null;
  town: string | null;
  rating: number | null;
  reviewCount: number | null;
  checks: CheckResult[];
  hasMetaDescription: boolean | null;
  /** Premium with Google connected: steps with a built editor point to
   * "Fix it with PostScore" instead of Google. */
  fixInApp: boolean;
}

/** The checks a recommendation is about — "get a website" also covers the
 * listing's website link; "improve your website" every website check. */
export function recChecks(rec: Recommendation): string[] {
  if (rec.source.kind === "task") return [rec.source.task.checkId, ...(rec.source.task.mergedCheckIds ?? [])];
  return rec.source.banner.kind === "improve" ? ["website.*"] : ["website.has_website", "completeness.website_link"];
}

/** The top `max` steps, never two for the same check: in priority order, a
 * step whose checks overlap one already picked is skipped and the next
 * real step fills its place (the real Lulu's Tacos case: "Link your
 * website" and "Get a website"). */
export function distinctRecs(recs: Recommendation[], max = 3): Recommendation[] {
  const taken = new Set<string>();
  const overlaps = (ids: string[]) => ids.some((id) => taken.has(id) || (id === "website.*" && Array.from(taken).some((x) => x.startsWith("website."))) || (id.startsWith("website.") && taken.has("website.*")));
  const out: Recommendation[] = [];
  for (const rec of recs) {
    if (out.length >= max) break;
    const ids = recChecks(rec);
    if (overlaps(ids)) continue;
    ids.forEach((id) => taken.add(id));
    out.push(rec);
  }
  return out;
}

/** The words that carry an instruction (4+ letters, the leading verb
 * dropped): "Agregue el número de teléfono … en Google" and "Actualice el
 * número de teléfono … en Google" share them all. */
function instructionWords(line: string): Set<string> {
  const words = line.toLowerCase().match(/[a-z\u00e0-\u024f]{4,}/g) ?? [];
  return new Set(words.slice(1));
}

/** Two lines that say the same thing in other words. */
export function sameInstruction(a: string, b: string): boolean {
  const x = instructionWords(a);
  const y = instructionWords(b);
  if (x.size === 0 || y.size === 0) return a.trim().toLowerCase() === b.trim().toLowerCase();
  const shared = Array.from(x).filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared) >= 0.6;
}

/** A step never says the same instruction twice: a bullet that repeats the
 * title, the "why" or an earlier bullet is dropped. */
export function distinctBullets(step: PlanStep): PlanStep {
  const kept: string[] = [];
  for (const b of step.bullets) {
    if ([step.title, step.why, ...kept].some((x) => x && sameInstruction(x, b))) continue;
    kept.push(b);
  }
  return { ...step, bullets: kept };
}

export function planStep(rec: Recommendation, c: StepContext): PlanStep {
  const { locale } = c;
  const points = stepPoints(rec, locale);
  if (rec.source.kind === "website") {
    const banner = rec.source.banner;
    if (banner.kind !== "improve") {
      return { label: t(locale, "dashboard.growth.websiteBanner.getWebsite.title"), title: t(locale, "dashboard.growth.websiteBanner.getWebsite.title"), urgent: rec.urgent, minutes: null, points, summary: t(locale, "dashboard.growth.websiteBanner.getWebsite.cta"), why: "", bullets: [t(locale, "dashboard.growth.websiteBanner.getWebsite.cta")], script: null };
    }
    // The website checks losing points, biggest first, with their own words.
    const losing = c.checks
      .filter((x) => x.category === "website" && x.earnedPoints !== null && x.earnedPoints < x.maxPoints)
      .sort((a, b) => b.maxPoints - (b.earnedPoints ?? 0) - (a.maxPoints - (a.earnedPoints ?? 0)))
      .slice(0, 3)
      .map((x) => `${labelOf(locale)(x)}: ${x.explanation}`);
    const meta = c.hasMetaDescription === false && c.typeLabel && c.town;
    return {
      label: t(locale, "dashboard.overview.recs.improveWebsite"),
      title: t(locale, "dashboard.overview.recs.improveWebsite"),
      urgent: rec.urgent,
      minutes: null,
      points,
      summary: tPlural(locale, "dashboard.reports.v2.website.summary", banner.improvements, { earned: banner.earned, of: banner.of, count: banner.improvements }),
      why: t(locale, K("website.why"), { earned: banner.earned, of: banner.of }),
      bullets: [...losing, ...(meta ? [t(locale, K("website.meta"))] : [])],
      script: meta ? { label: t(locale, K("startingText")), text: t(locale, K("website.metaSample"), { type: c.typeLabel!, town: c.town!, name: c.name }) } : null,
    };
  }
  const task = rec.source.task;
  if (task.checkId === "completeness.hours" && APPOINTMENT_PROFILES.has(c.profileId)) {
    return {
      label: task.label,
      title: t(locale, K("hoursAppt.title")),
      urgent: rec.urgent,
      minutes: task.minutes ?? 10,
      points,
      summary: t(locale, K("hoursAppt.summary")),
      why: t(locale, K("hoursAppt.why")),
      bullets: [t(locale, K("hoursAppt.b1")), t(locale, K("hoursAppt.b2")), t(locale, K("hoursAppt.b3"))],
      script: { label: t(locale, K("hoursAppt.sampleLabel")), text: t(locale, K("hoursAppt.sample")) },
    };
  }
  if (REVIEW_CHECKS.has(task.checkId) && c.reviewCount !== null) {
    return {
      label: task.label,
      title: t(locale, K("reviews.title")),
      urgent: rec.urgent,
      minutes: task.minutes ?? null,
      points,
      summary: task.weeklyTarget ?? t(locale, K("reviews.summary")),
      why: t(locale, K(`reviews.why${c.rating !== null ? "" : "NoRating"}${c.reviewCount === 1 ? "One" : ""}`), { rating: c.rating?.toFixed(1) ?? "", count: c.reviewCount }),
      bullets: [t(locale, K("reviews.b1")), t(locale, K("reviews.b2"))],
      script: { label: t(locale, K("whatToSay")), text: t(locale, locale === "es" ? "dashboard.websiteReviews.guide.scriptEs" : "dashboard.websiteReviews.guide.scriptEn") },
    };
  }
  const title = task.title ?? task.label;
  const editor = c.fixInApp ? fixFlowCheck(task.checkId, task.mergedCheckIds) : null;
  if (editor) {
    const fix = t(locale, K("fixInApp"), { page: t(locale, editor === "visibility.review_replies" ? "dashboard.nav.reviews" : "dashboard.nav.growth"), button: t(locale, "dashboard.fixWithPostScore.button") });
    return { label: task.label, title, urgent: rec.urgent, minutes: task.minutes ?? null, points, summary: fix, why: task.why ?? "", bullets: [GOOGLE_WRITES_FOR_EVERYONE ? fix : `${fix} (${t(locale, "dashboard.fixWithPostScore.beta")})`], script: null };
  }
  const bullets = [task.action, task.fix].filter((s): s is string => !!s && s.trim().length > 0);
  return { label: task.label, title, urgent: rec.urgent, minutes: task.minutes ?? null, points, summary: task.weeklyTarget ?? task.action ?? "", why: task.why ?? "", bullets, script: null };
}

/** "Where your points moved": the compared scans' checks, with a scoring
 * update in between shown on its own. */
async function loadMoved(db: SupabaseClient, base: ReportData, locale: Locale): Promise<PointsMoved | null> {
  const ids = base.weekly?.comparedScans;
  if (!base.period || !ids) return null;
  const { data } = await db.from("scores").select("id, total, created_at, scoring_version, breakdown_json").in("id", [ids.fromId, ids.toId]);
  const rows = (data ?? []) as Array<{ id: string; total: number; created_at: string; scoring_version: string; breakdown_json: ScoreBreakdown }>;
  const from = rows.find((r) => r.id === ids.fromId);
  const to = rows.find((r) => r.id === ids.toId);
  if (!from || !to || !from.breakdown_json?.checks || !to.breakdown_json?.checks) return null;
  const label = labelOf(locale);
  if (from.scoring_version === to.scoring_version) {
    return { from: from.total, to: to.total, rows: capMovedRows(pointsMovedRows(from.breakdown_json.checks, to.breakdown_json.checks, from.total, to.total, label), 6, locale), scoringUpdate: null, unsplit: false };
  }
  // A scoring update between them: its snapshot re-scored the same data.
  const { data: updates } = await db
    .from("scores")
    .select("total, created_at, scoring_version, breakdown_json")
    .eq("business_id", (base as ReportData & { businessId?: string }).businessId ?? "")
    .gt("created_at", from.created_at)
    .lte("created_at", to.created_at)
    .eq("scoring_version", to.scoring_version)
    .order("created_at", { ascending: true })
    .limit(10);
  const update = ((updates ?? []) as Array<{ total: number; breakdown_json: ScoreBreakdown }>).find((u) => u.breakdown_json?.scanKind === "scoring_update" && u.breakdown_json.checks);
  if (!update) return { from: from.total, to: to.total, rows: [], scoringUpdate: null, unsplit: true };
  return {
    from: from.total,
    to: to.total,
    rows: capMovedRows(pointsMovedRows(update.breakdown_json.checks, to.breakdown_json.checks, update.total, to.total, label), 6, locale),
    // A scoring update that didn't move the total isn't worth a line.
    scoringUpdate: update.total !== from.total ? { from: from.total, to: update.total } : null,
    unsplit: false,
  };
}

export async function buildWeeklyReportV2Data(
  db: SupabaseClient,
  businessId: string,
  base: ReportData,
  sources: ReportSources,
  options: { plan: Plan; now?: Date; fetchImpl?: typeof fetch; readListing?: typeof readListingPage }
): Promise<WeeklyReportV2Data> {
  const now = options.now ?? new Date();
  const { locale } = base;
  const business = sources.business;
  const checks = sources.breakdown.checks ?? [];

  const [connection, niche, firstScan] = await Promise.all([
    db.from("gbp_connections").select("status").eq("business_id", businessId).maybeSingle(),
    loadBusinessNiche(db, businessId),
    db.from("scores").select("created_at").eq("business_id", businessId).order("created_at", { ascending: true }).limit(1),
  ]);
  const connected = (connection.data as { status?: string } | null)?.status === "connected";

  // Waiting on Google: only while it isn't connected.
  const waitingChecks = waitingOnGoogle(checks, connected);
  const visIndex = sources.breakdown.categories.findIndex((c) => c.id === "visibility");
  const waiting =
    waitingChecks.length > 0 && visIndex >= 0
      ? {
          checks: waitingChecks.map((c) => ({ label: labelOf(locale)(c), points: c.maxPoints })),
          category: { label: base.categories[visIndex]?.label ?? sources.breakdown.categories[visIndex].label, points: base.categories[visIndex]?.points ?? null, weight: base.categories[visIndex]?.weight ?? sources.breakdown.categories[visIndex].weight },
        }
      : null;

  const categoryLines = base.categories.map((cat, i) => {
    const waitingHere = i === visIndex && waiting ? waiting.checks.length : 0;
    const parts = [
      tPlural(locale, "dashboard.overview.breakdown.done", cat.done, { count: cat.done }),
      tPlural(locale, "dashboard.overview.breakdown.needsWork", cat.needsWork, { count: cat.needsWork }),
      ...(cat.couldntCheck - waitingHere > 0 ? [tPlural(locale, "dashboard.overview.breakdown.couldntCheck", cat.couldntCheck - waitingHere, { count: cat.couldntCheck - waitingHere })] : []),
      ...(waitingHere > 0 ? [t(locale, waitingHere === 1 ? K("waitingInlineOne") : K("waitingInline"), { count: waitingHere })] : []),
    ];
    return parts.join(" · ");
  });

  // The rank, by the business's own type ("art & pottery studios").
  const def = niche ? nicheById(niche.resolved.nicheId) : null;
  const specific = def && !isGeneralNiche(def.id) ? def : null;
  const nicheNoun = nicheGroupNoun(specific, locale, false);
  const rankText = base.rank
    ? nicheNoun
      ? t(locale, K("rankNiche"), { rank: base.rank.rank, of: base.rank.of, noun: nicheNoun })
      : t(locale, "dashboard.reports.pdf.rank", { rank: base.rank.rank, of: base.rank.of, noun: base.rank.noun })
    : base.headToHead
      ? headToHeadScores(base.headToHead, locale)
      : null;

  const input = businessRowToScoringInput(business);
  const place = townStateFromAddress(business.address);
  const ctx: StepContext = {
    locale,
    profileId: sources.profileId,
    name: base.business.name,
    typeLabel: specific ? specific.label[locale] : null,
    town: place ? `${place.town}${place.state ? `, ${place.state}` : ""}` : null,
    rating: base.reviews.rating,
    reviewCount: base.reviews.count,
    checks,
    hasMetaDescription: input.websiteAnalysis?.content?.hasMetaDescription ?? null,
    // Only where the editor really writes to Google (not read-only).
    fixInApp: isPremiumPlan(options.plan) && connected && googleWritesAllowed((business as { place_id?: string | null }).place_id),
  };
  const steps = distinctRecs(sources.recs, 3).map((rec) => distinctBullets(planStep(rec, ctx)));

  // Real upcoming dates from the business's own website — only for types
  // that run classes or host events — else fixed ideas.
  const kind = listingKind(sources.profileId);
  const website = (business as { verified_website_url?: string | null }).verified_website_url ?? business.website ?? null;
  const listing = kind ? await (options.readListing ?? readListingPage)(website, options.fetchImpl) : null;
  const rows = listing ? websitePostRows(listing, now, locale) : [];
  let site = "";
  try {
    site = listing ? new URL(listing.url).hostname.replace(/^www\./, "") : "";
  } catch {
    site = "";
  }
  const posts: Posts = rows.length > 0 && site ? { kind: "website", site, checkedAt: now.toISOString(), listing: kind ?? "workshop", rows } : { kind: "ideas", ideas: familyPostIdeas(postFamily(sources.profileId, isFoodBusiness(sources.profileId)), locale) };

  const moved = await loadMoved(db, { ...base, businessId } as ReportData & { businessId: string }, locale);
  const firstAt = (firstScan.data as Array<{ created_at: string }> | null)?.[0]?.created_at ?? null;
  return {
    base,
    plan: options.plan,
    firstReport: base.period ? null : { scannedAt: firstAt ?? base.generatedAt },
    moved,
    rankText,
    categoryLines,
    waiting,
    steps,
    posts,
    today: todayItems(options.plan, locale),
    headed: headedItems(options.plan, locale),
    scanAt: base.period?.to ?? firstAt,
  };
}
