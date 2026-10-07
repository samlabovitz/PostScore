// Real, server-side network check for whether a business's website
// actually serves HTTPS — see lib/scoring.ts's website.https check and
// the HttpsCheckStatus type for why this can't just look at the URL
// string: Google's saved website URL frequently disagrees with what
// the site actually serves (a listing can say "http://example.com"
// while the real site redirects straight to HTTPS, or vice versa).
//
// This module is intentionally NOT imported by lib/scoring.ts, which
// must stay pure and network-free. It's called once, at business
// save/re-save time (see app/actions/businesses.ts), and the result is
// cached onto the business row rather than re-probed on every score —
// see the `https_status` column added in supabase/schema.sql.

import type { HttpsCheckStatus } from "./scoring";
import { classifyUnreachableResponse, moreSpecificReason, type ReachabilityFailureReason } from "./websiteReachability";

/** Widened from 5000ms (Day 4 Task "timed_out vs down" fix) — the real
 * Colorful Yun Nan case showed a genuinely reachable site exceed the
 * old budget while that same scan's PageSpeed call (30s budget)
 * succeeded moments later. Still short enough that a truly dead site
 * can't hang a save for long. */
const TIMEOUT_MS = 8000;

/** One retry when (and only when) the first attempt specifically timed
 * out (see PROBE_RETRY_DELAY_MS) — a timeout is the one outcome that
 * genuinely might just be a transient slow moment, worth a second real
 * attempt. Never retries a confirmed "down"/http_error/blocked outcome
 * — those already have a real answer, retrying wouldn't change it. */
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 500;

/** Only read enough of a non-ok response to recognize a bot-challenge
 * page's own title/script text (see websiteReachability.ts) — never
 * the whole body, since this probe only cares about reachability, not
 * content. */
const BODY_SNIPPET_BYTES = 4000;

function withScheme(website: string, scheme: "https" | "http"): string {
  const withoutScheme = website.trim().replace(/^https?:\/\//i, "");
  return `${scheme}://${withoutScheme}`;
}

type ProbeOutcome =
  | { kind: "ok"; finalUrl: string }
  | { kind: "failed"; reason: ReachabilityFailureReason };

/** One single real attempt — no retry here (probe() below owns that).
 * Never throws. Classifies any non-ok outcome into a real reason:
 * "timed_out" specifically for an AbortError (our own timeout fired,
 * no proof the site is actually down), "down" for any other thrown
 * error (DNS failure, connection refused, TLS error — real evidence of
 * a problem), or "blocked_automated_check"/"http_error" for a real
 * response that wasn't `ok` (see classifyUnreachableResponse). */
async function probeOnce(url: string, fetchImpl: typeof fetch): Promise<ProbeOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "PostScoreBot/1.0 (+https://postscore.app)" },
    });
    if (res.ok) return { kind: "ok", finalUrl: res.url };
    let bodySnippet: string | null = null;
    try {
      bodySnippet = (await res.text()).slice(0, BODY_SNIPPET_BYTES);
    } catch {
      bodySnippet = null;
    }
    return { kind: "failed", reason: classifyUnreachableResponse(res.status, bodySnippet) };
  } catch (err) {
    const isTimeout = (err as { name?: string } | null)?.name === "AbortError";
    return { kind: "failed", reason: isTimeout ? "timed_out" : "down" };
  } finally {
    clearTimeout(timer);
  }
}

/** One GET request with a hard timeout, following redirects — retries
 * exactly once, only on a timeout (see MAX_ATTEMPTS's own doc). */
async function probe(url: string, fetchImpl: typeof fetch): Promise<ProbeOutcome> {
  let last: ProbeOutcome = { kind: "failed", reason: "down" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await probeOnce(url, fetchImpl);
    if (last.kind === "ok" || last.reason !== "timed_out") return last;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return last;
}

export interface HttpsCheckResult {
  status: HttpsCheckStatus;
  /** Only set when status === "unreachable" — WHY neither the https://
   * nor the http:// attempt succeeded (see ReachabilityFailureReason's
   * own doc). When both attempts failed differently, moreSpecificReason
   * picks the more specific/confident one — a mere "timed_out" on one
   * scheme never suppresses a real "down"/http_error/blocked signal
   * from the other. */
  reason: ReachabilityFailureReason | null;
}

/** A probe that got a real response but was rejected here anyway (e.g.
 * redirected away from https:// on what we treat as the https attempt)
 * still proves the target is reachable, just not in the way we needed
 * — "http_error" is the honest, conservative label for that, never
 * "down" (a response WAS received). */
function toReason(outcome: ProbeOutcome): ReachabilityFailureReason {
  return outcome.kind === "failed" ? outcome.reason : "http_error";
}

/**
 * Determines whether a business's real website serves HTTPS by
 * actually requesting it, not by inspecting the URL string.
 *
 * Tries an upgraded https:// request first, regardless of what scheme
 * (if any) `website` was saved with — this is exactly what catches the
 * common case: Google lists "http://" or a bare domain, but the real
 * site serves HTTPS fine when asked directly. Only falls back to the
 * site's own http:// address if that direct HTTPS attempt fails.
 *
 * Returns "unreachable" — never "http_only" — whenever the check
 * simply couldn't complete either way, since a failed request proves
 * nothing about whether HTTPS actually works. When unreachable, also
 * returns WHY (see HttpsCheckResult.reason) so a caller can store and
 * honestly explain the real cause instead of a bare status.
 */
export async function checkWebsiteHttps(
  website: string,
  fetchImpl: typeof fetch = fetch
): Promise<HttpsCheckResult> {
  if (!website || website.trim().length === 0) {
    return { status: "unreachable", reason: "down" };
  }

  const httpsResult = await probe(withScheme(website, "https"), fetchImpl);
  if (httpsResult.kind === "ok" && httpsResult.finalUrl.toLowerCase().startsWith("https://")) {
    return { status: "https", reason: null };
  }

  const httpResult = await probe(withScheme(website, "http"), fetchImpl);
  if (httpResult.kind === "ok") {
    // A plain http:// request that itself got redirected to https:// is
    // still a confirmed working HTTPS endpoint.
    return {
      status: httpResult.finalUrl.toLowerCase().startsWith("https://") ? "https" : "http_only",
      reason: null,
    };
  }

  return { status: "unreachable", reason: moreSpecificReason(toReason(httpsResult), toReason(httpResult)) };
}
