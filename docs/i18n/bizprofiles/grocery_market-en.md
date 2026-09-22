# bizProfiles.grocery_market — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.grocery_market.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

---

## Profile label

```
bizProfiles.grocery_market.label = "Grocery / Market"
```

## Competitor noun

```
bizProfiles.grocery_market.competitorNoun = "grocery stores"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.grocery_market.couponPresets.flat_off_basket.label = "$5 off a $40+ basket"
bizProfiles.grocery_market.couponPresets.flat_off_basket.description = "A threshold discount sized to your typical basket, not a single item."
bizProfiles.grocery_market.couponPresets.weekly_special.label = "This week's special: featured items discounted"
bizProfiles.grocery_market.couponPresets.weekly_special.description = "Keeps the store feeling fresh and gives shoppers a reason to check back weekly."
bizProfiles.grocery_market.couponPresets.loyalty_repeat.label = "Loyalty: every 10th shop, $10 off"
bizProfiles.grocery_market.couponPresets.loyalty_repeat.description = "Rewards shopping frequency directly — the real driver of grocery revenue."
```

## Offer templates

```
bizProfiles.grocery_market.offerTemplates.new_shopper_special.label = "New shopper special: $10 off your first $40+ order"
bizProfiles.grocery_market.offerTemplates.new_shopper_special.description = "Removes the risk of switching from wherever a shopper usually goes."
bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.label = "Seasonal produce sale: this week's fresh picks discounted"
bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.description = "Moves perishable inventory while it's at its best, and reads as genuinely fresh."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.grocery_market.couponAngles.firstTime = "New shopper special: $10 off your first $40+ order"
bizProfiles.grocery_market.couponAngles.seasonal = "Seasonal produce sale: this week's fresh picks discounted"
bizProfiles.grocery_market.couponAngles.slowDay = "$5 off a $40+ basket on your slowest shopping day"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.grocery_market.growActions.action1 = "Ask regular shoppers for a Google review at checkout."
bizProfiles.grocery_market.growActions.action2 = "Post real photos of fresh produce and this week's specials — food photos drive foot traffic."
bizProfiles.grocery_market.growActions.action3 = "Keep your weekly specials and hours current on your Google listing."
bizProfiles.grocery_market.growActions.action4 = "Start a simple loyalty program (e.g. every 10th shop, $10 off) to reward repeat shoppers."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.grocery_market.faq.item1.question = "Does {businessName} offer delivery or curbside pickup?"
bizProfiles.grocery_market.faq.item1.answer = "Call or check our website to see current delivery and pickup options."
bizProfiles.grocery_market.faq.item2.question = "What are {businessName}'s hours near {city}?"
bizProfiles.grocery_market.faq.item2.answer = "See our current hours on our Google Business Profile listing."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.grocery_market.referralPresets.credit_both.referrerReward = "$10 credit toward your next shop"
bizProfiles.grocery_market.referralPresets.credit_both.friendReward = "$10 off their first $40+ order"
bizProfiles.grocery_market.referralPresets.credit_both.description = "Store credit brings the referrer back for another shop, not just a one-time reward."
bizProfiles.grocery_market.referralPresets.pct_off_both.referrerReward = "10% off your next shop"
bizProfiles.grocery_market.referralPresets.pct_off_both.friendReward = "10% off their first shop"
bizProfiles.grocery_market.referralPresets.pct_off_both.description = "Simple and universally understood for a basket-based purchase."
```

## Pricing examples (Pricing page)

```
bizProfiles.grocery_market.pricingExamples.example1 = "Weekly Basket"
bizProfiles.grocery_market.pricingExamples.example2 = "Featured Special Item"
bizProfiles.grocery_market.pricingExamples.example3 = "Bulk/Case Item"
```

## Pricing tips (Pricing page)

```
bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.label = "Use weekly specials as loss leaders"
bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.description = "A few aggressively-priced staples each week pull shoppers in; the rest of their basket is where the real margin comes from."
bizProfiles.grocery_market.pricingTips.bulk_case_pricing.label = "Price bulk and case items to reward bigger baskets"
bizProfiles.grocery_market.pricingTips.bulk_case_pricing.description = "A modest per-unit discount on multi-packs increases average basket size without discounting everyday single items."
bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.label = "Adjust produce pricing to real seasonal supply costs"
bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.description = "Produce cost swings with the season — repricing it on a schedule protects margin better than a fixed year-round price."
bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.label = "Use loyalty rewards to raise visit frequency, not to discount margin"
bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.description = "A repeat-shop reward (every 10th visit, say) grows revenue by bringing shoppers back more often, rather than cutting the price of every visit."
```
