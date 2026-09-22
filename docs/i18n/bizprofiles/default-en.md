# bizProfiles.default — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.default.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `pet_services`.


`bizProfileOptions.default.label` does **not** exist — the `default` business-type option's own `label` is a direct source-level reference to `bizProfiles.default.label` (see config/bizProfiles.ts's BUSINESS_TYPE_OPTIONS), not a duplicate key.

---

## Profile label

```
bizProfiles.default.label = "General Business"
```

## Competitor noun

```
bizProfiles.default.competitorNoun = "businesses"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.default.couponPresets.flat_off_purchase.label = "$10 off a $50+ purchase or visit"
bizProfiles.default.couponPresets.flat_off_purchase.description = "Works for almost any transaction-based business without assuming how you charge."
bizProfiles.default.couponPresets.pct_off_new_customer.label = "10% off for new customers"
bizProfiles.default.couponPresets.pct_off_new_customer.description = "A low-risk, universally understood way to convert a first-time visitor."
```

## Offer templates

```
bizProfiles.default.offerTemplates.welcome_offer.label = "New customer welcome offer"
bizProfiles.default.offerTemplates.welcome_offer.description = "Give first-time customers a clear reason to choose you over a competitor."
bizProfiles.default.offerTemplates.seasonal_special.label = "Seasonal special"
bizProfiles.default.offerTemplates.seasonal_special.description = "Tie a promotion to a real calendar moment relevant to your customers."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.default.couponAngles.firstTime = "10% off for new customers"
bizProfiles.default.couponAngles.seasonal = "Seasonal special — tied to what's happening this month"
bizProfiles.default.couponAngles.slowDay = "$10 off a $50+ purchase or visit on your slowest day of the week"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.default.growActions.action1 = "Ask happy customers for a Google review — it's the single highest-leverage thing most small businesses skip."
bizProfiles.default.growActions.action2 = "Keep your hours, phone number, and website current on your Google listing."
bizProfiles.default.growActions.action3 = "Add a few recent, real photos of your business."
bizProfiles.default.growActions.action4 = "Reply to every review you get, positive or negative — it's visible to every future customer."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.default.faq.item1.question = "How can I contact {businessName}?"
bizProfiles.default.faq.item1.answer = "Call us or use the contact information on our Google listing."
bizProfiles.default.faq.item2.question = "What are {businessName}'s hours?"
bizProfiles.default.faq.item2.answer = "See our current hours on our Google Business Profile listing."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.default.referralPresets.credit_both.referrerReward = "$10 account credit"
bizProfiles.default.referralPresets.credit_both.friendReward = "$10 off their first purchase"
bizProfiles.default.referralPresets.credit_both.description = "Account credit keeps them coming back; works for almost any retail or transaction-based business."
bizProfiles.default.referralPresets.pct_off_both.referrerReward = "10% off your next purchase"
bizProfiles.default.referralPresets.pct_off_both.friendReward = "10% off their first purchase"
bizProfiles.default.referralPresets.pct_off_both.description = "A simple, universally understood reward for both sides."
```

## Pricing examples (Pricing page)

```
bizProfiles.default.pricingExamples.example1 = "Standard Service"
bizProfiles.default.pricingExamples.example2 = "Service Call"
bizProfiles.default.pricingExamples.example3 = "Product/Item"
```

## Pricing tips (Pricing page)

```
bizProfiles.default.pricingTips.anchor_pricing.label = "Anchor with your highest-priced option"
bizProfiles.default.pricingTips.anchor_pricing.description = "Showing your highest-priced option first makes your mid-tier option feel like the reasonable middle ground, even if few customers pick the anchor itself."
bizProfiles.default.pricingTips.good_better_best.label = "Offer a good/better/best tier"
bizProfiles.default.pricingTips.good_better_best.description = "A basic, a standard, and a premium option each give price-sensitive and premium customers a natural fit — one price is rarely right for both."
bizProfiles.default.pricingTips.raise_when_consistently_busy.label = "Raise prices on sustained demand, not a hunch"
bizProfiles.default.pricingTips.raise_when_consistently_busy.description = "Being consistently busy for weeks — not just one good week — is the honest signal you're underpriced, not how long it's been since your last increase."
bizProfiles.default.pricingTips.bundle_package.label = "Bundle or package related work"
bizProfiles.default.pricingTips.bundle_package.description = "Combining related services or items into one package price can lift your average sale without feeling like a price increase to the customer."
```
