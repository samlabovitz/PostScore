# bizProfiles.cafe_bakery — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.cafe_bakery.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `cafe`, `bakery`.

---

## Profile label

```
bizProfiles.cafe_bakery.label = "Café & Bakery"
```

## Competitor noun

```
bizProfiles.cafe_bakery.competitorNoun = "cafes"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.cafe_bakery.couponPresets.flat_off_order.label = "$2 off any order of $10+"
bizProfiles.cafe_bakery.couponPresets.flat_off_order.description = "A low, easy threshold that fits a typical coffee-and-pastry order."
bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.label = "Free pastry or drink with any $15+ purchase"
bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.description = "Feels generous without discounting your core menu price."
bizProfiles.cafe_bakery.couponPresets.loyalty_punch.label = "Buy 9 drinks, get the 10th free"
bizProfiles.cafe_bakery.couponPresets.loyalty_punch.description = "The classic café loyalty structure — rewards habitual repeat visits."
```

## Offer templates

```
bizProfiles.cafe_bakery.offerTemplates.first_visit_special.label = "First-time customer: free drink or pastry with any purchase"
bizProfiles.cafe_bakery.offerTemplates.first_visit_special.description = "Removes the risk of trying somewhere new for their morning coffee run."
bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.label = "20% off orders before 9am"
bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.description = "Fills your early slow hours instead of discounting your rush."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.cafe_bakery.couponAngles.firstTime = "First-time customer: free drink or pastry with any purchase"
bizProfiles.cafe_bakery.couponAngles.seasonal = "Seasonal drink or pastry: try it this month, 15% off"
bizProfiles.cafe_bakery.couponAngles.slowDay = "20% off orders during your slowest afternoon hours"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.cafe_bakery.growActions.action1 = "Ask happy customers for a Google review before they leave."
bizProfiles.cafe_bakery.growActions.action2 = "Post daily photos of fresh pastries, seasonal drinks, and the space itself."
bizProfiles.cafe_bakery.growActions.action3 = "Keep your menu and prices current on your Google listing."
bizProfiles.cafe_bakery.growActions.action4 = "Run a loyalty punch card (physical or digital) to reward regulars."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.cafe_bakery.faq.item1.question = "Does {businessName} have Wi-Fi or seating to work from?"
bizProfiles.cafe_bakery.faq.item1.answer = "Yes — stop in and ask about seating and Wi-Fi availability."
bizProfiles.cafe_bakery.faq.item2.question = "Does {businessName} take special orders for cakes or catering?"
bizProfiles.cafe_bakery.faq.item2.answer = "Call or stop by to ask about special orders and catering."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.cafe_bakery.referralPresets.free_item_both.referrerReward = "A free drink or pastry on your next visit"
bizProfiles.cafe_bakery.referralPresets.free_item_both.friendReward = "A free drink or pastry on their first visit"
bizProfiles.cafe_bakery.referralPresets.free_item_both.description = "Free items cost less than a straight discount and feel generous to both sides."
bizProfiles.cafe_bakery.referralPresets.pct_off_both.referrerReward = "$5 off your next order"
bizProfiles.cafe_bakery.referralPresets.pct_off_both.friendReward = "15% off their first order"
bizProfiles.cafe_bakery.referralPresets.pct_off_both.description = "Straightforward cash-off for a typical coffee-shop order."
```

## Pricing examples (Pricing page)

```
bizProfiles.cafe_bakery.pricingExamples.example1 = "Coffee/Espresso Drink"
bizProfiles.cafe_bakery.pricingExamples.example2 = "Pastry/Baked Good"
bizProfiles.cafe_bakery.pricingExamples.example3 = "Sandwich or Light Bite"
```

## Pricing tips (Pricing page)

```
bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.label = "Anchor with a specialty or premium drink"
bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.description = "A $7 specialty latte on the board makes your $4.50 standard latte feel like the reasonable choice."
bizProfiles.cafe_bakery.pricingTips.bundle_combo.label = "Use combo pricing for a drink + pastry"
bizProfiles.cafe_bakery.pricingTips.bundle_combo.description = "A set combined price for a drink and a pastry lifts average ticket without feeling like a price hike."
bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.label = "Review prices as ingredient costs shift"
bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.description = "Coffee, dairy, and flour costs move often; check menu pricing against real costs on a schedule rather than by feel."
bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.label = "Use a loyalty punch card instead of blanket discounts"
bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.description = "Rewarding the 10th visit costs less over time than discounting every visit, and it drives repeat frequency specifically."
```
