// "Ask about your presence" — the owner-facing AI assistant. Pure types
// and prompt-building/formatting logic only; no network, no database,
// no lib/scoring.ts changes. The actual Anthropic call and all data
// fetching live in app/actions/assistant.ts, same split as
// lib/pricing.ts vs. app/actions/pricing.ts.
//
// This module exists to make the assistant's two hardest properties —
// (1) it only ever states real facts it was actually given, and (2) any
// general advice is visibly labeled as such — reviewable in one place,
// the same way lib/pricing.ts keeps its honesty rules inspectable apart
// from the server action that calls the API.

import type { CategoryId, Confidence, Grade, HttpsCheckStatus } from "@/lib/scoring";
import { CATEGORY_LABELS } from "@/lib/scoring";
import type { TaskEffort } from "@/lib/actionPlan";

// ---------------------------------------------------------------------------
// Context shape — the compact, real-data summary the assistant is grounded in
// ---------------------------------------------------------------------------

export interface AssistantListingSummary {
  name: string | null;
  categoryLabel: string;
  rating: number | null;
  reviewCount: number | null;
  phonePresent: boolean;
  addressPresent: boolean;
  hoursPresent: boolean;
  websitePresent: boolean;
  httpsStatus: HttpsCheckStatus | null;
  photoCount: number | null;
  businessStatus: string | null;
  categoriesCount: number;
}

export interface AssistantLosingCheck {
  checkId: string;
  label: string;
  category: CategoryId;
  earnedPoints: number | null;
  maxPoints: number;
  explanation: string;
}

export interface AssistantExcludedCheck {
  label: string;
  confidence: Confidence;
  explanation: string;
}

export interface AssistantScoreSummary {
  total: number;
  grade: Grade;
  categories: Array<{
    id: CategoryId;
    label: string;
    relativeScore: number | null;
    earnedPoints: number;
    possiblePoints: number;
  }>;
  /** Determinable checks still losing points, biggest opportunity first —
   * the exact same set/order lib/scoring.ts's generateSuggestions()
   * already computed, just carrying the check's own explanation too. */
  losingChecks: AssistantLosingCheck[];
  /** UNCERTAIN/NOT_FOUND checks — real, honest "we don't have this yet,"
   * never presented as a failure. */
  excludedChecks: AssistantExcludedCheck[];
}

export interface AssistantActionPlanTask {
  label: string;
  category: CategoryId;
  promisedPoints: number;
  action: string;
  effort: TaskEffort;
}

export interface AssistantActionPlanSummary {
  /** Open tasks, biggest-opportunity first, already capped to a short
   * list by the caller (see MAX_ACTION_PLAN_TASKS in
   * app/actions/assistant.ts) — kept short for prompt-token cost. */
  topTasks: AssistantActionPlanTask[];
}

export interface AssistantCompetitorEntry {
  name: string;
  isSubject: boolean;
  total: number | null;
  grade: string | null;
  priceLevelSymbol: string | null;
}

export interface AssistantCompetitorSummary {
  /** False when this business has never had a competitor scan saved —
   * the assistant must say so honestly rather than guess, see
   * ASSISTANT_SYSTEM_RULES below. */
  available: boolean;
  scanAt: string | null;
  subjectRank: number | null;
  entries: AssistantCompetitorEntry[];
}

export interface AssistantBusinessContext {
  listing: AssistantListingSummary;
  score: AssistantScoreSummary;
  actionPlan: AssistantActionPlanSummary;
  competitors: AssistantCompetitorSummary;
}

// ---------------------------------------------------------------------------
// System prompt — the honesty contract, static across every conversation
// ---------------------------------------------------------------------------

/**
 * The non-negotiable rules every assistant reply must follow. Deliberately
 * explicit and exhaustive about what must NEVER be fabricated (see the
 * CRITICAL HONESTY GUARDRAILS spec this implements) — this is the one
 * feature in the app that talks in free-form natural language rather than
 * a fixed set of UI strings, so the discipline has to live in the prompt
 * itself rather than in response validation like lib/pricing.ts's
 * parsePricingAssessmentResponse.
 */
export const ASSISTANT_SYSTEM_RULES = `
You are the PostScore Assistant, embedded in a local business owner's PostScore dashboard. The owner is asking about their own business's real online presence — their Google Business Profile, their PostScore, their competitors, and general local-marketing strategy.

You will be given a "REAL DATA CONTEXT" block below with this exact business's real, current PostScore breakdown, action plan, competitor standing (if a scan has ever been saved), and Google listing details. Every fact in that block is real data PostScore actually collected for this business — not a hypothetical.

HOW TO ANSWER:
1. GROUNDED FIRST. When the owner asks about their business, their score, their listing, or their competitors, answer using ONLY the facts in the REAL DATA CONTEXT block. Never invent a number, a rank, or a detail that isn't in it.
2. GENERAL GUIDANCE, CLEARLY LABELED. When the owner asks a general "how do I..." or strategy question that isn't answered by looking at their data, you may give genuinely helpful general local-marketing guidance — but any sentence of general guidance MUST start a new paragraph beginning with the exact text "General guidance:" so it reads as clearly separate from their real data. Never blend a general tip into a data-grounded sentence, and never present a general tip as if it were something found in their specific data.
3. NEVER FABRICATE. You were not given, and must NEVER invent or guess, any of the following. If asked, say plainly you don't have it and briefly why:
   - Individual reviews or review text — you only ever have an aggregate rating and count, never the actual review content. That requires a Google Business Profile connection PostScore doesn't have yet.
   - Review recency phrased as "this week" / "this month" / "lately" — you have no review timestamps, only whatever the action plan already says about recency (if anything).
   - A Google search or Google Maps ranking/rank position — Google doesn't expose a numeric search rank, and PostScore never computes one. The only ranking you ever have is a relative PostScore comparison against real nearby competitors, and only when a competitor scan has actually been saved.
   - A competitor's exact price or dollar figure — you only ever have their coarse Google price LEVEL ($/$$/$$$), never a real number, and only for competitors in a saved scan.
   - Reply rates, response times, or any review-management metric — not tracked by PostScore at all.
   - Anything else about this business that simply isn't in the REAL DATA CONTEXT block.
4. If part of the REAL DATA CONTEXT is missing (e.g. no competitor scan has ever been saved), say so honestly and point to where the owner can get it (e.g. "run a scan on the Competitors page") rather than guessing or working around it.
5. BE BRIEF. A busy owner, not an essay. No preamble ("Great question", "Looking at your data..."), no restating the question, no repeating the context block back at them, no summarizing what you're about to say before saying it. Lead with the answer. Prefer a short paragraph (2-4 sentences) or a tight bulleted list of specifics over long prose — every sentence should add a new fact, number, or instruction, not restate one already given. Still include every real-data specific and caveat the question actually needs; cut words, not substance.
6. You cannot take any action on their behalf (you can't edit their listing, send a review request, or change anything) — you only answer questions. If asked to do something, explain that and point to the right page in the dashboard instead.
`.trim();

// ---------------------------------------------------------------------------
// Context → prompt text
// ---------------------------------------------------------------------------

function formatEffort(effort: TaskEffort): string {
  return effort.replace(/_/g, " ");
}

/**
 * Renders a context object into the compact block appended after
 * ASSISTANT_SYSTEM_RULES and sent as part of the system prompt on every
 * message — short and structured on purpose to keep input tokens (and so
 * cost) low even though it's resent on every turn of a conversation.
 */
export function buildAssistantContextText(context: AssistantBusinessContext): string {
  const lines: string[] = [];
  lines.push("=== REAL DATA CONTEXT ===");
  lines.push(`Business: ${context.listing.name ?? "Unnamed business"} (${context.listing.categoryLabel})`);
  lines.push(`PostScore: ${context.score.total}/100 (Grade ${context.score.grade})`);

  lines.push("Category breakdown:");
  for (const c of context.score.categories) {
    const relative = c.relativeScore !== null ? `${Math.round(c.relativeScore)}/100` : "not enough data to score";
    lines.push(`- ${c.label}: ${relative} (${c.earnedPoints}/${c.possiblePoints} pts earned in this category)`);
  }

  if (context.score.losingChecks.length > 0) {
    lines.push("Checks currently losing points (biggest opportunity first):");
    for (const c of context.score.losingChecks) {
      lines.push(`- [${CATEGORY_LABELS[c.category]}] ${c.label}: ${c.earnedPoints ?? 0}/${c.maxPoints} pts — ${c.explanation}`);
    }
  } else {
    lines.push("No checks are currently losing points — every determinable check is at full points.");
  }

  if (context.score.excludedChecks.length > 0) {
    lines.push(
      `Checks not currently scored (no reliable data yet — excluded, NOT counted against them): ${context.score.excludedChecks
        .map((c) => c.label)
        .join(", ")}.`
    );
  }

  lines.push("Action plan (open tasks, biggest opportunity first):");
  if (context.actionPlan.topTasks.length === 0) {
    lines.push("- No open tasks.");
  } else {
    for (const t of context.actionPlan.topTasks) {
      lines.push(`- ${t.label} (+${t.promisedPoints} pts, ${formatEffort(t.effort)}): ${t.action}`);
    }
  }

  lines.push("Competitors:");
  if (!context.competitors.available) {
    lines.push(
      "- No competitor scan has ever been saved for this business. If asked to compare against competitors, say so honestly and suggest running a scan on the Competitors page."
    );
  } else {
    lines.push(
      `- From a saved scan on ${context.competitors.scanAt ?? "an earlier date"}. This business ranks #${context.competitors.subjectRank ?? "?"} of ${context.competitors.entries.length} by PostScore.`
    );
    for (const e of context.competitors.entries) {
      lines.push(
        `  - ${e.isSubject ? "[This business] " : ""}${e.name}: PostScore ${e.total ?? "—"} (${e.grade ?? "—"}), Google price level: ${e.priceLevelSymbol ?? "no data"}`
      );
    }
  }

  lines.push("Listing details:");
  lines.push(`- Rating: ${context.listing.rating !== null ? `${context.listing.rating.toFixed(1)}★` : "no rating on file"}, from ${context.listing.reviewCount ?? 0} review(s).`);
  lines.push(
    `- Phone on file: ${context.listing.phonePresent ? "yes" : "no"}. Address on file: ${context.listing.addressPresent ? "yes" : "no"}. Hours on file: ${context.listing.hoursPresent ? "yes" : "no"}. Categories on file: ${context.listing.categoriesCount}.`
  );
  lines.push(
    context.listing.websitePresent
      ? `- Has a website. HTTPS status: ${context.listing.httpsStatus ?? "not yet checked"}.`
      : "- No website on file."
  );
  lines.push(
    `- Photos on listing: ${context.listing.photoCount ?? "not returned by Google"}. Business status: ${context.listing.businessStatus ?? "not returned by Google"}.`
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Starter prompts — clickable examples tailored to this business's real data
// ---------------------------------------------------------------------------

/**
 * A small set of example questions the assistant can genuinely answer
 * well — either grounded in this business's real data, or as clearly
 * labeled general guidance. Deliberately never suggests a question the
 * assistant would have to decline (e.g. "what's my Google rank?").
 */
export function buildAssistantStarterPrompts(context: AssistantBusinessContext): string[] {
  const prompts: string[] = [
    "What's hurting my score the most right now?",
    "What are the top 3 things I should fix this week?",
  ];

  const topLoss = context.score.losingChecks[0];
  if (topLoss) {
    prompts.push(`Why is my ${CATEGORY_LABELS[topLoss.category]} section losing points?`);
  }

  prompts.push(
    context.competitors.available
      ? "How do I compare to my nearby competitors?"
      : "How can I compare to my nearby competitors?"
  );
  prompts.push("How do I get more Google reviews?");
  prompts.push(
    context.listing.rating !== null
      ? "Is my rating good enough, or should I focus on getting more reviews?"
      : "How do I start building a rating from zero reviews?"
  );

  return prompts;
}

// ---------------------------------------------------------------------------
// Cost-control constants
// ---------------------------------------------------------------------------

/** How many determinable-and-losing checks to include in the context
 * block — every real check today is well under this, but kept as an
 * explicit cap so the prompt can never grow unbounded if more checks are
 * added later. */
export const MAX_LOSING_CHECKS_IN_CONTEXT = 12;

/** How many open action-plan tasks to include — mirrors WEEKLY_PLAN_CAP's
 * "enough to feel real, few enough to stay cheap" reasoning. */
export const MAX_ACTION_PLAN_TASKS_IN_CONTEXT = 5;

/** How many prior chat turns (user+assistant messages combined) to
 * resend to the API on every call — a chat's cost grows with every turn
 * kept, so this bounds it rather than resending the whole conversation
 * forever. */
export const MAX_HISTORY_MESSAGES = 12;

/** Enough room for a real, useful answer (sometimes a short bulleted
 * list) but capped well below an essay — cost control, same spirit as
 * the Pricing tool's per-service token cap. Lowered from 600 alongside
 * the tightened system prompt (rule 5) to reinforce brevity, while
 * staying generous enough that a real multi-point answer won't get cut
 * off mid-sentence. */
export const ASSISTANT_MAX_TOKENS = 450;
