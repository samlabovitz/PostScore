// Real, server-side collection of a business's deep website analysis —
// a live HTML fetch, a Google PageSpeed Insights call, and a website
// screenshot capture. See lib/scoring.ts's WebsiteAnalysis type for the
// frozen shape this produces and the website.performance_mobile /
// website.content_depth / website.contact_conversion checks that are
// the only things that ever read it.
//
// This module is intentionally NOT imported by lib/scoring.ts, which
// must stay pure and network-free — same isolation rule as
// lib/websiteHttps.ts. It's called once, at business save/re-save time
// (see collectWebsiteAnalysis's caller in app/actions/businesses.ts),
// and the result is cached onto the business row rather than re-run on
// every score view.
//
// Every probe here is best-effort and never throws: a slow, blocked, or
// misconfigured check degrades to null so the caller can honestly
// exclude it from scoring, never fabricate a value or fail the save.

import { analyzeWebsiteHtml } from "./websiteContentAnalysis";
import type { WebsiteContentSignals } from "./scoring";

const HTML_FETCH_TIMEOUT_MS = 8000;
/** Real Lighthouse audits genuinely take a while — this needs to be
 * generous enough that a normal site's audit can finish. */
const PAGESPEED_TIMEOUT_MS = 25000;
const SCREENSHOT_TIMEOUT_MS = 15000;

/** Never read past this many bytes of a fetched page's body — a
 * malicious or huge response should cost a bounded amount of memory/time,
 * not become an unbounded download just to check content depth. */
const MAX_HTML_BYTES = 2_000_000;

function withScheme(website: string, scheme: "https" | "http"): string {
  const withoutScheme = website.trim().replace(/^https?:\/\//i, "");
  return `${scheme}://${withoutScheme}`;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a website's real HTML for content analysis. A separate probe
 * from lib/websiteHttps.ts's checkWebsiteHttps() on purpose — that
 * function has its own narrow, already-tested contract (just an
 * ok/redirect check), and this one needs the actual body. Returns null
 * (never throws) on any failure, including the site blocking automated
 * requests (e.g. Cloudflare bot protection) — that's a real, honest
 * "couldn't analyze," not a failure of the target's actual HTTPS/uptime.
 */
export async function fetchWebsiteHtml(
  website: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!website || website.trim().length === 0) return null;

  for (const scheme of ["https", "http"] as const) {
    const res = await fetchWithTimeout(
      withScheme(website, scheme),
      HTML_FETCH_TIMEOUT_MS,
      {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": "PostScoreBot/1.0 (+https://postscore.app)" },
      },
      fetchImpl
    );
    if (!res || !res.ok) continue;
    try {
      const buf = await res.arrayBuffer();
      const bytes = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Calls Google's PageSpeed Insights API (mobile strategy) for a real
 * performance score. Returns null — never throws, never guesses — when
 * no API key is configured or the call fails/times out.
 */
export async function fetchPageSpeedMobileScore(
  website: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<number | null> {
  if (!website || website.trim().length === 0 || !apiKey) return null;

  const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  const url =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
    `?url=${encodeURIComponent(target)}&key=${encodeURIComponent(apiKey)}` +
    "&strategy=mobile&category=performance";

  const res = await fetchWithTimeout(url, PAGESPEED_TIMEOUT_MS, { method: "GET" }, fetchImpl);
  if (!res || !res.ok) return null;

  try {
    const json = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = json.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number" || Number.isNaN(score)) return null;
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  } catch {
    return null;
  }
}

/**
 * Captures a real screenshot of the live site via ScreenshotOne
 * (https://screenshotone.com) — a single synchronous GET that returns
 * raw image bytes directly, no job-polling API to integrate. Returns
 * null — never throws — when no key is configured, the call fails, or
 * the target blocks capture.
 */
export async function captureScreenshotBytes(
  website: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<Buffer | null> {
  if (!website || website.trim().length === 0 || !apiKey) return null;

  const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  const url =
    "https://api.screenshotone.com/take" +
    `?access_key=${encodeURIComponent(apiKey)}&url=${encodeURIComponent(target)}` +
    "&viewport_width=1440&viewport_height=900&format=png&full_page=false" +
    "&block_ads=true&block_cookie_banners=true&cache=false";

  const res = await fetchWithTimeout(url, SCREENSHOT_TIMEOUT_MS, { method: "GET" }, fetchImpl);
  if (!res || !res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;

  try {
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

export interface WebsiteAnalysisCollection {
  content: WebsiteContentSignals | null;
  mobilePerformanceScore: number | null;
  screenshotBytes: Buffer | null;
}

/**
 * Runs all three real probes concurrently — bounding total added
 * latency to roughly the slowest single probe (PageSpeed, ~25s worst
 * case) rather than their sum. Never throws: a failure in one probe
 * never blocks or discards the others (Promise.allSettled).
 */
export async function collectWebsiteAnalysis(
  website: string,
  keys: { pageSpeedApiKey: string | undefined; screenshotApiKey: string | undefined },
  fetchImpl: typeof fetch = fetch
): Promise<WebsiteAnalysisCollection> {
  const [htmlResult, pageSpeedResult, screenshotResult] = await Promise.allSettled([
    fetchWebsiteHtml(website, fetchImpl),
    fetchPageSpeedMobileScore(website, keys.pageSpeedApiKey, fetchImpl),
    captureScreenshotBytes(website, keys.screenshotApiKey, fetchImpl),
  ]);

  const html = htmlResult.status === "fulfilled" ? htmlResult.value : null;

  return {
    content: html ? analyzeWebsiteHtml(html) : null,
    mobilePerformanceScore: pageSpeedResult.status === "fulfilled" ? pageSpeedResult.value : null,
    screenshotBytes: screenshotResult.status === "fulfilled" ? screenshotResult.value : null,
  };
}
