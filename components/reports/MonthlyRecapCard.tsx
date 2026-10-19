"use client";

import { useState } from "react";
import { IconDownload, IconShare2 } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { downloadPdf } from "@/lib/signStudio/output";
import { renderShareImagePng } from "@/lib/reportsRecapImage";
import { periodLabel } from "@/lib/reports/reportPdf";
import type { MonthlyRecap } from "@/app/actions/reports";
import { t, useLocale, useTimeZone } from "@/lib/i18n";

/**
 * A recap of what changed between the two most recent real scans — real
 * score delta, real listing changes from diffProfileSnapshots, and the
 * real gap between the scans in calendar days (business time zone),
 * never rounded up to "a month". "Download report (PDF)" is the one-page
 * report built from the same data; Share appears only with real good
 * news (shareHeadline is null otherwise).
 */
export function MonthlyRecapCard({
  businessId,
  recap,
  shareHeadline,
}: {
  businessId: string;
  recap: MonthlyRecap | null;
  shareHeadline: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const actions = <RecapActions businessId={businessId} shareHeadline={shareHeadline} score={recap?.current.total ?? null} grade={recap?.current.grade ?? null} />;

  if (!recap) {
    return (
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ink-soft">{t(locale, "dashboard.reports.recapFirstScanMessage")}</p>
        {actions}
      </Card>
    );
  }

  const { previous, current, scoreDelta, daysBetween, changes, changesUnavailable } = recap;
  const dateRangeLabel = periodLabel({ from: previous.created_at, to: current.created_at, days: daysBetween }, locale, timeZone);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div data-testid="recap-range" className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
            {dateRangeLabel}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-serif text-[28px] font-bold text-ink">
              {previous.total} → {current.total}
            </span>
            <Pill variant={scoreDelta > 0 ? "green" : scoreDelta < 0 ? "red" : "neutral"}>
              {scoreDelta === 0 ? t(locale, "dashboard.overview.noChange") : scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
            </Pill>
          </div>
        </div>
        {actions}
      </div>

      <div className="mt-5 border-t border-paper-line pt-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.reports.recapWhatChangedPeriod", { range: dateRangeLabel })}
        </div>
        {changesUnavailable ? (
          <p className="mt-2 text-sm text-ink-soft">{t(locale, "dashboard.reports.recapChangesUnavailable")}</p>
        ) : changes.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t(locale, "dashboard.reports.recapNoChangesDetected")}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {changes.slice(0, 3).map((change) => (
              <li key={change.field} className="text-sm text-ink">
                {change.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function RecapActions({ businessId, shareHeadline, score, grade }: { businessId: string; shareHeadline: string | null; score: number | null; grade: string | null }) {
  const locale = useLocale();
  const [pdf, setPdf] = useState<"idle" | "working" | "error">("idle");
  const [share, setShare] = useState<"idle" | "working" | "saved" | "error">("idle");

  async function handleDownload() {
    setPdf("working");
    try {
      const res = await fetch(`/api/business/${businessId}/report-pdf`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "postscore-report.pdf";
      downloadPdf(new Uint8Array(await res.arrayBuffer()), name);
      setPdf("idle");
    } catch {
      setPdf("error");
    }
  }

  async function handleShare() {
    if (!shareHeadline || score === null || grade === null) return;
    setShare("working");
    try {
      const blob = await renderShareImagePng({
        headline: shareHeadline,
        score,
        grade,
        gradeLabel: t(locale, "dashboard.reports.pdf.grade", { grade }),
        footer: t(locale, "dashboard.reports.share.footer"),
      });
      const file = new File([blob], "postscore-good-news.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareHeadline });
        } catch {
          // Share sheet dismissed — nothing to report.
        }
        setShare("idle");
        return;
      }
      // No file sharing here (most desktops): save the image instead.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setShare("saved");
    } catch {
      setShare("error");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="default" size="sm" onClick={handleDownload} disabled={pdf === "working"}>
          <IconDownload size={14} />
          {pdf === "working" ? t(locale, "dashboard.reports.recapPreparingDownload") : t(locale, "dashboard.reports.pdf.download")}
        </Button>
        {shareHeadline && score !== null && (
          <Button variant="brass" size="sm" onClick={handleShare} disabled={share === "working"} data-testid="share-good-news">
            <IconShare2 size={14} />
            {t(locale, "dashboard.reports.share.button")}
          </Button>
        )}
      </div>
      {pdf === "error" && <span className="text-xs text-red">{t(locale, "dashboard.reports.pdf.error")}</span>}
      {share === "saved" && <span className="text-xs text-ink-soft">{t(locale, "dashboard.reports.share.downloaded")}</span>}
      {share === "error" && <span className="text-xs text-red">{t(locale, "dashboard.reports.recapImageError")}</span>}
    </div>
  );
}
