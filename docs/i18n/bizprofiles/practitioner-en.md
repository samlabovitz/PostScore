# bizProfiles.practitioner — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.practitioner.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `real_estate`, `consultant`, `coach`, `tutor_education`, `photographer`.


`bizProfileOptions.practitioner.label` does **not** exist — the `practitioner` business-type option's own `label` is a direct source-level reference to `bizProfiles.practitioner.label` (see config/bizProfiles.ts's BUSINESS_TYPE_OPTIONS), not a duplicate key.

---

## Profile label

```
bizProfiles.practitioner.label = "Practitioner, Coaching & Classes"
```

## Competitor noun

```
bizProfiles.practitioner.competitorNoun = "practitioners"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.practitioner.couponPresets.pct_off_next_session.label = "10% off your next session or class"
bizProfiles.practitioner.couponPresets.pct_off_next_session.description = "The direct equivalent of a loyalty discount when there's no product to discount instead."
bizProfiles.practitioner.couponPresets.free_intro_consult.label = "Free consultation or intro session for new clients"
bizProfiles.practitioner.couponPresets.free_intro_consult.description = "Lets a new client experience your style before committing money."
bizProfiles.practitioner.couponPresets.class_pack_bonus.label = "Buy a 5-session pack, get 1 free"
bizProfiles.practitioner.couponPresets.class_pack_bonus.description = "Rewards commitment and smooths out your booking calendar."
```

## Offer templates

```
bizProfiles.practitioner.offerTemplates.new_client_special.label = "New client special: 20% off your first session"
bizProfiles.practitioner.offerTemplates.new_client_special.description = "Same logic as any service business — remove the risk of trying someone new."
bizProfiles.practitioner.offerTemplates.referral_free_class.label = "Refer a friend: you both get a free class"
bizProfiles.practitioner.offerTemplates.referral_free_class.description = "Especially effective for group classes, where an extra attendee costs you almost nothing."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.practitioner.couponAngles.firstTime = "Free consultation or intro session for new clients"
bizProfiles.practitioner.couponAngles.seasonal = "New season, new goals: 15% off a fresh session pack"
bizProfiles.practitioner.couponAngles.slowDay = "10% off weekday morning sessions"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.practitioner.growActions.action1 = "Ask clients for a Google review right after a session that clearly went well."
bizProfiles.practitioner.growActions.action2 = "Share a short client testimonial or result monthly — this stands in for the photos a storefront business would post."
bizProfiles.practitioner.growActions.action3 = "List your specialties and formats (virtual, in-person, group, 1:1) clearly, since you may not have a menu or storefront to show instead."
bizProfiles.practitioner.growActions.action4 = "Offer a free intro session or class to convert new leads who are still deciding."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.practitioner.faq.item1.question = "Does {businessName} offer virtual or remote sessions?"
bizProfiles.practitioner.faq.item1.answer = "Yes — ask about virtual options if an in-person session near {city} doesn't fit your schedule."
bizProfiles.practitioner.faq.item2.question = "Do I need to book an appointment with {businessName} in advance?"
bizProfiles.practitioner.faq.item2.answer = "Yes, sessions are by appointment — reach out to check current availability."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.practitioner.referralPresets.free_session_both.referrerReward = "A free class or session"
bizProfiles.practitioner.referralPresets.free_session_both.friendReward = "A free class or session"
bizProfiles.practitioner.referralPresets.free_session_both.description = "Especially effective for group classes, where an extra attendee costs you almost nothing."
bizProfiles.practitioner.referralPresets.credit_toward_session.referrerReward = "$15 credit toward your next session"
bizProfiles.practitioner.referralPresets.credit_toward_session.friendReward = "20% off their first session"
bizProfiles.practitioner.referralPresets.credit_toward_session.description = "Works well for 1:1 appointment-based practices where a free slot is a real cost."
```

## Pricing examples (Pricing page)

```
bizProfiles.practitioner.pricingExamples.example1 = "1:1 Session"
bizProfiles.practitioner.pricingExamples.example2 = "Group Class"
bizProfiles.practitioner.pricingExamples.example3 = "Intro Session"
```

## Pricing tips (Pricing page)

```
bizProfiles.practitioner.pricingTips.package_pricing.label = "Sell session packages, not just singles"
bizProfiles.practitioner.pricingTips.package_pricing.description = "A 5- or 10-session bundle rewards commitment and smooths your calendar, and clients who've prepaid rarely no-show."
bizProfiles.practitioner.pricingTips.low_cost_intro.label = "Use a free or low-cost intro session to convert"
bizProfiles.practitioner.pricingTips.low_cost_intro.description = "A short intro session converts hesitant leads without permanently discounting your real rate — keep it clearly framed as a one-time offer."
bizProfiles.practitioner.pricingTips.raise_when_booked_out.label = "Raise your rate when you're consistently booked out"
bizProfiles.practitioner.pricingTips.raise_when_booked_out.description = "A calendar that's full 2+ weeks ahead, week after week, is real demand — not just a busy stretch — and the honest signal it's time to raise your rate."
bizProfiles.practitioner.pricingTips.price_by_format.label = "Price the same expertise differently by format"
bizProfiles.practitioner.pricingTips.price_by_format.description = "A group class and a 1:1 session use the same skill but cost you very differently to deliver — price each by format rather than discounting your core 1:1 rate."
```
