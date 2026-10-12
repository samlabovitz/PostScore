// Pure, network-free detection of real site-trust signals: hacked/
// injected spam content, stale closure/event notices, an abandoned-
// looking site, and comparing the site's own stated hours/phone/address
// against the Google listing. Same reasoning as lib/pagePresenceDetection.ts:
// a handful of honest, specific signals, never a faithful DOM
// reconstruction or a full NLP/date-parsing library. See
// lib/websiteAnalysis.ts for the real network orchestration (the Google
// Safe Browsing call) that pairs with this, and lib/scoring.ts's
// WebsiteTrustAnalysis for how each finding is scored and explained.
//
// Built from a real case (Bánh Mì Boy - Vietnamese Sandwiches, Oct 10):
// a genuinely hacked, abandoned WordPress site whose real raw HTML has
// ALL FOUR of these signals at once — replica-watch spam injected into
// the page body (hidden via `display:table-column` on its wrapper
// `<div>`, not the more obvious `display:none`), a "CLOSED July 4th to
// 8th!!!" banner still showing in October, a real blog post dated July
// 11, 2012, and two unfilled "Please put widget here" footer widgets.

import { extractMainContentHtml, extractVisibleText, wordCount } from "./pagePresenceDetection";

// ---------------------------------------------------------------------
// 4a) Hacked / injected spam content
// ---------------------------------------------------------------------

export type SpamCategory = "replica" | "casino" | "pharma" | "payday_loan" | "essay_writing" | "crypto";

/** Deliberately short, specific multi-word phrases — same reasoning as
 * lib/websiteReachability.ts's BOT_CHALLENGE_PHRASES: a false negative
 * (missing some spam) is far less harmful than a false positive (telling
 * a real pharmacy, loan office, or casino-adjacent business their real,
 * legitimate content is "hacked"). None of these phrases describe a
 * real small-business offering on their own. */
const SPAM_PHRASES: Record<SpamCategory, string[]> = {
  replica: ["replica watch", "replica watches", "replica richard mille", "replica rolex", "replica breitling", "fake rolex"],
  casino: ["online casino", "casino bonus", "free spins no deposit", "jackpot slots", "sports betting bonus"],
  pharma: ["buy viagra", "cheap viagra", "buy cialis", "cialis online", "online pharmacy no prescription"],
  payday_loan: ["payday loan", "payday loans online", "cash advance loan", "no credit check loan"],
  essay_writing: ["essay writing service", "buy essay online", "write my essay", "pay someone to write my paper"],
  crypto: ["crypto signals", "bitcoin doubler", "guaranteed crypto returns", "forex signals telegram"],
};

/** Real, well-known hosts a small-business site legitimately links out
 * to — never themselves evidence of a hack, no matter what nearby text
 * says. Deliberately broad (social, ordering, payment, maps, reviews,
 * booking) so a genuine partner link is never mistaken for spam. */
const LEGITIMATE_OUTBOUND_HOSTS = [
  // social
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "pinterest.com",
  // ordering platforms (same list as lib/pagePresenceDetection.ts's
  // KNOWN_ORDERING_PLATFORM_HOSTS, duplicated here on purpose — same
  // small-duplication style as the rest of this codebase, and this
  // module must never import network-adjacent concerns from there).
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
  // payment
  "stripe.com",
  "paypal.com",
  "venmo.com",
  "cash.app",
  // maps
  "google.com",
  "maps.apple.com",
  "goo.gl",
  // reviews / booking
  "yelp.com",
  "tripadvisor.com",
  "opentable.com",
  "resy.com",
  "calendly.com",
  "fresha.com",
];

function isLegitimateOutboundHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return LEGITIMATE_OUTBOUND_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Real CSS patterns that hide an element from a visitor while leaving
 * its text readable to a crawler/automated fetch — the real Bánh Mì Boy
 * case uses `display:table-column` on an ordinary `<div>` (a CSS
 * misuse: that display value only has real meaning on a `<col>` inside
 * an actual `<table>`, so applying it elsewhere reliably keeps the
 * element out of normal visible layout in every real browser), not the
 * more obvious `display:none` — spam injectors routinely avoid the
 * well-known pattern specifically because it's well-known. */
const HIDDEN_CSS_PATTERNS: RegExp[] = [
  /display\s*:\s*none/i,
  /display\s*:\s*table-column/i,
  /visibility\s*:\s*hidden/i,
  /position\s*:\s*absolute[^;}"']{0,60}(left|top)\s*:\s*-\d{3,}px/i,
  /font-size\s*:\s*0(\b|px)/i,
  /width\s*:\s*0(px)?[^;}"']{0,30}height\s*:\s*0(px)?/i,
  /opacity\s*:\s*0\b/i,
  /text-indent\s*:\s*-\d{3,}px/i,
  /clip\s*:\s*rect\(\s*0/i,
];

/** True when `styleText` (the content of a `<style>` block, or a style
 * attribute) contains any known hiding pattern applied to `className` —
 * deliberately only checked against style content that actually
 * mentions the class, so an unrelated hidden element elsewhere on the
 * page can never implicate a different one. */
function classIsHidden(styleText: string, className: string): boolean {
  // A real CSS rule for this exact class, e.g. `.hm{display:table-column}`
  // or `.hm { display: none; }` — captures just that one rule's body.
  const ruleRe = new RegExp(`\\.${className.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "i");
  const match = styleText.match(ruleRe);
  if (!match) return false;
  return HIDDEN_CSS_PATTERNS.some((p) => p.test(match[1]));
}

export interface SpamFinding {
  category: SpamCategory;
  /** The real matched phrase, exactly as found. */
  matchedPhrase: string;
  /** A short real excerpt of the surrounding text — the actual evidence
   * shown to the owner, never a summary. */
  snippet: string;
  /** Real off-topic URLs found near the matched phrase, if any. */
  suspiciousLinks: string[];
  /** True when the containing element matched a known hidden-CSS
   * pattern (see HIDDEN_CSS_PATTERNS) — stronger evidence of a hack
   * (hidden from a real visitor, visible to crawlers) than plainly
   * visible off-topic text, but both are real findings. */
  hidden: boolean;
}

/**
 * Scans a page's RAW html (not main-content-isolated — a hack can land
 * anywhere, including inside `<header>`/`<footer>`/`<nav>`) for real
 * spam vocabulary (see SPAM_PHRASES) paired with real off-topic outbound
 * links, and checks whether the containing block is hidden via a known
 * CSS trick. Never flags a legitimate outbound link on its own (see
 * isLegitimateOutboundHost) — only a spam PHRASE is real evidence; a
 * suspicious link is corroborating context, not required on its own
 * (the real Bánh Mì Boy case has both). Deliberately bounded: returns at
 * most one finding per category, since several repeated hits in one
 * injected block are the same real evidence, not new evidence.
 */
export function detectSpamSignals(rawHtml: string): SpamFinding[] {
  const findings: SpamFinding[] = [];
  const seenCategories = new Set<SpamCategory>();
  const lowerHtml = rawHtml.toLowerCase();

  // Gather every <style> block's raw text once, for the hidden-class check.
  const styleBlocks = (rawHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  // Also gather every element's own inline style attribute, keyed loosely
  // — checked by just scanning nearby raw HTML for a style="..." that
  // itself matches a hidden pattern (see below).

  for (const [category, phrases] of Object.entries(SPAM_PHRASES) as [SpamCategory, string[]][]) {
    if (seenCategories.has(category)) continue;
    for (const phrase of phrases) {
      const idx = lowerHtml.indexOf(phrase);
      if (idx === -1) continue;

      const windowStart = Math.max(0, idx - 600);
      const windowEnd = Math.min(rawHtml.length, idx + 600);
      const window = rawHtml.slice(windowStart, windowEnd);

      // Real off-topic links inside the same window — never ones to a
      // known-legitimate host.
      const suspiciousLinks: string[] = [];
      const anchorRe = /<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi;
      let m: RegExpExecArray | null;
      while ((m = anchorRe.exec(window)) !== null) {
        try {
          const u = new URL(m[1], "https://example.com/");
          if (!isLegitimateOutboundHost(u.hostname) && /^https?:$/i.test(u.protocol)) {
            suspiciousLinks.push(m[1]);
          }
        } catch {
          continue;
        }
      }

      // Is the matched phrase inside an element whose class is hidden
      // via a known CSS pattern? Look for the nearest wrapping
      // class="..." before the match, then check that class's own rule
      // in the page's <style> blocks.
      let hidden = false;
      const beforeMatch = rawHtml.slice(Math.max(0, idx - 2000), idx);
      const classMatches = Array.from(beforeMatch.matchAll(/class\s*=\s*["']([^"']+)["']/gi));
      const nearestClass = classMatches[classMatches.length - 1]?.[1];
      if (nearestClass) {
        for (const className of nearestClass.split(/\s+/)) {
          if (classIsHidden(styleBlocks, className)) {
            hidden = true;
            break;
          }
        }
      }
      // Also check for an inline style="..." directly on the nearest
      // preceding tag.
      const inlineStyleMatch = beforeMatch.match(/style\s*=\s*["']([^"']*)["'][^>]*$/i);
      if (inlineStyleMatch && HIDDEN_CSS_PATTERNS.some((p) => p.test(inlineStyleMatch[1]))) {
        hidden = true;
      }

      const snippetText = extractVisibleText(window);
      findings.push({
        category,
        matchedPhrase: phrase,
        snippet: snippetText.length > 300 ? `${snippetText.slice(0, 300)}…` : snippetText,
        suspiciousLinks: Array.from(new Set(suspiciousLinks)),
        hidden,
      });
      seenCategories.add(category);
      break;
    }
  }

  return findings;
}

// ---------------------------------------------------------------------
// 4c) Stale closure/holiday/event notices
// ---------------------------------------------------------------------

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, ene: 0, enero: 0,
  feb: 1, february: 1, febrero: 1,
  mar: 2, march: 2, marzo: 2,
  apr: 3, april: 3, abr: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, junio: 5,
  jul: 6, july: 6, julio: 6,
  aug: 7, august: 7, ago: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, septiembre: 8,
  oct: 9, october: 9, octubre: 9,
  nov: 10, november: 10, noviembre: 10,
  dec: 11, december: 11, dic: 11, diciembre: 11,
};

/** Bilingual signals that a sentence is a real closure/holiday/
 * "temporarily"/event notice — never a generic "we're closed Sundays"
 * regular-hours statement, which has no date attached and is never
 * stale. */
const NOTICE_KEYWORDS = [
  "closed",
  "temporarily closed",
  "temporarily",
  "will be closed",
  "cerrado",
  "cerrados",
  "cerraremos",
  "temporalmente cerrado",
];

export interface StaleNoticeFinding {
  /** The real sentence/phrase, exactly as found on the page. */
  text: string;
  /** The real date this notice refers to, resolved to an ISO date
   * (year assumed to be the current year when the notice itself didn't
   * name one — see findStaleNotices' own doc). */
  resolvedDate: string;
}

/** How many days past a notice's own date it's still given the benefit
 * of the doubt (a business might legitimately leave a "closed through
 * the 8th" banner up for a few days after reopening while they update
 * the site) — only past this grace period does it count as stale. */
const STALE_NOTICE_GRACE_DAYS = 7;

/**
 * Trims a stale notice's raw text window (findStaleNotices captures a
 * fixed character window, so it can start mid-word — the real Bánh Mì
 * Boy case: "ion. Finding great. CLOSED July 4th to 8th!!! Open Daily…")
 * down to the whole sentence(s) holding the notice itself: from the
 * start of the sentence containing the keyword/date, through the end of
 * the sentence containing the date. Display-only — the stored `text`
 * stays exactly as found, so keyForStaleNotice (and any owner override
 * keyed by it) is never affected. Falls back to the original text when
 * no date is found in it.
 */
export function trimNoticeToSentences(text: string): string {
  const dateRe = new RegExp(`\\b(${Object.keys(MONTH_NAMES).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i");
  const dateMatch = dateRe.exec(text);
  if (!dateMatch || dateMatch.index === undefined) return text;
  const dateStart = dateMatch.index;
  const dateEnd = dateStart + dateMatch[0].length;

  // The notice keyword nearest before the date (e.g. "CLOSED" in "CLOSED
  // July 4th"), when it sits in the same stretch — otherwise the date itself.
  const lower = text.toLowerCase();
  let noticeStart = dateStart;
  for (const keyword of NOTICE_KEYWORDS) {
    const idx = lower.lastIndexOf(keyword, dateStart);
    if (idx !== -1 && idx < noticeStart && dateStart - idx <= 40) noticeStart = idx;
  }

  // Sentence start: just past the last terminator (followed by whitespace)
  // before the notice — never cutting inside the notice itself.
  let start = 0;
  const terminatorRe = /[.!?]+\s+/g;
  let m: RegExpExecArray | null;
  while ((m = terminatorRe.exec(text)) !== null && m.index + m[0].length <= noticeStart) {
    start = m.index + m[0].length;
  }

  // Sentence end: the first terminator run after the date, else the end.
  const endMatch = /[.!?]+(?=\s|$)/.exec(text.slice(dateEnd));
  const end = endMatch && endMatch.index !== undefined ? dateEnd + endMatch.index + endMatch[0].length : text.length;

  const trimmed = text.slice(start, end).trim();
  return trimmed.length > 0 ? trimmed : text;
}

/** Finds a real month-name + day-number date near a notice keyword (see
 * NOTICE_KEYWORDS) within already-visible text, resolves it to a real
 * date (assuming the CURRENT year when the text itself names none — a
 * year-less "July 4th" notice found in October is read as THIS July 4th,
 * since a business doesn't typically write next year's date into a
 * current closure banner), and reports it as stale when that date
 * (plus STALE_NOTICE_GRACE_DAYS) has already passed relative to `now`.
 * Never flags a dateless statement ("We are closed Sundays") — that's a
 * regular-hours fact, not a notice.
 */
export function findStaleNotices(visibleText: string, now: Date): StaleNoticeFinding[] {
  const findings: StaleNoticeFinding[] = [];
  const seen = new Set<string>();
  // One real month-name + day-number, optionally with a 4-digit year
  // anywhere nearby (checked separately below, since a notice's year —
  // when present — usually trails the whole date range, not each day).
  const dateRe = new RegExp(
    `\\b(${Object.keys(MONTH_NAMES).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "gi"
  );

  for (const keyword of NOTICE_KEYWORDS) {
    const lower = visibleText.toLowerCase();
    let searchFrom = 0;
    while (true) {
      const kwIdx = lower.indexOf(keyword, searchFrom);
      if (kwIdx === -1) break;
      searchFrom = kwIdx + keyword.length;

      // Look for a date within a short real window around the keyword —
      // either before (e.g. "CLOSED July 4th to 8th") or after. Kept
      // tight on purpose (never a whole sentence/paragraph) so an
      // unrelated date elsewhere on the page can't bleed in.
      const windowStart = Math.max(0, kwIdx - 20);
      const windowEnd = Math.min(visibleText.length, kwIdx + 100);
      const window = visibleText.slice(windowStart, windowEnd);
      dateRe.lastIndex = 0;
      const dateMatch = dateRe.exec(window);
      if (!dateMatch) continue;

      const month = MONTH_NAMES[dateMatch[1].toLowerCase()];
      const day = Number(dateMatch[2]);
      if (!Number.isInteger(day) || day < 1 || day > 31) continue;

      // A real 4-digit year, ONLY when it directly trails the day
      // number (e.g. "July 4th, 2026") within a few characters — never
      // searched across the whole window, which would just as easily
      // match the tail of a nearby phone number (the real Bánh Mì Boy
      // case: "(302) 525-2018" sitting right after the notice reads
      // "2018" as a year unless this stays this narrow).
      const afterDate = window.slice((dateMatch.index ?? 0) + dateMatch[0].length, (dateMatch.index ?? 0) + dateMatch[0].length + 8);
      const yearMatch = afterDate.match(/^[,\s]{0,4}(20\d{2})\b/);
      const year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();

      const resolved = new Date(Date.UTC(year, month, day));
      if (Number.isNaN(resolved.getTime())) continue;

      const graceMs = STALE_NOTICE_GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (resolved.getTime() + graceMs >= now.getTime()) continue; // not stale yet

      const noticeText = visibleText.slice(windowStart, windowEnd).trim();
      const key = `${noticeText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ text: noticeText, resolvedDate: resolved.toISOString().slice(0, 10) });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------
// 4d) Abandoned-looking site
// ---------------------------------------------------------------------

/** Real, well-known unfilled-template phrases — never a business's own
 * genuine copy. Deliberately exact, well-known placeholder strings (a
 * real page builder's own default text), not generic words. */
const TEMPLATE_LEFTOVER_PHRASES = [
  "please put widget here",
  "lorem ipsum",
  "hello world!",
  "sample page",
  "just another wordpress site",
  "this is a sample page",
  "welcome to wordpress",
];

export interface AbandonedSiteFinding {
  /** The most recent real date found anywhere on the page (a blog post,
   * a "last updated" line, a copyright year) — null when none was
   * found at all (never treated as evidence of abandonment on its own
   * — see looksAbandoned below). Display evidence only. */
  newestDateFound: string | null;
  /** Real unfilled template placeholder phrases found verbatim. */
  templateLeftovers: string[];
  /** The real, pre-computed verdict — true when newestDateFound is both
   * present AND older than ABANDONED_SITE_MAX_AGE_MS (as of the real
   * `now` this was computed with), OR real template leftovers exist —
   * either is independently real evidence. Computed HERE, at real
   * collection time, rather than left for lib/scoring.ts's evaluate()
   * to re-derive from newestDateFound: scoreBusiness() must stay a pure,
   * clock-free function of its input (same reasoning as
   * mostRecentReviewDaysAgo on BusinessScoringInput) — re-scoring the
   * exact same saved data a year later must always produce the exact
   * same score, which a live `new Date()` comparison inside scoring
   * would silently break. */
  looksAbandoned: boolean;
}

/** How old the newest real date found on the page has to be before it's
 * real evidence of an abandoned site — 2 years: long enough that a
 * business's own slower content cadence (most small-business sites
 * aren't blogged on weekly) doesn't get mistaken for abandonment, short
 * enough that a site that hasn't been touched since a long-gone year is
 * a genuine signal. */
export const ABANDONED_SITE_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/**
 * Finds the most recent real date mentioned anywhere in `visibleText`
 * (a month-name date with a real 4-digit year, or a bare "© 2012"/
 * "Copyright 2012" style year) and every real template-leftover phrase
 * (see TEMPLATE_LEFTOVER_PHRASES) found verbatim, and resolves the real
 * `looksAbandoned` verdict against `now` (see AbandonedSiteFinding's own
 * doc for why that resolution happens here, not in lib/scoring.ts). A
 * page with NO date anywhere is genuinely inconclusive — never treated
 * as "old" on its own.
 */
export function detectAbandonedSignals(visibleText: string, now: Date): AbandonedSiteFinding {
  const dates: Date[] = [];

  const monthDateRe = new RegExp(
    `\\b(${Object.keys(MONTH_NAMES).join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`,
    "gi"
  );
  let m: RegExpExecArray | null;
  while ((m = monthDateRe.exec(visibleText)) !== null) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month, day));
    if (!Number.isNaN(d.getTime())) dates.push(d);
  }

  const copyrightRe = /(?:©|copyright)\D{0,10}(20\d{2})/gi;
  while ((m = copyrightRe.exec(visibleText)) !== null) {
    const year = Number(m[1]);
    dates.push(new Date(Date.UTC(year, 0, 1)));
  }

  const newest = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

  const lower = visibleText.toLowerCase();
  const templateLeftovers = TEMPLATE_LEFTOVER_PHRASES.filter((phrase) => lower.includes(phrase));

  const isOld = newest !== null && now.getTime() - newest.getTime() > ABANDONED_SITE_MAX_AGE_MS;

  return {
    newestDateFound: newest ? newest.toISOString().slice(0, 10) : null,
    templateLeftovers,
    looksAbandoned: isOld || templateLeftovers.length > 0,
  };
}

// ---------------------------------------------------------------------
// 4b) Conflicting info vs Google: phone, address, hours
// ---------------------------------------------------------------------

export type InfoFieldComparison = "matches" | "conflicts" | "not_found_on_site";

export interface InfoFieldFinding {
  field: "phone" | "address" | "hours";
  comparison: InfoFieldComparison;
  /** The real value found on the site's own main content — null when
   * comparison is "not_found_on_site". */
  siteValue: string | null;
  /** The listing's own real value, for display — null when the listing
   * itself has nothing to compare against for this field. */
  googleValue: string | null;
  /** Where the site's value came from when it wasn't the page text —
   * "map" = the address in an embedded Google Map's own URL (Step 2d). */
  source?: "map";
}

/** An embedded Google Map found on the site (Step 2d). readableAddress is
 * set ONLY when the map's own URL spells out a street address — never
 * guessed from a place name or coordinates. */
export interface EmbeddedMapFinding {
  readableAddress: string | null;
}

/** A real street-address shape: a street number of 2+ digits followed
 * by a word (same narrow evidence bar as compareAddress). */
const STREET_ADDRESS_RE = /\b\d{2,}[A-Za-z]?\s+[A-Za-z]/;

function mapUrlTextCandidates(rawSrc: string): string[] {
  const src = rawSrc.replace(/&amp;/gi, "&");
  const candidates: string[] = [];
  let url: URL | null = null;
  try {
    url = new URL(src, "https://www.google.com/");
  } catch {
    url = null;
  }
  const decode = (v: string) => {
    try {
      return decodeURIComponent(v.replace(/\+/g, " "));
    } catch {
      return v.replace(/\+/g, " ");
    }
  };
  if (url) {
    for (const key of ["q", "query", "daddr", "address"]) {
      const v = url.searchParams.get(key);
      if (v) candidates.push(v);
    }
    const place = url.pathname.match(/\/maps\/(?:place|search)\/([^/@]+)/i);
    if (place) candidates.push(decode(place[1]));
    const pb = url.searchParams.get("pb");
    if (pb) {
      for (const part of pb.split("!")) {
        if (part.startsWith("2s") && part.length > 5) candidates.push(decode(part.slice(2)));
      }
    }
  }
  return candidates.map((c) => c.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * Finds an embedded Google Map (an `<iframe>` whose src/data-src points
 * at google.com/maps or maps.google.*). Returns null when there's none.
 */
export function detectEmbeddedMap(html: string | null): EmbeddedMapFinding | null {
  if (!html) return null;
  const iframes = html.match(/<iframe\b[^>]*>/gi) ?? [];
  let found = false;
  for (const tag of iframes) {
    const srcMatch = tag.match(/\s(?:data-)?src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    const src = srcMatch ? srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "" : "";
    if (!/(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(src)) continue;
    found = true;
    const address = mapUrlTextCandidates(src).find((c) => STREET_ADDRESS_RE.test(c));
    if (address) return { readableAddress: address };
  }
  return found ? { readableAddress: null } : null;
}

/** Normalizes a phone number down to its last 10 real digits — country
 * codes, parentheses, dashes, and spaces all dropped, same reasoning in
 * both directions so "(302) 525-2018" and "+1 302-525-2018" compare
 * equal. */
function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Real North American phone shapes only — (xxx) xxx-xxxx, xxx-xxx-xxxx,
 * xxx.xxx.xxxx, xxx xxx xxxx — never a bare run of digits (too many
 * false positives: prices, zip codes, years). */
const PHONE_RE = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/g;

/** Real North American toll-free area codes — a toll-free number is
 * routed centrally and says nothing about which real location a
 * visitor is looking at (the common case: a corporate/customer-service
 * number repeated identically on every location's page), so it's never
 * treated as this location's own "local" number, in either direction —
 * never used to confirm a match, never used as conflicting evidence. */
const TOLL_FREE_AREA_CODES = new Set(["800", "833", "844", "855", "866", "877", "888"]);

function isTollFree(digits10: string): boolean {
  return TOLL_FREE_AREA_CODES.has(digits10.slice(0, 3));
}

/** Real labels for a SECONDARY phone line — never this location's own
 * primary, Google-listed number, so a number introduced by one of
 * these (within ~40 chars before it) is excluded from consideration
 * entirely, in both directions. The real Bagel Emporium case: "Need
 * Catering? Call us: 914-222-4545" is a genuine, real number, just for
 * a different PURPOSE than the main line Google has on file — not a
 * different location's leaked data, but not comparable evidence
 * either. The real Brew HaHa! case: "Main Office 302-427-2739" on its
 * own Contact page is a genuine corporate/HQ line, not the specific
 * location's own listed number, same reasoning as "catering" above.
 * Bilingual (English + Spanish). */
const SECONDARY_PHONE_LABELS = [
  "catering",
  "catering line",
  "fax",
  "events",
  "event",
  "careers",
  "career",
  "jobs",
  "job",
  "corporate",
  "corporate office",
  "wholesale",
  "delivery",
  "main office",
  "headquarters",
  "hq",
  "administrative office",
  // Spanish
  "eventos",
  "empleo",
  "empleos",
  "carreras",
  "corporativo",
  "mayorista",
  "entrega",
  "entregas",
  "línea de catering",
  "linea de catering",
  "oficina principal",
];

const SECONDARY_PHONE_LABEL_RE = new RegExp(`\\b(${SECONDARY_PHONE_LABELS.map(escapeRegExp).join("|")})\\b`, "i");

/** How far back (characters) before a matched phone number to look for
 * a secondary-line label — e.g. "Need Catering? Call us: 914-222-4545"
 * — wide enough to span a short lead-in phrase, never a whole
 * paragraph. */
const SECONDARY_PHONE_LABEL_WINDOW = 40;

/**
 * Compares the real phone number(s) found in `siteText` against the
 * listing's own `googlePhone` — "matches" when the listing's last-10-
 * digit number appears ANYWHERE in the site's own extracted LOCAL phone
 * numbers, "conflicts" when the site shows real local numbers and NONE
 * of them match, "not_found_on_site" (no penalty) when the site
 * mentions no comparable local phone number at all. Toll-free numbers
 * (see TOLL_FREE_AREA_CODES) and any number introduced by a real
 * secondary-line label (see SECONDARY_PHONE_LABELS) are excluded from
 * consideration entirely, in both directions — a multi-location site
 * repeating one 800 number everywhere, or a real catering/fax/events
 * line, is never real evidence either way.
 */
export function comparePhone(siteText: string, googlePhone: string | null): InfoFieldFinding {
  const rawMatches = Array.from(siteText.matchAll(PHONE_RE));
  let previousMatchEnd = 0;
  const localMatches = Array.from(
    new Set(
      rawMatches
        .filter((m) => {
          const matchStart = m.index ?? 0;
          const digits = normalizePhoneDigits(m[0]);
          // Never let the lookback window cross into a PRECEDING
          // number's own text — two numbers sitting close together
          // (e.g. "Corporate: 800-123-4567. Our shop: 302-525-2018.")
          // must never have the first number's own label bleed onto
          // the second, unrelated one.
          const windowStart = Math.max(0, matchStart - SECONDARY_PHONE_LABEL_WINDOW, previousMatchEnd);
          previousMatchEnd = matchStart + m[0].length;
          if (isTollFree(digits)) return false;
          const before = siteText.slice(windowStart, matchStart);
          if (SECONDARY_PHONE_LABEL_RE.test(before)) return false;
          return true;
        })
        .map((m) => m[0].trim())
    )
  );
  if (localMatches.length === 0) {
    return { field: "phone", comparison: "not_found_on_site", siteValue: null, googleValue: googlePhone };
  }
  if (!googlePhone) {
    return { field: "phone", comparison: "not_found_on_site", siteValue: localMatches[0], googleValue: null };
  }
  const googleDigits = normalizePhoneDigits(googlePhone);
  const matched = localMatches.find((m) => normalizePhoneDigits(m) === googleDigits);
  if (matched) {
    return { field: "phone", comparison: "matches", siteValue: matched, googleValue: googlePhone };
  }
  return { field: "phone", comparison: "conflicts", siteValue: localMatches[0], googleValue: googlePhone };
}

/** Pulls the real street-number + first street-word tokens out of a
 * formatted address ("209 E Main St, Newark, DE 19711" -> ["209",
 * "main"]) — a real, deliberately narrow token match (not a full
 * address parser/geocoder): if the site's own text contains BOTH the
 * real street number and the real street name's first word, that's
 * strong, specific evidence of the same address; anything less honestly
 * isn't a verified match. */
function addressTokens(address: string): { streetNumber: string; streetWord: string } | null {
  const match = address.match(/^\s*(\d+[A-Za-z]?)\s+(?:[NSEW]\.?\s+)?([A-Za-z]+)/);
  if (!match) return null;
  return { streetNumber: match[1], streetWord: match[2].toLowerCase() };
}

/**
 * Compares the site's own text against the listing's real street
 * address, via the real street-number + street-name-first-word tokens
 * (see addressTokens) — "matches" when BOTH appear together in the
 * site's text, "conflicts" when the site mentions a DIFFERENT real
 * street number with no trace of the listing's own, "not_found_on_site"
 * (no penalty) when the site has no address-shaped text at all. Never a
 * full address parse — this is a narrow, honest substring check.
 */
export function compareAddress(siteText: string, googleAddress: string | null): InfoFieldFinding {
  if (!googleAddress) {
    return { field: "address", comparison: "not_found_on_site", siteValue: null, googleValue: null };
  }
  const tokens = addressTokens(googleAddress);
  // A real street number must have at least 2 digits to search for —
  // the real Yoga Love NY case: a 1-digit number ("1 Bridge St") matches
  // an unrelated bare "1" virtually anywhere on a real page (prices,
  // "1-on-1", list items), producing a false "conflict" against text
  // that has nothing to do with an address at all. Honestly inconclusive
  // instead — never a full address parser, so a too-short number simply
  // isn't specific enough evidence either way.
  if (!tokens || tokens.streetNumber.replace(/[A-Za-z]/g, "").length < 2) {
    return { field: "address", comparison: "not_found_on_site", siteValue: null, googleValue: googleAddress };
  }
  const lower = siteText.toLowerCase();
  const numberIdx = siteText.search(new RegExp(`\\b${tokens.streetNumber}\\b`));
  if (numberIdx === -1) {
    // No matching street number anywhere — honestly nothing to compare.
    return { field: "address", comparison: "not_found_on_site", siteValue: null, googleValue: googleAddress };
  }
  const nearby = lower.slice(Math.max(0, numberIdx - 5), numberIdx + 40);
  if (nearby.includes(tokens.streetWord)) {
    return { field: "address", comparison: "matches", siteValue: nearby.trim(), googleValue: googleAddress };
  }
  // A real street number exists on the page but the street name right
  // after it doesn't match — a genuine, specific conflict (a different
  // real address), not just "couldn't find an address at all."
  return { field: "address", comparison: "conflicts", siteValue: nearby.trim(), googleValue: googleAddress };
}

interface ParsedHoursEntry {
  /** Google's own day numbering: 0 = Sunday ... 6 = Saturday. */
  days: number[];
  openMinutes: number;
  closeMinutes: number | null;
  closed: boolean;
}

const DAY_NAME_TO_NUMBER: Record<string, number> = {
  sun: 0, sunday: 0, dom: 0, domingo: 0,
  mon: 1, monday: 1, lun: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, mar: 2, martes: 2,
  wed: 3, wednesday: 3, mie: 3, mié: 3, miercoles: 3, miércoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, jue: 4, jueves: 4,
  fri: 5, friday: 5, vie: 5, viernes: 5,
  sat: 6, saturday: 6, sab: 6, sáb: 6, sabado: 6, sábado: 6,
};

/** Monday(1) .. Sunday(0) display sequence, so a "Monday - Sunday" range
 * expands in the real order a visitor reads it, including the Sat->Sun
 * wraparound. */
const WEEK_SEQUENCE = [1, 2, 3, 4, 5, 6, 0];

function expandDayRange(startDay: number, endDay: number): number[] {
  const startIdx = WEEK_SEQUENCE.indexOf(startDay);
  const endIdx = WEEK_SEQUENCE.indexOf(endDay);
  if (startIdx === -1 || endIdx === -1) return [];
  const days: number[] = [];
  let i = startIdx;
  while (true) {
    days.push(WEEK_SEQUENCE[i]);
    if (i === endIdx) break;
    i = (i + 1) % 7;
    if (days.length > 7) break; // safety: never loop forever on bad input
  }
  return days;
}

const DAY_NAME_PATTERN = Object.keys(DAY_NAME_TO_NUMBER)
  .sort((a, b) => b.length - a.length) // longest first so "thursday" matches before "thu"
  .join("|");
const DAY_OR_DAILY_RE = new RegExp(`\\b(${DAY_NAME_PATTERN}|daily|every day|todos los d[ií]as)\\b`, "gi");
const TIME_RE = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i;

/** The real Bing's Bakery case: "...P.M.Closed Sunday" (no space at
 * all between the run-together sentences) — "Closed" here PRECEDES
 * the day it actually describes, the reverse of the far more common
 * "Monday: Closed" shape. Every match's OWN start index is a hard
 * right-boundary for whatever PRECEDING day's window is being scanned
 * (that text belongs to the day named here, never the one before it),
 * and the day name itself is checked via a backward look (see the main
 * loop) to mark THIS day closed. */
const CLOSED_BEFORE_DAY_RE = new RegExp(`\\b(?:closed|cerrado)\\b\\s*[:,-]?\\s*(?:on\\s+)?(${DAY_NAME_PATTERN})\\b`, "gi");

/** The real Ilda's Salon case: "Hours Monday Closed Tuesday 9:00 AM –
 * 9:00 PM ..." — a day name sits on BOTH sides of "Closed" here, and
 * it unambiguously belongs to the one immediately BEFORE it ("Monday:
 * Closed"), not the one after ("Closed Tuesday" is coincidental
 * adjacency, not a real "Closed <Day>" marker for Tuesday). True when
 * a real day name ends right where `closedIdx` (the start of the
 * "closed"/"cerrado" word) begins. */
function closedTokenPrecededByDayName(text: string, closedIdx: number): boolean {
  const before = text.slice(Math.max(0, closedIdx - 15), closedIdx);
  return new RegExp(`(?:${DAY_NAME_PATTERN})\\s*[:,-]?\\s*$`, "i").test(before);
}

/** A real date/season-limited exception — "Closed Saturdays in July
 * and August", "closed during the holidays", "closed until March 1" —
 * must never override a day's REAL regular hours (the Shoe Tech case),
 * and on its own is never enough to mark a day closed either (we have
 * no way to know whether "now" falls inside the exception window — the
 * scoring engine stays clock-free, same reasoning as every other
 * check here). Checked within a short lookahead of a "closed"
 * mention; when present, that specific "closed" is ignored entirely —
 * the day falls back to whatever real hours exist, or to "not
 * mentioned" when none do. Bilingual. */
const SEASONAL_EXCEPTION_RE =
  /\bin\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\bduring\s+(?:the\s+)?(?:summer|winter|spring|fall|autumn|holidays?)\b|\bfor\s+(?:the\s+)?holidays?\b|\buntil\s+\S|\bseasonal(?:ly)?\b|\ben\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\bdurante\s+(?:el\s+)?verano\b|\bhasta\s+\S/i;

/** How far ahead of a "closed" mention (or the day name it attaches
 * to) to look for a seasonal/date-limited qualifier — wide enough for
 * a short qualifying phrase, never a whole paragraph. */
const SEASONAL_EXCEPTION_LOOKAHEAD = 50;

function parseTimeToMinutes(hourStr: string, minuteStr: string | undefined, meridiem: string): number | null {
  let hour = Number(hourStr);
  const minute = minuteStr ? Number(minuteStr) : 0;
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  const isPm = /p/i.test(meridiem);
  if (hour === 12) hour = isPm ? 12 : 0;
  else if (isPm) hour += 12;
  return hour * 60 + minute;
}

/**
 * Parses real day-range + time-range statements out of free text —
 * "Monday - Sunday: 11am - 7pm", "Mon–Fri 9am-5pm", "Sat: Closed" — into
 * Google's own day-numbering shape, so they can be compared directly
 * against `opening_hours_periods`. Deliberately pragmatic, not a general
 * natural-language hours parser: handles a real day name/range (or
 * "daily"/"every day") followed, within a short window, by a real
 * "Closed" or a time range in 12-hour `am`/`pm` form. Anything it can't
 * confidently parse is simply not included in the result — never
 * guessed. Never throws.
 */
export function parseHoursFromText(text: string): ParsedHoursEntry[] {
  const entries: ParsedHoursEntry[] = [];
  let m: RegExpExecArray | null;
  DAY_OR_DAILY_RE.lastIndex = 0;
  const dayMatches: { index: number; length: number; days: number[] }[] = [];
  while ((m = DAY_OR_DAILY_RE.exec(text)) !== null) {
    const token = m[1].toLowerCase();
    let days: number[];
    if (token === "daily" || token === "every day" || token.startsWith("todos")) {
      days = [0, 1, 2, 3, 4, 5, 6];
    } else {
      const day = DAY_NAME_TO_NUMBER[token];
      if (day === undefined) continue;
      days = [day];
    }
    dayMatches.push({ index: m.index, length: m[0].length, days });
  }

  // Every "Closed <Day>" (or "Cerrado <Day>") start index — a hard
  // right-boundary for whatever PRECEDING day's window is computed
  // below (see CLOSED_BEFORE_DAY_RE's own doc for why: that text names
  // and belongs to the FOLLOWING day, never the one before it).
  const closedBeforeDayStarts: number[] = [];
  CLOSED_BEFORE_DAY_RE.lastIndex = 0;
  while ((m = CLOSED_BEFORE_DAY_RE.exec(text)) !== null) {
    // The real Ilda's Salon case: "Monday Closed Tuesday" — this
    // "Closed" is already claimed by "Monday" (the day immediately
    // before it), so it's never a boundary/closed-marker for "Tuesday"
    // too, even though it also happens to precede a day name.
    if (closedTokenPrecededByDayName(text, m.index)) continue;
    closedBeforeDayStarts.push(m.index);
  }

  // Tracks which dayMatches entries were already consumed as a range's
  // END token (e.g. the "Sunday" in "Monday - Sunday") so they're never
  // ALSO parsed as their own separate single-day entry.
  const consumed = new Set<number>();
  for (let i = 0; i < dayMatches.length; i++) {
    if (consumed.has(i)) continue;
    const current = dayMatches[i];
    let days = current.days;
    let afterToken = current.index + current.length;

    // A real day-RANGE: "Monday - Sunday" — a short separator directly
    // between this token and the next real day token means the next
    // one is the range's end.
    const next = dayMatches[i + 1];
    if (next && days.length === 1 && next.days.length === 1) {
      const between = text.slice(afterToken, next.index);
      if (/^\s*(?:-|–|—|to)\s*$/i.test(between)) {
        days = expandDayRange(days[0], next.days[0]);
        afterToken = next.index + next.length;
        consumed.add(i + 1);
      }
    }

    const followingDay = dayMatches.find((d, idx) => idx > i && !consumed.has(idx) && d.index >= afterToken);
    // The real Bing's Bakery case: never let this day's own window
    // reach into a "Closed <NextDay>" phrase — that text belongs to
    // the day it names, not this one.
    const nextClosedBeforeDay = closedBeforeDayStarts.find((idx) => idx >= afterToken);
    const windowEnd = Math.min(
      followingDay ? followingDay.index : Infinity,
      nextClosedBeforeDay ?? Infinity,
      afterToken + 80,
      text.length
    );
    const window = text.slice(afterToken, windowEnd);

    // Real, parseable hours always win over any "closed" mention found
    // anywhere else for this same day (the real Shoe Tech case: "Sat
    // 9am - 2pm, Closed Saturdays in July and August" — the regular
    // hours come first and are real; the later "Closed" is a seasonal
    // exception that must never override them). Checked BEFORE any
    // closed-detection below, not after.
    const timeMatches = Array.from(window.matchAll(new RegExp(TIME_RE.source, "gi")));
    if (timeMatches.length >= 2) {
      const open = parseTimeToMinutes(timeMatches[0][1], timeMatches[0][2], timeMatches[0][3]);
      const close = parseTimeToMinutes(timeMatches[1][1], timeMatches[1][2], timeMatches[1][3]);
      if (open !== null && close !== null) {
        entries.push({ days, openMinutes: open, closeMinutes: close, closed: false });
        continue;
      }
    }

    // No real hours found — check for a real closed marker, BACKWARD
    // first (the real Bing's Bakery Sunday case: "...Closed Sunday",
    // closed precedes the day it describes) then forward (the far more
    // common "Monday: Closed" shape). Either way, a seasonal/date-
    // limited qualifier nearby (see SEASONAL_EXCEPTION_RE) means this
    // specific "closed" is ignored — never enough to mark the day
    // closed on its own, and there's no real contradicting regular
    // hours to fall back to either, so nothing is pushed at all.
    const beforeToken = text.slice(Math.max(0, current.index - 20), current.index);
    const closedBeforeMatch = beforeToken.match(/\b(?:closed|cerrado)\b\s*[:,-]?\s*(?:on\s+)?$/i);
    // Same real Ilda's Salon disambiguation as closedBeforeDayStarts
    // above: if THIS "closed" is itself immediately preceded by a
    // different day name, it's already that earlier day's own forward
    // "<Day>: Closed" marker, never a backward one for the current day.
    const closedBefore =
      closedBeforeMatch &&
      !closedTokenPrecededByDayName(text, Math.max(0, current.index - 20) + closedBeforeMatch.index!);
    const closedAfterMatch = window.match(/\b(?:closed|cerrado)\b/i);

    if (closedBefore) {
      const afterDay = text.slice(afterToken, afterToken + SEASONAL_EXCEPTION_LOOKAHEAD);
      if (!SEASONAL_EXCEPTION_RE.test(afterDay)) {
        entries.push({ days, openMinutes: 0, closeMinutes: 0, closed: true });
      }
      continue;
    }

    if (closedAfterMatch) {
      const afterClosed = text.slice(afterToken + closedAfterMatch.index! + closedAfterMatch[0].length, afterToken + closedAfterMatch.index! + closedAfterMatch[0].length + SEASONAL_EXCEPTION_LOOKAHEAD);
      if (!SEASONAL_EXCEPTION_RE.test(afterClosed)) {
        entries.push({ days, openMinutes: 0, closeMinutes: 0, closed: true });
      }
      continue;
    }
  }

  return entries;
}

/** Google's own structured periods, reduced to the same per-day shape
 * `parseHoursFromText` produces — see lib/google/places.ts's
 * OpeningHoursPeriod. Days with no period at all are left absent (never
 * guessed as closed — Google simply may not have reported that day). */
function normalizeGooglePeriods(periods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[]): Map<number, { openMinutes: number; closeMinutes: number | null }> {
  const byDay = new Map<number, { openMinutes: number; closeMinutes: number | null }>();
  for (const period of periods) {
    const open = period.open;
    if (!open || typeof open.day !== "number" || typeof open.hour !== "number" || typeof open.minute !== "number") continue;
    const openMinutes = open.hour * 60 + open.minute;
    let closeMinutes: number | null = null;
    if (period.close && typeof period.close.hour === "number" && typeof period.close.minute === "number") {
      closeMinutes = period.close.hour * 60 + period.close.minute;
    }
    byDay.set(open.day, { openMinutes, closeMinutes });
  }
  return byDay;
}

/**
 * Compares the site's own real parsed hours (see parseHoursFromText)
 * against Google's structured `opening_hours_periods`, per real day —
 * "matches" when every day the site states real hours for lines up
 * (within a small tolerance), "conflicts" when at least one real day
 * genuinely disagrees (shown with both real values), "not_found_on_site"
 * (no penalty) when the site states no parseable hours at all. Only
 * ever compares days the SITE actually states — a day Google has but the
 * site doesn't mention is never treated as a conflict.
 */
/** Google's own day numbering (0 = Sunday ... 6 = Saturday), for
 * display in a finding's siteValue/googleValue — e.g. "Sunday: Closed"
 * vs "Sunday: 7:00 AM–5:00 PM", so a conflict names the EXACT day it's
 * about rather than a bare, dayless time range. */
const DAY_NAMES_DISPLAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayName(day: number): string {
  return DAY_NAMES_DISPLAY[day] ?? `Day ${day}`;
}

function formatHoursRange(openMinutes: number, closeMinutes: number | null): string {
  return formatMinutes(openMinutes) + (closeMinutes !== null ? `–${formatMinutes(closeMinutes)}` : "");
}

export function compareHours(
  siteText: string,
  googlePeriods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null
): InfoFieldFinding {
  const siteEntries = parseHoursFromText(siteText);
  if (siteEntries.length === 0) {
    return { field: "hours", comparison: "not_found_on_site", siteValue: null, googleValue: null };
  }
  if (!googlePeriods || googlePeriods.length === 0) {
    return { field: "hours", comparison: "not_found_on_site", siteValue: "see site", googleValue: null };
  }
  const googleByDay = normalizeGooglePeriods(googlePeriods);

  const TOLERANCE_MINUTES = 30;
  for (const entry of siteEntries) {
    for (const day of entry.days) {
      const googleDay = googleByDay.get(day);
      if (!googleDay) continue; // Google has nothing for this SAME day — never a conflict
      if (entry.closed) {
        // Site says closed; Google has real hours for this exact day — a real conflict.
        return {
          field: "hours",
          comparison: "conflicts",
          siteValue: `${dayName(day)}: Closed`,
          googleValue: `${dayName(day)}: ${formatHoursRange(googleDay.openMinutes, googleDay.closeMinutes)}`,
        };
      }
      const openDiff = Math.abs(entry.openMinutes - googleDay.openMinutes);
      const closeDiff =
        entry.closeMinutes !== null && googleDay.closeMinutes !== null
          ? Math.abs(entry.closeMinutes - googleDay.closeMinutes)
          : 0;
      if (openDiff > TOLERANCE_MINUTES || closeDiff > TOLERANCE_MINUTES) {
        return {
          field: "hours",
          comparison: "conflicts",
          siteValue: `${dayName(day)}: ${formatHoursRange(entry.openMinutes, entry.closeMinutes)}`,
          googleValue: `${dayName(day)}: ${formatHoursRange(googleDay.openMinutes, googleDay.closeMinutes)}`,
        };
      }
    }
  }
  return { field: "hours", comparison: "matches", siteValue: "see site", googleValue: "see listing" };
}

function formatMinutes(total: number): string {
  const hour24 = Math.floor(total / 60);
  const minute = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const meridiem = hour24 < 12 ? "AM" : "PM";
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

/** Pulls the real city out of a Google-formatted address ("209 E Main
 * St, Newark, DE 19711" -> "Newark") — the second comma-separated
 * segment, Google's own consistent format. Null when the address has
 * no real city segment to extract (too few commas). */
export function extractCityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return parts[1].length > 0 ? parts[1] : null;
}

/** Real signals that a page covers MULTIPLE business locations (a
 * chain's own "find a location"/location-switcher page) — bilingual,
 * deliberately specific multi-word-adjacent terms, never a bare city
 * name (which legitimately appears once on a real single-location
 * site too). Only when one of these appears do we bother restricting
 * to a city-specific window at all — a real single-location site's
 * text is never artificially narrowed. */
const MULTI_LOCATION_SIGNAL_RE = /\blocations?\b|\bsucursales\b|\bubicaciones\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The real Claymont Steak Shop case: a chain page can list EVERY
 * location's hours as one short, repeating "<City> Mon, Tue, ... /
 * Fri, Sat ... / Sun ..." sequence, all within the same short "Hours"
 * section — close enough together that a generic character-radius
 * window (see restrictToLocationWindow) still sweeps in a NEIGHBORING
 * city's own block, not just ours. This finds every real heading-style
 * occurrence (a capitalized word immediately followed by a real day
 * name/range — "Claymont Mon,", "Newark Mon,", "Wilmington Mon,") and,
 * when at least 2 real headings are found (confirming this IS a real
 * repeating per-location list, not a coincidental one-off), returns
 * ONLY the span from OUR city's own heading to the START of the NEXT
 * one — excluding every neighboring location's block entirely, not
 * just de-prioritizing it. Returns null when this specific pattern
 * isn't present (fewer than 2 real headings found, or our own city
 * isn't among them) — restrictToLocationWindow then falls back to its
 * own wider, coarser window (the real Santa Fe Mexican Grill case: the
 * city heading sits before the address+phone, not immediately before
 * the day names, so this pattern genuinely doesn't apply there, and
 * the wider window already resolves correctly on its own).
 */
function extractLocationHeadingBlock(text: string, city: string): string | null {
  const headingRe = new RegExp(`\\b([A-Z][a-zA-Z]{1,24})\\s{0,3}(?=(?:${DAY_NAME_PATTERN}|daily|every day)\\b)`, "gi");
  const headings: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(text)) !== null) {
    headings.push({ name: m[1], index: m.index });
  }
  if (headings.length < 2) return null;
  const ownIndex = headings.findIndex((h) => h.name.toLowerCase() === city.toLowerCase());
  if (ownIndex === -1) return null;
  const start = headings[ownIndex].index;
  const end = ownIndex + 1 < headings.length ? headings[ownIndex + 1].index : Math.min(text.length, start + 400);
  return text.slice(start, end);
}

/**
 * The real Santa Fe Mexican Grill case: a chain's homepage can show
 * ANOTHER location's hours/phone/address (e.g. a "today's hours"
 * widget for a different branch), which would otherwise read as a
 * false conflict against THIS business's own real Google listing.
 * When the page shows real multi-location signals (see
 * MULTI_LOCATION_SIGNAL_RE), this first tries to isolate OUR city's own
 * exact heading-to-heading block (see extractLocationHeadingBlock —
 * the real Claymont Steak Shop case, where several locations' hours sit
 * close enough together that a radius-based window alone still leaks a
 * neighbor's block in). When that specific pattern isn't present, this
 * falls back to real windows of text actually near a mention of `city`
 * — anything elsewhere on the page (another location's own block) is
 * excluded. A real single-location site (no multi-location signal) is
 * never narrowed — its whole page stays in scope, exactly as before.
 * When `city` is unknown, or a multi-location page never actually
 * mentions it, this honestly returns no text at all — every comparison
 * then correctly reports not_found_on_site rather than risking a
 * cross-location false positive.
 */
function restrictToLocationWindow(text: string, city: string | null): string {
  if (!city || !MULTI_LOCATION_SIGNAL_RE.test(text)) return text;
  const headingBlock = extractLocationHeadingBlock(text, city);
  if (headingBlock !== null) return headingBlock;
  const cityRe = new RegExp(`\\b${escapeRegExp(city)}\\b`, "gi");
  const ranges: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = cityRe.exec(text)) !== null) {
    ranges.push({ start: Math.max(0, m.index - 1000), end: Math.min(text.length, m.index + city.length + 1000) });
  }
  if (ranges.length === 0) return "";
  // The real Miami Watersports case: a short real page (well under
  // 2000 chars) mentioning its own city several times gets an
  // OVERLAPPING ±1000-char window around EVERY mention — naively
  // joining them without merging duplicates the page's own text back
  // to back, which can create a fabricated adjacency between a day
  // name and a LATER duplicate occurrence of an unrelated time phrase
  // that were never actually next to each other on the real page.
  // Merging overlapping/adjacent ranges first means every real
  // character of the page is included at most once.
  ranges.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [ranges[0]];
  for (const r of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ ...r });
    }
  }
  return merged.map((r) => text.slice(r.start, r.end)).join(" ");
}

/** Shared entry point: runs all three info-consistency comparisons
 * against one already-fetched page's visible text — see
 * restrictToLocationWindow's own doc for the real multi-location-chain
 * case this guards against. */
/** matches is always the best possible real evidence, then conflicts
 * (a real, specific disagreement), then not_found_on_site (nothing to
 * go on). Used to pick the better of two independent real comparisons
 * — see compareListingInfo's own `secondaryText` doc for why these are
 * never just concatenated into one string first. */
const INFO_COMPARISON_PRIORITY: Record<InfoFieldComparison, number> = { matches: 2, conflicts: 1, not_found_on_site: 0 };

function preferInfoFieldFinding(a: InfoFieldFinding, b: InfoFieldFinding): InfoFieldFinding {
  return INFO_COMPARISON_PRIORITY[b.comparison] > INFO_COMPARISON_PRIORITY[a.comparison] ? b : a;
}

function compareAllFields(
  siteText: string,
  google: {
    phone: string | null;
    address: string | null;
    openingHoursPeriods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null;
  }
): InfoFieldFinding[] {
  const scopedText = restrictToLocationWindow(siteText, extractCityFromAddress(google.address));
  return [comparePhone(scopedText, google.phone), compareAddress(scopedText, google.address), compareHours(scopedText, google.openingHoursPeriods)];
}

export function compareListingInfo(
  siteText: string,
  google: {
    phone: string | null;
    address: string | null;
    openingHoursPeriods: { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } }[] | null;
  },
  // The site's own Contact page text, when one was found (see
  // findContactPageCandidate in lib/websiteAnalysis.ts) — the real
  // Bagel Emporium case: a phone/hours/address only ever stated on a
  // dedicated Contact page, never the homepage. Compared SEPARATELY
  // from `siteText`, never concatenated into one string first — the
  // real Miami Watersports case this guards against: a day name
  // appearing incidentally on the homepage (not real hours) and a time
  // appearing incidentally near the start of the Contact page's own
  // text could otherwise land in the same parsing window across the
  // artificial seam between the two pages, producing a fabricated
  // "hours" entry neither page actually states. Each field independently
  // takes whichever of the two real comparisons is the better evidence
  // (matches > conflicts > not_found_on_site) — see
  // preferInfoFieldFinding's own doc.
  secondaryText?: string | null
): InfoFieldFinding[] {
  const primary = compareAllFields(siteText, google);
  if (!secondaryText) return primary;
  const secondary = compareAllFields(secondaryText, google);
  return primary.map((finding, i) => preferInfoFieldFinding(finding, secondary[i]));
}

// ---------------------------------------------------------------------
// "Has a website" verification model (Oct 10) — classifying the
// Google-listing website itself, and detecting a real "Page Not Found"
// on it (the real Wonder The Grove Newark case: the listing's own URL
// 404s on the operator's own platform). See website.has_website /
// website.listing_link's own doc (lib/scoring.ts) for how these feed
// scoring.
// ---------------------------------------------------------------------

export type WebsiteKind = "independent" | "free_builder" | "directory";

/** Real free website-builder address patterns — a site built here is
 * genuinely the owner's OWN real content (the real Modern Liquors
 * case: real About/Services narrative, just hosted on a free address)
 * and counts as "has a website," unlike a directory/marketplace (see
 * DIRECTORY_HOSTS below) where the CONTENT itself belongs to a
 * different, unrelated business entirely. */
const FREE_BUILDER_HOSTS = ["sites.google.com", "wixsite.com", "weebly.com", "square.site", "godaddysites.com"];

/** Real multi-business directories/aggregators/marketplaces — the
 * content here is never the business's own; it's someone else's
 * platform showing the business as one listing among many (or, for an
 * ordering platform, a checkout flow, not a real marketing site).
 * Never counts as "has a website," regardless of how real/complete the
 * listing within it looks. */
const DIRECTORY_HOSTS = [
  "yelp.com",
  "nailsites.com",
  "facebook.com",
  "instagram.com",
  "doordash.com",
  "grubhub.com",
  "ubereats.com",
  "linktr.ee",
  "linktree.com",
  "localsearch.com",
];

function hostMatches(hostname: string, list: string[]): boolean {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Classifies a website's real hostname — see FREE_BUILDER_HOSTS/
 * DIRECTORY_HOSTS' own docs. Anything not matching either list is
 * "independent": the owner's own real domain, whether or not we've
 * independently verified its content (verification is a separate,
 * later step — see website.has_website's own doc). */
export function classifyWebsiteKind(hostname: string): WebsiteKind {
  if (hostMatches(hostname, DIRECTORY_HOSTS)) return "directory";
  if (hostMatches(hostname, FREE_BUILDER_HOSTS)) return "free_builder";
  return "independent";
}

/** Real, specific "this exact page doesn't exist" phrases — the real
 * Wonder The Grove Newark case: "There is an error in the URL entered
 * ... The page you are looking for has been moved or deleted," under a
 * "Page Not Found" heading. Deliberately specific multi-word phrases
 * (never a bare "404," which legitimately appears in unrelated page
 * content) so a real working page is never misread as broken. */
const PAGE_NOT_FOUND_PHRASES = [
  "page not found",
  "page you are looking for",
  "page you're looking for",
  "página no encontrada",
  "no se pudo encontrar la página",
];

/** True when `visibleText` reads as a genuine "this URL doesn't exist"
 * error page rather than real site content — only ever meaningful when
 * we actually got real content back (a 200 with a real body); a site
 * that's merely unreachable (blocked/timed out) is a completely
 * different, already-handled case (couldnt_check), never this. */
export function looksLikePageNotFound(visibleText: string): boolean {
  const lower = visibleText.toLowerCase();
  return PAGE_NOT_FOUND_PHRASES.some((phrase) => lower.includes(phrase));
}

// ---------------------------------------------------------------------
// 4e) Owner-override keys — see WebsiteTrustOverride's own doc
// (lib/scoring.ts) for the full override mechanism. These two functions
// are the ONE place a finding's stable identity is computed, shared by
// whatever writes an override and whatever later checks for one, so the
// two can never drift out of sync on what "the same finding" means.
// ---------------------------------------------------------------------

export function keyForStaleNotice(finding: StaleNoticeFinding): string {
  return `stale_notice:${finding.text}`;
}

export function keyForInfoConflict(finding: InfoFieldFinding): string {
  return `info_conflict:${finding.field}`;
}

// Re-exported for callers that already have main-content-isolated HTML
// and just want the plain-text extraction this module's own functions
// expect — avoids every caller re-importing from pagePresenceDetection
// directly for this one pass-through.
export { extractMainContentHtml, extractVisibleText, wordCount };
