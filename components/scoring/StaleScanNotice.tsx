"use client";

// The re-scan notice on Growth, Reviews, Website, Competitors, Pricing and
// Reports: shown ONLY when the last scan is more than 48 hours old
// (lib/rescanPolicy.ts showRescanNotice) — "Scanned 3 days ago — re-scan
// for current results" with a link to the Overview's Re-scan button.
// Within 48 hours it renders nothing. Days are counted in the business's
// own time zone. The Overview keeps its own "Last scanned" line and button.

import Link from "next/link";
import { IconArrowRight, IconClock } from "@tabler/icons-react";
import { calendarDaysAgo } from "@/lib/i18n/format";
import { showRescanNotice } from "@/lib/rescanPolicy";
import { t, useLocale, useTimeZone } from "@/lib/i18n";

export function StaleScanNotice({ businessId, lastScanAt, now }: { businessId: string; lastScanAt: string | null; now: string }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const nowDate = new Date(now);
  if (!lastScanAt || !showRescanNotice(lastScanAt, nowDate)) return null;
  const days = Math.max(2, calendarDaysAgo(lastScanAt, nowDate, timeZone));
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-white px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
      <span className="inline-flex items-center gap-2 text-ink">
        <IconClock size={15} className="shrink-0 text-brass" aria-hidden />
        {t(locale, "dashboard.rescan.staleNotice", { days })}
      </span>
      <Link href={`/business/${businessId}#rescan`} className="inline-flex shrink-0 items-center gap-1 font-semibold text-ink hover:text-brass">
        {t(locale, "dashboard.rescan.linkToOverview")}
        <IconArrowRight size={14} aria-hidden />
      </Link>
    </div>
  );
}
