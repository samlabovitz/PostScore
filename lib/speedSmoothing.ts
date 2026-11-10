// "Loads fast", steadied (Nov 10): Google's speed test varies from run to
// run (the real Wonder case: 2.5 s "Fast", then 2.6 s "Average" — 2 points
// for a tenth of a second). So the check scores the TYPICAL result:
//   1. the median of the last 3 successful speed measurements of the same
//      site (measuredUrl must match) within 30 days — with 1–2, what there is;
//   2. a 0.3 s buffer at the Fast/Average (2.5 s) and Average/Slow (4 s)
//      lines: the band changes only when the median crosses a line by more
//      than 0.3 s; otherwise the previous band stays.
// Computed when a scan is saved (lib/websiteAnalysisForSave.ts) and stored
// with the analysis; lib/scoring.ts reads it. Pure.

import type { FieldSpeedCategory, MobilePerformanceMeasurement } from "@/lib/scoring";
import { sameMeasuredSite } from "@/lib/scoring";

export const FAST_LINE_SECONDS = 2.5;
export const SLOW_LINE_SECONDS = 4;
export const BAND_BUFFER_SECONDS = 0.3;
export const SPEED_SAMPLES = 3;
export const SPEED_WINDOW_DAYS = 30;

/** One successful speed measurement, as kept in the history. */
export interface SpeedSample {
  measuredAt: string;
  measuredUrl: string;
  /** Seconds to show the page on a phone (LCP), when Google gave it. */
  lcpSeconds: number | null;
  /** The band this one measurement alone would give. */
  category: FieldSpeedCategory;
}

/** The typical result the check scores. */
export interface SpeedSmoothed {
  category: FieldSpeedCategory;
  /** Median seconds of the samples (null when none had seconds). */
  seconds: number | null;
  samples: number;
  measuredUrl: string;
}

const RANK: Record<FieldSpeedCategory, number> = { FAST: 0, AVERAGE: 1, SLOW: 2 };
const BY_RANK: FieldSpeedCategory[] = ["FAST", "AVERAGE", "SLOW"];

/** The band one measurement gives — the same lines as the check. */
export function sampleCategory(m: Pick<MobilePerformanceMeasurement, "lcpSeconds" | "method" | "fieldCategory" | "labScore">): FieldSpeedCategory {
  if (typeof m.lcpSeconds === "number") return m.lcpSeconds <= FAST_LINE_SECONDS ? "FAST" : m.lcpSeconds <= SLOW_LINE_SECONDS ? "AVERAGE" : "SLOW";
  if (m.method === "field" && m.fieldCategory) return m.fieldCategory;
  const score = m.labScore ?? 0;
  return score >= 90 ? "FAST" : score >= 50 ? "AVERAGE" : "SLOW";
}

/** A fresh, real measurement as a sample — never a carried-forward copy,
 * never one without a site or a date. */
export function sampleFrom(m: MobilePerformanceMeasurement | null | undefined): SpeedSample | null {
  if (!m || m.carriedForward || !m.measuredAt || !m.measuredUrl) return null;
  const usable = m.method === "field" ? m.fieldCategory !== null : m.labScore !== null;
  if (!usable) return null;
  return { measuredAt: m.measuredAt, measuredUrl: m.measuredUrl, lcpSeconds: typeof m.lcpSeconds === "number" ? m.lcpSeconds : null, category: sampleCategory(m) };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The history after a scan: this site's samples within 30 days, newest
 * first, at most SPEED_SAMPLES, with the fresh one added (never twice).
 * Samples of another site are dropped — they say nothing about this one.
 */
export function nextSpeedHistory(previous: SpeedSample[] | null | undefined, fresh: SpeedSample | null, siteUrl: string | null, now: Date = new Date()): SpeedSample[] {
  if (!siteUrl) return [];
  const cutoff = now.getTime() - SPEED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const all = [...(fresh ? [fresh] : []), ...(previous ?? [])];
  const seen = new Set<string>();
  return all
    .filter((s) => sameMeasuredSite(s.measuredUrl, siteUrl) && Date.parse(s.measuredAt) >= cutoff)
    .filter((s) => (seen.has(s.measuredAt) ? false : (seen.add(s.measuredAt), true)))
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))
    .slice(0, SPEED_SAMPLES);
}

/** The band for `seconds`, moving away from `previous` only when a line is
 * crossed by more than the buffer (one band at a time). */
export function bufferedBand(seconds: number, previous: FieldSpeedCategory | null): FieldSpeedCategory {
  const raw: FieldSpeedCategory = seconds <= FAST_LINE_SECONDS ? "FAST" : seconds <= SLOW_LINE_SECONDS ? "AVERAGE" : "SLOW";
  if (!previous) return raw;
  let band = previous;
  // Slower: past the band's upper line by more than the buffer.
  while (band !== "SLOW" && seconds > (band === "FAST" ? FAST_LINE_SECONDS : SLOW_LINE_SECONDS) + BAND_BUFFER_SECONDS) band = BY_RANK[RANK[band] + 1];
  // Faster: below the band's lower line by more than the buffer.
  while (band !== "FAST" && seconds < (band === "SLOW" ? SLOW_LINE_SECONDS : FAST_LINE_SECONDS) - BAND_BUFFER_SECONDS) band = BY_RANK[RANK[band] - 1];
  return band;
}

/** The typical result of a history: median seconds (or the median band
 * when Google gave no seconds), kept in the previous band unless a line is
 * crossed by more than the buffer. null for an empty history. */
export function smoothSpeed(history: SpeedSample[], previous: SpeedSmoothed | null | undefined): SpeedSmoothed | null {
  if (history.length === 0) return null;
  const siteUrl = history[0].measuredUrl;
  const prevBand = previous && sameMeasuredSite(previous.measuredUrl, siteUrl) ? previous.category : null;
  const withSeconds = history.filter((s) => typeof s.lcpSeconds === "number").map((s) => s.lcpSeconds as number);
  if (withSeconds.length > 0) {
    const seconds = Math.round(median(withSeconds) * 100) / 100;
    return { category: bufferedBand(seconds, prevBand), seconds, samples: withSeconds.length, measuredUrl: siteUrl };
  }
  const rank = Math.round(median(history.map((s) => RANK[s.category])));
  return { category: BY_RANK[rank], seconds: null, samples: history.length, measuredUrl: siteUrl };
}
