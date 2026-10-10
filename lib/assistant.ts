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
import type { ReachabilityFailureReason } from "@/lib/websiteReachability";
import type { TaskEffort } from "@/lib/actionPlan";
import { PHOTO_COMPARISON_CAP, type GrowthMoveId } from "@/lib/growthMoves";
import { DEFAULT_LOCALE, formatShortDate, t, type Locale } from "@/lib/i18n";
import { weekStartFor, type WeeklyChecklistItemId } from "@/lib/weeklyChecklist";

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
  /** WHY httpsStatus is "unreachable" — see ReachabilityFailureReason's
   * own doc (lib/websiteReachability.ts) and websiteReachabilityText's
   * own doc for why this changes what the model is allowed to claim.
   * null whenever httpsStatus isn't "unreachable", or on a legacy row
   * saved before this field existed. */
  httpsUnreachableReason: ReachabilityFailureReason | null;
  /** Non-null only the first scan to SUSPECT a gap — see
   * resolveListingWebsite (lib/googleListingWebsite.ts). A fact about
   * GOOGLE's listing, never about whether the site itself is
   * reachable. Mutually exclusive with googleListingWebsiteRemovedSince
   * below (never both set). */
  googleListingMissingWebsiteSince: string | null;
  /** Non-null once that suspicion is CONFIRMED on a later, separate
   * scan — the website really is gone from the listing and scored
   * accordingly. The one real "is this confirmed" signal; never used
   * for the displayed date (see googleListingLastKnownWebsiteAt
   * below) — that was a real bug this fixes. */
  googleListingWebsiteRemovedSince: string | null;
  /** The REAL date Google last actually returned a website — see
   * findLastKnownWebsiteDate (lib/googleListingWebsite.ts). Used for
   * the honest "it last showed one on {date}" line ONLY when
   * non-null; when googleListingWebsiteRemovedSince is set but this
   * is null, say so with no date rather than guess. */
  googleListingLastKnownWebsiteAt: string | null;
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
/** One real, built-in coupon quick pick for this business type — mirrors
 * CouponPreset (config/bizProfiles.ts) minus its internal `id`, which
 * the model never needs to see or repeat. */
export interface AssistantOfferPreset {
  label: string;
  description: string;
}

/** One real, built-in referral reward pair for this business type —
 * mirrors ReferralPreset (config/bizProfiles.ts) minus its internal
 * `id`. */
export interface AssistantReferralPreset {
  referrerReward: string;
  friendReward: string;
  description: string;
}

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
  /** BizProfile.referralOk (config/bizProfiles.ts) for the resolved
   * business type above — the exact same flag that already hides the
   * Growth page's own "Refer a friend" tab, false today only for lawyer
   * (referral-fee arrangements are restricted under most states' rules
   * of professional conduct). buildAssistantContextText uses this to
   * tell the model plainly when the referral tab isn't available, so
   * rule 7's referral mapping (and the model's own answers) never
   * suggest a program this business can't actually set up in the app. */
  referralOk: boolean;
  /** This business type's real, built-in coupon quick picks (BizProfile.
   * couponPresets in config/bizProfiles.ts) — the exact same options the
   * Coupons tab's own picker shows, already resolved in this business's
   * real locale. Lets the model name a REAL built-in option instead of
   * inventing one or describing a generic idea as if PostScore built it
   * (see rule 7b-style honesty). Never empty — every business type has
   * at least one. */
  couponPresets: AssistantOfferPreset[];
  /** This business type's real, built-in referral reward pairs
   * (BizProfile.referralPresets) — empty whenever referralOk is false,
   * since the Refer a friend builder never mounts for this business
   * type and so has nothing to preset. */
  referralPresets: AssistantReferralPreset[];
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

/**
 * One real, currently-firing growth move (see lib/growthMoves.ts) —
 * a customer-getting action PostScore has a genuine signal for, never
 * a score-based suggestion. Deliberately carries `signal`, the exact
 * same plain-English real fact GrowthMove.signal already records for
 * tests/debugging, so the assistant can always say WHY a move is
 * being suggested and never just assert it.
 */
export interface AssistantGrowthMove {
  /** Which real move this is (see lib/growthMoves.ts) — the one field
   * the two formatters below branch on, so the owner-facing
   * destination and plain-language fact are both derived from the real
   * move rather than parsed back out of a URL or a debug string. */
  id: GrowthMoveId;
  title: string;
  why: string;
  /** When a price check was last actually run in PostScore, or null if
   * never — carried as the raw timestamp, never a pre-formatted
   * string, so buildAssistantContextText can render it with
   * formatShortDate in the owner's own locale. run_price_check only. */
  pricingAssessedAt: string | null;
  /** This listing's own real Google photo count.
   * add_photos_vs_competitors only. */
  yourPhotoCount: number | null;
  /** Median real photo count among competitors in the last saved scan.
   * add_photos_vs_competitors only. */
  competitorMedianPhotoCount: number | null;
  /** Real, already-localized labels of the website checks currently
   * below full points. improve_website only. */
  weakWebsiteIssueLabels: string[];
}

export interface AssistantWeeklyRoutineItem {
  /** The real, stable item id (see WEEKLY_CHECKLIST_ITEM_IDS in
   * lib/weeklyChecklist.ts) — used by buildAssistantContextText to
   * state exactly where each habit is actually done (see
   * WEEKLY_ROUTINE_DONE_ON below), never derived by matching on the
   * (localized, so locale-fragile) title text. */
  id: WeeklyChecklistItemId;
  title: string;
  /** True only when the owner has actually checked this item off for
   * the CURRENT real week — a self-reported log PostScore cannot
   * independently verify (see lib/weeklyChecklist.ts's own module
   * doc). False must never be read as "the owner hasn't done this" —
   * only as "not logged yet." */
  checkedThisWeek: boolean;
}

export interface AssistantWeeklyRoutineSummary {
  /** All 5 habits, in lib/weeklyChecklist.ts's fixed display order —
   * this list is always exactly 5 long (a hardcoded set of habits, not
   * a growable table), so unlike the capped lists above it needs no
   * cap constant. */
  items: AssistantWeeklyRoutineItem[];
  /** Consecutive fully-checked-off PAST weeks (never counts the
   * current, still-in-progress week) — see computeStreakWeeks in
   * lib/weeklyChecklist.ts. 0 means no real streak to mention. */
  streakWeeks: number;
}

export interface AssistantBusinessContext {
  listing: AssistantListingSummary;
  score: AssistantScoreSummary;
  actionPlan: AssistantActionPlanSummary;
  /** Every growth move currently firing for this business — see
   * lib/growthMoves.ts. Capped by the caller (see
   * MAX_GROWTH_MOVES_IN_CONTEXT) so the prompt can never grow
   * unbounded if more moves are added later; every real business
   * today fires at most a handful. */
  growthMoves: AssistantGrowthMove[];
  weeklyRoutine: AssistantWeeklyRoutineSummary;
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
1b. USE THE PERSISTED MEMORY LIKE A COACH WHO REMEMBERS. The "WHAT WE KNOW ABOUT THIS BUSINESS" section is memory that carries across sessions — when it's relevant, weave it into your answer instead of only talking about the current snapshot, e.g. "Last time you added photos and your score went up 6 points — next, let's tackle reviews." But every specific you cite this way (a past score, a date, a fixed item) MUST come verbatim from that section. If score history has fewer than 2 entries, don't claim a trend or a "since last time" comparison exists — say this is the first score on file instead. If the fixed-items list is empty, say nothing has been confirmed fixed yet rather than inventing one. Score history is TOTALS ONLY — it never records WHY a score moved between two scans. When asked why the score changed, state the real before/after numbers, but NEVER invent or guess a cause unless REAL DATA CONTEXT separately states one (a confirmed-fixed item, or a check currently losing points) — if no reason is on file, say the numbers moved but no reason is recorded, rather than guessing at what might have changed.
1c. DON'T RECITE WHAT THE OWNER CAN ALREADY SEE. Business type, location, services, and job-value range are shown to the owner right next to this chat, in a "What I know about your business" panel — never open or pad an answer by restating them back as if informing the owner of their own business (e.g. never say something like "You're a liquor store at 246 E Delaware Ave with an $8-$80 job range" before getting to the actual point). Use those facts silently instead: to word advice in the vocabulary of what they actually sell, or to translate a fix into a real dollar stake using their real job-value range (e.g. "each fixed review-flow gap is worth roughly $8-$80 in likely lost jobs" is fine — stating the STAKE is insight; stating the raw range back with no new point attached is just recitation). If services or a job-value range were never entered, say so plainly only when the owner's question actually depends on knowing it, and point to the panel to add it — don't guess what the business sells or charges. This rule is about business type/location/services/job-value specifically; rule 1b's score-history and fixed-item callouts are real narrative progress, not static identity facts, so keep using those.
1d. COMPETITOR DATA REQUIRES A SAVED SCAN. Competitor standing only ever comes from the last scan the owner actually saved on the Competitors page — never a live lookup, and it goes stale the moment they don't re-run it. If the REAL DATA CONTEXT below shows no competitor scan has been saved and the owner asks anything about how they compare to nearby competitors, don't guess or estimate — say plainly you don't have competitor data yet and tell them exactly how to get it, e.g. "I don't have a competitor scan yet — go to the Competitors page and save one, then I can answer questions about how you compare."
2. GENERAL GUIDANCE, CLEARLY LABELED. When the owner asks a general "how do I..." or strategy question that isn't answered by looking at their data, you may give genuinely helpful general local-marketing guidance — but any sentence of general guidance MUST start a new paragraph beginning with the exact marker text for the language you're answering in (see below), so it reads as clearly separate from their real data. Never blend a general tip into a data-grounded sentence, and never present a general tip as if it were something found in their specific data. In English, that marker is exactly "General guidance:" (that exact capitalization, spacing, and colon) — a literal control token the app's UI parses to style that paragraph differently. If you were instructed elsewhere in this prompt to answer in a different language, that language has its OWN exact marker text (see the language directive below) — use THAT one instead, never English's "General guidance:" in a non-English answer. Whichever marker applies, emit it verbatim exactly as given — never translate, rephrase, paraphrase, or vary it.
3. NEVER FABRICATE. You were not given, and must NEVER invent or guess, any of the following. If asked, say plainly you don't have it and briefly why — and use the REAL DATA CONTEXT's "Google Business Profile connection" line to point them to the right next step:
   - Individual reviews or review text, reply-rate/response-time stats, Insights (views/calls/clicks), a leads estimate, or Google Posts — none of these exist without a connected Google Business Profile, and even once connected, this app is still only reading the aggregate rating/count today (a later update adds the rest). If not connected, say connecting on the Reviews page unlocks this. If already connected, say plainly that this specific data isn't synced yet — a later update, not something broken — rather than guessing at a number.
   - Review recency phrased as "this week" / "this month" / "lately" — you have no review timestamps, only whatever the action plan already says about recency (if anything).
   - A Google search or Google Maps ranking/rank position — Google doesn't expose a numeric search rank, and PostScore never computes one. The only ranking you ever have is a relative PostScore comparison against real nearby competitors, and only when a competitor scan has actually been saved.
   - A competitor's exact price or dollar figure — you only ever have their coarse Google price LEVEL ($/$$/$$$), never a real number, and only for competitors in a saved scan.
   - An exact photo count once REAL DATA CONTEXT already describes it as "X or more" — that phrasing means Google's own data caps there, so the real total could be higher; never restate it as if that capped number were necessarily the exact real count.
   - That a website is "live" or "working" — REAL DATA CONTEXT's "Reachability on the last check" line is the only source for this; if it says UNREACHABLE or "not yet checked," never say or imply the site is live/working regardless of what else looks fine (a website existing on file and a website actually loading are two different facts).
   - That CUSTOMERS can't reach a website — never say or imply this unless REAL DATA CONTEXT's "Reachability on the last check" line is UNREACHABLE for the reason "no response at all" (the plain "the last check could NOT load this site at all" wording). If that same line instead says the check was BLOCKED (a bot-detection block, e.g. Cloudflare), got an ERROR response, or TIMED OUT, that is a fact about PostScore's own automated check, not about whether a real customer's browser can reach the site — say only that the automated check was blocked/got an error/timed out, that the site may be working completely fine for customers, and suggest the owner open it themselves to confirm. A TIMEOUT in particular is never evidence the site is down — it only means our own check ran out of time.
   - That a business has NO website — if REAL DATA CONTEXT's own "GOOGLE'S OWN LISTING didn't return a website" line is present (a SUSPECTED, single-scan gap), that only means Google's listing data gap, never that the website is gone, broken, or unreachable; the "Has a website on file" line right above it already proves the opposite. Say only that Google's own listing may need the website re-added, and suggest checking the Google Business Profile. If instead the context's "no website on file" line is accompanied by a "GOOGLE'S OWN LISTING no longer shows a website at all — CONFIRMED" line, that IS a real, confirmed gap in Google's own listing data (two separate checks agreeing) — still never claim the business has no real website anywhere online, only that its Google Business Profile's website field is currently empty and should be re-added if they still have a site.
   - Anything else about this business that simply isn't in the REAL DATA CONTEXT block.
4. If part of the REAL DATA CONTEXT is missing (e.g. no competitor scan has ever been saved), say so honestly and point to where the owner can get it (e.g. "run a scan on the Competitors page") rather than guessing or working around it.
5. BE BRIEF — SHORTER THAN FEELS NATURAL. A busy owner glancing at their phone, not an essay. No preamble ("Great question", "Looking at your data...", "Sure, here's..."), no restating the question, no repeating the context block back at them, no summarizing what you're about to say before saying it, no closing recap of what you just said. Lead with the single most useful sentence. HARD TARGET: under ~150 words, at most 4 bullets. Default target within that: 1-3 short sentences, or 3-4 terse bullets (a few words each, not full paragraphs) for a "top things to fix" style question — reach for more only when the question genuinely can't be answered honestly within ~150 words (e.g. it has several real caveats), and even then never exceed 4 bullets. Every sentence must add a new fact, number, or instruction; if a sentence only restates or transitions, cut it. Say each fact once. Prefer short, plain words over hedging phrases ("it seems like", "you might want to consider") — state it directly. Still include every real-data specific and caveat the question actually needs — cut words and framing, never substance.
6. You cannot take any action on their behalf (you can't edit their listing, send a review request, or change anything) — you only answer questions. If asked to do something, explain that and point to the right page in the dashboard instead.
7. BE A GUIDE TO POSTSCORE'S OWN TOOLS, NOT JUST GENERIC ADVICE. Whenever your advice is something PostScore itself has a real, built tool or page for, name that exact page/tab/section so the owner acts inside the app instead of guessing where to go or reaching for some outside tool. Use ONLY these real mappings — never invent a feature, page, or tab that isn't listed here:
   - A discount, promotion, or coupon → the coupon builder on the Growth page's Coupons tab.
   - A referral / "refer a friend" program → the Growth page's Refer a friend tab — but ONLY when the REAL DATA CONTEXT below doesn't say that tab is unavailable for this business. If it says the tab isn't available, never PROACTIVELY suggest or bring up a referral program — but if the owner directly ASKS about one, answer honestly using the real reason given in REAL DATA CONTEXT, same as any other grounded question. Never give any legal advice beyond what's stated there.
   - Building a weekly habit of keeping the Google listing active → the Growth page's "Your weekly routine" checklist.
   - "What should I do this week?" → the Growth page's "This week's plan"; longer-term or bigger work → "Bigger projects" on the same page.
   - Getting more/fresh reviews → the shareable review link and front-desk QR code sign on the Reviews page.
   - Pricing strategy, or how their prices compare → the Pricing page.
   - How they stack up against nearby competitors → the Competitors page (run or re-run a scan there for real data).
   - No website at all → the Website page's starter-site generator.
   - An EXISTING website that's losing points → the Website page's own score breakdown — never the starter-site generator, which is only for a business with no website at all.
   - Adding photos → the photo itself is added directly on their Google listing, not inside PostScore; the Overview page's "Photos" check — under "Where your points are" — is where PostScore shows the real gap and the "How to fix it" steps for doing it.
   - Individual reviews, reply drafts, reply-rate stats, Insights, a leads estimate, or Google Posts tracking → NONE of these are live yet, connected or not — they're all a later update (see the real "Google Business Profile connection" line below for the exact wording). If not yet connected, connecting it (the "Connect to unlock" prompt on the Reviews page, or the Overview page's "Your live Google listing" section) is still the real first step toward them eventually — but never say connecting itself "unlocks" any of these; say plainly none of them are available yet.
   - Getting a review link/QR code to share — never requires connecting Google Business Profile; it already works today regardless (see rule 7's reviews bullet above).
   Still answer the real question first — the pointer is the closing sentence, not a substitute for genuine guidance. Don't force a pointer into an answer it doesn't fit; only add one when it's genuinely the next concrete step.
7b. HOW POSTSCORE'S TOOLS ACTUALLY WORK. This is read directly from the real UI/action code, not a guess — never describe any of these four tools doing anything beyond what's stated here:
   - Coupon builder (Growth page's Coupons tab; app/business/[id]/growth/CouponBuilder.tsx, lib/coupons.ts, lib/couponImage.ts, app/actions/promos.ts): generates a downloadable coupon image (offer text, a short code, a QR code) from fixed, business-type-specific preset templates — never an AI-generated or adaptive suggestion. Saving it creates a tracked row, but the QR code's link has no working redeem page behind it — it's just a tidier way to hand the code to a customer, nothing more. The redemption count only ever goes up when the owner or staff manually taps "+1 Redeemed" — there is no POS, booking, or automatic detection of any redemption.
   - Referral builder (Growth page's Refer a friend tab; app/business/[id]/growth/ReferralBuilder.tsx, lib/referrals.ts, lib/referralImage.ts, app/actions/referrals.ts): generates a downloadable card with a code and two reward amounts (one for the referrer, one for the friend) from fixed per-business-type presets — never AI-generated. There is no trackable link or QR code for referrals at all; the friend is simply told to mention the code in person on their first visit. PostScore has zero visibility into real bookings — the referral count only changes when the owner or staff manually taps "+1 Redeemed."
   - Reviews page link + QR sign (app/business/[id]/website-reviews/GetMoreReviews.tsx, lib/reviews.ts, lib/reviewSignImage.ts): gives the owner Google's own real "write a review" link for their listing, plus a printable QR code of that same link. PostScore has no analytics here at all — it never knows whether the link or QR was ever used, scanned, or led to a review.
   - Price check (Pricing page; app/actions/pricing.ts, lib/pricing.ts): on an explicit click, assesses each owner-entered service against real nearby competitor price-LEVEL data ($/$$/$$$, never an exact price) and labels each result as grounded in real local data or a general estimate.
   If you're unsure whether a tool does something beyond this list, say only what the owner will see on that page (a form, a download, a tally they update by hand) and nothing more — never "automatically," never a tracked link, never an AI suggestion, unless this section says so.
7c. REAL OFFER PRESETS, NAMED HONESTLY. REAL DATA CONTEXT's "REAL OFFER PRESETS" section lists this business type's actual, built-in coupon and (when available) referral quick picks — the exact options the real Coupons/Refer a friend builders show. When you name a specific PostScore built-in option, it MUST be one of these exact presets — never invent a preset that isn't listed there. Any OTHER coupon/promo/referral idea you suggest (a different discount, a different angle) is your own general guidance and MUST follow rule 2's "General guidance:" labeling — never presented as if PostScore built it.
8. WEEKLY ROUTINE: EXACTLY WHAT YOU CAN SEE. The weekly-routine items in REAL DATA CONTEXT are the owner's own checkmarks, not something PostScore can verify — describe each one only as "you've checked off X this week" or "you haven't checked off X this week." Never say or imply the owner actually posted an update, replied to a review, or added a photo — or that they didn't — you only ever know whether they logged it, never whether they really did it. NEVER use phrasing that asserts an ongoing habit or claims credit for action beyond this week's checkbox — forbidden phrasings include "you're already replying," "you've been posting," "you're staying on top of," or any similar continuous/habitual claim.
9. GROWTH MOVES: CHECK EACH ONE'S OWN "SCORE IMPACT" LINE — NEVER GENERALIZE. Every growth move in REAL DATA CONTEXT now carries its own real, precomputed "Score impact" line: YES (it currently also costs real points — overlaps a real losing check or action-plan task) or NO (customers only, no effect on PostScore either way). NEVER state a blanket claim like "none of these change your score" or "these don't affect your score" covering multiple growth moves at once — check EVERY move you mention individually against its own real "Score impact" line; if even one of them says YES, that blanket claim is false for the whole list. When a move's line says YES, quote the real points from its matching losing-check/action-plan entry — never deny or omit them just because the same fix is also framed as a growth move. The coupon/referral facts there describe PostScore specifically (e.g. "no coupon created in PostScore yet") — never say the owner "doesn't run promotions" or "has no referral program": they may run either outside PostScore, which you have no way to see.
10. VARIETY, WITHIN THIS CONVERSATION ONLY. You only ever see this one conversation, never any other — don't imply you remember a past chat, and never say anything like "last time we talked." Within THIS conversation, don't repeat a recommendation you've already given — if asked again, build on what you already said or offer a different real option from REAL DATA CONTEXT instead of restating the same one. When the owner asks broadly how to grow or get more customers, draw from the growth moves and weekly routine as well as the action plan, not reviews by default — include at most one review-related suggestion unless they specifically asked about reviews. If REAL DATA CONTEXT genuinely has no different real option left to offer, say so honestly — e.g. "that's everything real I've got for you right now" — rather than inventing a new one or just repeating what you already said.
11. QUOTE EXACTLY, NEVER CALCULATE OR EMBELLISH. Every point value, count, date, and data label in REAL DATA CONTEXT is already exact and already computed — use those numbers and words VERBATIM, never recompute or round them yourself, and never rephrase a neutral label into a stronger or weaker claim (REAL DATA CONTEXT's "average" must stay "average" — never "slower than average," "below average," or "poor" unless REAL DATA CONTEXT itself says so). Every losing check already states how many points it's missing ("losing N pts") — never subtract earned from max yourself, and never state a total that doesn't match the real numbers given. When listing items (weekly routine items, action-plan tasks, growth moves), count and list exactly what REAL DATA CONTEXT gives — never more, never fewer, never merged or skipped. The weekly routine specifically has exactly five possible items (posting an update, replying to reviews, sharing the review link, adding a photo, checking hours) — a coupon, a referral, a price check, or any other growth move is NEVER part of the weekly routine, even when you'd recommend doing it the same week; never say or imply anything else is "on," "part of," or "included in" the weekly routine.
12. RATING MATH: ONLY A HIGHER-THAN-CURRENT-AVERAGE REVIEW RAISES THE AVERAGE. A new review only pulls the average rating UP if that review's own star count is higher than the CURRENT average in REAL DATA CONTEXT — a review at or below the current average holds it flat or pulls it down, never up. Before saying something like "more good reviews will raise your average" or "reviews at N stars will lift that," check REAL DATA CONTEXT's real current average: if it's already at or above N, that claim is false — say instead that only reviews above the current average would raise it (and name the real current average).
`.trim();

// ---------------------------------------------------------------------------
// Context → prompt text
// ---------------------------------------------------------------------------

function formatEffort(effort: TaskEffort): string {
  return effort.replace(/_/g, " ");
}

/**
 * Renders a points value the same way the UI does (see formatPoints in
 * components/scoring/CategoryCard.tsx, intentionally duplicated here
 * rather than imported — that file is a .tsx component module, and
 * this one is shared by server actions and the preview script, neither
 * of which should pull in React/JSX). A whole number prints bare; any
 * other value rounds to exactly one decimal.
 *
 * This matters because several REAL DATA CONTEXT points values (every
 * category's earnedPoints/possiblePoints, in particular) are plain
 * floating-point sums of several already-rounded check values — summing
 * e.g. several numbers already rounded to one decimal can still produce
 * a result like 14.399999999999999 from ordinary binary floating-point
 * error. Rounding here, at render time, fixes how the number reads in
 * the prompt without touching the real breakdown math anywhere else.
 */
function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * The real website.performance_mobile check's explanation ends in a bare
 * "fast"/"average"/"slow" (or rápido/promedio/lento) — Google's own
 * CrUX real-visitor classification (see RATING_CURVE in lib/scoring.ts).
 * "average" reads, in isolation, as a vague synonym for "not great" —
 * the live check (scripts/live-check-postai.ts) found the model
 * paraphrasing it as "slower than average" or "averaging slow load
 * times," which isn't what the real data says. This spells out, ONLY in
 * the context sent to the model (never in the real check explanation
 * shown elsewhere in the app), which of Google's three real bands this
 * is and isn't, so there's no room left to misread it.
 */
const MOBILE_SPEED_CLARIFICATIONS: Record<string, Record<string, string>> = {
  en: {
    fast: "FAST (the best of Google's three real-visitor bands: fast / average / slow)",
    average: "AVERAGE (the middle of Google's three real-visitor bands: fast / average / slow — NOT slow)",
    slow: "SLOW (the worst of Google's three real-visitor bands: fast / average / slow)",
  },
  es: {
    rápido: "RÁPIDO (la mejor de las tres franjas reales de Google: rápido / promedio / lento)",
    promedio: "PROMEDIO (la franja intermedia de las tres franjas reales de Google: rápido / promedio / lento — NO lento)",
    lento: "LENTO (la peor de las tres franjas reales de Google: rápido / promedio / lento)",
  },
};

function clarifyCheckExplanation(checkId: string, explanation: string, locale: Locale): string {
  if (checkId !== "website.performance_mobile") return explanation;
  const clarifications = MOBILE_SPEED_CLARIFICATIONS[locale] ?? MOBILE_SPEED_CLARIFICATIONS.en;
  for (const [word, clarified] of Object.entries(clarifications)) {
    const pattern = new RegExp(`\\b${word}\\.$`, "i");
    if (pattern.test(explanation)) {
      return explanation.replace(pattern, `${clarified}.`);
    }
  }
  return explanation;
}

/**
 * Spells out plainly whether the website was actually reachable on the
 * last real check — "unreachable" read in isolation (the bare
 * HttpsCheckStatus value) wasn't stopping the model from still calling
 * the site "live"/"working" (the real Blue Bottle Coffee case this was
 * fixed for). Never touches the real https_status value itself, only
 * how it's explained here in the context.
 *
 * When unreachable, `reason` (Day 4 Part 3c) decides exactly how strong
 * a claim is honest: "down" (no response at all) is the ONLY reason
 * that justifies implying customers might not reach the site either —
 * "blocked_automated_check" means PostScore's own automated check was
 * blocked, which says nothing about whether a real customer's browser
 * would be too, and "http_error" means the site returned a real error
 * to OUR specific check, not a confirmed outage for every visitor.
 * `reason === null` covers a legacy row saved before this field
 * existed — stays exactly as cautious as the original, reason-less
 * wording always was.
 */
function websiteReachabilityText(httpsStatus: HttpsCheckStatus | null, reason: ReachabilityFailureReason | null): string {
  switch (httpsStatus) {
    case "https":
      return "https (the last check reached this site successfully)";
    case "http_only":
      return "http_only (the last check reached this site, but not over HTTPS)";
    case "unreachable":
      if (reason === "blocked_automated_check") {
        return 'BLOCKED, not confirmed down — the last check was blocked by this site\'s own automated-traffic protection (e.g. Cloudflare), not proof the site is actually offline. The site may be working completely fine for a real customer\'s browser. NEVER say customers can\'t reach this site or that it\'s down — say only that PostScore\'s own automated check was blocked, and that the owner should open the site themselves to confirm it\'s working.';
      }
      if (reason === "http_error") {
        return 'returned an ERROR on the last check (not a confirmed outage) — the site responded, but with a real error, to this one specific automated check. NEVER say customers can\'t reach this site based on this alone; say only that the last automated check got an error response.';
      }
      if (reason === "timed_out") {
        return 'TIMED OUT, not confirmed down — the last check simply ran out of time waiting for a response; that is NOT evidence the site is offline, since a real customer\'s browser can easily succeed where our own check gave up. NEVER say or imply the site is down or that customers can\'t reach it — say only that PostScore\'s own check couldn\'t complete in time, and that the owner should open the site themselves to confirm it\'s working.';
      }
      // reason === "down" or null (legacy row, no reason recorded) —
      // the one case where "the site itself seems down" is an honest
      // reading of the real data.
      return 'UNREACHABLE — the last check could NOT load this site at all (no response). Never call this website "live" or "working" unless a LATER check succeeds; say plainly it could not be reached last time.';
    case null:
      return 'not yet checked — whether this site is currently reachable is unknown. Never assume or say it\'s "live" or "working."';
  }
}

/**
 * Where in PostScore a growth move is actually done, named the way the
 * owner's own screen names it — the real localized nav label, and the
 * real localized tab label where the move targets a specific tab.
 * Deliberately NOT derived from GrowthMove.href: a raw URL (with a
 * business id in it) is useless to an owner being told where to go, and
 * the model should never read an id out of the context block, let alone
 * repeat one back. Every label here comes from a message key the real
 * UI already renders, so this can never name a page that doesn't exist
 * or drift from what the sidebar/tab strip actually says.
 */
/**
 * Where each real weekly-routine habit is ACTUALLY done — four of the
 * five happen directly on the owner's real Google Business Profile,
 * outside PostScore entirely (see lib/weeklyChecklist.ts's real howTo
 * text for each item); only "Share your review link" is something
 * PostScore itself provides (the Reviews page's real shareable link/QR
 * code). Spelled out explicitly so the model never conflates, say,
 * "Post an update or offer" with building a PostScore coupon — those
 * are two entirely different things done in two entirely different
 * places.
 */
function weeklyRoutineDoneOn(id: WeeklyChecklistItemId): string {
  switch (id) {
    case "post_update":
      return "Done directly on the owner's real Google Business Profile (Google itself, e.g. business.google.com) — NOT inside PostScore, and NOT the same thing as a PostScore coupon/promo.";
    case "reply_reviews":
      return "Done directly on Google (via the owner's real Google Business Profile) — not inside PostScore.";
    case "share_review_link":
      return "Done using PostScore's own real shareable review link/QR code sign, on the Reviews page.";
    case "add_photo":
      return "Done directly on the owner's real Google Business Profile (uploading a photo on Google itself) — not inside PostScore.";
    case "check_hours":
      return "Done directly on the owner's real Google Business Profile (Google itself) — not inside PostScore.";
  }
}

export function growthMoveDestination(id: GrowthMoveId, locale: Locale): string {
  const page = (key: Parameters<typeof t>[1]) => `"${t(locale, key)}"`;
  switch (id) {
    case "start_coupon":
      return `${page("dashboard.nav.growth")} page, ${page("dashboard.growth.view.tabCoupons")} tab`;
    case "start_referral":
      return `${page("dashboard.nav.growth")} page, ${page("dashboard.growth.view.tabReferral")} tab`;
    case "run_price_check":
      return `${page("dashboard.nav.pricing")} page`;
    case "add_photos_vs_competitors":
      // Photos are added on Google itself, not in PostScore — the move
      // links to Overview, where the real step-by-step instructions
      // already live (see buildGrowthMoves's own comment).
      return `${page("dashboard.nav.overview")} page`;
    case "build_starter_site":
    case "improve_website":
      return `${page("dashboard.nav.website")} page`;
  }
}

/**
 * The real fact that made a move fire, stated the way it could safely be
 * repeated to the owner — never GrowthMove.signal, which is deliberately
 * debug text (column names, raw ISO timestamps, "row") meant for tests
 * and tracing, not for a model that may quote it verbatim.
 *
 * The coupon/referral wordings are carefully scoped to what PostScore can
 * actually observe: that nothing has been created HERE. PostScore has no
 * way to know whether the owner runs offers or referrals through some
 * other channel, so claiming they don't would be a fabrication of exactly
 * the kind rule 3 forbids.
 */
/**
 * Whether this move's real-world fix ALSO currently costs this business
 * real PostScore points — computed from the real losing checks, never
 * left for the model to infer (see rule 9's "quote the data, don't
 * generalize" requirement). build_starter_site, start_coupon,
 * start_referral, and run_price_check never overlap score by
 * construction (none of them correspond to any real scoring check).
 * improve_website only ever fires when weakWebsiteIssueLabels is
 * non-empty (see buildGrowthMoves in lib/growthMoves.ts), i.e. those
 * exact website checks are already currently losing points, so it
 * always overlaps. add_photos_vs_competitors is the one genuinely
 * conditional case: it fires purely from a competitor-photo-count
 * comparison, independent of whether the real completeness.photos
 * scoring check happens to be losing points too — so it's checked
 * directly against the real losing-checks list.
 */
/**
 * Exported (and kept duck-typed on `losingChecks` — just needs a real
 * `checkId` per entry) so other real callers can reuse this exact same
 * decision without re-deriving it — see buildFocus in
 * lib/monthlyReport.ts, which calls this with the real
 * generateSuggestions() output (Suggestion[], which also has a real
 * `checkId` field) rather than PostAI's own AssistantLosingCheck[].
 */
export function growthMoveOverlapsScore(moveId: GrowthMoveId, losingChecks: Array<{ checkId: string }>): boolean {
  switch (moveId) {
    case "improve_website":
      return true;
    case "add_photos_vs_competitors":
      return losingChecks.some((c) => c.checkId === "completeness.photos");
    case "build_starter_site":
    case "start_coupon":
    case "start_referral":
    case "run_price_check":
      return false;
  }
}

function growthMoveOwnerFact(move: AssistantGrowthMove, locale: Locale): string {
  switch (move.id) {
    case "start_coupon":
      return "No coupon has been created in PostScore yet. PostScore can't see offers run anywhere else, so don't tell the owner they aren't running any promotions — only that they haven't built one here.";
    case "start_referral":
      return "No referral program has been set up in PostScore yet. Same caveat as coupons: PostScore can't see a referral scheme run anywhere else.";
    case "run_price_check":
      return move.pricingAssessedAt === null
        ? "A price check has never been run in PostScore."
        : `The last price check in PostScore was run on ${formatShortDate(move.pricingAssessedAt, locale)}.`;
    case "add_photos_vs_competitors":
      return `This listing has ${move.yourPhotoCount ?? 0} photo(s) on Google; the median among the competitors in the last saved scan is ${move.competitorMedianPhotoCount ?? 0}.`;
    case "improve_website":
      return `These website checks are currently below full points: ${move.weakWebsiteIssueLabels.join(", ")}.`;
    case "build_starter_site":
      return "There's no website on file for this business.";
  }
}

/**
 * Renders a context object into the compact block appended after
 * ASSISTANT_SYSTEM_RULES and sent as part of the system prompt on every
 * message — short and structured on purpose to keep input tokens (and so
 * cost) low even though it's resent on every turn of a conversation.
 *
 * `locale` only matters for the one field this function resolves itself
 * (the losing-checks category name via CATEGORY_LABELS below) — every
 * other piece of text in `context` (check labels/explanations, category
 * names in the breakdown, action-plan copy) was already resolved in the
 * caller's own locale when `context` was built (see loadContext() in
 * app/actions/assistant.ts).
 */
export function buildAssistantContextText(context: AssistantBusinessContext, locale: Locale = DEFAULT_LOCALE): string {
  const lines: string[] = [];
  lines.push("=== REAL DATA CONTEXT ===");
  lines.push(`Business: ${context.listing.name ?? "Unnamed business"} (${context.listing.categoryLabel})`);
  lines.push(`PostScore: ${formatPoints(context.score.total)}/100 (Grade ${context.score.grade})`);

  lines.push("");
  lines.push("=== WHAT WE KNOW ABOUT THIS BUSINESS (persisted memory, carries across sessions) ===");
  lines.push(
    !context.profile.businessTypeOverridden
      ? `Business type: ${context.profile.businessType} (auto-detected from Google's category). Location: ${context.profile.location ?? "not on file"}.`
      : context.profile.businessTypeId === context.profile.autoDetectedBusinessTypeId
        ? // The owner's own real override happens to land on the exact
          // same profile Google's own data (now, with the improved
          // detection — see Fix D in config/bizProfiles.ts) would also
          // suggest. Saying "owner-corrected from Google's auto-detected
          // X" here would be literally true but read as if the owner
          // fixed a mistake that no longer exists — never claim a real
          // override is "just" auto-detection, but don't invent a
          // disagreement that isn't real either.
          `Business type: ${context.profile.businessType} (set by the owner; matches Google's category). Location: ${context.profile.location ?? "not on file"}.`
        : `Business type: ${context.profile.businessType} (owner-corrected from Google's auto-detected "${context.profile.autoDetectedBusinessType}"). Location: ${context.profile.location ?? "not on file"}.`
  );
  if (!context.profile.referralOk) {
    lines.push(
      "The Growth page's \"Refer a friend\" tab is not offered for this business type: referral-fee arrangements are restricted for attorneys under most states' rules of professional conduct. Never PROACTIVELY suggest or bring up a referral program for this business. If the owner directly asks about setting one up, answer honestly — say plainly that PostScore doesn't offer this tool for law firms for that reason, and suggest they check their own state bar's rules before running any referral program. Give no other legal advice beyond that. This restriction applies to referral-style incentives in ANY form, not just the Refer a friend tab — never suggest a referral reward, a referral credit, or any \"refer a friend\" discount as part of a coupon or promo idea either; if asked for coupon ideas, offer only non-referral promotions (e.g. a first-visit discount, a seasonal offer). MORE BROADLY: never state or imply that ANY marketing tactic — a coupon, a promo, an ad, or anything else — is unrestricted or definitively allowed for this business. Attorney advertising and solicitation rules vary significantly by state bar, and PostScore has no way to know this business's specific state rules beyond the one referral-fee restriction stated above. If the owner asks whether some tactic is allowed, say honestly that attorney advertising rules vary by state bar and they should check their own state bar's rules first — never say a tactic has \"no restrictions\" or is simply \"fine to do.\""
    );
  }
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
    const trend = context.profile.scoreHistory
      .map((h) => `${h.date}: ${formatPoints(h.total)} (${h.grade})`)
      .join(" -> ");
    lines.push(`Score history (oldest to newest, real saved scans): ${trend}.`);
    lines.push("Score history is totals only — no reason for any change between scans is recorded.");
  } else if (context.profile.scoreHistory.length === 1) {
    const only = context.profile.scoreHistory[0];
    lines.push(`Score history: only one saved score so far — ${only.date}: ${formatPoints(only.total)} (${only.grade}). No trend to compare yet.`);
  } else {
    lines.push("Score history: no saved scans yet.");
  }
  if (context.profile.fixedItems.length > 0) {
    lines.push("Confirmed fixed (a later re-scan actually verified these, newest first):");
    for (const f of context.profile.fixedItems) {
      lines.push(`- ${f.label} (+${formatPoints(f.pointsGained)} pts, confirmed ${f.verifiedAt ?? "on an earlier date"})`);
    }
  } else {
    lines.push("Confirmed fixed: nothing confirmed fixed yet.");
  }
  lines.push("");

  lines.push("Category breakdown:");
  for (const c of context.score.categories) {
    const relative = c.relativeScore !== null ? `${Math.round(c.relativeScore)}/100` : "not enough data to score";
    lines.push(`- ${c.label}: ${relative} (${formatPoints(c.earnedPoints)}/${formatPoints(c.possiblePoints)} pts earned in this category)`);
  }

  if (context.score.losingChecks.length > 0) {
    lines.push("Checks currently losing points (biggest opportunity first; \"losing N\" is precomputed — never recompute it yourself):");
    for (const c of context.score.losingChecks) {
      const earned = c.earnedPoints ?? 0;
      const missing = c.maxPoints - earned;
      const explanation = clarifyCheckExplanation(c.checkId, c.explanation, locale);
      lines.push(
        `- [${t(locale, CATEGORY_LABELS[c.category])}] ${c.label}: ${formatPoints(earned)}/${formatPoints(c.maxPoints)} pts — losing ${formatPoints(missing)} — ${explanation}`
      );
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
      lines.push(`- ${t.label} (+${formatPoints(t.promisedPoints)} pts, ${formatEffort(t.effort)}): ${t.action}`);
    }
  }

  lines.push("GROWTH MOVES (ways to bring in customers — each one's own \"Score impact\" line below says whether it ALSO affects PostScore; never generalize across all of them):");
  lines.push(
    "Each move below is backed by a real fact about activity inside PostScore only — never about what the owner does outside it. Page and tab names are exactly what the owner sees on their own screen; use those names when pointing them somewhere."
  );
  if (context.growthMoves.length === 0) {
    lines.push("- No growth moves are currently firing for this business.");
  } else {
    for (const m of context.growthMoves) {
      const overlaps = growthMoveOverlapsScore(m.id, context.score.losingChecks);
      lines.push(
        `- ${m.title}: ${m.why} Where in PostScore: ${growthMoveDestination(m.id, locale)}. Why it's showing: ${growthMoveOwnerFact(m, locale)} Score impact: ${
          overlaps
            ? "YES, this one ALSO currently costs real points — see the matching entry in \"Checks currently losing points\" or the action plan above for the exact numbers."
            : "NO — this is a customer-getting move only; it does not affect this business's PostScore either way."
        }`
      );
    }
  }

  lines.push(
    "REAL OFFER PRESETS (this business type's own built-in quick picks — name ONLY these when describing a PostScore built-in option; any other idea is YOUR general guidance, not a PostScore feature):"
  );
  lines.push("- Coupon quick picks (Growth page's Coupons tab):");
  for (const preset of context.profile.couponPresets) {
    lines.push(`  - "${preset.label}" — ${preset.description}`);
  }
  if (context.profile.referralOk) {
    lines.push("- Referral quick picks (Growth page's Refer a friend tab):");
    for (const preset of context.profile.referralPresets) {
      lines.push(`  - Referrer gets "${preset.referrerReward}", friend gets "${preset.friendReward}" — ${preset.description}`);
    }
  }

  lines.push(
    `WEEKLY ROUTINE (owner self-reported, resets Mondays — exactly ${context.weeklyRoutine.items.length} items, logged on the Growth page under "Your weekly routine" — this is a DIFFERENT section from "This week's plan," which is the score-based action plan above):`
  );
  lines.push(
    "These are the owner's own checkmarks only — PostScore cannot see whether they actually posted an update, replied to a review, or added a photo. An item marked \"not checked off\" means the owner hasn't logged it yet this week, NOT that they haven't really done it — never say or imply the owner failed to do something just because it isn't checked off."
  );
  for (const item of context.weeklyRoutine.items) {
    lines.push(
      `- ${item.title}: ${item.checkedThisWeek ? "checked off this week" : "not checked off this week"}. ${weeklyRoutineDoneOn(item.id)}`
    );
  }
  lines.push(
    context.weeklyRoutine.streakWeeks > 0
      ? `Streak: ${context.weeklyRoutine.streakWeeks} consecutive past week(s) fully checked off.`
      : "No current streak."
  );

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
      ? `- Has a website on file. Reachability on the last check: ${websiteReachabilityText(context.listing.httpsStatus, context.listing.httpsUnreachableReason)}.`
      : "- No website on file."
  );
  if (context.listing.googleListingMissingWebsiteSince) {
    lines.push(
      "- GOOGLE'S OWN LISTING didn't return a website on our last check, even though a website is still on file above (kept from the last time Google DID return one — a single empty response is never trusted). This is a fact about Google's listing data, NOT about whether the site itself is reachable or working. NEVER say or imply this business has no website; say only that Google's own listing may need the website re-added, and suggest the owner check their Google Business Profile."
    );
  } else if (context.listing.googleListingWebsiteRemovedSince) {
    const lastKnown = context.listing.googleListingLastKnownWebsiteAt;
    lines.push(
      lastKnown
        ? `- GOOGLE'S OWN LISTING no longer shows a website at all — CONFIRMED on two separate real checks (it last showed one around ${formatShortDate(lastKnown, locale)}). This IS a confirmed gap in Google's own listing data, scored accordingly. Still never assume the business itself has no real website anywhere — say only that Google's Business Profile's website field is currently empty, and suggest the owner re-add it there if they still have a site.`
        : "- GOOGLE'S OWN LISTING no longer shows a website at all — CONFIRMED on two separate real checks. We don't have a reliable record of when it last showed one, so never guess or state a date. This IS a confirmed gap in Google's own listing data, scored accordingly. Still never assume the business itself has no real website anywhere — say only that Google's Business Profile's website field is currently empty, and suggest the owner re-add it there if they still have a site."
    );
  }
  const photoCountText =
    context.listing.photoCount === null
      ? "not returned by Google"
      : context.listing.photoCount >= PHOTO_COMPARISON_CAP
        ? `${PHOTO_COMPARISON_CAP} or more — Google's own data only shares up to ${PHOTO_COMPARISON_CAP} photos per listing in this field, so this is a lower bound, not an exact count`
        : String(context.listing.photoCount);
  lines.push(
    `- Photos on listing: ${photoCountText}. Business status: ${context.listing.businessStatus ?? "not returned by Google"}.`
  );

  lines.push(
    context.gbp.connected
      ? "Google Business Profile connection: connected — but connecting only stores the real OAuth token today; it does NOT itself unlock anything yet. Individual reviews, reply drafts, reply-rate stats, Insights (views/calls/clicks), a leads estimate, and Google Posts tracking are ALL still not built/synced (a later update) — this is true connected or not, so never say connecting \"unlocks\" any of these. The shareable review link and QR code sign on the Reviews page already work right now and never required this connection at all."
      : "Google Business Profile connection: not connected. Connecting it (Reviews page or Overview page's connect prompt) only stores a real OAuth token — it does NOT itself unlock individual reviews, reply drafts, reply-rate stats, Insights (views/calls/clicks), a leads estimate, or Google Posts tracking; none of those are built/synced yet, connected or not (a later update). The shareable review link and QR code sign on the Reviews page already work right now with no connection needed at all."
  );

  return lines.join("\n");
}

/**
 * The system-prompt suffix telling the model which language to answer
 * in — and, for Spanish, to use the formal "usted" register — appended
 * after ASSISTANT_SYSTEM_RULES + buildAssistantContextText() on every
 * real call. Empty for the default locale, since ASSISTANT_SYSTEM_RULES
 * is itself already written in English. Named in English on purpose
 * (t(DEFAULT_LOCALE, ...), not t(locale, ...)) — this is a model
 * instruction, same as ASSISTANT_SYSTEM_RULES, never owner-facing UI.
 *
 * The second sentence exists because ASSISTANT_SYSTEM_RULES (rule 7)
 * and buildAssistantContextText() both hardcode English PostScore page/
 * tab/section names ("Reviews page", "Growth page's Coupons tab", etc.)
 * as part of the model's real tool-mapping instructions — those names
 * are never re-localized in the prompt itself. Rather than hardcoding a
 * second English->locale name table here (which could drift from the
 * actual localized nav labels in lib/i18n/messages.ts), the model is
 * told to translate any such name it cites into the owner's own
 * language — it already reliably does this given an explicit
 * instruction.
 */
export function buildAssistantLanguageDirective(locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return "";
  const languageName = t(DEFAULT_LOCALE, `language.${locale}`);
  // "usted" vs. "tú" is a Spanish-specific formality distinction with no
  // English equivalent, so it's gated to es specifically rather than
  // folded into the generic (any-locale) sentence above it.
  const formalityDirective =
    locale === "es"
      ? ` Use the formal "usted" form throughout your answer — never "tú" or its conjugations. Also: "puntuación" means ONLY the PostScore score (the 0-100 total/grade) — "calificación" means ONLY the Google star rating. Never swap these two terms or use one where the other is meant. Rule 2's "General guidance:" marker becomes exactly "Consejo general:" in Spanish (that exact capitalization, spacing, and colon) — use THAT Spanish text to start a labeled general-guidance paragraph, never the English "General guidance:" and never a different wording. And write entirely in real, natural Spanish throughout your whole answer — never leave an English word in place (e.g. never "built-in"; say "integradas" or "propias de PostScore" instead) — if you're unsure of a Spanish term, choose a plain, natural Spanish phrase rather than an English one.`
      : "";
  return `\n\nIMPORTANT: Respond in ${languageName}. Always write your entire answer in ${languageName}, even if the owner writes in English or the data above contains English. This also applies to any PostScore page, tab, section, or button name you mention to point the owner somewhere in the app (e.g. "Reviews page", "Growth page", "Competitors page") — those names appear in English above, but the owner's own PostScore app is displayed in ${languageName}, so translate every such name into ${languageName} too. Never cite a page, tab, section, or button name in English.${formalityDirective}`;
}

/**
 * The exact, complete system prompt sent on every real call — rules,
 * then the real-data context block, then the language directive — all
 * built through this one function so every caller (the real
 * sendAssistantMessage action, scripts/live-check-postai.ts) sends a
 * byte-for-byte identical system prompt for the same context/locale,
 * never a hand-retyped copy that could quietly drift from it.
 */
export function buildAssistantSystemPrompt(context: AssistantBusinessContext, locale: Locale = DEFAULT_LOCALE): string {
  return `${ASSISTANT_SYSTEM_RULES}\n\n${buildAssistantContextText(context, locale)}${buildAssistantLanguageDirective(locale)}`;
}

// ---------------------------------------------------------------------------
// Starter prompts — clickable examples tailored to this business's real data
// ---------------------------------------------------------------------------

type StarterPromptKind = "score" | "review" | "growth" | "routine" | "history" | "competitors";

interface StarterPromptCandidate {
  id: string;
  text: string;
  kinds: StarterPromptKind[];
}

/** One prompt per real, currently-firing growth move (lib/growthMoves.ts)
 * — null for start_referral when `referralOk` is false, a defensive
 * second check alongside buildGrowthMoves' own referralOk gate so this
 * business type can never surface a referral question through either
 * path. */
function growthMovePromptCandidate(
  move: AssistantGrowthMove,
  locale: Locale,
  referralOk: boolean
): StarterPromptCandidate | null {
  switch (move.id) {
    case "start_coupon":
      return { id: "coupon", text: t(locale, "dashboard.assistant.starterPrompts.coupon"), kinds: ["growth"] };
    case "start_referral":
      return referralOk
        ? { id: "referral", text: t(locale, "dashboard.assistant.starterPrompts.referral"), kinds: ["growth"] }
        : null;
    case "run_price_check":
      return {
        id: "priceCheck",
        text: t(
          locale,
          move.pricingAssessedAt === null
            ? "dashboard.assistant.starterPrompts.priceCheckNeverRun"
            : "dashboard.assistant.starterPrompts.priceCheckRecheck"
        ),
        kinds: ["growth"],
      };
    case "improve_website":
      return { id: "improveWebsite", text: t(locale, "dashboard.assistant.starterPrompts.improveWebsite"), kinds: ["growth"] };
    case "build_starter_site":
      return { id: "needWebsite", text: t(locale, "dashboard.assistant.starterPrompts.needWebsite"), kinds: ["growth"] };
    case "add_photos_vs_competitors":
      return { id: "addPhotos", text: t(locale, "dashboard.assistant.starterPrompts.addPhotos"), kinds: ["growth"] };
  }
}

/**
 * Every real, currently-eligible starter prompt for this business, each
 * tied to one genuine signal in `context` — never a question invented
 * just to fill a slot. `now` is explicit (never read from the ambient
 * clock), same pattern as buildWeeklyChecklistState in
 * lib/weeklyChecklist.ts, so the real caller (app/actions/assistant.ts,
 * always "today") and scripts/tests can both ask for a specific week's
 * ordering — e.g. "this week" vs. "next week."
 *
 * The surfaces that render this (AssistantLauncher, AssistantView's chat
 * footer) only ever show the first 3 as clickable buttons via a blind
 * `.slice(0, 3)` — only the empty-state screen shows the full list. So
 * the first up-to-3 entries are chosen to be different KINDS: at most
 * one score question, at most one review question (the review signal
 * itself picks whichever of review count/rating is losing more, and
 * folds "why is my {category}…" in as review-related whenever that
 * category is Visibility & Reputation, so the two can never double up),
 * and at least one growth-move-or-routine prompt whenever any is
 * eligible. Which eligible prompts land in those first 3 rotates
 * deterministically by the real calendar week (the business's own
 * Monday, via weekStartFor) so the same 3 don't go stale forever, but
 * stay identical for every call within the same week.
 *
 * When fewer than 3 real, kind-distinct prompts exist, the result is
 * simply shorter than 3 — never padded with a signal-less question, and
 * the (same-kind) leftovers are dropped entirely rather than appended,
 * since a caller's blind `.slice(0, 3)` would otherwise mistake one of
 * them for part of the diverse first-3 set. Once a genuine 3-deep,
 * kind-distinct set exists, every other real candidate (extra growth
 * moves, routine prompts, history, competitors) is still appended after
 * it, so the empty-state's full list stays as rich as the real data
 * allows.
 *
 * Genuinely dual-purpose text: each string is rendered as a clickable
 * button label AND, if clicked, sent to the model verbatim as the
 * owner's own message — resolved through `t()` exactly ONCE here, so
 * the button and the sent message can never drift apart into two
 * different languages.
 */
export function buildAssistantStarterPrompts(
  context: AssistantBusinessContext,
  locale: Locale = DEFAULT_LOCALE,
  now: Date = new Date()
): string[] {
  const candidates: StarterPromptCandidate[] = [];

  if (context.score.losingChecks.length > 0) {
    candidates.push({
      id: "whatsHurtingScore",
      text: t(locale, "dashboard.assistant.starterPrompts.whatsHurtingScore"),
      kinds: ["score"],
    });
  }
  if (context.actionPlan.topTasks.length > 0) {
    candidates.push({
      id: "top3ThisWeek",
      text: t(locale, "dashboard.assistant.starterPrompts.top3ThisWeek"),
      kinds: ["score"],
    });
  }

  // Whichever of review count/rating is losing MORE points decides the
  // one dedicated review prompt (never both) — see AT MOST ONE REVIEW
  // PROMPT above.
  const reviewCountCheck = context.score.losingChecks.find((c) => c.checkId === "visibility.review_count");
  const ratingCheck = context.score.losingChecks.find((c) => c.checkId === "visibility.rating");
  const pointsGap = (c: AssistantLosingCheck | undefined) => (c ? c.maxPoints - (c.earnedPoints ?? 0) : -1);
  const hasDedicatedReviewSignal = reviewCountCheck !== undefined || ratingCheck !== undefined;
  if (hasDedicatedReviewSignal) {
    candidates.push(
      pointsGap(ratingCheck) > pointsGap(reviewCountCheck)
        ? { id: "howToImproveRating", text: t(locale, "dashboard.assistant.starterPrompts.howToImproveRating"), kinds: ["review"] }
        : { id: "howToGetMoreReviews", text: t(locale, "dashboard.assistant.starterPrompts.howToGetMoreReviews"), kinds: ["review"] }
    );
  }

  // Suppressed when the top loss is Visibility & Reputation AND the
  // dedicated review prompt above already covers it — otherwise this
  // and that prompt would both count as "review" and could double up.
  const topLoss = context.score.losingChecks[0];
  if (topLoss && (topLoss.category !== "visibility" || !hasDedicatedReviewSignal)) {
    candidates.push({
      id: "whyCategoryLosingPoints",
      text: t(locale, "dashboard.assistant.starterPrompts.whyCategoryLosingPoints", {
        category: t(locale, CATEGORY_LABELS[topLoss.category]),
      }),
      kinds: topLoss.category === "visibility" ? ["score", "review"] : ["score"],
    });
  }

  for (const move of context.growthMoves) {
    const candidate = growthMovePromptCandidate(move, locale, context.profile.referralOk);
    if (candidate) candidates.push(candidate);
  }

  if (context.weeklyRoutine.items.every((item) => !item.checkedThisWeek)) {
    candidates.push({
      id: "weeklyRoutineWhatToDo",
      text: t(locale, "dashboard.assistant.starterPrompts.weeklyRoutineWhatToDo"),
      kinds: ["routine"],
    });
  }
  if (context.weeklyRoutine.streakWeeks > 0) {
    candidates.push({
      id: "weeklyRoutineKeepGoing",
      text: t(locale, "dashboard.assistant.starterPrompts.weeklyRoutineKeepGoing"),
      kinds: ["routine"],
    });
  }

  if (context.profile.scoreHistory.length >= 2 || context.profile.fixedItems.length > 0) {
    candidates.push({
      id: "whatsChangedSinceStart",
      text: t(locale, "dashboard.assistant.starterPrompts.whatsChangedSinceStart"),
      kinds: ["history"],
    });
  }
  if (context.competitors.available) {
    candidates.push({
      id: "compareToCompetitors",
      text: t(locale, "dashboard.assistant.starterPrompts.compareToCompetitorsAvailable"),
      kinds: ["competitors"],
    });
  }

  if (candidates.length === 0) return [];

  // Deterministic weekly rotation. Bug fixed here: an earlier version
  // seeded this with Number(weekStartFor(now).replace(/-/g, "")) — the
  // literal YYYY-MM-DD digits as a number — which jumps unevenly across
  // month boundaries (e.g. 20261026 -> 20261102 is a jump of 76, not 7)
  // and, worse, jumps by EXACTLY `candidates.length` within a month far
  // too easily (any 7-day span that doesn't cross a month boundary is a
  // jump of exactly 7, so a business with exactly 7 candidates — e.g.
  // Hudson Shears — got offset = seed % 7 landing on the SAME value this
  // week and next week, defeating the whole rotation). Fixed by counting
  // real whole weeks since the epoch instead: consecutive Mondays are
  // always exactly 7 days apart regardless of month/year boundaries, so
  // this index always increments by exactly 1 from one real week to the
  // next, which (for any candidates.length > 1) can never collide with
  // the previous week's offset mod candidates.length.
  const [weekYear, weekMonth, weekDay] = weekStartFor(now).split("-").map(Number);
  const daysSinceEpoch = Math.floor(Date.UTC(weekYear, weekMonth - 1, weekDay) / (24 * 60 * 60 * 1000));
  const weekIndex = Math.floor(daysSinceEpoch / 7);
  const offset = weekIndex % candidates.length;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];

  const selected: StarterPromptCandidate[] = [];
  const usedKinds = new Set<StarterPromptKind>();
  for (const candidate of rotated) {
    if (selected.length >= 3) break;
    if (candidate.kinds.some((kind) => (kind === "score" || kind === "review") && usedKinds.has(kind))) continue;
    selected.push(candidate);
    for (const kind of candidate.kinds) usedKinds.add(kind);
  }

  const isGrowthOrRoutine = (c: StarterPromptCandidate) => c.kinds.includes("growth") || c.kinds.includes("routine");
  if (selected.length === 3 && !selected.some(isGrowthOrRoutine)) {
    const mustInclude = rotated.find(isGrowthOrRoutine);
    if (mustInclude) {
      const neutralIndex = selected.findIndex((c) => c.kinds.includes("history") || c.kinds.includes("competitors"));
      selected[neutralIndex !== -1 ? neutralIndex : selected.length - 1] = mustInclude;
    }
  }

  if (selected.length < 3) return selected.map((c) => c.text);

  const selectedIds = new Set(selected.map((c) => c.id));
  const rest = rotated.filter((c) => !selectedIds.has(c.id));
  return [...selected, ...rest].map((c) => c.text);
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

/** How many growth moves to include — every real business today fires
 * at most a handful (the moves are mostly mutually exclusive by
 * construction, see buildGrowthMoves in lib/growthMoves.ts), but kept
 * as an explicit cap, same reasoning as MAX_LOSING_CHECKS_IN_CONTEXT,
 * so the prompt can never grow unbounded if more moves are added
 * later. */
export const MAX_GROWTH_MOVES_IN_CONTEXT = 8;

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
 * the Pricing tool's per-service token cap. Lowered from 600, then to
 * 450, then to 300 alongside the tightened system prompt (rule 5's
 * brevity target) to reinforce brevity — then raised back to 450 after
 * the live check (scripts/live-check-postai.ts) showed 300 genuinely
 * cutting real answers off mid-sentence, especially in Spanish (more
 * tokens per word) and for multi-point answers (a bulleted list plus a
 * labeled "General guidance:" paragraph). Rule 5 now also states a hard
 * ~150-word/4-bullet target so a real answer should finish well inside
 * this cap; if the API still stops for max_tokens, callAnthropicChat
 * (lib/anthropicClient.ts) trims the reply back to its last complete
 * sentence rather than showing a cut-off one. */
export const ASSISTANT_MAX_TOKENS = 450;

// ---------------------------------------------------------------------------
// Failed-request copy — what the owner sees when the Anthropic call itself fails
// ---------------------------------------------------------------------------

/**
 * The short, honest, translated message the owner sees when a chat
 * request to Anthropic fails — never the raw technical error (status
 * code, API error type, request id, or response body). See
 * sendAssistantMessage in app/actions/assistant.ts, the one real
 * caller: it logs the full real detail server-side separately, then
 * calls this with only the numeric HTTP status from the failure (see
 * AnthropicApiError in lib/anthropicClient.ts) — deliberately never the
 * error object itself, so it's structurally impossible for this
 * function to leak anything technical into what it returns, only ever
 * one of two fixed, already-reviewed strings.
 *
 * A rate limit (429) gets its own honest "try again in a minute"
 * wording — the one real failure mode where "try again shortly" is
 * actually the right advice, vs. every other failure (auth, server
 * error, network), where a few minutes is the more honest expectation.
 */
export function anthropicFailureMessage(status: number, locale: Locale = DEFAULT_LOCALE): string {
  return t(
    locale,
    status === 429 ? "dashboard.assistant.errorAnthropicRateLimited" : "dashboard.assistant.errorAnthropicUnavailable"
  );
}
