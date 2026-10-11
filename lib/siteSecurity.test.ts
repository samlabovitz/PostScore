import { describe, expect, test } from "vitest";
import { hackSignsFor, siteSecurityCopyText, spamDomains, spamTopic, trimSpamSnippet } from "./siteSecurity";
import type { CheckResult, WebsiteAnalysis } from "./scoring";
import type { SpamFinding } from "./websiteTrust";
import { messages } from "./i18n/messages";

// The real stored Bánh Mì Boy finding (Oct 11 scan).
const BANH_MI_FINDING: SpamFinding = {
  category: "replica",
  matchedPhrase: "replica richard mille",
  hidden: true,
  snippet:
    "at a perfectly controlled temperature. Then, reliability and timeless style. Since Montblanc s new one is called Ultra Slim, to show it. Well, no reassurance for their status in life is needed. watchesreplicas replica richard mille Rarely is so much effort put on perfecting that which already accept…",
  suspiciousLinks: [
    "https://www.watches.ink/",
    "https://www.watchesreplica.is/product-category/richard-mille/",
    "https://www.iwcreplica.co/",
    "https://www.bellswigs.com/",
  ],
};

describe("trimSpamSnippet", () => {
  test("the real Bánh Mì Boy snippet starts at the sentence holding the matched phrase", () => {
    expect(trimSpamSnippet(BANH_MI_FINDING.snippet, "replica richard mille")).toBe(
      "watchesreplicas replica richard mille Rarely is so much effort put on perfecting that which already accept…"
    );
  });
  test("ends at the end of that sentence when there is one", () => {
    expect(trimSpamSnippet("Welcome. Buy cheap viagra here now. Our menu", "cheap viagra")).toBe("Buy cheap viagra here now.");
  });
  test("falls back to the stored snippet when the phrase isn't in it", () => {
    expect(trimSpamSnippet("nothing here", "replica rolex")).toBe("nothing here");
  });
});

describe("spamDomains", () => {
  test("plain, de-duplicated domains — never full URLs", () => {
    expect(spamDomains([...BANH_MI_FINDING.suspiciousLinks, "https://watches.ink/other"])).toEqual([
      "watches.ink",
      "watchesreplica.is",
      "iwcreplica.co",
      "bellswigs.com",
    ]);
  });
});

describe("hackSignsFor", () => {
  const check = (earnedPoints: number | null): CheckResult => ({
    id: "website.security",
    label: "Site security",
    category: "website",
    maxPoints: 2,
    earnedPoints,
    confidence: earnedPoints === null ? "NOT_FOUND" : "VERIFIED",
    explanation: "",
    meta: null,
  });
  const analysis = { websiteTrust: { spamSignals: [BANH_MI_FINDING] } } as unknown as WebsiteAnalysis;
  test("only real stored spam on a scored check", () => {
    expect(hackSignsFor(check(0), analysis)).toEqual([BANH_MI_FINDING]);
    expect(hackSignsFor(check(null), analysis)).toEqual([]);
    expect(hackSignsFor(undefined, analysis)).toEqual([]);
    expect(hackSignsFor(check(2), { websiteTrust: { spamSignals: [] } } as unknown as WebsiteAnalysis)).toEqual([]);
  });
});

describe("siteSecurityCopyText", () => {
  const params = {
    businessName: "Bánh Mì Boy",
    siteUrl: "https://banhmiboy.com",
    finding: BANH_MI_FINDING,
    scannedAt: "2026-10-11T19:46:45.321Z",
  };
  test("EN: every real fact plus the 5 numbered steps", () => {
    const text = siteSecurityCopyText({ ...params, locale: "en" });
    expect(text).toContain("Possible website hack — details from PostScore");
    expect(text).toContain("Business: Bánh Mì Boy");
    expect(text).toContain("Website: https://banhmiboy.com");
    expect(text).toContain("Scan date: Oct 11, 2026");
    expect(text).toContain("Checked: homepage only; other pages weren't checked.");
    expect(text).toContain("Spam topic: replica watches");
    expect(text).toContain('Matched phrase: "replica richard mille"');
    expect(text).toContain("Hidden from visitors: yes");
    expect(text).toContain("Unrelated sites it links to: watches.ink, watchesreplica.is, iwcreplica.co, bellswigs.com");
    expect(text).toContain('Text found: "watchesreplicas replica richard mille');
    for (let i = 1; i <= 5; i++) expect(text).toContain(`\n${i}. `);
    expect(text).toContain("5. Once it's clean, your next PostScore scan will check it again.");
  });
  test("ES: formal usted copy", () => {
    const text = siteSecurityCopyText({ ...params, locale: "es" });
    expect(text).toContain("Tema del spam: relojes de imitación");
    expect(text).toContain("Oculto para los visitantes: sí");
    expect(text).toContain("1. Comuníquese con su proveedor de alojamiento");
  });
});

describe("honest wording", () => {
  test("no site-security or banner string ever says the site IS hacked", () => {
    for (const locale of ["en", "es"] as const) {
      const dict = messages[locale] as Record<string, string>;
      for (const [key, value] of Object.entries(dict)) {
        if (!/hackedBanner|website\.security|spamTopic/.test(key)) continue;
        expect(value, key).not.toMatch(/\bis hacked\b|\bwas hacked\b|\bestá hackeado\b|\bfue hackeado\b/i);
      }
    }
  });
  test("topics come from the stored category", () => {
    expect(spamTopic("replica", "en")).toBe("replica watches");
    expect(spamTopic("casino", "es")).toBe("casino en línea");
  });
});
