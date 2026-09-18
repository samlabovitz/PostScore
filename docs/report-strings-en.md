# Monthly report — English message catalog (translation reference)

Every English string moved out of `emails/MonthlyReportEmail.tsx` and into
`lib/i18n/messages.ts` as part of the i18n refactor, one per line as:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**.
Values are copied verbatim from `lib/i18n/messages.ts`'s `en` dictionary.
`{name}` placeholders are interpolated at render time (business names,
numbers, grades, etc.) and must be preserved, unchanged, in any
translation — only the surrounding words should ever change. `PostScore`
is the product's own brand name and is never translated in any locale.

Two of the five plural-aware groups below (`report.fragment.scoreRose`,
`report.fragment.scoreDropped`, `report.fragment.reviewsGained`,
`report.fragment.reviewsLost`, `report.fragment.listingChanges`) carry a
`.one` (singular) and `.other` (plural) form each, resolved at render time
via `Intl.PluralRules` — not a hardcoded `count === 1` check — so a future
locale needing more categories (e.g. "few"/"many") is supported by the
same mechanism.

## Subject / month heading

```
report.subject = "{businessName} — your {month} PostScore report"
report.monthHeadingSuffix = " report"
```

## Headline

```
report.headline.baseline = "Your baseline is set — welcome to PostScore. Here's where you stand today."
report.headline.steady = "A steady month — your presence held its ground."
common.and = "and"
```

## Tone

```
report.tone.positive = "Great progress this month."
report.tone.negative = "It happens — here's what to focus on to turn it around."
```

## Count/plural keys

```
report.fragment.scoreRose.one = "your score rose {count} point"
report.fragment.scoreRose.other = "your score rose {count} points"
report.fragment.scoreDropped.one = "your score dropped {count} point"
report.fragment.scoreDropped.other = "your score dropped {count} points"
report.fragment.reviewsGained.one = "you gained {count} review"
report.fragment.reviewsGained.other = "you gained {count} reviews"
report.fragment.reviewsLost.one = "you lost {count} review"
report.fragment.reviewsLost.other = "you lost {count} reviews"
report.fragment.listingChanges.one = "there was {count} listing change"
report.fragment.listingChanges.other = "there were {count} listing changes"
```

## Other headline fragments (no count)

```
report.fragment.gradeChanged = "your grade changed to {grade}"
report.fragment.ratingRose = "your rating rose to {value}★"
report.fragment.ratingDropped = "your rating dropped to {value}★"
report.fragment.competitorUp = "you moved up to #{rank} of {total}"
report.fragment.competitorDown = "you moved down to #{rank} of {total}"
```

## Honest/status lines — metric rows (Rating / Review count)

```
report.label.rating = "Rating"
report.label.reviewCount = "Review count"
report.unmeasured.rating = "this scan didn't include a real rating value."
report.unmeasured.reviewCount = "this scan didn't include a real review count."
report.metric.notMeasuredPrefix = "Not measured this period — "
report.metric.noPrior = "{value} (no prior report to compare against)"
report.metric.unchanged = "{value} — unchanged"
report.metric.delta = "{value} ({delta} vs. last report)"
```

## Score visual

```
report.score.summary = "{total}/100 · {grade}"
report.score.sinceLastReport = "{delta} since last report"
```

## Focus section

```
report.focus.label = "This month & what to focus on"
report.focus.nothingNotable = "Nothing notable to flag this month — your listing and site are in strong shape across the board."
```

## Honest/status lines — competitor section

```
report.competitorSection.label = "Competitor standing"
report.competitorSection.unavailable = "Not tracked this period — no competitor scan is available to compare."
report.competitorSection.rank = "#{rank} of {total} nearby"
report.competitorSection.same = "Same as your last report."
report.competitorSection.movedUp = "Moved up from #{rank} last report."
report.competitorSection.movedDown = "Moved down from #{rank} last report."
```

## Honest/status lines — listing section

```
report.listingSection.label = "Listing changes"
report.listingSection.unavailable = "Not available for this comparison — one of the two scans predates listing-change tracking, or this is your first report."
report.listingSection.none = "No other listing changes detected this month."
```

## Baseline note / footer

```
report.baselineNote = "This is your first PostScore report — a real baseline, not a trend. Next month's report will show real month-over-month change."
report.footer.enabledForPrefix = "You're receiving this because monthly email reports are on for "
report.footer.unsubscribeLinkText = "Unsubscribe from these reports"
```
