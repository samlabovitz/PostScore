"use server";

import { createClient } from "@/lib/supabase/server";
import { getBusinessSummary } from "@/app/actions/businesses";
import { scoreBusinessById } from "@/app/actions/scoring";
import { getActionPlan } from "@/app/actions/actionPlan";
import { getLatestCompetitorSnapshot } from "@/app/actions/competitors";
import { businessRowToScoringInput } from "@/lib/scoring";
import { bizProfile } from "@/config/bizProfiles";
import { priceLevelToSymbol } from "@/lib/priceLevel";
import { callAnthropicChat } from "@/lib/anthropicClient";
import {
  ASSISTANT_MAX_TOKENS,
  ASSISTANT_SYSTEM_RULES,
  MAX_ACTION_PLAN_TASKS_IN_CONTEXT,
  MAX_HISTORY_MESSAGES,
  MAX_LOSING_CHECKS_IN_CONTEXT,
  buildAssistantContextText,
  buildAssistantStarterPrompts,
  type AssistantActionPlanTask,
  type AssistantBusinessContext,
  type AssistantCompetitorSummary,
  type AssistantExcludedCheck,
  type AssistantLosingCheck,
} from "@/lib/assistant";

export interface AssistantMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

type LoadContextResult =
  | { status: "ok"; context: AssistantBusinessContext }
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
  const [summaryResult, scored] = await Promise.all([
    getBusinessSummary(businessId),
    scoreBusinessById(businessId),
  ]);

  if (scored.status === "unauthenticated" || summaryResult.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (scored.status === "not_found" || summaryResult.status === "not_found") {
    return { status: "not_found" };
  }
  if (scored.status === "error") {
    return { status: "error", message: scored.message };
  }

  const profile = bizProfile(summaryResult.business.category, summaryResult.business.primary_type);
  const input = businessRowToScoringInput(scored.business);
  const { breakdown, suggestions } = scored.result;

  const actionPlanResult = await getActionPlan(businessId, input, breakdown, suggestions);
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
          scanAt: new Date(snapshot.createdAt).toLocaleDateString(),
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
    competitors,
  };

  return { status: "ok", context };
}

export type GetAssistantPageDataResult =
  | {
      status: "ok";
      context: AssistantBusinessContext;
      starterPrompts: string[];
      messages: AssistantMessageRow[];
    }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** Loads everything the assistant page needs on first render: the real
 * grounding context, tailored starter prompts, and the saved
 * conversation so far. */
export async function getAssistantPageData(businessId: string): Promise<GetAssistantPageDataResult> {
  const loaded = await loadContext(businessId);
  if (loaded.status !== "ok") return loaded;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  return {
    status: "ok",
    context: loaded.context,
    starterPrompts: buildAssistantStarterPrompts(loaded.context),
    messages: (data ?? []) as AssistantMessageRow[],
  };
}

export type SendAssistantMessageResult =
  | { status: "ok"; userMessage: AssistantMessageRow; reply: AssistantMessageRow }
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
 */
export async function sendAssistantMessage(
  businessId: string,
  message: string
): Promise<SendAssistantMessageResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { status: "error", message: "Type a question first." };
  }

  const loaded = await loadContext(businessId);
  if (loaded.status !== "ok") return loaded;

  const supabase = createClient();

  const { data: userRow, error: userError } = await supabase
    .from("assistant_messages")
    .insert({ business_id: businessId, role: "user", content: trimmed })
    .select("id, role, content, created_at")
    .single();

  if (userError || !userRow) {
    return { status: "error", message: userError?.message ?? "Could not save your message." };
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("assistant_messages")
    .select("id, role, content, created_at")
    .eq("business_id", businessId)
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
  const system = `${ASSISTANT_SYSTEM_RULES}\n\n${buildAssistantContextText(loaded.context)}`;

  let replyText: string;
  try {
    replyText = await callAnthropicChat({
      system,
      messages: recentTurns.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: ASSISTANT_MAX_TOKENS,
    });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach the assistant — try again.",
    };
  }

  const { data: replyRow, error: replyError } = await supabase
    .from("assistant_messages")
    .insert({ business_id: businessId, role: "assistant", content: replyText.trim() })
    .select("id, role, content, created_at")
    .single();

  if (replyError || !replyRow) {
    return { status: "error", message: replyError?.message ?? "Could not save the assistant's reply." };
  }

  return {
    status: "ok",
    userMessage: userRow as AssistantMessageRow,
    reply: replyRow as AssistantMessageRow,
  };
}

export type ClearAssistantConversationResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Deletes the saved conversation for this business so the owner can
 * start fresh. RLS (business-ownership scoped, same as every other
 * table) is what actually enforces this can only ever delete the
 * caller's own business's messages. */
export async function clearAssistantConversation(businessId: string): Promise<ClearAssistantConversationResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("assistant_messages").delete().eq("business_id", businessId);
  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}
