import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/websiteRecheck", () => ({ recheckWebsite: vi.fn() }));

import { LocaleProvider } from "@/lib/i18n";
import { WebsiteFixGuide } from "./WebsiteFixGuide";
import { RecheckSummary, WebsiteRecheck, changeLine } from "./WebsiteRecheck";
import type { WebsiteFix } from "@/lib/websiteFixes";

const wrap = (node: React.ReactNode, locale: "en" | "es" = "en") =>
  renderToStaticMarkup(
    <LocaleProvider locale={locale} timeZone="America/New_York">
      {node}
    </LocaleProvider>
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");
const fix = (checkId: string, gap: string | null = null, kind: WebsiteFix["kind"] = "guided"): WebsiteFix => ({ checkId, gap, kind, minutes: kind === "guided" ? { min: 5, max: 10 } : null });

describe("How to fix this in {builder}", () => {
  test("Wix: collapsed by default, numbered steps, the official article and its verified date", () => {
    const html = wrap(<WebsiteFixGuide fixes={[fix("website.content_depth", "meta")]} builder="wix" siteUrl="https://example.com" />);
    expect(html).toMatch(/^<details [^>]*data-testid="fix-guide"/);
    expect(html).not.toMatch(/<details[^>]* open/);
    const t = text(html);
    expect(t).toContain("How to fix this in Wix");
    expect(t).toContain("Click the More Actions (…) icon next to the page, then SEO basics.");
    expect(html).toContain('href="https://support.wix.com/en/article/adding-seo-title-tags-and-meta-descriptions-to-your-pages"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(t).toContain("Official help article");
    expect(t).toContain("Last verified Oct 19, 2026");
    expect(html).not.toContain("generic-guide");
  });

  test("a builder with no verified guide for this: says so, then the generic guide", () => {
    const t = text(wrap(<WebsiteFixGuide fixes={[fix("website.social_links")]} builder="shopify" siteUrl={null} />));
    expect(t).toContain("How to fix this in Shopify");
    expect(t).toContain("We don't have a Shopify guide checked against its official help for this yet");
    expect(t).toContain("Ask your web person to:");
  });

  test("unknown or custom-built site: the copyable message for a web person", () => {
    const html = wrap(<WebsiteFixGuide fixes={[fix("website.https", null, "web_person"), fix("website.contact_conversion", "contact")]} builder={null} siteUrl="https://example.com" />);
    const t = text(html);
    expect(t).toContain("How to fix this");
    expect(t).toContain("We couldn't tell which website builder your site uses");
    const message = text(html.match(/data-testid="web-person-message"[^>]*>([\s\S]*?)<\/pre>/)![1]);
    expect(message).toContain("PostScore checked our website (https://example.com)");
    expect(message).toContain("1. make the site load over HTTPS");
    expect(message).toContain("2. make our phone number a tap-to-call link (tel:)");
    expect(t).toContain("Copy message");
  });

  test("limitation stated plainly (Google Sites has no meta description setting)", () => {
    const t = text(wrap(<WebsiteFixGuide fixes={[fix("website.content_depth", "meta")]} builder="google_sites" siteUrl={null} />));
    expect(t).toContain("What Google Sites can't do:");
    expect(t).toContain("no setting for a page's search title or meta description");
  });

  test("Spanish", () => {
    const t = text(wrap(<WebsiteFixGuide fixes={[fix("website.content_depth", "meta")]} builder="wix" siteUrl={null} />, "es"));
    expect(t).toContain("Cómo arreglarlo en Wix");
    expect(t).toContain("Artículo de ayuda oficial");
    expect(t).toContain("Verificado por última vez el 19 oct 2026");
  });
});

describe("Re-check my website", () => {
  test("button with '2 of 3 left today'; disabled with none left", () => {
    const html = wrap(<WebsiteRecheck businessId="b1" initialLeft={2} hasWebsite />);
    expect(text(html)).toContain("Re-check my website");
    expect(text(html)).toContain("2 of 3 left today");
    expect(text(html)).toContain("not your Google listing");
    const none = wrap(<WebsiteRecheck businessId="b1" initialLeft={0} hasWebsite />);
    expect(none).toMatch(/<button[^>]*disabled=""/);
    expect(text(none)).toContain("All 3 website re-checks used today");
    expect(wrap(<WebsiteRecheck businessId="b1" initialLeft={3} hasWebsite={false} />)).toBe("");
    expect(text(wrap(<WebsiteRecheck businessId="b1" initialLeft={1} hasWebsite />, "es"))).toContain("Quedan 1 de 3 hoy");
  });

  const base = { status: "ok" as const, scoreBefore: 71, scoreAfter: 74, websiteBefore: 60, websiteAfter: 72, tasksConfirmed: 1, pointsConfirmed: 3, availability: { used: 1, left: 2, allowed: true } };
  test("what changed: 'Mobile-friendly: Needs work → Done, +3 pts' style lines, score before → after", () => {
    const change = { checkId: "website.content_depth", labelKey: null, label: "Mobile-friendly", from: "needs_work" as const, to: "done" as const, points: 3 };
    expect(changeLine(change, "en")).toBe("Mobile-friendly: Needs work → Done, +3 pts");
    const t = text(wrap(<RecheckSummary result={{ ...base, changes: [change] }} />));
    expect(t).toContain("What changed");
    expect(t).toContain("PostScore 71 → 74 · Website 60 → 72");
    expect(t).toContain("Fixes confirmed in your plan: 1 (+3 pts)");
  });

  test("nothing changed: said honestly, with the publishing hint", () => {
    const t = text(wrap(<RecheckSummary result={{ ...base, scoreAfter: 71, websiteAfter: 60, tasksConfirmed: 0, changes: [] }} />));
    expect(t).toContain("Nothing changed on your website since the last check.");
    expect(t).toContain("Some website builders take a few minutes to update the live site");
  });
});
