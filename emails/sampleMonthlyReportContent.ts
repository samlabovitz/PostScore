// Sample data for previewing/testing MonthlyReportEmail against every
// honest state buildMonthlyReportContent() can produce. Every sample's
// `content` is built by calling the REAL pure function on hand-crafted
// but structurally real MonthlyReportScoreRow fixtures — never a
// hand-typed MonthlyReportContent object — so these can never drift from
// what the real builder actually produces.
import { buildMonthlyReportContent, type MonthlyReportScoreRow } from "@/lib/monthlyReport";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { scoreBusiness, type BusinessScoringInput } from "@/lib/scoring";
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

/** A real, imperfect BusinessScoringInput mirroring BASE_SNAPSHOT — the
 * site has no click-to-call link or call-to-action, a genuine real gap
 * (website.contact_conversion), so every sample's breakdown always has
 * at least one real thing for the closing focus section to surface —
 * exactly the way a real, not-flawless small business's scan would. */
function scoringInput(overrides: Partial<BusinessScoringInput> = {}): BusinessScoringInput {
  return {
    rating: BASE_SNAPSHOT.rating,
    reviewCount: BASE_SNAPSHOT.reviewCount,
    mostRecentReviewDaysAgo: null,
    phone: BASE_SNAPSHOT.phone,
    address: "44 Riverside Ave, Springfield",
    openingHours: BASE_SNAPSHOT.openingHours,
    website: BASE_SNAPSHOT.website,
    httpsStatus: "https",
    categories: BASE_SNAPSHOT.categories,
    primaryCategory: "Cafe",
    photoCount: BASE_SNAPSHOT.photoCount,
    businessStatus: BASE_SNAPSHOT.businessStatus,
    websiteAnalysis: {
      content: {
        hasTitle: true,
        hasMetaDescription: true,
        hasViewportTag: true,
        headingCount: 3,
        visibleTextLength: 500,
        hasPhoneLink: false,
        hasEmailLink: false,
        hasCtaText: false,
        isLikelyClientRenderedShell: false,
        renderedContentSignals: null,
      },
      mobilePerformanceScore: 92,
      screenshotUrl: null,
      additionalPages: [],
      lastScreenshotRefreshAt: null,
      hasAboutPage: true,
      hasServicesPage: true,
      checkedAt: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function scoreRow(overrides: Partial<MonthlyReportScoreRow> = {}): MonthlyReportScoreRow {
  return {
    id: "sample-score",
    total: 84,
    grade: "B",
    createdAt: "2026-09-01T00:00:00.000Z",
    profileSnapshot: BASE_SNAPSHOT,
    breakdown: scoreBusiness(scoringInput()),
    ...overrides,
  };
}

const UNSUBSCRIBE_URL_PLACEHOLDER = "https://postscore.app/unsubscribe?business=sample&token=PLACEHOLDER";

/** 1. A business's first-ever report — no baseline to compare against.
 * The closing focus section still draws on this scan's own real
 * breakdown (a real "biggest opportunity" pointer), even though there's
 * no month-over-month comparison to make yet. */
export const SAMPLE_BASELINE: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(null, scoreRow({ id: "current", total: 78, grade: "C" }), null),
};

/** 2. A quiet month — nothing measurable actually changed score/rating/
 * reviews-wise, but the real breakdown still has a real gap (contact &
 * conversion) and a real competitor review-count gap, so "steady" never
 * means "nothing to focus on" — those are different, honestly distinct
 * claims. */
export const SAMPLE_STEADY: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({ id: "baseline", createdAt: "2026-08-01T00:00:00.000Z" }),
    scoreRow({ id: "current", createdAt: "2026-09-01T00:00:00.000Z" }),
    {
      previous: { rank: 3, totalCompetitors: 9, topCompetitorReviewCount: null },
      current: { rank: 3, totalCompetitors: 9, topCompetitorReviewCount: 175 },
    }
  ),
};

/** 3. A genuinely good month — real improvement across every metric,
 * PLUS a real phone-number change (a genuine listing_issue pointer) and
 * a real competitor review-count gap — enough real facts to fill the
 * closing focus section entirely from data, with no general tip needed. */
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
      breakdown: scoreBusiness(scoringInput({ rating: 4.2, reviewCount: 118 })),
    }),
    scoreRow({
      id: "current",
      total: 84,
      grade: "B",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.6, reviewCount: 142, photoCount: 22, phone: "+1-555-201-4099" },
      breakdown: scoreBusiness(scoringInput({ rating: 4.6, reviewCount: 142 })),
    }),
    {
      previous: { rank: 5, totalCompetitors: 12, topCompetitorReviewCount: null },
      current: { rank: 2, totalCompetitors: 12, topCompetitorReviewCount: 190 },
    }
  ),
};

/** 4. Missing data — no competitor scan this period, and NEITHER scan
 * has a real profile snapshot (both predate that tracking, or the fetch
 * failed both times), so rating/review-count are genuinely unavailable,
 * not just "no prior value to compare." Score is still real either
 * way — a `scores` row always has one regardless of snapshot presence,
 * and so does its breakdown — here the current scan's business has no
 * website on file at all, so the ONE real, determinable gap is "Has a
 * website," leaving room for the section's one general tip. */
export const SAMPLE_MISSING_DATA: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({
      id: "baseline",
      total: 70,
      grade: "C",
      createdAt: "2026-08-01T00:00:00.000Z",
      profileSnapshot: null,
      breakdown: scoreBusiness(
        scoringInput({ website: null, httpsStatus: null, websiteAnalysis: null, rating: 4.3, reviewCount: 90 })
      ),
    }),
    scoreRow({
      id: "current",
      total: 85,
      grade: "B",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: null,
      breakdown: scoreBusiness(
        scoringInput({ website: null, httpsStatus: null, websiteAnalysis: null, rating: 4.5, reviewCount: 100 })
      ),
    }),
    null
  ),
};

/** 5. A genuine decline — real drops in score, rating, reviews, and
 * competitor rank, all real and un-softened, plus a supportive-but-
 * never-congratulatory earned tone note (see earnedTonePhrase in
 * MonthlyReportEmail.tsx). Not one of the original four honest states
 * buildMonthlyReportContent() distinguishes (a decline is just the
 * "update, not steady" case with negative deltas), but real and common
 * enough — and important enough for the tone guard specifically — to
 * get its own named sample rather than living only inline in a test. */
export const SAMPLE_DECLINE: MonthlyReportEmailProps = {
  businessName: "Riverside Cafe",
  reportDate: "2026-09-01T00:00:00.000Z",
  unsubscribeUrl: UNSUBSCRIBE_URL_PLACEHOLDER,
  content: buildMonthlyReportContent(
    scoreRow({
      id: "baseline",
      total: 88,
      grade: "B",
      createdAt: "2026-08-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.7, reviewCount: 100 },
      breakdown: scoreBusiness(scoringInput({ rating: 4.7, reviewCount: 100 })),
    }),
    scoreRow({
      id: "current",
      total: 74,
      grade: "C",
      createdAt: "2026-09-01T00:00:00.000Z",
      profileSnapshot: { ...BASE_SNAPSHOT, rating: 4.3, reviewCount: 95 },
      breakdown: scoreBusiness(scoringInput({ rating: 4.3, reviewCount: 95 })),
    }),
    {
      previous: { rank: 2, totalCompetitors: 10, topCompetitorReviewCount: null },
      current: { rank: 6, totalCompetitors: 10, topCompetitorReviewCount: 130 },
    }
  ),
};
