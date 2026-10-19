"use client";

// "Past reports": one compact row per finished week (from its frozen
// snapshot), grouped by month, newest first. The last 8 weeks, then
// "Show older" 12 at a time, and a year filter once there's more than a
// year. Each PDF is drawn on demand when Download is clicked.

import { useState } from "react";
import { IconDownload } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatMonthLabel, formatShortDate, t, useLocale, type MessageKey } from "@/lib/i18n";
import { groupByMonth } from "@/lib/weekly/snapshots";
import { getPastReports, type PastReport } from "@/app/actions/weekly";
import { downloadWeeklyPdf } from "./weeklyPdfDownload";

const k = (key: string) => `dashboard.reports.weekly.${key}` as MessageKey;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function PastRow({ businessId, row }: { businessId: string; row: PastReport }) {
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const day = (ymd: string) => formatShortDate(`${ymd}T12:00:00Z`, locale, "UTC");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5" data-testid="past-report">
      <span className="min-w-0 flex-1 text-[13.5px] text-ink">
        {day(row.weekStart)} – {day(row.weekEnd)}
        {row.olderScoringVersion && <span className="ml-2 text-[11.5px] text-ink-mute">{t(locale, k("scoredWith"), { version: row.olderScoringVersion })}</span>}
      </span>
      <span className="font-serif text-[16px] font-bold text-ink">{row.score}</span>
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
          row.delta === null || row.delta === 0 ? "bg-ink/5 text-ink-soft" : row.delta > 0 ? "bg-green/10 text-green" : "bg-red/10 text-red"
        )}
      >
        {row.delta === null ? "—" : row.delta === 0 ? t(locale, k("noChange")) : signed(row.delta)}
      </span>
      <button
        type="button"
        onClick={async () => {
          setState("working");
          setState((await downloadWeeklyPdf(businessId, row.weekStart, true)) ? "idle" : "error");
        }}
        disabled={state === "working"}
        className="inline-flex items-center gap-1 rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] font-semibold text-ink hover:border-ink-mute disabled:opacity-50"
      >
        <IconDownload size={13} aria-hidden />
        {state === "working" ? t(locale, "dashboard.reports.recapPreparingDownload") : t(locale, k("downloadShort"))}
      </button>
      {state === "error" && <span className="w-full text-[11.5px] text-red">{t(locale, "dashboard.reports.pdf.error")}</span>}
    </li>
  );
}

export function PastReports({ businessId, initial }: { businessId: string; initial: { rows: PastReport[]; total: number; years: number[] } }) {
  const locale = useLocale();
  const [rows, setRows] = useState(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load(offset: number, nextYear: number | null) {
    setLoading(true);
    setError(false);
    const result = await getPastReports(businessId, offset, nextYear).catch(() => null);
    setLoading(false);
    if (!result || "status" in result) return setError(true);
    setRows((prev) => (offset === 0 ? result.rows : [...prev, ...result.rows]));
    setTotal(result.total);
  }

  if (initial.total === 0) {
    return <Card className="p-5 text-sm text-ink-soft">{t(locale, k("pastNone"))}</Card>;
  }

  return (
    <Card className="p-5" data-testid="past-reports">
      {initial.years.length > 1 && (
        <label className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-ink-soft">
          {t(locale, k("year"))}
          <select
            value={year ?? ""}
            onChange={(e) => {
              const next = e.target.value ? Number(e.target.value) : null;
              setYear(next);
              load(0, next);
            }}
            className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[13px] text-ink"
          >
            <option value="">{t(locale, k("allYears"))}</option>
            {initial.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-4">
        {groupByMonth(rows.map((r) => ({ ...r, week_start: r.weekStart }))).map((group) => (
          <section key={group.month}>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{formatMonthLabel(`${group.month}-15T12:00:00Z`, locale)}</h3>
            <ul className="divide-y divide-paper-line">
              {group.rows.map((r) => (
                <PastRow key={r.weekStart} businessId={businessId} row={r} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {rows.length < total && (
        <button type="button" onClick={() => load(rows.length, year)} disabled={loading} className="mt-3 text-[13px] font-semibold text-ink underline-offset-2 hover:underline disabled:opacity-50">
          {loading ? t(locale, k("loading")) : t(locale, k("showOlder"))}
        </button>
      )}
      {error && <p className="mt-2 text-[12px] text-red">{t(locale, k("pastError"))}</p>}
    </Card>
  );
}
