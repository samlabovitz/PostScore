// Display helpers for the site-security (possible hack) finding — the
// short one-line summary used everywhere, and the full detail shown only
// on the Website page. Built ONLY from what detectSpamSignals
// (lib/websiteTrust.ts) actually stored: the matched phrase, its topic,
// whether the block was hidden, the off-topic links, and a 300-char
// snippet. Only the homepage is ever checked, so nothing here may imply
// the rest of the site is clean. Always "may be hacked" / "signs of" —
// never "is hacked".

import { DEFAULT_LOCALE, formatShortDate, t, type Locale, type MessageKey } from "@/lib/i18n";
import type { BusinessScoringInput, CheckResult, ScoreBreakdown, WebsiteAnalysis } from "@/lib/scoring";
import type { SpamCategory, SpamFinding } from "@/lib/websiteTrust";

const SPAM_TOPIC_KEYS: Record<SpamCategory, MessageKey> = {
  replica: "content.spamTopic.replica",
  casino: "content.spamTopic.casino",
  pharma: "content.spamTopic.pharma",
  payday_loan: "content.spamTopic.payday_loan",
  essay_writing: "content.spamTopic.essay_writing",
  crypto: "content.spamTopic.crypto",
};

/** The real topic of a finding (from its stored category), localized. */
export function spamTopic(category: SpamCategory, locale: Locale = DEFAULT_LOCALE): string {
  return t(locale, SPAM_TOPIC_KEYS[category]);
}

/**
 * The stored snippet trimmed to the whole sentence(s) around the matched
 * phrase: from the start of the sentence containing it to the end of
 * that sentence. Injected spam often has little punctuation, so the
 * result can run to the end of the stored snippet (keeping its "…").
 * Falls back to the stored snippet unchanged when the phrase isn't in it.
 */
export function trimSpamSnippet(snippet: string, matchedPhrase: string): string {
  const idx = snippet.toLowerCase().indexOf(matchedPhrase.toLowerCase());
  if (idx === -1) return snippet;
  const phraseEnd = idx + matchedPhrase.length;

  let start = 0;
  const terminatorRe = /[.!?]+\s+/g;
  let m: RegExpExecArray | null;
  while ((m = terminatorRe.exec(snippet)) !== null && m.index + m[0].length <= idx) {
    start = m.index + m[0].length;
  }
  const endMatch = /[.!?]+(?=\s|$)/.exec(snippet.slice(phraseEnd));
  const end = endMatch ? phraseEnd + endMatch.index + endMatch[0].length : snippet.length;
  return snippet.slice(start, end).trim();
}

/** The off-topic links as a plain, de-duplicated list of domains (never
 * full URLs, never clickable — nobody should visit them). */
export function spamDomains(links: string[]): string[] {
  const domains: string[] = [];
  for (const link of links) {
    try {
      const host = new URL(link, "https://example.com/").hostname.replace(/^www\./i, "").toLowerCase();
      if (host && host !== "example.com" && !domains.includes(host)) domains.push(host);
    } catch {
      continue;
    }
  }
  return domains;
}

/** The stored spam findings behind the urgent banner — non-empty only
 * when the Site security check was actually scored (a real analyzed
 * site) AND real spam was found. */
export function hackSignsFor(securityCheck: CheckResult | undefined, websiteAnalysis: WebsiteAnalysis | null): SpamFinding[] {
  if (!securityCheck || securityCheck.earnedPoints === null) return [];
  return websiteAnalysis?.websiteTrust?.spamSignals ?? [];
}

export const SITE_SECURITY_STEP_KEYS: readonly MessageKey[] = [
  "dashboard.website.security.step1",
  "dashboard.website.security.step2",
  "dashboard.website.security.step3",
  "dashboard.website.security.step4",
  "dashboard.website.security.step5",
];

/** The plain-text summary the "Copy details for your web person" button
 * copies — every line is a real stored fact or one of the 5 steps. */
export function siteSecurityCopyText(params: {
  businessName: string | null;
  siteUrl: string | null;
  finding: SpamFinding;
  scannedAt: string | null;
  locale: Locale;
  /** The business's own time zone for the scan date (omitted = New York). */
  timeZone?: string;
}): string {
  const { businessName, siteUrl, finding, scannedAt, locale, timeZone } = params;
  const domains = spamDomains(finding.suspiciousLinks);
  const lines = [
    t(locale, "dashboard.website.security.copy.title"),
    "",
    t(locale, "dashboard.website.security.copy.business", { name: businessName ?? "—" }),
    t(locale, "dashboard.website.security.copy.site", { url: siteUrl ?? "—" }),
    t(locale, "dashboard.website.security.copy.scanDate", {
      date: scannedAt ? formatShortDate(scannedAt, locale, timeZone) : "—",
    }),
    t(locale, "dashboard.website.security.copy.scope"),
    "",
    t(locale, "dashboard.website.security.copy.topic", { topic: spamTopic(finding.category, locale) }),
    t(locale, "dashboard.website.security.copy.phrase", { phrase: finding.matchedPhrase }),
    t(locale, "dashboard.website.security.copy.hidden", {
      value: t(locale, finding.hidden ? "dashboard.website.security.copy.yes" : "dashboard.website.security.copy.no"),
    }),
    t(locale, "dashboard.website.security.copy.domains", {
      domains: domains.length > 0 ? domains.join(", ") : t(locale, "dashboard.website.security.copy.noneFound"),
    }),
    t(locale, "dashboard.website.security.copy.snippet", { snippet: trimSpamSnippet(finding.snippet, finding.matchedPhrase) }),
    "",
    t(locale, "dashboard.website.security.stepsHeading"),
    ...SITE_SECURITY_STEP_KEYS.map((key, i) => `${i + 1}. ${t(locale, key)}`),
  ];
  return lines.join("\n");
}

/** PostAI's own view of the finding — short facts only (see
 * AssistantBusinessContext.siteSecurity in lib/assistant.ts). */
export function buildAssistantSiteSecurity(
  breakdown: ScoreBreakdown,
  input: BusinessScoringInput,
  locale: Locale = DEFAULT_LOCALE
): { topic: string; matchedPhrase: string; hidden: boolean; domains: string[] } | null {
  const finding = hackSignsFor(
    breakdown.checks.find((c) => c.id === "website.security"),
    input.websiteAnalysis ?? null
  )[0];
  if (!finding) return null;
  return {
    topic: spamTopic(finding.category, locale),
    matchedPhrase: finding.matchedPhrase,
    hidden: finding.hidden,
    domains: spamDomains(finding.suspiciousLinks),
  };
}
