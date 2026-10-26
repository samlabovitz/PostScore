// Dev-only, READ-ONLY live check of PostAI's real answers across several
// real businesses — built to confirm Day 3's starter-prompt variety work
// (buildAssistantStarterPrompts, lib/assistant.ts) actually produces good,
// honest answers when a real owner clicks one.
//
// Every request is built through the exact same real code the app uses:
// ASSISTANT_SYSTEM_RULES + buildAssistantContextText() + the real language
// directive, all via the one shared buildAssistantSystemPrompt() (see
// lib/assistant.ts, the same function sendAssistantMessage in
// app/actions/assistant.ts calls), sent through the real callAnthropicChat()
// (lib/anthropicClient.ts) — the exact same model and max-tokens cap the
// app itself uses, read from ANTHROPIC_API_KEY in .env.local. No prompt
// text is copied/retyped anywhere in this file.
//
// Context assembly mirrors scripts/preview-assistant-context.ts's own
// established pattern: loadContext() in app/actions/assistant.ts can't run
// outside a real signed-in browser request (every action it calls checks
// the caller's own Supabase session), so this re-reads the same real
// tables directly via a service-role client, then runs the data through
// the exact same real, pure decision functions (scoreBusinessWithClient's
// pure half, buildActionPlan/mergeReviewTasks/mergeWebsiteTasks,
// buildGrowthMoves, buildWeeklyChecklistState, buildAssistantStarterPrompts)
// every other page already uses — never a second, hand-written
// reimplementation of any real decision.
//
// READ-ONLY, same guarantee as preview-assistant-context.ts: never writes
// to the database, and — unlike a real chat — never saves any
// conversation or message row. The real Anthropic API calls this makes
// ARE real and billed, same as any other use of the assistant.
//
// Never prints the API key, in any form.
//
// Writes a full JSON transcript (every prompt list, every question/
// answer, every automatic warning flag) to
// scripts/.live-check-postai-output.json for the report-writing step —
// never to the database, and this file is git-ignored scratch output,
// not a project artifact.
//
// Usage (from the project root):
//   npx tsx scripts/live-check-postai.ts
// Or, to re-run just some businesses (still real, billed API calls — just
// fewer of them), pass their flagLabels:
//   npx tsx scripts/live-check-postai.ts blue-bottle santa-fe

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

import { createClient } from "@supabase/supabase-js";
import type { CompetitorSnapshot } from "../app/actions/competitors";
import {
  businessRowToScoringInput,
  getScoreWithSuggestions,
  type BusinessScoringRow,
  type ScoreBreakdown,
} from "../lib/scoring";
import { bizProfile, resolveBizProfile } from "../config/bizProfiles";
import { priceLevelToSymbol } from "../lib/priceLevel";
import {
  buildActionPlan,
  buildCompletedTasks,
  mergeReviewTasks,
  mergeWebsiteTasks,
  applyGrowthWebsiteRules,
  buildWebsiteBanner,
  type TaskRow,
} from "../lib/actionPlan";
import {
  buildGrowthMoves,
  withoutWebsiteGrowthMoves,
  competitorPhotoCounts,
  median,
  weakWebsiteIssueLabels,
  type GrowthMoveSignals,
} from "../lib/growthMoves";
import { buildAssistantSiteSecurity } from "../lib/siteSecurity";
import { businessWebsiteUrl, isWebsiteVerifiedElsewhereOnly } from "../lib/businessWebsite";
import { buildWeeklyChecklistItems, buildWeeklyChecklistState, type WeeklyCheckRow } from "../lib/weeklyChecklist";
import { formatShortDate, normalizeLocale, type Locale } from "../lib/i18n";
import {
  ASSISTANT_MAX_TOKENS,
  buildAssistantStarterPrompts,
  buildAssistantSystemPrompt,
  type AssistantActionPlanTask,
  type AssistantBusinessContext,
  type AssistantBusinessProfile,
  type AssistantCompetitorSummary,
  type AssistantExcludedCheck,
  type AssistantFixedItem,
  type AssistantGrowthMove,
  type AssistantLosingCheck,
  type AssistantScoreHistoryEntry,
  type AssistantWeeklyRoutineSummary,
} from "../lib/assistant";
import { groupSavedScans, SAVED_SCAN_COLUMNS, type SavedScanRow } from "../lib/savedCompetitorScans";
import { nearbyReviewAverage, ownerStanding, rankBy } from "../lib/competitorComparison";
import { loadCompetitorScope } from "../lib/businessNiche.server";
import { applyScope, scopeSummary } from "../lib/competitorScope";
import { MAX_COMPETITORS } from "../lib/competitors";
import type { PostaiFacts } from "../lib/postaiFacts";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantMessageContent } from "../components/assistant/AssistantMessageContent";
import { LocaleProvider } from "../lib/i18n";
import { answerWithFactCheck, buildPostaiFacts, checkAnswerFacts } from "../lib/postaiFacts";
import { callAnthropicChat, type ChatTurn } from "../lib/anthropicClient";
import { buildFreeAssistantSystemPrompt, freeAnswerLeaksFix, stripLinkMarkers } from "../lib/assistant";
import { featureMapFor, featureMapText, type FeatureEntry } from "../lib/postaiFeatureMap";
import { planFacts, planFactsText } from "../lib/planFacts";
import type { Plan } from "../lib/plan";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ---------------------------------------------------------------------------
// Context assembly — mirrors app/actions/assistant.ts's loadContext() via
// the same direct-table-read approach scripts/preview-assistant-context.ts
// already established (see that file's own header comment for why).
// ---------------------------------------------------------------------------

async function readAndScoreBusiness(businessId: string, locale: Locale) {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language, google_listing_missing_website_since, google_listing_website_removed_since, google_listing_last_known_website_at, verified_website_url, website_trust_overrides_json"
    )
    .eq("id", businessId)
    .single();
  if (error || !data) return null;
  const input = businessRowToScoringInput(data as unknown as BusinessScoringRow);
  const result = getScoreWithSuggestions(input, locale);
  return { business: data, input, result };
}

async function readBusinessSummary(businessId: string) {
  const { data, error } = await supabase
    .from("businesses")
    .select(
      "id, name, address, category, primary_type, business_type_override, trade_id, phone, services, avg_job_value_low, avg_job_value_high, language"
    )
    .eq("id", businessId)
    .single();
  if (error || !data) return null;
  return data;
}

async function readScoreHistory(businessId: string) {
  const { data, error } = await supabase
    .from("scores")
    .select("id, total, grade, scoring_version, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data;
}

async function readGbpConnected(businessId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("gbp_connections")
    .select("connected_at, status")
    .eq("business_id", businessId)
    .eq("status", "connected")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function readLatestCompetitorSnapshot(businessId: string): Promise<CompetitorSnapshot | null> {
  const { data, error } = await supabase
    .from("competitor_scans")
    .select(SAVED_SCAN_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return null;

  const rows = data as SavedScanRow[];
  const latestScanId = rows[0].scan_id;
  const latestRows = rows.filter((r) => r.scan_id === latestScanId);

  return {
    scan: groupSavedScans(latestRows)[0],
    scanId: latestScanId,
    createdAt: rows[0].created_at,
    entries: latestRows.map((r) => ({
      name: r.name,
      isSubject: r.is_subject,
      total: r.total,
      grade: r.grade,
      priceLevel: r.price_level,
      photoCount: r.photo_count,
    })),
  };
}

async function readTaskRows(businessId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, check_id, status, promised_points, marked_done_at, verified_at, marked_metric_value")
    .eq("business_id", businessId);
  if (error) return [];
  return (data ?? []) as TaskRow[];
}

async function readGrowthMoveSignals(
  businessId: string,
  breakdown: ScoreBreakdown,
  referralOk: boolean,
  snapshot: CompetitorSnapshot | null
): Promise<GrowthMoveSignals> {
  const [businessResult, promoResult, referralResult] = await Promise.all([
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website, verified_website_url").eq("id", businessId).single(),
    supabase.from("promos").select("id").eq("business_id", businessId).limit(1),
    supabase.from("referrals").select("id").eq("business_id", businessId).limit(1),
  ]);

  const photoCounts = snapshot ? competitorPhotoCounts(snapshot.entries) : [];
  const hasWebsiteCheck = breakdown.checks.find((c) => c.id === "website.has_website");

  return {
    businessId,
    referralOk,
    hasEverCreatedPromo: (promoResult.data?.length ?? 0) > 0,
    hasEverCreatedReferral: (referralResult.data?.length ?? 0) > 0,
    pricingAssessedAt: businessResult.data?.pricing_assessed_at ?? null,
    photoCount: businessResult.data?.photo_count ?? null,
    competitorPhotos: { scanAvailable: snapshot !== null, medianCompetitorPhotoCount: median(photoCounts) },
    hasWebsite: (businessResult.data?.website ?? null) !== null,
    hasVerifiedWebsite: !!businessResult.data?.verified_website_url,
    hasWebsiteTaskOpen: hasWebsiteCheck ? (hasWebsiteCheck.earnedPoints ?? 0) < hasWebsiteCheck.maxPoints : false,
    weakWebsiteIssueLabels: weakWebsiteIssueLabels(breakdown),
  };
}

async function readWeeklyCheckRows(businessId: string): Promise<WeeklyCheckRow[]> {
  const { data, error } = await supabase
    .from("weekly_checks")
    .select("week_start, item_id")
    .eq("business_id", businessId)
    .order("week_start", { ascending: false });
  if (error) return [];
  return (data ?? []) as WeeklyCheckRow[];
}

interface LoadedBusiness {
  businessName: string;
  context: AssistantBusinessContext;
  locale: Locale;
  /** For --plan-check: this business type's tools and whether it has a site. */
  tools?: { couponsOk: boolean; referralOk: boolean; pricingOk: boolean; hasWebsite: boolean };
  /** The facts for one plan (the projections differ per plan). */
  factsFor: (plan: Plan) => PostaiFacts;
}

/** Builds the exact real AssistantBusinessContext for one business — same
 * approach as scripts/preview-assistant-context.ts's main(), factored out
 * here so it can be called once per business in the loop below.
 * `localeOverride` previews a different language WITHOUT touching the
 * business's own real stored `language` column (same convention as that
 * script's own --locale flag) — used here for Santa Fe's Spanish check. */
async function loadBusinessContext(businessId: string, localeOverride?: Locale): Promise<LoadedBusiness> {
  const summary = await readBusinessSummary(businessId);
  if (!summary) throw new Error(`Could not find business ${businessId}.`);

  const locale = normalizeLocale(localeOverride ?? summary.language);
  const scored = await readAndScoreBusiness(businessId, locale);
  if (!scored) throw new Error(`Could not score business ${businessId}: not found.`);

  const autoDetectedProfile = bizProfile(summary.category, summary.primary_type, locale, scored.business.categories, null);
  const businessTypeOverride = summary.business_type_override ?? null;
  const profile = resolveBizProfile(
    summary.category,
    summary.primary_type,
    businessTypeOverride,
    locale,
    scored.business.categories,
    scored.business.name
  );
  const { input } = scored;
  const { breakdown, suggestions } = scored.result;

  const taskRows = await readTaskRows(businessId);
  const rawTasks = buildActionPlan(breakdown, suggestions, taskRows, input, locale);
  const reviewMerged = mergeReviewTasks(rawTasks, breakdown, input, locale);
  const tasks = applyGrowthWebsiteRules(mergeWebsiteTasks(reviewMerged, breakdown, input, locale, null), input, locale);
  const websiteSummary = buildWebsiteBanner(breakdown, input, null);
  const completed = buildCompletedTasks(breakdown, taskRows);

  const topTasks: AssistantActionPlanTask[] = tasks.slice(0, 5).map((t) => ({
    label: t.label,
    category: t.category,
    promisedPoints: t.promisedPoints,
    action: t.action,
    effort: t.effort,
  }));

  const snapshot = await readLatestCompetitorSnapshot(businessId);
  // The owner's competitor scope — the same one the Overview's rank card,
  // the Competitors page and the app's PostAI use (it was missing here,
  // which gave "#7 of 13" instead of the Overview's "#4 of 5").
  const competitorScope = await loadCompetitorScope(supabase, businessId);
  const competitors: AssistantCompetitorSummary = snapshot
    ? (() => {
        // Mirrors app/actions/assistant.ts: the shared rank (full PostScore).
        const ranked = rankBy(snapshot.scan, "overall", competitorScope);
        return {
          available: true,
          scanAt: formatShortDate(snapshot.createdAt, locale),
          subjectRank: ownerStanding(snapshot.scan, competitorScope)?.rank ?? null,
          rankedAgainst: competitorScope ? scopeSummary(applyScope(snapshot.scan, competitorScope), competitorScope) : null,
          nearbyReviewAverage: nearbyReviewAverage(snapshot.scan, competitorScope),
          entries: ranked.map(({ entry }) => ({
            name: entry.name ?? "Unnamed business",
            isSubject: entry.isSubject,
            total: entry.total,
            grade: entry.grade,
            priceLevelSymbol: priceLevelToSymbol(entry.priceLevel),
          })),
        };
      })()
    : { available: false, scanAt: null, subjectRank: null, entries: [] };

  const growthSignals = await readGrowthMoveSignals(businessId, breakdown, profile.referralOk, snapshot);
  const growthMoves: AssistantGrowthMove[] = withoutWebsiteGrowthMoves(buildGrowthMoves(growthSignals, locale)).map((m) => ({
    id: m.id,
    title: m.title,
    why: m.why,
    pricingAssessedAt: growthSignals.pricingAssessedAt,
    yourPhotoCount: growthSignals.photoCount,
    competitorMedianPhotoCount: growthSignals.competitorPhotos.medianCompetitorPhotoCount,
    weakWebsiteIssueLabels: growthSignals.weakWebsiteIssueLabels,
  }));

  const weeklyCheckRows = await readWeeklyCheckRows(businessId);
  const checklistState = buildWeeklyChecklistState(weeklyCheckRows);
  const weeklyRoutine: AssistantWeeklyRoutineSummary = {
    items: buildWeeklyChecklistItems(locale).map((item) => ({
      id: item.id,
      title: item.title,
      checkedThisWeek: checklistState.checkedItemIds.has(item.id),
    })),
    streakWeeks: checklistState.streakWeeks,
  };

  const losingChecks: AssistantLosingCheck[] = suggestions.map((s) => {
    const check = breakdown.checks.find((c) => c.id === s.checkId)!;
    return {
      checkId: s.checkId,
      label: s.label,
      category: s.category,
      earnedPoints: check.earnedPoints,
      maxPoints: check.maxPoints,
      explanation: check.explanation,
    };
  });

  const excludedChecks: AssistantExcludedCheck[] = breakdown.checks
    .filter((c) => c.confidence === "UNCERTAIN" || c.confidence === "NOT_FOUND")
    .map((c) => ({ label: c.label, confidence: c.confidence, explanation: c.explanation }));

  const scoreHistoryRows = await readScoreHistory(businessId);
  const scoreHistory: AssistantScoreHistoryEntry[] = scoreHistoryRows
    .slice(0, 8)
    .map((h) => ({ total: h.total, grade: h.grade as AssistantScoreHistoryEntry["grade"], date: formatShortDate(h.created_at, locale) }))
    .reverse();

  const fixedItems: AssistantFixedItem[] = completed.slice(0, 8).map((c) => ({
    label: c.label,
    pointsGained: c.pointsGained,
    verifiedAt: c.verifiedAt ? formatShortDate(c.verifiedAt, locale) : null,
  }));

  const businessProfile: AssistantBusinessProfile = {
    businessType: profile.label,
    businessTypeId: profile.id,
    autoDetectedBusinessType: autoDetectedProfile.label,
    autoDetectedBusinessTypeId: autoDetectedProfile.id,
    businessTypeOverridden: businessTypeOverride !== null,
    referralOk: profile.referralOk,
    couponPresets: profile.couponPresets.map((p) => ({ label: p.label, description: p.description })),
    referralPresets: profile.referralPresets.map((p) => ({
      referrerReward: p.referrerReward,
      friendReward: p.friendReward,
      description: p.description,
    })),
    location: summary.address ?? null,
    services: summary.services ?? [],
    avgJobValueLow: summary.avg_job_value_low ?? null,
    avgJobValueHigh: summary.avg_job_value_high ?? null,
    scoreHistory,
    fixedItems,
  };

  const gbpConnected = await readGbpConnected(businessId);

  const context: AssistantBusinessContext = {
    listing: {
      name: scored.business.name,
      categoryLabel: profile.label,
      rating: scored.business.rating,
      reviewCount: scored.business.review_count,
      phonePresent: !!scored.business.phone && scored.business.phone.trim().length > 0,
      addressPresent: !!scored.business.address && scored.business.address.trim().length > 0,
      hoursPresent: !!scored.business.opening_hours && scored.business.opening_hours.length > 0,
      websitePresent: businessWebsiteUrl(scored.business) !== null,
      verifiedWebsiteNotOnListing: isWebsiteVerifiedElsewhereOnly(scored.business) ? businessWebsiteUrl(scored.business) : null,
      httpsStatus: input.httpsStatus,
      httpsUnreachableReason: input.websiteAnalysis?.httpsUnreachableReason ?? null,
      googleListingMissingWebsiteSince: scored.business.google_listing_missing_website_since,
      googleListingWebsiteRemovedSince: scored.business.google_listing_website_removed_since,
      googleListingLastKnownWebsiteAt: scored.business.google_listing_last_known_website_at,
      photoCount: scored.business.photo_count,
      businessStatus: scored.business.business_status,
      categoriesCount: scored.business.categories?.length ?? 0,
    },
    score: {
      total: breakdown.total,
      grade: breakdown.grade,
      categories: breakdown.categories.map((c) => ({
        id: c.id,
        label: c.label,
        relativeScore: c.relativeScore,
        earnedPoints: c.earnedPoints,
        possiblePoints: c.possiblePoints,
      })),
      losingChecks,
      excludedChecks,
    },
    actionPlan: { topTasks },
    websiteSummary,
    siteSecurity: buildAssistantSiteSecurity(breakdown, input, locale),
    growthMoves,
    weeklyRoutine,
    competitors,
    profile: businessProfile,
    gbp: { connected: gbpConnected },
  };

  // The same facts block the app builds (app/actions/assistant.ts), with
  // the Overview rank card exactly as getLocalBenchmark builds it.
  const standing = snapshot ? ownerStanding(snapshot.scan, competitorScope) : null;
  const factsFor = (plan: Plan) =>
    buildPostaiFacts(breakdown, {
      plan,
      rating: scored.business.rating,
      reviewCount: scored.business.review_count,
      hasWebsite: businessWebsiteUrl(scored.business) !== null,
      rank: competitors.subjectRank ? { rank: competitors.subjectRank, of: competitors.entries.length } : null,
      rankCard:
        standing && standing.othersCount > 0
          ? {
              othersCount: standing.othersCount,
              percentileAhead: Math.round((standing.aheadCount / standing.othersCount) * 100),
              smallSample: standing.othersCount < MAX_COMPETITORS,
              noun: profile.competitorNoun,
              scope: competitors.available ? (competitors.rankedAgainst ?? null) : null,
            }
          : null,
      nearbyReviewAverage: snapshot ? nearbyReviewAverage(snapshot.scan, competitorScope) : null,
      competitors: snapshot
        ? rankBy(snapshot.scan, "overall", competitorScope).map(({ entry }) => ({ name: entry.name ?? "Unnamed business", total: entry.total, reviews: entry.reviewCount, rating: entry.rating, isSubject: entry.isSubject }))
        : [],
      biggestBoost: suggestions[0] ?? null,
      projectedScore: scored.result.projectedBreakdown.total,
      tasks: tasks.slice(0, 5),
      websiteBanner: websiteSummary,
    });
  context.facts = factsFor("free");

  return {
    businessName: summary.name ?? "Unnamed business",
    context,
    factsFor,
    locale,
    tools: { couponsOk: profile.couponsOk, referralOk: profile.referralOk, pricingOk: profile.pricingOk, hasWebsite: businessWebsiteUrl(scored.business) !== null },
  };
}

// ---------------------------------------------------------------------------
// Conversations — every call goes through the real buildAssistantSystemPrompt
// + callAnthropicChat, exactly like sendAssistantMessage in
// app/actions/assistant.ts, just never saved to the database.
// ---------------------------------------------------------------------------

interface TurnResult {
  question: string;
  answer: string;
  flags: string[];
}

/** Sends `questions` as successive turns of ONE fresh conversation (never
 * persisted) — mirrors sendAssistantMessage's real history handling: the
 * system prompt (rules + real context + language directive) is fixed for
 * the conversation, and each new turn resends every prior real turn. */
async function runConversation(
  context: AssistantBusinessContext,
  locale: Locale,
  flagLabel: string,
  questions: string[]
): Promise<TurnResult[]> {
  const system = buildAssistantSystemPrompt(context, locale);
  const messages: ChatTurn[] = [];
  const results: TurnResult[] = [];

  for (const question of questions) {
    messages.push({ role: "user", content: question });
    const answer = await callAnthropicChat({ system, messages, maxTokens: ASSISTANT_MAX_TOKENS });
    messages.push({ role: "assistant", content: answer });
    results.push({ question, answer, flags: collectFlags(answer, locale, flagLabel, system) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Automatic warning flags — aids only, every answer still gets read by hand.
// ---------------------------------------------------------------------------

/** Every "N points"/"N pts"/"N puntos" number the answer states — used to
 * catch arithmetic the model did itself (e.g. restating "6/10 pts —
 * losing 4" as some OTHER number) rather than quoting the precomputed
 * "losing N" value verbatim, per ASSISTANT_SYSTEM_RULES rule 11. */
function pointsNumbersIn(text: string): string[] {
  return Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:points?|pts\.?|puntos?)\b/gi)).map((m) => m[1]);
}

function collectFlags(answer: string, locale: Locale, flagLabel: string, contextText: string): string[] {
  const flags: string[] = [];

  if (answer.includes("/business/")) {
    flags.push('Contains a literal "/business/" URL path.');
  }
  const fieldNameMatch = answer.match(/\b[a-z]+(?:_[a-z]+){1,}\b/);
  if (fieldNameMatch) {
    flags.push(`Contains what looks like a raw database field name: "${fieldNameMatch[0]}".`);
  }

  const barePhotoCount = locale === "es" ? /\b10 fotos\b/i : /\b10 photos\b/i;
  const orMore = locale === "es" ? /o más/i : /or more/i;
  if (barePhotoCount.test(answer) && !orMore.test(answer)) {
    flags.push(
      locale === "es"
        ? 'States "10 fotos" without "o más" — may misstate a capped count as an exact total.'
        : 'States "10 photos" without "or more" — may misstate a capped count as an exact total.'
    );
  }

  if (flagLabel === "lamonsoff" && /referral|refer a friend|programa de referidos|referidos/i.test(answer)) {
    if (!/state bar|professional conduct|colegio de abogados|conducta profesional/i.test(answer)) {
      flags.push("Mentions a referral program for Lamonsoff without the state-bar honesty caveat.");
    }
    if (/referral credit|crédito de referido|\breferido\b/i.test(answer)) {
      flags.push(
        'Mentions a "referral credit"/"referido" for Lamonsoff — the law-firm restriction now explicitly forbids this in ANY form, including as a coupon idea.'
      );
    }
  }

  if (flagLabel === "modern-liquors" && /starter[- ]site|sitio web inicial|generador de sitio/i.test(answer)) {
    flags.push("Mentions the starter-site generator for Modern Liquors, which already has a website.");
  }

  const referralPattern = /referral|refer a friend|referido|recomendaci[oó]n/i;
  const automaticPattern = /\bautomatic(ally)?\b|autom[aá]ticamente/i;
  const shareableLinkPattern = /shareable link|enlace compartible/i;
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const shareableLinkNearReferral = sentences.some(
    (s) => referralPattern.test(s) && shareableLinkPattern.test(s)
  );
  if ((referralPattern.test(answer) && automaticPattern.test(answer)) || shareableLinkNearReferral) {
    flags.push('Mentions "automatic"/a shareable link in the same sentence as a referral mention — the real referral tool has neither.');
  }

  if (/none (of (these|them)|change your score)|no cambia(n)? su puntuación/i.test(answer)) {
    flags.push('Uses a blanket "none change your score" claim — check each growth move\'s own real Score impact line; even one real overlap makes this false.');
  }

  const routineItemCount = answer.match(
    /\b(uno|una|dos|tres|cuatro|cinco|seis|one|two|three|four|five|six|\d+)\s+(items?|tareas?|cosas?|habits?|hábitos?)\b/i
  );
  if (routineItemCount && /routine|rutina|checklist|weekly|semanal/i.test(answer)) {
    const n = routineItemCount[1].toLowerCase();
    if (!["5", "five", "cinco"].includes(n)) {
      flags.push(`States "${routineItemCount[0]}" near a routine mention — the real weekly routine always has exactly 5 items.`);
    }
  }

  if (
    (/\bNOT slow\b/i.test(contextText) || /\bNO lento\b/i.test(contextText)) &&
    /\b(slow|slower|lento|lenta)\b/i.test(answer) &&
    /(mobile|speed|velocidad|móvil)/i.test(answer)
  ) {
    flags.push('Says "slow"/"lento" near mobile speed, but the real rating is AVERAGE (the context explicitly says NOT slow / NO lento).');
  }

  // (?!n) excludes "ya están" (plural "are" — e.g. "templates that are
  // already designed") from matching: JS's plain (non-Unicode) \b treats
  // the accented "á" as a non-word character, so without this exclusion
  // "está" would spuriously match inside "están" too.
  const habitualClaim =
    /\byou'?re already\b|\byou'?ve been\b|\byou'?re staying on top of\b|\bya está(?!n)\b|\bya has sido\b/i;
  if (habitualClaim.test(answer)) {
    flags.push('Uses a forbidden habitual/ongoing-claim phrasing ("you\'re already…"/"you\'ve been…"/"ya está…") about the weekly routine.');
  }

  for (const num of pointsNumbersIn(answer)) {
    if (!contextText.includes(num)) {
      flags.push(`States "${num} points" — that exact number does not appear anywhere in the real context sent to the model.`);
    }
  }

  if (answer.trim().length > 0 && !/[.!?"')]$/.test(answer.trim())) {
    flags.push("Answer ends without terminal punctuation — likely truncated.");
  }

  if (locale === "es") {
    const tuForms = [
      [/\btienes\b/i, "tienes"],
      [/\bpuedes\b/i, "puedes"],
      [/\bquieres\b/i, "quieres"],
      [/\bnecesitas\b/i, "necesitas"],
      [/\btu\s/i, "tu (possessive)"],
    ] as const;
    const hits = tuForms.filter(([re]) => re.test(answer)).map(([, label]) => label);
    if (hits.length > 0) {
      flags.push(`Possible tú-form usage (should be usted): ${hits.join(", ")}.`);
    }
  }

  return flags;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface BusinessReport {
  businessName: string;
  locale: Locale;
  thisWeekPrompts: Array<{ text: string; inFirst3: boolean }>;
  nextWeekPrompts: Array<{ text: string; inFirst3: boolean }>;
  conversations: TurnResult[];
}

interface ProbeReport {
  businessName: string;
  label: string;
  turns: TurnResult[];
}

// ---------------------------------------------------------------------------
// --plan-check <business name>: PostAI's plan-aware answers on Free, Grow and
// Premium for one real business, written to ~/Desktop. Real model calls
// (billed, Haiku), never saved, never counted against any owner's weekly
// allowance (nothing is written to free_ai_usage or anywhere else).
// ---------------------------------------------------------------------------

/** Where "Compare plans" and the code don't match (checked by hand). */
const PLAN_DISAGREEMENTS = [
  "Monthly report email: Compare plans shows ✓ for Grow, Premium and Multi (— on Free), but no report goes to owners until MONTHLY_REPORTS_LIVE=true; until then the Free plan list and PostAI's feature map say \"Coming soon\".",
  "Fixed Oct 22: Grow's PostAI \"100 a month\" is now enforced on the server (it wasn't limited at all before).",
  "Fixed Oct 22: locations — 1 on Free, Grow and Premium, up to 5 on Multi — is now enforced when a business is added (before, any account could add any number). Existing accounts with more keep them.",
  "Fixed Oct 22: the PDF report is now Premium only, matching \"Weekly + PDF\" (before, Grow could download it and the routes didn't check the plan).",
  "Still different: Compare plans says Multi can add locations beyond 5 at +$25/mo each, but there's no checkout, so Multi stops at 5 for now.",
];

const PLAN_QUESTIONS = [
  "What kind of coupon or promo would work for my business?",
  "How can I get more customers in the store today?",
  "Where's my review QR code?",
  "Should I run a price check against nearby competitors?",
  "How do I fix my photos?",
];
const UPGRADE_QUESTIONS = ["Why should I upgrade?", "What's the difference between Grow and Premium?", "Is Premium worth it for me?"];

function planGuide(plan: Plan, loaded: LoadedBusiness, businessCount: number) {
  const entries = featureMapFor(plan, loaded.tools!);
  return { entries, guide: { featureMap: featureMapText(plan, entries), planFacts: planFactsText(), businessCount } };
}

/** Automatic flags (aids — every answer is still read by hand). */
function planFlags(plan: Plan, question: string, answer: string, entries: FeatureEntry[], fixes: string[]): string[] {
  const flags: string[] = [];
  const goTo = (place: string) => new RegExp(`(go to|open|head (over )?to|visit|check out|use|click)( the| your)? ${place}( tab| page)?`, "i");
  for (const e of entries.filter((x) => x.status === "locked")) {
    const tabName = /the (.+?) tab/.exec(e.where)?.[1];
    if (tabName && goTo(tabName).test(answer) && new RegExp(e.name.split(" ")[0], "i").test(answer)) flags.push(`points to a locked place as usable: ${e.name} (${tabName})`);
  }
  if (plan === "free" && /reviews (tab|page)/i.test(answer) && /QR/i.test(question)) flags.push("Free: says the QR code is on the Reviews tab (it's on the Overview)");
  if (plan === "free" && /price check/i.test(question) && goTo("Price check").test(answer)) flags.push("Free: sends the owner to Price check (locked)");
  if (plan === "free" && (freeAnswerLeaksFix(answer, fixes) || /^\s*(\d+[.)]|step \d)/im.test(answer))) flags.push("Free: gives step-by-step fix steps");
  // Per paragraph: every paragraph that mentions an offer says they can write their own.
  for (const para of answer.split(/\n\s*\n|\n(?=\s*[-*] |\s*\*\*)/)) {
    if (/coupon|promo|quick pick|referral|store credit|% off/i.test(para) && /(design|quick pick|for example|e\.g\.)/i.test(para) && !/(your own|own offer|own reward|own wording|any amount|own amount|any reward|write (your|an) offer|make your own|create your own|any offer|whatever)/i.test(para))
      flags.push(`an offer/referral paragraph without "write your own": "${para.trim().slice(0, 90)}…"`);
  }
  if (plan === "free" && /(track (redemptions|uses|how many)|tap(ping)? "?\+1|print (it|the card|them)|save (it|the coupon))/i.test(answer) && !/on Grow/i.test(answer)) flags.push("Free: implies saving/printing/tracking works on Free");
  if (/precomputed/i.test(answer)) flags.push("internal jargon (\"precomputed\")");
  if (/general guidance:|consejo general:/i.test(answer)) flags.push("uses a 'General guidance:' label");
  return flags;
}

const SOON_WORDS = ["one-click", "posts replies", "posting replies", "post replies", "replies for you", "automatic replies", "search and call", "insights", "email, text", "text and social", "postStudio", "locations in one dashboard", "auto-post", "fixes your listing", "fix your listing", "auto-fix"];
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
/** "N pts"/"N points" numbers the answer states that aren't in the prompt (made-up arithmetic). */
function inventedPoints(answer: string, system: string): string[] {
  const nums = Array.from(answer.matchAll(/(\d+(?:\.\d+)?)\s*(?:pts|points|puntos)/gi), (m) => m[1]);
  return nums.filter((n) => !new RegExp(`(^|[^\\d.])${n.replace(".", "\\.")}([^\\d]|$)`).test(system));
}
function upgradeFlags(answer: string, system: string): string[] {
  const flags: string[] = [];
  for (const sentence of sentences(answer)) {
    if (/^\**\s*coming soon/i.test(sentence)) continue;
    for (const w of SOON_WORDS) if (sentence.toLowerCase().includes(w.toLowerCase())) flags.push(`a coming-soon feature outside the "Coming soon:" line: "${sentence.slice(0, 120)}"`);
  }
  if (!/^\s*\**\s*coming soon/im.test(answer) && /coming soon/i.test(answer)) flags.push("coming soon mixed into the text instead of its own line");
  const prices = new Set(["$0", "$25", "$50", "$150", "$30", "$15", "$8", "$40", "$58"]);
  for (const m of answer.match(/\$\d+/g) ?? []) if (!prices.has(m)) flags.push(`a price not in PLAN FACTS: ${m}`);
  for (const n of inventedPoints(answer, system)) flags.push(`a points number not in the data: ${n}`);
  if (/precomputed/i.test(answer)) flags.push("internal jargon (\"precomputed\")");
  if (/(don't|do not|doesn't|can't) (have|see|access)[^.]{0,40}(plan|pricing|details|information)/i.test(answer)) flags.push("hedges about not having plan info");
  if (/general guidance:/i.test(answer)) flags.push("uses a 'General guidance:' label");
  return Array.from(new Set(flags));
}

async function ask(system: string, question: string, plan: Plan, fixes: string[]): Promise<string> {
  const raw = await callAnthropicChat({ system, messages: [{ role: "user", content: question }], maxTokens: ASSISTANT_MAX_TOKENS });
  if (plan !== "free") return raw.trim();
  // Exactly what the server does with a Free answer (app/actions/assistant.ts).
  const cleaned = stripLinkMarkers(raw);
  return freeAnswerLeaksFix(cleaned, fixes) ? "[replaced on the server: repeated the paid fix steps]" : cleaned;
}

async function planCheck(name: string) {
  const { data: rows } = await supabase.from("businesses").select("id, name, owner_id").ilike("name", `%${name}%`).limit(1);
  const row = (rows ?? [])[0] as { id: string; name: string; owner_id: string } | undefined;
  if (!row) throw new Error(`No business matching "${name}".`);
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", row.owner_id);
  const loaded = await loadBusinessContext(row.id);
  const fixes = loaded.context.actionPlan.topTasks.map((t) => t.action).filter(Boolean);
  const out: string[] = [`# PostAI plan check — ${loaded.businessName}`, "", `Live answers from ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC (Claude Haiku 4.5, the app's real prompt and context). ⚠ marks an automatic flag.`, ""];
  let flagged = 0;
  for (const plan of ["free", "grow", "premium"] as Plan[]) {
    const { entries, guide } = planGuide(plan, loaded, count ?? 1);
    const context = { ...loaded.context, planGuide: guide };
    const system = plan === "free" ? buildFreeAssistantSystemPrompt(context, loaded.locale) : buildAssistantSystemPrompt(context, loaded.locale);
    out.push(`## ${plan[0].toUpperCase()}${plan.slice(1)}`, "");
    for (const q of PLAN_QUESTIONS) {
      const answer = await ask(system, q, plan, fixes);
      const flags = [...planFlags(plan, q, answer, entries, fixes), ...inventedPoints(answer, system).map((n) => `a points number not in the data: ${n}`)];
      flagged += flags.length;
      out.push(`### ${q}`, "", answer, "", ...(flags.length ? flags.map((f) => `> ⚠ ${f}`) : ["> ✓ no flags"]), "");
    }
  }
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "postai-plan-check.md"), out.join("\n"));

  // Upgrade questions — Free.
  const { guide } = planGuide("free", loaded, count ?? 1);
  const context = { ...loaded.context, planGuide: guide };
  const system = buildFreeAssistantSystemPrompt(context, loaded.locale);
  const up: string[] = [`# PostAI upgrade answers — ${loaded.businessName} on Free`, "", "⚠ marks an automatic flag (coming-soon presented as available, an invented price, hedging about plan info).", ""];
  let upFlagged = 0;
  for (const q of UPGRADE_QUESTIONS) {
    const answer = await ask(system, q, "free", fixes);
    const flags = upgradeFlags(answer, system);
    upFlagged += flags.length;
    up.push(`## ${q}`, "", answer, "", ...(flags.length ? flags.map((f) => `> ⚠ ${f}`) : ["> ✓ no flags"]), "");
  }
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "postai-upgrade-check.md"), up.join("\n"));
  console.log(`plan check: ${flagged} flag(s); upgrade check: ${upFlagged} flag(s)`);
}

/** --plan-facts: the plan table PostAI sees, to ~/Desktop/plan-facts.md. */
function writePlanFacts(disagreements: string[]) {
  const out = ["# Plan facts PostAI sees", "", 'Read straight from Settings → Plan & billing → "Compare plans" (lib/planComparison.ts) — the same config the page shows.', ""];
  for (const p of planFacts("en")) {
    out.push(`## ${p.name} — ${p.price}`, "", `*${p.tagline}*${p.promise ? ` — ${p.promise}` : ""}`, "", "| Feature | Value | Status |", "|---|---|---|");
    for (const f of p.features) out.push(`| ${f.feature} | ${f.value ?? (f.status === "available" ? "✓" : f.status === "preview" ? "Preview" : f.status === "not included" ? "—" : "")}${f.soonValue ? ` · **coming soon:** ${f.soonValue}` : ""} | ${f.status === "coming soon" ? "**Coming soon**" : f.status} |`);
    out.push("", "Plan card bullets:", ...p.bullets.map((b) => `- ${b.text}${b.soon ? " — **coming soon**" : ""}`), "");
  }
  out.push("## Where Compare plans and the code disagree", "", ...disagreements.map((d) => `- ${d}`), "");
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "plan-facts.md"), out.join("\n"));
}

// ---------------------------------------------------------------------------
// --accuracy: 15 fact-heavy questions — Mini Shop on Free, Umami on Grow,
// Hair express on Premium — through the app's own fact check
// (answerWithFactCheck: check, retry once, facts-only fallback). Written to
// ~/Desktop/postai-accuracy-check.md with pass/fail per answer. Real model
// calls (Haiku), never saved, never counted against any allowance.
// ---------------------------------------------------------------------------

const ACCURACY_QUESTIONS = [
  "How many reviews do I need for full credit?",
  "What's my star rating, and is it good?",
  "Why is my score what it is?",
  "How do I compare to nearby competitors on reviews?",
  "Do I have a website, and how is it affecting my score?",
];

async function accuracyCheck() {
  const runs: Array<{ match: string; plan: Plan }> = [
    { match: "Mini Shop", plan: "free" },
    { match: "Umami", plan: "grow" },
    { match: "Hair express", plan: "premium" },
  ];
  const out: string[] = ["# PostAI accuracy check", "", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — Claude Haiku 4.5, the app's real prompt, context and fact check (check → one retry → facts-only fallback). **PASS** = the answer shown to the owner matches the facts; **FAIL** = Haiku needed the facts-only fallback (it failed twice).`, ""];
  let pass = 0;
  let total = 0;
  let firstTryOk = 0;
  for (const run of runs) {
    const { data: rows } = await supabase.from("businesses").select("id, owner_id").ilike("name", `%${run.match}%`).limit(1);
    const row = (rows ?? [])[0] as { id: string; owner_id: string } | undefined;
    if (!row) throw new Error(`No business matching "${run.match}".`);
    const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", row.owner_id);
    const loaded = await loadBusinessContext(row.id);
    const { guide } = planGuide(run.plan, loaded, count ?? 1);
    const context = { ...loaded.context, planGuide: guide, facts: loaded.factsFor(run.plan) };
    const system = run.plan === "free" ? buildFreeAssistantSystemPrompt(context, loaded.locale) : buildAssistantSystemPrompt(context, loaded.locale);
    const fixes = loaded.context.actionPlan.topTasks.map((t) => t.action).filter(Boolean);
    const clean = (text: string) => {
      if (run.plan !== "free") return text.trim();
      const stripped = stripLinkMarkers(text);
      return freeAnswerLeaksFix(stripped, fixes) ? "[replaced on the server: repeated the paid fix steps]" : stripped;
    };
    out.push(`## ${loaded.businessName} — ${run.plan[0].toUpperCase()}${run.plan.slice(1)}`, "");
    for (const q of ACCURACY_QUESTIONS) {
      const checked = await answerWithFactCheck({
        ask: (messages) => callAnthropicChat({ system, messages, maxTokens: ASSISTANT_MAX_TOKENS }),
        messages: [{ role: "user", content: q }],
        facts: context.facts!,
        promptText: system,
        locale: loaded.locale,
        clean,
      });
      total += 1;
      const ok = !checked.fallback;
      if (ok) pass += 1;
      if (checked.attempts === 1) firstTryOk += 1;
      const residual = ok ? checkAnswerFacts(checked.answer, context.facts!, system) : [];
      out.push(
        `### ${ok ? "PASS" : "FAIL"} — ${q}`,
        "",
        checked.answer,
        "",
        checked.attempts === 1 ? "> ✓ right the first time" : checked.fallback ? `> ✗ wrong twice → facts-only answer shown. Last problems: ${checked.issues.join("; ")}` : `> ↻ first answer had: ${checked.issues.join("; ")} — fixed on the retry`,
        ...(residual.length ? [`> ⚠ ${residual.join("; ")}`] : []),
        ""
      );
    }
  }
  out.splice(3, 0, `**${pass} of ${total} pass** (${firstTryOk} right the first time, ${pass - firstTryOk} fixed on the retry, ${total - pass} needed the facts-only fallback).`, "");
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "postai-accuracy-check.md"), out.join("\n"));
  console.log(`accuracy: ${pass}/${total} pass, ${firstTryOk} first try`);
}

// ---------------------------------------------------------------------------
// --final: every check in ONE file, ~/Desktop/postai-final-check.md —
// accuracy (15), upgrade (3, Mini Shop on Free) and plan (15, Mini Shop on
// Free, Grow and Premium). Every answer goes through the app's own fact
// check (answerWithFactCheck), exactly like the server. The automatic flags
// are the checker's rules (facts, "up to" projections, the Overview rank,
// "X of W" units, "Google counts…", Free: no preview printing / no
// competitor re-runs) plus the plan and upgrade flags. Real model calls
// (Haiku), never saved, never counted against any allowance.
// ---------------------------------------------------------------------------

/** The answer through the chat's real renderer (AssistantView →
 * AssistantMessageContent with the business's links): every [[link:…]]
 * marker must come out as a real link, never as literal text. */
// tsx compiles the components' JSX to React.createElement (classic runtime).
(globalThis as { React?: typeof React }).React = React;

function linkFlags(answer: string, businessId: string, locale: Locale, tools: LoadedBusiness["tools"]): { flags: string[]; links: number } {
  const markers = Array.from(answer.matchAll(/\[\[link:[^\]]*\]\]/g)).length;
  if (markers === 0) return { flags: [], links: 0 };
  const html = renderToStaticMarkup(
    createElement(LocaleProvider, {
      locale,
      children: createElement(AssistantMessageContent, { content: answer, links: { businessId, referralOk: tools?.referralOk ?? true, couponsOk: tools?.couponsOk ?? true, pricingOk: tools?.pricingOk ?? true } }),
    })
  );
  const hrefs = Array.from(html.matchAll(/<a [^>]*href="\/business\//g)).length;
  const flags: string[] = [];
  if (/\[\[link/.test(html)) flags.push("a [[link:…]] marker shows as literal text in the chat");
  if (hrefs === 0) flags.push(`${markers} link marker(s), but no link rendered`);
  return { flags, links: hrefs };
}

interface Checked {
  answer: string;
  attempts: number;
  fallback: boolean;
  firstIssues: string[];
  /** The drafts the fact check turned down (shown in the report). */
  rejected: string[];
  flags: string[];
}

async function checkedAnswer(system: string, facts: PostaiFacts, question: string, locale: Locale, plan: Plan, fixes: string[]): Promise<Omit<Checked, "flags"> & { residual: string[] }> {
  const clean = (text: string) => {
    if (plan !== "free") return text.trim();
    const stripped = stripLinkMarkers(text);
    return freeAnswerLeaksFix(stripped, fixes) ? "[replaced on the server: repeated the paid fix steps]" : stripped;
  };
  const r = await answerWithFactCheck({
    ask: (messages) => callAnthropicChat({ system, messages, maxTokens: ASSISTANT_MAX_TOKENS }),
    messages: [{ role: "user", content: question }],
    facts,
    promptText: system,
    locale,
    clean,
  });
  return { answer: r.answer, attempts: r.attempts, fallback: r.fallback, firstIssues: r.attempts > 1 ? r.issues : [], rejected: r.rejected, residual: r.fallback ? [] : checkAnswerFacts(r.answer, facts, system) };
}

function checkedLines(c: Checked): string[] {
  return [
    c.answer,
    "",
    c.attempts === 1 ? "> ✓ fact check: right the first time" : c.fallback ? `> ✗ fact check: wrong twice → facts-only answer shown. Problems: ${c.firstIssues.join("; ")}` : `> ↻ fact check caught: ${c.firstIssues.join("; ")} — fixed on the retry`,
    ...(c.flags.length ? c.flags.map((f) => `> ⚠ ${f}`) : ["> ✓ no flags"]),
    ...c.rejected.flatMap((draft, i) => ["", `<details><summary>Rejected draft ${i + 1}</summary>`, "", draft, "", "</details>"]),
    "",
  ];
}

async function businessRow(match: string) {
  const { data: rows } = await supabase.from("businesses").select("id, owner_id").ilike("name", `%${match}%`).limit(1);
  const row = (rows ?? [])[0] as { id: string; owner_id: string } | undefined;
  if (!row) throw new Error(`No business matching "${match}".`);
  const { count } = await supabase.from("businesses").select("id", { count: "exact", head: true }).eq("owner_id", row.owner_id);
  return { id: row.id, count: count ?? 1 };
}

async function finalCheck() {
  const sections: string[][] = [];
  const tally = { answers: 0, firstTry: 0, retried: 0, fallback: 0, flagged: 0 };
  const count = (c: Checked) => {
    tally.answers += 1;
    if (c.attempts === 1) tally.firstTry += 1;
    else if (c.fallback) tally.fallback += 1;
    else tally.retried += 1;
    if (c.flags.length > 0) tally.flagged += 1;
  };
  const rankNotes: string[] = [];
  const linkTally = { markersAnswers: 0, links: 0 };

  // 1. Accuracy — 15.
  const acc: string[] = ["## 1. Accuracy (15)", ""];
  for (const run of [
    { match: "Mini Shop", plan: "free" as Plan },
    { match: "Umami", plan: "grow" as Plan },
    { match: "Hair express", plan: "premium" as Plan },
  ]) {
    const row = await businessRow(run.match);
    const loaded = await loadBusinessContext(row.id);
    const facts = loaded.factsFor(run.plan);
    const { guide } = planGuide(run.plan, loaded, row.count);
    const context = { ...loaded.context, planGuide: guide, facts };
    const system = run.plan === "free" ? buildFreeAssistantSystemPrompt(context, loaded.locale) : buildAssistantSystemPrompt(context, loaded.locale);
    const fixes = loaded.context.actionPlan.topTasks.map((t) => t.action).filter(Boolean);
    rankNotes.push(`- ${loaded.businessName}: ${facts.rank ? `#${facts.rank.rank} of ${facts.rank.of}` : "no rank"}${facts.rankCard?.scope ? ` — ranked against ${facts.rankCard.scope}` : ""}. Projections PostAI may state: ${facts.projections.length ? facts.projections.map((p) => `up to +${p.high ? `${p.upTo}–${p.high}` : p.upTo} (${p.where})`).join(", ") : "none"}.`);
    acc.push(`### ${loaded.businessName} — ${run.plan[0].toUpperCase()}${run.plan.slice(1)}`, "");
    for (const q of ACCURACY_QUESTIONS) {
      const r = await checkedAnswer(system, facts, q, loaded.locale, run.plan, fixes);
      const lf = linkFlags(r.answer, row.id, loaded.locale, loaded.tools);
      linkTally.markersAnswers += lf.links > 0 || lf.flags.length > 0 ? 1 : 0;
      linkTally.links += lf.links;
      const c: Checked = { ...r, flags: [...r.residual, ...lf.flags] };
      count(c);
      acc.push(`#### ${q}`, "", ...checkedLines(c));
    }
  }
  sections.push(acc);

  // 2 + 3. Mini Shop: upgrade (Free) and plan (Free, Grow, Premium).
  const row = await businessRow("Mini Shop");
  const loaded = await loadBusinessContext(row.id);
  const fixes = loaded.context.actionPlan.topTasks.map((t) => t.action).filter(Boolean);

  const up: string[] = [`## 2. Upgrade answers — ${loaded.businessName} on Free (3)`, ""];
  {
    const facts = loaded.factsFor("free");
    const { guide } = planGuide("free", loaded, row.count);
    const context = { ...loaded.context, planGuide: guide, facts };
    const system = buildFreeAssistantSystemPrompt(context, loaded.locale);
    for (const q of UPGRADE_QUESTIONS) {
      const r = await checkedAnswer(system, facts, q, loaded.locale, "free", fixes);
      const c: Checked = { ...r, flags: Array.from(new Set([...r.residual, ...upgradeFlags(r.answer, system)])) };
      count(c);
      up.push(`### ${q}`, "", ...checkedLines(c));
    }
  }
  sections.push(up);

  const pl: string[] = [`## 3. Plan answers — ${loaded.businessName} on Free, Grow and Premium (15)`, ""];
  for (const plan of ["free", "grow", "premium"] as Plan[]) {
    const facts = loaded.factsFor(plan);
    const { entries, guide } = planGuide(plan, loaded, row.count);
    const context = { ...loaded.context, planGuide: guide, facts };
    const system = plan === "free" ? buildFreeAssistantSystemPrompt(context, loaded.locale) : buildAssistantSystemPrompt(context, loaded.locale);
    pl.push(`### ${plan[0].toUpperCase()}${plan.slice(1)}`, "");
    for (const q of PLAN_QUESTIONS) {
      const r = await checkedAnswer(system, facts, q, loaded.locale, plan, fixes);
      const lf = linkFlags(r.answer, row.id, loaded.locale, loaded.tools);
      linkTally.markersAnswers += lf.links > 0 || lf.flags.length > 0 ? 1 : 0;
      linkTally.links += lf.links;
      const c: Checked = { ...r, flags: Array.from(new Set([...r.residual, ...planFlags(plan, q, r.answer, entries, fixes), ...lf.flags])) };
      count(c);
      pl.push(`#### ${q}`, "", ...checkedLines(c));
    }
  }
  sections.push(pl);

  const out = [
    "# PostAI final check",
    "",
    `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC — Claude Haiku 4.5, the app's real prompt, context and fact check (check → one retry → facts-only fallback), exactly as the server runs it.`,
    "",
    `**${tally.answers} answers: ${tally.firstTry} right the first time, ${tally.retried} fixed on the retry, ${tally.fallback} needed the facts-only fallback; ${tally.flagged} with a remaining ⚠ flag.**`,
    "",
    "Automatic flags: every fact (score, rating, reviews, thresholds, rank, \"N ahead\"), \"no reviews\" / \"low rating\" / website claims, point gains (only the app's own projections, always \"up to\"), the Overview rank, category units (\"X of W\", never N/100 except the PostScore and the Website page score), \"Google counts…\" for the 40+/150+ thresholds, Free: printing a preview or any way around a lock, Free: re-running competitors, plus the plan flags (locked places, step-by-step on Free, offers) and the upgrade flags (coming soon, prices, points). Every answer is still read by hand.",
    "",
    `Link markers: ${linkTally.markersAnswers} answer(s) used [[link:…]] markers; rendered through the chat's real AssistantMessageContent they became ${linkTally.links} real link(s) (any marker left as text would be flagged ⚠). Free answers have their markers removed on the server, as in the app.`,
    "",
    "Rank and projections each business's PostAI gets (the Overview's own):",
    ...rankNotes,
    "",
    ...sections.flat(),
  ];
  fs.writeFileSync(path.join(os.homedir(), "Desktop", "postai-final-check.md"), out.join("\n"));
  console.log(`final: ${tally.answers} answers, ${tally.firstTry} first try, ${tally.retried} retried, ${tally.fallback} fallback, ${tally.flagged} flagged`);
}

async function main() {
  if (process.argv.includes("--final")) {
    await finalCheck();
    return;
  }
  if (process.argv.includes("--accuracy")) {
    await accuracyCheck();
    return;
  }
  if (process.argv.includes("--plan-facts")) {
    writePlanFacts(PLAN_DISAGREEMENTS);
    console.log("wrote ~/Desktop/plan-facts.md");
    return;
  }
  const planCheckIndex = process.argv.indexOf("--plan-check");
  if (planCheckIndex !== -1) {
    await planCheck(process.argv[planCheckIndex + 1] ?? "Mini Shop");
    return;
  }
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const businessReports: BusinessReport[] = [];
  const probeReports: ProbeReport[] = [];

  const allBusinesses: Array<{ id: string; localeOverride?: Locale; flagLabel: string }> = [
    { id: "d27760e1-436d-413c-a6cf-cb8e1eb907ba", flagLabel: "hudson-shears" }, // Hudson Shears
    { id: "6d81975c-c576-4947-ae38-83575013c10c", flagLabel: "modern-liquors" }, // Modern Liquors
    { id: "32c870c5-7880-43d1-bab3-e2c6f1dba677", flagLabel: "lamonsoff" }, // Lamonsoff
    { id: "ac28ea59-cd8c-48b6-8013-a393e5bd489d", flagLabel: "blue-bottle" }, // Blue Bottle Coffee
    { id: "43545a36-eacd-47c3-94d9-6ee83ce90aea", localeOverride: "es", flagLabel: "santa-fe" }, // Santa Fe (Spanish)
  ];

  // Optional CLI filter, e.g. `npx tsx scripts/live-check-postai.ts blue-bottle santa-fe`
  // to re-run just a couple of businesses (billed real API calls) without
  // touching the other three. No args = every business, same as before.
  const onlyFlagLabels = process.argv.slice(2);
  const businesses =
    onlyFlagLabels.length > 0 ? allBusinesses.filter((b) => onlyFlagLabels.includes(b.flagLabel)) : allBusinesses;

  let hudsonContext: { context: AssistantBusinessContext; locale: Locale } | null = null;
  let modernLiquorsContext: { context: AssistantBusinessContext; locale: Locale } | null = null;
  let lamonsoffContext: { context: AssistantBusinessContext; locale: Locale } | null = null;
  let santaFeContext: { context: AssistantBusinessContext; locale: Locale } | null = null;

  for (const b of businesses) {
    console.log(`\n=== ${b.id} ===`);
    const loaded = await loadBusinessContext(b.id, b.localeOverride);
    console.log(`${loaded.businessName} (locale=${loaded.locale}): PostScore ${loaded.context.score.total}/100`);

    const thisWeekAll = buildAssistantStarterPrompts(loaded.context, loaded.locale, now);
    const nextWeekAll = buildAssistantStarterPrompts(loaded.context, loaded.locale, nextWeek);
    const thisWeekFirst3 = thisWeekAll.slice(0, 3);

    console.log(`This week's prompts (${thisWeekAll.length}):`);
    thisWeekAll.forEach((p, i) => console.log(`  ${i < 3 ? "*" : " "} ${p}`));
    console.log(`Next week's prompts (${nextWeekAll.length}):`);
    nextWeekAll.forEach((p, i) => console.log(`  ${i < 3 ? "*" : " "} ${p}`));

    const conversations: TurnResult[] = [];
    for (const question of thisWeekFirst3) {
      const [result] = await runConversation(loaded.context, loaded.locale, b.flagLabel, [question]);
      conversations.push(result);
      console.log(`\nQ: ${result.question}\nA: ${result.answer}`);
      if (result.flags.length > 0) console.log(`FLAGS: ${result.flags.join(" | ")}`);
    }

    businessReports.push({
      businessName: loaded.businessName,
      locale: loaded.locale,
      thisWeekPrompts: thisWeekAll.map((text, i) => ({ text, inFirst3: i < 3 })),
      nextWeekPrompts: nextWeekAll.map((text, i) => ({ text, inFirst3: i < 3 })),
      conversations,
    });

    if (b.flagLabel === "hudson-shears") hudsonContext = { context: loaded.context, locale: loaded.locale };
    if (b.flagLabel === "modern-liquors") modernLiquorsContext = { context: loaded.context, locale: loaded.locale };
    if (b.flagLabel === "lamonsoff") lamonsoffContext = { context: loaded.context, locale: loaded.locale };
    if (b.flagLabel === "santa-fe") santaFeContext = { context: loaded.context, locale: loaded.locale };
  }

  // --- Extra probes ---
  if (hudsonContext) {
    console.log("\n=== Probe: Hudson Shears — How could a referral program work for my business? ===");
    const [r] = await runConversation(hudsonContext.context, hudsonContext.locale, "hudson-shears", [
      "How could a referral program work for my business?",
    ]);
    console.log(`A: ${r.answer}`);
    if (r.flags.length > 0) console.log(`FLAGS: ${r.flags.join(" | ")}`);
    probeReports.push({
      businessName: "Hudson Shears",
      label: "How could a referral program work for my business?",
      turns: [r],
    });
  }

  if (modernLiquorsContext) {
    console.log("\n=== Probe: Modern Liquors — How do I improve my website? ===");
    const [r1] = await runConversation(modernLiquorsContext.context, modernLiquorsContext.locale, "modern-liquors", [
      "How do I improve my website?",
    ]);
    console.log(`A: ${r1.answer}`);
    probeReports.push({ businessName: "Modern Liquors", label: "How do I improve my website?", turns: [r1] });

    console.log("\n=== Probe: Modern Liquors — Will speeding up my site raise my score? ===");
    const [r2] = await runConversation(modernLiquorsContext.context, modernLiquorsContext.locale, "modern-liquors", [
      "Will speeding up my site raise my score?",
    ]);
    console.log(`A: ${r2.answer}`);
    probeReports.push({
      businessName: "Modern Liquors",
      label: "Will speeding up my site raise my score?",
      turns: [r2],
    });

    console.log("\n=== Probe: Modern Liquors — How do I get more customers? -> Anything else? (one conversation) ===");
    const multiTurn = await runConversation(modernLiquorsContext.context, modernLiquorsContext.locale, "modern-liquors", [
      "How do I get more customers?",
      "Anything else?",
    ]);
    multiTurn.forEach((r) => console.log(`Q: ${r.question}\nA: ${r.answer}`));
    probeReports.push({
      businessName: "Modern Liquors",
      label: "How do I get more customers? -> Anything else? (one conversation)",
      turns: multiTurn,
    });
  }

  if (lamonsoffContext) {
    console.log("\n=== Probe: Lamonsoff — Should I start a referral program? ===");
    const [r] = await runConversation(lamonsoffContext.context, lamonsoffContext.locale, "lamonsoff", [
      "Should I start a referral program?",
    ]);
    console.log(`A: ${r.answer}`);
    probeReports.push({ businessName: "Lamonsoff", label: "Should I start a referral program?", turns: [r] });

    console.log("\n=== Probe: Lamonsoff — Should I connect my Google Business Profile? ===");
    const [r2] = await runConversation(lamonsoffContext.context, lamonsoffContext.locale, "lamonsoff", [
      "Should I connect my Google Business Profile?",
    ]);
    console.log(`A: ${r2.answer}`);
    if (r2.flags.length > 0) console.log(`FLAGS: ${r2.flags.join(" | ")}`);
    probeReports.push({
      businessName: "Lamonsoff",
      label: "Should I connect my Google Business Profile?",
      turns: [r2],
    });
  }

  if (santaFeContext) {
    console.log("\n=== Probe: Santa Fe — ¿Cuántas fotos tengo? ===");
    const [r1] = await runConversation(santaFeContext.context, santaFeContext.locale, "santa-fe", [
      "¿Cuántas fotos tengo?",
    ]);
    console.log(`A: ${r1.answer}`);
    probeReports.push({ businessName: "Santa Fe", label: "¿Cuántas fotos tengo?", turns: [r1] });

    console.log("\n=== Probe: Santa Fe — ¿Qué puedo hacer para atraer más clientes? ===");
    const [r2] = await runConversation(santaFeContext.context, santaFeContext.locale, "santa-fe", [
      "¿Qué puedo hacer para atraer más clientes?",
    ]);
    console.log(`A: ${r2.answer}`);
    probeReports.push({
      businessName: "Santa Fe",
      label: "¿Qué puedo hacer para atraer más clientes?",
      turns: [r2],
    });
  }

  const outPath = path.join(__dirname, ".live-check-postai-output.json");
  fs.writeFileSync(outPath, JSON.stringify({ businessReports, probeReports }, null, 2), "utf-8");
  console.log(`\nWrote full transcript to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
