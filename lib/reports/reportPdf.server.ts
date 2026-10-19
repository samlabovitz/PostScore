// Renders ReportData to the one-page letter PDF — Playfair Display for
// headings and Inter for text (the same embedded fonts the designers use).

import "server-only";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import { renderPdf } from "@/lib/signStudio/pdf";
import { t } from "@/lib/i18n";
import { layoutReport, type ReportData } from "./reportPdf";

export async function buildReportPdf(data: ReportData): Promise<Uint8Array> {
  const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, readSignFont);
  const page = layoutReport(data, createMeasurer(fonts));
  const { bytes } = await renderPdf([page], { qrs: {}, fontBytes: fonts, title: `${t(data.locale, "dashboard.reports.pdf.title")} — ${data.business.name}` });
  return bytes;
}

/** "postscore-report-modern-liquors-2026-10-19.pdf" */
export function reportFileName(name: string, generatedAt: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `postscore-report-${slug || "business"}-${generatedAt.slice(0, 10)}.pdf`;
}
