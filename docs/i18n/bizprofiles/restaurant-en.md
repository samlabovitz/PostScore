# bizProfiles.restaurant — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.restaurant.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `bar`.


`bizProfileOptions.restaurant.label` does **not** exist — the `restaurant` business-type option's own `label` is a direct source-level reference to `bizProfiles.restaurant.label` (see config/bizProfiles.ts's BUSINESS_TYPE_OPTIONS), not a duplicate key.

---

## Profile label

```
bizProfiles.restaurant.label = "Restaurant & Food Service"
```

## Competitor noun

```
bizProfiles.restaurant.competitorNoun = "restaurants"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.restaurant.couponPresets.free_item_with_purchase.label = "Free appetizer or dessert with any entrée"
bizProfiles.restaurant.couponPresets.free_item_with_purchase.description = "Feels generous without discounting your core menu price."
bizProfiles.restaurant.couponPresets.pct_off_pickup.label = "15% off pickup or online orders"
bizProfiles.restaurant.couponPresets.pct_off_pickup.description = "Pushes traffic toward your cheapest-to-fulfill order channel."
bizProfiles.restaurant.couponPresets.bogo_entree.label = "Buy one entrée, get one 50% off (dine-in only)"
bizProfiles.restaurant.couponPresets.bogo_entree.description = "A classic slow-night traffic driver — restrict it to your quietest hours."
```

## Offer templates

```
bizProfiles.restaurant.offerTemplates.happy_hour.label = "Happy hour: 20% off drinks, 4–6pm"
bizProfiles.restaurant.offerTemplates.happy_hour.description = "Fills the gap between lunch and dinner rushes."
bizProfiles.restaurant.offerTemplates.first_online_order.label = "First-time online order: free delivery"
bizProfiles.restaurant.offerTemplates.first_online_order.description = "Removes the biggest friction point for a customer trying you for the first time."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.restaurant.couponAngles.firstTime = "First-time online order: free delivery"
bizProfiles.restaurant.couponAngles.seasonal = "Seasonal menu special: this month's feature, 15% off"
bizProfiles.restaurant.couponAngles.slowDay = "Buy one entrée, get one 50% off — dine-in, Sunday–Tuesday"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.restaurant.growActions.action1 = "Ask happy diners for a Google review before they leave, or on the receipt."
bizProfiles.restaurant.growActions.action2 = "Post daily or weekly specials as real photos — food photos are the single biggest driver of clicks."
bizProfiles.restaurant.growActions.action3 = "Make sure your menu and prices are current on your Google listing."
bizProfiles.restaurant.growActions.action4 = "Run a promotion on your slowest night of the week instead of discounting your busiest."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.restaurant.faq.item1.question = "Does {businessName} take reservations?"
bizProfiles.restaurant.faq.item1.answer = "Give us a call or check our website to see reservation availability."
bizProfiles.restaurant.faq.item2.question = "Does {businessName} offer takeout or delivery?"
bizProfiles.restaurant.faq.item2.answer = "Yes — order for pickup directly, or through your preferred delivery app."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.restaurant.referralPresets.free_item_both.referrerReward = "A free appetizer or dessert on your next visit"
bizProfiles.restaurant.referralPresets.free_item_both.friendReward = "A free appetizer or dessert on their first order"
bizProfiles.restaurant.referralPresets.free_item_both.description = "Free items cost less than a straight discount and feel generous to both sides."
bizProfiles.restaurant.referralPresets.pct_off_both.referrerReward = "$10 off your next order"
bizProfiles.restaurant.referralPresets.pct_off_both.friendReward = "15% off their first order"
bizProfiles.restaurant.referralPresets.pct_off_both.description = "Straightforward cash-off works well for takeout and delivery orders."
```

## Pricing examples (Pricing page)

```
bizProfiles.restaurant.pricingExamples.example1 = "Entrée"
bizProfiles.restaurant.pricingExamples.example2 = "Appetizer"
bizProfiles.restaurant.pricingExamples.example3 = "Dessert"
```

## Pricing tips (Pricing page)

```
bizProfiles.restaurant.pricingTips.anchor_standout_dish.label = "Anchor with one standout high-price dish"
bizProfiles.restaurant.pricingTips.anchor_standout_dish.description = "A single $32 entrée on the menu makes every $18-22 entrée look reasonable by comparison, even if few people actually order the anchor item itself."
bizProfiles.restaurant.pricingTips.steer_to_margin.label = "Steer orders to your best-margin items"
bizProfiles.restaurant.pricingTips.steer_to_margin.description = "Highlighting a strong-margin dish (bolding it, adding "chef's favorite") lifts orders toward it without discounting anything."
bizProfiles.restaurant.pricingTips.review_prices_periodically.label = "Review menu prices on a schedule, not by feel"
bizProfiles.restaurant.pricingTips.review_prices_periodically.description = "Many restaurants underprice for years because reprinting the menu feels like a hassle. A quarterly price review against your real food costs avoids slow margin erosion."
bizProfiles.restaurant.pricingTips.bundle_combo.label = "Use combo or bundle pricing"
bizProfiles.restaurant.pricingTips.bundle_combo.description = "Pairing an app or side with an entrée at a set combined price increases the average ticket without feeling like a price hike to the customer."
```
