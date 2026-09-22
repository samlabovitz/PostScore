# bizProfiles.trades — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.trades.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `auto_repair`, `plumber`, `electrician`, `landscaper`, `cleaning_service`.

---

## Profile label

```
bizProfiles.trades.label = "Trades & Home Services"
```

## Competitor noun

```
bizProfiles.trades.competitorNoun = "service providers"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.trades.couponPresets.flat_off_first_call.label = "$25 off your first service call"
bizProfiles.trades.couponPresets.flat_off_first_call.description = "Removes the risk of trying a new provider for a job that's otherwise hard to price-shop."
bizProfiles.trades.couponPresets.seasonal_tuneup.label = "Seasonal tune-up special: $20 off an inspection or maintenance visit"
bizProfiles.trades.couponPresets.seasonal_tuneup.description = "Fills your slower season with real, useful maintenance work instead of sitting idle."
bizProfiles.trades.couponPresets.bundle_multiple_jobs.label = "10% off when you bundle two or more jobs in one visit"
bizProfiles.trades.couponPresets.bundle_multiple_jobs.description = "Rewards a bigger ticket per trip out, which is where your real margin is (less drive time per dollar billed)."
```

## Offer templates

```
bizProfiles.trades.offerTemplates.new_customer_first_call.label = "New customer special: $25 off your first service call"
bizProfiles.trades.offerTemplates.new_customer_first_call.description = "The single highest-converting offer for a trade — lowers the risk of trying someone new."
bizProfiles.trades.offerTemplates.seasonal_maintenance.label = "Seasonal maintenance special (e.g. AC tune-up before summer, furnace check before winter)"
bizProfiles.trades.offerTemplates.seasonal_maintenance.description = "Turns a predictable seasonal need into booked revenue before it becomes an emergency call."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.trades.couponAngles.firstTime = "New customer special: $25 off your first service call"
bizProfiles.trades.couponAngles.seasonal = "Seasonal tune-up special: $20 off an inspection before the season changes"
bizProfiles.trades.couponAngles.slowDay = "10% off service calls booked on weekday mornings"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.trades.growActions.action1 = "Ask every satisfied customer for a Google review right after the job's done."
bizProfiles.trades.growActions.action2 = "Post real before/after photos of completed jobs."
bizProfiles.trades.growActions.action3 = "Keep your service area and emergency-availability info current on your listing."
bizProfiles.trades.growActions.action4 = "Offer a seasonal tune-up special to fill your slower season with booked work."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.trades.faq.item1.question = "Does {businessName} offer emergency or same-day service?"
bizProfiles.trades.faq.item1.answer = "Call to check current availability for emergency or same-day appointments."
bizProfiles.trades.faq.item2.question = "What areas near {city} does {businessName} serve?"
bizProfiles.trades.faq.item2.answer = "We serve {city} and the surrounding area — call to confirm we cover your location."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.trades.referralPresets.flat_off_both.referrerReward = "$25 off your next service call"
bizProfiles.trades.referralPresets.flat_off_both.friendReward = "$25 off their first service call"
bizProfiles.trades.referralPresets.flat_off_both.description = "Straightforward cash-off for a straightforward service-call business."
bizProfiles.trades.referralPresets.pct_off_both.referrerReward = "10% off your next service"
bizProfiles.trades.referralPresets.pct_off_both.friendReward = "10% off their first service"
bizProfiles.trades.referralPresets.pct_off_both.description = "Scales with the job size instead of a flat amount that might be too small for a big job or too generous for a small one."
```

## Pricing examples (Pricing page)

```
bizProfiles.trades.pricingExamples.example1 = "Service Call"
bizProfiles.trades.pricingExamples.example2 = "Standard Job"
bizProfiles.trades.pricingExamples.example3 = "Seasonal Tune-Up"
```

## Pricing tips (Pricing page)

```
bizProfiles.trades.pricingTips.flat_vs_hourly.label = "Decide flat-rate vs. hourly per job type"
bizProfiles.trades.pricingTips.flat_vs_hourly.description = "A predictable job (a drain clog, an outlet swap) is a good flat-rate candidate; open-ended diagnostic work is better billed hourly so you're not eating the risk of the unknown."
bizProfiles.trades.pricingTips.travel_radius_pricing.label = "Price a trip charge for jobs outside your core area"
bizProfiles.trades.pricingTips.travel_radius_pricing.description = "A modest travel fee for farther jobs protects your margin without turning away work closer to home that doesn't need one."
bizProfiles.trades.pricingTips.seasonal_demand_pricing.label = "Raise prices in your peak season, discount your slow one"
bizProfiles.trades.pricingTips.seasonal_demand_pricing.description = "Demand for most trades swings hard by season — pricing flat all year leaves money on the table in peak months and idle capacity in slow ones."
bizProfiles.trades.pricingTips.bundle_multiple_jobs.label = "Bundle multiple jobs at one property"
bizProfiles.trades.pricingTips.bundle_multiple_jobs.description = "A small discount for handling two or three jobs in one visit still nets you more per hour than two separate trips."
```
