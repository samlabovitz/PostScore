# Review scoring — v1.12.0 plan

Rebuilt Oct 26, 2026 from the current code (`lib/scoring.ts` at `SCORING_VERSION = "1.11.0"`) and the decisions below. Three stages: measure first (no score changes), then the new checks and weights as **v1.12.0**, then a bulk re-scan.

---

## Where things stand today (v1.11.0)

| Category | Checks (max points) |
|---|---|
| **Visibility 40** | rating 16 · review count 18 · review recency 6 |
| **Listing 30** | phone 4 · address 4 · hours 4 · website link 4 · categories 4 · photos 4 · business status 6 |
| **Website 30** | unchanged by this plan |

- `visibility.review_recency` exists, but its input `mostRecentReviewDaysAgo` is always `null` (Place Details doesn't request `reviews`), so it's always excluded, and Visibility is renormalized over rating and count.
- Place Details (`DETAILS_FIELD_MASK`, `lib/google/places.ts`) has no `reviews`, `accessibilityOptions`, `paymentOptions`, `parkingOptions` or `pureServiceAreaBusiness`.
- `places_calls` (`supabase/places-calls.sql`) logs competitor scans and owner re-scans (`logOwnerRescan`, `lib/placesSearchBudget.server.ts`). It doesn't log every Place Details call: onboarding/add-business, the monthly job, `scripts/rescan-all.ts`, the website retry lookup, and the photos-only and websiteUri-only calls are missing.
- GBP Step 2 is live: for connected businesses, `gbp_connections` holds the reply counts (`lib/gbpReplyCounts.server.ts`, `lib/gbpReviewReplies.ts`):
  - recent window: `reviewsInWindow`, `replied`, `templatedShare`, `hasRecentReview`;
  - all-time (newest 500 at most): `allTimeReviews`, `allTimeReplied`, `allTimeCapped`.

  They run after connect and once per scan, and are shown to the owner but not scored.

---

## Stage 1 — measure (no score changes)

1. **Log every Place Details call.** Each call writes a `places_calls` row with its own `kind` (`onboarding`, `owner_rescan`, `monthly`, `rescan_all`, `website_retry`, `photos`, `website_only`, …).
2. **`PLACES_DETAILS_MONTHLY_CAP` (default 800).** Follow the existing cap pattern (`DEFAULT_…` constant + env override, like `lib/screenshotBudget.ts`). Over the cap, skip the call and keep the saved listing data. Never fail a scan; log the skip.
3. **Place Details only: add `accessibilityOptions` and `pureServiceAreaBusiness`** to `DETAILS_FIELD_MASK`. Don't add them to Nearby Search (competitors).
4. **Dry run of the new weights on every business → `~/Desktop/scoring-dry-run.md`.** Use the same approach as `~/Desktop/website-trust-dry-run.md`. For each business, show the v1.11.0 total, the v1.12.0 total, the change, and which checks moved. Summarize the biggest movers and the grade changes. Nothing is saved.

---

## Stage 2 — v1.12.0

### Review recency (`visibility.review_recency`, 6 pts)
- **Source:** reviews from Place Details only (not Nearby Search).
- **Full points** if any returned review is ≤ 90 days old.
- **Otherwise "couldn't confirm"** (excluded, not 0). Google returns at most 5 reviews, chosen by relevance rather than date, so their absence doesn't prove anything.
- **0 reviews on the listing = 0 points, verified.**
- **Store yes/no only** ("has a review in the last 90 days"). Never store review text, names, ratings or dates. The engine never reads the clock; the yes/no is computed at collection time and frozen into the input.
- **GBP connected:** use GBP `hasRecentReview` instead (verified both ways, since GBP sees every review).
- This replaces today's linear 90 → 730-day curve (`recencyFraction`).

### Customer details on your listing (new, Listing, 3 pts)
- **Three parts, one point each:** accessibility, payment and parking options on the listing.
- **Storefronts only.** `pureServiceAreaBusiness = true` excludes the check (not applicable, never 0).
- EN + ES label, explanation and advice, like every other check (`content.checks.*`).

### Replying to reviews (new, Visibility, 6 pts)
- **Recent window only:** reviews from the last 90 days, or the latest 20 if fewer (`reviewsInWindow`, `replied`).
- **Full credit at ≥ 80% replied.**
- **Templated replies are advice only.** The "Most of your replies use the same text" hint never costs points.
- **Not connected → excluded**, shown as "Connect Google to check this". Never 0, so not connecting never lowers the score.
- **Under 3 reviews in the window → excluded** ("Not enough recent reviews to check yet").
- **All-time counts are shown but never scored.**
- **Competitors and other businesses always get "not checked".** One owner's counts are never used for anyone else.

### Weights (v1.12.0)

| Category | Checks (max points) |
|---|---|
| **Visibility 40** | rating 14 · review count 14 · review recency 6 · replying to reviews 6 |
| **Listing 30** | phone 4 · address 4 · hours 4 · website link 4 · categories 3 · photos 4 · business status 4 · customer details 3 |
| **Website 30** | unchanged |

Changes from v1.11.0:
- rating 16 → 14 and review count 18 → 14;
- categories 4 → 3 and business status 6 → 4;
- new: replying to reviews 6 and customer details 3.

Grade thresholds are unchanged. The category weights still sum to 100, which the existing test already checks.

### Shipping
- **`SCORING_VERSION = "1.12.0"`.**
- **Owner "scoring updated" note (EN + ES):** reuse the existing notes (`dashboard.overview.scoringUpdatedBetweenScans`, `report.*.scoringUpdated`) plus one plain line on what changed (reviews: recency and replies; listing: customer details).
- **No recalculation of old scores.** Stored rows keep the version that produced them.
- **PostAI:** the facts block gets the new checks' real points and explanations through `checks` as usual. Reply counts stay labelled all-time vs recent. Never claim anything about Google ranking.

---

## Stage 3 — bulk re-scan

Run `scripts/rescan-all.ts` after v1.12.0 ships, inside `PLACES_DETAILS_MONTHLY_CAP`. Each re-scan also refreshes the GBP reply counts for connected businesses (once per scan).

---

## Open questions (decide before Stage 1)

1. **Fields for the dry run.** To simulate recency and customer details, Place Details must also return `reviews`, `paymentOptions` and `parkingOptions`. Stage 1 as written adds only `accessibilityOptions` and `pureServiceAreaBusiness`. Should those three also be added in Stage 1, or should the dry run treat those parts as "couldn't check"?
2. **Cost tier.** `reviews` and the accessibility, payment and parking options are Atmosphere fields, so they likely move Place Details to a higher SKU. Check Google's current pricing before Stage 1, and size `PLACES_DETAILS_MONTHLY_CAP` from it.
3. **Reply credit below 80%.** Proposed: proportional (`replyRate / 0.8 × 6`, rounded to 0.1). Confirm.
4. **Where the recency yes/no lives** for non-connected businesses. Proposed: a new `businesses` boolean in its own `supabase/*.sql` file.
