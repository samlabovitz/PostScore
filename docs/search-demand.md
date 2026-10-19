# Search demand

Premium feature. It shows how people find a business on Google, what they searched, how many of them acted, and how much searching happens in the business's area.

**Status:** plan and UI only. No live calls yet: the Google Business Profile connection isn't public, so `/business/[id]/search-demand` shows a locked preview built from `SEARCH_DEMAND_EXAMPLE`. Every card in it carries an "Example" badge, and an "Example" watermark covers the whole section. A connected business sees a "waiting for Google's numbers" state instead. Nothing is estimated in its place.

- Types and pure logic: `lib/gbp/searchDemand.ts`
- UI: `components/gbp/SearchDemandSection.tsx`
- Page: `app/business/[id]/search-demand/page.tsx`, linked from the 9th card on the Connect page

**Ground rules:**
- Never show a fake or sample number as if it were real. Example data appears only under the watermark.
- Google's hidden keyword counts are shown as "fewer than 15", never as a number.
- Area volumes are always labeled "estimate, not exact". They are shown as ranges when the source gives ranges.
- Never claim a number of "customers you're missing". The copy says "searches you could be showing up for".

---

## 1. Business Profile Performance API (per business, after connect)

The data is real, per location, and free. It uses the same OAuth connection as the rest of the Premium features (scope `https://www.googleapis.com/auth/business.manage`).

### 1a. Search keywords

`GET https://businessprofileperformance.googleapis.com/v1/locations/{locationId}/searchkeywords/impressions/monthly`

- **Parameters:** `monthlyRange.startMonth.{year,month}`, `monthlyRange.endMonth.{year,month}`, `pageSize` (≤ 100) and `pageToken`.
- **Response:** `searchKeywordsCounts[]`, each `{ searchKeyword, insightsValue }`.
  - `insightsValue` is either `{ value: "123" }` or `{ threshold: "15" }`.
  - The threshold form means Google hid a small count. `parseInsightsValue` maps it to `{ kind: "fewer_than", threshold: 15 }`, and the UI prints "fewer than 15".
- **One value per range:** the API sums the whole range into one value per keyword. To get the per-month trend:
  - On connect, backfill by calling once per month for the last 6 months.
  - After that, make one call a month, for the month that just ended. Google publishes a month's keywords a few days after the month ends.
- **Branded searches:** these include people searching the business's own name. `isBrandedKeyword` finds them, both for the "most people already know your name" tip and to pick the best keyword that isn't the name.

### 1b. Views and actions

`GET https://businessprofileperformance.googleapis.com/v1/locations/{locationId}:fetchMultiDailyMetricsTimeSeries`

The metrics PostScore reads are listed in `PERFORMANCE_METRICS`:

| Metric | Funnel step |
|---|---|
| `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`, `BUSINESS_IMPRESSIONS_MOBILE_SEARCH` | Seen on Google: Search |
| `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`, `BUSINESS_IMPRESSIONS_MOBILE_MAPS` | Seen on Google: Maps |
| `CALL_CLICKS` | Took action: calls |
| `WEBSITE_CLICKS` | Took action: website |
| `BUSINESS_DIRECTION_REQUESTS` | Took action: directions |

- **Values:** the API returns daily values. `bucketDaily(points, "weekly" | "monthly")` sums them into Monday-start weeks or calendar months.
- **Conversion:** `funnelOf` computes it as `actions ÷ views`. It is null when there were no views; it is never 0%.
- **Fetch schedule:** once a day per connected business. Store the daily rows so weeks and months can be rebuilt without refetching. Google's numbers lag a few days, so the newest week can be incomplete; label the period with its dates.
- **Quotas:** check the project's Performance API quota in Google Cloud before launch.

---

## 2. Area search volume (not from the Business Profile API)

The Business Profile API only knows the searches that showed this listing. It can't answer "how many people in Newark search *wine store near me*". That needs a keyword-volume source with city targeting.

**Search list per business type + city:** a short seed list per business profile (for example, liquor stores: `liquor store near me`, `wine store near me`, `liquor store {city}`, `best wine store {city} {state}`, `beer store near me`, …). Fill in the city and look up volumes for that city's location code.

### Option A: Google Ads API Keyword Planner (`KeywordPlanIdeaService`)

- **Cost:** no per-call fee.
- **Access:** needs a Google Ads manager account and a developer token approved for **Basic access**, with the "keyword research" permitted use.
  - New tokens are test-only, and calls on real accounts fail until approval.
  - Approval isn't guaranteed for a product that isn't managing ad campaigns.
- **Ranges, not numbers:** accounts without active ad spend get bucketed ranges such as **1K–10K**. A 10× range makes "Room to grow" nearly meaningless ("you showed up for 5–50% of searches").
- **Geography:** supports city-level geo targets.
- **Limits:** Basic access allows 15,000 operations a day, and keyword planning calls have their own tighter rate limits.
- **Cost at 1,000 businesses:** $0 in fees. The real costs are the approval process, keeping an Ads account in good standing, and possibly ad spend to unlock exact numbers.

### Option B: DataForSEO, Google Ads Search Volume (`/v3/keywords_data/google_ads/search_volume`)

- **Data:** the same underlying Google Ads data, but returned as one estimated monthly number per keyword, with 12–24 months of history. It accepts a city `location_code`.
- **Price:** about **$0.05 per task in the Standard queue** or **$0.075 per task live**. Up to 1,000 keywords fit in one task, so one task covers a whole business-type + city seed list.
- **Ideas:** to also discover terms that aren't on our seed list, add one "keywords for keywords" task at about the same price.
- **Account:** pay-as-you-go with a minimum deposit (about $50), and no approval process. Live mode is limited to 12 requests a minute, which doesn't matter for a monthly batch.
- **Confirm before launch:** DataForSEO's own pages disagree on details ($50 vs $60 per 1M keywords; Standard turnaround from 45 minutes to 3 hours; 12 vs 24 months of history). Re-check pricing before building.

### Cost at 1,000 businesses

| | Per refresh (one type + city) | 1,000 businesses, every pair unique (worst case) | Likely, with shared cache (~600 unique pairs) |
|---|---|---|---|
| DataForSEO Standard, volume only | $0.05 | **$50 / month** | ~$30 / month |
| DataForSEO Standard, volume + ideas | $0.10 | **$100 / month** | ~$60 / month |
| DataForSEO Live, volume + ideas | $0.15 | $150 / month | ~$90 / month |
| Keyword Planner | $0 | $0 (plus approval and Ads-account overhead) | $0 |

### Recommendation: DataForSEO, Standard queue

Use volume + ideas, with a **budget of up to $100 a month at 1,000 businesses** (about $0.10 per business per month, likely around $60 with cache sharing). Reasons:

- It gives one estimated number instead of a 10× range, so "Room to grow" means something.
- There's no developer-token approval that could be refused or revoked.
- The refresh is a monthly batch, so the cheaper Standard queue's delay doesn't matter.

Keep Keyword Planner as a fallback. The types already support both (`AreaVolume` is `range | estimate`, and `AreaSearchSource` names both), and the UI shows ranges as "1K–10K".

### Caching (keeps the cost above)

- **Cache key:** `areaSearchCacheKey(businessType, city, region)`, for example `liquor_store|newark|de`. Every business of the same type in the same city shares one row.
- **Lifetime:** reuse a row while `isAreaCacheFresh(fetchedAt)` holds (**30 days**, `AREA_SEARCH_CACHE_DAYS`).
  - Refresh lazily on the first page view after expiry, or in a nightly job that refreshes only the keys a Premium business uses.
- **Proposed table:** `area_search_cache(key text primary key, source text, business_type text, city text, region text, fetched_at timestamptz, searches jsonb)`. This is server-only, with no per-user RLS, because the rows are not personal data. No migration has been written yet; it will come as a SQL file when this goes live.
- **Spend guard:** a monthly cap, the same pattern as `lib/pagespeedBudget.ts`. When the cap is hit, serve the stale row with its date rather than calling again.

---

## 3. What the UI computes

| Card | Source | Notes |
|---|---|---|
| Your Google funnel | 1b | Seen (Search + Maps), then Took action (calls / website / directions); conversion = actions ÷ views. Weekly / monthly toggle. |
| What people searched to find you | 1a | Top 10 by latest month (`topKeywords`). Shows the count or "fewer than 15", a sparkline that breaks at hidden months, and a trend only when both months are exact (`keywordTrend`, ±10% counts as flat). |
| Searches in your area | 2 | Top searches for type + city: "Estimated monthly searches in {city} — estimate, not exact". Ranges are shown as ranges. |
| Room to grow | 1b + 2 | `visibilityShare(monthly views, area searches)`, worded "Your listing showed up for about X% of estimated local searches", with an Estimate pill and a caveat that views include name searches and searchers outside the area. Never a "customers you're missing" count. |
| How to show up for more | 1a + 2 | `seoTips`, up to 3, each built from a real keyword (see below). |

**Tips** (`seoTips`), each linking to a real check row:
- **`missing_term`:** a product word from a top area search that never brought up the listing, e.g. "wine" from "wine store near me". The tip says to add it to the business description and website, and links to Website → services page check.
- **`branded_heavy`:** at least 50% of exact impressions come from searches for the business's name. The tip says to list products in categories and description, and links to Overview → categories check.
- **`use_top_keyword`:** the best keyword that isn't the business's name. The tip says to use it on the homepage and services page, and links to Website → content check.
- **`near_me`:** a "near me" search appears in the area list. The tip says to keep hours, address and categories complete, and links to Overview → hours check.

---

## 4. Launch checklist

1. The Google connection goes live (`GBP_CONNECT_PUBLIC=true`, Premium checkout).
2. Request the Performance API in the Google Cloud project and confirm quotas.
3. Add tables for daily metrics, monthly keywords and `area_search_cache` (SQL file for review).
4. Build the daily sync job (1b) and the monthly keywords job (1a).
5. Open a DataForSEO account, store the key in env, wire the area lookup with the 30-day cache and spend cap, and get approval for the first paid calls.
6. On the page, switch the connected state from `awaiting` to `live` with real `SearchDemandData` (`example: false`). The `live` view refuses example data.
