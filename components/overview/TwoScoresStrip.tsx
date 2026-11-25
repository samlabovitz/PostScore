"use client";

// Day 25B: "How your two scores work together" — under the Overview's score
// card and at the top of the Growth plan (docs/mockups/day25b/
// overview-two-scores.html). Presence gets you found; Growth gets you chosen
// and brings customers back. Honest: a higher score helps people find you —
// never a promised ranking. "×" hides it for this user on every business
// (their own account metadata; no other data changes).

import { useState } from "react";
import Link from "next/link";
import { IconX } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import { useShellData } from "@/components/layout/ShellData";
import { fixPlanHref, growthPlanHref } from "@/lib/routes";
import { t, type MessageKey, useLocale } from "@/lib/i18n";

const K = (k: string) => `dashboard.twoScores.${k}` as MessageKey;

export function TwoScoresStrip({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const shell = useShellData();
  const [hidden, setHidden] = useState(shell?.twoScoresHidden === true);
  if (!shell || hidden) return null;
  const hide = () => {
    setHidden(true);
    void createClient()
      .auth.updateUser({ data: { two_scores_hidden: true } })
      .catch(() => undefined);
  };
  const half = "flex min-w-0 gap-3 px-4 py-3 text-[13px] leading-snug text-ink-soft";
  const icon = "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold";
  return (
    <section className="flex flex-col gap-1.5" data-testid="two-scores">
      <p className="px-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-mute">{t(locale, K("title"))}</p>
      <div className="relative grid overflow-hidden rounded-xl border border-paper-deep bg-white pr-8 sm:grid-cols-2">
        <div className={half}>
          <span className={`${icon} bg-paper text-ink`} aria-hidden>P</span>
          <div>
            <b className="block text-[13.5px] font-semibold text-ink">{t(locale, K("presence.title"))}</b>
            {t(locale, K("presence.body"))}{" "}
            <Link href={fixPlanHref(businessId)} className="font-semibold text-ink underline decoration-brass underline-offset-2">
              {t(locale, K("presence.link"))}
            </Link>
          </div>
        </div>
        <div className={`${half} border-t border-paper-line sm:border-l sm:border-t-0`}>
          <span className={`${icon} bg-[color:color-mix(in_srgb,var(--color-brass)_12%,white)] text-brass`} aria-hidden>G</span>
          <div>
            <b className="block text-[13.5px] font-semibold text-ink">{t(locale, K("growth.title"))}</b>
            {t(locale, K("growth.body"))}{" "}
            <Link href={growthPlanHref(businessId)} className="font-semibold text-ink underline decoration-brass underline-offset-2">
              {t(locale, K("growth.link"))}
            </Link>
          </div>
        </div>
        <button type="button" onClick={hide} aria-label={t(locale, K("hide"))} title={t(locale, K("hide"))} className="absolute right-2 top-2 text-ink-mute hover:text-ink" data-testid="two-scores-hide">
          <IconX size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}

/** Growth plan: under 70, a gold note that fixing the Presence score is the fastest way to be found. */
export function PresenceUnder70Note({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const score = useShellData()?.presence?.score ?? null;
  if (score === null || score >= 70) return null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-4 py-3 text-[13.5px] text-ink sm:flex-row sm:items-center sm:justify-between" data-testid="presence-under-70">
      <p>{t(locale, K("under70"), { score })}</p>
      <Link href={fixPlanHref(businessId)} className="inline-flex w-fit shrink-0 items-center rounded-lg bg-brass px-3.5 py-2 text-[13px] font-semibold text-ink hover:bg-[color:color-mix(in_srgb,var(--color-brass)_85%,white)]">
        {t(locale, K("openFixPlan"))}
      </Link>
    </div>
  );
}
