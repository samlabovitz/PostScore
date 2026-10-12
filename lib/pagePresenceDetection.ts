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
  // Bare "mission" too — a nav link or heading simply titled "Mission"
  // (not "Our Mission") is the real El Diablo Burritos case: a genuine
  // 46-word founder/mission narrative that "our mission" alone missed.
  "mission",
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
  "misión",
  "por qué elegirnos",
  "conozca a",
  "conoce a",
];

/**
 * CORE keywords — a page labeled with one of these is unambiguously a
 * business's real services/menu/pricing page, and (see
 * findAllMatchingCandidates in lib/websiteAnalysis.ts) always outranks a
 * SECONDARY-only match regardless of path depth. "Practice Areas"/"Areas
 * of Practice" is the standard legal-industry term for a law firm's own
 * services page — the real Law Offices of Gregg L. Smith and Pardalis
 * and Nohavicka Lawyers case: both list real, substantial content under
 * this heading/link text and nothing resembling "services" at all.
 */
export const SERVICES_PAGE_CORE_KEYWORDS: string[] = [
  "services",
  "what we do",
  "menu",
  "products",
  "shop",
  "pricing",
  "treatments",
  "our work",
  "practice areas",
  "areas of practice",
  "servicios",
  "menú",
  "productos",
  "tienda",
  "precios",
  "áreas de práctica",
];

/**
 * SECONDARY keywords — real, specific evidence of services content
 * (worth matching on their own when nothing core matches), but never
 * worth preferring over a core-labeled page just because its own URL
 * path happens to be longer/deeper. The real Santa Fe Mexican Grill
 * case this ordering fixes: two real Catering pages (matched only via
 * "catering") have longer path slugs than the real "Newark Menus"
 * page (matched via the core "menu" keyword) and were winning the old
 * deepest-path-first tiebreak purely on string length, spending the
 * fetch budget before ever reaching the real menu pages.
 */
export const SERVICES_PAGE_SECONDARY_KEYWORDS: string[] = [
  // Real Yoga Box / fitness-studio case: a class schedule IS the
  // services offering for a studio, under a label that's never going
  // to say "services". Deliberately "class schedule", not bare
  // "schedule" — a bare "schedule" keyword was matching unrelated CTA
  // links (e.g. "Schedule a Free Consultation") and crediting whatever
  // page that link happened to point at (the real Pardalis and
  // Nohavicka false-positive this fixes).
  "classes",
  "class schedule",
  // Real catering-page case (restaurants routinely have a dedicated
  // Catering page/link that's never labeled "services").
  "catering",
  // Real rental-listing case (equipment/venue/space rental businesses).
  "rentals",
  "rental",
  "clases",
  "horario de clases",
  "alquiler",
];

export const SERVICES_PAGE_KEYWORDS: string[] = [...SERVICES_PAGE_CORE_KEYWORDS, ...SERVICES_PAGE_SECONDARY_KEYWORDS];

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
    // The real Pop Culture Vulture case: our own MAX_HTML_BYTES fetch
    // cap (lib/websiteAnalysis.ts) can truncate a large real page
    // mid-way through a huge inline `<script>` (a SPA's embedded
    // preload JSON, megabytes long) — leaving it with no matching
    // `</script>` at all. The rule above requires a real closing tag,
    // so everything after the cut — raw JS/JSON, including a generic
    // client-side-routing "Page not found" error-page STRING TEMPLATE
    // meant for other routes, never this one — leaked through as if it
    // were real visible page text. Any `<script` still unclosed after
    // the rule above must be exactly this truncated case, so strip it
    // to the end of the string too, rather than exposing its raw
    // contents as "visible text."
    .replace(/<script\b[^>]*>[\s\S]*$/gi, " ")
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
  /** The matched heading's own text (Step 2g). */
  heading?: string;
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
 * A THIRD heading shape, narrower than findPseudoHeadings: a `<li>`
 * whose own text (no nested `<ul>`/`<ol>`/`<li>` — a real section-label
 * item, never a wrapper around a whole sub-list) is short and matches
 * one of `keywords` directly. Real page-builder sites (the Modern
 * Liquors Google Sites case) structure a section's own label as a
 * plain `<li><p><span>Our Products</span></p></li>` with no real
 * `<h#>` tag and no bold/strong wrapper at all — invisible to both
 * findRealHeadings and findPseudoHeadings.
 *
 * Deliberately keyword-gated at detection time, unlike the other two
 * heading finders (which return every real/pseudo heading regardless of
 * content and let the caller filter by keyword): a `<li>` is ordinary,
 * ubiquitous list content, not a heading-shaped signal on its own — an
 * unrelated `<li>` must never become a false section boundary. Gating on
 * the keyword here is what keeps this safe.
 */
function findListItemPseudoHeadings(html: string, keywords: string[]): HeadingMarker[] {
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  const headings: HeadingMarker[] = [];
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null) {
    const inner = m[1];
    if (/<(ul|ol|li)\b/i.test(inner)) continue;
    const text = extractVisibleText(inner);
    if (!text || wordCount(text) > MAX_PSEUDO_HEADING_WORDS) continue;
    if (!matchesKeyword(text, keywords)) continue;
    headings.push({ index: m.index, endIndex: m.index + m[0].length, level: PSEUDO_HEADING_LEVEL, text });
  }
  return headings;
}

/**
 * Finds a heading — a real `<h1>`-`<h6>` tag, a pseudo-heading (see
 * findPseudoHeadings), OR a keyword-matching list-item label (see
 * findListItemPseudoHeadings) — in already-main-content-only HTML (see
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
  return findKeywordSections(mainContentHtml, keywords)[0] ?? null;
}

/**
 * Step 2g: EVERY heading-bounded section whose heading matches one of
 * `keywords`, in page order — the real Goldberg Hardware case: an early
 * "Shop Local" heading (a single paragraph) matched the "shop" keyword
 * first and hid the real "Services Offered" list further down, because
 * only the first match was ever checked. Callers try each until one
 * genuinely passes.
 */
export function findKeywordSections(mainContentHtml: string, keywords: string[]): ContentSection[] {
  const sections: ContentSection[] = [];
  const headings = [
    ...findRealHeadings(mainContentHtml),
    ...findPseudoHeadings(mainContentHtml),
    ...findListItemPseudoHeadings(mainContentHtml, keywords),
  ].sort((a, b) => a.index - b.index);
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
    sections.push({ text: extractVisibleText(sectionHtml), html: sectionHtml, heading: headings[i].text });
  }
  return sections;
}

/** Step 2g: extra Services/Products keywords for retail-type businesses
 * (hardware, boutique, liquor, grocery, florist) — a store's "services"
 * are its brands and departments ("Products" and "Shop" are already core
 * keywords for every business). EN + ES. */
export const RETAIL_SERVICES_KEYWORDS: string[] = ["brands", "our brands", "departments", "marcas", "nuestras marcas", "departamentos"];
export const RETAIL_BUSINESS_TYPE_IDS: readonly string[] = ["hardware_store", "retail_boutique", "liquor_store", "grocery_market", "florist"];

/** Real `<li>` elements in already-main-content-only HTML (see
 * extractMainContentHtml) — a site's own nav `<li>`s are already
 * excluded by that isolation, so every count here is a real, in-page
 * list item. */
export function countListItems(mainContentHtml: string): number {
  return (mainContentHtml.match(/<li\b/gi) ?? []).length;
}

/**
 * Real evidence of a LIST of services/products/menu items, not just a
 * heading that says so — any one of: enough `<li>` elements, enough
 * repeated sub-headings (a "Service 01 / Service 02 / ..." pattern), or
 * a visible `$price`. Operates on already-main-content-only HTML/text
 * (see extractMainContentHtml) so a site's own nav `<li>`s never count.
 */
export function hasRealListedItems(mainContentHtml: string, visibleText: string): boolean {
  const subHeadingCount = (mainContentHtml.match(/<h[2-6][\s>]/gi) ?? []).length;
  // Leading ("$25") or trailing ("25$") — the real Modern Liquors case:
  // "We sell Kegs for for 67.99$" writes the dollar sign AFTER the
  // amount.
  const hasPriceLike = /\$\s?\d|\d\s?\$/.test(visibleText);
  return countListItems(mainContentHtml) >= MIN_LIST_ITEMS_SERVICES || subHeadingCount >= MIN_SUBHEADINGS_SERVICES || hasPriceLike;
}

/** A real `<li>` count well above MIN_LIST_ITEMS_SERVICES is strong
 * evidence on its own — the real CTown Supermarkets case: an honest,
 * genuine 11-item department list (Grocery Store, Bakery, Deli, Fish,
 * Florist, Beer, ...) that's naturally terse (short item names, no
 * prose, no $ prices) and was being rejected by the word-count/price
 * gate below despite being unambiguously real. Set at double the
 * minimum so a borderline 3-4 item list (which could still be a stray
 * nav/utility list that slipped through isolation) still needs the
 * word-count or price corroboration; 6+ real items stands on its own. */
export const MIN_LIST_ITEMS_SERVICES_STRONG = MIN_LIST_ITEMS_SERVICES * 2;

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
  // Leading ("$25") or trailing ("25$") — see hasRealListedItems's own
  // doc for the real Modern Liquors case ("67.99$") this covers.
  // Normalizing both forms to the bare digits before deduping means
  // "$25" and "25$" on the same page count as ONE distinct price, not
  // two.
  const leading = text.match(/\$\s?\d[\d,]*(?:\.\d+)?/g) ?? [];
  const trailing = text.match(/\d[\d,]*(?:\.\d+)?\s?\$/g) ?? [];
  const normalized = [...leading, ...trailing].map((m) => m.replace(/\$|\s|,/g, ""));
  return new Set(normalized).size;
}

/** True only when a real About/Our-Story section (already isolated to
 * main content) has enough real words to count as genuine narrative. */
export function aboutContentPasses(text: string): boolean {
  return wordCount(text) >= MIN_WORDS_ABOUT;
}

/** Real page topics that are never a genuine About-Us company story,
 * no matter how substantial the real page's own word count is — the
 * real National 5 & 10 case: /about/location-store-hours/ has a path
 * containing "about" (and plenty of real words), but the page's OWN
 * title and heading are literally "Location & Store Hours," a
 * different real topic entirely. Checked against the page's OWN
 * `<title>` and first `<h1>` specifically — never the page's full body
 * text, which could legitimately mention "contact" or "directions" in
 * passing inside a real About-Us narrative without being ABOUT that
 * topic. Bilingual. */
const NON_ABOUT_TOPIC_RE = /\b(hours|location|directions|contact|store hours|horas|ubicaci[oó]n(?:es)?|direcciones|contacto)\b/i;

/** True when the page's own title/h1 is a real hours/location/
 * directions/contact page — see NON_ABOUT_TOPIC_RE's own doc. */
export function looksLikeNonAboutTopicPage(html: string): boolean {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? decodeBasicEntities(titleMatch[1].replace(/<[^>]+>/g, " ")).trim() : "";
  const h1 = h1Match ? decodeBasicEntities(h1Match[1].replace(/<[^>]+>/g, " ")).trim() : "";
  return NON_ABOUT_TOPIC_RE.test(title) || NON_ABOUT_TOPIC_RE.test(h1);
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
/** Step 2g: a heading that explicitly titles a services/products/brands
 * list (EN + ES) — "Services Offered", "Our Services", "Products",
 * "Our Brands", "Servicios", "Productos", "Marcas". */
const EXPLICIT_SERVICES_HEADING_RE =
  /\b(services?(\s+offered)?|our\s+services|products|our\s+products|brands|our\s+brands|departments|servicios|productos|marcas|departamentos)\b/i;

/**
 * Step 2g: a homepage section under an EXPLICIT services/products/brands
 * heading counts with at least MIN_LIST_ITEMS_SERVICES real list items —
 * the real Goldberg Hardware case: "Services Offered" over a genuine
 * 5-item list (key cutting, grill assembly, screen repair, …) that the
 * general rule (60+ words or 6+ items) rejected for being short. A
 * generic heading still needs the full servicesContentPasses evidence.
 */
export function explicitServicesSectionPasses(section: ContentSection): boolean {
  if (!section.heading || !EXPLICIT_SERVICES_HEADING_RE.test(section.heading)) return false;
  return countListItems(section.html) >= MIN_LIST_ITEMS_SERVICES;
}

export function servicesContentPasses(mainContentHtml: string, text: string): boolean {
  if (!hasRealListedItems(mainContentHtml, text)) return false;
  if (wordCount(text) >= MIN_WORDS_SERVICES || countDistinctPrices(text) >= MIN_DISTINCT_PRICES_SERVICES) return true;
  // See MIN_LIST_ITEMS_SERVICES_STRONG's own doc — a genuinely large
  // real list stands on its own even when it's short on prose/prices.
  return countListItems(mainContentHtml) >= MIN_LIST_ITEMS_SERVICES_STRONG;
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

/** True when a candidate's own link label is specifically "Menu"/"Menú"
 * — used to gate the image-only-menu note (see looksLikeImageOnlyMenu's
 * call site in lib/websiteAnalysis.ts) to pages actually labeled as a
 * menu, never a Services/Catering/Products page that merely happens to
 * carry a few photos (the real Brew HaHa! "Catering" false-positive this
 * guards against — a catering page with photos is not a menu). */
export function isMenuLabel(label: string): boolean {
  // No trailing \b — the real Santa Fe Mexican Grill case uses the
  // plural "Newark Menus" as its real nav label.
  return /\bmenu|\bmenú/i.test(label);
}

/**
 * Finds a real link, ANYWHERE in already-main-content-only HTML (e.g. the
 * homepage itself, not just an already-topically-relevant candidate
 * page), that points at a real PDF AND is clearly menu-related — both an
 * `href` ending in `.pdf` AND a label matching either
 * PDF_MENU_LINK_KEYWORDS or a real SERVICES_PAGE_KEYWORDS term (e.g.
 * "menu"). Deliberately stricter than findPdfMenuLink (which only
 * requires ONE of href-is-pdf OR label-says-pdf): scanning a whole
 * homepage for ANY .pdf link is far more likely to catch an unrelated
 * document (a W-9, a privacy policy) than scanning one page we already
 * know is topically relevant, so this requires BOTH. The real QDOBA
 * case: "Download Our Menu" -> a real PDF on a totally different host
 * (assets.ctfassets.net) — matches here via href-is-pdf AND
 * label-contains-"menu", regardless of host (never restricted — a real
 * PDF a business itself links to is real evidence no matter where it's
 * hosted).
 */
export function findMenuPdfLink(mainContentHtml: string, baseUrl: string): string | null {
  const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(mainContentHtml)) !== null) {
    const href = m[1].trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    if (!/\.pdf(?:[?#]|$)/i.test(href)) continue;
    const label = extractVisibleText(m[2]).toLowerCase();
    const isPdfLabel = PDF_MENU_LINK_KEYWORDS.some((kw) => label.includes(kw));
    const isServicesLabel = matchesKeyword(label, SERVICES_PAGE_KEYWORDS) !== null;
    if (!isPdfLabel && !isServicesLabel) continue;
    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// JS-rendered-shell detection — the real Goldberg Hardware (Nuxt), Great
// Clips (bare React root), and Drybar - Midtown East (Next.js static
// export with empty pageProps) cases: the static HTML we fetch is just a
// framework loading shell with the real content injected client-side
// after hydration. Scoring that as a real "not_found" zero overstates
// our confidence — we genuinely can't tell either way, so this is wired
// to a real third outcome (couldnt_check, reason "js_rendered") rather
// than a guessed absence.
// ---------------------------------------------------------------------

/** A handful of real, well-known SPA root-element markers — not every
 * framework, just the ones actually seen among real business sites.
 * Deliberately checked ALONGSIDE a near-empty body (see
 * isLikelyJsRenderedShell), never alone: plenty of real, fully
 * server-rendered pages mount an unrelated small widget (a chat bubble,
 * a cookie banner) on a `<div id="app">`-shaped element while the rest
 * of the page is genuinely real content. */
const JS_APP_ROOT_MARKERS: RegExp[] = [
  /id=["']__next["']/i,
  /id=["']__nuxt["']/i,
  /id=["']root["']/i,
  /id=["']app["']/i,
  /id=["']reactele["']/i,
];

/** Below this many real visible words in the WHOLE `<body>` (not just
 * main-content-isolated — a shell has nothing real anywhere, not just
 * outside `<nav>`/`<header>`), there's nothing left to read at all. A
 * genuinely thin but real page still has a few real sentences; a shell
 * has none — just a loading spinner and framework boilerplate. */
const MAX_SHELL_BODY_WORDS = 12;

function extractBodyHtml(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : html;
}

/**
 * True only when the page both (a) carries a real SPA-root marker and
 * (b) has essentially no real visible text in its `<body>` — the
 * combination is what makes this safe: either signal alone is too
 * common/ambiguous (see JS_APP_ROOT_MARKERS' own doc). Deliberately
 * checked against `<title>`-excluded, `<body>`-only text, so a
 * descriptive `<title>` in `<head>` (every real page has one) can never
 * itself push a genuine shell over the word threshold.
 */
export function isLikelyJsRenderedShell(html: string): boolean {
  if (!JS_APP_ROOT_MARKERS.some((re) => re.test(html))) return false;
  const bodyText = extractVisibleText(extractBodyHtml(html));
  return wordCount(bodyText) <= MAX_SHELL_BODY_WORDS;
}

// ---------------------------------------------------------------------
// Image-only menu detection — the real Santa Fe Mexican Grill case: a
// genuine "Newark Menus" page loads fine and has real intro prose, but
// the actual menu items are a Wix image gallery (12 `<img>` tags, zero
// `<li>` items, zero `$` prices in text) — visible to a customer,
// invisible to text extraction.
// ---------------------------------------------------------------------

/** At or above this many real `<img>` tags in an already-content-
 * failed Services candidate page, the images ARE the menu — a real,
 * visitor-visible page we just can't read the text of, never a guessed
 * absence. Picked above what a normal page's incidental decorative
 * photos would carry (a hero image, a couple of ambiance shots) but
 * well below what a real image-gallery menu actually has. */
export const MIN_IMAGES_FOR_IMAGE_ONLY_MENU = 3;

export function looksLikeImageOnlyMenu(mainContentHtml: string): boolean {
  const imgCount = (mainContentHtml.match(/<img\b/gi) ?? []).length;
  return imgCount >= MIN_IMAGES_FOR_IMAGE_ONLY_MENU;
}

// ---------------------------------------------------------------------
// Same-brand (eTLD+1) host matching — the real Chipotle/QDOBA/Canadian
// Tire/CTown case: a chain's own locator subdomain
// (locations.chipotle.com) legitimately links to the brand's apex
// domain (chipotle.com) or a sibling subdomain (corp.canadiantire.ca) —
// a different HOST, but never an unrelated third party. Exact-hostname
// matching silently drops these real, business-published links.
// ---------------------------------------------------------------------

/** Real multi-label public suffixes actually seen among business
 * websites — deliberately NOT a full public suffix list (no new
 * dependency for a handful of real cases): anything else falls back to
 * the standard "last two labels" rule, which is correct for the
 * overwhelming majority of real sites (.com, .ca, .app, ...). */
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "net.uk",
  "gov.uk",
  "ac.uk",
  "co.nz",
  "co.za",
  "co.jp",
  "co.kr",
  "co.il",
  "com.au",
  "com.br",
  "com.mx",
  "com.ar",
  "com.co",
  "com.sg",
]);

function registrableDomain(hostname: string): string {
  const labels = hostname.replace(/^www\./i, "").toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (labels.length >= 3 && MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

/** True when two hostnames share the same real registrable domain —
 * `locations.chipotle.com` and `chipotle.com` both resolve to
 * `chipotle.com`; `corp.canadiantire.ca` and `www.canadiantire.ca` both
 * resolve to `canadiantire.ca`. See registrableDomain's own doc for the
 * (deliberately partial) suffix list this relies on. */
export function sameBrandHost(hostnameA: string, hostnameB: string): boolean {
  return registrableDomain(hostnameA) === registrableDomain(hostnameB);
}

// ---------------------------------------------------------------------
// Online-ordering link detection — Services only. The real Umami
// Express / Original Hot Bagels / Brew HaHa! case: a business's actual
// menu lives entirely on a third-party ordering platform (or a
// same-brand ordering subdomain), never on their own site's text at
// all. We can't read a word of that menu, but we CAN honestly confirm
// the link is real and loads — a materially different, more useful
// signal than a flat "not found".
// ---------------------------------------------------------------------

/** Deliberately the exact labels the real cases in this batch used —
 * narrow on purpose, so this only fires on a genuine "go order" link,
 * never an incidental mention of the word "order" elsewhere on the
 * page. */
export const ONLINE_ORDERING_LINK_KEYWORDS: string[] = ["order online", "order now", "view menu", "ordenar"];

/** Real, well-known third-party ordering/menu platforms seen among
 * real business sites — a link to one of these, even off this
 * business's own domain, is real, verifiable evidence of a real
 * ordering menu, unlike an arbitrary off-domain link. */
export const KNOWN_ORDERING_PLATFORM_HOSTS: string[] = [
  "toasttab.com",
  "chownow.com",
  "olo.com",
  "squareup.com",
  "square.site",
  "clover.com",
  "popmenu.com",
  "bentobox.com",
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
];

export function isKnownOrderingPlatformHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return KNOWN_ORDERING_PLATFORM_HOSTS.some((platform) => host === platform || host.endsWith(`.${platform}`));
}
