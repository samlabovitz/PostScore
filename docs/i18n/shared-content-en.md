# Shared content layer — English key list (translation reference)

Every key from `lib/i18n/messages.ts`'s `en` dictionary added by the
shared-content-layer extraction (Step L3, beat 1) — the strings shared
between the monthly report email and the dashboard, plus the render-site
plurals that were converted to `tPlural` along the way. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**.
Values are copied verbatim from `lib/i18n/messages.ts`. `{name}`
placeholders are interpolated at render time and must be preserved,
unchanged (including surrounding punctuation/spacing), in any
translation — only the surrounding words should ever change. `PostScore`
is the product's own brand name and is never translated in any locale.

Namespace: `content.*` keys are shared between the dashboard and the
email (extracted from `lib/scoring.ts` and `lib/profileChanges.ts`, both
locale-agnostic pure modules); `report.*` keys are email-only glue
(extracted from `lib/monthlyReport.ts`) — `report.fragment.*` and
`report.focus.label`/`report.focus.nothingNotable` already existed from
an earlier pass and are **not** repeated here (see
`emails/MonthlyReportEmail.tsx` and its own translated dictionary
entries). `dashboard.*` keys below are dashboard-render-site-only strings
that aren't shared with the email — new plural sites surfaced while
wiring the render sites listed in this step, not part of the three-file
extraction itself.

Every key suffixed `.one`/`.other` is a **plural pair** resolved via
`tPlural()` (real `Intl.PluralRules` category selection, not a hardcoded
`count === 1` check) — both forms must be translated together, and a
locale that ever needs more categories (e.g. "few"/"many") is supported
by the same mechanism without any code change.

---

## `lib/scoring.ts` — `content.checks.<id>.*`

Keyed by each scoring check's own stable `id` (e.g. `visibility.rating`).
`.label` and `.advice` are static; `.explanation.*` covers every distinct
templated variant a check's `evaluate()` can produce — plural pairs are
marked **[plural]**.

### `visibility.rating`

```
content.checks.visibility.rating.label = "Star rating"
content.checks.visibility.rating.advice = "Improve your average star rating — ask happy customers for reviews (more reviews also means your rating carries more weight) and follow up on negative ones."
content.checks.visibility.rating.explanation.noReviews = "No Google reviews yet — this is the biggest thing holding your visibility back."
content.checks.visibility.rating.explanation.notFound = "Google returned no star rating for this listing."
content.checks.visibility.rating.explanation.noReviewCountBackup = "Rated {rating}★ on Google, but Google didn't return a review count to back it up — shown at reduced confidence until review volume is verified."
content.checks.visibility.rating.explanation.lowConfidence.one = "Rated {rating}★ on Google, but based on only {count} review — as you gather more reviews, this rating will carry more weight toward your score."   [plural]
content.checks.visibility.rating.explanation.lowConfidence.other = "Rated {rating}★ on Google, but based on only {count} reviews — as you gather more reviews, this rating will carry more weight toward your score."   [plural]
content.checks.visibility.rating.explanation.confident = "Rated {rating}★ on Google."
```

### `visibility.review_count`

```
content.checks.visibility.review_count.label = "Review count"
content.checks.visibility.review_count.advice = "Get more Google reviews — ask recent customers directly, or add a review link to receipts and follow-up emails."
content.checks.visibility.review_count.explanation.zero = "0 reviews on Google — ask your customers for reviews to start building social proof."
content.checks.visibility.review_count.explanation.nonzero.one = "{count} review on Google (full credit at {saturation}+)."   [plural]
content.checks.visibility.review_count.explanation.nonzero.other = "{count} reviews on Google (full credit at {saturation}+)."   [plural]
```

### `visibility.review_recency`

```
content.checks.visibility.review_recency.label = "Review recency"
content.checks.visibility.review_recency.advice = "Keep reviews coming in regularly — recent activity signals to customers (and Google) that the business is active."
content.checks.visibility.review_recency.explanation.notCollected = "Review timestamps aren't collected by the current Google Places integration yet, so this check is excluded rather than scored as a failure."
content.checks.visibility.review_recency.explanation.recent = "Most recent review was {days} day(s) ago."
```

### `completeness.phone`

```
content.checks.completeness.phone.label = "Phone number"
content.checks.completeness.phone.advice = "Add a phone number to your Google Business Profile."
content.checks.completeness.phone.explanation.present = "Phone number is on the listing."
content.checks.completeness.phone.explanation.missing = "No phone number on the listing."
```

### `completeness.address`

```
content.checks.completeness.address.label = "Address"
content.checks.completeness.address.advice = "Add a complete, verified address to your Google Business Profile."
content.checks.completeness.address.explanation.present = "Address is on the listing."
content.checks.completeness.address.explanation.missing = "No address on the listing."
```

### `completeness.hours`

```
content.checks.completeness.hours.label = "Business hours"
content.checks.completeness.hours.advice = "Add your business hours to your Google Business Profile."
content.checks.completeness.hours.explanation.present = "Business hours are on the listing."
content.checks.completeness.hours.explanation.missing = "No business hours on the listing."
```

### `completeness.website_link`

```
content.checks.completeness.website_link.label = "Website link on listing"
content.checks.completeness.website_link.advice = "Link your website in your Google Business Profile."
content.checks.completeness.website_link.explanation.present = "Website is linked on the listing."
content.checks.completeness.website_link.explanation.missing = "No website linked on the listing."
```

### `completeness.categories`

```
content.checks.completeness.categories.label = "Categories"
content.checks.completeness.categories.advice = "Add business categories to your Google Business Profile so customers can find you by what you offer."
content.checks.completeness.categories.explanation.hasList.one = "{count} category on the listing."   [plural]
content.checks.completeness.categories.explanation.hasList.other = "{count} categories on the listing."   [plural]
content.checks.completeness.categories.explanation.primaryOnly = "No full category list, but a primary category (\"{category}\") is on file."
content.checks.completeness.categories.explanation.none = "No categories on the listing."
```

### `completeness.photos`

```
content.checks.completeness.photos.label = "Photos"
content.checks.completeness.photos.advice = "Add photos to your Google Business Profile — listings with photos get more engagement."
content.checks.completeness.photos.explanation.notFound = "Google returned no photo data for this listing."
content.checks.completeness.photos.explanation.has.one = "{count} photo on the listing."   [plural]
content.checks.completeness.photos.explanation.has.other = "{count} photos on the listing."   [plural]
content.checks.completeness.photos.explanation.none = "No photos on the listing."
```

### `completeness.business_status`

```
content.checks.completeness.business_status.label = "Operational status"
content.checks.completeness.business_status.advice = "Make sure your Google Business Profile shows as Operational."
content.checks.completeness.business_status.explanation.notFound = "Google returned no business status for this listing."
content.checks.completeness.business_status.explanation.operational = "Listing shows as Operational."
content.checks.completeness.business_status.explanation.closed = "Listing shows as {status}."
content.checks.completeness.business_status.explanation.unrecognized = "Listing has an unrecognized status (\"{status}\") — can't confidently score it."
```

`{status}` in `.closed` arrives already lowercased/de-underscored by
code (e.g. `"closed temporarily"`) — translate the template around it,
never the placeholder.

### `website.has_website`

```
content.checks.website.has_website.label = "Has a website"
content.checks.website.has_website.advice = "Get a website for your business — it's one of the biggest trust signals for potential customers."
content.checks.website.has_website.explanation.present = "Business has a website on file."
content.checks.website.has_website.explanation.missing = "No website on file."
```

### `website.https`

```
content.checks.website.https.label = "Uses HTTPS"
content.checks.website.https.advice = "Move your website to HTTPS — browsers flag non-HTTPS sites as \"not secure,\" which costs trust."
content.checks.website.https.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.https.explanation.https = "Confirmed by a live check: the site loads successfully over HTTPS."
content.checks.website.https.explanation.httpOnly = "Confirmed by a live check: the site only loads over HTTP — no working HTTPS was found."
content.checks.website.https.explanation.unreachable = "Couldn't verify HTTPS — a live check of this site timed out, hit a network error, or was blocked. Excluded from your score, not counted against you."
content.checks.website.https.explanation.notChecked = "HTTPS hasn't been checked for this site yet."
```

### `website.performance_mobile`

```
content.checks.website.performance_mobile.label = "Performance & mobile"
content.checks.website.performance_mobile.advice = "Speed up your site — compress images, use a fast static host, and cut unnecessary scripts. A lightweight page (like PostScore's starter site) loads fast by default."
content.checks.website.performance_mobile.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.performance_mobile.explanation.notAnalyzed = "This site hasn't been analyzed yet — re-scan to run a real PageSpeed check."
content.checks.website.performance_mobile.explanation.noScore = "Couldn't get a real PageSpeed score for this site — either PostScore's PageSpeed check isn't configured yet, or Google's PageSpeed Insights API couldn't complete the audit. Excluded from your score, not counted against you."
content.checks.website.performance_mobile.explanation.fast = "Fast on mobile — Google PageSpeed mobile performance score of {score}/100."
content.checks.website.performance_mobile.explanation.slowish = "Loads a bit slowly on mobile — Google PageSpeed mobile performance score of {score}/100."
content.checks.website.performance_mobile.explanation.slow = "Loads slowly on mobile — Google PageSpeed mobile performance score of only {score}/100."
```

### `website.content_depth`

The composed "client-rendered shell, recovered via PageSpeed" and
"content gaps" sentences are assembled in code from a base/template plus
a joined list of these small vocabulary phrases — translate each phrase
on its own; the join punctuation (`", "` / `"; "`) and overall sentence
order stay in code, unchanged.

```
content.checks.website.content_depth.label = "Content depth"
content.checks.website.content_depth.advice = "Build out real content — a title and meta description, a few real headings, and a genuine amount of text about what you offer. A single bare block reads as an unfinished site to visitors and to search engines."
content.checks.website.content_depth.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.content_depth.explanation.couldntRead = "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you."
content.checks.website.content_depth.explanation.notAnalyzed = "This site hasn't been analyzed yet — re-scan to check its real content."
content.checks.website.content_depth.explanation.clientRenderedShell = "Couldn't verify — this site renders its content with JavaScript, which our static check can't read. Excluded from your score, not counted against you."
content.checks.website.content_depth.explanation.recoveredBase = "This site renders its content with JavaScript — verified using Google's real rendered-page audit instead of a static fetch."
content.checks.website.content_depth.explanation.confirmedPresentTemplate = "Confirmed present: {items}."
content.checks.website.content_depth.explanation.confirmedMissingTemplate = "Confirmed missing: {items}."
content.checks.website.content_depth.explanation.recoveredNote = "Content depth/length couldn't be independently confirmed for this site and isn't credited either way."
content.checks.website.content_depth.explanation.presentTitle = "a page title"
content.checks.website.content_depth.explanation.presentMeta = "a meta description"
content.checks.website.content_depth.explanation.presentViewport = "a mobile viewport tag"
content.checks.website.content_depth.explanation.presentHeadings = "real headings"
content.checks.website.content_depth.explanation.missingTitle = "no page title found"
content.checks.website.content_depth.explanation.missingMeta = "no meta description found"
content.checks.website.content_depth.explanation.missingViewport = "not mobile-optimized (no viewport tag)"
content.checks.website.content_depth.explanation.missingHeadings = "no real headings/sections"
content.checks.website.content_depth.explanation.allGood = "Real, substantial content: a title, meta description, headings, and a mobile viewport tag all present."
content.checks.website.content_depth.explanation.gapsTemplate = "Content gaps found: {items}."
content.checks.website.content_depth.explanation.gapNoTitle = "no page title"
content.checks.website.content_depth.explanation.gapNoMeta = "no meta description"
content.checks.website.content_depth.explanation.gapNoViewport = "not mobile-optimized (no viewport tag)"
content.checks.website.content_depth.explanation.gapNoHeadings = "no real headings/sections"
content.checks.website.content_depth.explanation.gapThinContent = "very little content — reads as a bare landing page"
```

Note: `gapNoViewport`/`missingViewport` and `gapNoHeadings`/`missingHeadings`
happen to share identical English text with their "recovered" counterparts
above — kept as separate keys (one per check-id/variant, per this
extraction's own rule) rather than merged, so translate both.

### `website.contact_conversion`

Same capitalize-first + `"; "`-join pattern as above for `noContact`/`noCta`
(code capitalizes each phrase's first letter when composing the sentence —
write these as plain lowercase phrases, same as the English).

```
content.checks.website.contact_conversion.label = "Contact & conversion"
content.checks.website.contact_conversion.advice = "Add a real click-to-call phone link or email address, and a clear call-to-action (e.g. \"Call now\" or \"Book an appointment\") — visitors shouldn't have to hunt for how to reach you."
content.checks.website.contact_conversion.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.contact_conversion.explanation.couldntRead = "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you."
content.checks.website.contact_conversion.explanation.notAnalyzed = "This site hasn't been analyzed yet — re-scan to check its real contact info and calls-to-action."
content.checks.website.contact_conversion.explanation.clientRenderedShell = "Couldn't verify — this site renders its content with JavaScript, which our static check can't read. Excluded from your score, not counted against you."
content.checks.website.contact_conversion.explanation.allGood = "A real contact link and a clear call-to-action are both present."
content.checks.website.contact_conversion.explanation.noContact = "no click-to-call phone or email link found"
content.checks.website.contact_conversion.explanation.noCta = "no clear call-to-action found"
```

### `website.about_presence`

```
content.checks.website.about_presence.label = "About / our story"
content.checks.website.about_presence.advice = "Add a real About or Our Story page (linked from your main navigation) — a short background/team page reassures visitors this is a real, established business."
content.checks.website.about_presence.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.about_presence.explanation.notAnalyzed = "This site hasn't been analyzed yet — re-scan to check its real navigation."
content.checks.website.about_presence.explanation.found = "Found a real About/Our Story page linked from this site's navigation or sitemap."
content.checks.website.about_presence.explanation.notFound = "Couldn't verify — no About/Our Story page was found in this site's navigation or sitemap. A single-page site may have this content on its homepage instead, which we can't detect. Excluded from your score, not counted against you."
```

### `website.services_presence`

```
content.checks.website.services_presence.label = "Services / products"
content.checks.website.services_presence.advice = "Add a real Services, Products, or Menu page (linked from your main navigation) — visitors and search engines both look for a clear list of what you offer."
content.checks.website.services_presence.explanation.noWebsite = "Not applicable — no website on file to check."
content.checks.website.services_presence.explanation.notAnalyzed = "This site hasn't been analyzed yet — re-scan to check its real navigation."
content.checks.website.services_presence.explanation.found = "Found a real Services/Products page linked from this site's navigation or sitemap."
content.checks.website.services_presence.explanation.notFound = "Couldn't verify — no Services/Products page was found in this site's navigation or sitemap. A single-page site may list these on its homepage instead, which we can't detect. Excluded from your score, not counted against you."
```

---

## `lib/profileChanges.ts` — `content.listingChange.<field>.*`

Keyed by field: `phone`, `website`, `hours`, `categories`, `photos`,
`rating`, `reviews`, `status`.

```
content.listingChange.phone.added = "A phone number was added to your listing."
content.listingChange.phone.removed = "The phone number was removed from your listing."
content.listingChange.phone.changed = "Your phone number changed."
content.listingChange.website.added = "A website was added to your listing."
content.listingChange.website.removed = "The website was removed from your listing."
content.listingChange.website.changed = "Your website URL changed."
content.listingChange.hours.added = "Hours were added to your listing."
content.listingChange.hours.removed = "Hours were removed from your listing."
content.listingChange.hours.changed = "Your hours changed."
content.listingChange.categories.addedPart = "added {list}"
content.listingChange.categories.removedPart = "removed {list}"
content.listingChange.categories.changed = "Your categories changed — {parts}."
content.listingChange.photos.added.one = "{count} photo added."   [plural]
content.listingChange.photos.added.other = "{count} photos added."   [plural]
content.listingChange.photos.removed.one = "A photo was removed."   [plural]
content.listingChange.photos.removed.other = "{count} photos were removed."   [plural]
content.listingChange.rating.rose = "Your rating rose from {previous}★ to {current}★."
content.listingChange.rating.dropped = "Your rating dropped from {previous}★ to {current}★."
content.listingChange.reviews.gained.one = "{count} new review."   [plural]
content.listingChange.reviews.gained.other = "{count} new reviews."   [plural]
content.listingChange.reviews.lost = "Your review count dropped by {count}."
content.listingChange.status.operational = "Operational"
content.listingChange.status.closedTemporarily = "Temporarily closed"
content.listingChange.status.closedPermanently = "Permanently closed"
content.listingChange.status.changed = "Your listing status changed from {previous} to {current}."
```

`{parts}` (categories.changed) is `addedPart`/`removedPart` already
joined with `"; "` by code — translate the two part-templates, not the
join punctuation. `{previous}`/`{current}` in `status.changed` are
whichever of `status.operational`/`closedTemporarily`/`closedPermanently`
applies — translate those three labels once, they're reused there.

---

## `lib/monthlyReport.ts` — `report.*` (email-only glue)

New keys only — `report.fragment.*` (score/grade/rating/reviews/
competitor/listing-count phrasing) and `report.focus.label`/
`report.focus.nothingNotable` already exist from an earlier pass and are
reused as-is by this file's `buildMovementSummary` (see
`emails/MonthlyReportEmail.tsx`'s own translated dictionary for those).

```
report.focus.biggestOpportunity = "Your biggest opportunity: {label} — {advice}"
report.focus.alsoWorthALook = "Also worth a look: {label} — {advice}"
report.focus.listingIssue = "Listing change worth a look: {description}"
report.focus.competitorGap.one = "The top-ranked business near you has {count} more review than you — closing that gap moves your ranking."   [plural]
report.focus.competitorGap.other = "The top-ranked business near you has {count} more reviews than you — closing that gap moves your ranking."   [plural]
report.focus.generalTip = "General tip: posting an update or offer to your Google Business Profile every so often helps keep your listing active in local search — this isn't something we currently measure, so treat it as general guidance, not a status report."
report.summary.reviewsGained.one = "{count} new review"   [plural]
report.summary.reviewsGained.other = "{count} new reviews"   [plural]
report.summary.reviewsLost = "your review count dropped by {count}"
report.summary.listingChanges.one = "{count} listing change detected"   [plural]
report.summary.listingChanges.other = "{count} listing changes detected"   [plural]
```

`{label}`/`{advice}` (the two focus-pointer prefixes) are themselves
already-localized `content.checks.<id>.label`/`.advice` values by the
time they're interpolated here — translating the prefix template is
enough; the label/advice text itself comes from the section above.

`report.summary.*` (reviewsGained/reviewsLost/listingChanges) power the
email's inbox-preview summary sentence (`content.summary`,
`buildMovementSummary`) — deliberately worded differently from the
similarly-named `report.fragment.reviewsGained`/`reviewsLost`/
`listingChanges` used by the on-page headline (`buildHeadline`); these
are two genuinely different sentences for two different surfaces, not a
duplicate to consolidate.

---

## Dashboard-only render-site strings (not shared with the email)

Surfaced while wiring the render sites this step touches
(`WebsiteScoreBreakdown.tsx`, `lib/actionPlan.ts`,
`MonthlyRecapCard.tsx`) — not part of the three-file extraction above,
but converted to `tPlural` alongside it per the same rule.

```
dashboard.website.excludedPoints.one = "{count} pt not yet verified, not counted for or against."   [plural]
dashboard.website.excludedPoints.other = "{count} pts not yet verified, not counted for or against."   [plural]
dashboard.website.allVerified = "Every website check has real, verified data."
dashboard.actionPlan.weeklyReviewTarget.one = "Get {count}+ new review this week ({before} → {after}+)"   [plural]
dashboard.actionPlan.weeklyReviewTarget.other = "Get {count}+ new reviews this week ({before} → {after}+)"   [plural]
dashboard.reports.recapDayCount.one = "{count} day"   [plural]
dashboard.reports.recapDayCount.other = "{count} days"   [plural]
```
