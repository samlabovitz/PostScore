// Step 2g: reading JavaScript-built pages the way a normal browser shows
// them, via Browserless's REST /content endpoint (free tier). Used ONLY
// for a page our static fetch already flagged as JavaScript-only, never
// for a bot-blocked site, and always identifying honestly as PostScore —
// no stealth plugins, no disguised user agent. A challenge/block page
// that comes back from a render stays "couldn't check".

import type { WebsiteAnalysis } from "@/lib/scoring";
import { looksLikeBotChallenge } from "@/lib/websiteReachability";

import { POSTSCORE_USER_AGENT } from "@/lib/userAgent";

export const BROWSER_RENDER_USER_AGENT = POSTSCORE_USER_AGENT;
export const BROWSER_RENDER_TIMEOUT_MS = 30000;
export const DEFAULT_BROWSER_RENDER_MONTHLY_CAP = 50;
/** Homepage + About + Services + Contact — the most one scan can render. */
export const MAX_BROWSER_RENDERS_PER_SCAN = 4;
const BROWSERLESS_CONTENT_URL = "https://production-sfo.browserless.io/content";

export function browserRenderMonthlyCap(env: Record<string, string | undefined> = process.env): number {
  const raw = Number.parseInt(env.BROWSER_RENDER_MONTHLY_CAP ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_BROWSER_RENDER_MONTHLY_CAP;
}

export function currentRenderMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Real renders recorded this calendar month (UTC), across all businesses. */
export function browserRendersThisMonth(analyses: Array<WebsiteAnalysis | null>, now: Date = new Date()): number {
  const month = currentRenderMonth(now);
  return analyses.reduce((sum, a) => sum + (a?.browserRenderLog?.month === month ? a.browserRenderLog.renders : 0), 0);
}

/** How many renders one scan may use right now — 0 when the cap is hit. */
export function rendersAllowedThisScan(rendersThisMonth: number, cap: number): number {
  return Math.max(0, Math.min(MAX_BROWSER_RENDERS_PER_SCAN, cap - rendersThisMonth));
}

export type RenderOutcome =
  | { kind: "ok"; html: string }
  | { kind: "blocked"; html: string }
  | { kind: "failed" };

/** One render. Never throws; 30s timeout; failures are just "failed". */
export async function renderPageHtml(url: string, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<RenderOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BROWSER_RENDER_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BROWSERLESS_CONTENT_URL}?token=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        // Browserless's REST API takes the user agent as an object.
        userAgent: { userAgent: BROWSER_RENDER_USER_AGENT },
        gotoOptions: { waitUntil: "networkidle2", timeout: BROWSER_RENDER_TIMEOUT_MS - 5000 },
        bestAttempt: true,
        rejectResourceTypes: ["image", "media", "font"],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { kind: "failed" };
    const html = await res.text();
    if (!html || html.trim().length === 0) return { kind: "failed" };
    if (looksLikeBotChallenge(html)) return { kind: "blocked", html };
    return { kind: "ok", html };
  } catch {
    return { kind: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

const NON_HTML_PATH_RE = /\.(xml|txt|json|pdf|jpe?g|png|gif|webp|svg|ico|css|js|mp4|zip)$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A fetch that renders the business's OWN HTML pages through Browserless
 * (up to `maxRenders`), and passes everything else — other hosts
 * (PageSpeed, Safe Browsing, …), sitemaps, assets, or anything past the
 * cap — straight to `baseFetch`. A rendered challenge page comes back as
 * a 403 so the caller classifies it as blocked ("couldn't check").
 */
export function createRenderingFetch(params: { siteUrl: string; apiKey: string; maxRenders: number; baseFetch?: typeof fetch }) {
  const baseFetch = params.baseFetch ?? fetch;
  const siteHost = hostOf(/^https?:\/\//i.test(params.siteUrl) ? params.siteUrl : `https://${params.siteUrl}`);
  let renders = 0;
  const renderingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    let path = "";
    try {
      path = new URL(url).pathname;
    } catch {
      return baseFetch(input, init);
    }
    const isOwnHtmlPage = method === "GET" && siteHost !== null && hostOf(url) === siteHost && !NON_HTML_PATH_RE.test(path);
    if (!isOwnHtmlPage || renders >= params.maxRenders) return baseFetch(input, init);
    renders++;
    const outcome = await renderPageHtml(url, params.apiKey, baseFetch);
    if (outcome.kind === "failed") return baseFetch(input, init);
    return new Response(outcome.html, {
      status: outcome.kind === "ok" ? 200 : 403,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }) as typeof fetch;
  return { fetch: renderingFetch, renderCount: () => renders };
}
