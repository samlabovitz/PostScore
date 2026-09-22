# bizProfiles.retail — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.retail.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `hardware_store`, `florist`, `retail_boutique`.

---

## Profile label

```
bizProfiles.retail.label = "Retail Store"
```

## Competitor noun

```
bizProfiles.retail.competitorNoun = "retailers"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.retail.couponPresets.flat_off_threshold.label = "$10 off a $50+ purchase"
bizProfiles.retail.couponPresets.flat_off_threshold.description = "A threshold discount that nudges a smaller purchase into a bigger one."
bizProfiles.retail.couponPresets.bogo.label = "Buy one, get one 50% off select items"
bizProfiles.retail.couponPresets.bogo.description = "A classic retail traffic driver — great for moving seasonal or overstocked items."
bizProfiles.retail.couponPresets.bulk_discount.label = "10% off when you buy 3 or more"
bizProfiles.retail.couponPresets.bulk_discount.description = "Rewards a bigger basket without discounting a single-item purchase."
```

## Offer templates

```
bizProfiles.retail.offerTemplates.welcome_offer.label = "New customer welcome offer: 15% off your first purchase"
bizProfiles.retail.offerTemplates.welcome_offer.description = "Give first-time customers a clear reason to choose you over a competitor."
bizProfiles.retail.offerTemplates.seasonal_clearance.label = "Seasonal sale: discount last season's stock to make room for new arrivals"
bizProfiles.retail.offerTemplates.seasonal_clearance.description = "Moves aging inventory while giving repeat customers a reason to check back."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.retail.couponAngles.firstTime = "New customer welcome offer: 15% off your first purchase"
bizProfiles.retail.couponAngles.seasonal = "Seasonal sale — tied to the season or an upcoming holiday"
bizProfiles.retail.couponAngles.slowDay = "$10 off a $50+ purchase on your slowest shopping day"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.retail.growActions.action1 = "Ask happy customers for a Google review at checkout."
bizProfiles.retail.growActions.action2 = "Post real photos of new arrivals and in-store displays weekly."
bizProfiles.retail.growActions.action3 = "Keep your hours and current promotions up to date on your Google listing."
bizProfiles.retail.growActions.action4 = "Run a seasonal clearance sale to move older stock and highlight new arrivals."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.retail.faq.item1.question = "Does {businessName} accept returns or exchanges?"
bizProfiles.retail.faq.item1.answer = "Yes — ask about our return and exchange policy at checkout."
bizProfiles.retail.faq.item2.question = "What are {businessName}'s hours near {city}?"
bizProfiles.retail.faq.item2.answer = "See our current hours on our Google Business Profile listing."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.retail.referralPresets.credit_both.referrerReward = "$10 store credit"
bizProfiles.retail.referralPresets.credit_both.friendReward = "$10 off their first purchase"
bizProfiles.retail.referralPresets.credit_both.description = "Store credit keeps the referrer coming back rather than a one-time cash reward."
bizProfiles.retail.referralPresets.pct_off_both.referrerReward = "10% off your next purchase"
bizProfiles.retail.referralPresets.pct_off_both.friendReward = "15% off their first purchase"
bizProfiles.retail.referralPresets.pct_off_both.description = "Simple and universally understood for a straightforward retail purchase."
```

## Pricing examples (Pricing page)

```
bizProfiles.retail.pricingExamples.example1 = "Standard Item"
bizProfiles.retail.pricingExamples.example2 = "Featured/New Arrival"
bizProfiles.retail.pricingExamples.example3 = "Bulk/Multi-pack"
```

## Pricing tips (Pricing page)

```
bizProfiles.retail.pricingTips.anchor_pricing.label = "Anchor with your highest-priced item"
bizProfiles.retail.pricingTips.anchor_pricing.description = "Showing a premium option first makes your mid-tier items feel reasonably priced by comparison."
bizProfiles.retail.pricingTips.bulk_bundle_pricing.label = "Price bundles or multi-packs to increase average sale"
bizProfiles.retail.pricingTips.bulk_bundle_pricing.description = "A modest per-unit discount on a bundle lifts average sale size without discounting a single-item purchase."
bizProfiles.retail.pricingTips.seasonal_markdowns.label = "Plan a seasonal markdown schedule"
bizProfiles.retail.pricingTips.seasonal_markdowns.description = "A planned clearance cadence (end of season, holiday) protects margin better than ad hoc discounting whenever inventory feels stale."
bizProfiles.retail.pricingTips.raise_on_demand.label = "Raise prices on items that consistently sell out"
bizProfiles.retail.pricingTips.raise_on_demand.description = "An item that sells out every time you restock it is underpriced relative to real demand."
```
