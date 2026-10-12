import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import type { WebsiteTrustAnalysis } from "@/lib/scoring";
import type { SpamFinding } from "@/lib/websiteTrust";
import { SiteSecurityDetails } from "./SiteSecurityDetails";
import { HackedSiteBanner } from "@/components/scoring/HackedSiteBanner";

const FINDING: SpamFinding = {
  category: "replica",
  matchedPhrase: "replica richard mille",
  hidden: true,
  snippet: "Well, no reassurance for their status in life is needed. watchesreplicas replica richard mille Rarely is so much effort…",
  suspiciousLinks: ["https://www.watchesreplica.is/product-category/richard-mille/", "https://www.iwcreplica.co/"],
};
const TRUST = {
  spamSignals: [FINDING],
  safeBrowsingThreat: null,
  safeBrowsingChecked: false,
  checkedAt: "2026-10-11T19:46:45.321Z",
} as unknown as WebsiteTrustAnalysis;

function render(locale: "en" | "es", node: JSX.Element) {
  return renderToStaticMarkup(<LocaleProvider locale={locale}>{node}</LocaleProvider>)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

describe("SiteSecurityDetails (Website page only)", () => {
  const html = render("en", <SiteSecurityDetails finding={FINDING} trust={TRUST} siteUrl="https://banhmiboy.com" businessName="Bánh Mì Boy" />);

  test("what we found: real phrase, homepage-only scope, hidden, plain (non-clickable) domains, trimmed snippet", () => {
    expect(html).toContain('Spam phrase found: "replica richard mille"');
    expect(html).toContain("We checked your homepage (https://banhmiboy.com); other pages weren't checked.");
    expect(html).toContain("It was hidden from visitors");
    expect(html).toContain("<li>watchesreplica.is</li>");
    expect(html).toContain("<li>iwcreplica.co</li>");
    expect(html).not.toMatch(/<a\b[^>]*watchesreplica/);
    expect(html).not.toContain("product-category");
    expect(html).toContain("watchesreplicas replica richard mille Rarely is so much effort…");
    expect(html).not.toContain("no reassurance");
  });

  test("why, 5 numbered steps, label, Safe Browsing status, copy button — no fake re-check button", () => {
    expect(html).toContain("Hidden spam like this can hurt your Google ranking");
    expect(html.match(/<li>/g)!.length).toBe(2 + 5);
    expect(html).toContain("your next PostScore scan will check it again");
    expect(html).toContain("Needs a web person");
    expect(html).toContain("Google Safe Browsing: not checked yet.");
    expect(html).toContain("Copy details for your web person");
    expect(html).not.toMatch(/re-?check now|Re-check button/i);
  });

  test("ES renders the usted copy", () => {
    const es = render("es", <SiteSecurityDetails finding={FINDING} trust={TRUST} siteUrl="https://banhmiboy.com" businessName="Bánh Mì Boy" />);
    expect(es).toContain("Revisamos su página de inicio (https://banhmiboy.com); las demás páginas no se revisaron.");
    expect(es).toContain("Necesita a un técnico web");
    expect(es).toContain("Copiar los detalles para su técnico web");
  });
});

describe("HackedSiteBanner", () => {
  test("EN + ES text, linking to the Site security details", () => {
    const en = render("en", <HackedSiteBanner href="/business/biz-1/website#site-security" />);
    expect(en).toContain("Your website may be hacked — we found spam content on it.");
    expect(en).toContain("See what we found →");
    expect(en).toContain('href="/business/biz-1/website#site-security"');
    const es = render("es", <HackedSiteBanner href="#site-security" />);
    expect(es).toContain("Es posible que su sitio web haya sido hackeado — encontramos contenido spam en él.");
    expect(es).toContain("Vea lo que encontramos →");
  });
});

