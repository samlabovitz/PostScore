// Shared classification for "why couldn't we reach/read this site" —
// used by both the HTTPS probe (lib/websiteHttps.ts) and the HTML
// content fetch (lib/websiteAnalysis.ts's fetchWebsiteHtml), so both
// probes tell the same real, honest story about a failure rather than
// collapsing every cause into one "unreachable"/null. Four real,
// distinct causes:
//   - "timed_out": our own request hit ITS OWN timeout with no
//     response either way — an AbortError, specifically. This is NOT
//     evidence the site is down: a slow-but-real site (a cold start, a
//     momentary host/CDN hiccup) can easily outlast our budget while
//     still being completely reachable a moment later. The real
//     Colorful Yun Nan case this was added for: our probe timed out
//     while the SAME scan's PageSpeed call (a far more generous 30s
//     budget) succeeded moments later on the identical site.
//   - "down": the request failed for any OTHER reason before getting a
//     response — DNS failure, connection refused, TLS error. Real
//     evidence something is actually broken, not just slow.
//   - "blocked_automated_check": a real HTTP response came back, but
//     it's a bot-detection/anti-automation response (403/429/503, or a
//     known bot-challenge page like Cloudflare's "Just a moment...").
//     The site may be working completely fine for a real customer's
//     browser — this says nothing about that.
//   - "http_error": a real HTTP response came back with some other
//     non-2xx status (e.g. 404, 500) that isn't a bot-detection
//     signature.
//
// Ranked from least to most confident/actionable (see
// moreSpecificReason below): a bare timeout proves the least (we simply
// gave up), a confirmed connection-level failure proves more, and an
// actual HTTP response — even a bad one — proves the most, since the
// target demonstrably answered.

/** A handful of real, well-known phrases bot-challenge interstitials
 * use — Cloudflare's "Just a moment..." JS challenge chief among them,
 * since it's the single most common automated-traffic block the real
 * web throws at a server-side fetch like this one's. Deliberately a
 * short, high-confidence list rather than an exhaustive one: a false
 * "http_error" (when it was really a block) is far less misleading to
 * an owner than a false "blocked" would be. */
const BOT_CHALLENGE_PHRASES = [
  "just a moment",
  "checking your browser",
  "attention required",
  "cf-browser-verification",
  "enable javascript and cookies to continue",
  "ddos protection by",
];

/** Status codes that are themselves a strong, well-known automated-
 * traffic-block signal regardless of body content — 403 (forbidden),
 * 429 (rate limited), and 503 (the status Cloudflare's own JS
 * challenge serves while it's being solved). */
const BLOCKED_STATUS_CODES = new Set([403, 429, 503]);

export type ReachabilityFailureReason = "timed_out" | "down" | "blocked_automated_check" | "http_error";

/**
 * Classifies a REAL received HTTP response that wasn't `ok` — never
 * called when there was no response at all (that's always "timed_out"
 * or "down", decided by the caller before this is ever reached).
 * `bodySnippet` only needs to be the first page or so of the response
 * body — just enough to catch a bot-challenge page's own title/script
 * text, bounded by whatever the caller already fetched (never fetches
 * more itself).
 */
export function classifyUnreachableResponse(status: number, bodySnippet: string | null): ReachabilityFailureReason {
  if (BLOCKED_STATUS_CODES.has(status)) return "blocked_automated_check";
  if (bodySnippet) {
    const lower = bodySnippet.toLowerCase();
    if (BOT_CHALLENGE_PHRASES.some((phrase) => lower.includes(phrase))) return "blocked_automated_check";
  }
  return "http_error";
}

/** Least to most confident/actionable — see this file's own top
 * comment for why a bare timeout ranks below every other real reason. */
const REASON_SPECIFICITY: Record<ReachabilityFailureReason, number> = {
  timed_out: 0,
  down: 1,
  http_error: 2,
  blocked_automated_check: 3,
};

/**
 * When two separate attempts (e.g. the https:// and http:// probe, or
 * two schemes of an HTML fetch) fail with DIFFERENT reasons, picks the
 * more specific/confident one to report overall — never lets a mere
 * timeout on one attempt suppress a real, confirmed signal (a block, an
 * HTTP error, or even a genuine "down") from the other.
 */
export function moreSpecificReason(a: ReachabilityFailureReason, b: ReachabilityFailureReason): ReachabilityFailureReason {
  return REASON_SPECIFICITY[a] >= REASON_SPECIFICITY[b] ? a : b;
}

/**
 * The one real mapping from a reachability failure reason to its
 * honest, owner-facing message key — shared by the Website page
 * (WebsiteScoreBreakdown's CheckRow, for website.https/content_depth/
 * contact_conversion when excluded) and PostAI's own REAL DATA CONTEXT
 * (lib/assistant.ts), so the two surfaces can never drift into
 * different wording for the same real fact (Day 4 Part 3c). Each key
 * must exist in lib/i18n/messages.ts with a reviewed Spanish (usted)
 * translation — see dashboard.website.reachability* there.
 */
export function reachabilityReasonMessageKey(
  reason: ReachabilityFailureReason
):
  | "dashboard.website.reachabilityTimedOut"
  | "dashboard.website.reachabilityDown"
  | "dashboard.website.reachabilityBlocked"
  | "dashboard.website.reachabilityHttpError" {
  switch (reason) {
    case "timed_out":
      return "dashboard.website.reachabilityTimedOut";
    case "down":
      return "dashboard.website.reachabilityDown";
    case "blocked_automated_check":
      return "dashboard.website.reachabilityBlocked";
    case "http_error":
      return "dashboard.website.reachabilityHttpError";
  }
}
