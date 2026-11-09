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
import { WEBSITE_CTA_PHRASES, type BrokenSocialLink, type ContactEvidence, type SocialProfile } from "./scoring";

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
  /** v1.13.0: the raw attributes and inner markup (icon classes,
   * aria-label/title) — how a social icon with no real link is named. */
  attrs?: string;
  inner?: string;
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
    // v1.13.0: an <a> with no href at all is kept too (an icon that goes
    // nowhere) — contact/social detection skip empty hrefs themselves.
    if (href === null && dataUrls.length === 0 && !/\b(?:twitter|youtube|facebook|instagram|tiktok|linkedin|pinterest|yelp)\b/i.test(m[0])) continue;
    const text = decodeBasicEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    links.push({ href: (href ?? "").trim(), text, dataUrls, attrs: m[1], inner: m[2] });
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

/** How an icon names its platform when its link doesn't: icon classes
 * ("fa fa-twitter", "icon-youtube"), aria-label/title, or its text. */
const SOCIAL_ICON_NAMES: Array<{ platform: string; re: RegExp }> = [
  { platform: "X/Twitter", re: /\btwitter\b|\bfa-x-twitter\b|\bx-twitter\b|aria-label\s*=\s*["']\s*x\s*["']/i },
  { platform: "YouTube", re: /\byoutube\b/i },
  { platform: "Facebook", re: /\bfacebook\b/i },
  { platform: "Instagram", re: /\binstagram\b/i },
  { platform: "TikTok", re: /\btiktok\b/i },
  { platform: "LinkedIn", re: /\blinkedin\b/i },
  { platform: "Pinterest", re: /\bpinterest\b/i },
  { platform: "Yelp", re: /\byelp\b/i },
];

/**
 * v1.13.0: social icons that don't go to a profile — the real National
 * 5 & 10 case (its footer's Twitter and YouTube icons both link to "#",
 * so tapping them just reloads the page). Broken when the link goes back
 * to the business's own site (its homepage, the same page, or "#"),
 * nowhere ("", "javascript:…"), or to a platform's bare homepage
 * ("https://twitter.com/"). A share button (sharer, intent) is not an
 * icon for the business's profile and is never counted either way. A
 * platform that ALSO has a real profile link on the page isn't broken
 * (the same icon set often appears twice).
 */
export function detectBrokenSocialLinks(html: string, baseUrl?: string | null): BrokenSocialLink[] {
  const clean = stripNonVisibleMarkup(html);
  let base: URL | null = null;
  try {
    base = baseUrl ? new URL(/^https?:\/\//i.test(baseUrl) ? baseUrl : `https://${baseUrl}`) : null;
  } catch {
    base = null;
  }
  const real = new Set(detectSocialProfiles(clean).map((p) => p.platform));
  const broken: BrokenSocialLink[] = [];
  for (const link of anchorLinks(clean)) {
    const raw = decodeHrefEntities(link.href).trim();
    let reason: BrokenSocialLink["reason"] | null = null;
    let platform: string | null = null;
    let url: URL | null = null;
    if (raw === "" || /^javascript:/i.test(raw)) reason = "no_link";
    else if (raw.startsWith("#")) reason = "own_site";
    else {
      try {
        url = new URL(raw, base ?? "https://placeholder.invalid/");
      } catch {
        continue;
      }
      const onPlatform = socialPlatformFor(url.hostname);
      if (onPlatform) {
        if (url.pathname.split("/").filter(Boolean).length > 0) continue; // a profile, share button or post — handled elsewhere
        platform = onPlatform.platform;
        reason = "platform_home";
      } else if (base && normalizeSiteHost(url.hostname) === normalizeSiteHost(base.hostname) && (url.pathname === "/" || url.pathname === "" || url.pathname === base.pathname)) {
        reason = "own_site";
      } else continue;
    }
    if (link.dataUrls && link.dataUrls.length > 0) continue; // a real address kept in data-href
    // A "Share on Facebook" button works by script — not a profile icon.
    if (/\bshare\b|compartir/i.test(`${link.attrs ?? ""} ${link.text}`)) continue;
    platform ??= SOCIAL_ICON_NAMES.find((n) => n.re.test(`${link.attrs ?? ""} ${link.inner ?? ""} ${link.text}`))?.platform ?? null;
    if (!platform || real.has(platform) || broken.some((b) => b.platform === platform)) continue;
    broken.push({ platform, href: link.href.slice(0, 200), reason });
  }
  return broken;
}

function normalizeSiteHost(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

/** Domain companies whose parking / "coming soon" / for-sale pages show
 * on a domain no one has built a site on. */
const PARKING_PROVIDERS: Array<{ name: string; re: RegExp }> = [
  { name: "NameBright", re: /namebright/i },
  { name: "GoDaddy", re: /godaddy|domaincontrol\.com/i },
  { name: "Sedo", re: /\bsedo(parking)?\b/i },
  { name: "Dan.com", re: /\bdan\.com\b/i },
  { name: "Afternic", re: /afternic/i },
  { name: "HugeDomains", re: /hugedomains/i },
  { name: "Bodis", re: /\bbodis\b/i },
  { name: "ParkingCrew", re: /parkingcrew/i },
  { name: "Namecheap", re: /namecheap/i },
  { name: "Dynadot", re: /dynadot/i },
  { name: "Porkbun", re: /porkbun/i },
  { name: "DropCatch", re: /dropcatch/i },
];
/** Phrases only a domain company's page uses — in the title or visible text. */
const PARKED_PHRASES =
  /\b(this domain (is|may be) for sale|buy this domain|domain (is )?parked|parked (free|domain)|this domain is managed at|make an offer on this domain|the domain \S+ is for sale)\b/i;
/** Markup only parking pages carry (their lander scripts and links) — a
 * site merely BUILT with GoDaddy or Namecheap never has these. */
const PARKING_MARKUP: Array<{ name: string; re: RegExp }> = [
  { name: "GoDaddy", re: /parking-lander|\/parking\/|parkingcrew\.net|park\.godaddy|domaincontrol\.com\/(park|lander)/i },
  { name: "Sedo", re: /sedoparking\.com/i },
  { name: "Bodis", re: /bodis\.com/i },
  { name: "ParkingCrew", re: /parkingcrew\.net/i },
  { name: "Afternic", re: /afternic\.com/i },
  { name: "Dan.com", re: /\/\/(www\.)?dan\.com\//i },
  { name: "HugeDomains", re: /hugedomains\.com/i },
];
/** A real business page has far more text than a parking page. */
const PARKED_MAX_TEXT_CHARS = 1500;

/**
 * v1.13.1: the page is a domain company's parking / "coming soon" /
 * for-sale page, not a business's site — the real Colorful Yun Nan case:
 * the Google listing's colorfulyunnanorder.com lapsed, was caught by a
 * domain dropper and now shows "NameBright - Coming Soon … This domain is
 * managed at NameBright". null for a real page.
 *
 * The domain company must show in the title, the visible text, or
 * parking-only markup — never just anywhere in the HTML (a small GoDaddy
 * Website Builder site has "godaddy" all over its markup). Then it needs a
 * parking phrase, or "coming soon" IN THE TITLE with the company in the
 * title or parking markup (a page that only says "our menu is coming
 * soon" is a real site). A parking phrase with no company needs almost no
 * text.
 */
export function detectParkedDomain(html: string): { provider: string | null } | null {
  const clean = stripNonVisibleMarkup(html);
  const title = extractTag(clean, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "";
  const text = extractVisibleText(clean);
  if (text.length > PARKED_MAX_TEXT_CHARS) return null;
  const haystack = `${title} ${text}`;
  const markupProvider = PARKING_MARKUP.find((p) => p.re.test(html.slice(0, 20000)))?.name ?? null;
  const provider = PARKING_PROVIDERS.find((p) => p.re.test(haystack))?.name ?? markupProvider;
  // "Coming soon" alone isn't enough: the company must be in the title
  // ("NameBright - Coming Soon") or the parking markup — a site's own
  // "Powered by GoDaddy" footer doesn't count.
  const titleProvider = PARKING_PROVIDERS.find((p) => p.re.test(title))?.name ?? markupProvider;
  const phrase = PARKED_PHRASES.test(haystack) || (/\bcoming soon\b/i.test(title) && !!titleProvider);
  if (!phrase) return null;
  if (!provider && text.length > 400) return null;
  return { provider };
}

/** Phones are at most this wide (CSS px) — anything fixed wider overflows. */
const PHONE_MAX_WIDTH_PX = 480;
/** Google's own legibility line: text under 12px is too small on a phone. */
const MIN_READABLE_FONT_PX = 12;

/** A CSS length in px (px, pt, rem/em and % of a 16px default), or null. */
function cssPx(value: string): number | null {
  const m = value.trim().match(/^(\d*\.?\d+)\s*(px|pt|rem|em|%)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "px").toLowerCase();
  return unit === "px" ? n : unit === "pt" ? (n * 4) / 3 : unit === "%" ? (n / 100) * 16 : n * 16;
}

/** Inline <style> text with every @media/@supports block removed (a rule
 * inside "@media (min-width: 1200px)" never applies on a phone). */
function topLevelCss(html: string): string {
  const css = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), (m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  for (let i = 0; i < css.length; ) {
    if (css[i] === "@" && /^@(media|supports|container|document)\b/i.test(css.slice(i, i + 12))) {
      const open = css.indexOf("{", i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      for (; j < css.length && depth > 0; j++) depth += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0;
      i = j;
      continue;
    }
    out += css[i++];
  }
  return out;
}

/** Declarations of every top-level rule whose selector list names `html` or `body` itself. */
function rootDeclarations(css: string): string[] {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .filter((m) => m[1].split(",").some((sel) => /^(?:html|body|:root)$/i.test(sel.trim())))
    .map((m) => m[2]);
}

function declaredPx(declarations: string, property: "font-size" | "width" | "min-width"): number | null {
  const re = new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;!]+)`, "gi");
  let last: number | null = null;
  for (const m of Array.from(declarations.matchAll(re))) last = cssPx(m[1]) ?? last;
  return last;
}

/**
 * v1.13.0: "Text readable without zooming" and "Nothing wider than the
 * screen" from the page's OWN code — the HTML and inline CSS we already
 * fetched (no extra request; external stylesheets aren't read). Google
 * PageSpeed's own audits win when it still reports them.
 *   - textReadable: the base font size set on html/body (inline CSS or a
 *     style attribute) is 12px or more; null when the page doesn't set one
 *     where we can see it.
 *   - fitsScreen: false when the viewport is a fixed width, or an element's
 *     own style (or html/body, or a table's width attribute) is fixed wider
 *     than a phone (480px); true when none is and the page has a
 *     device-width viewport; null without one (the viewport item covers it).
 */
export function detectPhoneLayout(html: string): { textReadable: boolean | null; fitsScreen: boolean | null; baseFontPx: number | null; wideElement: string | null } {
  const clean = stripNonVisibleMarkup(html);
  const rootRules = rootDeclarations(topLevelCss(html));
  const rootStyles = Array.from(clean.matchAll(/<(?:html|body)\b[^>]*>/gi), (m) => attributeValue(` ${m[0].slice(1)}`, "style") ?? "");
  let baseFontPx: number | null = null;
  for (const d of [...rootRules, ...rootStyles]) baseFontPx = declaredPx(d, "font-size") ?? baseFontPx;

  const viewport = metaContent(clean, "viewport") ?? "";
  const fixedViewport = viewport.match(/width\s*=\s*(\d+)/i);
  let wideElement: string | null = fixedViewport && Number(fixedViewport[1]) > PHONE_MAX_WIDTH_PX ? `<meta name="viewport" content="${viewport}">` : null;
  if (!wideElement) {
    for (const d of rootRules) {
      const w = Math.max(declaredPx(d, "width") ?? 0, declaredPx(d, "min-width") ?? 0);
      if (w > PHONE_MAX_WIDTH_PX && !/(?:^|[;\s])width\s*:\s*\d*\.?\d+\s*%/i.test(d)) {
        wideElement = `html/body { ${d.trim().slice(0, 80)} }`;
        break;
      }
    }
  }
  if (!wideElement) {
    for (const m of Array.from(clean.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/gi))) {
      const tag = m[0];
      const style = attributeValue(` ${tag.slice(1)}`, "style");
      if (style && !/display\s*:\s*none/i.test(style)) {
        const w = Math.max(declaredPx(style, "width") ?? 0, declaredPx(style, "min-width") ?? 0);
        if (w > PHONE_MAX_WIDTH_PX) {
          wideElement = tag.slice(0, 120);
          break;
        }
      }
      if (m[1].toLowerCase() === "table") {
        const width = attributeValue(` ${tag.slice(1)}`, "width");
        if (width && /^\d+$/.test(width.trim()) && Number(width) > PHONE_MAX_WIDTH_PX) {
          wideElement = tag.slice(0, 120);
          break;
        }
      }
    }
  }
  const deviceWidth = /width\s*=\s*device-width/i.test(viewport);
  return {
    textReadable: baseFontPx === null ? null : baseFontPx >= MIN_READABLE_FONT_PX,
    fitsScreen: wideElement ? false : deviceWidth ? true : null,
    baseFontPx,
    wideElement,
  };
}

/** US phone numbers as written on pages: 302.368.1646, (302) 368-1646,
 * 302-368-1646, 302 368 1646, +1 302 368 1646. Area and exchange codes
 * never start with 0 or 1; never part of a longer run of digits. */
const PHONE_TEXT_RE = /(?<![\d.\-])(?:\+?1[\s.\-]?)?(?:\(\s*[2-9]\d{2}\s*\)|[2-9]\d{2})[\s.\-]?[2-9]\d{2}[\s.\-]\d{4}(?![\d\-])/;

/** v1.13.0: a phone number shown on the page as text (headers, footers,
 * anywhere visible), as written — or null. */
export function findPhoneText(visibleText: string): string | null {
  return visibleText.match(PHONE_TEXT_RE)?.[0].trim() ?? null;
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
  // v1.13.0: a number shown as text (the real National 5 & 10 footer:
  // "Call us: 302.368.1646", no tel: link).
  const phoneText = findPhoneText(visibleText);
  const contactEvidence: ContactEvidence = { ...evidence, ctaPhrase, phoneText };
  const socialProfiles = detectSocialProfiles(clean);
  const brokenSocialLinks = detectBrokenSocialLinks(clean, baseUrl);
  // Read from the RAW html — inline <style> blocks are stripped from `clean`.
  const phoneLayout = detectPhoneLayout(html);
  const parkedDomain = detectParkedDomain(html);

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
    hasPhoneText: phoneText !== null,
    socialProfiles,
    brokenSocialLinks,
    phoneLayout,
    ...(parkedDomain ? { parkedDomain } : {}),
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
