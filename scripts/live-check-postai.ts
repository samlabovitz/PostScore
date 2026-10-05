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

import * as fs from "fs";
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
  type TaskRow,
} from "../lib/actionPlan";
import {
  buildGrowthMoves,
  competitorPhotoCounts,
  median,
  weakWebsiteIssueLabels,
  type GrowthMoveSignals,
} from "../lib/growthMoves";
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
import { callAnthropicChat, type ChatTurn } from "../lib/anthropicClient";

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
      "id, name, address, phone, website, rating, review_count, category, categories, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, google_maps_uri, language"
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
    .select("scan_id, created_at, is_subject, name, total, grade, price_level, photo_count")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return null;

  const rows = data as Array<{
    scan_id: string;
    created_at: string;
    is_subject: boolean;
    name: string | null;
    total: number | null;
    grade: string | null;
    price_level: string | null;
    photo_count: number | null;
  }>;
  const latestScanId = rows[0].scan_id;
  const latestRows = rows.filter((r) => r.scan_id === latestScanId);

  return {
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
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website").eq("id", businessId).single(),
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
  const tasks = mergeWebsiteTasks(reviewMerged, breakdown, input, locale, null);
  const completed = buildCompletedTasks(breakdown, taskRows);

  const topTasks: AssistantActionPlanTask[] = tasks.slice(0, 5).map((t) => ({
    label: t.label,
    category: t.category,
    promisedPoints: t.promisedPoints,
    action: t.action,
    effort: t.effort,
  }));

  const snapshot = await readLatestCompetitorSnapshot(businessId);
  const competitors: AssistantCompetitorSummary = snapshot
    ? (() => {
        const sorted = [...snapshot.entries].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
        const subjectRank = sorted.findIndex((e) => e.isSubject) + 1;
        return {
          available: true,
          scanAt: formatShortDate(snapshot.createdAt, locale),
          subjectRank: subjectRank > 0 ? subjectRank : null,
          entries: sorted.map((e) => ({
            name: e.name ?? "Unnamed business",
            isSubject: e.isSubject,
            total: e.total,
            grade: e.grade,
            priceLevelSymbol: priceLevelToSymbol(e.priceLevel),
          })),
        };
      })()
    : { available: false, scanAt: null, subjectRank: null, entries: [] };

  const growthSignals = await readGrowthMoveSignals(businessId, breakdown, profile.referralOk, snapshot);
  const growthMoves: AssistantGrowthMove[] = buildGrowthMoves(growthSignals, locale).map((m) => ({
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
      websitePresent: !!scored.business.website && scored.business.website.trim().length > 0,
      httpsStatus: input.httpsStatus,
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
    growthMoves,
    weeklyRoutine,
    competitors,
    profile: businessProfile,
    gbp: { connected: gbpConnected },
  };

  return { businessName: summary.name ?? "Unnamed business", context, locale };
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

async function main() {
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const businessReports: BusinessReport[] = [];
  const probeReports: ProbeReport[] = [];

  const businesses: Array<{ id: string; localeOverride?: Locale; flagLabel: string }> = [
    { id: "d27760e1-436d-413c-a6cf-cb8e1eb907ba", flagLabel: "hudson-shears" }, // Hudson Shears
    { id: "6d81975c-c576-4947-ae38-83575013c10c", flagLabel: "modern-liquors" }, // Modern Liquors
    { id: "32c870c5-7880-43d1-bab3-e2c6f1dba677", flagLabel: "lamonsoff" }, // Lamonsoff
    { id: "ac28ea59-cd8c-48b6-8013-a393e5bd489d", flagLabel: "blue-bottle" }, // Blue Bottle Coffee
    { id: "43545a36-eacd-47c3-94d9-6ee83ce90aea", localeOverride: "es", flagLabel: "santa-fe" }, // Santa Fe (Spanish)
  ];

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
