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
import type { RenderedContentSignals, WebsiteContentSignals } from "./scoring";

const HTML_FETCH_TIMEOUT_MS = 8000;
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
 * extraction in fetchPageSpeedMobileScore below, and
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

export interface PageSpeedResult {
  mobilePerformanceScore: number | null;
  /** Only non-null when `categories` included "seo" or "accessibility"
   * (i.e. PAGESPEED_CSR_RECOVERY_CATEGORIES was requested) AND the call
   * actually succeeded — see RenderedContentSignals in lib/scoring.ts
   * for what each field means and how website.content_depth uses them. */
  renderedContentSignals: RenderedContentSignals | null;
}

const EMPTY_PAGESPEED_RESULT: PageSpeedResult = { mobilePerformanceScore: null, renderedContentSignals: null };

/**
 * Calls Google's PageSpeed Insights API (mobile strategy) for a real
 * performance score — and, when `categories` includes "seo"/
 * "accessibility" (see PAGESPEED_CSR_RECOVERY_CATEGORIES), recovers real
 * content signals from Lighthouse's rendered-DOM audits too, for a site
 * whose static HTML our own fetch can't read (a client-rendered shell).
 * Returns nulls — never throws, never guesses — when no API key is
 * configured or the call fails/times out.
 */
export async function fetchPageSpeedMobileScore(
  website: string,
  apiKey: string | undefined,
  categories: readonly string[] = PAGESPEED_DEFAULT_CATEGORIES,
  fetchImpl: typeof fetch = fetch
): Promise<PageSpeedResult> {
  if (!website || website.trim().length === 0 || !apiKey) return EMPTY_PAGESPEED_RESULT;

  const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
  const categoryParams = categories.map((c) => `&category=${encodeURIComponent(c)}`).join("");
  const url =
    "https://www.googleapis.com/pagespeedonline/v5/runPagespeed" +
    `?url=${encodeURIComponent(target)}&key=${encodeURIComponent(apiKey)}` +
    `&strategy=mobile${categoryParams}`;

  let res: Response | null = null;
  for (let attempt = 1; attempt <= PAGESPEED_MAX_ATTEMPTS; attempt++) {
    res = await fetchWithTimeout(url, PAGESPEED_TIMEOUT_MS, { method: "GET" }, fetchImpl);
    if (res) break;
    if (attempt < PAGESPEED_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, PAGESPEED_RETRY_DELAY_MS));
    }
  }
  if (!res || !res.ok) return EMPTY_PAGESPEED_RESULT;

  try {
    const json = (await res.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number } };
        audits?: Record<string, { score?: number | null; scoreDisplayMode?: string }>;
      };
    };
    const score = json.lighthouseResult?.categories?.performance?.score;
    const mobilePerformanceScore =
      typeof score === "number" && !Number.isNaN(score) ? Math.round(Math.max(0, Math.min(1, score)) * 100) : null;

    let renderedContentSignals: RenderedContentSignals | null = null;
    if (categories.includes("seo") || categories.includes("accessibility")) {
      const audits = json.lighthouseResult?.audits ?? {};
      // Real, Lighthouse-confirmed presence/absence from the rendered
      // DOM — see RenderedContentSignals' own doc comment (lib/scoring.ts)
      // for exactly what each value means and website.content_depth for
      // how it's scored. score===1 -> confirmed present, score===0 ->
      // confirmed absent, audit missing/other -> genuinely unknown (null).
      const boolFromAuditScore = (auditId: string): boolean | null => {
        const auditScore = audits[auditId]?.score;
        if (auditScore === 1) return true;
        if (auditScore === 0) return false;
        return null;
      };
      // heading-order's scoreDisplayMode is "notApplicable" specifically
      // when the rendered page has zero heading elements (nothing to
      // check the order of) — any other display mode means at least one
      // heading exists. An indirect proxy (the audit's real purpose is
      // order-correctness, not counting), but a reliable presence signal.
      const headingOrderAudit = audits["heading-order"];
      const hasHeadings = headingOrderAudit ? headingOrderAudit.scoreDisplayMode !== "notApplicable" : null;
      renderedContentSignals = {
        hasTitle: boolFromAuditScore("document-title"),
        hasMetaDescription: boolFromAuditScore("meta-description"),
        hasViewportTag: boolFromAuditScore("viewport"),
        hasHeadings,
      };
    }

    return { mobilePerformanceScore, renderedContentSignals };
  } catch {
    return EMPTY_PAGESPEED_RESULT;
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
  mobilePerformanceScore: number | null;
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
  const htmlPromise = fetchWebsiteHtml(website, fetchImpl);
  const contentPromise = htmlPromise.then((html) => (html ? analyzeWebsiteHtml(html) : null));

  const pageSpeedPromise = contentPromise.then((content) =>
    fetchPageSpeedMobileScore(
      website,
      keys.pageSpeedApiKey,
      content?.isLikelyClientRenderedShell ? PAGESPEED_CSR_RECOVERY_CATEGORIES : PAGESPEED_DEFAULT_CATEGORIES,
      fetchImpl
    )
  );

  const screenshotsPromise = options.captureScreenshots
    ? htmlPromise.then((html) => captureWebsiteScreenshots(website, html, keys.screenshotApiKey, fetchImpl))
    : Promise.resolve<WebsiteScreenshotCapture>({ screenshotBytes: null, additionalPages: [] });

  const [contentResult, pageSpeedResult, screenshotsResult] = await Promise.allSettled([
    contentPromise,
    pageSpeedPromise,
    screenshotsPromise,
  ]);

  const baseContent = contentResult.status === "fulfilled" ? contentResult.value : null;
  const pageSpeed = pageSpeedResult.status === "fulfilled" ? pageSpeedResult.value : EMPTY_PAGESPEED_RESULT;
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
    mobilePerformanceScore: pageSpeed.mobilePerformanceScore,
    screenshotBytes: screenshots.screenshotBytes,
    additionalPages: screenshots.additionalPages,
  };
}
