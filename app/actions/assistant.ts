"use server";

import { createClient } from "@/lib/supabase/server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById, getScoreHistory } from "@/app/actions/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getLatestCompetitorSnapshot } from "@/app/actions/competitors";
import { getGbpConnectionStatus } from "@/app/actions/gbp";
import { getGrowthMoveSignals } from "@/app/actions/growthMoves";
import { getWeeklyChecklistState } from "@/app/actions/weeklyChecklist";
import { buildGrowthMoves } from "@/lib/growthMoves";
import { businessRowToScoringInput } from "@/lib/scoring";
import { bizProfile, resolveBizProfile } from "@/config/bizProfiles";
import { priceLevelToSymbol } from "@/lib/priceLevel";
import { buildWeeklyChecklistItems } from "@/lib/weeklyChecklist";
import { callAnthropicChat, AnthropicApiError } from "@/lib/anthropicClient";
import {
  ASSISTANT_MAX_TOKENS,
  MAX_ACTION_PLAN_TASKS_IN_CONTEXT,
  MAX_FIXED_ITEMS_IN_CONTEXT,
  MAX_GROWTH_MOVES_IN_CONTEXT,
  MAX_HISTORY_MESSAGES,
  MAX_LOSING_CHECKS_IN_CONTEXT,
  MAX_SCORE_HISTORY_IN_CONTEXT,
  anthropicFailureMessage,
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
} from "@/lib/assistant";
import { formatShortDate, normalizeLocale, t, type Locale } from "@/lib/i18n";

export interface AssistantMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/** How many characters of the conversation's first real question to show
 * in the history menu — enough to recognize it, short enough to fit one
 * line. The preview is always the owner's own real words, never a
 * generated summary. */
const CONVERSATION_PREVIEW_LENGTH = 100;

/** How many past conversations the history menu loads at once — a small
 * business realistically has dozens, not thousands, of chat sessions, so
 * this is a safety cap rather than real pagination. */
const MAX_CONVERSATIONS_IN_HISTORY = 40;

export interface AssistantConversationSummary {
  id: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  /** The conversation's first user message, truncated — a real quote,
   * never a generated summary. */
  preview: string;
}

type LoadContextResult =
  | { status: "ok"; context: AssistantBusinessContext; locale: Locale }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Assembles the real-data grounding context from scratch — reusing the
 * exact same server actions/lib functions every other page already uses
 * to compute a live score (scoreBusinessById), an action plan
 * (getActionPlan), and business-type copy (bizProfile), plus a DB-only
 * read of the last saved competitor scan (getLatestCompetitorSnapshot —
 * no live Google Places calls, so this is cheap enough to rebuild on
 * every chat message rather than trusting a client-cached copy). Never
 * caches the AI's own context between calls: every message gets the
 * business's actual current data, not a stale snapshot from when the
 * page first loaded.
 */
async function loadContext(businessId: string): Promise<LoadContextResult> {
  // getBusinessSummary is awaited separately (not folded into the
  // Promise.all below) because its business.language is needed to derive
  // `locale` BEFORE scoring — scoreBusinessById needs the real locale to
  // produce Spanish-language check labels/explanations for a Spanish
  // business, not English ones re-labeled after the fact.
  const [summaryResult, scoreHistoryRows, gbpStatus, checklistStateResult] = await Promise.all([
    getBusinessSummary(businessId),
    getScoreHistory(businessId),
    getGbpConnectionStatus(businessId),
    getWeeklyChecklistState(businessId),
  ]);

  if (summaryResult.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (summaryResult.status === "not_found") {
    return { status: "not_found" };
  }

  const locale = normalizeLocale(summaryResult.business.language);
  const scored = await scoreBusinessById(businessId, locale);

  if (scored.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (scored.status === "not_found") {
    return { status: "not_found" };
  }
  if (scored.status === "error") {
    return { status: "error", message: scored.message };
  }

  // scored.business (from scoreBusinessById, already awaited above)
  // already selects categories/name as part of its own wider real-data
  // query — reused here rather than widening summaryResult's own
  // getBusinessSummary select a second time for the same two columns.
  //
  // autoDetectedProfile deliberately passes `categories` (real Google
  // type data) but NOT `name` — its one job is showing "what Google's
  // own data says" as an honest contrast against an owner's override
  // (see AssistantBusinessProfile.autoDetectedBusinessType's own doc).
  // A business's own NAME isn't Google category data, so including it
  // here would risk a confusing "owner-corrected from Google's
  // auto-detected X" when X and the override happen to be the same
  // profile — name-based detection stays reserved for the real
  // resolution path below (`profile`), the one callers actually use.
  const autoDetectedProfile = bizProfile(
    summaryResult.business.category,
    summaryResult.business.primary_type,
    locale,
    scored.business.categories,
    null
  );
  const businessTypeOverride = summaryResult.business.business_type_override ?? null;
  const profile = resolveBizProfile(
    summaryResult.business.category,
    summaryResult.business.primary_type,
    businessTypeOverride,
    locale,
    scored.business.categories,
    scored.business.name
  );
  const input = businessRowToScoringInput(scored.business);
  const { breakdown, suggestions } = scored.result;

  const actionPlanResult = await getActionPlan(businessId, input, breakdown, suggestions, locale);
  const topTasks: AssistantActionPlanTask[] =
    actionPlanResult.status === "ok"
      ? actionPlanResult.tasks.slice(0, MAX_ACTION_PLAN_TASKS_IN_CONTEXT).map((t) => ({
          label: t.label,
          category: t.category,
          promisedPoints: t.promisedPoints,
          action: t.action,
          effort: t.effort,
        }))
      : [];

  const snapshot = await getLatestCompetitorSnapshot(businessId);
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

  // Loads the signals and builds the moves in two steps (rather than the
  // one-shot getGrowthMoves the Growth page uses) because the context
  // block needs BOTH: the real moves, and the real underlying numbers/
  // dates behind them, so buildAssistantContextText can state each move's
  // reason in plain, owner-safe language instead of echoing
  // GrowthMove.signal's debug text. Same loader, same single set of
  // queries — the snapshot already fetched above is passed straight
  // through so this never issues a second, identical
  // getLatestCompetitorSnapshot query (see getGrowthMoveSignals's own doc
  // in app/actions/growthMoves.ts).
  const signalsResult = await getGrowthMoveSignals(businessId, breakdown, profile.referralOk, snapshot);
  const growthMoves: AssistantGrowthMove[] =
    signalsResult.status === "ok"
      ? buildGrowthMoves(signalsResult.signals, locale)
          .slice(0, MAX_GROWTH_MOVES_IN_CONTEXT)
          .map((m) => ({
            id: m.id,
            title: m.title,
            why: m.why,
            pricingAssessedAt: signalsResult.signals.pricingAssessedAt,
            yourPhotoCount: signalsResult.signals.photoCount,
            competitorMedianPhotoCount: signalsResult.signals.competitorPhotos.medianCompetitorPhotoCount,
            weakWebsiteIssueLabels: signalsResult.signals.weakWebsiteIssueLabels,
          }))
      : [];

  const weeklyRoutine: AssistantWeeklyRoutineSummary = {
    items: buildWeeklyChecklistItems(locale).map((item) => ({
      id: item.id,
      title: item.title,
      checkedThisWeek:
        checklistStateResult.status === "ok" && checklistStateResult.state.checkedItemIds.includes(item.id),
    })),
    streakWeeks: checklistStateResult.status === "ok" ? checklistStateResult.state.streakWeeks : 0,
  };

  const losingChecks: AssistantLosingCheck[] = suggestions
    .slice(0, MAX_LOSING_CHECKS_IN_CONTEXT)
    .map((s) => {
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

  // getScoreHistory comes back newest-first; take the most recent N then
  // reverse so the memory block reads as a real oldest-to-newest trend.
  const scoreHistory: AssistantScoreHistoryEntry[] = scoreHistoryRows
    .slice(0, MAX_SCORE_HISTORY_IN_CONTEXT)
    .map((h) => ({
      total: h.total,
      grade: h.grade as AssistantScoreHistoryEntry["grade"],
      date: formatShortDate(h.created_at, locale),
    }))
    .reverse();

  const fixedItems: AssistantFixedItem[] =
    actionPlanResult.status === "ok"
      ? actionPlanResult.completed.slice(0, MAX_FIXED_ITEMS_IN_CONTEXT).map((c) => ({
          label: c.label,
          pointsGained: c.pointsGained,
          verifiedAt: c.verifiedAt ? formatShortDate(c.verifiedAt, locale) : null,
        }))
      : [];

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
    location: summaryResult.business.address ?? null,
    services: summaryResult.business.services ?? [],
    avgJobValueLow: summaryResult.business.avg_job_value_low ?? null,
    avgJobValueHigh: summaryResult.business.avg_job_value_high ?? null,
    scoreHistory,
    fixedItems,
  };

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
    growthMoves,
    weeklyRoutine,
    competitors,
    profile: businessProfile,
    gbp: { connected: gbpStatus.status === "ok" && gbpStatus.connected },
  };

  return { status: "ok", context, locale };
}

export type GetAssistantPageDataResult =
  | {
      status: "ok";
      context: AssistantBusinessContext;
      starterPrompts: string[];
      /** How many past conversations exist for this business — just a
       * count (cheap), not their content, so the entry point can say
       * "3 past conversations" without loading any chat history until
       * the owner actually opens the history menu. */
      conversationCount: number;
    }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * Loads everything the assistant needs on first render: the real
 * grounding context, tailored starter prompts, and how many past
 * conversations exist. Deliberately does NOT load any messages — the
 * client resumes the current conversation itself, separately, via
 * getCurrentConversation (kept out of this call so the page's own
 * server-render never has to wait on it). Past conversations otherwise
 * beyond the current one are only fetched on demand, from the history
 * menu (see getConversationHistory/getConversationMessages).
 */
export async function getAssistantPageData(businessId: string): Promise<GetAssistantPageDataResult> {
  const loaded = await loadContext(businessId);
  if (loaded.status !== "ok") return loaded;

  const supabase = createClient();
  const { count, error } = await supabase
    .from("assistant_conversations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (error) {
    return { status: "error", message: error.message };
  }

  return {
    status: "ok",
    context: loaded.context,
    starterPrompts: buildAssistantStarterPrompts(loaded.context, loaded.locale),
    conversationCount: count ?? 0,
  };
}

export type SendAssistantMessageResult =
  | { status: "ok"; userMessage: AssistantMessageRow; reply: AssistantMessageRow; conversationId: string }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * The one place the (paid) Anthropic API is actually called — only ever
 * on an explicit send, never on page load. Saves the owner's question and
 * the assistant's reply as real rows in `assistant_messages` (the DB is
 * the single source of truth for conversation history — this never
 * trusts a client-supplied transcript), rebuilds the real-data context
 * fresh (see loadContext) so every reply reflects the business's actual
 * current state, and caps both the context and the resent history to
 * keep input tokens — and cost — bounded on a cheap Haiku model.
 *
 * `conversationId` is null for a session's first message — a new
 * `assistant_conversations` row is created lazily right here, so a chat
 * opened and closed without ever being used never leaves an empty
 * conversation behind. Every call returns the (possibly newly-created)
 * conversationId so the client can pass it back on the next message in
 * the same session. Chat history resent to the model is scoped to THIS
 * conversation only — a fresh chat is genuinely fresh to the model too,
 * never carrying context from an unrelated past session.
 */
export async function sendAssistantMessage(
  businessId: string,
  message: string,
  conversationId: string | null
): Promise<SendAssistantMessageResult> {
  const loaded = await loadContext(businessId);
  if (loaded.status !== "ok") return loaded;

  const trimmed = message.trim();
  if (!trimmed) {
    return { status: "error", message: t(loaded.locale, "dashboard.assistant.errorTypeQuestionFirst") };
  }

  const supabase = createClient();

  let activeConversationId = conversationId;
  if (!activeConversationId) {
    const { data: conversationRow, error: conversationError } = await supabase
      .from("assistant_conversations")
      .insert({ business_id: businessId })
      .select("id")
      .single();

    if (conversationError || !conversationRow) {
      return {
        status: "error",
        message: conversationError?.message ?? t(loaded.locale, "dashboard.assistant.errorCouldNotStartConversation"),
      };
    }
    activeConversationId = conversationRow.id as string;
  }

  const { data: userRow, error: userError } = await supabase
    .from("assistant_messages")
    .insert({
      business_id: businessId,
      conversation_id: activeConversationId,
      role: "user",
      content: trimmed,
    })
    .select("id, role, content, created_at")
    .single();

  if (userError || !userRow) {
    return {
      status: "error",
      message: userError?.message ?? t(loaded.locale, "dashboard.assistant.errorCouldNotSaveMessage"),
    };
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", activeConversationId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  if (historyError) {
    return { status: "error", message: historyError.message };
  }

  // Oldest-first for the API; historyRows came back newest-first from the
  // capped query above. The messages table always alternates user/
  // assistant, but an even-sized cap can slice into the middle of a
  // pair — if that leaves an assistant turn first, drop it, since the
  // Anthropic API requires every conversation to start with a user turn.
  const oldestFirst = ((historyRows ?? []) as AssistantMessageRow[]).slice().reverse();
  const recentTurns =
    oldestFirst.length > 0 && oldestFirst[0].role === "assistant" ? oldestFirst.slice(1) : oldestFirst;
  const system = buildAssistantSystemPrompt(loaded.context, loaded.locale);

  let replyText: string;
  try {
    replyText = await callAnthropicChat({
      system,
      messages: recentTurns.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: ASSISTANT_MAX_TOKENS,
    });
  } catch (err) {
    // The owner only ever sees a short, honest, translated message (see
    // anthropicFailureMessage in lib/assistant.ts — it's handed only a
    // numeric status, never this error object, so it's structurally
    // unable to leak anything technical). The full real detail (status,
    // API error type, request id) is logged server-side only, for
    // whoever's actually debugging a real outage. A failed request is
    // never saved as an assistant reply — this returns here, before the
    // "assistant" role insert below ever runs.
    if (err instanceof AnthropicApiError) {
      console.error(
        `[assistant] Anthropic API call failed: status=${err.status} type=${err.errorType ?? "unknown"} requestId=${err.requestId ?? "none"}`
      );
      return { status: "error", message: anthropicFailureMessage(err.status, loaded.locale) };
    }
    console.error("[assistant] Unexpected error calling Anthropic:", err);
    return {
      status: "error",
      // Not a shaped Anthropic failure (e.g. a network error before any
      // response) — no real status to report, so this always reads as
      // the generic "isn't available" case, never the rate-limit one.
      message: anthropicFailureMessage(0, loaded.locale),
    };
  }

  const { data: replyRow, error: replyError } = await supabase
    .from("assistant_messages")
    .insert({
      business_id: businessId,
      conversation_id: activeConversationId,
      role: "assistant",
      content: replyText.trim(),
    })
    .select("id, role, content, created_at")
    .single();

  if (replyError || !replyRow) {
    return {
      status: "error",
      message: replyError?.message ?? t(loaded.locale, "dashboard.assistant.errorCouldNotGetReply"),
    };
  }

  return {
    status: "ok",
    userMessage: userRow as AssistantMessageRow,
    reply: replyRow as AssistantMessageRow,
    conversationId: activeConversationId,
  };
}

export type GetCurrentConversationResult =
  | { status: "ok"; conversation: { id: string; messages: AssistantMessageRow[] } | null }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Finds the conversation the owner was last actually active in — the one
 * holding the most recently sent message, not merely the most recently
 * created conversation row (an owner who reopens an older conversation
 * from the history menu and keeps typing in it makes THAT the current one
 * again, without any separate "which chat is active" flag to maintain).
 * Opening PostAI resumes this conversation instead of always starting
 * blank; see AssistantView. Returns `conversation: null` when this
 * business has never had a single message sent — genuinely nothing to
 * resume, not an error.
 */
export async function getCurrentConversation(businessId: string): Promise<GetCurrentConversationResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: latest, error: latestError } = await supabase
    .from("assistant_messages")
    .select("conversation_id")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return { status: "error", message: latestError.message };
  }
  if (!latest) {
    return { status: "ok", conversation: null };
  }

  const { data: messages, error: messagesError } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", latest.conversation_id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return { status: "error", message: messagesError.message };
  }

  return {
    status: "ok",
    conversation: {
      id: latest.conversation_id as string,
      messages: (messages ?? []) as AssistantMessageRow[],
    },
  };
}

export type GetConversationHistoryResult =
  | { status: "ok"; conversations: AssistantConversationSummary[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Lists past conversations for the history menu — summaries only (a
 * preview of the real first question, a real message count, real
 * timestamps), never full transcripts; see getConversationMessages for
 * reading one. Fetched lazily, only when the owner opens the history
 * menu, so a business with a long chat history never pays for it just to
 * open the assistant.
 */
export async function getConversationHistory(businessId: string): Promise<GetConversationHistoryResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("assistant_conversations")
    .select("id, started_at, assistant_messages(role, content, created_at)")
    .eq("business_id", businessId)
    .order("started_at", { ascending: false })
    .limit(MAX_CONVERSATIONS_IN_HISTORY);

  if (error) {
    return { status: "error", message: error.message };
  }

  type Row = {
    id: string;
    started_at: string;
    assistant_messages: Array<{ role: "user" | "assistant"; content: string; created_at: string }>;
  };

  const conversations: AssistantConversationSummary[] = ((data ?? []) as Row[])
    .map((row) => {
      const messages = [...row.assistant_messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const firstUserMessage = messages.find((m) => m.role === "user");
      return {
        id: row.id,
        startedAt: row.started_at,
        lastMessageAt: messages[messages.length - 1]?.created_at ?? row.started_at,
        messageCount: messages.length,
        preview: (firstUserMessage?.content ?? "").slice(0, CONVERSATION_PREVIEW_LENGTH),
      };
    })
    // A conversation row with zero messages shouldn't normally exist
    // (sendAssistantMessage only creates one alongside its first
    // message), but never surface an empty one in the menu if it does.
    .filter((c) => c.messageCount > 0);

  return { status: "ok", conversations };
}

export type GetConversationMessagesResult =
  | { status: "ok"; messages: AssistantMessageRow[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Reads one past conversation's real messages, in order, for the
 * history menu's read-only view. */
export async function getConversationMessages(
  businessId: string,
  conversationId: string
): Promise<GetConversationMessagesResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", messages: (data ?? []) as AssistantMessageRow[] };
}
