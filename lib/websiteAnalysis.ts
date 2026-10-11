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
  PagePresenceFailureReason,
  PagePresenceNote,
  PagePresenceResult,
  RenderedContentSignals,
  WebsiteContentSignals,
  WebsiteTrustAnalysis,
} from "./scoring";
import { classifyUnreachableResponse, moreSpecificReason, type ReachabilityFailureReason } from "./websiteReachability";
import {
  ABOUT_PAGE_KEYWORDS,
  ONLINE_ORDERING_LINK_KEYWORDS,
  SERVICES_PAGE_KEYWORDS,
  aboutContentPasses,
  extractMainContentHtml,
  extractVisibleText as extractMainContentVisibleText,
  findKeywordSection,
  findMenuPdfLink,
  findPdfMenuLink,
  isKnownOrderingPlatformHost,
  isLikelyJsRenderedShell,
  isMenuLabel,
  looksLikeImageOnlyMenu,
  looksLikeNonAboutTopicPage,
  SERVICES_PAGE_SECONDARY_KEYWORDS,
  sameBrandHost,
  servicesContentPasses,
} from "./pagePresenceDetection";
import {
  classifyWebsiteKind,
  compareListingInfo,
  detectAbandonedSignals,
  detectSpamSignals,
  extractCityFromAddress,
  findStaleNotices,
  looksLikePageNotFound,
} from "./websiteTrust";

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

// ---------------------------------------------------------------------
// Day 4 Step 2c: real About/Our-Story and Services/Products detection.
// See lib/pagePresenceDetection.ts for the pure content rules (main-
// content-only word counts, real listed items, the heading-level-aware
// section boundary) this calls into, and lib/scoring.ts's
// PagePresenceResult/website.about_presence/website.services_presence
// for how the result is scored and explained.
// ---------------------------------------------------------------------

/** Shared budget across both About and Services detection within one
 * scan — caps real extra network requests at MAX_PRESENCE_EXTRA_FETCHES
 * total, not per-kind, and caches by URL so a page that happens to
 * match both keyword lists (unlikely but possible) is only ever
 * fetched once. Deliberately held at 3 even though detectPagePresence
 * can now try several ranked candidates per kind plus the PDF/ordering
 * fallbacks (see its own doc) — "found anywhere wins" means trying MORE
 * real sources within the same budget, not a bigger budget; once the 3
 * real fetches are spent, remaining candidates are simply never tried
 * (same honest "budget exhausted, fall through" behavior as always).
 * Worst-case latency: 3 sequential fetches (when they all land on the
 * same kind's chain) at up to HTML_FETCH_TIMEOUT_MS*2 +
 * HTML_FETCH_RETRY_DELAY_MS (~24.5s) each ≈ 73.5s added on top of the
 * homepage fetch itself. */
const MAX_PRESENCE_EXTRA_FETCHES = 3;

type PresenceFetchOutcome =
  | { kind: "ok"; html: string }
  | { kind: "pdf" }
  | { kind: "broken_link" }
  | { kind: "failed"; reason: ReachabilityFailureReason };

/** One single real attempt at a matched candidate page — no retry here
 * (fetchPresenceCandidate below owns that). Never throws. Same
 * AbortError-vs-other-error timed_out/down split as every other probe
 * in this file. A real 404 is reported as its own "broken_link" outcome
 * (never folded into the generic http_error/couldnt_check bucket — a
 * dead nav link is stronger, more actionable evidence than an
 * inconclusive failure). A real PDF (by Content-Type, checked before
 * reading any body) is reported as "pdf" without ever reading its
 * content. */
async function fetchPresenceCandidateOnce(url: string, fetchImpl: typeof fetch): Promise<PresenceFetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTML_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "PostScoreBot/1.0 (+https://postscore.app)" },
      signal: controller.signal,
    });
    if (res.status === 404) return { kind: "broken_link" };
    if (!res.ok) {
      let bodySnippet: string | null = null;
      try {
        bodySnippet = (await res.text()).slice(0, 4000);
      } catch {
        bodySnippet = null;
      }
      return { kind: "failed", reason: classifyUnreachableResponse(res.status, bodySnippet) };
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("application/pdf")) return { kind: "pdf" };
    const html = await res.text();
    return { kind: "ok", html };
  } catch (err) {
    const isTimeout = (err as { name?: string } | null)?.name === "AbortError";
    return { kind: "failed", reason: isTimeout ? "timed_out" : "down" };
  } finally {
    clearTimeout(timer);
  }
}

/** Retries exactly once, only on a timeout — same reasoning as every
 * other probe/fetch in this file. Never retries a 404/PDF/real non-
 * timeout failure, since none of those would change on a second try. */
async function fetchPresenceCandidate(url: string, fetchImpl: typeof fetch): Promise<PresenceFetchOutcome> {
  let last: PresenceFetchOutcome = { kind: "failed", reason: "down" };
  for (let attempt = 1; attempt <= HTML_FETCH_MAX_ATTEMPTS; attempt++) {
    last = await fetchPresenceCandidateOnce(url, fetchImpl);
    if (last.kind !== "failed" || last.reason !== "timed_out") return last;
    if (attempt < HTML_FETCH_MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, HTML_FETCH_RETRY_DELAY_MS));
    }
  }
  return last;
}

/** A real keyword-matched candidate, carrying its own keyword tier (0 =
 * matched a core keyword, 1 = secondary-only) and how deep/specific its
 * path is — see findAllMatchingCandidates' own doc for why this ordering
 * matters. */
interface RankedCandidate extends DiscoveredPage {
  tier: number;
  locationMatch: boolean;
  pathSegments: number;
  pathLength: number;
}

/** The generic "label or path contains this keyword" substring rule —
 * used for every keyword EXCEPT ones in `strictKeywords` (see
 * isStrictLabelOrPathMatch). */
function isLooseLabelOrPathMatch(label: string, path: string, keyword: string): boolean {
  return `${label} ${path}`.toLowerCase().includes(keyword);
}

/** A stricter rule for the single bare "about" keyword — the real
 * Michael S. Lamonsoff PLLC / Canadian Tire / National 5 & 10 case: a
 * generic substring match on "about" trivially matches a CTA label like
 * "Learn More About Wrongful Death" (where "about" is a preposition,
 * not a page-type signal) or incidental page content, crediting an
 * unrelated practice-area/rewards/store-hours page as if it were a real
 * About-Us page. Only counts a candidate as a real About match when the
 * label itself STARTS WITH "about" (e.g. "About", "About Us", "About
 * the Firm") or the URL PATH has a whole segment that IS "about" /
 * "about-us" / "about_us" — never a bare substring buried in a longer
 * sentence or an unrelated slug. Every other About keyword (the more
 * specific multi-word phrases like "about us", "our story", "nosotros",
 * etc.) keeps the plain substring rule — "about" alone is the one
 * keyword generic enough to cause real false positives. */
function isStrictLabelOrPathMatch(label: string, path: string, keyword: string): boolean {
  if (keyword === "about") {
    const trimmedLabel = label.trim().toLowerCase();
    if (/^about\b/.test(trimmedLabel)) return true;
    const segments = path.toLowerCase().split("/").filter(Boolean);
    return segments.some((s) => /^about([-_]?us)?$/.test(s));
  }
  return isLooseLabelOrPathMatch(label, path, keyword);
}

/** Real path segments that mean "never a real About-Us page," no
 * matter what the label says — the real Canadian Tire case: a nav link
 * literally labeled "About Triangle ID" points at
 * triangle.canadiantire.ca/en/support/triangle-id.html, a loyalty-
 * rewards account page, not the business's own story. Checked once per
 * candidate in findAllMatchingCandidates, BEFORE any keyword's own
 * matching rule runs — a looser About keyword (e.g. "about our") could
 * otherwise still match a label like "About Our Rewards Program" even
 * though the strict bare-"about" rule alone would have rejected it, so
 * this exclusion has to apply universally per-candidate, not inside
 * just one keyword's own matcher. */
const ABOUT_EXCLUDED_PATH_SEGMENTS = ["support", "help", "account", "login", "rewards", "careers", "career"];

function isExcludedAboutPath(path: string): boolean {
  const segments = path.toLowerCase().split("/").filter(Boolean);
  return segments.some((s) => ABOUT_EXCLUDED_PATH_SEGMENTS.includes(s));
}

/** Same-brand (eTLD+1, see sameBrandHost's own doc) rather than exact
 * hostname — the real Chipotle/QDOBA/Canadian Tire/CTown case: a
 * chain's locator subdomain legitimately links to the brand's apex
 * domain or a sibling subdomain. The exact-host self-link exclusion
 * below stays exact, on purpose — that check is specifically "is this
 * literally the homepage itself", not a brand check.
 *
 * Returns EVERY real match, not just the first — deduped by URL, ordered:
 *   1. Core-keyword matches before secondary-only matches (`secondaryKeywords`
 *      — pass `[]` when the caller's keyword list has no tiering, e.g.
 *      About). The real Santa Fe Mexican Grill case this fixes: two real
 *      Catering pages (secondary-only) have longer URL slugs than the
 *      real "Newark Menus" page (core) and were winning the old deepest-
 *      path tiebreak purely on string length, spending the fetch budget
 *      before ever reaching the real menu pages. A candidate matching
 *      BOTH tiers (e.g. "Catering Menu") counts as core — ANY core match
 *      is enough.
 *   2. Within a tier, deepest/most-specific path first (most path
 *      segments, ties broken by longer path) — the real Michael S.
 *      Lamonsoff PLLC case: a shallow "Practice Areas" hub page
 *      (`/new-york`) and a real, deep, substantial page
 *      (`/new-york/product-liability-lawyer`) both match "practice
 *      areas"/"products" — trying the hub first and stopping there (the
 *      old first-match-wins behavior) shadowed the deep page's real
 *      content.
 * detectPagePresence tries these in this order and keeps going past a
 * failure — see its own doc ("found anywhere wins").
 */
function findAllMatchingCandidates(
  candidates: DiscoveredPage[],
  homepageUrl: URL,
  keywords: string[],
  secondaryKeywords: string[] = [],
  strictKeywords: string[] = [],
  locationHint?: string | null
): DiscoveredPage[] {
  const homeHostExact = normalizeHost(homepageUrl.hostname);
  const homePath = normalizePath(homepageUrl.pathname);
  const coreKeywords = keywords.filter((kw) => !secondaryKeywords.includes(kw));
  const lowerLocationHint = locationHint ? locationHint.toLowerCase() : null;
  const seen = new Set<string>();
  const matches: RankedCandidate[] = [];
  for (const c of candidates) {
    let u: URL;
    try {
      u = new URL(c.url);
    } catch {
      continue;
    }
    if (!sameBrandHost(u.hostname, homepageUrl.hostname)) continue;
    const path = normalizePath(u.pathname);
    if (normalizeHost(u.hostname) === homeHostExact && path === homePath) continue;
    // Never an About candidate at all — regardless of which keyword's
    // own matching rule would otherwise have matched it (the real
    // Canadian Tire case: "About Our Program"-style labels can match
    // via a LOOSER About keyword than the strict bare "about" rule
    // covers, so this exclusion must apply universally per-candidate,
    // not just inside one keyword's own matcher). See
    // isExcludedAboutPath's own doc.
    if (strictKeywords.includes("about") && isExcludedAboutPath(path)) continue;
    const key = `${u.origin}${path}`;
    if (seen.has(key)) continue;
    const matchKeyword = (kw: string) =>
      strictKeywords.includes(kw) ? isStrictLabelOrPathMatch(c.label, path, kw) : isLooseLabelOrPathMatch(c.label, path, kw);
    const matchesCore = coreKeywords.some(matchKeyword);
    const matchesAny = matchesCore || keywords.some(matchKeyword);
    if (!matchesAny) continue;
    seen.add(key);
    // The real Santa Fe Mexican Grill case: a multi-location chain's
    // "Newark Menus" and "Wilmington Menus" candidates both match the
    // core "menu" keyword equally — without a location-aware tiebreak,
    // path-depth/length alone can let a DIFFERENT branch's page win.
    // When locationHint (this business's own city) is known and a
    // candidate's own label/path names it, that candidate is preferred
    // over an equally-ranked one that doesn't.
    const locationMatch = !!lowerLocationHint && `${c.label} ${path}`.toLowerCase().includes(lowerLocationHint);
    matches.push({
      url: `${u.origin}${u.pathname}`,
      label: c.label,
      tier: matchesCore ? 0 : 1,
      locationMatch,
      pathSegments: path.split("/").filter(Boolean).length,
      pathLength: path.length,
    });
  }
  return matches
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.locationMatch) - Number(a.locationMatch) ||
        b.pathSegments - a.pathSegments ||
        b.pathLength - a.pathLength
    )
    .map((m) => ({ url: m.url, label: m.label }));
}

/** Services-only fallback candidate: a real "go order" link whose
 * target is either this same brand (eTLD+1) or a known third-party
 * ordering platform (see KNOWN_ORDERING_PLATFORM_HOSTS) — the real
 * Umami Express / Original Hot Bagels / Brew HaHa! case, where the
 * actual menu lives entirely off this detector's reach. Only ever
 * consulted as a last resort (see detectPagePresence) — a real
 * dedicated Services page or homepage section always wins when one
 * exists. */
function findOnlineOrderingCandidate(candidates: DiscoveredPage[], homepageUrl: URL): DiscoveredPage | null {
  const homeHostExact = normalizeHost(homepageUrl.hostname);
  const homePath = normalizePath(homepageUrl.pathname);
  for (const c of candidates) {
    let u: URL;
    try {
      u = new URL(c.url);
    } catch {
      continue;
    }
    if (normalizeHost(u.hostname) === homeHostExact && normalizePath(u.pathname) === homePath) continue;
    if (!sameBrandHost(u.hostname, homepageUrl.hostname) && !isKnownOrderingPlatformHost(u.hostname)) continue;
    const haystack = `${c.label} ${normalizePath(u.pathname)}`.toLowerCase();
    if (ONLINE_ORDERING_LINK_KEYWORDS.some((kw) => haystack.includes(kw))) {
      return { url: `${u.origin}${u.pathname}`, label: c.label };
    }
  }
  return null;
}

/** Bilingual Contact-page link keywords — "contact" is specific enough
 * on its own (unlike the bare "about") to need no stricter rule. */
const CONTACT_PAGE_LINK_KEYWORDS = ["contact", "contáctenos", "contactenos", "contacto", "contáctanos", "contactanos"];

/** Finds this site's own real Contact page link, if any — the real
 * Bagel Emporium case: a phone/hours/address only ever stated on a
 * dedicated Contact page, never the homepage, must still be checked
 * before any info-consistency conflict is reported (see
 * collectWebsiteTrust's own contactPageHtml doc). Same-brand host only;
 * never the homepage itself. */
function findContactPageCandidate(candidates: DiscoveredPage[], homepageUrl: URL): DiscoveredPage | null {
  const homeHostExact = normalizeHost(homepageUrl.hostname);
  const homePath = normalizePath(homepageUrl.pathname);
  for (const c of candidates) {
    let u: URL;
    try {
      u = new URL(c.url);
    } catch {
      continue;
    }
    if (!sameBrandHost(u.hostname, homepageUrl.hostname)) continue;
    const path = normalizePath(u.pathname);
    if (normalizeHost(u.hostname) === homeHostExact && path === homePath) continue;
    const haystack = `${c.label} ${path}`.toLowerCase();
    if (CONTACT_PAGE_LINK_KEYWORDS.some((kw) => haystack.includes(kw))) {
      return { url: `${u.origin}${u.pathname}`, label: c.label };
    }
  }
  return null;
}

/** Shared mutable state for one scan's about+services detection — a
 * single object so both calls (see detectPagePresence) draw from the
 * same MAX_PRESENCE_EXTRA_FETCHES budget and never double-fetch the
 * same URL. */
export interface PresenceBudget {
  fetchesUsed: number;
  cache: Map<string, PresenceFetchOutcome>;
}

export function newPresenceBudget(): PresenceBudget {
  return { fetchesUsed: 0, cache: new Map() };
}

async function fetchPresenceCandidateBudgeted(
  url: string,
  budget: PresenceBudget,
  fetchImpl: typeof fetch
): Promise<PresenceFetchOutcome | null> {
  const cached = budget.cache.get(url);
  if (cached) return cached;
  if (budget.fetchesUsed >= MAX_PRESENCE_EXTRA_FETCHES) return null;
  budget.fetchesUsed++;
  const outcome = await fetchPresenceCandidate(url, fetchImpl);
  budget.cache.set(url, outcome);
  return outcome;
}

/**
 * Real detection for whether a business's website has genuine
 * About/Our-Story or Services/Products content — see
 * lib/pagePresenceDetection.ts for the pure word-count/listed-items
 * rules this applies, and PagePresenceResult's own doc (lib/scoring.ts)
 * for exactly what each state/note means.
 *
 * "Found anywhere wins": tries every real source in turn — ranked
 * candidate pages (deepest/most specific path first, see
 * findAllMatchingCandidates), the homepage's own section, a direct
 * menu-PDF link on the homepage, and (Services only) an online-ordering
 * link — and returns `found` the moment ANY of them passes, never
 * stopping just because an earlier one failed. Only once every reachable
 * source has been tried and NONE passed does this give up:
 *   - `couldnt_check` when at least one source was genuinely unreadable
 *     (blocked/timed out/down/a JS-rendered shell) — we looked, but
 *     couldn't actually tell.
 *   - `not_found` when every source that answered answered cleanly (a
 *     real 200 with real-but-insufficient content, or a real 404) and
 *     NONE were unreadable — a genuine, confirmed absence.
 * A business is never told "not found" (and docked the point) just
 * because one of its pages happened to be unreadable — that's
 * couldnt_check's whole job.
 *
 * Order of sources, within a shared MAX_PRESENCE_EXTRA_FETCHES budget
 * (see PresenceBudget):
 *   0. The homepage's own static HTML — if it's a JS-rendered shell (see
 *      isLikelyJsRenderedShell), every other source is equally
 *      unreadable (no real nav to discover candidates from either), so
 *      this short-circuits straight to couldnt_check/"js_rendered" — the
 *      real Goldberg Hardware / Great Clips / Drybar - Midtown East case.
 *   1. Every ranked candidate page, deepest-path-first (the real Michael
 *      S. Lamonsoff PLLC case: a shallow "Practice Areas" hub page must
 *      never shadow a real, deep, substantial page that ALSO matched).
 *      Each one, in turn:
 *      - a real 404 is a readable failure (note "broken_link" if it's
 *        the first evidence kept) — try the next candidate;
 *      - a real unreachable failure (timeout/block/down/http_error)
 *        marks this detection as having seen something unreadable — try
 *        the next candidate, never an immediate couldnt_check return
 *        anymore, since a LATER candidate might still pass;
 *      - a real PDF counts as found (Services only, note "pdf_only"); a
 *        PDF for About isn't meaningful either way — try the next
 *        candidate;
 *      - a page that turns out to be a JS-rendered shell is ALSO treated
 *        as unreadable, not a hard stop — the real Chipotle case: its
 *        matched Services candidate is a shell, but a same-brand "Order
 *        Online" link still loads fine (step 4);
 *      - real content that passes -> found, done;
 *      - Services only, when a candidate's own content doesn't pass: try
 *        (i) a real PDF menu it links out to (findPdfMenuLink — the real
 *        Red Bowl wrapper-page case), then (ii) whether the candidate is
 *        itself labeled "Menu"/"Menú" (isMenuLabel) AND looks like an
 *        image-only menu (looksLikeImageOnlyMenu — the real Santa Fe
 *        Mexican Grill case; a Catering/Services page with a few photos,
 *        the real Brew HaHa! case, never qualifies). Either passing ->
 *        found; neither -> readable failure, try the next candidate.
 *   2. The homepage's own section under a matching heading
 *      (findKeywordSection) — tried regardless of whether any candidate
 *      existed, since "found anywhere wins."
 *   3. Services only: a real menu PDF linked DIRECTLY from the homepage
 *      itself, labeled with a menu-related keyword (findMenuPdfLink) —
 *      the real QDOBA case: "Download Our Menu" -> a real PDF on a
 *      totally different host (assets.ctfassets.net), never discoverable
 *      as a dedicated-page candidate since it points straight at a file.
 *   4. Services only, as a last resort: a real "Order online"/"Order
 *      now"/"View menu"/"Ordenar" link to this same brand or a known
 *      third-party ordering platform (Toast, ChowNow, Olo, Square,
 *      Clover, Popmenu, BentoBox, DoorDash, Uber Eats, Grubhub — see
 *      KNOWN_ORDERING_PLATFORM_HOSTS) that actually loads (found, note
 *      "online_ordering") — the real Umami Express / Chipotle case.
 * Never throws.
 */
export async function detectPagePresence(
  kind: "about" | "services",
  homepageHtml: string,
  homepageUrl: URL,
  candidates: DiscoveredPage[],
  budget: PresenceBudget,
  fetchImpl: typeof fetch,
  // This business's own city (see extractCityFromAddress) — only ever
  // used as a ranking TIEBREAK (see findAllMatchingCandidates'
  // locationMatch), never a hard filter: a candidate that doesn't name
  // the city can still be tried and win if nothing else does.
  locationHint?: string | null
): Promise<PagePresenceResult> {
  if (isLikelyJsRenderedShell(homepageHtml)) {
    return { state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "js_rendered", note: null };
  }

  const keywords = kind === "about" ? ABOUT_PAGE_KEYWORDS : SERVICES_PAGE_KEYWORDS;
  const ranked = findAllMatchingCandidates(
    candidates,
    homepageUrl,
    keywords,
    kind === "services" ? SERVICES_PAGE_SECONDARY_KEYWORDS : [],
    kind === "about" ? ["about"] : [],
    locationHint
  );

  let sawUnreadable = false;
  let unreadableEvidence: { url: string; reason: PagePresenceFailureReason } | null = null;
  let notFoundEvidence: { url: string; note: PagePresenceNote } | null = null;

  for (const candidate of ranked) {
    const outcome = await fetchPresenceCandidateBudgeted(candidate.url, budget, fetchImpl);
    if (!outcome) break; // budget exhausted — stop trying more candidates

    if (outcome.kind === "broken_link") {
      if (!notFoundEvidence) notFoundEvidence = { url: candidate.url, note: "broken_link" };
      continue;
    }
    if (outcome.kind === "failed") {
      sawUnreadable = true;
      if (!unreadableEvidence) unreadableEvidence = { url: candidate.url, reason: outcome.reason };
      continue;
    }
    if (outcome.kind === "pdf") {
      if (kind === "services") {
        return { state: "found", url: candidate.url, locatedOnHomepage: false, reason: null, note: "pdf_only" };
      }
      continue; // About: not meaningful either way — try the next source
    }

    // outcome.kind === "ok"
    if (isLikelyJsRenderedShell(outcome.html)) {
      sawUnreadable = true;
      if (!unreadableEvidence) unreadableEvidence = { url: candidate.url, reason: "js_rendered" };
      continue;
    }
    // The real National 5 & 10 case: a candidate whose URL path
    // contains "about" (e.g. /about/location-store-hours/) can still
    // be a genuine hours/location/directions/contact page, never a
    // real About-Us company story — checked here, against the real
    // fetched page's own title/heading, before any word-count pass
    // even runs. Never applied to Services — only About has this
    // specific "about"-in-the-path false-positive shape.
    if (kind === "about" && looksLikeNonAboutTopicPage(outcome.html)) {
      if (!notFoundEvidence) notFoundEvidence = { url: candidate.url, note: null };
      continue;
    }
    const mainHtml = extractMainContentHtml(outcome.html);
    const text = extractMainContentVisibleText(mainHtml);
    const passes = kind === "about" ? aboutContentPasses(text) : servicesContentPasses(mainHtml, text);
    if (passes) {
      return { state: "found", url: candidate.url, locatedOnHomepage: false, reason: null, note: null };
    }
    if (kind === "services") {
      // Real Red Bowl case.
      const pdfUrl = findPdfMenuLink(mainHtml, candidate.url);
      if (pdfUrl) {
        const pdfOutcome = await fetchPresenceCandidateBudgeted(pdfUrl, budget, fetchImpl);
        if (pdfOutcome?.kind === "pdf") {
          return { state: "found", url: pdfUrl, locatedOnHomepage: false, reason: null, note: "pdf_only" };
        }
      }
      // Real Santa Fe Mexican Grill case — only for a page actually
      // labeled Menu/Menú (never Brew HaHa!'s Catering page).
      if (isMenuLabel(candidate.label) && looksLikeImageOnlyMenu(mainHtml)) {
        return { state: "found", url: candidate.url, locatedOnHomepage: false, reason: null, note: "image_only" };
      }
    }
    if (!notFoundEvidence) notFoundEvidence = { url: candidate.url, note: null };
  }

  const mainHomepageHtml = extractMainContentHtml(homepageHtml);
  const section = findKeywordSection(mainHomepageHtml, keywords);
  if (section) {
    const passes = kind === "about" ? aboutContentPasses(section.text) : servicesContentPasses(section.html, section.text);
    if (passes) {
      return { state: "found", url: null, locatedOnHomepage: true, reason: null, note: null };
    }
  }

  if (kind === "services") {
    // Real QDOBA case: a direct homepage PDF link, never discoverable as
    // a dedicated-page candidate. A real failure here is evidence too
    // (unreadable or a readable-but-unconfirmed non-PDF response) — same
    // honest bookkeeping as the main candidate loop above, so a blocked
    // menu link never silently reads as a confident not_found (the real
    // Brew HaHa! "Order Online" -> a blocked Toast redirect case).
    const homepagePdfUrl = findMenuPdfLink(mainHomepageHtml, homepageUrl.toString());
    if (homepagePdfUrl) {
      const pdfOutcome = await fetchPresenceCandidateBudgeted(homepagePdfUrl, budget, fetchImpl);
      if (pdfOutcome?.kind === "pdf") {
        return { state: "found", url: homepagePdfUrl, locatedOnHomepage: false, reason: null, note: "pdf_only" };
      }
      if (pdfOutcome?.kind === "failed") {
        sawUnreadable = true;
        if (!unreadableEvidence) unreadableEvidence = { url: homepagePdfUrl, reason: pdfOutcome.reason };
      } else if (pdfOutcome && !notFoundEvidence) {
        notFoundEvidence = { url: homepagePdfUrl, note: pdfOutcome.kind === "broken_link" ? "broken_link" : null };
      }
    }

    const orderingCandidate = findOnlineOrderingCandidate(candidates, homepageUrl);
    if (orderingCandidate) {
      const outcome = await fetchPresenceCandidateBudgeted(orderingCandidate.url, budget, fetchImpl);
      if (outcome?.kind === "ok") {
        return { state: "found", url: orderingCandidate.url, locatedOnHomepage: false, reason: null, note: "online_ordering" };
      }
      if (outcome?.kind === "failed") {
        sawUnreadable = true;
        if (!unreadableEvidence) unreadableEvidence = { url: orderingCandidate.url, reason: outcome.reason };
      } else if (outcome && !notFoundEvidence) {
        notFoundEvidence = { url: orderingCandidate.url, note: outcome.kind === "broken_link" ? "broken_link" : null };
      }
    }
  }

  if (sawUnreadable && unreadableEvidence) {
    return {
      state: "couldnt_check",
      url: unreadableEvidence.url,
      locatedOnHomepage: false,
      reason: unreadableEvidence.reason,
      note: null,
    };
  }
  return {
    state: "not_found",
    url: notFoundEvidence?.url ?? null,
    locatedOnHomepage: false,
    reason: null,
    note: notFoundEvidence?.note ?? null,
  };
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
      measurement: { method: "field", fieldCategory, labScore: null, measuredAt: new Date().toISOString() },
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
    measurement: { method: "lab", fieldCategory: null, labScore: median(labScores), measuredAt: new Date().toISOString() },
    failureReason: null,
    renderedContentSignals,
    callCount: 3,
  };
}

// ---------------------------------------------------------------------
// Oct 10 site-trust collection — see lib/websiteTrust.ts for the pure
// detection rules this orchestrates, and lib/scoring.ts's
// WebsiteTrustAnalysis for the frozen shape this produces.
// ---------------------------------------------------------------------

const SAFE_BROWSING_TIMEOUT_MS = 10000;

/**
 * One real call to Google Safe Browsing's Lookup API (v4,
 * threatMatches:find) — checks this exact URL against Google's own
 * malware/phishing/unwanted-software blocklists. Needs a real
 * GOOGLE_SAFE_BROWSING_API_KEY (a Google Cloud API key with the Safe
 * Browsing API enabled); returns `{ checked: false }` — never throws,
 * never guessed as "clean" — when no key is configured or the call
 * itself fails (a real network/API error, distinct from "no key").
 */
export async function checkSafeBrowsing(
  url: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch
): Promise<{ checked: false } | { checked: true; threatFound: boolean; threatTypes: string[] }> {
  if (!apiKey) return { checked: false };
  const body = {
    client: { clientId: "postscore", clientVersion: "1.0" },
    threatInfo: {
      threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
      platformTypes: ["ANY_PLATFORM"],
      threatEntryTypes: ["URL"],
      threatEntries: [{ url }],
    },
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SAFE_BROWSING_TIMEOUT_MS);
    const res = await fetchImpl(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { checked: false };
    const json = (await res.json()) as { matches?: { threatType?: string }[] };
    const threatTypes = Array.from(
      new Set((json.matches ?? []).map((m) => m.threatType).filter((t): t is string => typeof t === "string"))
    );
    return { checked: true, threatFound: threatTypes.length > 0, threatTypes };
  } catch {
    return { checked: false };
  }
}

/**
 * Collects every real site-trust signal for one scan — spam/hacked
 * content, Safe Browsing, the real info-consistency comparison against
 * the Google listing, stale notices, and abandoned-site signals — from
 * the SAME already-fetched homepage HTML collectWebsiteAnalysis already
 * has, so this never spends an extra HTML fetch of its own. The one
 * real extra network call is Safe Browsing (see checkSafeBrowsing).
 * `now` is threaded through explicitly (never read internally) so
 * stale-notice/abandoned-site date math stays reproducible — see
 * AbandonedSiteFinding.looksAbandoned's own doc (lib/websiteTrust.ts)
 * for why that resolution can't happen later, inside scoring. Never
 * throws: a site we couldn't read at all gets an HONESTLY empty trust
 * result (no findings, not "clean" — see website.security's own
 * couldnt_check path, which keys off WebsiteAnalysis.content instead).
 */
export async function collectWebsiteTrust(
  homepageHtml: string | null,
  websiteUrl: string,
  google: {
    phone: string | null;
    address: string | null;
    openingHoursPeriods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null;
  },
  safeBrowsingApiKey: string | undefined,
  now: Date,
  fetchImpl: typeof fetch = fetch,
  // The site's own Contact page, when one was found and the shared
  // fetch budget allowed fetching it (see findContactPageCandidate and
  // collectWebsiteAnalysis's own orchestration) — real Bagel
  // Emporium-style evidence (a phone/hours/address that's only stated
  // on a dedicated Contact page, never the homepage) must be checked
  // BEFORE any conflict is reported, not just whatever the homepage
  // alone states. Passed to compareListingInfo as a SEPARATE text
  // source (never concatenated with the homepage's own text first —
  // see its own secondaryText doc for the real Miami Watersports case
  // that guards against) and only ever used for the info-consistency
  // comparison below — never spam/stale-notice/abandoned-site
  // detection, which stay homepage-only by design.
  contactPageHtml: string | null = null
): Promise<WebsiteTrustAnalysis> {
  const checkedAt = now.toISOString();
  const target = /^https?:\/\//i.test(websiteUrl.trim()) ? websiteUrl.trim() : `https://${websiteUrl.trim()}`;

  let websiteKind: WebsiteTrustAnalysis["websiteKind"] = null;
  try {
    websiteKind = classifyWebsiteKind(new URL(target).hostname);
  } catch {
    websiteKind = null;
  }

  const safeBrowsingPromise = checkSafeBrowsing(target, safeBrowsingApiKey, fetchImpl);

  if (!homepageHtml) {
    const safeBrowsing = await safeBrowsingPromise;
    return {
      spamSignals: [],
      safeBrowsingThreat: safeBrowsing.checked ? { threatFound: safeBrowsing.threatFound, threatTypes: safeBrowsing.threatTypes } : null,
      safeBrowsingChecked: safeBrowsing.checked,
      infoConflicts: [],
      staleNotices: [],
      abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
      websiteKind,
      listingLinkBroken: false,
      checkedAt,
    };
  }

  const wholePageText = extractMainContentVisibleText(homepageHtml);
  const contactPageText = contactPageHtml ? extractMainContentVisibleText(contactPageHtml) : null;
  const [spamSignals, safeBrowsing] = await Promise.all([
    Promise.resolve(detectSpamSignals(homepageHtml)),
    safeBrowsingPromise,
  ]);

  return {
    spamSignals,
    safeBrowsingThreat: safeBrowsing.checked ? { threatFound: safeBrowsing.threatFound, threatTypes: safeBrowsing.threatTypes } : null,
    safeBrowsingChecked: safeBrowsing.checked,
    infoConflicts: compareListingInfo(wholePageText, google, contactPageText),
    staleNotices: findStaleNotices(wholePageText, now),
    abandonedSignals: detectAbandonedSignals(wholePageText, now),
    websiteKind,
    listingLinkBroken: looksLikePageNotFound(wholePageText),
    checkedAt,
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
  /** Real About/Our-Story detection — see PagePresenceResult's own doc
   * (lib/scoring.ts) and detectPagePresence above. */
  aboutPresence: PagePresenceResult;
  /** Same real detection as aboutPresence, for Services/Products/Menu
   * content. */
  servicesPresence: PagePresenceResult;
  /** Real site-trust signals (hacked/spam, Safe Browsing, info
   * consistency vs. the Google listing, stale notices, abandoned-site
   * signals) — see collectWebsiteTrust's own doc and WebsiteTrustAnalysis
   * (lib/scoring.ts). */
  websiteTrust: WebsiteTrustAnalysis;
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
  keys: { pageSpeedApiKey: string | undefined; screenshotApiKey: string | undefined; safeBrowsingApiKey?: string | undefined },
  options: { captureScreenshots: boolean },
  google: {
    phone: string | null;
    address: string | null;
    openingHoursPeriods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null;
  } = { phone: null, address: null, openingHoursPeriods: null },
  fetchImpl: typeof fetch = fetch
): Promise<WebsiteAnalysisCollection> {
  const now = new Date();
  // This business's own city, derived once from its real Google
  // address — used only as a soft ranking tiebreak for About/Services
  // candidates on a multi-location chain's site (see
  // findAllMatchingCandidates' own locationMatch doc) and to scope the
  // site-trust phone/address/hours comparison to this location's own
  // text (see restrictToLocationWindow in lib/websiteTrust.ts).
  const locationHint = extractCityFromAddress(google.address);
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

  // Candidate pages (nav links + sitemap) are discovered ONCE and
  // shared, along with a single budget object, between About/Services
  // presence detection and the Contact-page fetch for site-trust
  // comparison below — a Contact-page fetch "counts toward the
  // existing fetch budget" per its own design, never an unbounded
  // extra network cost on top.
  const candidatesPromise: Promise<{ homepageUrl: URL; candidates: DiscoveredPage[] } | null> = htmlResultPromise.then(async (r) => {
    if (!r.html) return null;
    const target = /^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`;
    let homepageUrl: URL;
    try {
      homepageUrl = new URL(target);
    } catch {
      return null;
    }
    const candidates = [...extractLinkCandidates(r.html, homepageUrl), ...(await fetchSitemapLocs(homepageUrl, fetchImpl))];
    return { homepageUrl, candidates };
  });
  const sharedPresenceBudget = newPresenceBudget();

  const presencePromise: Promise<{ about: PagePresenceResult; services: PagePresenceResult }> = Promise.all([
    htmlResultPromise,
    candidatesPromise,
  ]).then(async ([r, disc]) => {
    if (!r.html) {
      const reason = r.failureReason ?? "down";
      const couldntCheck: PagePresenceResult = { state: "couldnt_check", url: null, locatedOnHomepage: false, reason, note: null };
      return { about: couldntCheck, services: couldntCheck };
    }
    if (!disc) {
      const notFound: PagePresenceResult = { state: "not_found", url: null, locatedOnHomepage: false, reason: null, note: null };
      return { about: notFound, services: notFound };
    }
    const [about, services] = await Promise.all([
      detectPagePresence("about", r.html, disc.homepageUrl, disc.candidates, sharedPresenceBudget, fetchImpl, locationHint),
      detectPagePresence("services", r.html, disc.homepageUrl, disc.candidates, sharedPresenceBudget, fetchImpl, locationHint),
    ]);
    return { about, services };
  });

  const contactPageHtmlPromise: Promise<string | null> = Promise.all([htmlResultPromise, candidatesPromise]).then(async ([r, disc]) => {
    if (!r.html || !disc) return null;
    const contactCandidate = findContactPageCandidate(disc.candidates, disc.homepageUrl);
    if (!contactCandidate) return null;
    const outcome = await fetchPresenceCandidateBudgeted(contactCandidate.url, sharedPresenceBudget, fetchImpl);
    return outcome?.kind === "ok" ? outcome.html : null;
  });

  const trustPromise = Promise.all([htmlResultPromise, contactPageHtmlPromise]).then(([r, contactPageHtml]) =>
    collectWebsiteTrust(r.html, website, google, keys.safeBrowsingApiKey, now, fetchImpl, contactPageHtml)
  );

  const [htmlResult, contentResult, pageSpeedResult, screenshotsResult, presenceResult, trustResult] = await Promise.allSettled([
    htmlResultPromise,
    contentPromise,
    pageSpeedPromise,
    screenshotsPromise,
    presencePromise,
    trustPromise,
  ]);

  const htmlFailureReason = htmlResult.status === "fulfilled" ? htmlResult.value.failureReason : "down";
  const baseContent = contentResult.status === "fulfilled" ? contentResult.value : null;
  const pageSpeed = pageSpeedResult.status === "fulfilled" ? pageSpeedResult.value : EMPTY_MOBILE_PERFORMANCE_RESULT;
  const screenshots =
    screenshotsResult.status === "fulfilled" ? screenshotsResult.value : { screenshotBytes: null, additionalPages: [] };
  const FALLBACK_PRESENCE: PagePresenceResult = { state: "couldnt_check", url: null, locatedOnHomepage: false, reason: "down", note: null };
  const presence = presenceResult.status === "fulfilled" ? presenceResult.value : { about: FALLBACK_PRESENCE, services: FALLBACK_PRESENCE };
  const EMPTY_TRUST: WebsiteTrustAnalysis = {
    spamSignals: [],
    safeBrowsingThreat: null,
    safeBrowsingChecked: false,
    infoConflicts: [],
    staleNotices: [],
    abandonedSignals: { newestDateFound: null, templateLeftovers: [], looksAbandoned: false },
    websiteKind: null,
    listingLinkBroken: false,
    checkedAt: now.toISOString(),
  };
  const websiteTrust = trustResult.status === "fulfilled" ? trustResult.value : EMPTY_TRUST;

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
    aboutPresence: presence.about,
    servicesPresence: presence.services,
    websiteTrust,
  };
}
