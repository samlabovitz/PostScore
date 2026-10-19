"use client";

// "Share" — offered only with real good news (shareHeadline in
// lib/reports/reportPdf.ts: the score rose between two comparable scans,
// or the local rank improved). A square image via the share sheet, or a
// download where file sharing isn't available.

import { useState } from "react";
import { IconShare2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { renderShareImagePng } from "@/lib/reportsRecapImage";
import { t, useLocale } from "@/lib/i18n";

export function ShareGoodNews({ headline, score, grade }: { headline: string; score: number; grade: string }) {
  const locale = useLocale();
  const [share, setShare] = useState<"idle" | "working" | "saved" | "error">("idle");

  async function handleShare() {
    setShare("working");
    try {
      const blob = await renderShareImagePng({
        headline,
        score,
        grade,
        gradeLabel: t(locale, "dashboard.reports.pdf.grade", { grade }),
        footer: t(locale, "dashboard.reports.share.footer"),
      });
      const file = new File([blob], "postscore-good-news.png", { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: headline });
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
    <span className="inline-flex flex-col items-start gap-1">
      <Button variant="brass" size="sm" onClick={handleShare} disabled={share === "working"} data-testid="share-good-news">
        <IconShare2 size={14} />
        {t(locale, "dashboard.reports.share.button")}
      </Button>
      {share === "saved" && <span className="text-xs text-ink-soft">{t(locale, "dashboard.reports.share.downloaded")}</span>}
      {share === "error" && <span className="text-xs text-red">{t(locale, "dashboard.reports.recapImageError")}</span>}
    </span>
  );
}
