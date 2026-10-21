"use client";

// "Get more reviews, the right way" (Reviews page): when to ask, a short
// script in English and Spanish (with the business's real review link when
// it has one), where to put the QR code, why replying matters — and the
// one rule: never a discount or gift for a review (Google's policy).

import { LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { useState } from "react";
import { IconAlertTriangle, IconCheck, IconCopy } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

/** The ask-for-a-review script in one language, with the real link. */
export function reviewScript(lang: "en" | "es", placeId: string | null): string {
  const base = t(lang, lang === "es" ? "dashboard.websiteReviews.guide.scriptEs" : "dashboard.websiteReviews.guide.scriptEn");
  if (!placeId) return base;
  const link = t(lang, lang === "es" ? "dashboard.websiteReviews.guide.scriptEsLink" : "dashboard.websiteReviews.guide.scriptEnLink", { link: buildGoogleReviewUrl(placeId) });
  return `${base} ${link}`;
}

function CopyButton({ text }: { text: string }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] font-semibold text-ink hover:border-ink-soft"
    >
      {copied ? <IconCheck size={13} aria-hidden /> : <IconCopy size={13} aria-hidden />}
      {copied ? t(locale, "dashboard.websiteReviews.guide.copied") : t(locale, "dashboard.websiteReviews.guide.copy")}
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </div>
  );
}

const g = (key: string) => `dashboard.websiteReviews.guide.${key}` as MessageKey;

/** Free: the rule stays visible to everyone; the rest is a LockedPreview
 * with only the section headings — the details are never in the page. */
function LockedGuide() {
  const locale = useLocale();
  const facts = useUpgrade()?.facts ?? NO_FACTS;
  const sections = ["whenTitle", "scriptTitle", "whereTitle"];
  return (
    <LockedPreview
      title={t(locale, g("heading"))}
      labels={sections.map((k) => t(locale, g(k)))}
      unlock={unlockLine("reviews", facts, locale) ?? unlockLine("plan", facts, locale)}
    />
  );
}

export function ReviewGuide({ placeId, locked = false }: { placeId: string | null; locked?: boolean }) {
  const locale = useLocale();
  const bullets = (keys: string[]) => (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-ink-soft marker:text-brass">
      {keys.map((k) => (
        <li key={k}>{t(locale, g(k))}</li>
      ))}
    </ul>
  );
  const scripts: Array<{ lang: "en" | "es"; label: MessageKey }> = [
    { lang: "en", label: g("scriptInEnglish") },
    { lang: "es", label: g("scriptInSpanish") },
  ];
  // The owner's own language first.
  if (locale === "es") scripts.reverse();

  return (
    <Card className="flex flex-col gap-5 p-5" data-testid="review-guide">
      <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, g("heading"))}</h2>

      <div className="flex items-start gap-2.5 rounded-lg border border-amber/40 bg-amber/5 px-3.5 py-2.5" data-testid="review-rule">
        <IconAlertTriangle size={17} className="mt-0.5 shrink-0 text-amber" aria-hidden />
        <p className="text-[13px] font-semibold text-ink">{t(locale, g("rule"))}</p>
      </div>

      {locked ? (
        <LockedGuide />
      ) : (
        <>

          <div className="grid grid-cols-1 gap-5 nav:grid-cols-2">
            <Block title={t(locale, g("whenTitle"))}>{bullets(["when1", "when2", "when3"])}</Block>
            <Block title={t(locale, g("whereTitle"))}>{bullets(["where1", "where2", "where3", "where4"])}</Block>
          </div>

          <Block title={t(locale, g("scriptTitle"))}>
            <div className="flex flex-col gap-2.5">
              {scripts.map(({ lang, label }) => {
                const text = reviewScript(lang, placeId);
                return (
                  <div key={lang} className="rounded-lg border border-paper-line bg-paper p-3" lang={lang}>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, label)}</span>
                      <CopyButton text={text} />
                    </div>
                    <p className="break-words text-[13px] text-ink">{text}</p>
                  </div>
                );
              })}
            </div>
          </Block>

          <Block title={t(locale, g("replyTitle"))}>
            <p className="text-[13px] text-ink-soft">{t(locale, g("replyBody"))}</p>
          </Block>
        </>
      )}
    </Card>
  );
}
