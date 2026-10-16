"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Pill } from "@/components/ui/Pill";
import { t, useLocale, useTimeZone } from "@/lib/i18n";
import {
  SITE_SECURITY_STEP_KEYS,
  siteSecurityCopyText,
  spamDomains,
  trimSpamSnippet,
} from "@/lib/siteSecurity";
import type { WebsiteTrustAnalysis } from "@/lib/scoring";
import type { SpamFinding } from "@/lib/websiteTrust";

/**
 * The full Site security explanation — Website page only (the Overview
 * and everywhere else show just the one-line summary). Every fact here
 * is something detectSpamSignals actually stored: the matched phrase,
 * whether it was hidden, the off-topic domains (plain text, never
 * links), and the stored snippet trimmed to whole sentences around the
 * match. Only the homepage is ever checked, and this says so.
 */
export function SiteSecurityDetails({
  finding,
  trust,
  siteUrl,
  businessName,
}: {
  finding: SpamFinding;
  trust: WebsiteTrustAnalysis;
  siteUrl: string | null;
  businessName: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "fallback">("idle");
  const domains = spamDomains(finding.suspiciousLinks);
  const copyText = siteSecurityCopyText({ businessName, siteUrl, finding, scannedAt: trust.checkedAt, locale, timeZone });

  async function handleCopy() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(copyText);
      setCopyState("copied");
    } catch {
      setCopyState("fallback");
    }
  }

  const safeBrowsingKey = !trust.safeBrowsingChecked
    ? "dashboard.website.security.safeBrowsingNotChecked"
    : trust.safeBrowsingThreat?.threatFound
      ? "dashboard.website.security.safeBrowsingFlagged"
      : "dashboard.website.security.safeBrowsingClean";

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-lg bg-paper p-3.5 text-[13px] text-ink-soft">
      <div>
        <Pill variant="red" className="!px-2 !py-0.5 text-[10.5px]">
          {t(locale, "dashboard.website.security.needsWebPerson")}
        </Pill>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="font-medium text-ink">{t(locale, "dashboard.website.security.whatWeFoundHeading")}</div>
        <p>{t(locale, "dashboard.website.security.matchedPhrase", { phrase: finding.matchedPhrase })}</p>
        {siteUrl && <p>{t(locale, "dashboard.website.security.homepageOnly", { url: siteUrl })}</p>}
        <p>
          {t(locale, finding.hidden ? "dashboard.website.security.hiddenYes" : "dashboard.website.security.hiddenNo")}
        </p>
        {domains.length > 0 && (
          <div>
            <p>{t(locale, "dashboard.website.security.domainsHeading")}</p>
            <ul className="mt-1 list-disc pl-5 font-mono text-[12px] text-ink">
              {domains.map((domain) => (
                <li key={domain}>{domain}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <p>{t(locale, "dashboard.website.security.snippetHeading")}</p>
          <blockquote className="mt-1 border-l-2 border-paper-deep pl-3 italic text-ink-mute">
            {trimSpamSnippet(finding.snippet, finding.matchedPhrase)}
          </blockquote>
        </div>
        <p className="text-[12px] text-ink-mute">{t(locale, safeBrowsingKey)}</p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-medium text-ink">{t(locale, "dashboard.website.security.whyHeading")}</div>
        <p>{t(locale, "dashboard.website.security.why")}</p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-medium text-ink">{t(locale, "dashboard.website.security.stepsHeading")}</div>
        <ol className="list-decimal pl-5">
          {SITE_SECURITY_STEP_KEYS.map((key) => (
            <li key={key}>{t(locale, key)}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[12.5px] font-medium text-ink hover:border-ink-soft"
        >
          {copyState === "copied" ? <IconCheck size={14} className="text-green" /> : <IconCopy size={14} />}
          {copyState === "copied"
            ? t(locale, "dashboard.website.security.copied")
            : t(locale, "dashboard.website.security.copyButton")}
        </button>
        {copyState === "fallback" && (
          <div className="flex flex-col gap-1">
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.website.security.copyFallback")}</p>
            <textarea
              readOnly
              value={copyText}
              rows={12}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-paper-deep bg-white p-2 font-mono text-[12px] text-ink"
            />
          </div>
        )}
      </div>
    </div>
  );
}
