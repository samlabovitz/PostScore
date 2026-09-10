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
import { WEBSITE_CTA_PHRASES } from "./scoring";

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, " ");
}

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

/** Strips <script>/<style> blocks (their text is never visible content),
 * then all remaining tags, decodes a few common entities, and collapses
 * whitespace — a deliberately simple approximation of "what a visitor
 * actually reads on the page." */
function extractVisibleText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return decodeBasicEntities(withoutTags).replace(/\s+/g, " ").trim();
}

export function analyzeWebsiteHtml(html: string): WebsiteContentSignals {
  const clean = stripHtmlComments(html);

  const title = extractTag(clean, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const hasTitle = !!title && decodeBasicEntities(title).trim().length > 0;

  const metaDescription = extractTag(
    clean,
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i
  );
  const hasMetaDescription = !!metaDescription && metaDescription.trim().length > 0;

  const viewportContent = extractTag(
    clean,
    /<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']*)["']/i
  );
  const hasViewportTag = !!viewportContent && /width\s*=\s*device-width/i.test(viewportContent);

  const headingMatches = clean.match(/<h[1-6][\s>]/gi);
  const headingCount = headingMatches ? headingMatches.length : 0;

  const visibleText = extractVisibleText(clean);
  const visibleTextLength = visibleText.length;

  const hasPhoneLink = /href\s*=\s*["']tel:/i.test(clean);
  const hasEmailLink = /href\s*=\s*["']mailto:/i.test(clean);

  const lowerText = visibleText.toLowerCase();
  const hasCtaText = WEBSITE_CTA_PHRASES.some((phrase) => lowerText.includes(phrase));

  return {
    hasTitle,
    hasMetaDescription,
    hasViewportTag,
    headingCount,
    visibleTextLength,
    hasPhoneLink,
    hasEmailLink,
    hasCtaText,
  };
}
