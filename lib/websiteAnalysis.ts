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
import type {
  FieldSpeedCategory,
  MobilePerformanceFailure,
  MobilePerformanceMeasurement,
  RenderedContentSignals,
  WebsiteContentSignals,
} from "./scoring";
import { classifyUnreachableResponse, moreSpecificReason, type ReachabilityFailureReason } from "./websiteReachability";

/** Widened from 8000ms (Day 4 Task "timed_out vs down" fix) — see
 * lib/websiteHttps.ts's own TIMEOUT_MS doc for the real Colorful Yun
 * Nan case this addresses. */
const HTML_FETCH_TIMEOUT_MS = 12000;
/** One retry when (and only when) an attempt specifically timed out —
 * same reasoning as lib/websiteHttps.ts's own MAX_ATTEMPTS. */
const HTML_FETCH_MAX_ATTEMPTS = 2;
const HTML_FETCH_RETRY_DELAY_MS = 500;
/** Real Lighthouse audits genuinely take a while — this needs to be
 * generous enough that a normal site's audit can finish. */
const PAGESPEED_TIMEOUT_MS = 30000;
/** One retry after a timeout/network failure (never after a real HTTP
 * error response) — PageSpeed audits are intermittently slow enough to
 * blow even a 30s budget under load, and a single retry recovers most of
 * those without meaningfully lengthening a scan that was already going to
 * take ~30s anyway. */
const PAGESPEED_MAX_ATTEMPTS = 2;
const PAGESPEED_RETRY_DELAY_MS = 2000;
const SCREENSHOT_TIMEOUT_MS = 15000;
const SITEMAP_TIMEOUT_MS = 6000;

/** Never read past this many bytes of a fetched page's body — a
 * malicious or huge response should cost a bounded amount of memory/time,
 * not become an unbounded download just to check content depth. */
const MAX_HTML_BYTES = 2_000_000;

/** How many *other* real pages (beyond the homepage) get a screenshot per
 * scan — keeps the added ScreenshotOne cost/time bounded regardless of
 * how big a site's nav or sitemap is. Total captures per scan is this
 * plus the one homepage screenshot. */
const MAX_ADDITIONAL_PAGES = 4;

/** Only real discovered links whose visible text or URL path mentions one
 * of these count as a "key page" worth screenshotting — deliberately not
 * "the first N nav links," so a site's utility links (login, privacy
 * policy, social) never crowd out the pages an owner actually cares about
 * seeing. One page picked per keyword, in this priority order. */
const KEY_PAGE_KEYWORDS = ["services", "about", "contact", "menu"] as const;

/** Categories requested on every normal PageSpeed call — just the real
 * performance score. */
const PAGESPEED_DEFAULT_CATEGORIES = ["performance"] as const;
/** Widened category set requested ONLY when the homepage's own static
 * HTML was already detected as a client-rendered shell
 * (WebsiteContentSignals.isLikelyClientRenderedShell) — seo+accessibility
 * make Lighthouse's real rendered-Chrome run also compute the
 * document-title/meta-description/viewport/heading-order audits this
 * module recovers content signals from (see the RenderedContentSignals
 * extraction in fetchMobilePerformance below, and
 * website.content_depth in lib/scoring.ts, which is the only thing that
 * reads them). Never requested for a normal site — real added
 * Lighthouse-run cost, deliberately paid only where the static crawl is
 * known to be useless. */
const PAGESPEED_CSR_RECOVERY_CATEGORIES = ["performance", "seo", "accessibility"] as const;

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

export interface FetchWebsiteHtmlResult {
  html: string | null;
  /** WHY html is null — see ReachabilityFailureReason's own doc. Never
   * set when html is non-null. When both the https:// and http://
   * attempt fail differently, keeps the more specific/actionable of
   * the two via moreSpecificReason — a mere "timed_out" on one scheme
   * never suppresses a real "down"/http_error/blocked signal from the
   * other. */
  failureReason: ReachabilityFailureReason | null;
}

type HtmlFetchOutcome = { kind: "ok"; html: string } | { kind: "failed"; reason: ReachabilityFailureReason };

/** One single real attempt for one scheme — no retry here
 * (fetchHtmlForScheme below owns that). Never throws. Distinguishes a
 * bare timeout (AbortError — "timed_out", no proof the site is down)
 * from any other thrown error ("down" — real evidence of a problem),
 * same reasoning as lib/websiteHttps.ts's probeOnce. */
async function fetchHtmlOnce(url: string, fetchImpl: typeof fetch): Promise<HtmlFetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTML_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "PostScoreBot/1.0 (+https://postscore.app)" },
      signal: controller.signal,
    });
    if (!res.ok) {
      let bodySnippet: string | null = null;
      try {
        bodySnippet = (await res.text()).slice(0, 4000);
      } catch {
        bodySnippet = null;
      }
      return { kind: "failed", reason: classifyUnreachableResponse(res.status, bodySnippet) };
    }
    try {
      const buf = await res.arrayBuffer();
      const bytes = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
      return { kind: "ok", html: new TextDecoder("utf-8").decode(bytes) };
    } catch {
      return { kind: "failed", reason: "http_error" };
    }
  } catch (err) {
    const isTimeout = (err as { name?: string } | null)?.name === "AbortError";
    return { kind: "failed", reason: isTimeout ? "timed_out" : "down" };
  } finally {
    clearTimeout(timer);
  }
}

/** Retries exactly once, only when the first attempt specifically
 * timed out — same reasoning as lib/websiteHttps.ts's own probe(). */
async function fetchHtmlForScheme(url: string, fetchImpl: typeof fetch): Promise<HtmlFetchOutcome> {
  let last: HtmlFetchOutcome = { kind: "failed", reason: "down" };
  for (let attempt = 1; attempt <= HTML_FETCH_MAX_ATTEMPTS; attempt++) {
    last = await fetchHtmlOnce(url, fetchImpl);
    if (last.kind === "ok" || last.reason !== "timed_out") return last;
    if (attempt < HTML_FETCH_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, HTML_FETCH_RETRY_DELAY_MS));
    }
  }
  return last;
}

/**
 * Fetches a website's real HTML for content analysis. A separate probe
 * from lib/websiteHttps.ts's checkWebsiteHttps() on purpose — that
 * function has its own narrow, already-tested contract (just an
 * ok/redirect check), and this one needs the actual body. Never throws:
 * any failure, including the site blocking automated requests (e.g.
 * Cloudflare bot protection), degrades to html: null plus a real reason
 * — that's a real, honest "couldn't analyze," not a failure of the
 * target's actual HTTPS/uptime.
 */
export async function fetchWebsiteHtml(
  website: string,
  fetchImpl: typeof fetch = fetch
): Promise<FetchWebsiteHtmlResult> {
  if (!website || website.trim().length === 0) return { html: null, failureReason: "down" };

  let worstReason: ReachabilityFailureReason | null = null;
  for (const scheme of ["https", "http"] as const) {
    const outcome = await fetchHtmlForScheme(withScheme(website, scheme), fetchImpl);
    if (outcome.kind === "ok") return { html: outcome.html, failureReason: null };
    worstReason = worstReason === null ? outcome.reason : moreSpecificReason(worstReason, outcome.reason);
  }
  return { html: null, failureReason: worstReason ?? "down" };
}

/** A real internal page discovered on the homepage's nav or sitemap.xml,
 * not yet screenshotted — see WebsiteAnalysisPage in lib/scoring.ts for
 * the final, saved shape once a capture attempt has run. */
interface DiscoveredPage {
  label: string;
  url: string;
}

function decodeBasicEntitiesForLinkText(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Pulls every same-page-parseable `<a href>` out of a homepage's raw
 * HTML as an absolute-URL candidate, alongside its real visible link
 * text (used for both keyword matching and the UI label) — deliberately
 * regex-based, same reasoning as lib/websiteContentAnalysis.ts: a
 * handful of honest candidates, not a faithful DOM reconstruction. */
function extractLinkCandidates(html: string, baseUrl: URL): DiscoveredPage[] {
  const candidates: DiscoveredPage[] = [];
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || /^(#|mailto:|tel:|javascript:)/i.test(rawHref)) continue;
    let absolute: URL;
    try {
      absolute = new URL(rawHref, baseUrl);
    } catch {
      continue;
    }
    const text = decodeBasicEntitiesForLinkText(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    candidates.push({ url: absolute.toString(), label: text });
  }
  return candidates;
}

/** Best-effort sitemap.xml fetch — a real site's sitemap is the other
 * honest source of "pages that actually exist" beyond whatever happens
 * to be linked from the homepage's nav. Returns [] (never throws) if
 * there's no sitemap, it's unreachable, or it doesn't parse — this is a
 * supplementary signal, not something the scan should ever wait long for
 * or fail over. */
async function fetchSitemapLocs(homepageUrl: URL, fetchImpl: typeof fetch): Promise<DiscoveredPage[]> {
  const res = await fetchWithTimeout(
    `${homepageUrl.origin}/sitemap.xml`,
    SITEMAP_TIMEOUT_MS,
    { method: "GET" },
    fetchImpl
  );
  if (!res || !res.ok) return [];
  try {
    const xml = await res.text();
    const locMatches = xml.match(/<loc>([^<]+)<\/loc>/gi) ?? [];
    // No link text to offer for a sitemap-only URL — label comes from
    // the matched keyword itself when one of these is picked below.
    return locMatches
      .map((m) => m.replace(/<\/?loc>/gi, "").trim())
      .filter((u) => u.length > 0)
      .slice(0, 200)
      .map((url) => ({ url, label: "" }));
  } catch {
    return [];
  }
}

function normalizeHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Picks up to MAX_ADDITIONAL_PAGES real, same-domain candidates —
 * never the homepage itself, never a duplicate, and never a page that
 * doesn't actually mention one of KEY_PAGE_KEYWORDS in its link text or
 * URL path. One winner per keyword, in KEY_PAGE_KEYWORDS' priority
 * order, so a site with more matches than the cap still gets a
 * representative spread rather than e.g. four "services" variants. */
function pickKeyPages(candidates: DiscoveredPage[], homepageUrl: URL): DiscoveredPage[] {
  const homeHost = normalizeHost(homepageUrl.hostname);
  const homePath = normalizePath(homepageUrl.pathname);
  const seen = new Set<string>();
  const picked: DiscoveredPage[] = [];

  for (const keyword of KEY_PAGE_KEYWORDS) {
    if (picked.length >= MAX_ADDITIONAL_PAGES) break;

    const match = candidates.find((c) => {
      let u: URL;
      try {
        u = new URL(c.url);
      } catch {
        return false;
      }
      if (normalizeHost(u.hostname) !== homeHost) return false;
      const path = normalizePath(u.pathname);
      if (path === homePath) return false;
      const key = `${u.origin}${path}`;
      if (seen.has(key)) return false;
      const haystack = `${c.label.toLowerCase()} ${path.toLowerCase()}`;
      return haystack.includes(keyword);
    });
    if (!match) continue;

    const u = new URL(match.url);
    const path = normalizePath(u.pathname);
    seen.add(`${u.origin}${path}`);
    const label = match.label.length > 0 && match.label.length <= 40
      ? match.label
      : keyword[0].toUpperCase() + keyword.slice(1);
    picked.push({ label, url: `${u.origin}${u.pathname}` });
  }

  return picked;
}

/**
 * Discovers up to MAX_ADDITIONAL_PAGES real internal pages beyond the
 * homepage — from the homepage's own nav links (already-fetched HTML, no
 * extra request) and, best-effort, sitemap.xml. Never fabricates a page:
 * every result here is a URL that was actually found on the site. Never
 * throws.
 */
async function discoverKeyPages(
  website: string,
  homepageHtml: string | null,
  fetchImpl: typeof fetch
): Promise<DiscoveredPage[]> {
  const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  let homepageUrl: URL;
  try {
    homepageUrl = new URL(target);
  } catch {
    return [];
  }

  const candidates: DiscoveredPage[] = homepageHtml ? extractLinkCandidates(homepageHtml, homepageUrl) : [];
  candidates.push(...(await fetchSitemapLocs(homepageUrl, fetchImpl)));

  const picked = pickKeyPages(candidates, homepageUrl);
  console.log(
    `[websiteAnalysis] discovered ${picked.length} additional page(s): ${picked.map((p) => `${p.label} (${p.url})`).join(", ") || "none"}`
  );
  return picked;
}

export interface AdditionalPageCapture {
  label: string;
  url: string;
  screenshotBytes: Buffer | null;
}

/** Captures a screenshot for each discovered page in parallel — bounded
 * by MAX_ADDITIONAL_PAGES, so worst-case added latency is one
 * SCREENSHOT_TIMEOUT_MS, not one per page. A page whose capture fails
 * stays in the result with screenshotBytes: null (never dropped), so the
 * caller can show an honest "couldn't capture this page" instead of
 * silently having fewer pages than were actually discovered. */
async function captureAdditionalPageScreenshots(
  pages: DiscoveredPage[],
  screenshotApiKey: string | undefined,
  fetchImpl: typeof fetch
): Promise<AdditionalPageCapture[]> {
  if (pages.length === 0) return [];
  const results = await Promise.allSettled(
    pages.map((p) => captureScreenshotBytes(p.url, screenshotApiKey, fetchImpl))
  );
  const captured = pages.map((p, i) => ({
    label: p.label,
    url: p.url,
    screenshotBytes: results[i].status === "fulfilled" ? results[i].value : null,
  }));
  console.log(
    `[websiteAnalysis] additional page captures: ${captured
      .map((c) => `${c.label}: ${c.screenshotBytes ? `${c.screenshotBytes.length} bytes` : "couldn't capture"}`)
      .join(", ")}`
  );
  return captured;
}

/** The subset of PageSpeed Insights' real JSON response this module
 * reads — both the lab (lighthouseResult) and real-user field-data
 * (loadingExperience/originLoadingExperience) portions of the same
 * response. */
interface RawPageSpeedResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { score?: number | null; scoreDisplayMode?: string }>;
  };
  /** Real Chrome UX Report data for this exact URL, when Google has
   * enough real-visitor traffic to report it. */
  loadingExperience?: { overall_category?: string };
  /** Same real CrUX data, aggregated across the whole origin — Google's
   * fallback for a URL that individually doesn't have enough traffic to
   * report on its own. */
  originLoadingExperience?: { overall_category?: string };
}

function isFieldSpeedCategory(value: unknown): value is FieldSpeedCategory {
  return value === "FAST" || value === "AVERAGE" || value === "SLOW";
}

/** A single PageSpeed attempt's real outcome — see
 * MobilePerformanceFailure in lib/scoring.ts for what each failure kind
 * means to an owner. `error` covers both a thrown non-timeout exception
 * (DNS/network failure reaching PageSpeed itself — rare, since this is
 * a request to Google's own API, not the target site) and a malformed/
 * unparsable response body. */
type PageSpeedAttemptOutcome =
  | { kind: "ok"; response: RawPageSpeedResponse }
  | { kind: "timed_out" }
  | { kind: "http_error"; status: number }
  | { kind: "error" };

/** HTTP statuses worth retrying — 429 (rate limited) and any 5xx
 * (PageSpeed/Google-side failure) are plausibly transient; any other
 * non-ok status (400, 404, …) means this exact request is malformed or
 * the target can't be audited at all, so retrying it wastes a real
 * call for no real chance of success. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** One real HTTP call to PageSpeed Insights (mobile strategy) — the
 * low-level building block fetchMobilePerformance composes into the
 * real field-data-first, lab-median-fallback measurement below.
 * Retries once (PAGESPEED_MAX_ATTEMPTS) on a timeout, a thrown network
 * error, OR a retryable HTTP status (429/5xx, see isRetryableStatus) —
 * never on any other non-ok response, since that wouldn't be fixed by
 * trying again. Never throws; always resolves to a real outcome,
 * tracking exactly why on failure. */
async function fetchPageSpeedRunOnce(
  website: string,
  apiKey: string,
  categories: readonly string[],
  fetchImpl: typeof fetch
): Promise<PageSpeedAttemptOutcome> {
  const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  const categoryParams = categories.map((c) => `&category=${encodeURIComponent(c)}`).join("");
  const url =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
    `?url=${encodeURIComponent(target)}&key=${encodeURIComponent(apiKey)}` +
    `&strategy=mobile${categoryParams}`;

  let lastOutcome: PageSpeedAttemptOutcome = { kind: "error" };

  for (let attempt = 1; attempt <= PAGESPEED_MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);
    let shouldRetry = false;
    try {
      const res = await fetchImpl(url, { method: "GET", signal: controller.signal });
      if (res.ok) {
        try {
          lastOutcome = { kind: "ok", response: (await res.json()) as RawPageSpeedResponse };
        } catch {
          lastOutcome = { kind: "error" };
          shouldRetry = true;
        }
      } else {
        lastOutcome = { kind: "http_error", status: res.status };
        shouldRetry = isRetryableStatus(res.status);
      }
    } catch (err) {
      lastOutcome = (err as { name?: string })?.name === "AbortError" ? { kind: "timed_out" } : { kind: "error" };
      shouldRetry = true;
    } finally {
      clearTimeout(timer);
    }

    if (lastOutcome.kind === "ok" || !shouldRetry) break;
    if (attempt < PAGESPEED_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PAGESPEED_RETRY_DELAY_MS));
    }
  }

  return lastOutcome;
}

function extractLabScore(raw: RawPageSpeedResponse): number | null {
  const score = raw.lighthouseResult?.categories?.performance?.score;
  return typeof score === "number" && !Number.isNaN(score) ? Math.round(Math.max(0, Math.min(1, score)) * 100) : null;
}

/** URL-level field data first, origin-level second — see
 * MobilePerformanceMeasurement's own doc (lib/scoring.ts) for why each
 * is preferred over the lab fallback, and in that order (a URL's own
 * real visitors beat its origin's aggregate whenever Google reports
 * both). A missing/malformed/"NONE" category means Google genuinely has
 * no field data at that level, not a real classification — never
 * treated as one. */
function extractFieldCategory(raw: RawPageSpeedResponse): FieldSpeedCategory | null {
  const urlCategory = raw.loadingExperience?.overall_category;
  if (isFieldSpeedCategory(urlCategory)) return urlCategory;
  const originCategory = raw.originLoadingExperience?.overall_category;
  if (isFieldSpeedCategory(originCategory)) return originCategory;
  return null;
}

function extractRenderedContentSignals(
  raw: RawPageSpeedResponse,
  categories: readonly string[]
): RenderedContentSignals | null {
  if (!categories.includes("seo") && !categories.includes("accessibility")) return null;
  const audits = raw.lighthouseResult?.audits ?? {};
  // Real, Lighthouse-confirmed presence/absence from the rendered DOM —
  // see RenderedContentSignals' own doc comment (lib/scoring.ts) for
  // exactly what each value means and website.content_depth for how
  // it's scored. score===1 -> confirmed present, score===0 -> confirmed
  // absent, audit missing/other -> genuinely unknown (null).
  const boolFromAuditScore = (auditId: string): boolean | null => {
    const auditScore = audits[auditId]?.score;
    if (auditScore === 1) return true;
    if (auditScore === 0) return false;
    return null;
  };
  // heading-order's scoreDisplayMode is "notApplicable" specifically
  // when the rendered page has zero heading elements (nothing to check
  // the order of) — any other display mode means at least one heading
  // exists. An indirect proxy (the audit's real purpose is order-
  // correctness, not counting), but a reliable presence signal.
  const headingOrderAudit = audits["heading-order"];
  const hasHeadings = headingOrderAudit ? headingOrderAudit.scoreDisplayMode !== "notApplicable" : null;
  return {
    hasTitle: boolFromAuditScore("document-title"),
    hasMetaDescription: boolFromAuditScore("meta-description"),
    hasViewportTag: boolFromAuditScore("viewport"),
    hasHeadings,
  };
}

/** Standard median: the middle value of an odd-length sorted list, or
 * the average of the two middle values of an even-length one — used so
 * one outlier run (a cold cache, a network hiccup) can't single-
 * handedly swing the lab fallback the way trusting any one run would. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface MobilePerformanceFetchResult {
  measurement: MobilePerformanceMeasurement | null;
  /** WHY measurement is null — see MobilePerformanceFailure's own doc
   * (lib/scoring.ts). Never set when measurement is non-null. */
  failureReason: MobilePerformanceFailure | null;
  /** Only non-null when `categories` included "seo" or "accessibility"
   * (i.e. PAGESPEED_CSR_RECOVERY_CATEGORIES was requested) AND the
   * first run actually succeeded — see RenderedContentSignals in
   * lib/scoring.ts for what each field means and how
   * website.content_depth uses them. */
  renderedContentSignals: RenderedContentSignals | null;
  /** Real PageSpeed Insights calls this measurement spent — 1 when the
   * first run already carried real-user field data, 3 when it didn't
   * and the median-of-3 lab fallback ran (see fetchMobilePerformance's
   * own doc). Exposed for tests and per-scan quota accounting; never
   * read by scoring itself. */
  callCount: number;
}

const EMPTY_MOBILE_PERFORMANCE_RESULT: MobilePerformanceFetchResult = {
  measurement: null,
  failureReason: { kind: "no_api_key", status: null },
  renderedContentSignals: null,
  callCount: 0,
};

/** Picks the single most useful failure reason to store/show when
 * every attempt failed — a real HTTP error PageSpeed itself returned
 * is the most diagnostic (http_error), a clean timeout is still
 * specific (timed_out), and anything else falls back to the generic
 * "error". Scans every real attempt outcome, never just the last one,
 * so (e.g.) a timeout on attempt 1 followed by a 500 on the retry
 * reports the 500, not the timeout. */
function pickFailureReason(outcomes: PageSpeedAttemptOutcome[]): MobilePerformanceFailure {
  const httpError = outcomes.find((o): o is { kind: "http_error"; status: number } => o.kind === "http_error");
  if (httpError) return { kind: "http_error", status: httpError.status };
  if (outcomes.some((o) => o.kind === "timed_out")) return { kind: "timed_out", status: null };
  return { kind: "error", status: null };
}

/**
 * The real measurement behind website.performance_mobile — see
 * MobilePerformanceMeasurement in lib/scoring.ts for the full field-vs-
 * lab reasoning. Order:
 *
 * 1. Run PageSpeed Insights once. If its response carries real-user
 *    field data (loadingExperience for this exact URL, or, failing
 *    that, originLoadingExperience for the whole origin), use it — 1
 *    call total, and the most accurate signal available.
 * 2. Otherwise (no field data, or the first run itself failed), fall
 *    back to a lab measurement: fire 2 more runs in parallel (we
 *    already have the first), then take the MEDIAN of however many of
 *    the 3 succeeded — never trusting any single run, since the same
 *    live site's Lighthouse score can swing by dozens of points
 *    between two runs minutes apart (see mobile-speed-change.md's
 *    investigation). Up to 3 calls total.
 * 3. If every attempt failed (no field data AND zero successful lab
 *    runs), the measurement is null — "couldn't verify," excluded from
 *    scoring exactly like today, never a fabricated value.
 *
 * Runs once per scan (see collectWebsiteAnalysis's own doc) — never on
 * page load. Returns EMPTY_MOBILE_PERFORMANCE_RESULT — never throws —
 * when no API key is configured or the URL is empty.
 */
export async function fetchMobilePerformance(
  website: string,
  apiKey: string | undefined,
  categories: readonly string[] = PAGESPEED_DEFAULT_CATEGORIES,
  fetchImpl: typeof fetch = fetch
): Promise<MobilePerformanceFetchResult> {
  if (!website || website.trim().length === 0) {
    return { measurement: null, failureReason: null, renderedContentSignals: null, callCount: 0 };
  }
  if (!apiKey) return EMPTY_MOBILE_PERFORMANCE_RESULT;

  const first = await fetchPageSpeedRunOnce(website, apiKey, categories, fetchImpl);
  const renderedContentSignals = first.kind === "ok" ? extractRenderedContentSignals(first.response, categories) : null;

  const fieldCategory = first.kind === "ok" ? extractFieldCategory(first.response) : null;
  if (fieldCategory) {
    return {
      measurement: { method: "field", fieldCategory, labScore: null },
      failureReason: null,
      renderedContentSignals,
      callCount: 1,
    };
  }

  // No field data for this site (or the first run itself failed) — fall
  // back to the honest lab measurement. We already have one attempt
  // (`first`); fire the other two in parallel rather than serially, so
  // this fallback costs one extra round-trip, not two.
  const [second, third] = await Promise.all([
    fetchPageSpeedRunOnce(website, apiKey, categories, fetchImpl),
    fetchPageSpeedRunOnce(website, apiKey, categories, fetchImpl),
  ]);
  const outcomes = [first, second, third];
  const labScores = outcomes
    .map((o) => (o.kind === "ok" ? extractLabScore(o.response) : null))
    .filter((s): s is number => s !== null);

  if (labScores.length === 0) {
    return { measurement: null, failureReason: pickFailureReason(outcomes), renderedContentSignals, callCount: 3 };
  }

  return {
    measurement: { method: "lab", fieldCategory: null, labScore: median(labScores) },
    failureReason: null,
    renderedContentSignals,
    callCount: 3,
  };
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

export interface WebsiteScreenshotCapture {
  screenshotBytes: Buffer | null;
  /** Up to MAX_ADDITIONAL_PAGES other real discovered pages, each with
   * its own best-effort screenshot — see AdditionalPageCapture. */
  additionalPages: AdditionalPageCapture[];
}

/**
 * The one real place ScreenshotOne ever gets called: captures the
 * homepage plus up to MAX_ADDITIONAL_PAGES discovered pages, in
 * parallel (bounded by one SCREENSHOT_TIMEOUT_MS, not one per page).
 * Deliberately its own exported function, not inlined into
 * collectWebsiteAnalysis below: this is real, billed API cost, and both
 * a first scan (via collectWebsiteAnalysis) and the explicit, rate-
 * limited "Refresh screenshots" action (app/actions/websiteScreenshots.ts)
 * need to trigger the exact same capture logic — a regular re-scan
 * never calls this at all, see collectWebsiteAnalysis's captureScreenshots
 * option. Never throws.
 */
export async function captureWebsiteScreenshots(
  website: string,
  homepageHtml: string | null,
  screenshotApiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<WebsiteScreenshotCapture> {
  const [screenshotResult, additionalPagesResult] = await Promise.allSettled([
    captureScreenshotBytes(website, screenshotApiKey, fetchImpl),
    discoverKeyPages(website, homepageHtml, fetchImpl).then((pages) =>
      captureAdditionalPageScreenshots(pages, screenshotApiKey, fetchImpl)
    ),
  ]);

  return {
    screenshotBytes: screenshotResult.status === "fulfilled" ? screenshotResult.value : null,
    additionalPages: additionalPagesResult.status === "fulfilled" ? additionalPagesResult.value : [],
  };
}

export interface WebsiteAnalysisCollection {
  content: WebsiteContentSignals | null;
  /** WHY content is null — see ReachabilityFailureReason's own doc. */
  contentFetchFailureReason: ReachabilityFailureReason | null;
  mobilePerformance: MobilePerformanceMeasurement | null;
  /** WHY mobilePerformance is null — see MobilePerformanceFailure's own
   * doc (lib/scoring.ts). */
  mobilePerformanceFailureReason: MobilePerformanceFailure | null;
  screenshotBytes: Buffer | null;
  /** Up to MAX_ADDITIONAL_PAGES other real discovered pages, each with
   * its own best-effort screenshot — see AdditionalPageCapture. Always []
   * when options.captureScreenshots was false — a regular re-scan reuses
   * whatever's already stored rather than getting a fresh (possibly
   * empty) discovery result here. */
  additionalPages: AdditionalPageCapture[];
}

/**
 * Runs every real probe concurrently where possible — bounding total
 * added latency to roughly the slowest single probe (PageSpeed, up to
 * ~62s worst case with its retry) rather than their sum. Never throws: a
 * failure in one probe never blocks or discards the others
 * (Promise.allSettled).
 *
 * One deliberate exception to "concurrent": PageSpeed now waits on the
 * HTML fetch + content analysis (contentPromise below), because knowing
 * whether this site is a detected client-rendered shell
 * (isLikelyClientRenderedShell) is what decides which Lighthouse
 * categories to request — PAGESPEED_CSR_RECOVERY_CATEGORIES (adds seo +
 * accessibility, recovering real content signals for a site our own
 * static fetch can't read) or the normal, cheaper
 * PAGESPEED_DEFAULT_CATEGORIES. This adds the HTML fetch's own latency
 * (typically well under a second for a real site; capped at
 * HTML_FETCH_TIMEOUT_MS worst case) in front of every PageSpeed call now,
 * in exchange for exactly one right-sized PSI call per scan rather than
 * either always paying for the wider categories or firing a second call
 * after the fact.
 *
 * options.captureScreenshots controls the one probe that costs real,
 * billed ScreenshotOne API calls: pass true only for a business's first
 * scan (see saveBusiness in app/actions/businesses.ts) or false for
 * every regular re-scan afterward, which still refreshes content/
 * PageSpeed/scoring as always but reuses the already-stored screenshots
 * untouched. Screenshots only depend on the raw HTML (not the content
 * analysis), so they're unaffected by the sequencing above and still run
 * concurrently with PageSpeed.
 */
export async function collectWebsiteAnalysis(
  website: string,
  keys: { pageSpeedApiKey: string | undefined; screenshotApiKey: string | undefined },
  options: { captureScreenshots: boolean },
  fetchImpl: typeof fetch = fetch
): Promise<WebsiteAnalysisCollection> {
  const htmlResultPromise = fetchWebsiteHtml(website, fetchImpl);
  const contentPromise = htmlResultPromise.then((r) => (r.html ? analyzeWebsiteHtml(r.html) : null));

  const pageSpeedPromise = contentPromise.then((content) =>
    fetchMobilePerformance(
      website,
      keys.pageSpeedApiKey,
      content?.isLikelyClientRenderedShell ? PAGESPEED_CSR_RECOVERY_CATEGORIES : PAGESPEED_DEFAULT_CATEGORIES,
      fetchImpl
    )
  );

  const screenshotsPromise = options.captureScreenshots
    ? htmlResultPromise.then((r) => captureWebsiteScreenshots(website, r.html, keys.screenshotApiKey, fetchImpl))
    : Promise.resolve<WebsiteScreenshotCapture>({ screenshotBytes: null, additionalPages: [] });

  const [htmlResult, contentResult, pageSpeedResult, screenshotsResult] = await Promise.allSettled([
    htmlResultPromise,
    contentPromise,
    pageSpeedPromise,
    screenshotsPromise,
  ]);

  const htmlFailureReason = htmlResult.status === "fulfilled" ? htmlResult.value.failureReason : "down";
  const baseContent = contentResult.status === "fulfilled" ? contentResult.value : null;
  const pageSpeed = pageSpeedResult.status === "fulfilled" ? pageSpeedResult.value : EMPTY_MOBILE_PERFORMANCE_RESULT;
  const screenshots =
    screenshotsResult.status === "fulfilled" ? screenshotsResult.value : { screenshotBytes: null, additionalPages: [] };

  // Only attach PageSpeed's recovered signals when the shell was
  // actually detected — the static-fetch fields (hasTitle etc.) on
  // baseContent are left exactly as the crawl found them either way, so
  // the raw static result is never overwritten/lost even once recovery
  // succeeds (see RenderedContentSignals' doc comment in lib/scoring.ts).
  const content: WebsiteContentSignals | null = baseContent
    ? {
        ...baseContent,
        renderedContentSignals: baseContent.isLikelyClientRenderedShell ? pageSpeed.renderedContentSignals : null,
      }
    : null;

  return {
    content,
    contentFetchFailureReason: content ? null : htmlFailureReason,
    mobilePerformance: pageSpeed.measurement,
    mobilePerformanceFailureReason: pageSpeed.measurement ? null : pageSpeed.failureReason,
    screenshotBytes: screenshots.screenshotBytes,
    additionalPages: screenshots.additionalPages,
  };
}
