"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Toggle } from "@/components/ui/Toggle";
import { setMonthlyReportEnabled } from "@/app/actions/businesses";
import type { MonthlyEmailReportStatus } from "@/app/actions/reports";
import { t, useLocale, type Locale } from "@/lib/i18n";

function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}

/** A plain "about a month later" estimate from the last real send —
 * never a promised exact date, since no scheduler cadence is wired up
 * yet (see MONTHLY_REPORTS_LIVE in app/actions/reports.ts) and even once
 * it is, a scheduler run time isn't a guarantee. UTC throughout so this
 * can't drift a day depending on the server's local timezone, same
 * reasoning as formatMonthLabel in emails/MonthlyReportEmail.tsx. */
function estimateNextReportDate(lastSentIso: string, locale: Locale): string {
  const d = new Date(lastSentIso);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()));
  return formatDate(next.toISOString(), locale);
}

/**
 * The Reports page's staged, honest status for the monthly EMAIL report
 * (distinct from MonthlyRecapCard's in-app scan-to-scan recap). Exactly
 * one of four real states is ever shown — never a fabricated "next
 * report" date when the feature isn't live, and never silence about an
 * owner's own real on/off preference:
 *   - feature not live yet: "coming soon," regardless of this business's
 *     own settings/history.
 *   - live, but this business has it off: says so plainly.
 *   - live, on, but no report has ever been sent: "your first report
 *     will be a baseline."
 *   - live, on, and at least one real report was sent: the real last-sent
 *     date and a clearly-labeled estimate for the next one.
 * The on/off toggle is always interactive regardless of stage, so an
 * owner can set their real preference now for whenever the feature goes
 * live, or turn it back on after unsubscribing from an email.
 */
export function MonthlyEmailReportCard({
  businessId,
  status,
}: {
  businessId: string;
  status: MonthlyEmailReportStatus;
}) {
  const locale = useLocale();
  const [enabled, setEnabled] = useState(status.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    const result = await setMonthlyReportEnabled(businessId, next);
    if (result.status === "ok") {
      setEnabled(result.enabled);
    } else {
      setError(result.status === "error" ? result.message : t(locale, "dashboard.reports.emailSaveError"));
    }
    setSaving(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
            {t(locale, "dashboard.reports.monthlyEmailReportLabel")}
          </div>
          <StatusLine status={status} enabled={enabled} />
          {error && <p className="mt-1.5 text-[13px] text-red">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-[13px] font-medium text-ink-soft">
            {enabled ? t(locale, "dashboard.reports.onLabel") : t(locale, "dashboard.reports.offLabel")}
          </span>
          <Toggle
            checked={enabled}
            onChange={handleToggle}
            disabled={saving}
            label={t(locale, "dashboard.reports.monthlyEmailReportLabel")}
          />
        </div>
      </div>
    </Card>
  );
}

function StatusLine({ status, enabled }: { status: MonthlyEmailReportStatus; enabled: boolean }) {
  const locale = useLocale();
  if (!status.live) {
    return <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.reports.emailComingSoon")}</p>;
  }
  if (!enabled) {
    return <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.reports.emailOffMessage")}</p>;
  }
  if (!status.lastSentAt) {
    return <p className="mt-1 text-sm text-ink-soft">{t(locale, "dashboard.reports.emailFirstReportBaseline")}</p>;
  }
  return (
    <p className="mt-1 text-sm text-ink-soft">
      {t(locale, "dashboard.reports.emailLastSentNext", {
        lastSent: formatDate(status.lastSentAt, locale),
        nextReport: estimateNextReportDate(status.lastSentAt, locale),
      })}
    </p>
  );
}
