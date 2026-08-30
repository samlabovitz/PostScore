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

/** Short enough that a slow or dead site can't hang a save for long,
 * long enough for a normal site's TLS handshake + redirect chain. */
const TIMEOUT_MS = 5000;

function withScheme(website: string, scheme: "https" | "http"): string {
  const withoutScheme = website.trim().replace(/^https?:\/\//i, "");
  return `${scheme}://${withoutScheme}`;
}

interface ProbeResult {
  ok: boolean;
  finalUrl: string;
}

/** One GET request with a hard timeout, following redirects. Returns
 * null (never throws) on any failure — timeout, DNS error, connection
 * refused, TLS error, or the site blocking the request — since all of
 * those mean the same thing to the caller: this attempt proved
 * nothing, not that the target definitely doesn't work. */
async function probe(url: string, fetchImpl: typeof fetch): Promise<ProbeResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "PostScoreBot/1.0 (+https://postscore.app)" },
    });
    return { ok: res.ok, finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
 * nothing about whether HTTPS actually works.
 */
export async function checkWebsiteHttps(
  website: string,
  fetchImpl: typeof fetch = fetch
): Promise<HttpsCheckStatus> {
  if (!website || website.trim().length === 0) {
    return "unreachable";
  }

  const httpsResult = await probe(withScheme(website, "https"), fetchImpl);
  if (httpsResult?.ok && httpsResult.finalUrl.toLowerCase().startsWith("https://")) {
    return "https";
  }

  const httpResult = await probe(withScheme(website, "http"), fetchImpl);
  if (httpResult?.ok) {
    // A plain http:// request that itself got redirected to https:// is
    // still a confirmed working HTTPS endpoint.
    return httpResult.finalUrl.toLowerCase().startsWith("https://") ? "https" : "http_only";
  }

  return "unreachable";
}
