# bizProfiles.liquor_wine — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.liquor_wine.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `liquor_store`.

---

## Profile label

```
bizProfiles.liquor_wine.label = "Liquor & Wine Store"
```

## Competitor noun

```
bizProfiles.liquor_wine.competitorNoun = "liquor stores"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.liquor_wine.couponPresets.flat_off_purchase.label = "$5 off a $30+ purchase"
bizProfiles.liquor_wine.couponPresets.flat_off_purchase.description = "A simple threshold discount that nudges a single-bottle visit into a bigger basket."
bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.label = "Buy 2 bottles, get 10% off"
bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.description = "Rewards buying more than one bottle without discounting your best sellers outright."
bizProfiles.liquor_wine.couponPresets.case_discount.label = "10% off when you buy a full case (12 bottles)"
bizProfiles.liquor_wine.couponPresets.case_discount.description = "Standard retail case-discount math — moves volume and rewards your best customers."
```

## Offer templates

```
bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.label = "Featured wine or spirit of the month: 15% off"
bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.description = "Gives repeat customers a reason to check back, and lets you move a specific bottle."
bizProfiles.liquor_wine.offerTemplates.new_customer_pct.label = "New customer: 10% off your first purchase"
bizProfiles.liquor_wine.offerTemplates.new_customer_pct.description = "Low-risk way to get a first-time shopper to choose you over a bigger chain store."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.liquor_wine.couponAngles.firstTime = "New customer: 10% off your first purchase"
bizProfiles.liquor_wine.couponAngles.seasonal = "Holiday case discount: 15% off mixed cases through New Year's"
bizProfiles.liquor_wine.couponAngles.slowDay = "10% off purchases on your slowest weekday"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.liquor_wine.growActions.action1 = "Ask regulars for a Google review at checkout — it's the fastest way to build trust with first-time shoppers."
bizProfiles.liquor_wine.growActions.action2 = "Post real photos of new arrivals, seasonal picks, and your featured bottle of the month."
bizProfiles.liquor_wine.growActions.action3 = "Highlight a weekly or monthly staff pick — gives repeat customers a reason to check back."
bizProfiles.liquor_wine.growActions.action4 = "Run a case-discount promotion around holidays (Thanksgiving, New Year's, summer cookouts) when case buying spikes."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.liquor_wine.faq.item1.question = "Does {businessName} offer tastings or take special orders?"
bizProfiles.liquor_wine.faq.item1.answer = "Call or stop by to ask about upcoming tastings and special-order requests."
bizProfiles.liquor_wine.faq.item2.question = "What are {businessName}'s hours near {city}?"
bizProfiles.liquor_wine.faq.item2.answer = "See our current hours on our Google Business Profile listing."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.liquor_wine.referralPresets.credit_both.referrerReward = "$5 credit toward your next purchase"
bizProfiles.liquor_wine.referralPresets.credit_both.friendReward = "$5 off their first purchase"
bizProfiles.liquor_wine.referralPresets.credit_both.description = "Simple cash-off works well for a straightforward retail purchase."
bizProfiles.liquor_wine.referralPresets.case_discount_referral.referrerReward = "10% off your next case"
bizProfiles.liquor_wine.referralPresets.case_discount_referral.friendReward = "10% off their first purchase"
bizProfiles.liquor_wine.referralPresets.case_discount_referral.description = "Rewards your best (case-buying) customers specifically for bringing in new ones."
```

## Pricing examples (Pricing page)

```
bizProfiles.liquor_wine.pricingExamples.example1 = "Bottle of Wine"
bizProfiles.liquor_wine.pricingExamples.example2 = "Six-Pack of Beer"
bizProfiles.liquor_wine.pricingExamples.example3 = "Case (12 bottles)"
```

## Pricing tips (Pricing page)

```
bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.label = "Use a few loss-leader items to drive traffic"
bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.description = "A handful of well-known, aggressively-priced bottles get people in the door; make it back on higher-margin wine and spirits they buy alongside them."
bizProfiles.liquor_wine.pricingTips.case_bulk_discount.label = "Price cases to reward bulk buying"
bizProfiles.liquor_wine.pricingTips.case_bulk_discount.description = "A standard 10-15% case discount is expected in this category — not offering one pushes case-sized purchases to a competitor who does."
bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.label = "Feature your best-margin bottles at eye level"
bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.description = "Placement and a "staff pick" tag lift sales on your best-margin bottles more effectively than discounting your worst-margin ones."
bizProfiles.liquor_wine.pricingTips.seasonal_pricing.label = "Plan promotions around real seasonal demand spikes"
bizProfiles.liquor_wine.pricingTips.seasonal_pricing.description = "Holidays, tailgate season, and summer cookouts are when case-sized purchases naturally happen — put your promotional budget there instead of spreading it evenly all year."
```
