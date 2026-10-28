// PostAI's facts about the business — precomputed from the stored scan,
// never re-derived by the model — and the check every answer goes through:
// any number, rating, review count, threshold or rank it states (and
// claims like "no reviews yet" / "low rating" / "no website") must match
// these facts. A failed answer is regenerated once; if it still fails, the
// owner gets a short, safe answer built from the facts alone
// (answerWithFactCheck). Pure.

import { RATING_CONFIDENCE_FULL_AT_REVIEWS, REVIEW_COUNT_SATURATION, type ScoreBreakdown } from "@/lib/scoring";
import { t, type Locale } from "@/lib/i18n";
import { wholeCategoryPoints } from "@/lib/overviewTiles";
import { freeWaitingPoints } from "@/lib/freeUpsell";
import { wholePointRange } from "@/lib/pointRange";
import type { Plan } from "@/lib/plan";
import { REPLY_CHECK_MIN_REVIEWS, TEMPLATED_WARN_SHARE, type GbpReplyCounts } from "@/lib/gbpReviewReplies";
import { ownerProvidedLines, type OwnerProvided } from "@/lib/businessOffer";

/** A point gain the app itself shows (Overview "Biggest boost", a Growth
 * plan card's points chip, Free's "N points are waiting"). PostAI may state
 * only these, always as "up to +N points". */
export interface PostaiProjection {
  label: string;
  upTo: number;
  /** A range's top ("about +29–31"), when the app shows one. */
  high?: number | null;
  where: string;
}

/** The Overview's "How you rank nearby" card, exactly (getLocalBenchmark). */
export interface PostaiRankCard {
  othersCount: number;
  percentileAhead: number;
  smallSample: boolean;
  noun: string;
  /** Who the rank is against (lib/competitorScope.ts scopeSummary), when a scope is set. */
  scope: string | null;
}

export interface PostaiFacts {
  total: number;
  grade: string;
  rating: number | null;
  reviewCount: number;
  /** Reviews at which the star rating counts fully. */
  ratingFullAtReviews: number;
  /** Reviews at which the review-count check gives full credit. */
  reviewCountFullAt: number;
  /** A rating under this is "low" (lib/scoring.ts ratingBand). */
  lowRatingBelow: number;
  nearbyReviewAverage: number | null;
  hasWebsite: boolean;
  rank: { rank: number; of: number } | null;
  /** The Overview rank card's own wording (same scope as `rank`). */
  rankCard: PostaiRankCard | null;
  /** The plan the answer is for (the Free rules in checkAnswerFacts). */
  plan: Plan;
  /** Each category as the Overview shows it: "26 / 30" (whole points of its weight). */
  categories: Array<{ label: string; points: number | null; of: number }>;
  /** The only point gains PostAI may state (see PostaiProjection). */
  projections: PostaiProjection[];
  /** Grow and up: the Overview's "Projected score". */
  projectedScore: number | null;
  /** The saved competitor scan, in rank order (this business included):
   * name, PostScore, review count and rating as stored. Empty = not known. */
  competitors: Array<{ name: string; total: number | null; reviews: number | null; rating: number | null; isSubject: boolean }>;
  checks: Array<{ label: string; status: "done" | "needs work" | "couldn't check"; earned: number | null; max: number; explanation: string }>;
  /** Review-reply counts from the owner's connected Google profile (null =
   * not connected or not checked yet). Not scored yet. */
  replyCounts: GbpReplyCounts | null;
  /** The owner's own entries ("Added by you"), worded for the business
   * type (lib/businessOffer.ts ownerProvidedLines). Empty = not known. */
  ownerProvided?: string[];
}

const LOW_RATING_BELOW = 4.3;

export function buildPostaiFacts(
  breakdown: ScoreBreakdown,
  b: {
    rating: number | null;
    reviewCount: number | null;
    hasWebsite: boolean;
    rank: { rank: number; of: number } | null;
    nearbyReviewAverage: number | null;
    competitors?: PostaiFacts["competitors"];
    rankCard?: PostaiRankCard | null;
    plan?: Plan;
    /** Grow and up: the Overview's biggest boost (suggestions[0]) and projected score. */
    biggestBoost?: { label: string; promisedPoints: number } | null;
    projectedScore?: number | null;
    /** Grow and up: the Growth plan cards' points chips (weightedPoints, as ActionPlanSection shows them). */
    tasks?: Array<{ label: string; weightedPoints: number; weightedPointsHigh: number | null }>;
    /** Grow and up: the website banner's gain ("up to about +N", or a starter site's "about +29–31"). */
    websiteBanner?: { kind: "improve"; points: number } | { kind: "get_website"; low: number; high: number | null } | null;
    replyCounts?: GbpReplyCounts | null;
    /** What they offer, typical spend, what makes them different. */
    owner?: OwnerProvided | null;
  }
): PostaiFacts {
  const plan = b.plan ?? "free";
  const free = plan === "free";
  const whole = wholeCategoryPoints(breakdown.categories);
  const projections: PostaiProjection[] = [];
  if (free) {
    const waiting = freeWaitingPoints(breakdown.total);
    if (waiting > 0) projections.push({ label: "every point the score is missing (the Overview's \"N points are waiting to be fixed\")", upTo: waiting, where: "Overview score card" });
  } else {
    if (b.biggestBoost) projections.push({ label: b.biggestBoost.label, upTo: boostNumber(b.biggestBoost.promisedPoints), where: "Overview \"Biggest boost\"" });
    const wb = b.websiteBanner;
    if (wb?.kind === "improve") projections.push({ label: "fixing every website improvement on the Website page", upTo: wholePointRange(wb.points, null).low, where: "Website banner" });
    if (wb?.kind === "get_website") {
      const r = wholePointRange(wb.low, wb.high);
      projections.push({ label: "getting a website (the starter site)", upTo: r.low, high: r.high, where: "Website banner" });
    }
    for (const task of b.tasks ?? []) {
      const r = wholePointRange(task.weightedPoints, task.weightedPointsHigh);
      projections.push({ label: task.label, upTo: r.low, high: r.high, where: "Growth plan card" });
    }
  }
  return {
    total: breakdown.total,
    grade: breakdown.grade,
    rating: b.rating,
    reviewCount: b.reviewCount ?? 0,
    ratingFullAtReviews: RATING_CONFIDENCE_FULL_AT_REVIEWS,
    reviewCountFullAt: REVIEW_COUNT_SATURATION,
    lowRatingBelow: LOW_RATING_BELOW,
    nearbyReviewAverage: b.nearbyReviewAverage,
    hasWebsite: b.hasWebsite,
    rank: b.rank,
    rankCard: b.rankCard ?? null,
    plan,
    categories: breakdown.categories.map((c, i) => ({ label: c.label, points: whole[i], of: c.weight })),
    projections,
    projectedScore: free ? null : (b.projectedScore ?? null),
    competitors: b.competitors ?? [],
    checks: breakdown.checks.map((c) => ({
      label: c.label,
      status: c.earnedPoints === null ? "couldn't check" : c.earnedPoints >= c.maxPoints ? "done" : "needs work",
      earned: c.earnedPoints,
      max: c.maxPoints,
      explanation: c.explanation,
    })),
    replyCounts: b.replyCounts ?? null,
    ownerProvided: b.owner ? ownerProvidedLines(b.owner) : [],
  };
}

/** The Overview's "Biggest boost" number (components/overview/ScoreBand.tsx boostPoints). */
function boostNumber(points: number): number {
  return points >= 1 ? Math.round(points) : Math.round(points * 10) / 10;
}

const pts = (n: number | null) => (n === null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The reply counts, exactly as the owner's connect box shows them. */
function replyCountsLine(c: GbpReplyCounts | null): string {
  const rules =
    "Scored (scoring v1.12.0) in the \"Replying to reviews\" check from the RECENT numbers only — full points at 80% of recent reviews replied to; the all-time numbers are never scored. Never claim replying (or anything else) affects Google ranking.";
  if (!c) return `- Review replies: not known (Google not connected, or not checked yet) — the "Replying to reviews" check is left out of the score until Google is connected. Never claim replying (or anything else) affects Google ranking.`;
  const date = c.checkedAt.slice(0, 10);
  const allTime =
    c.allTimeReviews !== null && c.allTimeReplied !== null
      ? ` ALL-TIME: replied to ${c.allTimeReplied} of ${c.allTimeReviews} reviews${c.allTimeCapped ? " (of the latest 500 only — there are more)" : ""}.`
      : "";
  const recent =
    c.reviewsInWindow < REPLY_CHECK_MIN_REVIEWS
      ? " RECENT: not enough recent reviews to check yet."
      : ` RECENT (last 90 days, or the latest 20): replied to ${c.replied} of the last ${c.reviewsInWindow} reviews.${c.templatedShare > TEMPLATED_WARN_SHARE ? " Most replies use the same text — a short personal line helps." : ""}`;
  return `- Review replies (owner's connected Google profile, checked ${date}):${allTime}${recent} Keep all-time and recent apart — never mix their numbers. ${rules}`;
}

/** Recent reviews (the last 90 days): only a bucket is ever stored. */
function recentReviewsLine(c: GbpReplyCounts | null): string {
  const rule =
    "Review recency points: 3 or more reviews in the last 90 days = 6/6, 2 = 4/6, 1 = 2/6. No dates or review text are kept — never name a date, a day count or \"this week\".";
  if (c && typeof c.recentReviews === "number") {
    const n = c.recentReviews === 3 ? "3 or more" : String(c.recentReviews);
    return `- Reviews in the last 90 days (owner's connected Google profile — the exact count): ${n}. ${rule}`;
  }
  return `- Reviews in the last 90 days: only what the "Review recency" check below says (counted among the few reviews Google shows — "at least N"; connecting Google counts them all). ${rule}`;
}

/** The FACTS block for the prompt — the only source of numbers. */
export function factsBlockText(f: PostaiFacts): string {
  const lines = [
    "FACTS (from the stored scan — the ONLY source of numbers and facts about this business; never compute, round differently, swap or guess any of them):",
    `- PostScore: ${f.total}/100 (grade ${f.grade}).`,
    `- Google reviews: ${f.reviewCount}. Review count check: full credit at ${f.reviewCountFullAt}+ reviews.`,
    f.rating === null ? "- Google star rating: none (no reviews yet)." : `- Google star rating: ${f.rating.toFixed(1)}★ (a rating under ${f.lowRatingBelow}★ counts as low; this one is ${f.rating < f.lowRatingBelow ? "LOW" : "NOT low"}). The rating counts fully once there are ${f.ratingFullAtReviews}+ reviews (this business has ${f.reviewCount}).`,
    f.nearbyReviewAverage === null ? "- Nearby businesses' average review count: not known." : `- Nearby businesses' average review count: ${f.nearbyReviewAverage}.`,
    `- Website: ${f.hasWebsite ? "yes, the business has a website" : "NO website"}.`,
    f.rank
      ? `- Rank among nearby competitors: #${f.rank.rank} of ${f.rank.of} — exactly ${f.rank.rank - 1} business${f.rank.rank - 1 === 1 ? "" : "es"} rank${f.rank.rank - 1 === 1 ? "s" : ""} ahead of this one.${
          f.rankCard
            ? ` The Overview's "How you rank nearby" card says exactly: "#${f.rank.rank} of ${f.rank.of} · Ahead of ${f.rankCard.percentileAhead}% of ${f.rankCard.othersCount} nearby ${f.rankCard.noun}${f.rankCard.smallSample ? " — small sample" : ""}" — use this rank and these words (never another rank or count).${f.rankCard.scope ? ` Ranked against: ${f.rankCard.scope}.` : ""}`
            : ""
        }`
      : "- Rank among nearby competitors: not known (no competitor scan).",
    ...(f.competitors.length > 0
      ? [
          "- The saved competitor scan, in rank order (PostScore · Google reviews · rating — \"not known\" where the scan has none):",
          ...f.competitors.map((c, i) => `  ${i + 1}. ${c.isSubject ? "THIS BUSINESS" : c.name} · ${c.total ?? "not known"} · ${c.reviews ?? "not known"} reviews · ${c.rating === null ? "rating not known" : `${c.rating.toFixed(1)}★`}`),
        ]
      : ["- Individual competitors' review counts and star ratings: NOT known. Never say a competitor has more or fewer reviews, or a higher or lower rating."]),
    `- The ${f.reviewCountFullAt}+ and ${f.ratingFullAtReviews}+ review thresholds are PostScore's own scoring rules — never say Google counts, requires or rewards them.`,
    "- Each category, as the Overview shows it (whole points of the category's points — say \"X of W\", never a category score out of 100):",
    ...f.categories.map((c) => `  - ${c.label}: ${c.points === null ? "not enough data to score" : `${c.points} of ${c.of}`}`),
    f.projections.length > 0
      ? "- POINT GAINS THE APP SHOWS — the ONLY gains you may state, always worded \"up to +N points\" (\"hasta +N puntos\"); never any other estimate (not for a starter site, reviews, photos or anything else):"
      : "- POINT GAINS THE APP SHOWS: none — never estimate how many points any fix would add.",
    ...f.projections.map((p) => `  - ${p.label}: up to +${p.high ? `${p.upTo}–${p.high}` : p.upTo} points (${p.where})`),
    ...(f.projectedScore !== null ? [`- Projected score (Overview): ${f.projectedScore}/100.`] : []),
    "- Every check (status, points, the app's own explanation with its real threshold):",
    ...f.checks.map((c) => `  - ${c.label}: ${c.status}, ${pts(c.earned)}/${pts(c.max)} pts — ${c.explanation}`),
    replyCountsLine(f.replyCounts),
    recentReviewsLine(f.replyCounts),
    ...((f.ownerProvided ?? []).length > 0
      ? [
          "- OWNER-PROVIDED (the owner's own words in \"What PostAI knows about your business\" → \"Added by you\"; not verified by PostScore — use them to fit ideas to the business, say they're what the owner told you, never present them as checked facts, never invent more):",
          ...(f.ownerProvided ?? []).map((line) => `  - ${line}`),
        ]
      : []),
    ...(f.plan === "free"
      ? [
          "- FREE PLAN: never suggest printing, screenshotting or saving a preview, or any other way around a locked feature; never say the owner can re-run, refresh or update their competitors (on Free the saved list isn't refreshed).",
        ]
      : []),
    "If a fact isn't here, say it isn't known — never estimate it.",
  ];
  return lines.join("\n");
}

const num = (s: string) => Number(s.replace(",", "."));
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);

/** Numbers in `text` next to a pattern (e.g. reviews, stars). */
function numbersBy(text: string, re: RegExp): number[] {
  return Array.from(text.matchAll(re), (m) => num(m[1]));
}

/**
 * Everything in `answer` that doesn't match the facts. `promptText` is the
 * rest of what the model was given (competitor review counts and ratings,
 * point values, plan prices), so a number quoted from it is fine — a
 * number found nowhere, or a threshold attached to the wrong check, isn't.
 */
export function checkAnswerFacts(answer: string, f: PostaiFacts, promptText: string): string[] {
  const issues: string[] = [];
  const known = new Set(Array.from(promptText.matchAll(/\d+(?:[.,]\d+)?/g), (m) => num(m[0])));
  const has = (n: number) => known.has(n) || known.has(Math.round(n * 10) / 10);

  const all = sentencesOf(answer);
  const thresholdRe = new RegExp(`\\b(${f.ratingFullAtReviews}|${f.reviewCountFullAt})\\s*\\+?\\s*(reviews|reseñas)`, "i");
  for (let index = 0; index < all.length; index++) {
    const sentence = all[index];
    const previous = all[index - 1] ?? "";
    const lower = sentence.toLowerCase();
    // Review-count thresholds: 150 is the review-count check, 40 is when the rating counts fully.
    if (/(full credit|full points|crédito completo|puntos completos)/i.test(sentence)) {
      for (const n of numbersBy(sentence, /(\d+)\s*\+?\s*(?:reviews|reseñas)/gi)) {
        if (n === f.ratingFullAtReviews && !/(rating|star|★|calificaci|estrella)/i.test(sentence)) issues.push(`says ${n}+ reviews for full credit — full review-count credit is at ${f.reviewCountFullAt}+ (${n} is when the star rating counts fully)`);
        else if (n !== f.ratingFullAtReviews && n !== f.reviewCountFullAt && n !== f.reviewCount) issues.push(`a review threshold not in the facts: ${n}`);
      }
    }
    // Ratings stated.
    for (const r of numbersBy(sentence, /(\d(?:[.,]\d)?)\s*(?:★|-star|\s?stars?\b|\s?estrellas?)/gi)) {
      if (r > 5 || r <= 0) continue;
      if (f.rating !== null && Math.abs(r - f.rating) < 0.05) continue;
      if (!has(r)) issues.push(`a star rating not in the facts: ${r}`);
    }
    // Review counts stated.
    for (const n of numbersBy(sentence, /(\d+)\s*(?:google\s+)?(?:reviews|reseñas)/gi)) {
      if (!has(n)) issues.push(`a review count not in the facts: ${n}`);
    }
    // Points stated.
    for (const n of numbersBy(sentence, /(\d+(?:[.,]\d+)?)\s*(?:pts|points|puntos)\b/gi)) {
      if (!has(n)) issues.push(`a points number not in the facts: ${n}`);
    }
    // Out of 100: only the PostScore itself (and the Website page's own
    // score) — a category is "X of W", as the Overview shows it.
    for (const n of numbersBy(sentence, /(\d+)\s*(?:\/\s*100|out of 100|de 100)\b/gi)) {
      if (n === f.total || (f.projectedScore !== null && n === f.projectedScore)) continue;
      if (/\b(website|site|sitio)\b/i.test(sentence) && has(n)) continue;
      issues.push(`a score out of 100 that isn't the PostScore: ${n}/100 — categories are shown as "X of W" (e.g. ${categoryExample(f)})`);
    }
    // A category's "X of W" must be the Overview's.
    // Only the "X of W" right after the category's own name ("Website
    // category is at 0 of 30"), never another category's in the same sentence.
    for (const c of f.categories) {
      if (c.points === null) continue;
      const otherLabels = f.categories.filter((o) => o !== c).map((o) => escapeRe(o.label)).join("|");
      for (const m of Array.from(sentence.matchAll(new RegExp(`\\b${escapeRe(c.label)}\\b((?:(?!${otherLabels || "$^"})[^.;\\n]){0,40}?)(\\d+(?:[.,]\\d+)?)\\s*(?:of|out of|de|\\/)\\s*(\\d+)`, "gi")))) {
        if (num(m[3]) === c.of && num(m[2]) !== c.points) issues.push(`says ${c.label} is ${m[2]} of ${c.of} — the Overview shows ${c.points} of ${c.of}`);
      }
    }
    // Rank: exactly the Overview card's.
    for (const m of Array.from(sentence.matchAll(/(?:#\s?|\b(?:rank(?:ed)?|place[sd]?|puesto|lugar)\s+(?:#\s?)?)(\d+)(?:st|nd|rd|th|º|°)?\s*(?:of|out of|de)\s*(\d+)/gi))) {
      const [r, of] = [num(m[1]), num(m[2])];
      if (!f.rank) issues.push(`states a rank (#${r} of ${of}) — the rank isn't known`);
      // Another business's place in the same list ("the leader is #1 of 5") is fine.
      else if (of === f.rank.of && r !== f.rank.rank && !/\b(you|you're|your|usted|su)\b/i.test(sentence)) continue;
      else if (r !== f.rank.rank || of !== f.rank.of) issues.push(`a rank that isn't the Overview's: #${r} of ${of} — the Overview card shows #${f.rank.rank} of ${f.rank.of}`);
    }
    // Point gains: only the app's own projections, always "up to".
    issues.push(...gainIssues(sentence, f));
    // The 40+/150+ thresholds are PostScore's rules, not Google's.
    if (
      /\bgoogle(?:'s)?\b[^.]{0,50}\b(counts?|counted|requires?|needs?|gives?|rewards?|wants?|weighs?|weights?|trusts?|looks for|considers?|algorithm|rule|threshold|cuenta|exige|requiere|necesita|premia|pondera|da más peso|algoritmo|regla)\b/i.test(sentence) &&
      (thresholdRe.test(sentence) ||
        /\b(full credit|counts? fully|crédito completo|cuenta por completo)\b/i.test(sentence) ||
        // "…counts fully once you hit 40+ reviews. Google weighs ratings more once there's a bigger sample."
        (thresholdRe.test(previous) && /\b(ratings?|reviews?|sample|calificaci\w*|reseñas|muestra)\b/i.test(sentence)))
    )
      issues.push(`credits Google with the ${f.ratingFullAtReviews}+/${f.reviewCountFullAt}+ review thresholds — they're PostScore's own scoring rules`);
    // Free: no way around a lock, no competitor re-runs.
    if (f.plan === "free") issues.push(...freeIssues(sentence));
    // "N ahead of you" must match the rank.
    if (f.rank) {
      const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      for (const m of Array.from(lower.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:[a-z]+\s+){0,2}(?:ahead of you|above you|ranked (?:above|ahead of) you)/g))) {
        const n = words[m[1]] ?? Number(m[1]);
        if (n !== f.rank.rank - 1) issues.push(`says ${n} rank ahead — ${f.rank.rank - 1} do (#${f.rank.rank} of ${f.rank.of})`);
      }
    }
    // Claims.
    if (f.reviewCount > 0 && /\b(no reviews( yet)?|zero reviews|any reviews yet|sin reseñas|ninguna reseña)\b/i.test(lower)) issues.push(`says there are no reviews — there are ${f.reviewCount}`);
    if (f.rating !== null && f.rating >= f.lowRatingBelow && /\b(low|poor|bad|weak)\s+(star\s+)?rating\b|\brating is (low|poor|bad)\b|calificación (baja|mala)/i.test(lower)) issues.push(`calls the rating low — it's ${f.rating.toFixed(1)}★`);
    if (f.hasWebsite && /\b(no website|don't have a website|do not have a website|without a website|sin sitio web|no tiene sitio web)\b/i.test(lower)) issues.push("says there's no website — there is one");
    if (!f.hasWebsite && /\byour (current )?website (is|loads|shows|has)\b/i.test(lower)) issues.push("describes a website — there isn't one");
    // Competitors' own review counts and ratings, when the scan doesn't have them.
    if (f.competitors.length === 0 && (/\b(top|leaders?|competitors?|they|those|salons|shops|restaurants|businesses)\b[^.]{0,50}\b(have|has|with)\b[^.]{0,15}\b(more|fewer|less)\s+(reviews|reseñas)\b/i.test(sentence) || /\bties?\s+(the\s+)?(top|leaders?|best)\b|\b(higher|lower|better|worse) (rating|ratings|star)\b[^.]{0,30}\b(than|competitors?)\b/i.test(sentence)))
      issues.push("compares individual competitors' reviews or ratings — those aren't known");
    else if (f.competitors.length === 0 && /\b(competitor|top|leader|lead|ahead|above you|scores? \d+|#\d)/i.test(sentence) && /\b(more|fewer|less)\s+(reviews|reseñas)\b|\breviews? built up\b/i.test(sentence) && !/\b(average|averages|promedio)\b/i.test(sentence))
      issues.push("compares individual competitors' reviews or ratings — those aren't known");
  }
  return Array.from(new Set(issues));
}

const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const categoryExample = (f: PostaiFacts) => {
  const c = f.categories.find((x) => x.points !== null);
  return c ? `${c.label}: ${c.points} of ${c.of}` : "26 of 30";
};

const GAIN_CUE = /\b(gain|gains|add|adds|adding|boost|earn|raise|increase|improve|pick up|picks up|worth|get you|jump|climb|bump|up to|could|would|potential|sumar|ganar|subir|aumentar|mejorar|hasta|podría|vale)\b|\+\s?\d/i;
const NOT_A_GAIN_BEFORE = /\b(losing|lose|loses|missing|costs?|costing|earned|has|have|scores?|at|pierde|perdiendo|faltan|tiene)\s+(about\s+|around\s+)?$/i;
const UP_TO_BEFORE = /\b(up to|hasta)\s*(about\s+|around\s+)?\+?\s*$/i;

/** Every point gain in a sentence must be one of the app's own projections,
 * worded "up to +N points". */
function gainIssues(sentence: string, f: PostaiFacts): string[] {
  if (!GAIN_CUE.test(sentence)) return [];
  const allowed = new Set(f.projections.flatMap((p) => [p.upTo, ...(p.high ? [p.high] : [])]));
  const waiting = f.projections.find((p) => p.where === "Overview score card")?.upTo ?? null;
  const out: string[] = [];
  const re = /(\+\s?)?(\d+(?:[.,]\d+)?)(?:\s*[–-]\s*\d+)?\s*(?:more\s+|extra\s+)?(pts|points?|puntos?)\b|\+\s?(\d+(?:[.,]\d+)?)(?![\d.,]|\s*(?:\/|of\b|de\b|%|reviews|reseñas|★|stars?|estrellas|tally|tallies|counter|button|tap|taps|conteo|contador|botón|\d))/gi;
  for (const m of Array.from(sentence.matchAll(re))) {
    const raw = m[2] ?? m[4];
    const n = num(raw);
    // A bare "+1" (no "points") is the coupon/referral +1 counter, never a gain.
    if (m[4] && n === 1) continue;
    const before = sentence.slice(0, m.index);
    const after = sentence.slice((m.index ?? 0) + m[0].length);
    // "26 of 30 points", "losing 4 points", "scores 62 points": not a gain.
    if (!m[1] && !m[4] && NOT_A_GAIN_BEFORE.test(before)) continue;
    if (/^\s*(of|out of|de)\s+\d/i.test(after)) continue;
    if (!m[1] && !m[4] && /\b(of|de)\s*$/i.test(before)) continue;
    // Free's own "N points are waiting to be fixed".
    if (waiting !== null && n === waiting && /^\s*(are|is)?\s*(waiting|missing|left|esperando|pendientes)/i.test(after)) continue;
    if (!allowed.has(n)) {
      out.push(`a point gain the app doesn't show: +${raw} — the only gains are ${allowed.size > 0 ? Array.from(allowed).map((x) => `up to +${x}`).join(", ") : "none"}`);
      continue;
    }
    if (!UP_TO_BEFORE.test(before)) out.push(`a point gain not worded "up to": say "up to +${raw} points"`);
  }
  return out;
}

const NEGATED = /\b(can't|cannot|can not|won't|doesn't|don't|isn't|aren't|not|never|no|only (with|on) (grow|premium)|no se|no puede|nunca)\b/i;

/** Free: never a way around a lock, never "re-run your competitors". */
function freeIssues(sentence: string): string[] {
  const out: string[] = [];
  if (
    /\b(print|screenshot|screen shot|save( it)? as (a )?pdf|cmd\s*\+\s*p|ctrl\s*\+\s*p|imprim\w*|captura de pantalla)\b[^.]{0,60}\b(preview|showroom|vista previa|blurred|locked)\b|\b(preview|showroom|vista previa)\b[^.]{0,60}\b(print|screenshot|imprim\w*|captura)/i.test(sentence) ||
    /\b(work ?around|get around|bypass|a trick|for free instead|eludir|sortear)\b/i.test(sentence)
  )
    out.push("suggests printing a preview or another way around a locked feature (Free)");
  if (
    /\b(re-?run|refresh|re-?scan|update|run (a |the )?(new|fresh)|run again|redo)\b[^.]{0,40}\bcompetitors?\b|\bcompetitors?\b[^.]{0,30}\b(re-?run|refresh|re-?scan)\b|\b(actualizar|volver a (buscar|escanear)|reescanear|refrescar)\b[^.]{0,30}\bcompetidores\b/i.test(sentence) &&
    !NEGATED.test(sentence) &&
    !/\b(grow|premium|multi)\b/i.test(sentence)
  )
    out.push("tells a Free owner they can re-run or refresh competitors — the Free list isn't refreshed");
  return out;
}

/** A retried answer never opens with an apology or "let me correct that". */
export function stripCorrectionPreamble(answer: string): string {
  return answer
    .replace(/^\s*(you'?re right[^.!\n]*[.!—-]\s*)?(i apologi[sz]e[^.!\n]*[.!]\s*)?(let me (answer|correct|fix|redo|try)[^.!\n]*[.!:]\s*)?/i, "")
    .replace(/^\s*(tiene raz[oó]n[^.!\n]*[.!—-]\s*)?(disculpe[^.!\n]*[.!]\s*)?(perm[ií]tame (corregir|responder)[^.!\n]*[.!:]\s*)?/i, "")
    .trim();
}

/** A short, safe answer built only from the facts (the last resort). */
export function factsFallbackAnswer(f: PostaiFacts, locale: Locale): string {
  const parts = [
    t(locale, "dashboard.assistant.fallback.intro"),
    t(locale, "dashboard.assistant.fallback.score", { total: f.total, grade: f.grade }),
    f.rating === null
      ? t(locale, "dashboard.assistant.fallback.noReviews")
      : t(locale, "dashboard.assistant.fallback.reviews", { count: f.reviewCount, rating: f.rating.toFixed(1), fullAt: f.reviewCountFullAt }),
    t(locale, f.hasWebsite ? "dashboard.assistant.fallback.website" : "dashboard.assistant.fallback.noWebsite"),
    ...(f.rank ? [t(locale, "dashboard.assistant.fallback.rank", { rank: f.rank.rank, of: f.rank.of })] : []),
    t(locale, "dashboard.assistant.fallback.more"),
  ];
  return parts.join(" ");
}

/**
 * The fact-checked answer: ask, check, ask again once with the problems
 * named, and fall back to the facts-only answer if it's still wrong.
 * `ask` is the real model call (or a test double).
 */
export async function answerWithFactCheck(args: {
  ask: (messages: Array<{ role: "user" | "assistant"; content: string }>) => Promise<string>;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  facts: PostaiFacts;
  promptText: string;
  locale: Locale;
  clean?: (answer: string) => string;
}): Promise<{ answer: string; attempts: number; issues: string[]; fallback: boolean; rejected: string[] }> {
  const clean = args.clean ?? ((x: string) => x);
  const first = clean(await args.ask(args.messages));
  const issues = checkAnswerFacts(first, args.facts, args.promptText);
  if (issues.length === 0) return { answer: first, attempts: 1, issues: [], fallback: false, rejected: [] };
  const retryMessages = [
    ...args.messages,
    { role: "assistant" as const, content: first },
    {
      role: "user" as const,
      content: `Your answer above stated facts that don't match the FACTS block: ${issues.join("; ")}. Answer my previous question again, using only numbers and facts from the FACTS block — if a fact isn't there, say it isn't known. Reply with ONLY the corrected answer, as if it were your first: no apology and no mention of a previous answer or a correction.`,
    },
  ];
  const second = stripCorrectionPreamble(clean(await args.ask(retryMessages)));
  const again = checkAnswerFacts(second, args.facts, args.promptText);
  if (again.length === 0) return { answer: second, attempts: 2, issues, fallback: false, rejected: [first] };
  return { answer: factsFallbackAnswer(args.facts, args.locale), attempts: 2, issues: again, fallback: true, rejected: [first, second] };
}
