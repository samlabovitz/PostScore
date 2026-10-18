// Pure, network-free extraction of real content/contact signals from a
// website's raw HTML — see lib/scoring.ts's WebsiteContentSignals type
// and its website.content_depth/website.contact_conversion checks,
// which are the only things that ever read this function's output.
//
// This module never fetches anything itself (see lib/websiteAnalysis.ts
// for the real network fetch) and is intentionally regex/string based
// rather than a full HTML parser: the goal is a handful of honest,
// best-effort signals ("is there a title, roughly how much real text is
// there, is there a tel: link"), not a faithful DOM reconstruction. If
// a signal can't be determined it comes back false/0 — the caller
// (lib/websiteAnalysis.ts) is what decides whether the whole analysis
// should be excluded (e.g. the fetch failed entirely), not this module.
//
// Reused for two different HTML strings: a real business's live site
// (fetched over the network) and PostScore's own starter-site
// template's generated HTML (see app/actions/website.ts's smart
// builder-offer comparison) — the exact same real analysis both times,
// never a separate hand-tuned estimate for the template.

import type { WebsiteContentSignals } from "./scoring";
import { WEBSITE_CTA_PHRASES, type ContactEvidence, type SocialProfile } from "./scoring";

/**
 * Strips every real markup that is NEVER visible to a real visitor —
 * HTML comments, `<script>`, `<style>`, `<noscript>` (shown only to
 * visitors with JavaScript disabled, not a real body fact), and
 * `<template>` (inert by spec until cloned by JS). Comments are
 * stripped FIRST: a naive `/<[^>]+>/` tag-stripper otherwise treats a
 * comment's own opening tag (e.g. `<!--<p>real-looking text</p>-->`) as
 * the first "tag," stopping at ITS `>` and leaking the comment's real
 * text into "visible" content as if a real visitor could read it (Day
 * 4 Task, the real Bagel Emporium case lib/pagePresenceDetection.ts's
 * own stripNonVisibleMarkup fixes the same way).
 */
function stripNonVisibleMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ");
}

/** Below this many visible characters (and zero real headings), a page
 * reads as having essentially no content at all — deliberately much
 * stricter than lib/scoring.ts's THIN_CONTENT_CHARS (which flags a real,
 * if thin, page for content_depth's own scoring): this threshold is only
 * for recognizing an empty pre-render shell, never for judging a real
 * page's depth. */
const CSR_SHELL_MAX_TEXT_CHARS = 40;

/** Real, checkable technical signals that a page's markup is a
 * client-side app's mount point rather than its actual rendered content
 * — the well-known container ids a handful of popular frameworks use
 * (Nuxt, Next.js, and the generic "root"/"app" convention React/Vue
 * starter templates default to), plus an explicit serverRendered:false
 * flag some frameworks (Nuxt) embed in their hydration payload. None of
 * these alone proves a shell — plenty of real, fully-rendered sites also
 * happen to have a <div id="app">...</div> full of real static content —
 * which is why detectClientRenderedShell below only trusts them in
 * combination with near-zero visible text/headings. */
const CSR_SHELL_MARKERS: RegExp[] = [
  /id=["']__nuxt["']/i,
  /id=["']__next["']/i,
  /id=["']root["']/i,
  /id=["']app["']/i,
  /serverRendered["']?\s*:\s*false/i,
];

/**
 * True only when a page both (a) reads as having essentially no real
 * content AND (b) carries an actual technical signal of client-side
 * rendering — see CSR_SHELL_MARKERS. Deliberately conjunctive, never
 * inferred from thin content alone: a genuinely bare/broken landing page
 * with no such marker still reads as bare, not "unreadable." This is
 * what lets website.content_depth/website.contact_conversion
 * (lib/scoring.ts) tell "we couldn't read this site" apart from "this
 * site has no content" — the two must never be confused, since only one
 * of them is honestly a failure worth reporting.
 */
function detectClientRenderedShell(html: string, visibleTextLength: number, headingCount: number): boolean {
  if (headingCount > 0) return false;
  if (visibleTextLength <= CSR_SHELL_MAX_TEXT_CHARS && CSR_SHELL_MARKERS.some((marker) => marker.test(html))) return true;
  // An EMPTY app mount point (e.g. Lovable/Vite's <div id="root"></div>)
  // is a stronger signal than the marker alone, so a little badge or
  // banner text (the real J & G Italian Deli case: "Edit with Lovable")
  // doesn't hide that the page itself is built in the browser.
  return visibleTextLength <= CSR_SHELL_EMPTY_MOUNT_MAX_TEXT_CHARS && CSR_SHELL_EMPTY_MOUNT.test(html);
}

/** An app mount point with nothing inside it. */
const CSR_SHELL_EMPTY_MOUNT = /<div\b[^>]*\bid\s*=\s*["'](?:root|app|__next|__nuxt|___gatsby|svelte)["'][^>]*>\s*<\/div>/i;
const CSR_SHELL_EMPTY_MOUNT_MAX_TEXT_CHARS = 300;

function extractTag(html: string, re: RegExp): string | null {
  const match = html.match(re);
  return match ? match[1] : null;
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

/** Strips every non-visible markup kind (see stripNonVisibleMarkup),
 * then all remaining tags, decodes a few common entities, and
 * collapses whitespace — a deliberately simple approximation of "what
 * a visitor actually reads on the page." Self-contained (re-strips
 * comments/noscript/template even though `clean` below already has
 * them removed) so this stays correct even if called directly on
 * un-pre-processed HTML in the future. */
function extractVisibleText(html: string): string {
  const withoutTags = stripNonVisibleMarkup(html).replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** One attribute's value from a single tag's raw text — quoted
 * (single or double) or unquoted, case-insensitive name. */
function attributeValue(tag: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const m = tag.match(re);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/**
 * The content of the first `<meta name="{name}">` tag — Step 2d: in any
 * attribute order (`content=… name=…` too), quoted or unquoted, and
 * wherever it sits among the page's meta tags. Minified WordPress
 * (Autoptimize, WP Rocket, Cloudflare) routinely strips quotes, which
 * the old `name="…" content="…"`-only pattern silently missed.
 */
export function metaContent(html: string, name: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if ((attributeValue(tag, "name") ?? "").toLowerCase() !== name.toLowerCase()) continue;
    const content = attributeValue(tag, "content");
    if (content !== null) return content;
  }
  return null;
}

interface AnchorLink {
  href: string;
  text: string;
  /** Step 2g: extra URLs some icon buttons keep in data attributes. */
  dataUrls?: string[];
}

/** Every real `<a href>` with its visible text — href quoted or unquoted. */
function anchorLinks(html: string): AnchorLink[] {
  const links: AnchorLink[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = attributeValue(` ${m[1]}`, "href");
    const dataUrls = ["data-href", "data-url", "data-link"]
      .map((attr) => attributeValue(` ${m![1]}`, attr))
      .filter((v): v is string => !!v);
    if (!href && dataUrls.length === 0) continue;
    const text = decodeBasicEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ href: (href ?? "").trim(), text, dataUrls });
  }
  return links;
}

/** A path that is the site's own contact page (EN + ES). */
const CONTACT_PATH_RE = /^\/(?:[a-z]{2}\/)?(?:contact(?:-us|o|anos|enos)?|contact\.html|contactus|contáctenos|contactenos)\/?$/i;

/** Visible link/button text that is itself an action (EN + ES) — exact
 * short labels, so ordinary prose never counts. */
const CONTACT_ACTION_TEXT_RE =
  /^(?:contact(?: us)?|email(?: us)?|e-mail us|call(?: us| now)?|book(?: now| online| an appointment)?|order(?: now| online)?|contacto|contáctenos|contáctanos|contactenos|escríbanos|escribanos|llámenos|llamenos|llamar(?: ahora)?|reserve|reservar|reserve ahora|pedir|pida ahora|ordenar|ordene ahora)$/i;

/**
 * Real contact links (Step 2d): `tel:` / `mailto:` (quoted or unquoted),
 * or a link to the site's OWN contact page (same host as `baseUrl`). When
 * any such link's visible text is an action ("Contact us", "Call",
 * "Book", "Order", "Llámenos"…), it also counts as a call-to-action.
 * Used on the homepage AND on the already-fetched Contact page.
 */
export function detectContactLinks(
  html: string,
  baseUrl?: string | null
): { hasPhoneLink: boolean; hasEmailLink: boolean; hasContactPageLink: boolean; hasActionLinkText: boolean; evidence: ContactEvidence } {
  const clean = stripNonVisibleMarkup(html);
  let base: URL | null = null;
  try {
    base = baseUrl ? new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`) : null;
  } catch {
    base = null;
  }
  let hasPhoneLink = false;
  let hasEmailLink = false;
  let hasContactPageLink = false;
  let hasActionLinkText = false;
  const evidence: ContactEvidence = { phoneLink: null, emailLink: null, contactPageLink: null, actionLinkText: null, ctaPhrase: null };
  for (const link of anchorLinks(clean)) {
    const href = link.href.toLowerCase();
    let isContact = false;
    if (href.startsWith("tel:")) {
      hasPhoneLink = isContact = true;
      evidence.phoneLink ??= link.href.trim().slice(0, 120);
    } else if (href.startsWith("mailto:")) {
      hasEmailLink = isContact = true;
      evidence.emailLink ??= link.href.trim().slice(0, 120);
    } else if (base) {
      try {
        const url = new URL(link.href, base);
        const sameHost = url.hostname.replace(/^www\./i, "") === base.hostname.replace(/^www\./i, "");
        if (sameHost && CONTACT_PATH_RE.test(decodeURIComponent(url.pathname))) {
          hasContactPageLink = isContact = true;
          evidence.contactPageLink ??= `${url.origin}${url.pathname}`.slice(0, 200);
        }
      } catch {
        // not a real URL — not a contact link
      }
    }
    if (isContact && CONTACT_ACTION_TEXT_RE.test(link.text.replace(/[!.→›»]+$/, "").trim())) {
      hasActionLinkText = true;
      evidence.actionLinkText ??= link.text.trim().slice(0, 60);
    }
  }
  return { hasPhoneLink, hasEmailLink, hasContactPageLink, hasActionLinkText, evidence };
}

/** Real social platforms and how a PROFILE (not a share button, post, or
 * the bare platform homepage) looks on each. */
const SOCIAL_PLATFORMS: Array<{ platform: string; hosts: string[]; profile: (segments: string[], url: URL) => boolean }> = [
  {
    platform: "Instagram",
    hosts: ["instagram.com"],
    profile: (s) => s.length >= 1 && !["p", "reel", "reels", "explore", "accounts", "share", "stories", "tv"].includes(s[0].toLowerCase()),
  },
  {
    platform: "Facebook",
    hosts: ["facebook.com", "fb.com", "fb.me", "m.facebook.com"],
    profile: (s, u) =>
      (s[0]?.toLowerCase() === "profile.php" && u.searchParams.has("id")) ||
      (s.length >= 1 &&
        !["sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "login.php", "home.php", "profile.php", "events", "watch", "hashtag", "groups"].includes(s[0].toLowerCase())),
  },
  { platform: "TikTok", hosts: ["tiktok.com"], profile: (s) => s.length >= 1 && s[0].startsWith("@") && s[0].length > 1 },
  {
    platform: "X/Twitter",
    hosts: ["twitter.com", "x.com"],
    profile: (s) => s.length >= 1 && !["intent", "share", "home", "i", "search", "hashtag", "login"].includes(s[0].toLowerCase()),
  },
  {
    platform: "YouTube",
    hosts: ["youtube.com", "m.youtube.com"],
    profile: (s) => s.length >= 1 && (s[0].startsWith("@") || (["channel", "c", "user"].includes(s[0].toLowerCase()) && s.length >= 2)),
  },
  { platform: "LinkedIn", hosts: ["linkedin.com"], profile: (s) => s.length >= 2 && ["company", "in", "school"].includes(s[0].toLowerCase()) },
  { platform: "Yelp", hosts: ["yelp.com"], profile: (s) => s.length >= 2 && s[0].toLowerCase() === "biz" },
  { platform: "Pinterest", hosts: ["pinterest.com"], profile: (s) => s.length >= 1 && !["pin", "search", "ideas"].includes(s[0].toLowerCase()) },
  { platform: "Threads", hosts: ["threads.net"], profile: (s) => s.length >= 1 && s[0].startsWith("@") },
];

function socialPlatformFor(hostname: string) {
  const host = hostname.replace(/^www\./i, "").toLowerCase();
  return SOCIAL_PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
}

/**
 * Real social media PROFILES the page links to (Step 2d) — never a share
 * button (facebook.com/sharer…, twitter.com/intent…), a post/video, or a
 * bare platform homepage. One entry per profile, displayed as
 * "instagram.com/mainstreetsweets".
 */
/** Decodes the entities generated pages put in link addresses. */
function decodeHrefEntities(href: string): string {
  return href
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;|&#47;/gi, "/")
    .replace(/&#x3a;|&#58;/gi, ":")
    .replace(/&#x3f;|&#63;/gi, "?")
    .replace(/&#x3d;|&#61;/gi, "=");
}

/**
 * Step 2g: every real URL a link can lead to — its href (protocol-
 * relative "//www.instagram.com/x" resolved), any data-href/data-url,
 * and a social URL wrapped inside a tracking/redirect link's query
 * string (store-locator platforms routinely wrap outbound links, e.g.
 * ".../click?url=https%3A%2F%2Fwww.facebook.com%2Fchipotle").
 */
function linkTargetUrls(link: AnchorLink): URL[] {
  const out: URL[] = [];
  for (const raw of [link.href, ...(link.dataUrls ?? [])]) {
    if (!raw) continue;
    let url: URL;
    try {
      url = new URL(decodeHrefEntities(raw).trim(), "https://placeholder.invalid/");
    } catch {
      continue;
    }
    if (!/^https?:$/i.test(url.protocol) || url.hostname === "placeholder.invalid") continue;
    out.push(url);
    url.searchParams.forEach((value) => {
      if (!/^(https?:)?\/\//i.test(value)) return;
      try {
        const inner = new URL(value.startsWith("//") ? `https:${value}` : value);
        if (/^https?:$/i.test(inner.protocol)) out.push(inner);
      } catch {
        // not a URL — ignore
      }
    });
  }
  return out;
}

/**
 * v1.10.0: platform-owned accounts that are never the business's own
 * profile — the real Gregg L. Smith (linkedin.com/company/wix-com) and
 * Yoga Love NY (facebook.com/wix, instagram.com/wix) cases, from "Made
 * with Wix" footer badges. Compared after lower-casing and dropping
 * "@", "-", "_" and ".".
 */
export const PLATFORM_ACCOUNT_HANDLES: ReadonlySet<string> = new Set([
  // Site builders
  "wix", "wixcom", "squarespace", "godaddy", "shopify", "weebly", "wordpress", "wordpressdotcom",
  "webflow", "duda", "jimdo", "strikingly", "carrd", "googlesites",
  // Ordering, booking and payment platforms
  "toasttab", "toast", "square", "squareup", "clover", "chownow", "olo", "popmenu", "bentobox", "getbento",
  "doordash", "ubereats", "grubhub", "opentable", "resy", "vagaro", "mindbody", "mindbodyonline", "booksy",
  "fresha", "styleseat", "mailchimp",
]);

/** A social platform's OWN account on that same platform
 * (instagram.com/instagram, x.com/x) — blocked only there, so a business
 * that happens to be called "X" elsewhere still counts. */
const OWN_PLATFORM_HANDLES: Record<string, readonly string[]> = {
  Facebook: ["facebook", "meta"],
  Instagram: ["instagram"],
  "X/Twitter": ["x", "twitter"],
  YouTube: ["youtube"],
  LinkedIn: ["linkedin"],
  TikTok: ["tiktok"],
  Pinterest: ["pinterest"],
  Yelp: ["yelp"],
  Threads: ["threads"],
};

function normalizeHandle(handle: string): string {
  return handle.toLowerCase().replace(/[@\-_.]/g, "");
}

export function detectSocialProfiles(html: string): SocialProfile[] {
  const profiles: SocialProfile[] = [];
  for (const url of anchorLinks(stripNonVisibleMarkup(html)).flatMap(linkTargetUrls)) {
    const platform = socialPlatformFor(url.hostname);
    if (!platform) continue;
    let segments = url.pathname.split("/").filter(Boolean);
    // v1.10.0: Facebook's "pg/<page>/…" (old page prefix) is the page
    // itself; "p/<name-id>" and "people/<name>/<id>" keep their prefix —
    // never truncated to a bare "facebook.com/pg" or "facebook.com/p"
    // (the real Pardalis and Red Bowl cases).
    let keep = platform.platform === "LinkedIn" || platform.platform === "Yelp" || (platform.platform === "YouTube" && !segments[0]?.startsWith("@")) ? 2 : 1;
    if (platform.platform === "Facebook" && segments.length >= 2) {
      const first = segments[0].toLowerCase();
      if (first === "pg") segments = segments.slice(1);
      else if (first === "p") keep = 2;
      else if (first === "people") keep = Math.min(3, segments.length);
    }
    if (!platform.profile(segments, url)) continue;
    const handle = keep >= 2 && platform.platform !== "Facebook" ? segments[1] ?? "" : segments[keep - 1] ?? "";
    const normalized = normalizeHandle(handle);
    if (PLATFORM_ACCOUNT_HANDLES.has(normalized) || (OWN_PLATFORM_HANDLES[platform.platform] ?? []).includes(normalized)) continue;
    const host = url.hostname.replace(/^(www|m)\./i, "").toLowerCase();
    const path = segments[0]?.toLowerCase() === "profile.php" ? `profile.php?id=${url.searchParams.get("id")}` : segments.slice(0, keep).join("/");
    const display = `${host}/${path}`;
    if (!profiles.some((p) => p.url.toLowerCase() === display.toLowerCase())) {
      profiles.push({ platform: platform.platform, url: display, href: url.toString() });
    }
  }
  return profiles;
}

const SCRIPT_SOCIAL_URL_RE =
  /(?:instagram|facebook|twitter|x|tiktok|youtube|linkedin|pinterest|yelp)\.com\/[A-Za-z0-9_@.-]+/i;

/**
 * Signs that the page's footer is built by a script after load, so a
 * plain fetch can't see its links — the real Chipotle (Yext Pages)
 * case: the "Connect With Us" Instagram/Twitter/Facebook icons exist
 * only inside a `<script type="module">` page-data blob
 * (`c_footerSocialIcons`), never as `<a>` links in the HTML. Countable:
 * an inline `<script>` whose text (URL-decoded) mentions "footer" AND
 * contains a social profile URL. Both are required — plenty of normal
 * sites' analytics scripts mention "footer" on their own.
 */
export function hasScriptBuiltFooterSigns(html: string): boolean {
  const inlineScriptRe = /<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = inlineScriptRe.exec(html)) !== null) {
    let body = m[1];
    if (!/footer/i.test(body) && !/footer/i.test(safeDecodeUri(body))) continue;
    body = safeDecodeUri(body);
    if (/footer/i.test(body) && SCRIPT_SOCIAL_URL_RE.test(body)) return true;
  }
  return false;
}

function safeDecodeUri(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    // A stray "%" in ordinary script text — decode just the %XX runs.
    return text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      try {
        return decodeURIComponent(run);
      } catch {
        return run;
      }
    });
  }
}

export function analyzeWebsiteHtml(html: string, baseUrl?: string | null): WebsiteContentSignals {
  const clean = stripNonVisibleMarkup(html);

  const title = extractTag(clean, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const hasTitle = !!title && decodeBasicEntities(title).trim().length > 0;

  // Any attribute order, quoted or unquoted (Step 2d) — see metaContent.
  const metaDescription = metaContent(clean, "description");
  const hasMetaDescription = !!metaDescription && metaDescription.trim().length > 0;

  const viewportContent = metaContent(clean, "viewport");
  const hasViewportTag = !!viewportContent && /width\s*=\s*device-width/i.test(viewportContent);

  const headingMatches = clean.match(/<h[1-6][\s>]/gi);
  const headingCount = headingMatches ? headingMatches.length : 0;

  const visibleText = extractVisibleText(clean);
  const visibleTextLength = visibleText.length;

  const { hasPhoneLink, hasEmailLink, hasContactPageLink, hasActionLinkText, evidence } = detectContactLinks(clean, baseUrl);

  const lowerText = visibleText.toLowerCase();
  // An action-labeled contact link/button ("Contact us", "Call", "Book",
  // "Llámenos"…) is itself a real call-to-action (Step 2d).
  const ctaPhrase = WEBSITE_CTA_PHRASES.find((phrase) => lowerText.includes(phrase)) ?? null;
  const hasCtaText = ctaPhrase !== null || hasActionLinkText;
  // v1.10.0: what actually counted for Contact & conversion, saved so an
  // audit can show it (no effect on the score).
  const contactEvidence: ContactEvidence = { ...evidence, ctaPhrase };
  const socialProfiles = detectSocialProfiles(clean);

  const isLikelyClientRenderedShell = detectClientRenderedShell(clean, visibleTextLength, headingCount);

  return {
    hasTitle,
    hasMetaDescription,
    hasViewportTag,
    headingCount,
    visibleTextLength,
    hasPhoneLink,
    hasEmailLink,
    hasContactPageLink,
    hasCtaText,
    socialProfiles,
    // Read from the RAW html — `clean` has scripts stripped.
    scriptBuiltFooter: hasScriptBuiltFooterSigns(html),
    contactEvidence,
    isLikelyClientRenderedShell,
    // This module never calls PageSpeed — recovery (when isLikelyClientRenderedShell
    // is true) is layered on afterward by lib/websiteAnalysis.ts's
    // collectWebsiteAnalysis, which is the only thing that ever sets this
    // to non-null.
    renderedContentSignals: null,
  };
}
