"use client";

// "How to fix this in {builder}" — collapsed under a losing website check
// (Website page). Builder steps only when that builder's official help
// article backs them (lib/websiteBuilderGuides.ts); otherwise the generic
// guide: what to ask a web person for, as a message they can copy.

import { useState } from "react";
import { IconCopy, IconExternalLink } from "@tabler/icons-react";
import { formatShortDate, t, useLocale, type MessageKey } from "@/lib/i18n";
import { builderGuideFor, webPersonAsk, webPersonMessage, type BuilderGuide } from "@/lib/websiteBuilderGuides";
import { WEBSITE_BUILDER_NAMES, type WebsiteBuilderId } from "@/lib/websiteBuilder";
import type { WebsiteFix } from "@/lib/websiteFixes";

const k = (key: string) => `dashboard.websiteFix.guide.${key}` as MessageKey;

function CopyMessage({ text }: { text: string }) {
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="flex flex-col gap-1.5">
      <pre data-testid="web-person-message" className="whitespace-pre-wrap break-words rounded-lg border border-paper-deep bg-paper px-3 py-2 font-sans text-[12.5px] leading-snug text-ink">
        {text}
      </pre>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard
              ?.writeText(text)
              .then(() => setState("copied"))
              .catch(() => setState("failed")) ?? setState("failed")
          }
          className="inline-flex items-center gap-1 rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] font-semibold text-ink hover:border-ink-mute"
        >
          <IconCopy size={13} aria-hidden />
          {state === "copied" ? t(locale, k("copied")) : t(locale, k("copy"))}
        </button>
        {state === "failed" && <span className="text-[12px] text-red">{t(locale, k("copyFailed"))}</span>}
      </div>
    </div>
  );
}

function Steps({ guide, builderName }: { guide: BuilderGuide; builderName: string }) {
  const locale = useLocale();
  const lang = locale === "es" ? "es" : "en";
  return (
    <div className="flex flex-col gap-1.5" data-testid="builder-guide">
      <ol className="ml-4 list-decimal space-y-1 text-[12.5px] leading-snug text-ink">
        {guide.steps[lang].map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {guide.limitation && (
        <p className="rounded-md bg-amber/10 px-2.5 py-1.5 text-[12px] text-ink">
          <span className="font-semibold">{t(locale, k("cantDo"), { builder: builderName })}</span> {guide.limitation[lang]}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-mute">
        <a href={guide.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
          {t(locale, k("official"))}
          <IconExternalLink size={12} aria-hidden />
        </a>
        <span>{t(locale, k("verified"), { date: formatShortDate(`${guide.verifiedAt}T12:00:00Z`, locale, "UTC") })}</span>
      </p>
    </div>
  );
}

export function WebsiteFixGuide({ fixes, builder, siteUrl }: { fixes: WebsiteFix[]; builder: WebsiteBuilderId | null; siteUrl: string | null }) {
  const locale = useLocale();
  const lang = locale === "es" ? "es" : "en";
  const builderName = builder ? WEBSITE_BUILDER_NAMES[builder] : null;
  // One entry per distinct guide (two missing items can share one).
  const guides: BuilderGuide[] = [];
  const asks: string[] = [];
  for (const fix of fixes) {
    const guide = builderGuideFor(builder, fix.checkId, fix.gap);
    if (guide) {
      if (!guides.includes(guide)) guides.push(guide);
    } else {
      const ask = webPersonAsk(fix.checkId, fix.gap, lang);
      if (ask && !asks.includes(ask)) asks.push(ask);
    }
  }
  if (guides.length === 0 && asks.length === 0) return null;

  return (
    <details className="group mt-2 rounded-lg border border-paper-deep bg-white" data-testid="fix-guide">
      <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {builderName ? t(locale, k("summaryBuilder"), { builder: builderName }) : t(locale, k("summary"))}
      </summary>
      <div className="flex flex-col gap-3 border-t border-paper-line px-3 py-3">
        {guides.map((g) => (
          <Steps key={g.url + g.steps.en[0]} guide={g} builderName={builderName ?? ""} />
        ))}
        {asks.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="generic-guide">
            <p className="text-[12px] text-ink-soft">
              {builderName ? t(locale, k("noBuilderGuide"), { builder: builderName }) : t(locale, k("unknownBuilder"))}
            </p>
            <p className="text-[12.5px] font-semibold text-ink">{t(locale, k("askWebPerson"))}</p>
            <ul className="ml-4 list-disc space-y-1 text-[12.5px] leading-snug text-ink">
              {asks.map((a) => (
                <li key={a}>{a.charAt(0).toUpperCase() + a.slice(1)}.</li>
              ))}
            </ul>
            <span className="text-[11.5px] font-medium uppercase tracking-[0.05em] text-ink-mute">{t(locale, k("messageLabel"))}</span>
            <CopyMessage text={webPersonMessage(asks, siteUrl, lang)} />
          </div>
        )}
      </div>
    </details>
  );
}
