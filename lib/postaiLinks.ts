// PostAI "hotlinks": the model never writes a URL. When it recommends a
// fix it adds a marker like [[link:website.performance_mobile]]; the app
// turns each marker into a link from this FIXED allowlist and the current
// business id. An unknown marker is dropped (never a broken link), and
// any raw URL the model writes is stripped unless it is exactly one of
// these routes for the current business. Pure — shared by the chat
// renderer and its tests.

import type { MessageKey } from "@/lib/i18n";

/** Stable anchor id for a check row ("website.performance_mobile" →
 * "check-performance_mobile"). Every check's suffix is unique, so one
 * id works on whichever page shows the row (Website page, Overview,
 * Reviews). */
export function checkAnchorId(checkId: string): string {
  return `check-${checkId.slice(checkId.indexOf(".") + 1)}`;
}

export interface LinkTarget {
  /** Path after /business/{id} — "" is the Overview. May include ?query. */
  path: string;
  anchor?: string;
  label: MessageKey;
}

const WEBSITE_CHECKS = [
  "has_website",
  "https",
  "performance_mobile",
  "content_depth",
  "contact_conversion",
  "about_presence",
  "services_presence",
  "social_links",
  "security",
  "info_consistency",
  "notice_freshness",
  "site_freshness",
] as const;

const LISTING_CHECKS = ["photos", "hours", "phone", "address", "categories", "website_link", "business_status"] as const;
const REVIEW_CHECKS = ["rating", "review_count", "review_recency"] as const;

export const POSTAI_LINK_TARGETS: Record<string, LinkTarget> = {
  overview: { path: "", label: "dashboard.assistant.link.overview" },
  ...Object.fromEntries(
    LISTING_CHECKS.map((c) => [`listing.${c}`, { path: "", anchor: `check-${c}`, label: "dashboard.assistant.link.overview" }])
  ),
  // The Google-listing mismatch — the Website page's row shows both values.
  "listing.mismatch": { path: "/website", anchor: "check-info_consistency", label: "dashboard.assistant.link.mismatch" },
  website: { path: "/website", label: "dashboard.assistant.link.website" },
  ...Object.fromEntries(
    WEBSITE_CHECKS.map((c) => [`website.${c}`, { path: "/website", anchor: `check-${c}`, label: "dashboard.assistant.link.website" }])
  ),
  "website.starter_site": { path: "/website", anchor: "starter-site", label: "dashboard.assistant.link.starterSite" },
  reviews: { path: "/website-reviews", anchor: "get-more-reviews", label: "dashboard.assistant.link.reviews" },
  ...Object.fromEntries(
    REVIEW_CHECKS.map((c) => [`reviews.${c}`, { path: "/website-reviews", anchor: "get-more-reviews", label: "dashboard.assistant.link.reviews" }])
  ),
  "reviews.connect": { path: "/connect-gbp", label: "dashboard.assistant.link.connect" },
  growth: { path: "/growth", label: "dashboard.assistant.link.growth" },
  "growth.weekly_routine": { path: "/growth", anchor: "weekly-routine", label: "dashboard.assistant.link.weeklyRoutine" },
  "growth.coupon": { path: "/growth?tab=coupons", label: "dashboard.assistant.link.coupon" },
  "growth.referral": { path: "/growth?tab=referral", label: "dashboard.assistant.link.referral" },
  competitors: { path: "/competitors", label: "dashboard.assistant.link.competitors" },
  pricing: { path: "/pricing", label: "dashboard.assistant.link.pricing" },
  reports: { path: "/reports", label: "dashboard.assistant.link.reports" },
  settings: { path: "/settings", label: "dashboard.assistant.link.settings" },
};

/** The link a target id resolves to for this business, or null when the
 * id isn't on the allowlist or isn't available for this business (the
 * referral tab, when referrals aren't offered for its type). */
export function resolveLinkTarget(
  id: string,
  businessId: string,
  options: { referralOk?: boolean } = {}
): { href: string; label: MessageKey } | null {
  if (!Object.prototype.hasOwnProperty.call(POSTAI_LINK_TARGETS, id)) return null;
  if (id === "growth.referral" && options.referralOk === false) return null;
  if (!/^[A-Za-z0-9-]+$/.test(businessId)) return null;
  const target = POSTAI_LINK_TARGETS[id];
  return { href: `/business/${businessId}${target.path}${target.anchor ? `#${target.anchor}` : ""}`, label: target.label };
}

export type ReplySegment = { kind: "text"; text: string } | { kind: "link"; id: string; href: string; label: MessageKey };

// Any [[link:…]] is consumed; only an allowlisted id becomes a link.
const MARKER = /\[\[\s*link\s*:([^\]]*)\]\]/gi;
// http(s)/www URLs and bare paths into the app; markdown links handled first.
const MARKDOWN_LINK = /\[([^\]]+)\]\((?:[^)\s]+)\)/g;
// No lookbehind (older iOS Safari can't parse it): the leading group keeps
// whatever came before a bare /business/ path.
const RAW_URL = /(^|[^\w/])((?:https?:\/\/|www\.)[^\s)<>\]]+|\/business\/[^\s)<>\]]+)/gi;

/** The allowlist id for a raw in-app URL that is exactly one of this
 * business's targets, else null. */
function idForRawUrl(url: string, businessId: string, options: { referralOk?: boolean }): string | null {
  const path = url.replace(/^https?:\/\/[^/]+/i, "").replace(/[.,;:!?]+$/, "");
  for (const id of Object.keys(POSTAI_LINK_TARGETS)) {
    if (resolveLinkTarget(id, businessId, options)?.href === path) return id;
  }
  return null;
}

/**
 * Splits one paragraph into text and allowlisted links. Markers become
 * links (at most one per target per paragraph); unknown markers vanish;
 * raw URLs are removed unless they're exactly an allowlisted route for
 * this business (then they become that link). Whitespace left behind is
 * tidied.
 */
export function parseReplyLinks(
  text: string,
  businessId: string,
  options: { referralOk?: boolean } = {}
): ReplySegment[] {
  // Markdown links: keep the words, judge the URL like any raw URL.
  let working = text.replace(MARKDOWN_LINK, (_m, words: string) => words);
  working = working.replace(RAW_URL, (_m, before: string, url: string) => {
    const id = idForRawUrl(url, businessId, options);
    return before + (id ? `[[link:${id}]]` : "");
  });

  const segments: ReplySegment[] = [];
  const seen = new Set<string>();
  let last = 0;
  let match: RegExpExecArray | null;
  MARKER.lastIndex = 0;
  while ((match = MARKER.exec(working)) !== null) {
    if (match.index > last) segments.push({ kind: "text", text: working.slice(last, match.index) });
    last = match.index + match[0].length;
    const id = match[1].trim().toLowerCase();
    const resolved = resolveLinkTarget(id, businessId, options);
    if (resolved && !seen.has(id)) {
      seen.add(id);
      segments.push({ kind: "link", id, ...resolved });
    }
  }
  if (last < working.length) segments.push({ kind: "text", text: working.slice(last) });

  return segments
    .map((s) => (s.kind === "text" ? { ...s, text: s.text.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1") } : s))
    .filter((s) => s.kind === "link" || s.text.trim().length > 0);
}
