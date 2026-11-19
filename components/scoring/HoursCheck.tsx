"use client";

// Day 23B: the scored hours check as it is now (lib/hoursCheck.ts) — the
// exact days that differ (website vs Google Maps), or, when they match now,
// "re-scan to update your score" with a Re-scan button.

import Link from "next/link";
import { IconRefresh } from "@tabler/icons-react";
import { RESCAN_BUTTON_ID } from "@/components/scoring/ScanStatusStrip";
import { FIX_BUTTON_CLASS } from "@/components/scoring/FixButton";
import { formatTime, type DayHours } from "@/lib/gbpProfileEdits";
import { dayName } from "@/lib/hoursEditor";
import type { HoursCheckState } from "@/lib/hoursCheck";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";

const K = (key: string) => `dashboard.hoursCheck.${key}` as MessageKey;
export const HOURS_CHECK_DAYS_SHOWN = 3;

export function dayHoursText(d: DayHours, locale: Locale): string {
  if (d.mode === "closed") return t(locale, "dashboard.overview.hoursClosed");
  if (d.mode === "open24") return t(locale, "dashboard.overview.hoursOpen24");
  return [...d.ranges]
    .sort((a, b) => a.open - b.open)
    .map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}`)
    .join(", ");
}

/** "Thursday: website 9:30 AM – 6:00 PM · Google 10:00 AM – 5:00 PM", one line per day (3 at most). */
export function HoursDiffLines({ state }: { state: Extract<HoursCheckState, { kind: "differs" }> }) {
  const locale = useLocale();
  const shown = state.days.slice(0, HOURS_CHECK_DAYS_SHOWN);
  return (
    <div data-testid="hours-diff" className="flex flex-col gap-0.5 text-[12.5px] leading-snug text-ink-soft">
      {shown.map((d) => (
        <span key={d.day} data-testid={`hours-diff-${d.day}`}>
          {t(locale, K("differ"), { day: dayName(d.day, locale), website: dayHoursText(d.website, locale), google: dayHoursText(d.google, locale) })}
        </span>
      ))}
      {state.days.length > shown.length && <span>{t(locale, K("more"), { count: state.days.length - shown.length })}</span>}
      {state.profileAhead && <span data-testid="hours-profile-ahead" className="text-ink-mute">{t(locale, K("profileAhead"))}</span>}
    </div>
  );
}

/** The re-scan: the Overview's own "Re-scan now" when it's on the page, else the Overview at that button. */
export function RescanNowButton({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <Link
      href={`/business/${businessId}#${RESCAN_BUTTON_ID}`}
      data-testid="fix-button"
      data-kind="rescan"
      onClick={(e) => {
        const button = document.getElementById(RESCAN_BUTTON_ID);
        if (!button) return;
        e.preventDefault();
        button.scrollIntoView({ behavior: "smooth", block: "center" });
        button.click();
      }}
      className={FIX_BUTTON_CLASS}
    >
      <IconRefresh size={14} aria-hidden />
      {t(locale, "dashboard.overview.rescanNow")}
    </Link>
  );
}
