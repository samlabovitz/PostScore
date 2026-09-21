import { DEFAULT_LOCALE, type Locale } from "./locale";

// Every UI string this app knows how to show in more than one language.
// Adding a new string is one new MessageKey plus one entry per locale
// below; adding a new locale (see locale.ts) doesn't require touching the
// key list, only a new entry in `messages`.
export type MessageKey =
  | "language.en"
  | "language.es"
  | "common.save"
  | "common.cancel"
  | "common.and"
  // --- Monthly report email (emails/MonthlyReportEmail.tsx) ---
  | "report.subject"
  | "report.monthHeading"
  | "report.headline.baseline"
  | "report.headline.steady"
  | "report.tone.positive"
  | "report.tone.negative"
  | "report.fragment.scoreRose.one"
  | "report.fragment.scoreRose.other"
  | "report.fragment.scoreDropped.one"
  | "report.fragment.scoreDropped.other"
  | "report.fragment.gradeChanged"
  | "report.fragment.reviewsGained.one"
  | "report.fragment.reviewsGained.other"
  | "report.fragment.reviewsLost.one"
  | "report.fragment.reviewsLost.other"
  | "report.fragment.ratingRose"
  | "report.fragment.ratingDropped"
  | "report.fragment.competitorUp"
  | "report.fragment.competitorDown"
  | "report.fragment.listingChanges.one"
  | "report.fragment.listingChanges.other"
  | "report.label.rating"
  | "report.label.reviewCount"
  | "report.unmeasured.rating"
  | "report.unmeasured.reviewCount"
  | "report.metric.notMeasuredPrefix"
  | "report.metric.noPrior"
  | "report.metric.unchanged"
  | "report.metric.delta"
  | "report.score.summary"
  | "report.score.sinceLastReport"
  | "report.focus.label"
  | "report.focus.nothingNotable"
  | "report.competitorSection.label"
  | "report.competitorSection.unavailable"
  | "report.competitorSection.rank"
  | "report.competitorSection.same"
  | "report.competitorSection.movedUp"
  | "report.competitorSection.movedDown"
  | "report.listingSection.label"
  | "report.listingSection.unavailable"
  | "report.listingSection.none"
  | "report.baselineNote"
  | "report.footer.enabledForPrefix"
  | "report.footer.unsubscribeLinkText"
  // --- Dashboard: Competitors page (app/business/[id]/competitors/CompetitorsView.tsx) ---
  // Naming convention for the whole dashboard rollout: dashboard.<section>.<key>.
  | "dashboard.competitors.title"
  | "dashboard.competitors.subtitle"
  | "dashboard.competitors.categoryClause"
  | "dashboard.competitors.backTo"
  | "dashboard.competitors.businessFallback"
  | "dashboard.competitors.rankedHeading"
  | "dashboard.competitors.rankSuffix"
  | "dashboard.competitors.unscoredHeading"
  | "dashboard.competitors.nothingToCompare"
  | "dashboard.competitors.noRating"
  | "dashboard.competitors.reviewCount.one"
  | "dashboard.competitors.reviewCount.other"
  | "dashboard.competitors.noReviewCount"
  | "dashboard.competitors.hasWebsite"
  | "dashboard.competitors.noWebsite"
  | "dashboard.competitors.milesSuffix"
  | "dashboard.competitors.yourBusiness"
  | "dashboard.competitors.noAddress"
  | "dashboard.competitors.postscoreOutOf100"
  | "dashboard.competitors.savingScan"
  | "dashboard.competitors.saveScan"
  | "dashboard.competitors.saved"
  | "dashboard.competitors.noComparableCompetitors"
  | "dashboard.competitors.saveError"
  // --- Shared content layer: scoring checks (lib/scoring.ts's CHECKS) ---
  // Keyed by each check's own stable id (e.g. "visibility.rating"), so a
  // check's real id and its i18n key namespace can never drift apart.
  // Shared between the dashboard (CategoryCard, WebsiteScoreBreakdown,
  // ActionPlanSection via lib/actionPlan.ts) and the monthly report email
  // (via generateSuggestions()'s advice/label feeding lib/monthlyReport.ts's
  // focus pointers) — the same reason these live under content.*, not report.*.
  | "content.checks.visibility.rating.label"
  | "content.checks.visibility.rating.advice"
  | "content.checks.visibility.rating.explanation.noReviews"
  | "content.checks.visibility.rating.explanation.notFound"
  | "content.checks.visibility.rating.explanation.noReviewCountBackup"
  | "content.checks.visibility.rating.explanation.lowConfidence.one"
  | "content.checks.visibility.rating.explanation.lowConfidence.other"
  | "content.checks.visibility.rating.explanation.confident"
  | "content.checks.visibility.review_count.label"
  | "content.checks.visibility.review_count.advice"
  | "content.checks.visibility.review_count.explanation.zero"
  | "content.checks.visibility.review_count.explanation.nonzero.one"
  | "content.checks.visibility.review_count.explanation.nonzero.other"
  | "content.checks.visibility.review_recency.label"
  | "content.checks.visibility.review_recency.advice"
  | "content.checks.visibility.review_recency.explanation.notCollected"
  | "content.checks.visibility.review_recency.explanation.recent"
  | "content.checks.completeness.phone.label"
  | "content.checks.completeness.phone.advice"
  | "content.checks.completeness.phone.explanation.present"
  | "content.checks.completeness.phone.explanation.missing"
  | "content.checks.completeness.address.label"
  | "content.checks.completeness.address.advice"
  | "content.checks.completeness.address.explanation.present"
  | "content.checks.completeness.address.explanation.missing"
  | "content.checks.completeness.hours.label"
  | "content.checks.completeness.hours.advice"
  | "content.checks.completeness.hours.explanation.present"
  | "content.checks.completeness.hours.explanation.missing"
  | "content.checks.completeness.website_link.label"
  | "content.checks.completeness.website_link.advice"
  | "content.checks.completeness.website_link.explanation.present"
  | "content.checks.completeness.website_link.explanation.missing"
  | "content.checks.completeness.categories.label"
  | "content.checks.completeness.categories.advice"
  | "content.checks.completeness.categories.explanation.hasList.one"
  | "content.checks.completeness.categories.explanation.hasList.other"
  | "content.checks.completeness.categories.explanation.primaryOnly"
  | "content.checks.completeness.categories.explanation.none"
  | "content.checks.completeness.photos.label"
  | "content.checks.completeness.photos.advice"
  | "content.checks.completeness.photos.explanation.notFound"
  | "content.checks.completeness.photos.explanation.has.one"
  | "content.checks.completeness.photos.explanation.has.other"
  | "content.checks.completeness.photos.explanation.none"
  | "content.checks.completeness.business_status.label"
  | "content.checks.completeness.business_status.advice"
  | "content.checks.completeness.business_status.explanation.notFound"
  | "content.checks.completeness.business_status.explanation.operational"
  | "content.checks.completeness.business_status.explanation.closed"
  | "content.checks.completeness.business_status.explanation.unrecognized"
  | "content.checks.website.has_website.label"
  | "content.checks.website.has_website.advice"
  | "content.checks.website.has_website.explanation.present"
  | "content.checks.website.has_website.explanation.missing"
  | "content.checks.website.https.label"
  | "content.checks.website.https.advice"
  | "content.checks.website.https.explanation.noWebsite"
  | "content.checks.website.https.explanation.https"
  | "content.checks.website.https.explanation.httpOnly"
  | "content.checks.website.https.explanation.unreachable"
  | "content.checks.website.https.explanation.notChecked"
  | "content.checks.website.performance_mobile.label"
  | "content.checks.website.performance_mobile.advice"
  | "content.checks.website.performance_mobile.explanation.noWebsite"
  | "content.checks.website.performance_mobile.explanation.notAnalyzed"
  | "content.checks.website.performance_mobile.explanation.noScore"
  | "content.checks.website.performance_mobile.explanation.fast"
  | "content.checks.website.performance_mobile.explanation.slowish"
  | "content.checks.website.performance_mobile.explanation.slow"
  | "content.checks.website.content_depth.label"
  | "content.checks.website.content_depth.advice"
  | "content.checks.website.content_depth.explanation.noWebsite"
  | "content.checks.website.content_depth.explanation.couldntRead"
  | "content.checks.website.content_depth.explanation.notAnalyzed"
  | "content.checks.website.content_depth.explanation.clientRenderedShell"
  | "content.checks.website.content_depth.explanation.recoveredBase"
  | "content.checks.website.content_depth.explanation.confirmedPresentTemplate"
  | "content.checks.website.content_depth.explanation.confirmedMissingTemplate"
  | "content.checks.website.content_depth.explanation.recoveredNote"
  | "content.checks.website.content_depth.explanation.presentTitle"
  | "content.checks.website.content_depth.explanation.presentMeta"
  | "content.checks.website.content_depth.explanation.presentViewport"
  | "content.checks.website.content_depth.explanation.presentHeadings"
  | "content.checks.website.content_depth.explanation.missingTitle"
  | "content.checks.website.content_depth.explanation.missingMeta"
  | "content.checks.website.content_depth.explanation.missingViewport"
  | "content.checks.website.content_depth.explanation.missingHeadings"
  | "content.checks.website.content_depth.explanation.allGood"
  | "content.checks.website.content_depth.explanation.gapsTemplate"
  | "content.checks.website.content_depth.explanation.gapNoTitle"
  | "content.checks.website.content_depth.explanation.gapNoMeta"
  | "content.checks.website.content_depth.explanation.gapNoViewport"
  | "content.checks.website.content_depth.explanation.gapNoHeadings"
  | "content.checks.website.content_depth.explanation.gapThinContent"
  | "content.checks.website.contact_conversion.label"
  | "content.checks.website.contact_conversion.advice"
  | "content.checks.website.contact_conversion.explanation.noWebsite"
  | "content.checks.website.contact_conversion.explanation.couldntRead"
  | "content.checks.website.contact_conversion.explanation.notAnalyzed"
  | "content.checks.website.contact_conversion.explanation.clientRenderedShell"
  | "content.checks.website.contact_conversion.explanation.allGood"
  | "content.checks.website.contact_conversion.explanation.noContact"
  | "content.checks.website.contact_conversion.explanation.noCta"
  | "content.checks.website.about_presence.label"
  | "content.checks.website.about_presence.advice"
  | "content.checks.website.about_presence.explanation.noWebsite"
  | "content.checks.website.about_presence.explanation.notAnalyzed"
  | "content.checks.website.about_presence.explanation.found"
  | "content.checks.website.about_presence.explanation.notFound"
  | "content.checks.website.services_presence.label"
  | "content.checks.website.services_presence.advice"
  | "content.checks.website.services_presence.explanation.noWebsite"
  | "content.checks.website.services_presence.explanation.notAnalyzed"
  | "content.checks.website.services_presence.explanation.found"
  | "content.checks.website.services_presence.explanation.notFound"
  // --- Shared content layer: listing-change descriptions (lib/profileChanges.ts) ---
  | "content.listingChange.phone.added"
  | "content.listingChange.phone.removed"
  | "content.listingChange.phone.changed"
  | "content.listingChange.website.added"
  | "content.listingChange.website.removed"
  | "content.listingChange.website.changed"
  | "content.listingChange.hours.added"
  | "content.listingChange.hours.removed"
  | "content.listingChange.hours.changed"
  | "content.listingChange.categories.addedPart"
  | "content.listingChange.categories.removedPart"
  | "content.listingChange.categories.changed"
  | "content.listingChange.photos.added.one"
  | "content.listingChange.photos.added.other"
  | "content.listingChange.photos.removed.one"
  | "content.listingChange.photos.removed.other"
  | "content.listingChange.rating.rose"
  | "content.listingChange.rating.dropped"
  | "content.listingChange.reviews.gained.one"
  | "content.listingChange.reviews.gained.other"
  | "content.listingChange.reviews.lost"
  | "content.listingChange.status.operational"
  | "content.listingChange.status.closedTemporarily"
  | "content.listingChange.status.closedPermanently"
  | "content.listingChange.status.changed"
  // --- Email-only glue (lib/monthlyReport.ts) ---
  | "report.focus.biggestOpportunity"
  | "report.focus.alsoWorthALook"
  | "report.focus.listingIssue"
  | "report.focus.competitorGap.one"
  | "report.focus.competitorGap.other"
  | "report.focus.generalTip"
  | "report.summary.reviewsGained.one"
  | "report.summary.reviewsGained.other"
  | "report.summary.reviewsLost"
  | "report.summary.listingChanges.one"
  | "report.summary.listingChanges.other"
  // --- Dashboard-only render-site strings not shared with the email ---
  | "dashboard.website.excludedPoints.one"
  | "dashboard.website.excludedPoints.other"
  | "dashboard.website.allVerified"
  | "dashboard.actionPlan.weeklyReviewTarget.one"
  | "dashboard.actionPlan.weeklyReviewTarget.other"
  | "dashboard.reports.recapDayCount.one"
  | "dashboard.reports.recapDayCount.other"
  // --- Growth section (app/business/[id]/growth/*) — pure extraction of
  // each component's own hardcoded UI copy. Anything sourced from
  // config/bizProfiles.ts (coupon/referral presets, angles, growActions,
  // pricingExamples, FAQ text) is deliberately left OUT of this
  // dictionary — that content stays English-only data flowing through as
  // interpolated params (see e.g. quickPicksFor's {label}), never
  // extracted here. Sub-namespaced per component.
  | "dashboard.growth.view.backTo"
  | "dashboard.growth.view.businessFallback"
  | "dashboard.growth.view.businessNameFallback"
  | "dashboard.growth.view.title"
  | "dashboard.growth.view.subtitle"
  | "dashboard.growth.view.tabPlan"
  | "dashboard.growth.view.tabCoupons"
  | "dashboard.growth.view.tabReferral"
  | "dashboard.growth.view.weeklyCardLabel"
  | "dashboard.growth.view.statScoreToday"
  | "dashboard.growth.view.statProjected"
  | "dashboard.growth.view.statPointsWithinReach"
  | "dashboard.growth.view.statGrade"
  | "dashboard.growth.view.gradeStays"
  | "dashboard.growth.view.gradeChangeArrow"
  | "dashboard.growth.view.weeklyPlanNote.one"
  | "dashboard.growth.view.weeklyPlanNote.other"
  | "dashboard.growth.view.weeklyPlanNoteEmpty"
  | "dashboard.growth.view.actionPlanErrorPrefix"
  | "dashboard.growth.view.weeklyPlanHeading"
  | "dashboard.growth.view.laterTasksHeading"
  | "dashboard.growth.view.weeklyEmptyMessage"
  | "dashboard.growth.view.weeklyFootnote"
  | "dashboard.growth.view.laterEmptyMessage"
  | "dashboard.growth.coupon.defaultInstructions"
  | "dashboard.growth.coupon.defaultTerms"
  | "dashboard.growth.coupon.angleFirstTimeTitle"
  | "dashboard.growth.coupon.angleFirstTimeWhy"
  | "dashboard.growth.coupon.angleSeasonalTitle"
  | "dashboard.growth.coupon.angleSeasonalWhy"
  | "dashboard.growth.coupon.angleSlowDayTitle"
  | "dashboard.growth.coupon.angleSlowDayWhy"
  | "dashboard.growth.coupon.previewExclusiveOffer"
  | "dashboard.growth.coupon.previewOfferPlaceholder"
  | "dashboard.growth.coupon.previewCodeLabel"
  | "dashboard.growth.coupon.previewScanToRedeem"
  | "dashboard.growth.coupon.previewQrAlt"
  | "dashboard.growth.coupon.eyebrow"
  | "dashboard.growth.coupon.heading"
  | "dashboard.growth.coupon.intro"
  | "dashboard.growth.coupon.useThisOffer"
  | "dashboard.growth.coupon.offerLabel"
  | "dashboard.growth.coupon.offerPlaceholder"
  | "dashboard.growth.coupon.quickPicksFor"
  | "dashboard.growth.coupon.expiresLabel"
  | "dashboard.growth.coupon.moreOptions"
  | "dashboard.growth.coupon.redemptionCodeLabel"
  | "dashboard.growth.coupon.generateNewCodeAriaLabel"
  | "dashboard.growth.coupon.codeAutoGeneratedNote"
  | "dashboard.growth.coupon.instructionsLabel"
  | "dashboard.growth.coupon.termsLabel"
  | "dashboard.growth.coupon.optionalHint"
  | "dashboard.growth.coupon.livePreview"
  | "dashboard.growth.coupon.downloadGenerating"
  | "dashboard.growth.coupon.downloadImage"
  | "dashboard.growth.coupon.share"
  | "dashboard.growth.coupon.downloadHint"
  | "dashboard.growth.coupon.downloadErrorFallback"
  | "dashboard.growth.coupon.starting"
  | "dashboard.growth.coupon.startAndTrack"
  | "dashboard.growth.coupon.atLimitMessage.one"
  | "dashboard.growth.coupon.atLimitMessage.other"
  | "dashboard.growth.coupon.startSuccess"
  | "dashboard.growth.coupon.startErrorFallback"
  | "dashboard.growth.coupon.startLimitError.one"
  | "dashboard.growth.coupon.startLimitError.other"
  | "dashboard.growth.coupon.disclaimer"
  | "dashboard.growth.coupon.shareModalTitle"
  | "dashboard.growth.activePromotions.redeemErrorFallback"
  | "dashboard.growth.activePromotions.endErrorFallback"
  | "dashboard.growth.activePromotions.redeemLogging"
  | "dashboard.growth.activePromotions.redeemButton"
  | "dashboard.growth.activePromotions.share"
  | "dashboard.growth.activePromotions.endConfirmQuestion"
  | "dashboard.growth.activePromotions.endConfirmYes"
  | "dashboard.growth.activePromotions.ending"
  | "dashboard.growth.activePromotions.cancel"
  | "dashboard.growth.activePromotions.endButton"
  | "dashboard.growth.activePromotions.shareModalTitle"
  | "dashboard.growth.activePromotions.heading"
  | "dashboard.growth.activePromotions.emptyState"
  | "dashboard.growth.howCouponsWork.heading"
  | "dashboard.growth.howCouponsWork.whatYouNeedToKnow"
  | "dashboard.growth.howCouponsWork.step1Title"
  | "dashboard.growth.howCouponsWork.step1Body"
  | "dashboard.growth.howCouponsWork.step2Title"
  | "dashboard.growth.howCouponsWork.step2Body"
  | "dashboard.growth.howCouponsWork.step3Title"
  | "dashboard.growth.howCouponsWork.step3Body"
  | "dashboard.growth.howCouponsWork.modalTitle"
  | "dashboard.growth.howCouponsWork.modalBuildLabel"
  | "dashboard.growth.howCouponsWork.modalBuildBody"
  | "dashboard.growth.howCouponsWork.modalShareLabel"
  | "dashboard.growth.howCouponsWork.modalShareBody"
  | "dashboard.growth.howCouponsWork.modalCustomerLabel"
  | "dashboard.growth.howCouponsWork.modalCustomerBody"
  | "dashboard.growth.howCouponsWork.modalStaffLabel"
  | "dashboard.growth.howCouponsWork.modalStaffBody"
  | "dashboard.growth.howCouponsWork.modalHonestNote"
  | "dashboard.growth.moreWays.heading"
  | "dashboard.growth.moreWays.googlePostTitle"
  | "dashboard.growth.moreWays.googlePostBody"
  | "dashboard.growth.moreWays.faqTitle"
  | "dashboard.growth.moreWays.faqBody"
  | "dashboard.growth.moreWays.startCouponFirst"
  | "dashboard.growth.moreWays.generateDraft"
  | "dashboard.growth.moreWays.modalTitleGooglePost"
  | "dashboard.growth.moreWays.modalTitleFaq"
  | "dashboard.growth.moreWays.modalIntro"
  | "dashboard.growth.referral.previewBadge"
  | "dashboard.growth.referral.previewForYou"
  | "dashboard.growth.referral.previewYourRewardPlaceholder"
  | "dashboard.growth.referral.previewForFriend"
  | "dashboard.growth.referral.previewTheirRewardPlaceholder"
  | "dashboard.growth.referral.referralCodeLabel"
  | "dashboard.growth.referral.previewGiveCodeNote"
  | "dashboard.growth.referral.eyebrow"
  | "dashboard.growth.referral.heading"
  | "dashboard.growth.referral.intro"
  | "dashboard.growth.referral.quickPicksFor"
  | "dashboard.growth.referral.presetYouGet"
  | "dashboard.growth.referral.presetFriendGets"
  | "dashboard.growth.referral.useThisReward"
  | "dashboard.growth.referral.referrerRewardLabel"
  | "dashboard.growth.referral.referrerRewardPlaceholder"
  | "dashboard.growth.referral.friendRewardLabel"
  | "dashboard.growth.referral.friendRewardPlaceholder"
  | "dashboard.growth.referral.moreOptions"
  | "dashboard.growth.referral.generateNewCodeAriaLabel"
  | "dashboard.growth.referral.codeAutoGeneratedNote"
  | "dashboard.growth.referral.livePreview"
  | "dashboard.growth.referral.downloadGenerating"
  | "dashboard.growth.referral.downloadImage"
  | "dashboard.growth.referral.downloadHint"
  | "dashboard.growth.referral.downloadErrorFallback"
  | "dashboard.growth.referral.starting"
  | "dashboard.growth.referral.startAndTrack"
  | "dashboard.growth.referral.atLimitMessage"
  | "dashboard.growth.referral.startSuccess"
  | "dashboard.growth.referral.startErrorFallback"
  | "dashboard.growth.referral.startLimitError"
  | "dashboard.growth.referral.disclaimer"
  | "dashboard.growth.activeReferral.redeemErrorFallback"
  | "dashboard.growth.activeReferral.endErrorFallback"
  | "dashboard.growth.activeReferral.heading"
  | "dashboard.growth.activeReferral.emptyState"
  | "dashboard.growth.activeReferral.youGet"
  | "dashboard.growth.activeReferral.friendGets"
  | "dashboard.growth.activeReferral.redeemLogging"
  | "dashboard.growth.activeReferral.redeemButton"
  | "dashboard.growth.activeReferral.share"
  | "dashboard.growth.activeReferral.endConfirmQuestion"
  | "dashboard.growth.activeReferral.endConfirmYes"
  | "dashboard.growth.activeReferral.ending"
  | "dashboard.growth.activeReferral.cancel"
  | "dashboard.growth.activeReferral.endButton"
  | "dashboard.growth.activeReferral.shareModalTitle"
  | "dashboard.growth.shareModal.disclaimer"
  | "dashboard.growth.shareModal.optionGoogleTitle"
  | "dashboard.growth.shareModal.optionGoogleHowTo"
  | "dashboard.growth.shareModal.optionSocialTitle"
  | "dashboard.growth.shareModal.optionSocialHowTo"
  | "dashboard.growth.shareModal.optionTextTitle"
  | "dashboard.growth.shareModal.optionTextHowTo"
  | "dashboard.growth.shareModal.optionPrintTitle"
  | "dashboard.growth.shareModal.optionPrintHowTo"
  | "dashboard.growth.shareModal.captionLabel";

/** The report/dashboard messages that vary by count — see tPlural below.
 * Each has a ".one" and ".other" MessageKey (the only two categories
 * English or Spanish ever produce — see tPlural's own doc comment for
 * how a future locale with more categories, e.g. "few"/"many", would
 * still get a safe result even before every category is seeded for it). */
export type PluralKeyBase =
  | "report.fragment.scoreRose"
  | "report.fragment.scoreDropped"
  | "report.fragment.reviewsGained"
  | "report.fragment.reviewsLost"
  | "report.fragment.listingChanges"
  | "dashboard.competitors.reviewCount"
  | "content.checks.visibility.rating.explanation.lowConfidence"
  | "content.checks.visibility.review_count.explanation.nonzero"
  | "content.checks.completeness.categories.explanation.hasList"
  | "content.checks.completeness.photos.explanation.has"
  | "content.listingChange.photos.added"
  | "content.listingChange.photos.removed"
  | "content.listingChange.reviews.gained"
  | "report.focus.competitorGap"
  | "report.summary.reviewsGained"
  | "report.summary.listingChanges"
  | "dashboard.website.excludedPoints"
  | "dashboard.actionPlan.weeklyReviewTarget"
  | "dashboard.reports.recapDayCount"
  | "dashboard.growth.view.weeklyPlanNote"
  | "dashboard.growth.coupon.atLimitMessage"
  | "dashboard.growth.coupon.startLimitError";

// English is the dictionary every other locale falls back to via t()
// below, so it's kept fully seeded. Other locales are deliberately
// allowed to lag behind it — a real translation effort fills in the rest
// over time — so this is Partial rather than a full Record<MessageKey,
// string> per locale: a locale missing a key is a normal, safe state that
// t() handles below, never a compile-time or runtime error.
//
// Every report.* value below reproduces the exact English text
// MonthlyReportEmail.tsx used to hardcode — this dictionary is a pure
// extraction, not a rewrite, so nothing about the rendered report
// changes yet. es intentionally has none of the report.* keys yet: no
// Spanish report copy has been written, so every one of them currently
// falls back to English via t()/tPlural.
type LocaleMessages = Partial<Record<MessageKey, string>>;

export const messages: Record<Locale, LocaleMessages> = {
  en: {
    "language.en": "English",
    "language.es": "Spanish",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.and": "and",

    "report.subject": "{businessName} — your {month} PostScore report",
    "report.monthHeading": "{month} report",

    "report.headline.baseline": "Your baseline is set — welcome to PostScore. Here's where you stand today.",
    "report.headline.steady": "A steady month — your presence held its ground.",

    "report.tone.positive": "Great progress this month.",
    "report.tone.negative": "It happens — here's what to focus on to turn it around.",

    "report.fragment.scoreRose.one": "your score rose {count} point",
    "report.fragment.scoreRose.other": "your score rose {count} points",
    "report.fragment.scoreDropped.one": "your score dropped {count} point",
    "report.fragment.scoreDropped.other": "your score dropped {count} points",
    "report.fragment.gradeChanged": "your grade changed to {grade}",
    "report.fragment.reviewsGained.one": "you gained {count} review",
    "report.fragment.reviewsGained.other": "you gained {count} reviews",
    "report.fragment.reviewsLost.one": "you lost {count} review",
    "report.fragment.reviewsLost.other": "you lost {count} reviews",
    "report.fragment.ratingRose": "your rating rose to {value}★",
    "report.fragment.ratingDropped": "your rating dropped to {value}★",
    "report.fragment.competitorUp": "you moved up to #{rank} of {total}",
    "report.fragment.competitorDown": "you moved down to #{rank} of {total}",
    "report.fragment.listingChanges.one": "there was {count} listing change",
    "report.fragment.listingChanges.other": "there were {count} listing changes",

    "report.label.rating": "Rating",
    "report.label.reviewCount": "Review count",
    "report.unmeasured.rating": "this scan didn't include a real rating value.",
    "report.unmeasured.reviewCount": "this scan didn't include a real review count.",
    "report.metric.notMeasuredPrefix": "Not measured this period — ",
    "report.metric.noPrior": "{value} (no prior report to compare against)",
    "report.metric.unchanged": "{value} — unchanged",
    "report.metric.delta": "{value} ({delta} vs. last report)",

    "report.score.summary": "{total}/100 · {grade}",
    "report.score.sinceLastReport": "{delta} since last report",

    "report.focus.label": "This month & what to focus on",
    "report.focus.nothingNotable":
      "Nothing notable to flag this month — your listing and site are in strong shape across the board.",

    "report.competitorSection.label": "Competitor standing",
    "report.competitorSection.unavailable": "Not tracked this period — no competitor scan is available to compare.",
    "report.competitorSection.rank": "#{rank} of {total} nearby",
    "report.competitorSection.same": "Same as your last report.",
    "report.competitorSection.movedUp": "Moved up from #{rank} last report.",
    "report.competitorSection.movedDown": "Moved down from #{rank} last report.",

    "report.listingSection.label": "Listing changes",
    "report.listingSection.unavailable":
      "Not available for this comparison — one of the two scans predates listing-change tracking, or this is your first report.",
    "report.listingSection.none": "No other listing changes detected this month.",

    "report.baselineNote":
      "This is your first PostScore report — a real baseline, not a trend. Next month's report will show real month-over-month change.",

    "report.footer.enabledForPrefix": "You're receiving this because monthly email reports are on for ",
    "report.footer.unsubscribeLinkText": "Unsubscribe from these reports",

    "dashboard.competitors.title": "Competitors",
    "dashboard.competitors.subtitle":
      "Real nearby {competitorNoun}{categoryClause}, scored with the same PostScore engine and ranked strictly by that score.",
    "dashboard.competitors.categoryClause": " in the same category ({categoryLabel})",
    "dashboard.competitors.backTo": "Back to {name}",
    "dashboard.competitors.businessFallback": "business",
    "dashboard.competitors.rankedHeading": "Ranked by PostScore{rankSuffix}",
    "dashboard.competitors.rankSuffix": " — you're #{rank} of {total}",
    "dashboard.competitors.unscoredHeading": "Found nearby, but couldn't be scored",
    "dashboard.competitors.nothingToCompare":
      "Your PostScore ({total}) is shown above with nothing to compare it to yet — widen your search area or check back later as more listings appear nearby.",
    "dashboard.competitors.noRating": "No rating",
    "dashboard.competitors.reviewCount.one": "{count} review",
    "dashboard.competitors.reviewCount.other": "{count} reviews",
    "dashboard.competitors.noReviewCount": "No review count",
    "dashboard.competitors.hasWebsite": "Has website",
    "dashboard.competitors.noWebsite": "No website",
    "dashboard.competitors.milesSuffix": " mi",
    "dashboard.competitors.yourBusiness": "Your business",
    "dashboard.competitors.noAddress": "No address on file",
    "dashboard.competitors.postscoreOutOf100": "PostScore / 100",
    "dashboard.competitors.savingScan": "Saving scan...",
    "dashboard.competitors.saveScan": "Save this scan to history",
    "dashboard.competitors.saved": "Saved.",
    "dashboard.competitors.noComparableCompetitors":
      "Nothing to save — no comparable competitors were found.",
    "dashboard.competitors.saveError": "Could not save this scan.",

    // --- content.checks.* — pure extraction of lib/scoring.ts's CHECKS;
    // every value below reproduces that file's original hardcoded
    // label/advice/explanation text exactly, byte-for-byte.
    "content.checks.visibility.rating.label": "Star rating",
    "content.checks.visibility.rating.advice":
      "Improve your average star rating — ask happy customers for reviews (more reviews also means your rating carries more weight) and follow up on negative ones.",
    "content.checks.visibility.rating.explanation.noReviews":
      "No Google reviews yet — this is the biggest thing holding your visibility back.",
    "content.checks.visibility.rating.explanation.notFound": "Google returned no star rating for this listing.",
    "content.checks.visibility.rating.explanation.noReviewCountBackup":
      "Rated {rating}★ on Google, but Google didn't return a review count to back it up — shown at reduced confidence until review volume is verified.",
    "content.checks.visibility.rating.explanation.lowConfidence.one":
      "Rated {rating}★ on Google, but based on only {count} review — as you gather more reviews, this rating will carry more weight toward your score.",
    "content.checks.visibility.rating.explanation.lowConfidence.other":
      "Rated {rating}★ on Google, but based on only {count} reviews — as you gather more reviews, this rating will carry more weight toward your score.",
    "content.checks.visibility.rating.explanation.confident": "Rated {rating}★ on Google.",

    "content.checks.visibility.review_count.label": "Review count",
    "content.checks.visibility.review_count.advice":
      "Get more Google reviews — ask recent customers directly, or add a review link to receipts and follow-up emails.",
    "content.checks.visibility.review_count.explanation.zero":
      "0 reviews on Google — ask your customers for reviews to start building social proof.",
    "content.checks.visibility.review_count.explanation.nonzero.one":
      "{count} review on Google (full credit at {saturation}+).",
    "content.checks.visibility.review_count.explanation.nonzero.other":
      "{count} reviews on Google (full credit at {saturation}+).",

    "content.checks.visibility.review_recency.label": "Review recency",
    "content.checks.visibility.review_recency.advice":
      "Keep reviews coming in regularly — recent activity signals to customers (and Google) that the business is active.",
    "content.checks.visibility.review_recency.explanation.notCollected":
      "Review timestamps aren't collected by the current Google Places integration yet, so this check is excluded rather than scored as a failure.",
    "content.checks.visibility.review_recency.explanation.recent": "Most recent review was {days} day(s) ago.",

    "content.checks.completeness.phone.label": "Phone number",
    "content.checks.completeness.phone.advice": "Add a phone number to your Google Business Profile.",
    "content.checks.completeness.phone.explanation.present": "Phone number is on the listing.",
    "content.checks.completeness.phone.explanation.missing": "No phone number on the listing.",

    "content.checks.completeness.address.label": "Address",
    "content.checks.completeness.address.advice":
      "Add a complete, verified address to your Google Business Profile.",
    "content.checks.completeness.address.explanation.present": "Address is on the listing.",
    "content.checks.completeness.address.explanation.missing": "No address on the listing.",

    "content.checks.completeness.hours.label": "Business hours",
    "content.checks.completeness.hours.advice": "Add your business hours to your Google Business Profile.",
    "content.checks.completeness.hours.explanation.present": "Business hours are on the listing.",
    "content.checks.completeness.hours.explanation.missing": "No business hours on the listing.",

    "content.checks.completeness.website_link.label": "Website link on listing",
    "content.checks.completeness.website_link.advice": "Link your website in your Google Business Profile.",
    "content.checks.completeness.website_link.explanation.present": "Website is linked on the listing.",
    "content.checks.completeness.website_link.explanation.missing": "No website linked on the listing.",

    "content.checks.completeness.categories.label": "Categories",
    "content.checks.completeness.categories.advice":
      "Add business categories to your Google Business Profile so customers can find you by what you offer.",
    "content.checks.completeness.categories.explanation.hasList.one": "{count} category on the listing.",
    "content.checks.completeness.categories.explanation.hasList.other": "{count} categories on the listing.",
    "content.checks.completeness.categories.explanation.primaryOnly":
      'No full category list, but a primary category ("{category}") is on file.',
    "content.checks.completeness.categories.explanation.none": "No categories on the listing.",

    "content.checks.completeness.photos.label": "Photos",
    "content.checks.completeness.photos.advice":
      "Add photos to your Google Business Profile — listings with photos get more engagement.",
    "content.checks.completeness.photos.explanation.notFound": "Google returned no photo data for this listing.",
    "content.checks.completeness.photos.explanation.has.one": "{count} photo on the listing.",
    "content.checks.completeness.photos.explanation.has.other": "{count} photos on the listing.",
    "content.checks.completeness.photos.explanation.none": "No photos on the listing.",

    "content.checks.completeness.business_status.label": "Operational status",
    "content.checks.completeness.business_status.advice":
      "Make sure your Google Business Profile shows as Operational.",
    "content.checks.completeness.business_status.explanation.notFound":
      "Google returned no business status for this listing.",
    "content.checks.completeness.business_status.explanation.operational": "Listing shows as Operational.",
    "content.checks.completeness.business_status.explanation.closed": "Listing shows as {status}.",
    "content.checks.completeness.business_status.explanation.unrecognized":
      'Listing has an unrecognized status ("{status}") — can\'t confidently score it.',

    "content.checks.website.has_website.label": "Has a website",
    "content.checks.website.has_website.advice":
      "Get a website for your business — it's one of the biggest trust signals for potential customers.",
    "content.checks.website.has_website.explanation.present": "Business has a website on file.",
    "content.checks.website.has_website.explanation.missing": "No website on file.",

    "content.checks.website.https.label": "Uses HTTPS",
    "content.checks.website.https.advice":
      'Move your website to HTTPS — browsers flag non-HTTPS sites as "not secure," which costs trust.',
    "content.checks.website.https.explanation.noWebsite": "Not applicable — no website on file to check.",
    "content.checks.website.https.explanation.https":
      "Confirmed by a live check: the site loads successfully over HTTPS.",
    "content.checks.website.https.explanation.httpOnly":
      "Confirmed by a live check: the site only loads over HTTP — no working HTTPS was found.",
    "content.checks.website.https.explanation.unreachable":
      "Couldn't verify HTTPS — a live check of this site timed out, hit a network error, or was blocked. Excluded from your score, not counted against you.",
    "content.checks.website.https.explanation.notChecked": "HTTPS hasn't been checked for this site yet.",

    "content.checks.website.performance_mobile.label": "Performance & mobile",
    "content.checks.website.performance_mobile.advice":
      "Speed up your site — compress images, use a fast static host, and cut unnecessary scripts. A lightweight page (like PostScore's starter site) loads fast by default.",
    "content.checks.website.performance_mobile.explanation.noWebsite":
      "Not applicable — no website on file to check.",
    "content.checks.website.performance_mobile.explanation.notAnalyzed":
      "This site hasn't been analyzed yet — re-scan to run a real PageSpeed check.",
    "content.checks.website.performance_mobile.explanation.noScore":
      "Couldn't get a real PageSpeed score for this site — either PostScore's PageSpeed check isn't configured yet, or Google's PageSpeed Insights API couldn't complete the audit. Excluded from your score, not counted against you.",
    "content.checks.website.performance_mobile.explanation.fast":
      "Fast on mobile — Google PageSpeed mobile performance score of {score}/100.",
    "content.checks.website.performance_mobile.explanation.slowish":
      "Loads a bit slowly on mobile — Google PageSpeed mobile performance score of {score}/100.",
    "content.checks.website.performance_mobile.explanation.slow":
      "Loads slowly on mobile — Google PageSpeed mobile performance score of only {score}/100.",

    "content.checks.website.content_depth.label": "Content depth",
    "content.checks.website.content_depth.advice":
      "Build out real content — a title and meta description, a few real headings, and a genuine amount of text about what you offer. A single bare block reads as an unfinished site to visitors and to search engines.",
    "content.checks.website.content_depth.explanation.noWebsite": "Not applicable — no website on file to check.",
    "content.checks.website.content_depth.explanation.couldntRead":
      "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you.",
    "content.checks.website.content_depth.explanation.notAnalyzed":
      "This site hasn't been analyzed yet — re-scan to check its real content.",
    "content.checks.website.content_depth.explanation.clientRenderedShell":
      "Couldn't verify — this site renders its content with JavaScript, which our static check can't read. Excluded from your score, not counted against you.",
    "content.checks.website.content_depth.explanation.recoveredBase":
      "This site renders its content with JavaScript — verified using Google's real rendered-page audit instead of a static fetch.",
    "content.checks.website.content_depth.explanation.confirmedPresentTemplate": "Confirmed present: {items}.",
    "content.checks.website.content_depth.explanation.confirmedMissingTemplate": "Confirmed missing: {items}.",
    "content.checks.website.content_depth.explanation.recoveredNote":
      "Content depth/length couldn't be independently confirmed for this site and isn't credited either way.",
    "content.checks.website.content_depth.explanation.presentTitle": "a page title",
    "content.checks.website.content_depth.explanation.presentMeta": "a meta description",
    "content.checks.website.content_depth.explanation.presentViewport": "a mobile viewport tag",
    "content.checks.website.content_depth.explanation.presentHeadings": "real headings",
    "content.checks.website.content_depth.explanation.missingTitle": "no page title found",
    "content.checks.website.content_depth.explanation.missingMeta": "no meta description found",
    "content.checks.website.content_depth.explanation.missingViewport":
      "not mobile-optimized (no viewport tag)",
    "content.checks.website.content_depth.explanation.missingHeadings": "no real headings/sections",
    "content.checks.website.content_depth.explanation.allGood":
      "Real, substantial content: a title, meta description, headings, and a mobile viewport tag all present.",
    "content.checks.website.content_depth.explanation.gapsTemplate": "Content gaps found: {items}.",
    "content.checks.website.content_depth.explanation.gapNoTitle": "no page title",
    "content.checks.website.content_depth.explanation.gapNoMeta": "no meta description",
    "content.checks.website.content_depth.explanation.gapNoViewport": "not mobile-optimized (no viewport tag)",
    "content.checks.website.content_depth.explanation.gapNoHeadings": "no real headings/sections",
    "content.checks.website.content_depth.explanation.gapThinContent":
      "very little content — reads as a bare landing page",

    "content.checks.website.contact_conversion.label": "Contact & conversion",
    "content.checks.website.contact_conversion.advice":
      'Add a real click-to-call phone link or email address, and a clear call-to-action (e.g. "Call now" or "Book an appointment") — visitors shouldn\'t have to hunt for how to reach you.',
    "content.checks.website.contact_conversion.explanation.noWebsite":
      "Not applicable — no website on file to check.",
    "content.checks.website.contact_conversion.explanation.couldntRead":
      "Couldn't read this site's content — the automated check may have been blocked. Excluded from your score, not counted against you.",
    "content.checks.website.contact_conversion.explanation.notAnalyzed":
      "This site hasn't been analyzed yet — re-scan to check its real contact info and calls-to-action.",
    "content.checks.website.contact_conversion.explanation.clientRenderedShell":
      "Couldn't verify — this site renders its content with JavaScript, which our static check can't read. Excluded from your score, not counted against you.",
    "content.checks.website.contact_conversion.explanation.allGood":
      "A real contact link and a clear call-to-action are both present.",
    "content.checks.website.contact_conversion.explanation.noContact": "no click-to-call phone or email link found",
    "content.checks.website.contact_conversion.explanation.noCta": "no clear call-to-action found",

    "content.checks.website.about_presence.label": "About / our story",
    "content.checks.website.about_presence.advice":
      "Add a real About or Our Story page (linked from your main navigation) — a short background/team page reassures visitors this is a real, established business.",
    "content.checks.website.about_presence.explanation.noWebsite": "Not applicable — no website on file to check.",
    "content.checks.website.about_presence.explanation.notAnalyzed":
      "This site hasn't been analyzed yet — re-scan to check its real navigation.",
    "content.checks.website.about_presence.explanation.found":
      "Found a real About/Our Story page linked from this site's navigation or sitemap.",
    "content.checks.website.about_presence.explanation.notFound":
      "Couldn't verify — no About/Our Story page was found in this site's navigation or sitemap. A single-page site may have this content on its homepage instead, which we can't detect. Excluded from your score, not counted against you.",

    "content.checks.website.services_presence.label": "Services / products",
    "content.checks.website.services_presence.advice":
      "Add a real Services, Products, or Menu page (linked from your main navigation) — visitors and search engines both look for a clear list of what you offer.",
    "content.checks.website.services_presence.explanation.noWebsite":
      "Not applicable — no website on file to check.",
    "content.checks.website.services_presence.explanation.notAnalyzed":
      "This site hasn't been analyzed yet — re-scan to check its real navigation.",
    "content.checks.website.services_presence.explanation.found":
      "Found a real Services/Products page linked from this site's navigation or sitemap.",
    "content.checks.website.services_presence.explanation.notFound":
      "Couldn't verify — no Services/Products page was found in this site's navigation or sitemap. A single-page site may list these on its homepage instead, which we can't detect. Excluded from your score, not counted against you.",

    // --- content.listingChange.* — pure extraction of lib/profileChanges.ts's
    // diffProfileSnapshots() sentences, byte-for-byte.
    "content.listingChange.phone.added": "A phone number was added to your listing.",
    "content.listingChange.phone.removed": "The phone number was removed from your listing.",
    "content.listingChange.phone.changed": "Your phone number changed.",
    "content.listingChange.website.added": "A website was added to your listing.",
    "content.listingChange.website.removed": "The website was removed from your listing.",
    "content.listingChange.website.changed": "Your website URL changed.",
    "content.listingChange.hours.added": "Hours were added to your listing.",
    "content.listingChange.hours.removed": "Hours were removed from your listing.",
    "content.listingChange.hours.changed": "Your hours changed.",
    "content.listingChange.categories.addedPart": "added {list}",
    "content.listingChange.categories.removedPart": "removed {list}",
    "content.listingChange.categories.changed": "Your categories changed — {parts}.",
    "content.listingChange.photos.added.one": "{count} photo added.",
    "content.listingChange.photos.added.other": "{count} photos added.",
    "content.listingChange.photos.removed.one": "A photo was removed.",
    "content.listingChange.photos.removed.other": "{count} photos were removed.",
    "content.listingChange.rating.rose": "Your rating rose from {previous}★ to {current}★.",
    "content.listingChange.rating.dropped": "Your rating dropped from {previous}★ to {current}★.",
    "content.listingChange.reviews.gained.one": "{count} new review.",
    "content.listingChange.reviews.gained.other": "{count} new reviews.",
    "content.listingChange.reviews.lost": "Your review count dropped by {count}.",
    "content.listingChange.status.operational": "Operational",
    "content.listingChange.status.closedTemporarily": "Temporarily closed",
    "content.listingChange.status.closedPermanently": "Permanently closed",
    "content.listingChange.status.changed": "Your listing status changed from {previous} to {current}.",

    // --- report.* — email-only glue extracted from lib/monthlyReport.ts.
    "report.focus.biggestOpportunity": "Your biggest opportunity: {label} — {advice}",
    "report.focus.alsoWorthALook": "Also worth a look: {label} — {advice}",
    "report.focus.listingIssue": "Listing change worth a look: {description}",
    "report.focus.competitorGap.one":
      "The top-ranked business near you has {count} more review than you — closing that gap moves your ranking.",
    "report.focus.competitorGap.other":
      "The top-ranked business near you has {count} more reviews than you — closing that gap moves your ranking.",
    "report.focus.generalTip":
      "General tip: posting an update or offer to your Google Business Profile every so often helps keep your listing active in local search — this isn't something we currently measure, so treat it as general guidance, not a status report.",
    "report.summary.reviewsGained.one": "{count} new review",
    "report.summary.reviewsGained.other": "{count} new reviews",
    "report.summary.reviewsLost": "your review count dropped by {count}",
    "report.summary.listingChanges.one": "{count} listing change detected",
    "report.summary.listingChanges.other": "{count} listing changes detected",

    // --- dashboard.* — render-site-only strings (not shared with the email).
    "dashboard.website.excludedPoints.one": "{count} pt not yet verified, not counted for or against.",
    "dashboard.website.excludedPoints.other": "{count} pts not yet verified, not counted for or against.",
    "dashboard.website.allVerified": "Every website check has real, verified data.",
    "dashboard.actionPlan.weeklyReviewTarget.one": "Get {count}+ new review this week ({before} → {after}+)",
    "dashboard.actionPlan.weeklyReviewTarget.other": "Get {count}+ new reviews this week ({before} → {after}+)",
    "dashboard.reports.recapDayCount.one": "{count} day",
    "dashboard.reports.recapDayCount.other": "{count} days",

    // --- dashboard.growth.* — Step L4 (beat 1) pure extraction of the
    // Growth section's own hardcoded UI copy. Every value below
    // reproduces the source component's original hardcoded text exactly,
    // byte-for-byte; nothing sourced from config/bizProfiles.ts is
    // included here (see the MessageKey union's own comment above).
    "dashboard.growth.view.backTo": "Back to {name}",
    "dashboard.growth.view.businessFallback": "business",
    "dashboard.growth.view.businessNameFallback": "Your business",
    "dashboard.growth.view.title": "Growth",
    "dashboard.growth.view.subtitle":
      "Raise your score and bring more customers through the door — everything you can act on, in one place.",
    "dashboard.growth.view.tabPlan": "Action plan",
    "dashboard.growth.view.tabCoupons": "Coupons",
    "dashboard.growth.view.tabReferral": "Refer a friend",
    "dashboard.growth.view.weeklyCardLabel": "If you finish this week's plan",
    "dashboard.growth.view.statScoreToday": "Score today",
    "dashboard.growth.view.statProjected": "Projected after plan",
    "dashboard.growth.view.statPointsWithinReach": "Points within reach",
    "dashboard.growth.view.statGrade": "Grade",
    "dashboard.growth.view.gradeStays": "Stays a {grade}",
    "dashboard.growth.view.gradeChangeArrow": "{from} → {to}",
    "dashboard.growth.view.weeklyPlanNote.one":
      'Based on just the {count} task below — a realistic week, not every gap at once. See "Bigger projects" for the longer game.',
    "dashboard.growth.view.weeklyPlanNote.other":
      'Based on just the {count} tasks below — a realistic week, not every gap at once. See "Bigger projects" for the longer game.',
    "dashboard.growth.view.weeklyPlanNoteEmpty":
      'Nothing realistic to move this week, so this matches your current score. See "Bigger projects" for the longer game.',
    "dashboard.growth.view.actionPlanErrorPrefix": "Couldn't load your action plan: {error}",
    "dashboard.growth.view.weeklyPlanHeading": "This week's plan ({count})",
    "dashboard.growth.view.laterTasksHeading": "Bigger projects ({count})",
    "dashboard.growth.view.weeklyEmptyMessage": "You're caught up — no real gaps determinable right now. Nice work.",
    "dashboard.growth.view.weeklyFootnote":
      'Every estimate here is exactly what its check is currently missing — the same numbers behind the projected score above. Points only ever land after a re-scan actually finds the fix, never from clicking "I did this" alone.',
    "dashboard.growth.view.laterEmptyMessage":
      "Nothing longer-term right now — everything determinable is either in this week's plan or already done.",

    "dashboard.growth.coupon.defaultInstructions": "Show this coupon in-store to redeem.",
    "dashboard.growth.coupon.defaultTerms": "One per customer. Cannot combine with other offers.",
    "dashboard.growth.coupon.angleFirstTimeTitle": "First-time customer",
    "dashboard.growth.coupon.angleFirstTimeWhy":
      "Removes the risk of trying someone new — usually the highest-converting offer a business can run.",
    "dashboard.growth.coupon.angleSeasonalTitle": "Seasonal or event",
    "dashboard.growth.coupon.angleSeasonalWhy":
      "Ties your offer to a moment customers are already thinking about, so it feels timely, not random.",
    "dashboard.growth.coupon.angleSlowDayTitle": "Fill a slow day",
    "dashboard.growth.coupon.angleSlowDayWhy":
      "Turns your quietest hours into real traffic instead of leaving them empty.",
    "dashboard.growth.coupon.previewExclusiveOffer": "Exclusive offer",
    "dashboard.growth.coupon.previewOfferPlaceholder": "Your offer will appear here",
    "dashboard.growth.coupon.previewCodeLabel": "Code",
    "dashboard.growth.coupon.previewScanToRedeem": "Scan to redeem",
    "dashboard.growth.coupon.previewQrAlt": "Scan to redeem this coupon",
    "dashboard.growth.coupon.eyebrow": "Digital coupon generator",
    "dashboard.growth.coupon.heading": "Turn online lookers into walk-ins",
    "dashboard.growth.coupon.intro":
      "A first-visit or seasonal offer gives someone browsing your listing a reason to come in now. Build one below — you'll get a real, downloadable coupon with a scannable code.",
    "dashboard.growth.coupon.useThisOffer": "Use this offer",
    "dashboard.growth.coupon.offerLabel": "Your offer",
    "dashboard.growth.coupon.offerPlaceholder": "e.g. 10% off your next visit",
    "dashboard.growth.coupon.quickPicksFor": "Quick picks for {label}",
    "dashboard.growth.coupon.expiresLabel": "Expires",
    "dashboard.growth.coupon.moreOptions": "More options",
    "dashboard.growth.coupon.redemptionCodeLabel": "Redemption code",
    "dashboard.growth.coupon.generateNewCodeAriaLabel": "Generate a new code",
    "dashboard.growth.coupon.codeAutoGeneratedNote": "Auto-generated — edit it if you'd rather use your own.",
    "dashboard.growth.coupon.instructionsLabel": "Instructions on the coupon",
    "dashboard.growth.coupon.termsLabel": "Terms",
    "dashboard.growth.coupon.optionalHint": "(optional)",
    "dashboard.growth.coupon.livePreview": "Live preview",
    "dashboard.growth.coupon.downloadGenerating": "Generating...",
    "dashboard.growth.coupon.downloadImage": "Download image",
    "dashboard.growth.coupon.share": "Share",
    "dashboard.growth.coupon.downloadHint": "Add an offer and an expiry date to download your coupon.",
    "dashboard.growth.coupon.downloadErrorFallback": "Could not generate the image — try again.",
    "dashboard.growth.coupon.starting": "Starting…",
    "dashboard.growth.coupon.startAndTrack": "Start & track this offer",
    "dashboard.growth.coupon.atLimitMessage.one":
      "You can run up to {count} coupon at once. End one in Active promotions below to start a new one.",
    "dashboard.growth.coupon.atLimitMessage.other":
      "You can run up to {count} coupons at once. End one in Active promotions below to start a new one.",
    "dashboard.growth.coupon.startSuccess": "Started — track redemptions in Active promotions below.",
    "dashboard.growth.coupon.startErrorFallback": "Couldn't start this — try again.",
    "dashboard.growth.coupon.startLimitError.one":
      "You're already running {count} active coupon — end one in Active promotions below before starting another.",
    "dashboard.growth.coupon.startLimitError.other":
      "You're already running {count} active coupons — end one in Active promotions below before starting another.",
    "dashboard.growth.coupon.disclaimer":
      "This creates a real image you share yourself — PostScore doesn't post it to Google or text it to customers automatically.",
    "dashboard.growth.coupon.shareModalTitle": "How to share your coupon",

    "dashboard.growth.activePromotions.redeemErrorFallback": "Couldn't log that — try again.",
    "dashboard.growth.activePromotions.endErrorFallback": "Couldn't end this — try again.",
    "dashboard.growth.activePromotions.redeemLogging": "Logging…",
    "dashboard.growth.activePromotions.redeemButton": "+1 Redeemed",
    "dashboard.growth.activePromotions.share": "Share",
    "dashboard.growth.activePromotions.endConfirmQuestion": "End this coupon?",
    "dashboard.growth.activePromotions.endConfirmYes": "Yes, end it",
    "dashboard.growth.activePromotions.ending": "Ending…",
    "dashboard.growth.activePromotions.cancel": "Cancel",
    "dashboard.growth.activePromotions.endButton": "End",
    "dashboard.growth.activePromotions.shareModalTitle": "How to share your coupon",
    "dashboard.growth.activePromotions.heading": "Active promotions ({active}/{max})",
    "dashboard.growth.activePromotions.emptyState":
      'Nothing running yet. Build a coupon above and hit "Start & track this offer" to see it here.',

    "dashboard.growth.howCouponsWork.heading": "How it works, in 3 steps",
    "dashboard.growth.howCouponsWork.whatYouNeedToKnow": "What you need to know",
    "dashboard.growth.howCouponsWork.step1Title": "1. Share it",
    "dashboard.growth.howCouponsWork.step1Body":
      'Download the coupon image and post it, text it, or print it yourself — see "How to share."',
    "dashboard.growth.howCouponsWork.step2Title": "2. Customer brings it",
    "dashboard.growth.howCouponsWork.step2Body":
      "They show the image or code — on their phone or printed — at checkout.",
    "dashboard.growth.howCouponsWork.step3Title": "3. Tap to log it",
    "dashboard.growth.howCouponsWork.step3Body":
      'Staff taps "+1 Redeemed" in Active promotions. That\'s the entire tracking system.',
    "dashboard.growth.howCouponsWork.modalTitle": "Running a coupon — what you need",
    "dashboard.growth.howCouponsWork.modalBuildLabel": "Build.",
    "dashboard.growth.howCouponsWork.modalBuildBody":
      "Pick an offer angle or write your own, set an expiry, and PostScore generates a real coupon image with a code and QR code.",
    "dashboard.growth.howCouponsWork.modalShareLabel": "Share the image.",
    "dashboard.growth.howCouponsWork.modalShareBody":
      "Download it and post it yourself — to your Google Business Profile, Instagram, Facebook, a text to regulars, or print it for the counter. PostScore never posts or sends anything on your behalf.",
    "dashboard.growth.howCouponsWork.modalCustomerLabel": "Customer shows it.",
    "dashboard.growth.howCouponsWork.modalCustomerBody":
      "They bring the image or code in — on their phone or printed — and show it at checkout.",
    "dashboard.growth.howCouponsWork.modalStaffLabel": "Staff taps +1.",
    "dashboard.growth.howCouponsWork.modalStaffBody":
      'Whoever\'s at the register taps "+1 Redeemed" on that coupon in Active promotions.',
    "dashboard.growth.howCouponsWork.modalHonestNote":
      "Be honest with yourself about what this is: the redemption count is a simple stored tally that a human increments by hand. It is not a POS integration and nothing detects a redemption automatically — if staff forgets to tap it, that redemption isn't counted.",

    "dashboard.growth.moreWays.heading": "More ways to bring people in",
    "dashboard.growth.moreWays.googlePostTitle": "Draft a Google Post",
    "dashboard.growth.moreWays.googlePostBody":
      "Generates text about your active offer for a Google Business Profile update — you copy it and post it yourself.",
    "dashboard.growth.moreWays.faqTitle": "Write an FAQ",
    "dashboard.growth.moreWays.faqBody":
      "Generates a Q&A about your active offer for your Google profile's Q&A section or your website — you post it yourself.",
    "dashboard.growth.moreWays.startCouponFirst": "Start a coupon first",
    "dashboard.growth.moreWays.generateDraft": "Generate draft",
    "dashboard.growth.moreWays.modalTitleGooglePost": "Draft Google post",
    "dashboard.growth.moreWays.modalTitleFaq": "Draft FAQ",
    "dashboard.growth.moreWays.modalIntro":
      'This is draft text based on your active "{offer}" coupon. Copy it and post it yourself — PostScore doesn\'t post to Google or anywhere else on your behalf.',

    "dashboard.growth.referral.previewBadge": "Refer a friend",
    "dashboard.growth.referral.previewForYou": "For you",
    "dashboard.growth.referral.previewYourRewardPlaceholder": "Your reward will appear here",
    "dashboard.growth.referral.previewForFriend": "For your friend",
    "dashboard.growth.referral.previewTheirRewardPlaceholder": "Their reward will appear here",
    "dashboard.growth.referral.referralCodeLabel": "Referral code",
    "dashboard.growth.referral.previewGiveCodeNote":
      "Give this code to a friend — they mention it on their first visit.",
    "dashboard.growth.referral.eyebrow": "Referral program builder",
    "dashboard.growth.referral.heading": "Let happy customers bring you new ones",
    "dashboard.growth.referral.intro":
      "Set a reward for both sides — the customer who refers, and the friend they bring in. Build one below and you'll get a real, downloadable referral card with a code.",
    "dashboard.growth.referral.quickPicksFor": "Quick picks for {label}",
    "dashboard.growth.referral.presetYouGet": "You get: ",
    "dashboard.growth.referral.presetFriendGets": "Friend gets: ",
    "dashboard.growth.referral.useThisReward": "Use this reward",
    "dashboard.growth.referral.referrerRewardLabel": "Reward for the referrer (existing customer)",
    "dashboard.growth.referral.referrerRewardPlaceholder": "e.g. $15 off your next visit",
    "dashboard.growth.referral.friendRewardLabel": "Reward for the friend (new customer)",
    "dashboard.growth.referral.friendRewardPlaceholder": "e.g. 20% off their first visit",
    "dashboard.growth.referral.moreOptions": "More options",
    "dashboard.growth.referral.generateNewCodeAriaLabel": "Generate a new code",
    "dashboard.growth.referral.codeAutoGeneratedNote": "Auto-generated — edit it if you'd rather use your own.",
    "dashboard.growth.referral.livePreview": "Live preview",
    "dashboard.growth.referral.downloadGenerating": "Generating...",
    "dashboard.growth.referral.downloadImage": "Download image",
    "dashboard.growth.referral.downloadHint": "Add a reward for both sides to download your referral card.",
    "dashboard.growth.referral.downloadErrorFallback": "Could not generate the image — try again.",
    "dashboard.growth.referral.starting": "Starting…",
    "dashboard.growth.referral.startAndTrack": "Start & track this referral",
    "dashboard.growth.referral.atLimitMessage":
      "You can run 1 referral program at a time. End it in Active referral below to start a new one.",
    "dashboard.growth.referral.startSuccess": "Started — track redemptions in Active referral below.",
    "dashboard.growth.referral.startErrorFallback": "Couldn't start this — try again.",
    "dashboard.growth.referral.startLimitError":
      "You're already running a referral program — end it in Active referral below before starting another.",
    "dashboard.growth.referral.disclaimer":
      "This creates a real image you share yourself — with a customer, who then shares it with their friend. PostScore doesn't post it to Google, text anyone, or detect referrals automatically. Redemptions are a tally you or your staff log by hand in Active referral below.",

    "dashboard.growth.activeReferral.redeemErrorFallback": "Couldn't log that — try again.",
    "dashboard.growth.activeReferral.endErrorFallback": "Couldn't end this — try again.",
    "dashboard.growth.activeReferral.heading": "Active referral ({active}/{max})",
    "dashboard.growth.activeReferral.emptyState":
      'Nothing running yet. Build a referral offer above and hit "Start & track this referral" to see it here.',
    "dashboard.growth.activeReferral.youGet": "You get: ",
    "dashboard.growth.activeReferral.friendGets": "Friend gets: ",
    "dashboard.growth.activeReferral.redeemLogging": "Logging…",
    "dashboard.growth.activeReferral.redeemButton": "+1 Referral",
    "dashboard.growth.activeReferral.share": "Share",
    "dashboard.growth.activeReferral.endConfirmQuestion": "End this referral program?",
    "dashboard.growth.activeReferral.endConfirmYes": "Yes, end it",
    "dashboard.growth.activeReferral.ending": "Ending…",
    "dashboard.growth.activeReferral.cancel": "Cancel",
    "dashboard.growth.activeReferral.endButton": "End",
    "dashboard.growth.activeReferral.shareModalTitle": "How to share your referral offer",

    "dashboard.growth.shareModal.disclaimer":
      "PostScore doesn't post to Google, Instagram, or text anyone automatically — download the image, then use any of these to post or send it yourself.",
    "dashboard.growth.shareModal.optionGoogleTitle": "Post to your Google Business Profile",
    "dashboard.growth.shareModal.optionGoogleHowTo":
      "Open your Business Profile, go to Posts → Add update, paste the caption below, and attach the image you downloaded.",
    "dashboard.growth.shareModal.optionSocialTitle": "Post to Instagram or Facebook",
    "dashboard.growth.shareModal.optionSocialHowTo":
      "Start a new post or story, attach the image, and paste the caption below.",
    "dashboard.growth.shareModal.optionTextTitle": "Text it to regulars",
    "dashboard.growth.shareModal.optionTextHowTo":
      "Text the caption below (and attach the image, if your phone supports it) to customers you've had before.",
    "dashboard.growth.shareModal.optionPrintTitle": "Print it for the counter",
    "dashboard.growth.shareModal.optionPrintHowTo":
      "Print the image and set it by the register, window, or waiting area.",
    "dashboard.growth.shareModal.captionLabel": "Pre-written caption",
  },
  es: {
    "language.en": "Inglés",
    "language.es": "Español",
    "common.save": "Guardar",
    // "common.cancel" intentionally left untranslated for now — t()
    // below falls back to the English string ("Cancel") until this is
    // filled in, so leaving it out is safe rather than a bug.
    "common.and": "y",

    "report.subject": "{businessName} — su informe PostScore de {month}",
    "report.monthHeading": "Informe de {month}",

    "report.headline.baseline":
      "Su punto de partida está definido — le damos la bienvenida a PostScore. Aquí es donde se encuentra hoy.",
    "report.headline.steady": "Un mes estable — su presencia se mantuvo firme.",

    "report.tone.positive": "Excelente progreso este mes.",
    "report.tone.negative": "Son cosas que pasan — esto es en lo que conviene concentrarse para darle la vuelta.",

    "report.fragment.scoreRose.one": "su puntuación subió {count} punto",
    "report.fragment.scoreRose.other": "su puntuación subió {count} puntos",
    "report.fragment.scoreDropped.one": "su puntuación bajó {count} punto",
    "report.fragment.scoreDropped.other": "su puntuación bajó {count} puntos",
    "report.fragment.gradeChanged": "su nota cambió a {grade}",
    "report.fragment.reviewsGained.one": "sumó {count} reseña",
    "report.fragment.reviewsGained.other": "sumó {count} reseñas",
    "report.fragment.reviewsLost.one": "perdió {count} reseña",
    "report.fragment.reviewsLost.other": "perdió {count} reseñas",
    "report.fragment.ratingRose": "su calificación subió a {value}★",
    "report.fragment.ratingDropped": "su calificación bajó a {value}★",
    "report.fragment.competitorUp": "subió al puesto #{rank} de {total}",
    "report.fragment.competitorDown": "bajó al puesto #{rank} de {total}",
    "report.fragment.listingChanges.one": "hubo {count} cambio en su ficha",
    "report.fragment.listingChanges.other": "hubo {count} cambios en su ficha",

    "report.label.rating": "Calificación",
    "report.label.reviewCount": "Número de reseñas",
    "report.unmeasured.rating": "este análisis no incluyó un valor de calificación real.",
    "report.unmeasured.reviewCount": "este análisis no incluyó un número de reseñas real.",
    "report.metric.notMeasuredPrefix": "No se midió en este período — ",
    "report.metric.noPrior": "{value} (no hay informe anterior con el que comparar)",
    "report.metric.unchanged": "{value} — sin cambios",
    "report.metric.delta": "{value} ({delta} frente al informe anterior)",

    // report.score.summary intentionally has no Spanish value — it's pure
    // placeholders ("{total}/100 · {grade}"), so it stays on the English
    // fallback rather than a translation with nothing to actually
    // translate.
    "report.score.sinceLastReport": "{delta} desde el último informe",

    "report.focus.label": "Este mes y en qué concentrarse",
    "report.focus.nothingNotable":
      "Nada notable que señalar este mes — su ficha y su sitio web están en muy buena forma en todos los aspectos.",

    "report.competitorSection.label": "Posición frente a la competencia",
    "report.competitorSection.unavailable":
      "Sin seguimiento en este período — no hay ningún análisis de la competencia disponible para comparar.",
    "report.competitorSection.rank": "#{rank} de {total} en la zona",
    "report.competitorSection.same": "Igual que en su último informe.",
    "report.competitorSection.movedUp": "Subió desde el puesto #{rank} del informe anterior.",
    "report.competitorSection.movedDown": "Bajó desde el puesto #{rank} del informe anterior.",

    "report.listingSection.label": "Cambios en la ficha",
    "report.listingSection.unavailable":
      "No disponible para esta comparación — uno de los dos análisis es anterior al seguimiento de cambios en la ficha, o este es su primer informe.",
    "report.listingSection.none": "No se detectaron otros cambios en la ficha este mes.",

    "report.baselineNote":
      "Este es su primer informe de PostScore — un verdadero punto de partida, no una tendencia. El informe del próximo mes mostrará el cambio real de un mes a otro.",

    "report.footer.enabledForPrefix": "Está recibiendo esto porque los informes mensuales por correo están activados para ",
    "report.footer.unsubscribeLinkText": "Darse de baja de estos informes",

    "dashboard.competitors.title": "Competencia",
    "dashboard.competitors.subtitle":
      "{competitorNoun} reales cercanos{categoryClause}, evaluados con el mismo motor de PostScore y ordenados estrictamente por esa puntuación.",
    "dashboard.competitors.categoryClause": " en la misma categoría ({categoryLabel})",
    "dashboard.competitors.backTo": "Volver a {name}",
    "dashboard.competitors.businessFallback": "negocio",
    "dashboard.competitors.rankedHeading": "Ordenados por PostScore{rankSuffix}",
    "dashboard.competitors.rankSuffix": " — usted es el #{rank} de {total}",
    "dashboard.competitors.unscoredHeading": "Encontrados cerca, pero no se pudieron evaluar",
    "dashboard.competitors.nothingToCompare":
      "Su PostScore ({total}) se muestra arriba, pero aún no hay nada con qué compararlo — amplíe su área de búsqueda o vuelva más tarde a medida que aparezcan más negocios cerca.",
    "dashboard.competitors.noRating": "Sin calificación",
    "dashboard.competitors.reviewCount.one": "{count} reseña",
    "dashboard.competitors.reviewCount.other": "{count} reseñas",
    "dashboard.competitors.noReviewCount": "Sin número de reseñas",
    "dashboard.competitors.hasWebsite": "Tiene sitio web",
    "dashboard.competitors.noWebsite": "Sin sitio web",
    "dashboard.competitors.milesSuffix": " mi",
    "dashboard.competitors.yourBusiness": "Su negocio",
    "dashboard.competitors.noAddress": "Sin dirección registrada",
    "dashboard.competitors.postscoreOutOf100": "PostScore / 100",
    // savingScan, saveScan, saved, noComparableCompetitors, and
    // saveError have no Spanish value yet — not part of the reviewed
    // list this was translated from. Each falls back to English via
    // t()/tPlural until reviewed Spanish copy is provided for them.

    // --- content.checks.* / content.listingChange.* / report.* /
    // dashboard.* — reviewed Spanish translations for the shared content
    // layer extracted in Step L3 (beat 1). Every en key added there has
    // a real, reviewed es value here; none were machine-translated.
    "content.checks.visibility.rating.label": "Calificación de estrellas",
    "content.checks.visibility.rating.advice": "Mejore su calificación promedio de estrellas — pida reseñas a los clientes satisfechos (más reseñas también significa que su calificación tiene más peso) y dé seguimiento a las negativas.",
    "content.checks.visibility.rating.explanation.noReviews": "Aún no tiene reseñas en Google — esto es lo que más está frenando su visibilidad.",
    "content.checks.visibility.rating.explanation.notFound": "Google no devolvió ninguna calificación de estrellas para esta ficha.",
    "content.checks.visibility.rating.explanation.noReviewCountBackup": "Calificación de {rating}★ en Google, pero Google no devolvió un número de reseñas que la respalde — se muestra con menor confianza hasta que se verifique el volumen de reseñas.",
    "content.checks.visibility.rating.explanation.lowConfidence.one": "Calificación de {rating}★ en Google, pero basada en solo {count} reseña — a medida que reúna más reseñas, esta calificación tendrá más peso en su puntuación.",
    "content.checks.visibility.rating.explanation.lowConfidence.other": "Calificación de {rating}★ en Google, pero basada en solo {count} reseñas — a medida que reúna más reseñas, esta calificación tendrá más peso en su puntuación.",
    "content.checks.visibility.rating.explanation.confident": "Calificación de {rating}★ en Google.",
    "content.checks.visibility.review_count.label": "Número de reseñas",
    "content.checks.visibility.review_count.advice": "Consiga más reseñas en Google — pídalas directamente a clientes recientes, o agregue un enlace de reseña en los recibos y correos de seguimiento.",
    "content.checks.visibility.review_count.explanation.zero": "0 reseñas en Google — pida reseñas a sus clientes para empezar a generar prueba social.",
    "content.checks.visibility.review_count.explanation.nonzero.one": "{count} reseña en Google (crédito completo a partir de {saturation}+).",
    "content.checks.visibility.review_count.explanation.nonzero.other": "{count} reseñas en Google (crédito completo a partir de {saturation}+).",
    "content.checks.visibility.review_recency.label": "Actualidad de las reseñas",
    "content.checks.visibility.review_recency.advice": "Mantenga un flujo regular de reseñas — la actividad reciente les indica a los clientes (y a Google) que el negocio está activo.",
    "content.checks.visibility.review_recency.explanation.notCollected": "La integración actual de Google Places aún no recopila las fechas de las reseñas, por lo que esta comprobación se excluye en lugar de contarse como una falla.",
    "content.checks.visibility.review_recency.explanation.recent": "La reseña más reciente fue hace {days} día(s).",
    "content.checks.completeness.phone.label": "Número de teléfono",
    "content.checks.completeness.phone.advice": "Agregue un número de teléfono a su Perfil de Negocio de Google.",
    "content.checks.completeness.phone.explanation.present": "El número de teléfono está en la ficha.",
    "content.checks.completeness.phone.explanation.missing": "No hay número de teléfono en la ficha.",
    "content.checks.completeness.address.label": "Dirección",
    "content.checks.completeness.address.advice": "Agregue una dirección completa y verificada a su Perfil de Negocio de Google.",
    "content.checks.completeness.address.explanation.present": "La dirección está en la ficha.",
    "content.checks.completeness.address.explanation.missing": "No hay dirección en la ficha.",
    "content.checks.completeness.hours.label": "Horario de atención",
    "content.checks.completeness.hours.advice": "Agregue su horario de atención a su Perfil de Negocio de Google.",
    "content.checks.completeness.hours.explanation.present": "El horario de atención está en la ficha.",
    "content.checks.completeness.hours.explanation.missing": "No hay horario de atención en la ficha.",
    "content.checks.completeness.website_link.label": "Enlace al sitio web en la ficha",
    "content.checks.completeness.website_link.advice": "Enlace su sitio web en su Perfil de Negocio de Google.",
    "content.checks.completeness.website_link.explanation.present": "El sitio web está enlazado en la ficha.",
    "content.checks.completeness.website_link.explanation.missing": "No hay ningún sitio web enlazado en la ficha.",
    "content.checks.completeness.categories.label": "Categorías",
    "content.checks.completeness.categories.advice": "Agregue categorías de negocio a su Perfil de Negocio de Google para que los clientes puedan encontrarlo por lo que ofrece.",
    "content.checks.completeness.categories.explanation.hasList.one": "{count} categoría en la ficha.",
    "content.checks.completeness.categories.explanation.hasList.other": "{count} categorías en la ficha.",
    "content.checks.completeness.categories.explanation.primaryOnly": "No hay una lista completa de categorías, pero hay una categoría principal (\"{category}\") registrada.",
    "content.checks.completeness.categories.explanation.none": "No hay categorías en la ficha.",
    "content.checks.completeness.photos.label": "Fotos",
    "content.checks.completeness.photos.advice": "Agregue fotos a su Perfil de Negocio de Google — las fichas con fotos generan más interacción.",
    "content.checks.completeness.photos.explanation.notFound": "Google no devolvió datos de fotos para esta ficha.",
    "content.checks.completeness.photos.explanation.has.one": "{count} foto en la ficha.",
    "content.checks.completeness.photos.explanation.has.other": "{count} fotos en la ficha.",
    "content.checks.completeness.photos.explanation.none": "No hay fotos en la ficha.",
    "content.checks.completeness.business_status.label": "Estado operativo",
    "content.checks.completeness.business_status.advice": "Asegúrese de que su Perfil de Negocio de Google aparezca como Operativo.",
    "content.checks.completeness.business_status.explanation.notFound": "Google no devolvió el estado del negocio para esta ficha.",
    "content.checks.completeness.business_status.explanation.operational": "La ficha aparece como Operativo.",
    "content.checks.completeness.business_status.explanation.closed": "La ficha aparece como {status}.",
    "content.checks.completeness.business_status.explanation.unrecognized": "La ficha tiene un estado no reconocido (\"{status}\") — no se puede evaluar con confianza.",
    "content.checks.website.has_website.label": "Tiene un sitio web",
    "content.checks.website.has_website.advice": "Consiga un sitio web para su negocio — es una de las señales de confianza más importantes para los clientes potenciales.",
    "content.checks.website.has_website.explanation.present": "El negocio tiene un sitio web registrado.",
    "content.checks.website.has_website.explanation.missing": "No hay ningún sitio web registrado.",
    "content.checks.website.https.label": "Usa HTTPS",
    "content.checks.website.https.advice": "Migre su sitio web a HTTPS — los navegadores marcan los sitios sin HTTPS como \"no seguro\", lo que le resta confianza.",
    "content.checks.website.https.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.https.explanation.https": "Confirmado con una comprobación en vivo: el sitio carga correctamente por HTTPS.",
    "content.checks.website.https.explanation.httpOnly": "Confirmado con una comprobación en vivo: el sitio solo carga por HTTP — no se encontró un HTTPS funcional.",
    "content.checks.website.https.explanation.unreachable": "No se pudo verificar HTTPS — una comprobación en vivo de este sitio agotó el tiempo de espera, tuvo un error de red o fue bloqueada. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.https.explanation.notChecked": "Aún no se ha comprobado HTTPS para este sitio.",
    "content.checks.website.performance_mobile.label": "Rendimiento y móvil",
    "content.checks.website.performance_mobile.advice": "Acelere su sitio — comprima las imágenes, use un alojamiento estático rápido y elimine los scripts innecesarios. Una página ligera (como el sitio inicial de PostScore) carga rápido de forma predeterminada.",
    "content.checks.website.performance_mobile.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.performance_mobile.explanation.notAnalyzed": "Este sitio aún no se ha analizado — vuelva a escanear para ejecutar una comprobación real de PageSpeed.",
    "content.checks.website.performance_mobile.explanation.noScore": "No se pudo obtener una puntuación real de PageSpeed para este sitio — o la comprobación de PageSpeed de PostScore aún no está configurada, o la API de Google PageSpeed Insights no pudo completar la auditoría. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.performance_mobile.explanation.fast": "Rápido en móvil — puntuación de rendimiento móvil de Google PageSpeed de {score}/100.",
    "content.checks.website.performance_mobile.explanation.slowish": "Carga un poco lento en móvil — puntuación de rendimiento móvil de Google PageSpeed de {score}/100.",
    "content.checks.website.performance_mobile.explanation.slow": "Carga lento en móvil — puntuación de rendimiento móvil de Google PageSpeed de solo {score}/100.",
    "content.checks.website.content_depth.label": "Profundidad del contenido",
    "content.checks.website.content_depth.advice": "Desarrolle contenido real — un título y una meta descripción, algunos encabezados reales y una cantidad genuina de texto sobre lo que ofrece. Un solo bloque vacío se percibe como un sitio sin terminar, tanto para los visitantes como para los motores de búsqueda.",
    "content.checks.website.content_depth.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.content_depth.explanation.couldntRead": "No se pudo leer el contenido de este sitio — es posible que la comprobación automática haya sido bloqueada. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.content_depth.explanation.notAnalyzed": "Este sitio aún no se ha analizado — vuelva a escanear para comprobar su contenido real.",
    "content.checks.website.content_depth.explanation.clientRenderedShell": "No se pudo verificar — este sitio muestra su contenido con JavaScript, que nuestra comprobación estática no puede leer. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.content_depth.explanation.recoveredBase": "Este sitio muestra su contenido con JavaScript — verificado usando la auditoría real de página renderizada de Google en lugar de una descarga estática.",
    "content.checks.website.content_depth.explanation.confirmedPresentTemplate": "Confirmado presente: {items}.",
    "content.checks.website.content_depth.explanation.confirmedMissingTemplate": "Confirmado ausente: {items}.",
    "content.checks.website.content_depth.explanation.recoveredNote": "La profundidad o extensión del contenido no se pudo confirmar de forma independiente para este sitio y no se acredita en ningún sentido.",
    "content.checks.website.content_depth.explanation.presentTitle": "un título de página",
    "content.checks.website.content_depth.explanation.presentMeta": "una meta descripción",
    "content.checks.website.content_depth.explanation.presentViewport": "una etiqueta viewport para móviles",
    "content.checks.website.content_depth.explanation.presentHeadings": "encabezados reales",
    "content.checks.website.content_depth.explanation.missingTitle": "no se encontró un título de página",
    "content.checks.website.content_depth.explanation.missingMeta": "no se encontró una meta descripción",
    "content.checks.website.content_depth.explanation.missingViewport": "no está optimizado para móviles (sin etiqueta viewport)",
    "content.checks.website.content_depth.explanation.missingHeadings": "sin encabezados o secciones reales",
    "content.checks.website.content_depth.explanation.allGood": "Contenido real y sustancial: hay un título, una meta descripción, encabezados y una etiqueta viewport para móviles.",
    "content.checks.website.content_depth.explanation.gapsTemplate": "Deficiencias de contenido encontradas: {items}.",
    "content.checks.website.content_depth.explanation.gapNoTitle": "sin título de página",
    "content.checks.website.content_depth.explanation.gapNoMeta": "sin meta descripción",
    "content.checks.website.content_depth.explanation.gapNoViewport": "no está optimizado para móviles (sin etiqueta viewport)",
    "content.checks.website.content_depth.explanation.gapNoHeadings": "sin encabezados o secciones reales",
    "content.checks.website.content_depth.explanation.gapThinContent": "muy poco contenido — se percibe como una página de aterrizaje vacía",
    "content.checks.website.contact_conversion.label": "Contacto y conversión",
    "content.checks.website.contact_conversion.advice": "Agregue un enlace real de teléfono con clic para llamar o una dirección de correo electrónico, y una llamada a la acción clara (p. ej. \"Llamar ahora\" o \"Reservar una cita\") — los visitantes no deberían tener que buscar cómo contactarlo.",
    "content.checks.website.contact_conversion.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.contact_conversion.explanation.couldntRead": "No se pudo leer el contenido de este sitio — es posible que la comprobación automática haya sido bloqueada. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.contact_conversion.explanation.notAnalyzed": "Este sitio aún no se ha analizado — vuelva a escanear para comprobar su información de contacto y llamadas a la acción reales.",
    "content.checks.website.contact_conversion.explanation.clientRenderedShell": "No se pudo verificar — este sitio muestra su contenido con JavaScript, que nuestra comprobación estática no puede leer. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.contact_conversion.explanation.allGood": "Hay un enlace de contacto real y una llamada a la acción clara.",
    "content.checks.website.contact_conversion.explanation.noContact": "no se encontró un enlace de teléfono con clic para llamar ni de correo electrónico",
    "content.checks.website.contact_conversion.explanation.noCta": "no se encontró una llamada a la acción clara",
    "content.checks.website.about_presence.label": "Acerca de / nuestra historia",
    "content.checks.website.about_presence.advice": "Agregue una página real de Acerca de o Nuestra historia (enlazada desde su navegación principal) — una breve página de antecedentes o de equipo les da confianza a los visitantes de que este es un negocio real y establecido.",
    "content.checks.website.about_presence.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.about_presence.explanation.notAnalyzed": "Este sitio aún no se ha analizado — vuelva a escanear para comprobar su navegación real.",
    "content.checks.website.about_presence.explanation.found": "Se encontró una página real de Acerca de / Nuestra historia enlazada desde la navegación o el mapa del sitio.",
    "content.checks.website.about_presence.explanation.notFound": "No se pudo verificar — no se encontró ninguna página de Acerca de / Nuestra historia en la navegación ni en el mapa del sitio. Un sitio de una sola página puede tener este contenido en su página de inicio, lo cual no podemos detectar. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.checks.website.services_presence.label": "Servicios / productos",
    "content.checks.website.services_presence.advice": "Agregue una página real de Servicios, Productos o Menú (enlazada desde su navegación principal) — tanto los visitantes como los motores de búsqueda buscan una lista clara de lo que ofrece.",
    "content.checks.website.services_presence.explanation.noWebsite": "No aplica — no hay ningún sitio web registrado para comprobar.",
    "content.checks.website.services_presence.explanation.notAnalyzed": "Este sitio aún no se ha analizado — vuelva a escanear para comprobar su navegación real.",
    "content.checks.website.services_presence.explanation.found": "Se encontró una página real de Servicios / Productos enlazada desde la navegación o el mapa del sitio.",
    "content.checks.website.services_presence.explanation.notFound": "No se pudo verificar — no se encontró ninguna página de Servicios / Productos en la navegación ni en el mapa del sitio. Un sitio de una sola página puede listarlos en su página de inicio, lo cual no podemos detectar. Se excluye de su puntuación, no se cuenta en su contra.",
    "content.listingChange.phone.added": "Se agregó un número de teléfono a su ficha.",
    "content.listingChange.phone.removed": "Se eliminó el número de teléfono de su ficha.",
    "content.listingChange.phone.changed": "Su número de teléfono cambió.",
    "content.listingChange.website.added": "Se agregó un sitio web a su ficha.",
    "content.listingChange.website.removed": "Se eliminó el sitio web de su ficha.",
    "content.listingChange.website.changed": "La URL de su sitio web cambió.",
    "content.listingChange.hours.added": "Se agregó el horario a su ficha.",
    "content.listingChange.hours.removed": "Se eliminó el horario de su ficha.",
    "content.listingChange.hours.changed": "Su horario cambió.",
    "content.listingChange.categories.addedPart": "se agregó {list}",
    "content.listingChange.categories.removedPart": "se eliminó {list}",
    "content.listingChange.categories.changed": "Sus categorías cambiaron — {parts}.",
    "content.listingChange.photos.added.one": "{count} foto agregada.",
    "content.listingChange.photos.added.other": "{count} fotos agregadas.",
    "content.listingChange.photos.removed.one": "Se eliminó una foto.",
    "content.listingChange.photos.removed.other": "Se eliminaron {count} fotos.",
    "content.listingChange.rating.rose": "Su calificación subió de {previous}★ a {current}★.",
    "content.listingChange.rating.dropped": "Su calificación bajó de {previous}★ a {current}★.",
    "content.listingChange.reviews.gained.one": "{count} reseña nueva.",
    "content.listingChange.reviews.gained.other": "{count} reseñas nuevas.",
    "content.listingChange.reviews.lost": "Su número de reseñas bajó en {count}.",
    "content.listingChange.status.operational": "Operativo",
    "content.listingChange.status.closedTemporarily": "Cerrado temporalmente",
    "content.listingChange.status.closedPermanently": "Cerrado permanentemente",
    "content.listingChange.status.changed": "El estado de su ficha cambió de {previous} a {current}.",
    "report.focus.biggestOpportunity": "Su mayor oportunidad: {label} — {advice}",
    "report.focus.alsoWorthALook": "También vale la pena revisar: {label} — {advice}",
    "report.focus.listingIssue": "Cambio en la ficha que vale la pena revisar: {description}",
    "report.focus.competitorGap.one": "El negocio mejor posicionado cerca de usted tiene {count} reseña más que usted — cerrar esa brecha mejora su posición.",
    "report.focus.competitorGap.other": "El negocio mejor posicionado cerca de usted tiene {count} reseñas más que usted — cerrar esa brecha mejora su posición.",
    "report.focus.generalTip": "Consejo general: publicar de vez en cuando una novedad u oferta en su Perfil de Negocio de Google ayuda a mantener su ficha activa en las búsquedas locales — esto no es algo que midamos actualmente, así que tómelo como una orientación general, no como un informe de estado.",
    "report.summary.reviewsGained.one": "{count} reseña nueva",
    "report.summary.reviewsGained.other": "{count} reseñas nuevas",
    "report.summary.reviewsLost": "su número de reseñas bajó en {count}",
    "report.summary.listingChanges.one": "{count} cambio detectado en su ficha",
    "report.summary.listingChanges.other": "{count} cambios detectados en su ficha",
    "dashboard.website.excludedPoints.one": "{count} punto aún sin verificar, no se cuenta ni a favor ni en contra.",
    "dashboard.website.excludedPoints.other": "{count} puntos aún sin verificar, no se cuentan ni a favor ni en contra.",
    "dashboard.website.allVerified": "Todas las comprobaciones del sitio web tienen datos reales y verificados.",
    "dashboard.actionPlan.weeklyReviewTarget.one": "Consiga {count}+ reseña nueva esta semana ({before} → {after}+)",
    "dashboard.actionPlan.weeklyReviewTarget.other": "Consiga {count}+ reseñas nuevas esta semana ({before} → {after}+)",
    "dashboard.reports.recapDayCount.one": "{count} día",
    "dashboard.reports.recapDayCount.other": "{count} días",

    // --- dashboard.growth.* — reviewed Spanish translations for the
    // Growth section extracted in Step L4 (beat 1). gradeChangeArrow is
    // intentionally absent (pure placeholders, "{from} → {to}") — falls
    // back to English via t()/tPlural until/unless it's ever given one.
    "dashboard.growth.view.backTo": "Volver a {name}",
    "dashboard.growth.view.businessFallback": "negocio",
    "dashboard.growth.view.businessNameFallback": "Su negocio",
    "dashboard.growth.view.title": "Crecimiento",
    "dashboard.growth.view.subtitle": "Suba su puntuación y atraiga a más clientes por la puerta — todo lo que puede poner en práctica, en un solo lugar.",
    "dashboard.growth.view.tabPlan": "Plan de acción",
    "dashboard.growth.view.tabCoupons": "Cupones",
    "dashboard.growth.view.tabReferral": "Recomiende a un amigo",
    "dashboard.growth.view.weeklyCardLabel": "Si completa el plan de esta semana",
    "dashboard.growth.view.statScoreToday": "Puntuación de hoy",
    "dashboard.growth.view.statProjected": "Proyectada tras el plan",
    "dashboard.growth.view.statPointsWithinReach": "Puntos a su alcance",
    "dashboard.growth.view.statGrade": "Nota",
    "dashboard.growth.view.gradeStays": "Se mantiene en {grade}",
    "dashboard.growth.view.weeklyPlanNote.one": "Basado solo en {count} tarea de abajo — una semana realista, no todas las deficiencias a la vez. Consulte \"Proyectos más grandes\" para el plan a más largo plazo.",
    "dashboard.growth.view.weeklyPlanNote.other": "Basado solo en las {count} tareas de abajo — una semana realista, no todas las deficiencias a la vez. Consulte \"Proyectos más grandes\" para el plan a más largo plazo.",
    "dashboard.growth.view.weeklyPlanNoteEmpty": "No hay nada realista que mejorar esta semana, así que esto coincide con su puntuación actual. Consulte \"Proyectos más grandes\" para el plan a más largo plazo.",
    "dashboard.growth.view.actionPlanErrorPrefix": "No se pudo cargar su plan de acción: {error}",
    "dashboard.growth.view.weeklyPlanHeading": "El plan de esta semana ({count})",
    "dashboard.growth.view.laterTasksHeading": "Proyectos más grandes ({count})",
    "dashboard.growth.view.weeklyEmptyMessage": "Está al día — no hay deficiencias reales que se puedan determinar ahora mismo. Buen trabajo.",
    "dashboard.growth.view.weeklyFootnote": "Cada estimación aquí es exactamente lo que le falta actualmente a esa comprobación — los mismos números detrás de la puntuación proyectada de arriba. Los puntos solo se acreditan después de que un nuevo análisis realmente encuentre la mejora, nunca por hacer clic en \"Ya lo hice\" por sí solo.",
    "dashboard.growth.view.laterEmptyMessage": "Nada a más largo plazo ahora mismo — todo lo que se puede determinar está en el plan de esta semana o ya está hecho.",
    "dashboard.growth.coupon.defaultInstructions": "Muestre este cupón en la tienda para canjearlo.",
    "dashboard.growth.coupon.defaultTerms": "Uno por cliente. No se puede combinar con otras ofertas.",
    "dashboard.growth.coupon.angleFirstTimeTitle": "Cliente por primera vez",
    "dashboard.growth.coupon.angleFirstTimeWhy": "Elimina el riesgo de probar algo nuevo — suele ser la oferta con mayor conversión que un negocio puede ofrecer.",
    "dashboard.growth.coupon.angleSeasonalTitle": "Temporada o evento",
    "dashboard.growth.coupon.angleSeasonalWhy": "Vincula su oferta a un momento en el que los clientes ya están pensando, así se siente oportuna y no aleatoria.",
    "dashboard.growth.coupon.angleSlowDayTitle": "Llene un día lento",
    "dashboard.growth.coupon.angleSlowDayWhy": "Convierte sus horas más tranquilas en tráfico real en lugar de dejarlas vacías.",
    "dashboard.growth.coupon.previewExclusiveOffer": "Oferta exclusiva",
    "dashboard.growth.coupon.previewOfferPlaceholder": "Su oferta aparecerá aquí",
    "dashboard.growth.coupon.previewCodeLabel": "Código",
    "dashboard.growth.coupon.previewScanToRedeem": "Escanee para canjear",
    "dashboard.growth.coupon.previewQrAlt": "Escanee para canjear este cupón",
    "dashboard.growth.coupon.eyebrow": "Generador de cupones digitales",
    "dashboard.growth.coupon.heading": "Convierta las miradas en línea en visitas reales",
    "dashboard.growth.coupon.intro": "Una oferta de primera visita o de temporada le da a quien navega su ficha una razón para venir ahora. Cree una abajo — obtendrá un cupón real y descargable con un código escaneable.",
    "dashboard.growth.coupon.useThisOffer": "Usar esta oferta",
    "dashboard.growth.coupon.offerLabel": "Su oferta",
    "dashboard.growth.coupon.offerPlaceholder": "p. ej. 10% de descuento en su próxima visita",
    "dashboard.growth.coupon.quickPicksFor": "Selección rápida para {label}",
    "dashboard.growth.coupon.expiresLabel": "Vence",
    "dashboard.growth.coupon.moreOptions": "Más opciones",
    "dashboard.growth.coupon.redemptionCodeLabel": "Código de canje",
    "dashboard.growth.coupon.generateNewCodeAriaLabel": "Generar un código nuevo",
    "dashboard.growth.coupon.codeAutoGeneratedNote": "Generado automáticamente — edítelo si prefiere usar el suyo.",
    "dashboard.growth.coupon.instructionsLabel": "Instrucciones en el cupón",
    "dashboard.growth.coupon.termsLabel": "Términos",
    "dashboard.growth.coupon.optionalHint": "(opcional)",
    "dashboard.growth.coupon.livePreview": "Vista previa en vivo",
    "dashboard.growth.coupon.downloadGenerating": "Generando...",
    "dashboard.growth.coupon.downloadImage": "Descargar imagen",
    "dashboard.growth.coupon.share": "Compartir",
    "dashboard.growth.coupon.downloadHint": "Agregue una oferta y una fecha de vencimiento para descargar su cupón.",
    "dashboard.growth.coupon.downloadErrorFallback": "No se pudo generar la imagen — inténtelo de nuevo.",
    "dashboard.growth.coupon.starting": "Iniciando…",
    "dashboard.growth.coupon.startAndTrack": "Iniciar y hacer seguimiento de esta oferta",
    "dashboard.growth.coupon.atLimitMessage.one": "Puede tener hasta {count} cupón activo a la vez. Finalice uno en Promociones activas abajo para iniciar uno nuevo.",
    "dashboard.growth.coupon.atLimitMessage.other": "Puede tener hasta {count} cupones activos a la vez. Finalice uno en Promociones activas abajo para iniciar uno nuevo.",
    "dashboard.growth.coupon.startSuccess": "Iniciado — haga seguimiento de los canjes en Promociones activas abajo.",
    "dashboard.growth.coupon.startErrorFallback": "No se pudo iniciar — inténtelo de nuevo.",
    "dashboard.growth.coupon.startLimitError.one": "Ya tiene {count} cupón activo — finalice uno en Promociones activas abajo antes de iniciar otro.",
    "dashboard.growth.coupon.startLimitError.other": "Ya tiene {count} cupones activos — finalice uno en Promociones activas abajo antes de iniciar otro.",
    "dashboard.growth.coupon.disclaimer": "Esto crea una imagen real que usted mismo comparte — PostScore no la publica en Google ni la envía por mensaje a los clientes automáticamente.",
    "dashboard.growth.coupon.shareModalTitle": "Cómo compartir su cupón",
    "dashboard.growth.activePromotions.redeemErrorFallback": "No se pudo registrar — inténtelo de nuevo.",
    "dashboard.growth.activePromotions.endErrorFallback": "No se pudo finalizar — inténtelo de nuevo.",
    "dashboard.growth.activePromotions.redeemLogging": "Registrando…",
    "dashboard.growth.activePromotions.redeemButton": "+1 Canjeado",
    "dashboard.growth.activePromotions.share": "Compartir",
    "dashboard.growth.activePromotions.endConfirmQuestion": "¿Finalizar este cupón?",
    "dashboard.growth.activePromotions.endConfirmYes": "Sí, finalizarlo",
    "dashboard.growth.activePromotions.ending": "Finalizando…",
    "dashboard.growth.activePromotions.cancel": "Cancelar",
    "dashboard.growth.activePromotions.endButton": "Finalizar",
    "dashboard.growth.activePromotions.shareModalTitle": "Cómo compartir su cupón",
    "dashboard.growth.activePromotions.heading": "Promociones activas ({active}/{max})",
    "dashboard.growth.activePromotions.emptyState": "Nada en marcha todavía. Cree un cupón arriba y pulse \"Iniciar y hacer seguimiento de esta oferta\" para verlo aquí.",
    "dashboard.growth.howCouponsWork.heading": "Cómo funciona, en 3 pasos",
    "dashboard.growth.howCouponsWork.whatYouNeedToKnow": "Lo que necesita saber",
    "dashboard.growth.howCouponsWork.step1Title": "1. Compártalo",
    "dashboard.growth.howCouponsWork.step1Body": "Descargue la imagen del cupón y publíquela, envíela por mensaje o imprímala usted mismo — consulte \"Cómo compartir.\"",
    "dashboard.growth.howCouponsWork.step2Title": "2. El cliente lo trae",
    "dashboard.growth.howCouponsWork.step2Body": "Muestran la imagen o el código — en su teléfono o impreso — al pagar.",
    "dashboard.growth.howCouponsWork.step3Title": "3. Púlselo para registrarlo",
    "dashboard.growth.howCouponsWork.step3Body": "El personal pulsa \"+1 Canjeado\" en Promociones activas. Ese es todo el sistema de seguimiento.",
    "dashboard.growth.howCouponsWork.modalTitle": "Cómo llevar un cupón — lo que necesita",
    "dashboard.growth.howCouponsWork.modalBuildLabel": "Cree.",
    "dashboard.growth.howCouponsWork.modalBuildBody": "Elija un enfoque de oferta o escriba el suyo, fije un vencimiento, y PostScore genera una imagen de cupón real con un código y un código QR.",
    "dashboard.growth.howCouponsWork.modalShareLabel": "Comparta la imagen.",
    "dashboard.growth.howCouponsWork.modalShareBody": "Descárguela y publíquela usted mismo — en su Perfil de Negocio de Google, Instagram, Facebook, un mensaje a sus clientes habituales, o imprímala para el mostrador. PostScore nunca publica ni envía nada en su nombre.",
    "dashboard.growth.howCouponsWork.modalCustomerLabel": "El cliente lo muestra.",
    "dashboard.growth.howCouponsWork.modalCustomerBody": "Traen la imagen o el código — en su teléfono o impreso — y lo muestran al pagar.",
    "dashboard.growth.howCouponsWork.modalStaffLabel": "El personal pulsa +1.",
    "dashboard.growth.howCouponsWork.modalStaffBody": "Quien esté en la caja pulsa \"+1 Canjeado\" en ese cupón en Promociones activas.",
    "dashboard.growth.howCouponsWork.modalHonestNote": "Sea honesto consigo mismo sobre lo que es esto: el conteo de canjes es un simple registro almacenado que una persona incrementa a mano. No es una integración con el punto de venta y nada detecta un canje automáticamente — si el personal olvida marcarlo, ese canje no se cuenta.",
    "dashboard.growth.moreWays.heading": "Más formas de atraer gente",
    "dashboard.growth.moreWays.googlePostTitle": "Redacte una publicación de Google",
    "dashboard.growth.moreWays.googlePostBody": "Genera texto sobre su oferta activa para una actualización del Perfil de Negocio de Google — usted lo copia y lo publica.",
    "dashboard.growth.moreWays.faqTitle": "Escriba una sección de preguntas frecuentes",
    "dashboard.growth.moreWays.faqBody": "Genera una pregunta y respuesta sobre su oferta activa para la sección de preguntas y respuestas de su perfil de Google o su sitio web — usted la publica.",
    "dashboard.growth.moreWays.startCouponFirst": "Primero inicie un cupón",
    "dashboard.growth.moreWays.generateDraft": "Generar borrador",
    "dashboard.growth.moreWays.modalTitleGooglePost": "Borrador de publicación de Google",
    "dashboard.growth.moreWays.modalTitleFaq": "Borrador de preguntas frecuentes",
    "dashboard.growth.moreWays.modalIntro": "Este es un texto de borrador basado en su cupón activo \"{offer}\". Cópielo y publíquelo usted mismo — PostScore no publica en Google ni en ningún otro lugar en su nombre.",
    "dashboard.growth.referral.previewBadge": "Recomiende a un amigo",
    "dashboard.growth.referral.previewForYou": "Para usted",
    "dashboard.growth.referral.previewYourRewardPlaceholder": "Su recompensa aparecerá aquí",
    "dashboard.growth.referral.previewForFriend": "Para su amigo",
    "dashboard.growth.referral.previewTheirRewardPlaceholder": "La recompensa de su amigo aparecerá aquí",
    "dashboard.growth.referral.referralCodeLabel": "Código de referido",
    "dashboard.growth.referral.previewGiveCodeNote": "Dele este código a un amigo — lo menciona en su primera visita.",
    "dashboard.growth.referral.eyebrow": "Generador de programa de referidos",
    "dashboard.growth.referral.heading": "Deje que los clientes satisfechos le traigan nuevos",
    "dashboard.growth.referral.intro": "Fije una recompensa para ambas partes — el cliente que recomienda y el amigo que trae. Cree una abajo y obtendrá una tarjeta de referido real y descargable con un código.",
    "dashboard.growth.referral.quickPicksFor": "Selección rápida para {label}",
    "dashboard.growth.referral.presetYouGet": "Usted recibe: ",
    "dashboard.growth.referral.presetFriendGets": "El amigo recibe: ",
    "dashboard.growth.referral.useThisReward": "Usar esta recompensa",
    "dashboard.growth.referral.referrerRewardLabel": "Recompensa para quien recomienda (cliente existente)",
    "dashboard.growth.referral.referrerRewardPlaceholder": "p. ej. $15 de descuento en su próxima visita",
    "dashboard.growth.referral.friendRewardLabel": "Recompensa para el amigo (cliente nuevo)",
    "dashboard.growth.referral.friendRewardPlaceholder": "p. ej. 20% de descuento en su primera visita",
    "dashboard.growth.referral.moreOptions": "Más opciones",
    "dashboard.growth.referral.generateNewCodeAriaLabel": "Generar un código nuevo",
    "dashboard.growth.referral.codeAutoGeneratedNote": "Generado automáticamente — edítelo si prefiere usar el suyo.",
    "dashboard.growth.referral.livePreview": "Vista previa en vivo",
    "dashboard.growth.referral.downloadGenerating": "Generando...",
    "dashboard.growth.referral.downloadImage": "Descargar imagen",
    "dashboard.growth.referral.downloadHint": "Agregue una recompensa para ambas partes para descargar su tarjeta de referido.",
    "dashboard.growth.referral.downloadErrorFallback": "No se pudo generar la imagen — inténtelo de nuevo.",
    "dashboard.growth.referral.starting": "Iniciando…",
    "dashboard.growth.referral.startAndTrack": "Iniciar y hacer seguimiento de este referido",
    "dashboard.growth.referral.atLimitMessage": "Puede tener 1 programa de referidos a la vez. Finalícelo en Referido activo abajo para iniciar uno nuevo.",
    "dashboard.growth.referral.startSuccess": "Iniciado — haga seguimiento de los canjes en Referido activo abajo.",
    "dashboard.growth.referral.startErrorFallback": "No se pudo iniciar — inténtelo de nuevo.",
    "dashboard.growth.referral.startLimitError": "Ya tiene un programa de referidos en marcha — finalícelo en Referido activo abajo antes de iniciar otro.",
    "dashboard.growth.referral.disclaimer": "Esto crea una imagen real que usted mismo comparte — con un cliente, que luego la comparte con su amigo. PostScore no la publica en Google, no envía mensajes a nadie ni detecta referidos automáticamente. Los canjes son un registro que usted o su personal llevan a mano en Referido activo abajo.",
    "dashboard.growth.activeReferral.redeemErrorFallback": "No se pudo registrar — inténtelo de nuevo.",
    "dashboard.growth.activeReferral.endErrorFallback": "No se pudo finalizar — inténtelo de nuevo.",
    "dashboard.growth.activeReferral.heading": "Referido activo ({active}/{max})",
    "dashboard.growth.activeReferral.emptyState": "Nada en marcha todavía. Cree una oferta de referido arriba y pulse \"Iniciar y hacer seguimiento de este referido\" para verla aquí.",
    "dashboard.growth.activeReferral.youGet": "Usted recibe: ",
    "dashboard.growth.activeReferral.friendGets": "El amigo recibe: ",
    "dashboard.growth.activeReferral.redeemLogging": "Registrando…",
    "dashboard.growth.activeReferral.redeemButton": "+1 Referido",
    "dashboard.growth.activeReferral.share": "Compartir",
    "dashboard.growth.activeReferral.endConfirmQuestion": "¿Finalizar este programa de referidos?",
    "dashboard.growth.activeReferral.endConfirmYes": "Sí, finalizarlo",
    "dashboard.growth.activeReferral.ending": "Finalizando…",
    "dashboard.growth.activeReferral.cancel": "Cancelar",
    "dashboard.growth.activeReferral.endButton": "Finalizar",
    "dashboard.growth.activeReferral.shareModalTitle": "Cómo compartir su oferta de referido",
    "dashboard.growth.shareModal.disclaimer": "PostScore no publica en Google, Instagram ni envía mensajes a nadie automáticamente — descargue la imagen y luego use cualquiera de estas opciones para publicarla o enviarla usted mismo.",
    "dashboard.growth.shareModal.optionGoogleTitle": "Publicar en su Perfil de Negocio de Google",
    "dashboard.growth.shareModal.optionGoogleHowTo": "Abra su Perfil de Negocio, vaya a Publicaciones → Agregar novedad, pegue el texto de abajo y adjunte la imagen que descargó.",
    "dashboard.growth.shareModal.optionSocialTitle": "Publicar en Instagram o Facebook",
    "dashboard.growth.shareModal.optionSocialHowTo": "Inicie una nueva publicación o historia, adjunte la imagen y pegue el texto de abajo.",
    "dashboard.growth.shareModal.optionTextTitle": "Envíelo por mensaje a sus clientes habituales",
    "dashboard.growth.shareModal.optionTextHowTo": "Envíe por mensaje el texto de abajo (y adjunte la imagen, si su teléfono lo permite) a clientes que ya ha tenido antes.",
    "dashboard.growth.shareModal.optionPrintTitle": "Imprímalo para el mostrador",
    "dashboard.growth.shareModal.optionPrintHowTo": "Imprima la imagen y colóquela junto a la caja, la ventana o la zona de espera.",
    "dashboard.growth.shareModal.captionLabel": "Texto pre-escrito",
  },
};

/** Substitutes every {name} placeholder in `template` with String(params[name]),
 * leaving any placeholder with no matching param untouched rather than
 * guessing or throwing. */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Looks up `key` in `locale`'s dictionary, falls back to the English
 * string if that locale hasn't translated this key yet (and to the raw
 * key itself if even English is somehow missing it — never blank/
 * undefined), then substitutes any `params` into the resolved template.
 */
export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

/**
 * Resolves one of the report/dashboard messages that vary by count. Asks
 * Intl.PluralRules for `locale`'s REAL plural category for `count` —
 * never hardcoded to just "one"/"other" — so a future locale with more
 * categories (e.g. Arabic's "zero"/"one"/"two"/"few"/"many"/"other", or
 * Polish's "few"/"many") resolves correctly once seeded.
 *
 * `count` always drives the REAL plural-category selection, but the
 * value actually interpolated for `{count}` in the template defaults to
 * `count` itself and can be overridden via `params.count` — e.g. passing
 * the locale-formatted `entry.reviewCount.toLocaleString()` ("1,234") as
 * `params.count` while still passing the raw number as `count` so
 * Intl.PluralRules sees the real number, not a formatted string. Any
 * other `{name}` placeholder in the template comes from `params` the
 * same way t() handles it.
 *
 * Fallback order when `locale` doesn't have that exact category seeded
 * (e.g. "es" today, which has no report.* or dashboard.* translations
 * at all yet):
 *   1. `locale`'s own text for this exact category
 *   2. English's text for this SAME exact category — this is the common
 *      case for an untranslated locale, and matters: it keeps the right
 *      grammatical number (singular vs. plural) even while only English
 *      copy exists, rather than jumping straight to English's "other"
 *      and showing a plural where the real count is 1.
 *   3. `locale`'s own "other" text (covers a locale that has translated
 *      some categories but not this one)
 *   4. English's "other" text
 *   5. the raw key, as an absolute last resort
 * Never blank/undefined at any step.
 */
export function tPlural(
  locale: Locale,
  keyBase: PluralKeyBase,
  count: number,
  params: Record<string, string | number> = {}
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const dictLocale = messages[locale] as Partial<Record<string, string>>;
  const dictDefault = messages[DEFAULT_LOCALE] as Partial<Record<string, string>>;
  const template =
    dictLocale[`${keyBase}.${category}`] ??
    dictDefault[`${keyBase}.${category}`] ??
    dictLocale[`${keyBase}.other`] ??
    dictDefault[`${keyBase}.other`] ??
    `${keyBase}.other`;
  return interpolate(template, { count, ...params });
}
