// Shared classification for "why couldn't we reach/read this site" —
// used by both the HTTPS probe (lib/websiteHttps.ts) and the HTML
// content fetch (lib/websiteAnalysis.ts's fetchWebsiteHtml), so both
// probes tell the same real, honest story about a failure rather than
// collapsing every cause into one "unreachable"/null. Three real,
// distinct causes:
//   - "down": the request never got a real HTTP response at all — DNS
//     failure, connection refused, timeout, TLS error. The site itself
//     may genuinely be down, or at least PostScore's servers can't
//     reach it right now.
//   - "blocked_automated_check": a real HTTP response came back, but
//     it's a bot-detection/anti-automation response (403/429/503, or a
//     known bot-challenge page like Cloudflare's "Just a moment...").
//     The site may be working completely fine for a real customer's
//     browser — this says nothing about that.
//   - "http_error": a real HTTP response came back with some other
//     non-2xx status (e.g. 404, 500) that isn't a bot-detection
//     signature.

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

export type ReachabilityFailureReason = "down" | "blocked_automated_check" | "http_error";

/**
 * Classifies a REAL received HTTP response that wasn't `ok` — never
 * called when there was no response at all (that's always "down",
 * decided by the caller before this is ever reached). `bodySnippet`
 * only needs to be the first page or so of the response body — just
 * enough to catch a bot-challenge page's own title/script text, bounded
 * by whatever the caller already fetched (never fetches more itself).
 */
export function classifyUnreachableResponse(status: number, bodySnippet: string | null): ReachabilityFailureReason {
  if (BLOCKED_STATUS_CODES.has(status)) return "blocked_automated_check";
  if (bodySnippet) {
    const lower = bodySnippet.toLowerCase();
    if (BOT_CHALLENGE_PHRASES.some((phrase) => lower.includes(phrase))) return "blocked_automated_check";
  }
  return "http_error";
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
): "dashboard.website.reachabilityDown" | "dashboard.website.reachabilityBlocked" | "dashboard.website.reachabilityHttpError" {
  switch (reason) {
    case "down":
      return "dashboard.website.reachabilityDown";
    case "blocked_automated_check":
      return "dashboard.website.reachabilityBlocked";
    case "http_error":
      return "dashboard.website.reachabilityHttpError";
  }
}
