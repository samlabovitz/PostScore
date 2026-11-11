// Scoring 1.15.0 "No broken links or dead pages": the links customers use
// on the homepage — order, book, contact, menu, directions and the main
// navigation (at most MAX_CHECKED_LINKS) — each opened once, plus the
// social icons (their results come from lib/socialLinkCheck.ts and
// detectBrokenSocialLinks, never fetched twice).
//
// A link FAILS when it answers 404/410/5xx; opens a "page not found",
// parked or "coming soon" page; or lands back on the business's own
// homepage instead of where it claims to go. A block (401/403/429), a
// timeout or a network error proves nothing — never a fail. Never fetches
// an internal or private address (every redirect hop is checked).

import { isPublicWebUrl, type LinkCheckResult, type LinkKind, type LinkProblem } from "@/lib/linkProblems";
export * from "@/lib/linkProblems";
import { detectParkedDomain } from "@/lib/websiteContentAnalysis";
import { extractVisibleText } from "@/lib/pagePresenceDetection";
import { looksLikePageNotFound } from "@/lib/websiteTrust";
import { orderingPlatformFor } from "@/lib/orderingPlatforms";

export const MAX_CHECKED_LINKS = 15;
export const LINK_TIMEOUT_MS = 8000;
export const LINK_CONCURRENCY = 4;
const MAX_REDIRECTS = 5;
const MAX_BODY_CHARS = 200_000;

export interface CustomerLink {
  url: string;
  label: string;
  kind: Exclude<LinkKind, "social">;
}

// ---------------------------------------------------------------------------
// Safety: never an internal or private address
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Which links: pure
// ---------------------------------------------------------------------------

const KIND_PATTERNS: Array<{ kind: CustomerLink["kind"]; re: RegExp }> = [
  { kind: "order", re: /\border(ing)?\b|ordenar|pedir|pedido|pick-?up|\bdelivery\b|a domicilio/i },
  { kind: "book", re: /\bbook(ing)?\b|reserv|appointment|schedule|\bcita\b|agendar/i },
  { kind: "contact", re: /contact|cont[aá]ct|get in touch|\bcontacto\b/i },
  { kind: "menu", re: /\bmen[uú]s?\b/i },
  { kind: "directions", re: /directions|c[oó]mo llegar|find us|ubicaci[oó]n|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com/i },
];
const PRIORITY: Record<CustomerLink["kind"], number> = { order: 0, book: 1, contact: 2, menu: 3, directions: 4, nav: 5 };
const SOCIAL_HOSTS = /(^|\.)(facebook|instagram|tiktok|twitter|x|youtube|linkedin|pinterest|threads|yelp|nextdoor)\.(com|net)$|(^|\.)(youtu\.be|fb\.me|fb\.com)$/i;

function decodeEntities(s: string): string {
  return s.replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"');
}

/** The homepage's customer-facing links, most important first, at most `max`. */
export function extractCustomerLinks(html: string, homepageUrl: string, max: number = MAX_CHECKED_LINKS): CustomerLink[] {
  let base: URL;
  try {
    base = new URL(homepageUrl);
  } catch {
    return [];
  }
  const cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  // The main navigation: <nav> blocks and the <header>.
  const navHtml = [...Array.from(cleaned.matchAll(/<nav\b[\s\S]*?<\/nav>/gi)), ...Array.from(cleaned.matchAll(/<header\b[\s\S]*?<\/header>/gi))].map((m) => m[0]).join(" ");
  const found = new Map<string, CustomerLink>();
  const consider = (block: string, inNav: boolean) => {
    for (const m of Array.from(block.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))) {
      const attrs = m[1];
      const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.trim() ?? "";
      if (!href || /^(#|mailto:|tel:|sms:|javascript:)/i.test(href)) continue;
      let u: URL;
      try {
        u = new URL(decodeEntities(href), base);
      } catch {
        continue;
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      if (SOCIAL_HOSTS.test(u.hostname.replace(/^www\./i, ""))) continue; // social icons: their own check
      u.hash = "";
      const key = u.toString();
      const sameSite = u.hostname.replace(/^www\./i, "").toLowerCase() === base.hostname.replace(/^www\./i, "").toLowerCase();
      // The homepage itself isn't a link to check.
      if (sameSite && (u.pathname === "/" || u.pathname === "" || u.pathname === base.pathname) && !u.search) continue;
      const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const aria = /\baria-label\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? /\btitle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
      const haystack = `${text} ${aria} ${u.pathname} ${u.hostname}`;
      const kind: CustomerLink["kind"] | null = orderingPlatformFor(u.toString())
        ? "order"
        : (KIND_PATTERNS.find((p) => p.re.test(haystack))?.kind ?? (inNav ? "nav" : null));
      if (!kind) continue;
      const prev = found.get(key);
      if (!prev || PRIORITY[kind] < PRIORITY[prev.kind]) found.set(key, { url: key, label: (text || aria || u.pathname).slice(0, 80), kind });
    }
  };
  consider(navHtml, true);
  consider(cleaned, false);
  return Array.from(found.values()).sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]).slice(0, max);
}

// ---------------------------------------------------------------------------
// Opening one link
// ---------------------------------------------------------------------------

type Opened = { kind: "ok"; finalUrl: string; status: number; html: string | null } | { kind: "http_error"; status: number; finalUrl: string } | { kind: "unknown" };

async function openLink(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Opened> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isPublicWebUrl(current)) return { kind: "unknown" };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PostScoreLinkCheck/1.0)", Accept: "text/html,*/*" },
      });
    } catch {
      clearTimeout(timer);
      return { kind: "unknown" };
    }
    clearTimeout(timer);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { kind: "unknown" };
      try {
        current = new URL(location, current).toString();
      } catch {
        return { kind: "unknown" };
      }
      continue;
    }
    if (res.status === 404 || res.status === 410 || res.status >= 500) return { kind: "http_error", status: res.status, finalUrl: current };
    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 999 || res.status >= 400) return { kind: "unknown" };
    const type = res.headers.get("content-type") ?? "";
    let html: string | null = null;
    if (/html/i.test(type) || type === "") {
      try {
        html = (await res.text()).slice(0, MAX_BODY_CHARS);
      } catch {
        html = null;
      }
    }
    return { kind: "ok", finalUrl: current, status: res.status, html };
  }
  return { kind: "unknown" };
}

function isHomepageOf(url: string, homepageUrl: string): boolean {
  try {
    const u = new URL(url);
    const h = new URL(homepageUrl);
    const host = (x: URL) => x.hostname.replace(/^www\./i, "").toLowerCase();
    const path = (x: URL) => x.pathname.replace(/\/+$/, "") || "/";
    return host(u) === host(h) && (path(u) === "/" || path(u) === path(h));
  } catch {
    return false;
  }
}

/** What one opened link means: a problem, or null (works, or unknown). Pure. */
export function classifyOpenedLink(link: CustomerLink, opened: Opened, homepageUrl: string): LinkProblem | null {
  const base = { kind: link.kind, label: link.label, url: link.url } as const;
  if (opened.kind === "unknown") return null;
  if (opened.kind === "http_error") return { ...base, problem: opened.status >= 500 ? "server_error" : "not_found", status: opened.status };
  // Lands on the business's own homepage although it claims to go elsewhere.
  if (isHomepageOf(opened.finalUrl, homepageUrl) && !isHomepageOf(link.url, homepageUrl)) return { ...base, problem: "loops_home" };
  if (opened.html) {
    if (detectParkedDomain(opened.html)) return { ...base, problem: "parked" };
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(opened.html)?.[1] ?? "";
    if (/\bcoming soon\b|pr[oó]ximamente/i.test(title)) return { ...base, problem: "coming_soon" };
    const text = extractVisibleText(opened.html);
    if (text.length < 3000 && looksLikePageNotFound(`${title} ${text}`)) return { ...base, problem: "page_not_found" };
  }
  return null;
}

/** Opens every customer link (at most LINK_CONCURRENCY at a time). */
export async function checkCustomerLinks(
  links: CustomerLink[],
  homepageUrl: string,
  fetchImpl: typeof fetch = fetch,
  opts: { timeoutMs?: number; concurrency?: number; now?: Date } = {}
): Promise<LinkCheckResult> {
  const queue = [...links];
  const problems: LinkProblem[] = [];
  let requests = 0;
  async function worker() {
    while (queue.length > 0) {
      const link = queue.shift()!;
      requests++;
      const opened = await openLink(link.url, fetchImpl, opts.timeoutMs ?? LINK_TIMEOUT_MS);
      const problem = classifyOpenedLink(link, opened, homepageUrl);
      if (problem) problems.push(problem);
    }
  }
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? LINK_CONCURRENCY, links.length) }, worker));
  const order = new Map(links.map((l, i) => [l.url, i]));
  problems.sort((a, b) => (order.get(a.url) ?? 0) - (order.get(b.url) ?? 0));
  return { checkedAt: (opts.now ?? new Date()).toISOString(), checked: requests, problems };
}

/** The homepage's links, opened: extract and check in one go. */
export async function checkHomepageLinks(html: string, homepageUrl: string, fetchImpl: typeof fetch = fetch, now: Date = new Date()): Promise<LinkCheckResult> {
  return checkCustomerLinks(extractCustomerLinks(html, homepageUrl), homepageUrl, fetchImpl, { now });
}
