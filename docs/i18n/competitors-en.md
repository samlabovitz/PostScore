# Competitors page — English key list (translation reference)

Every `dashboard.competitors.*` key from `lib/i18n/messages.ts`'s `en`
dictionary, one per line as:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**.
Values are copied verbatim from `lib/i18n/messages.ts`. `{name}`
placeholders are interpolated at render time and must be preserved,
unchanged, in any translation — only the surrounding words should ever
change. `PostScore` is the product's own brand name and is never
translated in any locale.

`dashboard.competitors.reviewCount` carries a `.one` (singular) and
`.other` (plural) form, resolved at render time via `Intl.PluralRules` —
not a hardcoded `count === 1` check — so a future locale needing more
categories (e.g. "few"/"many") is supported by the same mechanism.

## Headings / structure

```
dashboard.competitors.title = "Competitors"
dashboard.competitors.subtitle = "Real nearby {competitorNoun}{categoryClause}, scored with the same PostScore engine and ranked strictly by that score."
dashboard.competitors.categoryClause = " in the same category ({categoryLabel})"
dashboard.competitors.backTo = "Back to {name}"
dashboard.competitors.businessFallback = "business"
dashboard.competitors.rankedHeading = "Ranked by PostScore{rankSuffix}"
dashboard.competitors.rankSuffix = " — you're #{rank} of {total}"
dashboard.competitors.unscoredHeading = "Found nearby, but couldn't be scored"
dashboard.competitors.nothingToCompare = "Your PostScore ({total}) is shown above with nothing to compare it to yet — widen your search area or check back later as more listings appear nearby."
```

## Signal chips / card labels

```
dashboard.competitors.noRating = "No rating"
dashboard.competitors.reviewCount.one = "{count} review"
dashboard.competitors.reviewCount.other = "{count} reviews"
dashboard.competitors.noReviewCount = "No review count"
dashboard.competitors.hasWebsite = "Has website"
dashboard.competitors.noWebsite = "No website"
dashboard.competitors.milesSuffix = " mi"
dashboard.competitors.yourBusiness = "Your business"
dashboard.competitors.noAddress = "No address on file"
dashboard.competitors.postscoreOutOf100 = "PostScore / 100"
```

## Save-scan control

```
dashboard.competitors.savingScan = "Saving scan..."
dashboard.competitors.saveScan = "Save this scan to history"
dashboard.competitors.saved = "Saved."
dashboard.competitors.noComparableCompetitors = "Nothing to save — no comparable competitors were found."
dashboard.competitors.saveError = "Could not save this scan."
```
