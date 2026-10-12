import { describe, expect, test, vi } from "vitest";
import {
  BROWSER_RENDER_USER_AGENT,
  browserRenderMonthlyCap,
  browserRendersThisMonth,
  createRenderingFetch,
  renderPageHtml,
  rendersAllowedThisScan,
} from "./browserRender";
import { collectWebsiteAnalysis } from "./websiteAnalysis";
import type { WebsiteAnalysis } from "./scoring";

const RENDERED = `<html><head><meta name=viewport content=width=device-width><title>Goldberg Hardware</title></head><body>
<h1>Goldberg Hardware</h1><h2>Tools</h2><p>Your neighborhood hardware store since 1952, open every day.</p>
<a href="/contact">Contact us</a> <a href="tel:+19145550100">Call</a>
<a href="https://www.instagram.com/goldberghardware/">Instagram</a>
</body></html>`;
const SHELL = `<html><head><title>Loading</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`;

function htmlRes(html: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => html,
    json: async () => ({}),
    arrayBuffer: async () => new TextEncoder().encode(html).buffer,
  } as unknown as Response;
}

describe("renderPageHtml", () => {
  test("identifies honestly as PostScore — no disguised user agent", async () => {
    const bodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return htmlRes(RENDERED);
    });
    const out = await renderPageHtml("https://goldberg.example/", "key", fetchImpl as unknown as typeof fetch);
    expect(out.kind).toBe("ok");
    expect(BROWSER_RENDER_USER_AGENT).toBe("PostScoreBot/1.0 (+https://postscore.co)");
    expect(JSON.parse(bodies[0]).userAgent).toEqual({ userAgent: "PostScoreBot/1.0 (+https://postscore.co)" });
    expect(bodies[0]).not.toMatch(/stealth|Mozilla/i);
  });
  test("a rendered challenge page is 'blocked'; an error is 'failed' (never throws)", async () => {
    expect((await renderPageHtml("https://x.example/", "k", vi.fn(async () => htmlRes("<p>Just a moment...</p>")) as unknown as typeof fetch)).kind).toBe("blocked");
    expect((await renderPageHtml("https://x.example/", "k", vi.fn(async () => htmlRes("", 500)) as unknown as typeof fetch)).kind).toBe("failed");
    expect((await renderPageHtml("https://x.example/", "k", vi.fn(async () => { throw new Error("network"); }) as unknown as typeof fetch)).kind).toBe("failed");
  });
});

describe("createRenderingFetch", () => {
  test("renders only the business's own HTML pages, up to the cap; everything else passes through", async () => {
    const calls: string[] = [];
    const base = vi.fn(async (url: string) => {
      calls.push(url);
      return url.includes("browserless") ? htmlRes(RENDERED) : htmlRes("static");
    });
    const rf = createRenderingFetch({ siteUrl: "https://goldberg.example", apiKey: "k", maxRenders: 1, baseFetch: base as unknown as typeof fetch });
    await rf.fetch("https://www.goldberg.example/");
    await rf.fetch("https://goldberg.example/sitemap.xml");
    await rf.fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    await rf.fetch("https://goldberg.example/about");
    expect(rf.renderCount()).toBe(1);
    expect(calls.filter((u) => u.includes("browserless"))).toHaveLength(1);
    expect(calls).toContain("https://goldberg.example/sitemap.xml");
    expect(calls).toContain("https://goldberg.example/about");
  });
});

describe("monthly render cap", () => {
  test("defaults to 50, configurable; counts this month's renders; 0 allowed when hit", () => {
    expect(browserRenderMonthlyCap({})).toBe(50);
    expect(browserRenderMonthlyCap({ BROWSER_RENDER_MONTHLY_CAP: "10" })).toBe(10);
    const now = new Date("2026-10-15T00:00:00Z");
    const a = (month: string, renders: number) => ({ browserRenderLog: { month, renders } }) as unknown as WebsiteAnalysis;
    expect(browserRendersThisMonth([a("2026-10", 4), a("2026-09", 4), a("2026-10", 3), null], now)).toBe(7);
    expect(rendersAllowedThisScan(48, 50)).toBe(2);
    expect(rendersAllowedThisScan(50, 50)).toBe(0);
    expect(rendersAllowedThisScan(Number.POSITIVE_INFINITY, 50)).toBe(0);
  });
});

describe("collectWebsiteAnalysis with Browserless (Step 2g)", () => {
  const route = (renderBody: string) =>
    vi.fn(async (url: string) => {
      if (url.includes("browserless")) return htmlRes(renderBody);
      if (url.includes("googleapis")) return htmlRes("{}", 400);
      return htmlRes(SHELL);
    });
  const run = (fetchImpl: ReturnType<typeof route>, key: string | undefined, maxBrowserRenders: number) =>
    collectWebsiteAnalysis(
      "https://goldberg.example",
      { pageSpeedApiKey: undefined, screenshotApiKey: undefined, browserlessApiKey: key },
      { captureScreenshots: false, maxBrowserRenders },
      { phone: null, address: null, openingHoursPeriods: null },
      fetchImpl as unknown as typeof fetch
    );

  test("a JavaScript-only homepage is read as a browser shows it", async () => {
    const out = await run(route(RENDERED), "key", 4);
    expect(out.content?.isLikelyClientRenderedShell).toBe(false);
    expect(out.content?.hasPhoneLink).toBe(true);
    expect(out.content?.hasCtaText).toBe(true);
    expect(out.content?.socialProfiles).toEqual([{ platform: "Instagram", url: "instagram.com/goldberghardware" }]);
    expect(out.readViaBrowserChecks).toContain("website.contact_conversion");
    expect(out.browserRenders).toBeGreaterThan(0);
    expect(out.browserRenders).toBeLessThanOrEqual(4);
  });
  test("no key -> exactly as before (no render, still JavaScript-only)", async () => {
    const fetchImpl = route(RENDERED);
    const out = await run(fetchImpl, undefined, 4);
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("browserless"))).toBe(false);
    expect(out.content?.isLikelyClientRenderedShell).toBe(true);
    expect(out.readViaBrowserChecks).toEqual([]);
  });
  test("cap hit (0 renders allowed) -> no render", async () => {
    const fetchImpl = route(RENDERED);
    await run(fetchImpl, "key", 0);
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("browserless"))).toBe(false);
  });
  test("a rendered challenge page keeps 'couldn't check'", async () => {
    const out = await run(route("<html><body>Checking your browser before accessing</body></html>"), "key", 4);
    expect(out.content?.isLikelyClientRenderedShell).toBe(true);
    expect(out.readViaBrowserChecks).toEqual([]);
  });
  test("never renders a bot-blocked site", async () => {
    const fetchImpl = vi.fn(async (url: string) => (url.includes("browserless") ? htmlRes(RENDERED) : htmlRes("Forbidden", 403)));
    await run(fetchImpl as unknown as ReturnType<typeof route>, "key", 4);
    expect(fetchImpl.mock.calls.some(([u]) => String(u).includes("browserless"))).toBe(false);
  });
});
