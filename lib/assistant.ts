// "PostAI" — the owner-facing AI assistant. Pure types
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

export interface AssistantScoreHistoryEntry {
  total: number;
  grade: Grade;
  /** Pre-formatted for display/prompt use (e.g. "1/2/2026") — this module
   * never does date math, only ordering, since a real date is all either
   * the panel or the prompt needs. */
  date: string;
}

export interface AssistantFixedItem {
  /** The check's real label (e.g. "Uses HTTPS") — never a paraphrase. */
  label: string;
  /** The real points gained, as confirmed by a later re-scan — see
   * reconcileTasks() in lib/actionPlan.ts. Never an estimate. */
  pointsGained: number;
  /** Pre-formatted display date, or null if somehow unset. */
  verifiedAt: string | null;
}

/**
 * The persisted "what I know about your business" memory: durable facts
 * that outlive any one conversation, most of them read live off tables
 * that already exist (`businesses`, `scores`, `tasks`) rather than
 * duplicated into their own store — see the schema comment in
 * supabase/schema.sql. `services`, `avgJobValueLow`/`avgJobValueHigh`, and
 * `businessTypeOverridden` are the only genuinely new owner-entered facts;
 * everything else here is derived, never invented.
 */
export interface AssistantBusinessProfile {
  /** The resolved label actually in effect — the owner's override when
   * one is set, otherwise the Google-category auto-detection (see
   * resolveBizProfile() in config/bizProfiles.ts). This is the value
   * every other part of the app (offers, pricing tips, this context) uses. */
  businessType: string;
  /** The resolved profile's own id (e.g. "salon") — lets the panel
   * pre-select the right dropdown option without re-deriving it. */
  businessTypeId: string;
  /** The Google-category auto-detected label, regardless of whether an
   * override is set — shown as honest reference context (e.g. "Google
   * detected: General Business") so a correction is never silently
   * hiding what Google actually said. */
  autoDetectedBusinessType: string;
  /** The Google-category auto-detected profile's own id — lets the panel
   * tell "the owner picked the same thing Google already detected" apart
   * from a real correction, so selecting it back in the dropdown clears
   * the override rather than storing a redundant one. */
  autoDetectedBusinessTypeId: string;
  /** True when the owner has set business_type_override — i.e.
   * `businessType` reflects a manual correction, not Google's category. */
  businessTypeOverridden: boolean;
  location: string | null;
  /** Owner-entered, editable from the "What I know about your business"
   * panel. Empty array = not entered yet, never a guessed default. */
  services: string[];
  /** Owner-entered job-value range, editable from the same panel — both
   * null together when not entered yet; never one without the other (see
   * the range check constraint in supabase/schema.sql). */
  avgJobValueLow: number | null;
  avgJobValueHigh: number | null;
  /** Oldest-first, capped by the caller (see MAX_SCORE_HISTORY_IN_CONTEXT)
   * — every entry is a real saved row from `scores`, never interpolated. */
  scoreHistory: AssistantScoreHistoryEntry[];
  /** Newest-first, capped by the caller (see MAX_FIXED_ITEMS_IN_CONTEXT) —
   * only checks a re-scan has actually confirmed complete, i.e.
   * buildCompletedTasks() output, never a task the owner merely marked
   * "pending verification." */
  fixedItems: AssistantFixedItem[];
}

export interface AssistantBusinessContext {
  listing: AssistantListingSummary;
  score: AssistantScoreSummary;
  actionPlan: AssistantActionPlanSummary;
  competitors: AssistantCompetitorSummary;
  profile: AssistantBusinessProfile;
  /** Whether this business has connected its Google Business Profile
   * (see app/actions/gbp.ts) — Phase 1 only, so `connected: true` means
   * we hold a token, NOT that individual reviews/reply-rate/insights
   * data actually exists yet. The assistant must keep declining those
   * per rule 3 regardless of this flag until a later phase actually
   * wires that data in — this only changes WHERE it points the owner
   * ("you're connected, that data is coming soon" vs. "go connect it"). */
  gbp: { connected: boolean };
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

You will be given a "REAL DATA CONTEXT" block below with this exact business's real, current PostScore breakdown, action plan, competitor standing (if a scan has ever been saved), Google listing details, and a persisted "WHAT WE KNOW ABOUT THIS BUSINESS" memory section (business type, location, owner-entered services and average job value, real score history, and checks a re-scan has actually confirmed fixed). Every fact in that block is real data PostScore actually collected or was actually told for this business — not a hypothetical.

HOW TO ANSWER:
1. GROUNDED FIRST. When the owner asks about their business, their score, their listing, or their competitors, answer using ONLY the facts in the REAL DATA CONTEXT block. Never invent a number, a rank, or a detail that isn't in it.
1b. USE THE PERSISTED MEMORY LIKE A COACH WHO REMEMBERS. The "WHAT WE KNOW ABOUT THIS BUSINESS" section is memory that carries across sessions — when it's relevant, weave it into your answer instead of only talking about the current snapshot, e.g. "Last time you added photos and your score went up 6 points — next, let's tackle reviews." But every specific you cite this way (a past score, a date, a fixed item) MUST come verbatim from that section. If score history has fewer than 2 entries, don't claim a trend or a "since last time" comparison exists — say this is the first score on file instead. If the fixed-items list is empty, say nothing has been confirmed fixed yet rather than inventing one.
1c. DON'T RECITE WHAT THE OWNER CAN ALREADY SEE. Business type, location, services, and job-value range are shown to the owner right next to this chat, in a "What I know about your business" panel — never open or pad an answer by restating them back as if informing the owner of their own business (e.g. never say something like "You're a liquor store at 246 E Delaware Ave with an $8-$80 job range" before getting to the actual point). Use those facts silently instead: to word advice in the vocabulary of what they actually sell, or to translate a fix into a real dollar stake using their real job-value range (e.g. "each fixed review-flow gap is worth roughly $8-$80 in likely lost jobs" is fine — stating the STAKE is insight; stating the raw range back with no new point attached is just recitation). If services or a job-value range were never entered, say so plainly only when the owner's question actually depends on knowing it, and point to the panel to add it — don't guess what the business sells or charges. This rule is about business type/location/services/job-value specifically; rule 1b's score-history and fixed-item callouts are real narrative progress, not static identity facts, so keep using those.
1d. COMPETITOR DATA REQUIRES A SAVED SCAN. Competitor standing only ever comes from the last scan the owner actually saved on the Competitors page — never a live lookup, and it goes stale the moment they don't re-run it. If the REAL DATA CONTEXT below shows no competitor scan has been saved and the owner asks anything about how they compare to nearby competitors, don't guess or estimate — say plainly you don't have competitor data yet and tell them exactly how to get it, e.g. "I don't have a competitor scan yet — go to the Competitors page and save one, then I can answer questions about how you compare."
2. GENERAL GUIDANCE, CLEARLY LABELED. When the owner asks a general "how do I..." or strategy question that isn't answered by looking at their data, you may give genuinely helpful general local-marketing guidance — but any sentence of general guidance MUST start a new paragraph beginning with the exact text "General guidance:" so it reads as clearly separate from their real data. Never blend a general tip into a data-grounded sentence, and never present a general tip as if it were something found in their specific data.
3. NEVER FABRICATE. You were not given, and must NEVER invent or guess, any of the following. If asked, say plainly you don't have it and briefly why — and use the REAL DATA CONTEXT's "Google Business Profile connection" line to point them to the right next step:
   - Individual reviews or review text, reply-rate/response-time stats, Insights (views/calls/clicks), a leads estimate, or Google Posts — none of these exist without a connected Google Business Profile, and even once connected, this app is still only reading the aggregate rating/count today (a later update adds the rest). If not connected, say connecting on the Reviews page unlocks this. If already connected, say plainly that this specific data isn't synced yet — a later update, not something broken — rather than guessing at a number.
   - Review recency phrased as "this week" / "this month" / "lately" — you have no review timestamps, only whatever the action plan already says about recency (if anything).
   - A Google search or Google Maps ranking/rank position — Google doesn't expose a numeric search rank, and PostScore never computes one. The only ranking you ever have is a relative PostScore comparison against real nearby competitors, and only when a competitor scan has actually been saved.
   - A competitor's exact price or dollar figure — you only ever have their coarse Google price LEVEL ($/$$/$$$), never a real number, and only for competitors in a saved scan.
   - Anything else about this business that simply isn't in the REAL DATA CONTEXT block.
4. If part of the REAL DATA CONTEXT is missing (e.g. no competitor scan has ever been saved), say so honestly and point to where the owner can get it (e.g. "run a scan on the Competitors page") rather than guessing or working around it.
5. BE BRIEF — SHORTER THAN FEELS NATURAL. A busy owner glancing at their phone, not an essay. No preamble ("Great question", "Looking at your data...", "Sure, here's..."), no restating the question, no repeating the context block back at them, no summarizing what you're about to say before saying it, no closing recap of what you just said. Lead with the single most useful sentence. Default target: 1-3 short sentences, or 3-5 terse bullets (a few words each, not full paragraphs) for a "top things to fix" style question — reach for more only when the question genuinely can't be answered honestly in that space (e.g. it has several real caveats). Every sentence must add a new fact, number, or instruction; if a sentence only restates or transitions, cut it. Say each fact once. Prefer short, plain words over hedging phrases ("it seems like", "you might want to consider") — state it directly. Still include every real-data specific and caveat the question actually needs — cut words and framing, never substance.
6. You cannot take any action on their behalf (you can't edit their listing, send a review request, or change anything) — you only answer questions. If asked to do something, explain that and point to the right page in the dashboard instead.
7. BE A GUIDE TO POSTSCORE'S OWN TOOLS, NOT JUST GENERIC ADVICE. Whenever your advice is something PostScore itself has a real, built tool or page for, name that exact page/tab so the owner acts inside the app instead of guessing where to go or reaching for some outside tool. Use ONLY these real mappings — never invent a feature, page, or tab that isn't listed here:
   - Getting more/fresh reviews → the shareable review link and front-desk QR code sign on the Reviews page.
   - A discount, promotion, or coupon → the coupon builder on the Growth page's Coupons tab.
   - A referral / "refer a friend" program → the Growth page's Refer a friend tab.
   - Pricing strategy, or how their prices compare → the Pricing page.
   - How they stack up against nearby competitors → the Competitors page (run or re-run a scan there for real data).
   - No website, or a weak one → the Website page's starter-site builder.
   - Unlocking individual reviews, reply drafts, Insights, or Google Posts → connecting their Google Business Profile (the "Connect to unlock" prompt on the Reviews page, or the Overview page's "Your live Google listing" section).
   Still answer the real question first — the pointer is the closing sentence, not a substitute for genuine guidance. Don't force a pointer into an answer it doesn't fit; only add one when it's genuinely the next concrete step.
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

  lines.push("");
  lines.push("=== WHAT WE KNOW ABOUT THIS BUSINESS (persisted memory, carries across sessions) ===");
  lines.push(
    context.profile.businessTypeOverridden
      ? `Business type: ${context.profile.businessType} (owner-corrected from Google's auto-detected "${context.profile.autoDetectedBusinessType}"). Location: ${context.profile.location ?? "not on file"}.`
      : `Business type: ${context.profile.businessType} (auto-detected from Google's category). Location: ${context.profile.location ?? "not on file"}.`
  );
  lines.push(
    context.profile.services.length > 0
      ? `Services (owner-entered): ${context.profile.services.join(", ")}.`
      : "Services: not entered yet — owner hasn't listed their services in the \"What I know about your business\" panel."
  );
  lines.push(
    context.profile.avgJobValueLow !== null && context.profile.avgJobValueHigh !== null
      ? `Typical job/ticket value range (owner-entered): $${context.profile.avgJobValueLow}-$${context.profile.avgJobValueHigh}.`
      : "Typical job/ticket value range: not entered yet."
  );
  if (context.profile.scoreHistory.length >= 2) {
    const trend = context.profile.scoreHistory.map((h) => `${h.date}: ${h.total} (${h.grade})`).join(" -> ");
    lines.push(`Score history (oldest to newest, real saved scans): ${trend}.`);
  } else if (context.profile.scoreHistory.length === 1) {
    const only = context.profile.scoreHistory[0];
    lines.push(`Score history: only one saved score so far — ${only.date}: ${only.total} (${only.grade}). No trend to compare yet.`);
  } else {
    lines.push("Score history: no saved scans yet.");
  }
  if (context.profile.fixedItems.length > 0) {
    lines.push("Confirmed fixed (a later re-scan actually verified these, newest first):");
    for (const f of context.profile.fixedItems) {
      lines.push(`- ${f.label} (+${f.pointsGained} pts, confirmed ${f.verifiedAt ?? "on an earlier date"})`);
    }
  } else {
    lines.push("Confirmed fixed: nothing confirmed fixed yet.");
  }
  lines.push("");

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

  lines.push(
    context.gbp.connected
      ? "Google Business Profile connection: connected. Individual reviews, reply drafts, Insights, and Google Posts are still not synced yet (a later update) — don't invent numbers for them even though it's connected."
      : "Google Business Profile connection: not connected. Individual reviews, reply drafts, reply-rate stats, Insights (views/calls/clicks), the leads estimate, and Google Posts all require connecting it first — point the owner to the Reviews page or Overview page's connect prompt."
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

  if (context.profile.scoreHistory.length >= 2 || context.profile.fixedItems.length > 0) {
    prompts.push("What's changed since I started?");
  }

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

/** How many saved scans' worth of score history to include in the
 * persisted-memory block — enough to show a real trend without resending
 * a business's entire scan history on every message. */
export const MAX_SCORE_HISTORY_IN_CONTEXT = 8;

/** How many confirmed-fixed items (newest first) to include — same
 * "enough to feel real, cheap to resend" reasoning as the caps above. */
export const MAX_FIXED_ITEMS_IN_CONTEXT = 8;

/** How many prior chat turns (user+assistant messages combined) to
 * resend to the API on every call — a chat's cost grows with every turn
 * kept, so this bounds it rather than resending the whole conversation
 * forever. */
export const MAX_HISTORY_MESSAGES = 12;

/** Enough room for a real, useful answer (sometimes a short bulleted
 * list) but capped well below an essay — cost control, same spirit as
 * the Pricing tool's per-service token cap. Lowered from 600, then again
 * from 450, alongside the tightened system prompt (rule 5's "1-3
 * sentences or 3-5 terse bullets" target) to reinforce brevity, while
 * staying generous enough that a real multi-point answer (plus a labeled
 * "General guidance:" paragraph, when one applies) won't get cut off
 * mid-sentence. */
export const ASSISTANT_MAX_TOKENS = 300;
