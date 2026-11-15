// Renders ReportData to the one-page letter PDF — Playfair Display for
// headings and Inter for text (the same embedded fonts the designers use).

import "server-only";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import { renderPdf } from "@/lib/signStudio/pdf";
import { t } from "@/lib/i18n";
import { layoutReport, type ReportData } from "./reportPdf";
import { layoutWeeklyReportV2, type WeeklyReportV2Data } from "./weeklyReportV2";

export async function buildReportPdf(data: ReportData): Promise<Uint8Array> {
  const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, readSignFont);
  const page = layoutReport(data, createMeasurer(fonts));
  const title = data.weekly ? t(data.locale, "dashboard.reports.weekly.title") : t(data.locale, "dashboard.reports.pdf.title");
  const { bytes } = await renderPdf([page], { qrs: {}, fontBytes: fonts, title: `${title} — ${data.business.name}` });
  return bytes;
}

/** The three-page weekly report (lib/reports/weeklyReportV2.ts). */
export async function buildWeeklyReportV2Pdf(data: WeeklyReportV2Data): Promise<Uint8Array> {
  const fonts = await loadDesignFonts({ headlineFont: "playfair", bodyFont: "inter" }, readSignFont);
  const pages = layoutWeeklyReportV2(data, createMeasurer(fonts));
  const { bytes } = await renderPdf(pages, { qrs: {}, fontBytes: fonts, title: `${t(data.base.locale, "dashboard.reports.weekly.title")} — ${data.base.business.name}` });
  return bytes;
}
