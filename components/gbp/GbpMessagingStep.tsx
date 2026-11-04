"use client";

// "Let customers text you from Google" — the steps from Google's own help
// (GOOGLE_LINKS.chatHelp), ✓ only when the connected location really has
// a texting or WhatsApp option (lib/gbpMessaging.ts). Never scored, and
// PostScore never turns it on. Plus the one line about Google's AI using
// the profile's details.

import Link from "next/link";
import { IconCircleCheck, IconMessageCircle } from "@tabler/icons-react";
import { GOOGLE_LINKS } from "@/lib/googleHelpLinks";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { checkAnchorId } from "@/lib/postaiLinks";

const STEPS: MessageKey[] = ["dashboard.gbpMessaging.step1", "dashboard.gbpMessaging.step2", "dashboard.gbpMessaging.step3", "dashboard.gbpMessaging.step4", "dashboard.gbpMessaging.step5"];

/** `on`: true = a texting/WhatsApp option is set (read from Google); false/null = not set or not known — the steps show. */
export function GbpMessagingStep({ on }: { on: boolean | null }) {
  const locale = useLocale();
  return (
    <div data-testid="gbp-messaging-step" className="flex items-start gap-3">
      <span aria-hidden className={on ? "mt-0.5 text-green" : "mt-0.5 text-ink-mute"}>
        {on ? <IconCircleCheck size={18} /> : <IconMessageCircle size={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.gbpMessaging.title")}</p>
        {on ? (
          <p data-testid="gbp-messaging-on" className="mt-0.5 text-[12.5px] font-medium text-green">{t(locale, "dashboard.gbpMessaging.on")}</p>
        ) : (
          <>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-soft">
              {STEPS.map((k) => (
                <li key={k}>{t(locale, k)}</li>
              ))}
            </ol>
            <p className="mt-1.5 text-[12px] text-ink-mute">{t(locale, "dashboard.gbpMessaging.regions")}</p>
          </>
        )}
        <p className="mt-1 text-[12px] text-ink-mute">{t(locale, "dashboard.gbpMessaging.never")}</p>
        <a href={GOOGLE_LINKS.chatHelp + (locale === "es" ? "?hl=es" : "")} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] font-medium text-ink-soft underline underline-offset-2 hover:text-ink">
          {t(locale, "dashboard.gbpMessaging.helpLink")}
        </a>
      </div>
    </div>
  );
}

/** "Google's AI answers customers' questions from your profile…" — with
 * "Update on Google" (the Customer details row) for Premium. */
export function GoogleAiAnswersLine({ businessId, premium, className }: { businessId: string | null; premium: boolean; className?: string }) {
  const locale = useLocale();
  return (
    <p data-testid="google-ai-answers" className={className ?? "text-[12.5px] text-ink-soft"}>
      {t(locale, "dashboard.gbpMessaging.aiLine")}
      {premium && businessId && (
        <>
          {" "}
          <Link href={`/business/${businessId}#${checkAnchorId("completeness.customer_details")}`} className="font-medium text-ink underline underline-offset-2 hover:text-ink-soft">
            {t(locale, "dashboard.gbpMessaging.updateOnGoogle")}
          </Link>
        </>
      )}
    </p>
  );
}
