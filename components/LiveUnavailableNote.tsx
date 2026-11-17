"use client";

import { IconAlertCircle } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

/** "Couldn't load from Google right now" — when a page's live Google
 * values couldn't be read (Day 23): our own results still show. */
export function LiveUnavailableNote() {
  const locale = useLocale();
  return (
    <div role="status" data-testid="live-unavailable" className="flex items-start gap-2.5 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[13px] text-ink-soft">
      <IconAlertCircle size={15} className="mt-0.5 shrink-0 text-ink-mute" aria-hidden />
      <span>{t(locale, "dashboard.live.unavailable")}</span>
    </div>
  );
}
