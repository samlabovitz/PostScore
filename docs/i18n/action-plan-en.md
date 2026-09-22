# Action plan task copy — English key list (translation reference)

Every key added by Step L6.5 to `lib/i18n/messages.ts`'s `en`
dictionary — `lib/actionPlan.ts`'s `ACTION_PLAN_COPY` (all 15 checks,
including the two `weeklyAction` keys on `visibility.rating` and
`visibility.review_count`) and `FALLBACK_COPY`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything
here**. Values are copied verbatim from `lib/i18n/messages.ts`.
`{placeholder}` interpolations must be preserved, unchanged (including
surrounding punctuation/spacing), in any translation — only the
surrounding words should ever change. `PostScore` and `PostAI` are the
product's own names and are never translated in any locale. None of
these strings are templated or count-bearing — all 50 are static.

**Update:** reviewed Spanish values have been added for all 50 keys in
this file — `es` no longer falls back to English for any of them.

Rendered by `app/business/[id]/ActionPlanSection.tsx`'s `TaskCard`
(`task.why` / `task.action` / `task.fix`, and `task.weeklyTarget` /
`task.action` when overridden by `weeklyAction`), resolved in
`lib/actionPlan.ts`'s `buildActionPlan()`/`buildWeeklyPlan()` via a
`locale` parameter (default `DEFAULT_LOCALE`, threaded from
`app/actions/actionPlan.ts`'s `getActionPlan()`, itself passed
`normalizeLocale(scored.business.language)` from
`app/business/[id]/growth/page.tsx`).

---

## `visibility.rating`

```
content.actionPlan.visibility.rating.why = "Your star rating is often the first thing a potential customer sees — a stronger average rating directly raises the odds they pick you over a nearby competitor."
content.actionPlan.visibility.rating.action = "Ask recent happy customers for a review, and reply to any negative ones so future customers see you take feedback seriously."
content.actionPlan.visibility.rating.fix = "Go to the Reviews page → use the "Get more reviews" section: download your front-desk QR code or copy your review link and share it with customers right after a good visit. A steady trickle beats one big batch."
content.actionPlan.visibility.rating.weeklyAction = "Ask 3-5 of your happiest recent customers for a Google review this week — fresh reviews are the fastest real lever on your rating."
```

## `visibility.review_count`

```
content.actionPlan.visibility.review_count.why = "More reviews means more social proof — customers trust a business with dozens of reviews far more than one with a handful, even at the same star rating."
content.actionPlan.visibility.review_count.action = "Make leaving a review as easy as possible, and ask consistently rather than just once."
content.actionPlan.visibility.review_count.fix = "Go to the Reviews page → "Get more reviews" section: copy your review link into receipts, follow-up texts, or emails, or print the front-desk QR code for checkout."
content.actionPlan.visibility.review_count.weeklyAction = "Ask 3-5 recent customers for a Google review this week — every real review adds up toward a stronger review base."
```

## `visibility.review_recency`

```
content.actionPlan.visibility.review_recency.why = "A steady stream of recent reviews signals an active, currently-trustworthy business — a rating built entirely on old reviews looks stale to customers and to Google."
content.actionPlan.visibility.review_recency.action = "Keep asking for reviews on an ongoing basis, not in one push."
content.actionPlan.visibility.review_recency.fix = "Go to the Reviews page → "Get more reviews" section and keep sharing your review link or QR code on an ongoing basis — a recurring reminder (weekly, or after every N customers) keeps new reviews coming in instead of stopping after one round."
```

## `completeness.phone`

```
content.actionPlan.completeness.phone.why = "A missing phone number is one of the fastest ways to lose a customer who's ready to call right now."
content.actionPlan.completeness.phone.action = "Add your business phone number to your Google Business Profile."
content.actionPlan.completeness.phone.fix = "In Google Business Profile: Edit profile → Contact information → Phone number."
```

## `completeness.address`

```
content.actionPlan.completeness.address.why = "Without a verified address, customers — and Google Maps — can't reliably find you, which can keep you out of local search results entirely."
content.actionPlan.completeness.address.action = "Add or correct your business address on Google Business Profile."
content.actionPlan.completeness.address.fix = "In Google Business Profile: Edit profile → Business information → Address."
```

## `completeness.hours`

```
content.actionPlan.completeness.hours.why = "Customers routinely check hours before visiting — if they're missing, many will just choose a competitor who's listed clearly."
content.actionPlan.completeness.hours.action = "Add your real business hours to Google Business Profile."
content.actionPlan.completeness.hours.fix = "In Google Business Profile: Edit profile → Business information → Hours. Fill in every day, including holiday hours if they differ."
```

## `completeness.website_link`

```
content.actionPlan.completeness.website_link.why = "Linking your website on your Google listing gives customers one more trusted way to learn more and convert, right from search results."
content.actionPlan.completeness.website_link.action = "Link your website URL on your Google Business Profile."
content.actionPlan.completeness.website_link.fix = "Don't have a site yet? Build one in minutes on the Website page's starter-site builder. Once you have a URL, add it to your Google Business Profile: Edit profile → Business information → Website."
```

## `completeness.categories`

```
content.actionPlan.completeness.categories.why = "Categories are how Google matches your listing to what people are actually searching for — more accurate categories mean more relevant searches you show up in."
content.actionPlan.completeness.categories.action = "Add or expand your business categories on Google Business Profile."
content.actionPlan.completeness.categories.fix = "In Google Business Profile: Edit profile → Business information → Category. Add every category that genuinely describes what you offer, with the most specific one as primary."
```

## `completeness.photos`

```
content.actionPlan.completeness.photos.why = "Listings with real photos get substantially more clicks and calls — photos are often a customer's first real impression of your business."
content.actionPlan.completeness.photos.action = "Add real, current photos of your business to Google Business Profile."
content.actionPlan.completeness.photos.fix = "In Google Business Profile: Photos → Add photos. Storefront, interior, team, and your products or work are the highest-impact shots."
```

## `completeness.business_status`

```
content.actionPlan.completeness.business_status.why = "If Google shows your listing as closed — temporarily or permanently — when you're actually open, customers won't even consider visiting."
content.actionPlan.completeness.business_status.action = "Verify your listing shows as Operational, and if it's wrong, ask Google to correct it."
content.actionPlan.completeness.business_status.fix = "In Google Business Profile, check your listing status. Use "Reopen this business" if it's marked closed in error, or file a reinstatement request if the listing was suspended."
```

## `website.has_website`

```
content.actionPlan.website.has_website.why = "A website is one of the strongest trust signals for a customer doing their research — without one, you're relying entirely on your Google listing to make the sale."
content.actionPlan.website.has_website.action = "Get a website up for your business, even a simple one."
content.actionPlan.website.has_website.fix = "Go to the Website page → use the starter-site builder: it turns your real Google listing data (hours, services, photos) into a live one-page site in minutes, no design work needed. Want something more custom later? A builder like Squarespace or Wix works too — but this gets you live today."
```

## `website.https`

```
content.actionPlan.website.https.why = "Browsers actively warn visitors when a site isn't secure, which erodes trust fast — HTTPS is a baseline expectation today, not a nice-to-have."
content.actionPlan.website.https.action = "Move your website to HTTPS."
content.actionPlan.website.https.fix = "Most hosts issue a free SSL certificate — check your hosting provider's dashboard for an "enable HTTPS" or "SSL" option, or ask whoever manages your site to turn it on."
```

## `website.performance_mobile`

```
content.actionPlan.website.performance_mobile.why = "A slow-loading site loses visitors before they ever see what you offer — and Google itself factors real-world site speed into search ranking."
content.actionPlan.website.performance_mobile.action = "Speed up your website, especially on mobile."
content.actionPlan.website.performance_mobile.fix = "Compress large images, remove unnecessary scripts/plugins, and use a fast host. PostScore's starter-site builder (Website page) generates a lightweight page that scores well on this by construction."
```

## `website.content_depth`

```
content.actionPlan.website.content_depth.why = "A bare, single-block page reads as unfinished to both visitors and Google — real content is what actually convinces someone to trust and choose you."
content.actionPlan.website.content_depth.action = "Build out real content on your site: a clear title, a meta description, a few genuine sections, and real text about what you offer."
content.actionPlan.website.content_depth.fix = "Go to the Website page → the starter-site builder already includes a title, meta description, mobile viewport tag, and real sections built from your Google listing data — a fast way to replace a thin page."
```

## `website.contact_conversion`

```
content.actionPlan.website.contact_conversion.why = "If a visitor can't immediately see how to reach you or what to do next, most will just leave instead of hunting for a contact method."
content.actionPlan.website.contact_conversion.action = "Add a real click-to-call phone or email link, and a clear call-to-action, to your website."
content.actionPlan.website.contact_conversion.fix = "Go to the Website page → the starter-site builder includes a click-to-call phone link and a clear call-to-action by default whenever a phone number is on file."
```

## `fallback` (any future check with no explicit copy above)

```
content.actionPlan.fallback.why = "Improving this check helps your overall PostScore."
content.actionPlan.fallback.action = "Review the explanation above and address the underlying gap."
content.actionPlan.fallback.fix = "See this check's explanation for exactly what's missing."
```
