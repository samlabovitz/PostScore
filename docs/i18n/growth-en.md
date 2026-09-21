# Growth section — English key list (translation reference)

Every `dashboard.growth.*` key from `lib/i18n/messages.ts`'s `en`
dictionary, added by Step L4 (beat 1) — the Growth section's own
hardcoded UI copy. One key per line:

```
key = "full English value"
```

This is a reference for translation — **do not translate anything here**.
Values are copied verbatim from `lib/i18n/messages.ts`. `{name}`
placeholders are interpolated at render time and must be preserved,
unchanged (including surrounding punctuation/spacing), in any
translation — only the surrounding words should ever change. `PostScore`
is the product's own brand name and is never translated in any locale.

**Out of scope, deliberately not in this file:** anything sourced from
`config/bizProfiles.ts` (coupon/referral preset labels & descriptions,
angle offer text, `profile.label`) — that content is L8's and stays
English-only data flowing through as interpolated params (e.g.
`quickPicksFor`'s `{label}`), never extracted here.

Sub-namespaced per component: `view` (GrowthView.tsx), `coupon`
(CouponBuilder.tsx), `activePromotions` (ActivePromotions.tsx),
`howCouponsWork` (HowCouponsWork.tsx), `moreWays`
(MoreWaysToBringPeopleIn.tsx), `referral` (ReferralBuilder.tsx),
`activeReferral` (ActiveReferral.tsx), `shareModal` (ShareModal.tsx).
`CouponsSection.tsx`, `ReferralSection.tsx`, and `page.tsx` have no
hardcoded copy of their own (pure composition/data-fetching) and
contribute no keys.

Keys suffixed `.one`/`.other` are **plural pairs** resolved via
`tPlural()` (real `Intl.PluralRules` category selection) — both forms
must be translated together. Marked **[plural]** below.

A few strings are identical across *different* components (e.g. "Share",
"More options", "Live preview", "How to share your coupon") — these are
kept as **separate keys per component**, not merged, matching the
extraction pattern from the shared-content-layer step: each component
owns its own copy, even where the English text currently collides.
Within a single component, an identical string used at multiple JSX
sites was consolidated to one key (e.g. `referral.referralCodeLabel` is
used both in the live-preview badge and the "More options" field label).

---

## GrowthView.tsx — `dashboard.growth.view.*`

```
dashboard.growth.view.backTo = "Back to {name}"
dashboard.growth.view.businessFallback = "business"
dashboard.growth.view.businessNameFallback = "Your business"
dashboard.growth.view.title = "Growth"
dashboard.growth.view.subtitle = "Raise your score and bring more customers through the door — everything you can act on, in one place."
dashboard.growth.view.tabPlan = "Action plan"
dashboard.growth.view.tabCoupons = "Coupons"
dashboard.growth.view.tabReferral = "Refer a friend"
dashboard.growth.view.weeklyCardLabel = "If you finish this week's plan"
dashboard.growth.view.statScoreToday = "Score today"
dashboard.growth.view.statProjected = "Projected after plan"
dashboard.growth.view.statPointsWithinReach = "Points within reach"
dashboard.growth.view.statGrade = "Grade"
dashboard.growth.view.gradeStays = "Stays a {grade}"
dashboard.growth.view.gradeChangeArrow = "{from} → {to}"
dashboard.growth.view.weeklyPlanNote.one = "Based on just the {count} task below — a realistic week, not every gap at once. See \"Bigger projects\" for the longer game."   [plural]
dashboard.growth.view.weeklyPlanNote.other = "Based on just the {count} tasks below — a realistic week, not every gap at once. See \"Bigger projects\" for the longer game."   [plural]
dashboard.growth.view.weeklyPlanNoteEmpty = "Nothing realistic to move this week, so this matches your current score. See \"Bigger projects\" for the longer game."
dashboard.growth.view.actionPlanErrorPrefix = "Couldn't load your action plan: {error}"
dashboard.growth.view.weeklyPlanHeading = "This week's plan ({count})"
dashboard.growth.view.laterTasksHeading = "Bigger projects ({count})"
dashboard.growth.view.weeklyEmptyMessage = "You're caught up — no real gaps determinable right now. Nice work."
dashboard.growth.view.weeklyFootnote = "Every estimate here is exactly what its check is currently missing — the same numbers behind the projected score above. Points only ever land after a re-scan actually finds the fix, never from clicking \"I did this\" alone."
dashboard.growth.view.laterEmptyMessage = "Nothing longer-term right now — everything determinable is either in this week's plan or already done."
```

`{error}` (actionPlanErrorPrefix) is a raw server-supplied error message,
not itself translated here — only the "Couldn't load your action plan: "
prefix is.

---

## CouponBuilder.tsx — `dashboard.growth.coupon.*`

```
dashboard.growth.coupon.defaultInstructions = "Show this coupon in-store to redeem."
dashboard.growth.coupon.defaultTerms = "One per customer. Cannot combine with other offers."
dashboard.growth.coupon.angleFirstTimeTitle = "First-time customer"
dashboard.growth.coupon.angleFirstTimeWhy = "Removes the risk of trying someone new — usually the highest-converting offer a business can run."
dashboard.growth.coupon.angleSeasonalTitle = "Seasonal or event"
dashboard.growth.coupon.angleSeasonalWhy = "Ties your offer to a moment customers are already thinking about, so it feels timely, not random."
dashboard.growth.coupon.angleSlowDayTitle = "Fill a slow day"
dashboard.growth.coupon.angleSlowDayWhy = "Turns your quietest hours into real traffic instead of leaving them empty."
dashboard.growth.coupon.previewExclusiveOffer = "Exclusive offer"
dashboard.growth.coupon.previewOfferPlaceholder = "Your offer will appear here"
dashboard.growth.coupon.previewCodeLabel = "Code"
dashboard.growth.coupon.previewScanToRedeem = "Scan to redeem"
dashboard.growth.coupon.previewQrAlt = "Scan to redeem this coupon"
dashboard.growth.coupon.eyebrow = "Digital coupon generator"
dashboard.growth.coupon.heading = "Turn online lookers into walk-ins"
dashboard.growth.coupon.intro = "A first-visit or seasonal offer gives someone browsing your listing a reason to come in now. Build one below — you'll get a real, downloadable coupon with a scannable code."
dashboard.growth.coupon.useThisOffer = "Use this offer"
dashboard.growth.coupon.offerLabel = "Your offer"
dashboard.growth.coupon.offerPlaceholder = "e.g. 10% off your next visit"
dashboard.growth.coupon.quickPicksFor = "Quick picks for {label}"
dashboard.growth.coupon.expiresLabel = "Expires"
dashboard.growth.coupon.moreOptions = "More options"
dashboard.growth.coupon.redemptionCodeLabel = "Redemption code"
dashboard.growth.coupon.generateNewCodeAriaLabel = "Generate a new code"
dashboard.growth.coupon.codeAutoGeneratedNote = "Auto-generated — edit it if you'd rather use your own."
dashboard.growth.coupon.instructionsLabel = "Instructions on the coupon"
dashboard.growth.coupon.termsLabel = "Terms"
dashboard.growth.coupon.optionalHint = "(optional)"
dashboard.growth.coupon.livePreview = "Live preview"
dashboard.growth.coupon.downloadGenerating = "Generating..."
dashboard.growth.coupon.downloadImage = "Download image"
dashboard.growth.coupon.share = "Share"
dashboard.growth.coupon.downloadHint = "Add an offer and an expiry date to download your coupon."
dashboard.growth.coupon.downloadErrorFallback = "Could not generate the image — try again."
dashboard.growth.coupon.starting = "Starting…"
dashboard.growth.coupon.startAndTrack = "Start & track this offer"
dashboard.growth.coupon.atLimitMessage.one = "You can run up to {count} coupon at once. End one in Active promotions below to start a new one."   [plural]
dashboard.growth.coupon.atLimitMessage.other = "You can run up to {count} coupons at once. End one in Active promotions below to start a new one."   [plural]
dashboard.growth.coupon.startSuccess = "Started — track redemptions in Active promotions below."
dashboard.growth.coupon.startErrorFallback = "Couldn't start this — try again."
dashboard.growth.coupon.startLimitError.one = "You're already running {count} active coupon — end one in Active promotions below before starting another."   [plural]
dashboard.growth.coupon.startLimitError.other = "You're already running {count} active coupons — end one in Active promotions below before starting another."   [plural]
dashboard.growth.coupon.disclaimer = "This creates a real image you share yourself — PostScore doesn't post it to Google or text it to customers automatically."
dashboard.growth.coupon.shareModalTitle = "How to share your coupon"
```

`quickPicksFor`'s `{label}` is `profile.label` (bizProfiles data, e.g.
"Cafe") — translate only the "Quick picks for " template.
`atLimitMessage`/`startLimitError` are pluralized on the real
`maxActive`/`activeCount` prop (currently `MAX_ACTIVE_PROMOS = 2`, see
`lib/promos.ts`), so both grammatical forms need real translations even
though today's UI only ever shows the `.other` form.

---

## ActivePromotions.tsx — `dashboard.growth.activePromotions.*`

```
dashboard.growth.activePromotions.redeemErrorFallback = "Couldn't log that — try again."
dashboard.growth.activePromotions.endErrorFallback = "Couldn't end this — try again."
dashboard.growth.activePromotions.redeemLogging = "Logging…"
dashboard.growth.activePromotions.redeemButton = "+1 Redeemed"
dashboard.growth.activePromotions.share = "Share"
dashboard.growth.activePromotions.endConfirmQuestion = "End this coupon?"
dashboard.growth.activePromotions.endConfirmYes = "Yes, end it"
dashboard.growth.activePromotions.ending = "Ending…"
dashboard.growth.activePromotions.cancel = "Cancel"
dashboard.growth.activePromotions.endButton = "End"
dashboard.growth.activePromotions.shareModalTitle = "How to share your coupon"
dashboard.growth.activePromotions.heading = "Active promotions ({active}/{max})"
dashboard.growth.activePromotions.emptyState = "Nothing running yet. Build a coupon above and hit \"Start & track this offer\" to see it here."
```

---

## HowCouponsWork.tsx — `dashboard.growth.howCouponsWork.*`

```
dashboard.growth.howCouponsWork.heading = "How it works, in 3 steps"
dashboard.growth.howCouponsWork.whatYouNeedToKnow = "What you need to know"
dashboard.growth.howCouponsWork.step1Title = "1. Share it"
dashboard.growth.howCouponsWork.step1Body = "Download the coupon image and post it, text it, or print it yourself — see \"How to share.\""
dashboard.growth.howCouponsWork.step2Title = "2. Customer brings it"
dashboard.growth.howCouponsWork.step2Body = "They show the image or code — on their phone or printed — at checkout."
dashboard.growth.howCouponsWork.step3Title = "3. Tap to log it"
dashboard.growth.howCouponsWork.step3Body = "Staff taps \"+1 Redeemed\" in Active promotions. That's the entire tracking system."
dashboard.growth.howCouponsWork.modalTitle = "Running a coupon — what you need"
dashboard.growth.howCouponsWork.modalBuildLabel = "Build."
dashboard.growth.howCouponsWork.modalBuildBody = "Pick an offer angle or write your own, set an expiry, and PostScore generates a real coupon image with a code and QR code."
dashboard.growth.howCouponsWork.modalShareLabel = "Share the image."
dashboard.growth.howCouponsWork.modalShareBody = "Download it and post it yourself — to your Google Business Profile, Instagram, Facebook, a text to regulars, or print it for the counter. PostScore never posts or sends anything on your behalf."
dashboard.growth.howCouponsWork.modalCustomerLabel = "Customer shows it."
dashboard.growth.howCouponsWork.modalCustomerBody = "They bring the image or code in — on their phone or printed — and show it at checkout."
dashboard.growth.howCouponsWork.modalStaffLabel = "Staff taps +1."
dashboard.growth.howCouponsWork.modalStaffBody = "Whoever's at the register taps \"+1 Redeemed\" on that coupon in Active promotions."
dashboard.growth.howCouponsWork.modalHonestNote = "Be honest with yourself about what this is: the redemption count is a simple stored tally that a human increments by hand. It is not a POS integration and nothing detects a redemption automatically — if staff forgets to tap it, that redemption isn't counted."
```

The modal's four bulleted paragraphs are each split into a bold
lead-in phrase (`modal*Label`) and its trailing sentence (`modal*Body`),
matching the source JSX's `<span className="font-semibold">Label.</span> Body`
structure — the code inserts a literal space between them (via `{" "}`),
so neither string should carry its own leading/trailing space for that
join.

---

## MoreWaysToBringPeopleIn.tsx — `dashboard.growth.moreWays.*`

```
dashboard.growth.moreWays.heading = "More ways to bring people in"
dashboard.growth.moreWays.googlePostTitle = "Draft a Google Post"
dashboard.growth.moreWays.googlePostBody = "Generates text about your active offer for a Google Business Profile update — you copy it and post it yourself."
dashboard.growth.moreWays.faqTitle = "Write an FAQ"
dashboard.growth.moreWays.faqBody = "Generates a Q&A about your active offer for your Google profile's Q&A section or your website — you post it yourself."
dashboard.growth.moreWays.startCouponFirst = "Start a coupon first"
dashboard.growth.moreWays.generateDraft = "Generate draft"
dashboard.growth.moreWays.modalTitleGooglePost = "Draft Google post"
dashboard.growth.moreWays.modalTitleFaq = "Draft FAQ"
dashboard.growth.moreWays.modalIntro = "This is draft text based on your active \"{offer}\" coupon. Copy it and post it yourself — PostScore doesn't post to Google or anywhere else on your behalf."
```

`{offer}` (modalIntro) is the business's own saved coupon offer text
(e.g. user-entered or picked from a bizProfiles preset) — pure
interpolated data, never translated.

---

## ReferralBuilder.tsx — `dashboard.growth.referral.*`

```
dashboard.growth.referral.previewBadge = "Refer a friend"
dashboard.growth.referral.previewForYou = "For you"
dashboard.growth.referral.previewYourRewardPlaceholder = "Your reward will appear here"
dashboard.growth.referral.previewForFriend = "For your friend"
dashboard.growth.referral.previewTheirRewardPlaceholder = "Their reward will appear here"
dashboard.growth.referral.referralCodeLabel = "Referral code"
dashboard.growth.referral.previewGiveCodeNote = "Give this code to a friend — they mention it on their first visit."
dashboard.growth.referral.eyebrow = "Referral program builder"
dashboard.growth.referral.heading = "Let happy customers bring you new ones"
dashboard.growth.referral.intro = "Set a reward for both sides — the customer who refers, and the friend they bring in. Build one below and you'll get a real, downloadable referral card with a code."
dashboard.growth.referral.quickPicksFor = "Quick picks for {label}"
dashboard.growth.referral.presetYouGet = "You get: "
dashboard.growth.referral.presetFriendGets = "Friend gets: "
dashboard.growth.referral.useThisReward = "Use this reward"
dashboard.growth.referral.referrerRewardLabel = "Reward for the referrer (existing customer)"
dashboard.growth.referral.referrerRewardPlaceholder = "e.g. $15 off your next visit"
dashboard.growth.referral.friendRewardLabel = "Reward for the friend (new customer)"
dashboard.growth.referral.friendRewardPlaceholder = "e.g. 20% off their first visit"
dashboard.growth.referral.moreOptions = "More options"
dashboard.growth.referral.generateNewCodeAriaLabel = "Generate a new code"
dashboard.growth.referral.codeAutoGeneratedNote = "Auto-generated — edit it if you'd rather use your own."
dashboard.growth.referral.livePreview = "Live preview"
dashboard.growth.referral.downloadGenerating = "Generating..."
dashboard.growth.referral.downloadImage = "Download image"
dashboard.growth.referral.downloadHint = "Add a reward for both sides to download your referral card."
dashboard.growth.referral.downloadErrorFallback = "Could not generate the image — try again."
dashboard.growth.referral.starting = "Starting…"
dashboard.growth.referral.startAndTrack = "Start & track this referral"
dashboard.growth.referral.atLimitMessage = "You can run 1 referral program at a time. End it in Active referral below to start a new one."
dashboard.growth.referral.startSuccess = "Started — track redemptions in Active referral below."
dashboard.growth.referral.startErrorFallback = "Couldn't start this — try again."
dashboard.growth.referral.startLimitError = "You're already running a referral program — end it in Active referral below before starting another."
dashboard.growth.referral.disclaimer = "This creates a real image you share yourself — with a customer, who then shares it with their friend. PostScore doesn't post it to Google, text anyone, or detect referrals automatically. Redemptions are a tally you or your staff log by hand in Active referral below."
```

`presetYouGet`/`presetFriendGets` intentionally end with `": "`
(colon + space) — preserve the trailing space, the reward value is
concatenated directly after with no separator in the JSX.

Note (not a translation issue, just an observation): `atLimitMessage`
hardcodes the literal word "1" in English rather than interpolating the
real `maxActive` prop — this mirrors the source code exactly (the
component ignores `maxActive` here even though `MAX_ACTIVE_REFERRALS`
is currently `1` anyway, see `lib/referrals.ts`). Reproduced as-is,
not treated as a bug to fix in this extraction pass.

---

## ActiveReferral.tsx — `dashboard.growth.activeReferral.*`

```
dashboard.growth.activeReferral.redeemErrorFallback = "Couldn't log that — try again."
dashboard.growth.activeReferral.endErrorFallback = "Couldn't end this — try again."
dashboard.growth.activeReferral.heading = "Active referral ({active}/{max})"
dashboard.growth.activeReferral.emptyState = "Nothing running yet. Build a referral offer above and hit \"Start & track this referral\" to see it here."
dashboard.growth.activeReferral.youGet = "You get: "
dashboard.growth.activeReferral.friendGets = "Friend gets: "
dashboard.growth.activeReferral.redeemLogging = "Logging…"
dashboard.growth.activeReferral.redeemButton = "+1 Referral"
dashboard.growth.activeReferral.share = "Share"
dashboard.growth.activeReferral.endConfirmQuestion = "End this referral program?"
dashboard.growth.activeReferral.endConfirmYes = "Yes, end it"
dashboard.growth.activeReferral.ending = "Ending…"
dashboard.growth.activeReferral.cancel = "Cancel"
dashboard.growth.activeReferral.endButton = "End"
dashboard.growth.activeReferral.shareModalTitle = "How to share your referral offer"
```

`youGet`/`friendGets` again end with `": "` — trailing space preserved,
same reasoning as ReferralBuilder's `presetYouGet`/`presetFriendGets`.

---

## ShareModal.tsx — `dashboard.growth.shareModal.*`

```
dashboard.growth.shareModal.disclaimer = "PostScore doesn't post to Google, Instagram, or text anyone automatically — download the image, then use any of these to post or send it yourself."
dashboard.growth.shareModal.optionGoogleTitle = "Post to your Google Business Profile"
dashboard.growth.shareModal.optionGoogleHowTo = "Open your Business Profile, go to Posts → Add update, paste the caption below, and attach the image you downloaded."
dashboard.growth.shareModal.optionSocialTitle = "Post to Instagram or Facebook"
dashboard.growth.shareModal.optionSocialHowTo = "Start a new post or story, attach the image, and paste the caption below."
dashboard.growth.shareModal.optionTextTitle = "Text it to regulars"
dashboard.growth.shareModal.optionTextHowTo = "Text the caption below (and attach the image, if your phone supports it) to customers you've had before."
dashboard.growth.shareModal.optionPrintTitle = "Print it for the counter"
dashboard.growth.shareModal.optionPrintHowTo = "Print the image and set it by the register, window, or waiting area."
dashboard.growth.shareModal.captionLabel = "Pre-written caption"
```

Note: `ShareModal`'s own `title` prop is passed in by each caller (its
own hardcoded string lives in the caller's namespace —
`coupon.shareModalTitle`, `activePromotions.shareModalTitle`,
`activeReferral.shareModalTitle` — not here).

---

## Out of scope (observed, not extracted — lives outside the ~10 Growth files)

Rendered inside the Growth flow but owned by files this step's scope
excludes (`lib/promos.ts`, `lib/coupons.ts`, `lib/referrals.ts`,
`components/ui/CopyBlock.tsx`, `components/ui/Modal.tsx`):

- `redemptionLabel()` (`lib/promos.ts`) — "No redemptions logged yet" /
  "1 redemption logged" / "{count} redemptions logged", a **manual**
  (non-`tPlural`) plural already. Shown in both `ActivePromotions.tsx`
  and `ActiveReferral.tsx`.
- `buildShareCaption` / `buildGooglePostDraft` / `buildFaqDraft`
  (`lib/promos.ts`) and `buildReferralShareCaption` (`lib/referrals.ts`)
  — build the actual pre-written caption/draft text bodies.
- `formatExpiry` (`lib/coupons.ts`) — the expiry date label text.
- `components/ui/CopyBlock.tsx` — "Copy text" / "Copied" button.
- `components/ui/Modal.tsx` — "Close" aria-label.

None of these were touched — flagging them only because they're
visibly part of the Growth experience, in case a later step wants them.

## Ambiguous, needs review

None. Every string in the 10 in-scope files was traceable either to
this component's own literal copy (extracted above) or directly to a
`config/bizProfiles.ts` field (`profile.label`, `couponPresets`,
`couponAngles`, `referralPresets` — left untouched, flowing through as
data). Nothing required a judgment call.
