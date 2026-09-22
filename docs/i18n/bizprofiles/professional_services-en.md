# bizProfiles.professional_services — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.professional_services.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `accountant`.

---

## Profile label

```
bizProfiles.professional_services.label = "Accounting & Tax"
```

## Competitor noun

```
bizProfiles.professional_services.competitorNoun = "accounting firms"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.professional_services.couponPresets.free_consultation.label = "Free 30-minute initial consultation"
bizProfiles.professional_services.couponPresets.free_consultation.description = "Lowers the barrier to a first call for a prospect who isn't sure what they need yet."
bizProfiles.professional_services.couponPresets.flat_fee_package.label = "Flat-fee package for a simple return or bookkeeping setup"
bizProfiles.professional_services.couponPresets.flat_fee_package.description = "Gives a price-anxious prospective client a known cost instead of an open-ended hourly estimate."
bizProfiles.professional_services.couponPresets.new_client_pct.label = "10% off your first year of service"
bizProfiles.professional_services.couponPresets.new_client_pct.description = "A bounded discount that doesn't touch your ongoing engagement rate."
```

## Offer templates

```
bizProfiles.professional_services.offerTemplates.new_client_return_discount.label = "New client discount: $50 off your first tax return"
bizProfiles.professional_services.offerTemplates.new_client_return_discount.description = "A concrete, low-risk reason to switch from a prior preparer."
bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.label = "Bundle monthly bookkeeping and annual tax prep into one flat package price"
bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.description = "Packaging recurring and annual work together increases what a client books with you at once."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.professional_services.couponAngles.firstTime = "Free 30-minute initial consultation"
bizProfiles.professional_services.couponAngles.seasonal = "Tax season special: book your return early and save"
bizProfiles.professional_services.couponAngles.slowDay = "Flat-fee bookkeeping setup review, available this week"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.professional_services.growActions.action1 = "Ask satisfied clients for a Google review once their return or engagement is complete."
bizProfiles.professional_services.growActions.action2 = "Publish a short FAQ answering the tax/bookkeeping questions {city} clients actually ask."
bizProfiles.professional_services.growActions.action3 = "Keep your services and credentials current on your listing — clients compare this directly."
bizProfiles.professional_services.growActions.action4 = "Offer a free consultation to convert price-sensitive prospects who are still deciding."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.professional_services.faq.item1.question = "Does {businessName} offer a free consultation?"
bizProfiles.professional_services.faq.item1.answer = "Yes — call or use our contact form to schedule an initial consultation."
bizProfiles.professional_services.faq.item2.question = "What services does {businessName} provide?"
bizProfiles.professional_services.faq.item2.answer = "See our services page for the specific accounting and tax services we offer."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.professional_services.referralPresets.credit_both.referrerReward = "$25 credit toward your next invoice"
bizProfiles.professional_services.referralPresets.credit_both.friendReward = "$50 off their first service"
bizProfiles.professional_services.referralPresets.credit_both.description = "Invoice credit keeps the referrer engaged as an ongoing client rather than a one-time discount."
bizProfiles.professional_services.referralPresets.pct_off_both.referrerReward = "10% off your next year of service"
bizProfiles.professional_services.referralPresets.pct_off_both.friendReward = "10% off their first year"
bizProfiles.professional_services.referralPresets.pct_off_both.description = "Simple and proportional for an ongoing engagement rather than a one-off purchase."
```

## Pricing examples (Pricing page)

```
bizProfiles.professional_services.pricingExamples.example1 = "Individual Tax Return"
bizProfiles.professional_services.pricingExamples.example2 = "Business Tax Return"
bizProfiles.professional_services.pricingExamples.example3 = "Monthly Bookkeeping"
```

## Pricing tips (Pricing page)

```
bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.label = "Use flat fees for straightforward returns"
bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.description = "A known flat fee for a simple return removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust."
bizProfiles.professional_services.pricingTips.tiered_by_complexity.label = "Tier pricing by complexity, not by client"
bizProfiles.professional_services.pricingTips.tiered_by_complexity.description = "A simple/standard/complex return tier lets clients self-select based on their actual situation instead of one flat price under- or over-charging most of them."
bizProfiles.professional_services.pricingTips.retainer_for_ongoing.label = "Use a monthly retainer for ongoing bookkeeping"
bizProfiles.professional_services.pricingTips.retainer_for_ongoing.description = "A predictable monthly retainer for recurring bookkeeping work is easier for a client to budget for than variable hourly billing, and smooths your own revenue."
bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.label = "Raise rates when you're turning away work"
bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.description = "Consistently declining new engagements you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase."
```
