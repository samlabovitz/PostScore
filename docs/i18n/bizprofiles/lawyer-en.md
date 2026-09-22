# bizProfiles.lawyer — English key list (translation reference)

Every key added by Step L8 (beat 1) under `bizProfiles.lawyer.*` in `lib/i18n/messages.ts`'s `en` dictionary — one of the 12 hand-written content profiles in `config/bizProfiles.ts`. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**. Values are copied verbatim from `lib/i18n/messages.ts`. `{placeholder}` tokens (`{businessName}`, `{city}` in the FAQ section) must be preserved, unchanged, in any translation — only the surrounding words should ever change.

`es` is intentionally absent for every key in this file — they fall back to English via `t()` until reviewed Spanish is supplied for this profile.

**Reused by these narrower business-type options** (their own `bizProfileOptions.<id>.label`/`competitorNoun` may override the label/noun below, but every other field — coupons, offers, FAQ, pricing — comes from this profile): `dentist`, `medical_clinic`.

---

## Profile label

```
bizProfiles.lawyer.label = "Legal Services"
```

## Competitor noun

```
bizProfiles.lawyer.competitorNoun = "firms"
```

## Coupon presets (Growth → Coupons)

```
bizProfiles.lawyer.couponPresets.free_consultation.label = "Free 30-minute initial consultation"
bizProfiles.lawyer.couponPresets.free_consultation.description = "The standard, ethically uncomplicated way most firms lower the barrier to a first call."
bizProfiles.lawyer.couponPresets.flat_fee_review.label = "Flat-fee case review for a set price"
bizProfiles.lawyer.couponPresets.flat_fee_review.description = "Gives a price-anxious prospective client a known cost to get real advice."
```

## Offer templates

```
bizProfiles.lawyer.offerTemplates.new_client_doc_review.label = "New client discount on document preparation"
bizProfiles.lawyer.offerTemplates.new_client_doc_review.description = "A concrete, bounded discount that doesn't touch contingency or hourly case work."
```

## Coupon angles (first-time / seasonal / slow-day)

```
bizProfiles.lawyer.couponAngles.firstTime = "Free 30-minute initial consultation"
bizProfiles.lawyer.couponAngles.seasonal = "Year-end document review special — get your paperwork in order"
bizProfiles.lawyer.couponAngles.slowDay = "Flat-fee case review, available this week"
```

## Grow actions (currently unused by any UI — see report)

```
bizProfiles.lawyer.growActions.action1 = "Ask satisfied clients for a Google review once their matter is resolved, where doing so is ethically appropriate."
bizProfiles.lawyer.growActions.action2 = "Publish a short, plain-language FAQ answering the questions {city} clients actually ask before calling."
bizProfiles.lawyer.growActions.action3 = "Keep your practice areas and attorney bios current — this is often the deciding factor between two firms."
bizProfiles.lawyer.growActions.action4 = "Respond calmly and professionally to any negative review; how a firm handles criticism is itself evidence to a prospective client."
```

## FAQ (starter-site only — {businessName}/{city} tokens preserved)

```
bizProfiles.lawyer.faq.item1.question = "Does {businessName} offer a free consultation?"
bizProfiles.lawyer.faq.item1.answer = "Yes — call or use our contact form to schedule an initial consultation."
bizProfiles.lawyer.faq.item2.question = "What areas of law does {businessName} practice?"
bizProfiles.lawyer.faq.item2.answer = "See our practice areas page for the specific matters we handle."
```

## Pricing examples (Pricing page)

```
bizProfiles.lawyer.pricingExamples.example1 = "Initial Consultation"
bizProfiles.lawyer.pricingExamples.example2 = "Flat-Fee Document Review"
bizProfiles.lawyer.pricingExamples.example3 = "Hourly Rate"
```

## Pricing tips (Pricing page)

```
bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.label = "Use flat fees for commodity work"
bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.description = "For predictable matters like document review or uncontested filings, a known flat fee removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust."
bizProfiles.lawyer.pricingTips.tiered_consultation.label = "Offer a tiered consultation"
bizProfiles.lawyer.pricingTips.tiered_consultation.description = "A free 15-minute phone screen plus a paid 1-hour strategy session lets price-sensitive prospects self-select in without you working for free indefinitely."
bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.label = "Raise rates when you're turning away work"
bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.description = "Consistently declining matters you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase."
bizProfiles.lawyer.pricingTips.scope_in_writing.label = "Put what's included in writing"
bizProfiles.lawyer.pricingTips.scope_in_writing.description = "Being explicit about what a flat fee covers (and what triggers hourly billing) up front prevents fee disputes later."
```
