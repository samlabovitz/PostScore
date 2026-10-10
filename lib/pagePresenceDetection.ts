// Pure, network-free detection of real About/Our-Story and
// Services/Products content inside a website's raw HTML — see
// lib/websiteAnalysis.ts's detectPagePresence for the real network
// orchestration (candidate page discovery via nav/sitemap links, the
// extra-page fetch with its own timeout/retry, PDF/404/blocked/timeout
// handling) that calls into this module, and lib/scoring.ts's
// PagePresenceResult / website.about_presence / website.services_presence
// for how the result is scored and explained.
//
// Deliberately regex/string based, same reasoning as
// lib/websiteContentAnalysis.ts: a handful of honest signals, not a
// faithful DOM reconstruction.
//
// Built from a real dry test (Day 4 Step 2c) against live business
// websites, which caught two real bugs this module's design fixes:
//   1. A matched heading's "section" must extend through its own
//      nested sub-headings (e.g. an h2 "Our Menu" followed by h3
//      "Appetizers"/"Soup"/...) and stop only at the next heading of
//      EQUAL OR HIGHER level — stopping at the very next heading of any
//      level reads a categorized menu/services list as empty, since the
//      real items live under per-category sub-headings.
//   2. Word counts and "real listed items" must be computed on MAIN
//      CONTENT ONLY, with <nav>/<header>/<footer> excluded first — a
//      real site's own nav links/site name/tagline (repeated on every
//      page) otherwise get counted as if they were real About/Services
//      prose, which they aren't.

export const ABOUT_PAGE_KEYWORDS: string[] = [
  "about us",
  "about",
  "our story",
  "our team",
  "meet the team",
  "meet our",
  "meet the",
  "who we are",
  "welcome to",
  "our studio",
  "our mission",
  "why choose us",
  "about our",
  "nosotros",
  "sobre nosotros",
  "quiénes somos",
  "quienes somos",
  "nuestra historia",
  "bienvenidos a",
  "bienvenido a",
  "nuestro estudio",
  "nuestra misión",
  "por qué elegirnos",
  "conozca a",
  "conoce a",
];

export const SERVICES_PAGE_KEYWORDS: string[] = [
  "services",
  "what we do",
  "menu",
  "products",
  "shop",
  "pricing",
  "treatments",
  "our work",
  "servicios",
  "menú",
  "productos",
  "tienda",
  "precios",
];

/** Below this many real words in a candidate About page/section, there's
 * not enough to count as genuine "about us" narrative — picked as
 * roughly 2-3 real sentences: achievable by a small business's modest
 * About paragraph, but well above a one-line "Est. 1995" teaser. */
export const MIN_WORDS_ABOUT = 40;
/** A real services/products listing naturally runs longer than a
 * one-paragraph About blurb once there's an actual list of items —
 * set higher than MIN_WORDS_ABOUT for that reason. */
export const MIN_WORDS_SERVICES = 60;
/** Real evidence of a LIST, not just a heading — a restaurant's menu
 * or a salon's service list realistically has at least this many
 * distinct `<li>` items once nav-only `<li>`s are excluded (see
 * extractMainContentHtml). */
export const MIN_LIST_ITEMS_SERVICES = 3;
/** An alternative to MIN_LIST_ITEMS_SERVICES for sites that structure a
 * services/menu listing as repeated sub-headings (one per item/category)
 * rather than a bulleted `<ul>` — e.g. "Service 01 / Service 02 / ...". */
export const MIN_SUBHEADINGS_SERVICES = 2;

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/**
 * Strips every real markup that is NEVER visible to a real visitor —
 * HTML comments, `<script>`, `<style>`, `<noscript>` (its content is
 * only shown to visitors with JavaScript disabled, not a real body
 * fact), and `<template>` (inert by spec until cloned by JS) — before
 * any downstream tag-stripping or counting. Fixes a real bug (Day 4
 * Task, the Bagel Emporium case): an HTML comment like
 * `<!--<p>YOM KIPPUR PRE-ORDERING IS DONE...</p>-->` left as-is, a
 * naive `/<[^>]+>/` tag-stripper treats the comment's OWN opening `<p>`
 * as the first "tag" (stopping at ITS `>`), so the real, genuinely
 * invisible comment text survives into "visible" text as if a real
 * visitor could read it. Comments are stripped FIRST, before
 * script/style/noscript/template, so a comment that happens to contain
 * a stray unmatched tag can't desynchronize the later patterns.
 */
function stripNonVisibleMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ");
}

/** Strips every non-visible markup kind (see stripNonVisibleMarkup),
 * then all remaining tags, decodes a few common entities, and
 * collapses whitespace — same approximation of "what a visitor
 * actually reads" as lib/websiteContentAnalysis.ts's own
 * extractVisibleText (kept as its own small copy here rather than a
 * cross-module export, matching this codebase's existing style of a few
 * small duplicated helpers over one over-centralized utility file). */
export function extractVisibleText(html: string): string {
  const withoutTags = stripNonVisibleMarkup(html).replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(withoutTags).replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

/**
 * Isolates real main content, excluding site-wide navigation and other
 * repeated boilerplate: when a `<main>` element exists (the common,
 * well-supported real-world signal for "this is the actual page
 * content"), uses ONLY what's inside it — which already excludes a
 * typical page's top-level `<header>`/`<footer>` entirely, since those
 * sit outside `<main>` in standard markup. When there's no `<main>` at
 * all, falls back to stripping `<header>`/`<footer>` from the whole
 * document instead of trusting it unfiltered. Either way, also strips
 * any `<nav>` found within the surviving content, since a secondary
 * in-page/mobile nav can appear inside `<main>` too. Never a faithful
 * boilerplate detector (e.g. a repeated promotional banner with no
 * semantic wrapper survives this) — just the single highest-value,
 * lowest-false-positive signal available without a real DOM.
 */
export function extractMainContentHtml(html: string): string {
  // Comments/script/style/noscript/template stripped FIRST, before any
  // of the boundary-finding below — so a stray `<li>`/`<h#>` sitting
  // inside a commented-out block (see stripNonVisibleMarkup's own doc)
  // can never be counted by a downstream caller as real markup.
  const cleaned = stripNonVisibleMarkup(html);
  const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const base = mainMatch
    ? mainMatch[1]
    : cleaned.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ").replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ");
  return base.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ");
}

export function matchesKeyword(haystack: string, keywords: string[]): string | null {
  const lower = haystack.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

export interface ContentSection {
  text: string;
  html: string;
}

/** Below this many real words, a `<b>`/`<strong>`-wrapped paragraph
 * reads as a real "heading" (a page builder's styled intro line, e.g.
 * Yoga Box's real `<p><b>Welcome to Yoga Box Hollywood — Our First Los
 * Angeles Studio!</b></p>`) rather than a bolded SENTENCE in the middle
 * of ordinary prose — which is never a heading. */
const MAX_PSEUDO_HEADING_WORDS = 20;
/** The heading-equivalent level a pseudo-heading is treated as for
 * section-boundary purposes (see findKeywordSection) — a real h1/h2 or
 * another pseudo-heading still ends its section; a deeper real h3-h6
 * nested inside its own narrative block does not. */
const PSEUDO_HEADING_LEVEL = 2;

interface HeadingMarker {
  index: number;
  endIndex: number;
  level: number;
  text: string;
}

/** Real `<h1>`-`<h6>` tags, same as always. */
function findRealHeadings(html: string): HeadingMarker[] {
  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const headings: HeadingMarker[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html)) !== null) {
    headings.push({ index: m.index, endIndex: m.index + m[0].length, level: Number(m[1]), text: extractVisibleText(m[2]) });
  }
  return headings;
}

/**
 * PSEUDO-headings: a `<p>` or `<div>` whose ENTIRE content is wrapped
 * in one `<b>`/`<strong>` tag, under MAX_PSEUDO_HEADING_WORDS — a page
 * builder's styled "heading" with no real semantic heading tag at all
 * (the real Yoga Box case: `<p><b>Welcome to Yoga Box Hollywood...</b></p>`,
 * never a real `<h#>`). Treated as PSEUDO_HEADING_LEVEL for section
 * boundaries. Deliberately requires the WHOLE block to be bold, not
 * just any bold text — a bolded word or phrase inside an ordinary
 * paragraph is never mistaken for a heading.
 */
function findPseudoHeadings(html: string): HeadingMarker[] {
  const pseudoRe = /<(p|div)\b[^>]*>\s*<(b|strong)\b[^>]*>([\s\S]*?)<\/\2>\s*<\/\1>/gi;
  const headings: HeadingMarker[] = [];
  let m: RegExpExecArray | null;
  while ((m = pseudoRe.exec(html)) !== null) {
    const text = extractVisibleText(m[3]);
    if (!text || wordCount(text) > MAX_PSEUDO_HEADING_WORDS) continue;
    headings.push({ index: m.index, endIndex: m.index + m[0].length, level: PSEUDO_HEADING_LEVEL, text });
  }
  return headings;
}

/**
 * Finds a heading — a real `<h1>`-`<h6>` tag OR a pseudo-heading (see
 * findPseudoHeadings) — in already-main-content-only HTML (see
 * extractMainContentHtml) whose own text matches one of `keywords`,
 * and returns the real content between it and the next heading of
 * EQUAL OR HIGHER level (h1 highest ... h6 lowest, pseudo-headings
 * treated as PSEUDO_HEADING_LEVEL) — never just the next heading of
 * any level, which would cut a matched h2 "Our Menu" off at its own
 * first h3 sub-category and miss everything nested under it (the real
 * bug this fixes — see this module's own top-of-file doc). Returns null
 * when nothing matches at all.
 */
export function findKeywordSection(mainContentHtml: string, keywords: string[]): ContentSection | null {
  const headings = [...findRealHeadings(mainContentHtml), ...findPseudoHeadings(mainContentHtml)].sort(
    (a, b) => a.index - b.index
  );
  for (let i = 0; i < headings.length; i++) {
    if (!matchesKeyword(headings[i].text, keywords)) continue;
    const start = headings[i].endIndex;
    const matchedLevel = headings[i].level;
    let end = mainContentHtml.length;
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= matchedLevel) {
        end = headings[j].index;
        break;
      }
    }
    // Bounded the same way a dedicated page's own content is implicitly
    // bounded by MAX_HTML_BYTES elsewhere — a pathological document
    // with no further same-level heading for thousands of bytes should
    // still cost a bounded amount of work to scan.
    end = Math.min(end, start + 20000);
    const sectionHtml = mainContentHtml.slice(start, end);
    return { text: extractVisibleText(sectionHtml), html: sectionHtml };
  }
  return null;
}

/**
 * Real evidence of a LIST of services/products/menu items, not just a
 * heading that says so — any one of: enough `<li>` elements, enough
 * repeated sub-headings (a "Service 01 / Service 02 / ..." pattern), or
 * a visible `$price`. Operates on already-main-content-only HTML/text
 * (see extractMainContentHtml) so a site's own nav `<li>`s never count.
 */
export function hasRealListedItems(mainContentHtml: string, visibleText: string): boolean {
  const liCount = (mainContentHtml.match(/<li\b/gi) ?? []).length;
  const subHeadingCount = (mainContentHtml.match(/<h[2-6][\s>]/gi) ?? []).length;
  const hasPriceLike = /\$\s?\d/.test(visibleText);
  return liCount >= MIN_LIST_ITEMS_SERVICES || subHeadingCount >= MIN_SUBHEADINGS_SERVICES || hasPriceLike;
}

/** Below this many DISTINCT `$price` values, a page's `$` mentions read
 * as incidental (a sales pitch's "as low as $10/month") rather than a
 * real, itemized price list — the real Yoga Box pricing-page case this
 * exists for: $119/$103/$190/$25, four distinct real prices, correctly
 * recognized as a genuine price list even though the page's own text is
 * naturally terse (price labels, not prose). */
export const MIN_DISTINCT_PRICES_SERVICES = 3;

/** Counts DISTINCT dollar amounts mentioned in `text` — "$25" twice
 * counts once, "$25" and "$119" count as two. Deliberately distinct
 * values, not raw occurrences: a page that just repeats the same price
 * several times is not stronger evidence of a real, itemized list than
 * a page that mentions it once. */
export function countDistinctPrices(text: string): number {
  const matches = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
  const normalized = matches.map((m) => m.replace(/\s|,/g, ""));
  return new Set(normalized).size;
}

/** True only when a real About/Our-Story section (already isolated to
 * main content) has enough real words to count as genuine narrative. */
export function aboutContentPasses(text: string): boolean {
  return wordCount(text) >= MIN_WORDS_ABOUT;
}

/**
 * True only when a real Services/Products section (already isolated to
 * main content) has real listed items AND either enough real words OR
 * enough distinct real prices — a heading plus one sentence never
 * counts, but a short, genuine price list (naturally terse — short
 * labels and numbers, not prose) is no longer penalized just for being
 * short. See MIN_DISTINCT_PRICES_SERVICES's own doc for the real case
 * this fixes.
 */
export function servicesContentPasses(mainContentHtml: string, text: string): boolean {
  if (!hasRealListedItems(mainContentHtml, text)) return false;
  return wordCount(text) >= MIN_WORDS_SERVICES || countDistinctPrices(text) >= MIN_DISTINCT_PRICES_SERVICES;
}

/** Bilingual link-text signals for "this links to a real PDF menu" —
 * the real Red Bowl case this exists for: its "Menu" page is a bare
 * wrapper with almost no real text, whose only real content is a
 * button linking out to an actual PDF menu. Deliberately a short,
 * specific list (not generic words like "menu," already covered by
 * SERVICES_PAGE_KEYWORDS) so this only fires on a genuine "go read the
 * PDF" link, never an incidental page that happens to mention a menu. */
export const PDF_MENU_LINK_KEYWORDS: string[] = ["view pdf menu", "menu pdf", "pdf menu", "ver menú", "ver menu"];

/**
 * Finds the one real link, within already-main-content-only HTML (see
 * extractMainContentHtml), that looks like it points at a PDF menu —
 * by its `href` ending in `.pdf`, or by its own link text matching
 * PDF_MENU_LINK_KEYWORDS. Returns the resolved absolute URL of the
 * FIRST such link, or null when none exists. This only identifies a
 * CANDIDATE — the real network layer (lib/websiteAnalysis.ts's
 * detectPagePresence) still has to fetch it and confirm it actually
 * loads as a real PDF (200, `application/pdf`) before trusting it;
 * never read or guessed at beyond that.
 */
export function findPdfMenuLink(mainContentHtml: string, baseUrl: string): string | null {
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(mainContentHtml)) !== null) {
    const href = m[1].trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    const label = extractVisibleText(m[2]).toLowerCase();
    const isPdfHref = /\.pdf(?:[?#]|$)/i.test(href);
    const isPdfLabel = PDF_MENU_LINK_KEYWORDS.some((kw) => label.includes(kw));
    if (!isPdfHref && !isPdfLabel) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}
