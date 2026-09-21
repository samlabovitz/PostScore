# Smaller dashboard sections — English key list (translation reference)

Every key added by Step L6 (beat 1) to `lib/i18n/messages.ts`'s `en`
dictionary — the Overview, Connect-GBP, Reports, and Intake sections,
plus the `lib/reviews.ts` lib-sweep extraction. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything
here**. Values are copied verbatim from `lib/i18n/messages.ts`.
`{placeholder}` interpolations must be preserved, unchanged (including
surrounding punctuation/spacing), in any translation — only the
surrounding words should ever change. `PostScore` and `PostAI` are the
product's own names and are never translated in any locale.

Keys suffixed `.one`/`.other` are **plural pairs** resolved via
`tPlural()` (real `Intl.PluralRules` category selection) — both forms
must be translated together. Marked **[plural]** below.

**Update (beat 2, Part A):** reviewed Spanish values have been added for
every key in this file from beat 1 (Overview, Connect-GBP, Reports,
Intake, Common, and the `lib/reviews.ts` lib sweep) — `es` no longer
falls back to English for those. The two exceptions are
`dashboard.overview.scoreOutOf100WithGrade` and
`dashboard.overview.postAiOverlayTitle`, which were deliberately left
without an `es` entry (pure placeholder template / brand name) and
still fall back to English by design.

**Update (beat 2, Part B):** the three Reports child components
(`MonthlyRecapCard.tsx`, `MonthlyEmailReportCard.tsx`,
`ScoreHistoryChart.tsx`) — previously parked below as "combined size
exceeds threshold" — are now extracted and wired (see the new "Reports
children" section below). Their keys are new in this beat and `es` is
intentionally absent for all of them — they fall back to English via
`t()`/`tPlural()` until a future beat supplies reviewed Spanish. The
Reports section is now complete.

---

## Overview (`dashboard.overview.*`)

`app/business/[id]/page.tsx` (**server component** — wired via
`normalizeLocale(scored.business.language)` + `t()`), `BusinessScoreView.tsx`
(client, `useLocale()`), `ActionPlanSection.tsx` (client, `useLocale()`),
`components/dashboard/LocalBenchmarkTile.tsx` (client — added `"use client"`),
`components/gbp/LiveListingSection.tsx` (client — added `"use client"`),
`components/assistant/AssistantLauncher.tsx` (client, already `"use client"`).

`content.checks.*` (scoring-check labels/advice/explanations) and
`content.listingChange.*` (listing-change descriptions), both from L3,
keep flowing through unchanged in `ChangesFeed`/`ListingChangesFeed`/
`CategoryCard` — **not re-extracted here**.

```
dashboard.overview.assistantDataErrorFallback = "Couldn't load the assistant's grounding data."
dashboard.overview.categoryNotDeterminable = "Not yet determinable — nothing in this category has real data yet."
dashboard.overview.rescanTasksConfirmed.one = "{count} task confirmed (+{points} pts)"   [plural]
dashboard.overview.rescanTasksConfirmed.other = "{count} tasks confirmed (+{points} pts)"   [plural]
dashboard.overview.rescanTasksReopened.one = "{count} task back on your plan"   [plural]
dashboard.overview.rescanTasksReopened.other = "{count} tasks back on your plan"   [plural]
dashboard.overview.rescanListingChangesFound.one = "{count} listing change found"   [plural]
dashboard.overview.rescanListingChangesFound.other = "{count} listing changes found"   [plural]
dashboard.overview.rescanSummary = "Re-scanned — {parts}."
dashboard.overview.rescanNothingChanged = "Re-scanned — nothing changed since last scan."
dashboard.overview.rescanNoResultsError = "Couldn't find this listing on Google anymore — it may have been removed or merged into another listing."
dashboard.overview.rescanErrorFallback = "Could not re-scan this business."
dashboard.overview.rescanning = "Re-scanning..."
dashboard.overview.rescanNow = "Re-scan now"
dashboard.overview.gradeMeaningAriaLabel = "What does this grade mean?"
dashboard.overview.gradeRangesHeading = "Grade ranges"
dashboard.overview.sinceLastScanLabel = "Since last scan"
dashboard.overview.trackingStartsNow = "Tracking starts now — we'll show changes after your next scan."
dashboard.overview.noChange = "No change"
dashboard.overview.recentScansHeading = "Recent scans"
dashboard.overview.hoursLabel = "Hours"
dashboard.overview.googleMapsLabel = "Google Maps"
dashboard.overview.viewOnGoogleMaps = "View on Google Maps"
dashboard.overview.noPriorScanChanges = "No prior scan to compare yet — changes will show up here after your next scan."
dashboard.overview.scoringUpdatedBetweenScans = "Scoring was updated between these two scans ({previous} → {current}), so a check-by-check comparison isn't shown here — the total score above still reflects the real difference."
dashboard.overview.nothingChangedSinceLastScan = "Nothing changed since your last scan."
dashboard.overview.updatedPillLabel = "Updated"
dashboard.overview.noPriorScanListingChanges = "No prior scan to compare yet — real listing changes will show up here after your next re-scan."
dashboard.overview.predatesListingTracking = "Your last scan predates listing-change tracking — this will start working from your next re-scan."
dashboard.overview.nothingChangedOnListing = "Nothing changed on your listing since your last scan."
dashboard.overview.untitledBusiness = "Untitled business"
dashboard.overview.noAddressOnFile = "No address on file"
dashboard.overview.scoringVersionNote = "Scoring version {version} · computed live from the saved Google Places data below"
dashboard.overview.viewCompetitors = "View competitors"
dashboard.overview.currentScoreHeading = "Current score"
dashboard.overview.gradeLabel = "Grade"
dashboard.overview.projectedLabel = "Projected if all suggestions completed"
dashboard.overview.scoreOutOf100WithGrade = "/ 100 · {grade}"
dashboard.overview.seeActionPlan = "See your action plan →"
dashboard.overview.assistantUnavailablePrefix = "The assistant isn't available right now: {message}"
dashboard.overview.atAGlanceHeading = "At a glance"
dashboard.overview.googleRatingLabel = "Google rating"
dashboard.overview.googleReviewsLabel = "Google reviews"
dashboard.overview.businessListingHeading = "Business listing"
dashboard.overview.liveListingHeading = "Your live Google listing"
dashboard.overview.whatChangedHeading = "What changed since your last scan"
dashboard.overview.scoreImpactHeading = "Score impact since your last scan"
dashboard.overview.wherePointsAreHeading = "Where your points are"
dashboard.overview.detailedChecksHeading = "Detailed checks"
dashboard.overview.scanHistoryHeading = "Scan history"
dashboard.overview.noSavedScans = "No saved scans yet — click \"{rescanNow}\" above to record the current score."
dashboard.overview.dateColumn = "Date"
dashboard.overview.scoreColumn = "Score"
dashboard.overview.gradeColumn = "Grade"
dashboard.overview.versionColumn = "Version"
dashboard.overview.actionPlan.toDo = "To do"
dashboard.overview.actionPlan.completeThisWeek = "Complete this week"
dashboard.overview.actionPlan.inProgressFraction = "In progress ({gained} of {targetDelta})"
dashboard.overview.actionPlan.notQuiteYet = "Not quite yet"
dashboard.overview.actionPlan.inProgress = "In progress"
dashboard.overview.actionPlan.checkedWorse = "Checked — worse"
dashboard.overview.actionPlan.checkedNoChange = "Checked — no change"
dashboard.overview.actionPlan.checkedWithDate = "Checked {date}."
dashboard.overview.actionPlan.checkedNoDate = "Checked."
dashboard.overview.actionPlan.willCheckNextRescan = "We'll check this on your next re-scan."
dashboard.overview.actionPlan.doneThisWeek = "Done this week! You reached {current} reviews."
dashboard.overview.actionPlan.progressText = "Progress: {gained} of {targetDelta} new reviews ({current} so far, {remaining} to go)."
dashboard.overview.actionPlan.downTo = "Down to {current} reviews (was {baseline}) — give it another go this week."
dashboard.overview.actionPlan.stillAt = "Still {current} reviews — give it another go this week."
dashboard.overview.actionPlan.movedWrongWay = "This moved the wrong way."
dashboard.overview.actionPlan.realProgress = "Real progress — score points update automatically as the re-scan confirms it, never from clicking done."
dashboard.overview.actionPlan.noRealChangeYet = "No real change yet — this confirms gradually as the real number rises, not from one action alone."
dashboard.overview.actionPlan.googleStillDoesntShow = "Google still doesn't show this — double-check it saved, then re-scan again."
dashboard.overview.actionPlan.quickWin = "Quick win"
dashboard.overview.actionPlan.thisWeeksAction = "This week's action"
dashboard.overview.actionPlan.ongoingOutcome = "Ongoing outcome"
dashboard.overview.actionPlan.firstStep = "First step"
dashboard.overview.actionPlan.longerTerm = "Longer-term"
dashboard.overview.actionPlan.couldNotSave = "Could not save that — try again."
dashboard.overview.actionPlan.hideHowToFix = "Hide how to fix it"
dashboard.overview.actionPlan.howToFixIt = "How to fix it"
dashboard.overview.actionPlan.doThisLabel = "Do this: "
dashboard.overview.actionPlan.howLabel = "How: "
dashboard.overview.actionPlan.ownerActionOnGoogle = "This is a change you make yourself, on Google — PostScore can tell you exactly what to do, but we can't edit your listing for you."
dashboard.overview.actionPlan.saving = "Saving..."
dashboard.overview.actionPlan.didThisAgain = "I did this again"
dashboard.overview.actionPlan.didThis = "I did this"
dashboard.overview.actionPlan.pointsThisWeek = "~+{points} pts this week"
dashboard.overview.actionPlan.pointsUpTo = "Up to +{points} pts"
dashboard.overview.actionPlan.confirmedWinsHeading = "Confirmed wins"
dashboard.overview.actionPlan.pointsConfirmed = "+{points} pts confirmed"
dashboard.overview.localBenchmarkLabel = "Local benchmark"
dashboard.overview.saveScanToSeeRanking = "Save a competitor scan to see your local ranking →"
dashboard.overview.noComparablePeers = "No comparable {competitorNoun} found in your last scan."
dashboard.overview.rankOfPeerCount = "#{rank} of {peerCount}"
dashboard.overview.aheadOfNearby = "Ahead of {percentileAhead}% of {othersCount} nearby {competitorNoun}"
dashboard.overview.smallSampleSuffix = " — small sample"
dashboard.overview.profileChecklistTitle = "Profile-completeness checklist"
dashboard.overview.profileChecklistDescription = "Connect your Google Business Profile to see exactly which listing fields are missing, add fixes straight to your action plan, and track review recency from your real, live Google data."
dashboard.overview.gbpConnectedNotWiredUp = "Google Business Profile connected. Live field-by-field completeness isn't wired up yet — that's a later update, not something broken here. We'll show your real checklist here once it ships."
dashboard.overview.ptsAvailable = "+{points} pts available"
dashboard.overview.askPostAI = "Ask PostAI"
dashboard.overview.betaLabel = "Beta"
dashboard.overview.assistantPrompt = "Ask anything about your score, competitors, or what to fix next."
dashboard.overview.pastConversations.one = " {count} past conversation saved."   [plural — leading space preserved: appended directly after assistantPrompt with no separator]
dashboard.overview.pastConversations.other = " {count} past conversations saved."   [plural — leading space preserved]
dashboard.overview.postAiOverlayTitle = "PostAI"
```

Notes:
- `noSavedScans`'s `{rescanNow}` param is filled with the already-translated
  `dashboard.overview.rescanNow` value at render time, so the quoted phrase
  inside the sentence always matches the button label — never re-typed
  separately.
- `ptsAvailable` (in `LiveListingSection.tsx`) is currently unreachable in
  Phase 1 (`fields` is never passed non-null — see that file's own doc
  comment) but was extracted anyway for consistency, since it's real
  component code, not config.
- `dashboard.website.ptsAbbrev` (existing L5 key) is **reused** for every
  bare "pts" suffix in this section (`CategoryProgressRow`, `ChangesFeed`)
  rather than duplicated.

---

## Connect-GBP (`dashboard.connectGbp.*`)

`app/business/[id]/connect-gbp/ConnectGbpView.tsx` (client, already
`"use client"`) and `components/gbp/ConnectToUnlock.tsx` (client — added
`"use client"`). `page.tsx` has no copy of its own.

```
dashboard.connectGbp.unlockEditableListingTitle = "Live, editable listing"
dashboard.connectGbp.unlockEditableListingBody = "Update your hours, phone, and other listing fields from PostScore instead of Google directly."
dashboard.connectGbp.unlockCompletenessFixesTitle = "Profile-completeness fixes"
dashboard.connectGbp.unlockCompletenessFixesBody = "See exactly which listing fields are missing, and add each one straight to your action plan."
dashboard.connectGbp.unlockReviewRecencyTitle = "Review recency"
dashboard.connectGbp.unlockReviewRecencyBody = "Know how fresh your reviews really are, not just your total count."
dashboard.connectGbp.unlockReplyAssistantTitle = "Individual reviews + AI reply assistant"
dashboard.connectGbp.unlockReplyAssistantBody = "Read your actual reviews and get a drafted reply for each one, ready to post."
dashboard.connectGbp.unlockReplyRateStatsTitle = "Reply-rate stats"
dashboard.connectGbp.unlockReplyRateStatsBody = "Track how many of your reviews you've actually replied to."
dashboard.connectGbp.unlockInsightsLeadsTitle = "Insights + leads estimate"
dashboard.connectGbp.unlockInsightsLeadsBody = "Real views, calls, and clicks from your Google listing, and an estimated leads number built from them."
dashboard.connectGbp.unlockPostsTrackingTitle = "Google Posts tracking"
dashboard.connectGbp.unlockPostsTrackingBody = "See what you've posted to Google and how it's landing."
dashboard.connectGbp.disconnecting = "Disconnecting..."
dashboard.connectGbp.disconnect = "Disconnect"
dashboard.connectGbp.disconnectError = "Couldn't disconnect — try again."
dashboard.connectGbp.pageTitle = "Connect your Google Business Profile"
dashboard.connectGbp.pageSubtitle = "Connecting lets PostScore read (and, for some fields, edit) your real Google Business Profile — on top of the public listing data we already score today."
dashboard.connectGbp.justConnectedMessage = "Connected. We're still finishing Google's review process for full API access — the features below unlock as each one goes live, not all at once."
dashboard.connectGbp.connectedHeading = "Google Business Profile connected"
dashboard.connectGbp.sinceDate = "Since {date}."
dashboard.connectGbp.connectedFallback = "Connected."
dashboard.connectGbp.notWiredUpSuffix = "Real listing/review/insights data isn't wired up yet — that's a later update, not something broken here."
dashboard.connectGbp.readyToConnectHeading = "Ready to connect?"
dashboard.connectGbp.oauthConfiguredBody = "You'll go to Google to approve access, then come back here. You can disconnect at any time."
dashboard.connectGbp.oauthNotConfiguredBody = "Google Business Profile connection isn't configured in this environment yet — check back soon."
dashboard.connectGbp.skipForNow = "Skip for now"
dashboard.connectGbp.connectToUnlock = "Connect to unlock"
dashboard.connectGbp.needsConnectedGbp = "Needs a connected Google Business Profile."
```

Notes:
- `sinceDate`'s `{date}` is now formatted via
  `new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" })`
  instead of the previously-hardcoded `toLocaleDateString("en-US", ...)` —
  verified byte-identical output for `en` (same locale-fix pattern as
  `formatCaptureDate` in L5).
- The "Connect Google Business Profile" button text is **not** duplicated
  here — both `ConnectGbpView.tsx` (two branches) and
  `ConnectToUnlockCard` in `ConnectToUnlock.tsx` reuse the shared
  `dashboard.common.connectGoogleBusinessProfile` key (see Common below).
- `ConnectGbpView.tsx`'s "Back to {name}" / "business" fallback reuses
  `dashboard.common.backTo` / `dashboard.common.businessFallback`.

---

## Reports (`dashboard.reports.*`)

`app/business/[id]/reports/ReportsView.tsx` — **was a server component
(no `"use client"`, no hooks); added `"use client"` + `useLocale()`** to
match every sibling View component's pattern, rather than prop-drilling
locale from `page.tsx`. `page.tsx` has no copy of its own.

```
dashboard.reports.pageTitle = "Reports & history"
dashboard.reports.subtitle = "Your real PostScore history — every number here comes from a scan you actually ran."
dashboard.reports.scoreOverTimeHeading = "Score over time"
dashboard.reports.monthlyRecapHeading = "Monthly recap"
dashboard.reports.whatWeveVerifiedHeading = "What we've verified"
```

(`dashboard.reports.recapDayCount` already existed from L3 — untouched.)

Notes:
- "Back to {name}" / "business" fallback reuses
  `dashboard.common.backTo` / `dashboard.common.businessFallback`.
- The `MonthlyRecapCard`'s `businessName ?? "Your business"` fallback now
  reuses `dashboard.common.businessNameFallback` instead of a new
  `dashboard.reports.*` key.
- `VerifiedFixesCard.tsx` was **not** touched directly (not explicitly
  named in this beat's Reports scope) — it benefits only transitively
  from `ConnectToUnlock.tsx`'s own fix, since it renders
  `ConnectToUnlockTile`.

### Reports children (`dashboard.reports.*`, beat 2 Part B)

`components/reports/MonthlyRecapCard.tsx`, `MonthlyEmailReportCard.tsx`,
and `ScoreHistoryChart.tsx` — all already `"use client"`. Each's own
hardcoded `"en-US"` date format was fixed to the active locale (same
`Intl.DateTimeFormat(locale, {...})` pattern as `ConnectGbpView.tsx`'s
`sinceDate` / L5's `formatCaptureDate`) — verified byte-identical `en`
output for all three option shapes (`month:"short"`/`"long"`, with and
without `year`). `ScoreHistoryChart.tsx`'s `daysAgoLabel()` manual
singular/plural branch is now a real `tPlural()`. `es` is absent for
every key below (falls back to English) — no Spanish supplied yet for
this part.

```
dashboard.reports.recapFirstScanMessage = "This is your first recorded scan — a recap will appear here once you have two."
dashboard.reports.recapWhatChangedHeading = "What changed"
dashboard.reports.recapChangesUnavailable = "One of these two scans predates listing-change tracking, so a real diff isn't available for this period."
dashboard.reports.recapNoChangesDetected = "No real listing changes were detected in this period."
dashboard.reports.recapPreparingDownload = "Preparing…"
dashboard.reports.recapDownloadButton = "Download"
dashboard.reports.recapShareButton = "Share"
dashboard.reports.recapImageError = "Couldn't generate image."
dashboard.reports.recapShareTitle = "{businessName} — PostScore recap"
dashboard.reports.recapShareText = "{businessName}'s PostScore {direction} {fromScore} → {toScore} ({dateRangeLabel})."
dashboard.reports.recapShareDropped = "dropped"
dashboard.reports.recapShareRose = "rose"
dashboard.reports.emailSaveError = "Couldn't save — try again."
dashboard.reports.monthlyEmailReportLabel = "Monthly email report"
dashboard.reports.onLabel = "On"
dashboard.reports.offLabel = "Off"
dashboard.reports.emailComingSoon = "Coming soon — a real monthly recap of your PostScore, emailed to you automatically."
dashboard.reports.emailOffMessage = "Off — you won't receive a monthly email report."
dashboard.reports.emailFirstReportBaseline = "On — your first report will be a baseline (no month-over-month comparison yet)."
dashboard.reports.emailLastSentNext = "Last sent {lastSent} · Next report around {nextReport}"
dashboard.reports.chartRangeWeekly = "Weekly"
dashboard.reports.chartRange6Months = "6 months"
dashboard.reports.chartRangeAllTime = "All time"
dashboard.reports.chartRangeLabelWeek = "the last week"
dashboard.reports.chartRangeLabel6Months = "the last 6 months"
dashboard.reports.chartRangeLabelAllTime = "all time"
dashboard.reports.chartToday = "Today"
dashboard.reports.chartDaysAgo.one = "1 day ago"   [plural]
dashboard.reports.chartDaysAgo.other = "{days} days ago"   [plural]
dashboard.reports.chartNoHistoryYet = "You haven't run a scan yet — re-scan from the Overview page to start your history."
dashboard.reports.chartNotEnoughHistory = "Not enough history yet — your chart fills in as you re-scan."
dashboard.reports.chartChangeLabel = "Change · {range}"
dashboard.reports.chartTotalScansLabel = "Total scans recorded"
dashboard.reports.chartLastScanLabel = "Last scan"
dashboard.reports.chartMoreEarlier = "+{count} earlier"
dashboard.reports.chartAriaLabel = "Score over time, {count} scans, from {from} to {to}"
```

Notes:
- `MonthlyRecapCard.tsx`'s "No change" (score-delta Pill) and
  `ScoreHistoryChart.tsx`'s "No change" (Change stat, when the range's
  delta is exactly 0) both **reuse** the existing
  `dashboard.overview.noChange` key rather than duplicating it —
  identical meaning and text, per the reuse rule. (A cross-namespace
  reuse, same precedent as `dashboard.website.ptsAbbrev` being reused in
  Overview.)
- `ScoreHistoryChart.tsx`'s own `<h3>` "Score over time" reuses the
  existing `dashboard.reports.scoreOverTimeHeading` key (added in beat 1
  for `ReportsView.tsx`'s `SectionHeading`) — not duplicated.
- `MonthlyEmailReportCard.tsx`'s "Monthly email report" label is used
  twice in that file (the eyebrow div and the `Toggle`'s `label` prop) —
  one key, `monthlyEmailReportLabel`, reused for both.
- With all three of these wired, **the Reports section is now
  complete** — no remaining un-extracted own copy in any file it
  renders.

---

## Intake (`dashboard.intake.*`)

`app/business/new/page.tsx` (**server component** — no business exists
yet at this stage, so it wires copy via `DEFAULT_LOCALE` explicitly,
with a comment explaining why) and `app/business/new/AddBusinessSearch.tsx`
(client, already `"use client"`). The `LanguageSelector` component itself
was left untouched (already works, per the task's note).

```
dashboard.intake.pageTitle = "Add a business"
dashboard.intake.pageSubtitle = "Search for your real Google Business Profile listing to start scoring it."
dashboard.intake.nameLabel = "Name"
dashboard.intake.categoryLabel = "Category"
dashboard.intake.languageLabel = "Language"
dashboard.intake.savedOpening = "Saved — opening…"
dashboard.intake.saving = "Saving..."
dashboard.intake.addThisBusiness = "Add this business"
dashboard.intake.sessionExpiredError = "Your session expired — log in again to save."
dashboard.intake.findBusinessHeading = "Find your business on Google"
dashboard.intake.businessNameFieldLabel = "Business name"
dashboard.intake.businessNamePlaceholder = "e.g. Blue Bottle Coffee"
dashboard.intake.locationFieldLabel = "City / location"
dashboard.intake.locationPlaceholder = "e.g. Oakland, CA"
dashboard.intake.searching = "Searching..."
dashboard.intake.searchButton = "Search"
dashboard.intake.searchFailedError = "The search failed — check your connection and try again."
dashboard.intake.resultHeading = "Result"
dashboard.intake.noMatchingBusiness = "No matching business found for that name and location. Try broadening the location or checking the spelling."
dashboard.intake.multipleMatches = "Found {count} possible matches. Pick the correct one:"
```

Note: `multipleMatches` is **not** a plural pair — the original source
has no singular/plural branch (`Found ${n} possible matches...` is always
rendered with the plural word "matches", even hypothetically at `n=1`,
since a single true match resolves to a different `status` before this
branch is reached). Preserved as-is, byte-for-byte, not "fixed" into a
`tPlural`.

---

## Common (`dashboard.common.*` additions)

New shared keys, added per this beat's explicit "reuse existing keys,
don't duplicate" instruction — used across Overview, Connect-GBP,
Reports, and Intake (all sections newly touched in this beat; L3–L5
files were **not** retroactively changed to use these).

```
dashboard.common.backTo = "Back to {name}"
dashboard.common.businessFallback = "business"
dashboard.common.businessNameFallback = "Your business"
dashboard.common.connectGoogleBusinessProfile = "Connect Google Business Profile"
dashboard.common.notAvailable = "Not available"
dashboard.common.addressLabel = "Address"
dashboard.common.phoneLabel = "Phone"
dashboard.common.ratingLabel = "Rating"
dashboard.common.reviewsLabel = "Reviews"
dashboard.common.websiteLabel = "Website"
```

Used by: `backTo`/`businessFallback` — `ConnectGbpView.tsx`,
`ReportsView.tsx`; `businessNameFallback` — `ReportsView.tsx`'s
`MonthlyRecapCard` call; `connectGoogleBusinessProfile` —
`ConnectGbpView.tsx` (both branches) and `ConnectToUnlock.tsx`'s
`ConnectToUnlockCard`; `notAvailable` — `BusinessScoreView.tsx`'s
`ListingCard` and `AddBusinessSearch.tsx`'s `Field`/candidate fallback;
`addressLabel`/`phoneLabel`/`ratingLabel`/`reviewsLabel`/`websiteLabel` —
`BusinessScoreView.tsx`'s `ListingCard` and `AddBusinessSearch.tsx`'s
`DetailsView` (both render the same real Google-listing fields, so the
labels are shared rather than duplicated per section).

---

## Lib sweep

### Extracted: `lib/reviews.ts`

`ratingCaption()` and `reviewCountCaption()` now take an optional
trailing `locale: Locale = DEFAULT_LOCALE` param (same pattern as
`scoreBusiness`/`redemptionLabel`) and are namespaced under the
**existing** `dashboard.websiteReviews.*` section — not a new
`dashboard.reviewsLib.*` — since `website-reviews/ReviewsView.tsx` is
the only place these render. The one call site (`ReviewsView.tsx`,
inside `ReviewSocialProof`, which already has `locale` in scope via
`useLocale()`) now passes `locale` explicitly. `lib/reviews.test.ts`'s
English-only assertions (no locale arg) still pass unchanged, via the
default param — verified with `npm run test` (251/251 passing).

```
dashboard.websiteReviews.ratingCaptionNoRating = "No rating yet — this fills in once your listing has reviews."
dashboard.websiteReviews.ratingCaptionAtTarget = "You're at {rating}★ — at or above the {target}+ most customers look for."
dashboard.websiteReviews.ratingCaptionBelowTarget = "You're at {rating}★ — aim for {target}+ to build stronger trust at a glance."
dashboard.websiteReviews.reviewCountCaptionNone = "No reviews yet — every review you get starts building this up."
dashboard.websiteReviews.reviewCountCaptionPassed = "You've passed {milestone} reviews — {reviewCount} total."
dashboard.websiteReviews.reviewCountCaptionRemaining.one = "{remaining} more review to reach {milestone}."   [plural]
dashboard.websiteReviews.reviewCountCaptionRemaining.other = "{remaining} more reviews to reach {milestone}."   [plural]
```

The manual ternary plural (`` review${remaining === 1 ? "" : "s"} ``)
that used to live in `reviewCountCaption()` is now a real `tPlural()`
call.

### Found via grep, parked (out of scope — not extracted this beat)

- **`lib/actionPlan.ts`'s `ACTION_PLAN_COPY`** (and its `FALLBACK_COPY`) —
  the `why`/`action`/`fix` text for all 14 checks (42 strings) plus the
  3-string fallback = **45 strings**, rendered directly by
  `ActionPlanSection.tsx`'s `TaskCard` (`task.why`, `task.action`,
  `task.fix`). This genuinely renders in the dashboard and would
  normally qualify for extraction — but it's a large, self-contained
  content dictionary structurally identical to L3's `content.checks.*`
  work, not "smaller section" chrome. Extracting it here would roughly
  double this beat's diff and mixes two different kinds of work.
  **Recommend a dedicated beat**, namespaced like L3
  (`content.actionPlan.<checkId>.why/action/fix`). `task.label` itself
  is unaffected — it already comes from `content.checks.*` (L3).
- ~~`components/reports/MonthlyRecapCard.tsx`, `MonthlyEmailReportCard.tsx`,
  `ScoreHistoryChart.tsx`~~ — **resolved in beat 2, Part B.** Originally
  parked here (combined ~37 strings, over the beat's ~25 threshold); see
  the "Reports children" section above for the full key list. Reports is
  now complete.
- `lib/coupons.ts:47`, `lib/reportsRecapImage.ts:158` — hardcoded
  `"en-US"` date formatting, but neither file renders in any of this
  beat's 4 sections (Growth/Website territory from L4/L5).
- `components/assistant/AssistantView.tsx` (515 lines) and
  `AssistantOverlay.tsx` (86 lines) — reachable from Overview via
  `AssistantLauncher.tsx`, but treated as out of scope: a full chat UI
  this large doesn't fit "anything else \[the Overview files\] render"
  read as direct lightweight children, and it's bigger than this whole
  beat's ~85-string Overview budget by itself. Recommend its own beat.
- `lib/starterSite.ts` — has its own manual plural and other copy, but
  is Website-section/L5 territory (config/generated-site output), not
  rendered by any of this beat's 4 sections.

---

## Ambiguous — needs review

None. Every string encountered in the 4 named sections' own files (plus
their direct child components) had a clear owner — either genuinely new
chrome (extracted above), already-localized content flowing through
unchanged (L3's `content.checks.*`/`content.listingChange.*`), or
explicitly out-of-scope data (bizProfiles/starterSite/customer-facing
output, none of which appears in these 4 sections).
