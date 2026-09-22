# bizProfiles.gym_fitness — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.gym_fitness.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

---

## Profile label

```
bizProfiles.gym_fitness.label = "Gym & Fitness Studio"
```

## Competitor noun

```
bizProfiles.gym_fitness.competitorNoun = "gyms"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.gym_fitness.couponPresets.first_month_pct.label = "50% off your first month"
bizProfiles.gym_fitness.couponPresets.first_month_pct.description = "The standard, highest-converting gym offer — removes the risk of committing to a new place."
bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.label = "No enrollment fee for new members this month"
bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.description = "Removes a common friction point without discounting your actual membership rate."
bizProfiles.gym_fitness.couponPresets.class_pack_bonus.label = "Buy a 10-class pack, get 2 classes free"
bizProfiles.gym_fitness.couponPresets.class_pack_bonus.description = "Rewards commitment and smooths out class attendance without discounting drop-in rate."
```

## Offer templates

```
bizProfiles.gym_fitness.offerTemplates.new_member_special.label = "New member special: 50% off your first month, no enrollment fee"
bizProfiles.gym_fitness.offerTemplates.new_member_special.description = "Stacks the two lowest-risk offers into one strong first-time hook."
bizProfiles.gym_fitness.offerTemplates.bring_a_friend.label = "Bring a friend: you both get a free class or session"
bizProfiles.gym_fitness.offerTemplates.bring_a_friend.description = "Costs you one class slot, not cash — effective since a class has near-zero marginal cost per extra person."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.gym_fitness.couponAngles.firstTime = "New member special: 50% off your first month, no enrollment fee"
bizProfiles.gym_fitness.couponAngles.seasonal = "New Year, new goals: 50% off your first month"
bizProfiles.gym_fitness.couponAngles.slowDay = "20% off off-peak (mid-day) class sign-ups"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.gym_fitness.growActions.action1 = "Ask members for a Google review after a great class or a real milestone."
bizProfiles.gym_fitness.growActions.action2 = "Post real photos of classes, the space, and member results (with permission)."
bizProfiles.gym_fitness.growActions.action3 = "Keep your class schedule and current promotions up to date on your listing."
bizProfiles.gym_fitness.growActions.action4 = "Run a 'bring a friend' week where existing members can bring a guest free."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.gym_fitness.faq.item1.question = "Does {businessName} offer a free trial class or day pass?"
bizProfiles.gym_fitness.faq.item1.answer = "Yes — ask about trial options when you stop by or call."
bizProfiles.gym_fitness.faq.item2.question = "What is {businessName}'s class schedule?"
bizProfiles.gym_fitness.faq.item2.answer = "See our current class schedule on our website or by calling."
```

## Referral presets (Growth → Refer a friend)

```
bizProfiles.gym_fitness.referralPresets.free_month_both.referrerReward = "A free month of membership"
bizProfiles.gym_fitness.referralPresets.free_month_both.friendReward = "50% off their first month"
bizProfiles.gym_fitness.referralPresets.free_month_both.description = "Membership is your recurring revenue, so rewarding with more of it costs you less than it's worth to a member."
bizProfiles.gym_fitness.referralPresets.free_session_both.referrerReward = "A free class or session"
bizProfiles.gym_fitness.referralPresets.free_session_both.friendReward = "A free class or session"
bizProfiles.gym_fitness.referralPresets.free_session_both.description = "Especially effective for group classes, where an extra attendee costs you almost nothing."
```

## Pricing examples (Pricing page)

```
bizProfiles.gym_fitness.pricingExamples.example1 = "Monthly Membership"
bizProfiles.gym_fitness.pricingExamples.example2 = "Drop-in Class"
bizProfiles.gym_fitness.pricingExamples.example3 = "Personal Training Session"
```

## Pricing tips (Pricing page)

```
bizProfiles.gym_fitness.pricingTips.tiered_membership.label = "Offer tiered membership levels"
bizProfiles.gym_fitness.pricingTips.tiered_membership.description = "A basic, unlimited, and premium-with-training tier lets members self-select their spend instead of one price fitting everyone poorly."
bizProfiles.gym_fitness.pricingTips.annual_discount.label = "Discount annual memberships to lock in commitment"
bizProfiles.gym_fitness.pricingTips.annual_discount.description = "A modest discount for paying annually improves your cash flow and retention more than it costs you in margin."
bizProfiles.gym_fitness.pricingTips.off_peak_pricing.label = "Price off-peak sessions lower to fill slow hours"
bizProfiles.gym_fitness.pricingTips.off_peak_pricing.description = "Discounting mid-day or early-morning slots fills capacity that would otherwise sit empty, without touching your peak-hour rate."
bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.label = "Raise rates when classes are consistently full"
bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.description = "Waitlisted classes week after week are the honest signal you're underpriced relative to demand."
```
