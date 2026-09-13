// Sample data for previewing/testing MonthlyReportEmail against every
// honest state buildMonthlyReportContent() can produce. Every sample's
// `content` is built by calling the REAL pure function on hand-crafted
// but structurally real MonthlyReportScoreRow fixtures — never a
// hand-typed MonthlyReportContent object — so these can never drift from
// what the real builder actually produces.
import { buildMonthlyReportContent, type MonthlyReportScoreRow } from "@/lib/monthlyReport";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import type { MonthlyReportEmailProps } from "./MonthlyReportEmail";

export const BASE_SNAPSHOT: ProfileSnapshot = {
  phone: "+1-555-201-4000",
  website: "https://rivercafe.example.com",
  openingHours: ["Monday: 7:00 AM – 4:00 PM"],
  categories: ["cafe"],
  photoCount: 22,
  rating: 4.6,
  reviewCount: 142,
  businessStatus: "OPERATIONAL",
};

function scoreRow(overrides: Partial<MonthlyReportScoreRow> = {}): MonthlyReportScoreRow {
  return {
    id: "sample-score",
    total: 84,
    grade: "B",
    createdAt: "2026-09-01T00:00:00.000Z",
    profileSnapshot: BASE_SNAPSHOT,
    ...overrides,
  };
}

const UNSUBSCRIBE_URL_PLACEHOLDER = "https://postscore.app/unsubscribe?business=sample&token=PLACEHOLDER";

/** 1. A business's first-ever report — no baseline to compare against. */
export const SAMPLE_BASELINE: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(null, scoreRow({ id: "current", total: 78, grade: "C" }), null),
};

/** 2. A quiet month — nothing measurable actually changed. */
export const SAMPLE_STEADY: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({ id: "baseline", createdAt: "2026-08-01T00:00:00.000Z" }),
    scoreRow({ id: "current", createdAt: "2026-09-01T00:00:00.000Z" }),
    { previous: { rank: 3, totalCompetitors: 9 }, current: { rank: 3, totalCompetitors: 9 } }
  ),
};

/** 3. A genuinely good month — real improvement across every metric. */
export const SAMPLE_REAL_DELTAS: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({
      id: "baseline",
      total: 70,
      grade: "C",
      createdAt: "2026-08-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.2, reviewCount: 118, photoCount: 18 },
    }),
    scoreRow({
      id: "current",
      total: 84,
      grade: "B",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.6, reviewCount: 142, photoCount: 22 },
    }),
    { previous: { rank: 5, totalCompetitors: 12 }, current: { rank: 2, totalCompetitors: 12 } }
  ),
};

/** 4. Missing data — no competitor scan this period, and NEITHER scan
 * has a real profile snapshot (both predate that tracking, or the fetch
 * failed both times), so rating/review-count are genuinely unavailable,
 * not just "no prior value to compare." Score is still real either
 * way — a `scores` row always has one regardless of snapshot presence. */
export const SAMPLE_MISSING_DATA: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({ id: "baseline", total: 70, grade: "C", createdAt: "2026-08-01T00:00:00.000Z", profileSnapshot: null }),
    scoreRow({ id: "current", total: 85, grade: "B", createdAt: "2026-09-01T00:00:00.000Z", profileSnapshot: null }),
    null
  ),
};
