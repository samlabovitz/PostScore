# Shared UI + Website + Website-reviews — English key list (translation reference)

Every key added by Step L5 (beat 1), from `lib/i18n/messages.ts`'s `en`
dictionary. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**.
Values are copied verbatim from `lib/i18n/messages.ts`. `{name}`
placeholders are interpolated at render time and must be preserved,
unchanged (including surrounding punctuation/spacing), in any
translation — only the surrounding words should ever change. `PostScore`
is the product's own brand name and is never translated in any locale.

Keys suffixed `.one`/`.other` are **plural pairs** resolved via
`tPlural()` (real `Intl.PluralRules` category selection) — both forms
must be translated together. Marked **[plural]** below.

Within a file, an identical string used at multiple JSX sites for the
same purpose was consolidated to one key (e.g. `starter.reset` covers
both "Reset" buttons in `StarterSiteBuilder.tsx`). Across *different*
files, identical English text still gets separate keys (e.g.
`website.collapsible.title` and `website.starter.eyebrow` are both
"Starter website generator" but are two different components' own copy)
— matching the pattern from the shared-content-layer and Growth steps.

---

## Part A — `dashboard.common.*` (app-wide shared UI)

`components/ui/CopyBlock.tsx`, `components/ui/Modal.tsx`,
`lib/promos.ts`'s `redemptionLabel()`.

```
dashboard.common.copyText = "Copy text"
dashboard.common.copied = "Copied"
dashboard.common.close = "Close"
dashboard.common.noRedemptionsLogged = "No redemptions logged yet"
dashboard.common.redemptionCount.one = "{count} redemption logged"   [plural]
dashboard.common.redemptionCount.other = "{count} redemptions logged"   [plural]
```

`redemptionLabel(count, locale)` now threads `locale` (default
`DEFAULT_LOCALE`); its two Growth call sites (`ActivePromotions.tsx`,
`ActiveReferral.tsx`) now pass their own `useLocale()` value.

---

## Part B — `dashboard.website.*` (Website section)

Pure extraction of the section's own chrome — **not** scoring-check
text (that stays on `content.checks.*`, L3) and **not**
`config/bizProfiles.ts` / `lib/starterSite.ts` preset data (see "Out of
scope" below). `excludedPoints`/`allVerified` already existed from L3
and are reused, not repeated here.

### `page.tsx` (server component — see "Server component" note below)

```
dashboard.website.backTo = "Back to {name}"
dashboard.website.businessFallback = "business"
dashboard.website.businessNameFallback = "Your business"
dashboard.website.pageTitle = "Website"
dashboard.website.faqDraftHeading = "FAQ draft"
dashboard.website.faqDraftIntro = "A starter FAQ for your website, based on what customers of this kind of business typically ask — publishing tools are still coming together, but you're welcome to copy this in today."
```

### `WebsiteVisualAnalysis.tsx`

```
dashboard.website.visualAnalysisHeading = "Visual analysis"
dashboard.website.visualAnalysisSubtitle = "What customers actually see when they visit your live site."
dashboard.website.refreshScreenshotsButton = "Refresh screenshots"
dashboard.website.refreshingScreenshots = "Refreshing..."
dashboard.website.refreshAvailableInError.one = "Screenshots refresh available in {count} day."   [plural]
dashboard.website.refreshAvailableInError.other = "Screenshots refresh available in {count} days."   [plural]
dashboard.website.noWebsiteToScreenshot = "This business has no website to screenshot."
dashboard.website.refreshErrorFallback = "Couldn't refresh screenshots — try again shortly."
dashboard.website.availableInDays.one = "Available in {count} day"   [plural]
dashboard.website.availableInDays.other = "Available in {count} days"   [plural]
dashboard.website.screenshotAlt = "Screenshot of the {label} page"
dashboard.website.tapToView = "Tap to view"
dashboard.website.couldntCapturePage = "Couldn't capture this page"
dashboard.website.prevPageAriaLabel = "Previous page"
dashboard.website.nextPageAriaLabel = "Next page"
dashboard.website.lightboxCouldntCapture = "We couldn't capture this page."
dashboard.website.lightboxPageCounter = "{current} of {total}"
dashboard.website.viewFullSizeAriaLabel = "View full-size homepage screenshot"
dashboard.website.homepageScreenshotAlt = "Screenshot of the business's live website"
dashboard.website.hideOtherPages = "Hide other pages"
dashboard.website.seeMorePages.one = "See {count} more page"   [plural]
dashboard.website.seeMorePages.other = "See {count} more pages"   [plural]
dashboard.website.noPreviewCaptured = "We couldn't capture a preview of this site."
dashboard.website.noPreviewCapturedNote = "Some sites block automated screenshot tools, or a preview hasn't been captured yet — this doesn't affect your Website score."
dashboard.website.screenshotsCaptured = "Screenshots captured {date}"
dashboard.website.homepageLabel = "Homepage"
```

`{label}` (screenshotAlt) is the real discovered page label from the
site's own nav/sitemap (`WebsiteAnalysisPage.label`) — genuine
third-party data, not translated. `{date}` (screenshotsCaptured) comes
from `formatCaptureDate()`, which now formats using the active locale
via `Intl.DateTimeFormat` instead of a hardcoded `"en-US"` — see "Locale
fix" below.

### `WebsiteScoreBreakdown.tsx` (new chrome only — `content.checks.*` untouched)

```
dashboard.website.scoreHeading = "Website score"
dashboard.website.ptsAbbrev = "pts"
dashboard.website.technicalHeading = "Technical"
dashboard.website.contentContactHeading = "Content & contact"
dashboard.website.couldntVerifyPrefix = "Couldn't verify —"
dashboard.website.lighthouseScoreLabel = "Lighthouse mobile score"
dashboard.website.signalTitle = "Title"
dashboard.website.signalMeta = "Meta description"
dashboard.website.signalViewport = "Viewport"
dashboard.website.signalHeadings = "Headings"
dashboard.website.outOf100 = "/ 100"
```

`signalTitle`/`signalMeta`/`signalViewport`/`signalHeadings` are this
component's own short chip labels (a badge grid) — distinct strings
from L3's `content.checks.website.content_depth.explanation.present*`
sentence fragments (e.g. "a page title"), which live in a composed
sentence, not a chip. No overlap despite the similar concept.

### `CollapsibleGenerator.tsx`

```
dashboard.website.collapsible.title = "Starter website generator"
dashboard.website.collapsible.subtitle = "— build a backup or fresh starting point from your real listing data"
dashboard.website.collapsible.hide = "Hide starter website generator"
```

### `StarterSiteBuilder.tsx` — `dashboard.website.starter.*`

```
dashboard.website.starter.taglineSizeSmall = "Small"
dashboard.website.starter.taglineSizeMedium = "Medium"
dashboard.website.starter.taglineSizeLarge = "Large"
dashboard.website.starter.placementBelow = "Below name"
dashboard.website.starter.placementAbove = "Above name"
dashboard.website.starter.notOnFile = "Not on file"
dashboard.website.starter.eyebrow = "Starter website generator"
dashboard.website.starter.headlineNoWebsite = "Turn your Google data into a real website"
dashboard.website.starter.headlineUnderperforming = "Your current site may be holding you back"
dashboard.website.starter.headlineBackup = "Build a backup starter site"
dashboard.website.starter.subcopyNoWebsite = "No website is one of the biggest gaps in your PostScore. This builds a real, mobile-friendly one-page site from your actual Google listing data — nothing invented."
dashboard.website.starter.subcopyUnderperforming = "Your website's real, measured PostScore is lower than what this free starter template would score for the same business — see the visual analysis above for exactly why. A clean rebuild could score better."
dashboard.website.starter.subcopyBackup = "You already have a website on file, so this is here if you ever want a simple backup or a fresh starting point — not something you need."
dashboard.website.starter.taglineLabel = "Tagline"
dashboard.website.starter.taglineOptionalHint = "(optional — write your own)"
dashboard.website.starter.taglinePlaceholder = "e.g. Fresh, fast, made-to-order"
dashboard.website.starter.taglineHelper = "Left blank, the site just won't show a tagline — we never write one for you."
dashboard.website.starter.taglineStyleLabel = "Tagline style"
dashboard.website.starter.taglineFontLabel = "Font"
dashboard.website.starter.taglineColorAriaLabel = "Tagline color"
dashboard.website.starter.colorLabel = "Color"
dashboard.website.starter.reset = "Reset"
dashboard.website.starter.sizeLabel = "Size"
dashboard.website.starter.placementLabel = "Placement"
dashboard.website.starter.colorThemeLabel = "Color theme"
dashboard.website.starter.customAccentAriaLabel = "Custom accent color"
dashboard.website.starter.customAccentSuffix = " · custom accent"
dashboard.website.starter.fontSectionLabel = "Font"
dashboard.website.starter.photosLabel = "Photos"
dashboard.website.starter.photosOptionalHint = "(optional — your own photos)"
dashboard.website.starter.photosHelper = "Embedded directly in the downloaded file — each photo adds to its size, so a few good ones go further than many."
dashboard.website.starter.heroPhotoLabel = "Hero photo"
dashboard.website.starter.removePhoto = "Remove"
dashboard.website.starter.uploadHeroPhoto = "Upload a hero photo"
dashboard.website.starter.contentPhotosLabel = "Content photos ({current}/{max})"
dashboard.website.starter.removePhotoAriaLabel = "Remove photo"
dashboard.website.starter.photoErrorFallback = "Couldn't process that photo — try a different image file."
dashboard.website.starter.whatToIncludeLabel = "What to include"
dashboard.website.starter.whatToIncludeHint = "(all from your real listing)"
dashboard.website.starter.includeAddress = "Address & map"
dashboard.website.starter.includePhone = "Phone (click-to-call)"
dashboard.website.starter.includeHours = "Hours"
dashboard.website.starter.includeRating = "Rating & reviews"
dashboard.website.starter.livePreviewLabel = "Live preview — exactly what you'll download"
dashboard.website.starter.iframeTitle = "Live preview of your starter site"
dashboard.website.starter.downloadSiteButton = "Download site (HTML)"
dashboard.website.starter.downloadHelper = "A single, real HTML file — the same one shown above, with your chosen color theme, font, tagline, and sections baked right in. Open it in any browser, or upload it to any host to make it live."
dashboard.website.starter.howToPublishHeading = "How to publish it"
dashboard.website.starter.publishStep1 = "1. Download the file above."
dashboard.website.starter.publishStep2Prefix = "2. Upload it as "
dashboard.website.starter.publishStep2Suffix = " to any static host — a free option like Netlify Drop or GitHub Pages, or your existing hosting/cPanel if you have one."
dashboard.website.starter.publishStep3 = "3. That gives you a real, public URL for the site."
dashboard.website.starter.publishStep4 = "4. Add that URL to your Google Business Profile's website field, then re-save this business from Google Places here so PostScore picks it up."
dashboard.website.starter.publishFootnote = "Downloading this file doesn't change your PostScore by itself — the Website points land only once the real site is live at a real URL, Google shows it on your listing, and a re-scan confirms it. That's the same honest rule every check on this app follows."
dashboard.website.starter.alreadyPublishedHeading = "Already published it?"
dashboard.website.starter.markedDoneStatus = "Marked as pending — we'll confirm it for real the next time we re-scan your listing."
dashboard.website.starter.notYetMarkedStatus = "This flags it on your action plan as pending — it still only completes once a re-scan verifies the real site."
dashboard.website.starter.markErrorFallback = "Couldn't save that — try again."
dashboard.website.starter.markSaving = "Saving..."
dashboard.website.starter.markMarked = "Marked"
dashboard.website.starter.markAsPublished = "Mark as published"
```

`publishStep2Prefix`/`publishStep2Suffix` wrap a literal, never-translated
`index.html` filename in code (`<span className="font-mono">index.html</span>`)
— prefix ends with a trailing space, suffix starts with one, reproducing
the original sentence's spacing exactly. `taglineFontLabel` (the small
label inside the tagline-style box) and `fontSectionLabel` (the site's
overall font picker) are two different settings that happen to share
the English word "Font" — kept as separate keys since they're distinct
form fields, unlike same-meaning duplicates elsewhere in this file.

---

## Part B — `dashboard.websiteReviews.*` (Website-reviews section)

### `ReviewsView.tsx`

```
dashboard.websiteReviews.backTo = "Back to {name}"
dashboard.websiteReviews.businessFallback = "business"
dashboard.websiteReviews.pageTitle = "Reviews & Replies"
dashboard.websiteReviews.subtitle = "Everything here is your real Google data, or clearly labeled as coming soon — nothing fabricated."
dashboard.websiteReviews.businessNameFallback = "Your business"
dashboard.websiteReviews.socialProofHeading = "Your review social proof"
dashboard.websiteReviews.avgRatingLabel = "Average rating"
dashboard.websiteReviews.reviewVolumeLabel = "Review volume"
dashboard.websiteReviews.ratingVolumeExplainer = "Rating and volume work together, not separately: a great rating from a handful of reviews doesn't carry much weight — customers (and Google) trust it more once it's backed by real volume. Building both together does more for how you're perceived than either alone."
dashboard.websiteReviews.forExampleLabel = "For example:"
dashboard.websiteReviews.exampleStrongTrust = "{target}★ from 200 reviews — strong trust"
dashboard.websiteReviews.exampleBuildingTrust = "{target}★ from 5 reviews — still building trust"
dashboard.websiteReviews.rubricHeading = "The rubric behind your review score"
dashboard.websiteReviews.replyAssistantLabel = "Reply assistant"
dashboard.websiteReviews.replyAssistantConnectedBody = "Your Google Business Profile is connected — reading your actual reviews and drafting replies is a later update, not live yet. Nothing fabricated in the meantime."
dashboard.websiteReviews.replyAssistantUnlockDescription = "Drafting replies to your actual reviews needs real Google Business Profile access — we only get your rating and review count today, not individual review content or authors. Connect your profile to unlock it."
dashboard.websiteReviews.comingSoonLabel = "Coming soon"
dashboard.websiteReviews.autoTextTitle = "Auto-text customers after their visit"
dashboard.websiteReviews.autoTextBody = "Automatically texting a review link after a visit needs a way to know who visited and when — we don't have that yet. For now, sharing the link or sign above is on you."
```

`{target}` (exampleStrongTrust/exampleBuildingTrust) is `RATING_TARGET`
(`lib/reviews.ts`, currently `4.5`) — the literal counts "200"/"5" stay
hardcoded in the template, matching the source exactly.
`replyAssistantLabel` ("Reply assistant") is reused at all three JSX
sites that say it in this file (the section's own uppercase label, the
`ComingSoonCard` title prop, and the `ConnectToUnlockCard` title prop).
`comingSoonLabel` is likewise reused for both the bottom section's own
label and the small pill badge inside `ComingSoonCard`.

### `GetMoreReviews.tsx`

```
dashboard.websiteReviews.growthLeverEyebrow = "Growth lever"
dashboard.websiteReviews.growthLeverHeading = "Get more reviews — your #1 growth lever"
dashboard.websiteReviews.growthLeverIntro = "No matter your score, more reviews bring in more customers. Make leaving one effortless."
dashboard.websiteReviews.noPlaceIdMessage = "We don't have a Google place ID on file for this business yet, so we can't build a real review link. Re-save it from a fresh Google Places lookup to pick one up."
dashboard.websiteReviews.makeItEffortlessHeading = "Make it effortless"
dashboard.websiteReviews.shareableLinkLabel = "Shareable review link"
dashboard.websiteReviews.shareableLinkHelper = "Opens the real Google \"write a review\" screen for your listing. Text it to a customer, post it, or add it to a receipt or follow-up email — you send it yourself."
dashboard.websiteReviews.qrCodeLabel = "Front-desk QR code"
dashboard.websiteReviews.qrAlt = "Scan to leave a Google review"
dashboard.websiteReviews.downloadGenerating = "Generating..."
dashboard.websiteReviews.downloadButton = "Download"
dashboard.websiteReviews.downloadErrorFallback = "Could not generate the image — try again."
dashboard.websiteReviews.qrHelper = "A print-ready sign for your counter or window — you print and place it yourself."
```

`website-reviews/page.tsx` has no hardcoded copy of its own (pure
data-fetch + prop-passing) and contributes no keys.

---

## Server component note

`app/business/[id]/website/page.tsx` is an **async server component**
(no `"use client"`), unlike every other file touched in this step. It
can't call `useLocale()` (a client hook), so it computes locale the same
way `DashboardShell`/the monthly-report cron route do server-side:

```ts
const locale = normalizeLocale(data.language);
```

(`data.language` is the business's own real `language` column, already
selected by `getWebsitePageData()`.) It then calls `t(locale, key)`
directly — `t()` is a plain function, not a hook, so this works fine
outside a component tree with hooks. `app/business/[id]/website-reviews/page.tsx`
is also a server component but has no copy of its own, so it needed no
such wiring.

---

## Out of scope (observed, not extracted — lives outside the target files)

- **`lib/starterSite.ts`**: `STARTER_SITE_THEMES`/`STARTER_SITE_FONTS`
  preset labels (e.g. "Ink & Brass", "Classic — warm serif + clean
  sans") — a lib file, not one of the Website section's own component
  files; same treatment as `config/bizProfiles.ts` presets. Flows
  through `StarterSiteBuilder.tsx` as untouched data (`font.label`,
  `theme.label`).
- **`lib/reviews.ts`**: `ratingCaption()`/`reviewCountCaption()` build
  their own hardcoded English sentences (e.g. "You're at 4.5★ — at or
  above the 4.5+ most customers look for."). Not one of the two target
  folders; same treatment as L4's `lib/promos.ts` non-`redemptionLabel`
  functions.
- **`components/gbp/ConnectToUnlock.tsx`**: `ConnectToUnlockCard`'s own
  "Connect Google Business Profile" button text, and
  `ConnectToUnlockTile`'s "Connect to unlock" / "Needs a connected
  Google Business Profile." — a shared component outside
  `app/business/[id]/website*`, used by other sections too.
- **`StarterSiteBuilder.tsx`'s hero/content photo `alt` text** (decided —
  stays out of scope, not just deferred): `` alt: `${businessName} hero photo` ``
  and `` alt: `${businessName} photo` `` (in
  `handleHeroImageSelect`/`handleContentImageSelect`) are literal,
  hardcoded English owned by this component file, but their
  *destination* is the `alt` attribute baked into the **generated,
  downloadable starter-site HTML** the business owner publishes on their
  own domain (via `buildStarterSiteHtml` in `lib/starterSite.ts`), not
  PostScore's own dashboard UI — customer-facing output of the tool, not
  the tool's own interface. Left exactly as English/hardcoded, same as
  `lib/starterSite.ts`'s theme/font presets above.

`WebsiteVisualAnalysis.tsx`'s `formatCaptureDate()` is **no longer** in
this list — it was fixed (below), not left out of scope.

## Locale fix (not a translation — no new keys)

`WebsiteVisualAnalysis.tsx`'s `formatCaptureDate()` previously called
`toLocaleDateString("en-US", …)` with a hardcoded locale regardless of
the business's own. It now takes the active `Locale` and uses
`Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" })`,
the same approach `formatMonthLabel` (`lib/i18n/format.ts`) uses —
deliberately without `formatMonthLabel`'s `timeZone: "UTC"` pin, since
`lastScreenshotRefreshAt` is a real timestamp (not a UTC-midnight-only
date) and this keeps reading it in the browser's own timezone, exactly
as `toLocaleDateString` did before. For `locale: "en"` this produces
the byte-identical "Sep 11, 2026" style output as before (verified);
for `"es"` it now renders a real Spanish date instead of always English.
No new `dashboard.*` key — this is a formatting-utility fix, not
extracted string content.
