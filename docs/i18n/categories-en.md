# Score categories + check status — English key list (translation reference)

Two related fixes in one beat:

**A) `content.categories.*`** — `lib/scoring.ts`'s `CATEGORY_LABELS`, the
3 score category names, now resolved via the `locale` param
`scoreBusiness()` already had in scope (previously the one field in that
function ignoring it). Reviewed Spanish was supplied for these 3 and is
already in `messages.ts` — not repeated here since this doc is the
English reference list; see the diff for the `es` values.

**B) `dashboard.overview.*`** — the check-status confidence pills + the
category weight annotation in `components/scoring/CategoryCard.tsx`
(shared by 3 pages: Overview, Website, Reviews). `es` intentionally
absent for these 5 — falls back to English until reviewed Spanish is
supplied.

```
key = "full English value"
```

Do not translate anything in this file directly — it's a reference;
`{placeholder}` tokens must be preserved unchanged in any translation.

---

## A) `content.categories.*` (`lib/scoring.ts` CATEGORY_LABELS)

```
content.categories.visibility = "Visibility & Reputation"
content.categories.completeness = "Google Listing Completeness"
content.categories.website = "Website"
```

Every reader now goes through `locale`:
- `lib/scoring.ts:1484` — `scoreBusiness()`'s own `category.label` assignment (was the one field in this function ignoring the `locale` param it already had).
- `lib/assistant.ts` (`buildAssistantContextText`, losing-checks bracket) — function gained a `locale: Locale = DEFAULT_LOCALE` param; its one call site (`app/actions/assistant.ts`) now passes `loaded.locale`.
- `lib/assistant.ts` (`buildAssistantStarterPrompts`, `whyCategoryLosingPoints`'s `{category}` interpolation) — already had `locale` in scope from Step L7 beat 3; just needed the `CATEGORY_LABELS` lookup wrapped in `t()`.

`context.score.categories[i].label` (used elsewhere in `buildAssistantContextText`'s "Category breakdown:" block) needed **no change** — it's already real, resolved text passed through from the live `breakdown` object, which now resolves correctly automatically once `scoreBusiness()` itself was fixed.

## B) `dashboard.overview.*` (check status labels — `CategoryCard.tsx`)

**The full confidence-label list** — 4 total, not 2. Grepped the whole codebase for `"Excluded"`/`"Not measured"`: neither exists anywhere as UI text, so there are no further siblings.

```
dashboard.overview.confidenceVerified = "Verified"
dashboard.overview.confidenceLikely = "Likely"
dashboard.overview.confidenceUncertain = "Uncertain"
dashboard.overview.confidenceNotFound = "Not found"
```

**Weight annotation:**

```
dashboard.overview.categoryWeightAnnotation = "(of {weight} weight)"
```

**Bonus fix, no new key:** `CategoryCard.tsx` also hardcoded a plain
`"pts"` suffix (line 47) — a duplicate of something already solved
next door in `BusinessScoreView.tsx`'s `CategoryProgressRow`, which
already resolves via the existing `dashboard.website.ptsAbbrev` key
(`en`/`es` both already `"pts"`). Rewired `CategoryCard.tsx` to reuse
that same key instead of duplicating it — no new key added for this
one.
