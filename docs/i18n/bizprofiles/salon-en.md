# bizProfiles.salon — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.salon.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `barbershop`, `spa`, `nail_salon`.


`bizProfileOptions.salon.label` does **not** exist — the `salon` business-type option's own `label` is a direct source-level reference to `bizProfiles.salon.label` (see config/bizProfiles.ts's BUSINESS_TYPE_OPTIONS), not a duplicate key.

---

## Profile label

```
bizProfiles.salon.label = "Salon & Personal Care"
```

## Competitor noun

```
bizProfiles.salon.competitorNoun = "salons"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.salon.couponPresets.pct_off_next_appt.label = "10% off your next appointment"
bizProfiles.salon.couponPresets.pct_off_next_appt.description = "A simple loyalty nudge — give it to anyone who books their next visit before leaving."
bizProfiles.salon.couponPresets.flat_off_rebook.label = "$15 off your next visit when you rebook today"
bizProfiles.salon.couponPresets.flat_off_rebook.description = "Rewards booking ahead specifically, which smooths out your schedule."
bizProfiles.salon.couponPresets.bring_a_friend.label = "Bring a friend: you both get 15% off"
bizProfiles.salon.couponPresets.bring_a_friend.description = "Turns an existing client into new foot traffic without any ad spend."
```

## Offer templates

```
bizProfiles.salon.offerTemplates.new_client_special.label = "New client special: 20% off your first appointment"
bizProfiles.salon.offerTemplates.new_client_special.description = "The single highest-converting offer for a service business — removes the risk of trying someone new."
bizProfiles.salon.offerTemplates.referral_credit.label = "Referral reward: $10 credit for you and your friend"
bizProfiles.salon.offerTemplates.referral_credit.description = "Pairs well with the coupon above — give both people a reason to act."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.salon.couponAngles.firstTime = "New client special: 20% off your first appointment"
bizProfiles.salon.couponAngles.seasonal = "Holiday styling special: book your seasonal look this week"
bizProfiles.salon.couponAngles.slowDay = "20% off Tuesday & Wednesday appointments"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.salon.growActions.action1 = "Ask every client at checkout for a Google review — the best time is right after a great appointment."
bizProfiles.salon.growActions.action2 = "Post real before/after photos weekly; personal-care listings live and die on photos."
bizProfiles.salon.growActions.action3 = "Offer a small rebooking discount right at checkout so the next visit gets locked in."
bizProfiles.salon.growActions.action4 = "Run a seasonal styling special around holidays or events people book ahead for."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.salon.faq.item1.question = "Do I need an appointment at {businessName}?"
bizProfiles.salon.faq.item1.answer = "We recommend booking ahead to guarantee your preferred time, though walk-ins may be available depending on the day."
bizProfiles.salon.faq.item2.question = "What areas does {businessName} serve near {city}?"
bizProfiles.salon.faq.item2.answer = "We're located in {city} and welcome clients from the surrounding area."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.salon.referralPresets.pct_off_both.referrerReward = "$15 off your next visit"
bizProfiles.salon.referralPresets.pct_off_both.friendReward = "20% off their first visit"
bizProfiles.salon.referralPresets.pct_off_both.description = "The classic salon referral — rewards loyalty and removes the risk of trying someone new."
bizProfiles.salon.referralPresets.free_addon.referrerReward = "A free add-on (blowout, brow wax, etc.) on your next visit"
bizProfiles.salon.referralPresets.free_addon.friendReward = "10% off their first appointment"
bizProfiles.salon.referralPresets.free_addon.description = "Costs you time and product, not cash — a good option if you'd rather not discount services directly."
```

## Pricing examples (Pricing page)

```
bizProfiles.salon.pricingExamples.example1 = "Women's Haircut"
bizProfiles.salon.pricingExamples.example2 = "Men's Haircut"
bizProfiles.salon.pricingExamples.example3 = "Color & Highlights"
```

## Pricing tips (Pricing page)

```
bizProfiles.salon.pricingTips.anchor_premium.label = "Anchor with your premium service"
bizProfiles.salon.pricingTips.anchor_premium.description = "List your most premium color or treatment service first on your menu — even clients who choose a basic cut anchor their expectations against it, making your mid-tier services feel reasonably priced by comparison."
bizProfiles.salon.pricingTips.consult_price_chemical.label = "Price chemical services by consultation"
bizProfiles.salon.pricingTips.consult_price_chemical.description = "Hair length and thickness vary enormously; a flat price for color or treatments either underpays you on thick, long hair or overprices thin, short hair. Quote those after a quick look, not off a fixed menu price."
bizProfiles.salon.pricingTips.good_better_best.label = "Offer a good/better/best tier"
bizProfiles.salon.pricingTips.good_better_best.description = "A basic blowout, a deluxe version, and a premium add-on let clients self-select their spend instead of you guessing one price that's wrong for everyone."
bizProfiles.salon.pricingTips.raise_when_booked_out.label = "Raise prices when you're consistently booked 1-2 weeks out"
bizProfiles.salon.pricingTips.raise_when_booked_out.description = "A steadily full calendar — not just a busy Saturday — is the honest signal you're underpriced relative to demand."
```
