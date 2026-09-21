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
  | "dashboard.growth.shareModal.captionLabel"
  // --- Part A: app-wide shared UI strings (components/ui/CopyBlock.tsx,
  // components/ui/Modal.tsx, lib/promos.ts's redemptionLabel).
  | "dashboard.common.copyText"
  | "dashboard.common.copied"
  | "dashboard.common.close"
  | "dashboard.common.noRedemptionsLogged"
  | "dashboard.common.redemptionCount.one"
  | "dashboard.common.redemptionCount.other"
  // --- Part B: Website section (app/business/[id]/website/*) — the
  // section's OWN chrome only. Scoring-check label/advice/explanation
  // text stays on content.checks.* (L3, never re-extracted here); any
  // string sourced from config/bizProfiles.ts (L8) or lib/starterSite.ts's
  // theme/font preset labels stays untouched data, never extracted here.
  | "dashboard.website.backTo"
  | "dashboard.website.businessFallback"
  | "dashboard.website.businessNameFallback"
  | "dashboard.website.pageTitle"
  | "dashboard.website.faqDraftHeading"
  | "dashboard.website.faqDraftIntro"
  | "dashboard.website.visualAnalysisHeading"
  | "dashboard.website.visualAnalysisSubtitle"
  | "dashboard.website.refreshScreenshotsButton"
  | "dashboard.website.refreshingScreenshots"
  | "dashboard.website.refreshAvailableInError.one"
  | "dashboard.website.refreshAvailableInError.other"
  | "dashboard.website.noWebsiteToScreenshot"
  | "dashboard.website.refreshErrorFallback"
  | "dashboard.website.availableInDays.one"
  | "dashboard.website.availableInDays.other"
  | "dashboard.website.screenshotAlt"
  | "dashboard.website.tapToView"
  | "dashboard.website.couldntCapturePage"
  | "dashboard.website.prevPageAriaLabel"
  | "dashboard.website.nextPageAriaLabel"
  | "dashboard.website.lightboxCouldntCapture"
  | "dashboard.website.lightboxPageCounter"
  | "dashboard.website.viewFullSizeAriaLabel"
  | "dashboard.website.homepageScreenshotAlt"
  | "dashboard.website.hideOtherPages"
  | "dashboard.website.seeMorePages.one"
  | "dashboard.website.seeMorePages.other"
  | "dashboard.website.noPreviewCaptured"
  | "dashboard.website.noPreviewCapturedNote"
  | "dashboard.website.screenshotsCaptured"
  | "dashboard.website.homepageLabel"
  | "dashboard.website.scoreHeading"
  | "dashboard.website.ptsAbbrev"
  | "dashboard.website.technicalHeading"
  | "dashboard.website.contentContactHeading"
  | "dashboard.website.couldntVerifyPrefix"
  | "dashboard.website.lighthouseScoreLabel"
  | "dashboard.website.signalTitle"
  | "dashboard.website.signalMeta"
  | "dashboard.website.signalViewport"
  | "dashboard.website.signalHeadings"
  | "dashboard.website.outOf100"
  | "dashboard.website.collapsible.title"
  | "dashboard.website.collapsible.subtitle"
  | "dashboard.website.collapsible.hide"
  | "dashboard.website.starter.taglineSizeSmall"
  | "dashboard.website.starter.taglineSizeMedium"
  | "dashboard.website.starter.taglineSizeLarge"
  | "dashboard.website.starter.placementBelow"
  | "dashboard.website.starter.placementAbove"
  | "dashboard.website.starter.notOnFile"
  | "dashboard.website.starter.eyebrow"
  | "dashboard.website.starter.headlineNoWebsite"
  | "dashboard.website.starter.headlineUnderperforming"
  | "dashboard.website.starter.headlineBackup"
  | "dashboard.website.starter.subcopyNoWebsite"
  | "dashboard.website.starter.subcopyUnderperforming"
  | "dashboard.website.starter.subcopyBackup"
  | "dashboard.website.starter.taglineLabel"
  | "dashboard.website.starter.taglineOptionalHint"
  | "dashboard.website.starter.taglinePlaceholder"
  | "dashboard.website.starter.taglineHelper"
  | "dashboard.website.starter.taglineStyleLabel"
  | "dashboard.website.starter.taglineFontLabel"
  | "dashboard.website.starter.taglineColorAriaLabel"
  | "dashboard.website.starter.colorLabel"
  | "dashboard.website.starter.reset"
  | "dashboard.website.starter.sizeLabel"
  | "dashboard.website.starter.placementLabel"
  | "dashboard.website.starter.colorThemeLabel"
  | "dashboard.website.starter.customAccentAriaLabel"
  | "dashboard.website.starter.customAccentSuffix"
  | "dashboard.website.starter.fontSectionLabel"
  | "dashboard.website.starter.photosLabel"
  | "dashboard.website.starter.photosOptionalHint"
  | "dashboard.website.starter.photosHelper"
  | "dashboard.website.starter.heroPhotoLabel"
  | "dashboard.website.starter.removePhoto"
  | "dashboard.website.starter.uploadHeroPhoto"
  | "dashboard.website.starter.contentPhotosLabel"
  | "dashboard.website.starter.removePhotoAriaLabel"
  | "dashboard.website.starter.photoErrorFallback"
  | "dashboard.website.starter.whatToIncludeLabel"
  | "dashboard.website.starter.whatToIncludeHint"
  | "dashboard.website.starter.includeAddress"
  | "dashboard.website.starter.includePhone"
  | "dashboard.website.starter.includeHours"
  | "dashboard.website.starter.includeRating"
  | "dashboard.website.starter.livePreviewLabel"
  | "dashboard.website.starter.iframeTitle"
  | "dashboard.website.starter.downloadSiteButton"
  | "dashboard.website.starter.downloadHelper"
  | "dashboard.website.starter.howToPublishHeading"
  | "dashboard.website.starter.publishStep1"
  | "dashboard.website.starter.publishStep2Prefix"
  | "dashboard.website.starter.publishStep2Suffix"
  | "dashboard.website.starter.publishStep3"
  | "dashboard.website.starter.publishStep4"
  | "dashboard.website.starter.publishFootnote"
  | "dashboard.website.starter.alreadyPublishedHeading"
  | "dashboard.website.starter.markedDoneStatus"
  | "dashboard.website.starter.notYetMarkedStatus"
  | "dashboard.website.starter.markErrorFallback"
  | "dashboard.website.starter.markSaving"
  | "dashboard.website.starter.markMarked"
  | "dashboard.website.starter.markAsPublished"
  // --- Part B: Website-reviews section (app/business/[id]/website-reviews/*)
  | "dashboard.websiteReviews.backTo"
  | "dashboard.websiteReviews.businessFallback"
  | "dashboard.websiteReviews.pageTitle"
  | "dashboard.websiteReviews.subtitle"
  | "dashboard.websiteReviews.businessNameFallback"
  | "dashboard.websiteReviews.socialProofHeading"
  | "dashboard.websiteReviews.avgRatingLabel"
  | "dashboard.websiteReviews.reviewVolumeLabel"
  | "dashboard.websiteReviews.ratingVolumeExplainer"
  | "dashboard.websiteReviews.forExampleLabel"
  | "dashboard.websiteReviews.exampleStrongTrust"
  | "dashboard.websiteReviews.exampleBuildingTrust"
  | "dashboard.websiteReviews.rubricHeading"
  | "dashboard.websiteReviews.replyAssistantLabel"
  | "dashboard.websiteReviews.replyAssistantConnectedBody"
  | "dashboard.websiteReviews.replyAssistantUnlockDescription"
  | "dashboard.websiteReviews.comingSoonLabel"
  | "dashboard.websiteReviews.autoTextTitle"
  | "dashboard.websiteReviews.autoTextBody"
  | "dashboard.websiteReviews.growthLeverEyebrow"
  | "dashboard.websiteReviews.growthLeverHeading"
  | "dashboard.websiteReviews.growthLeverIntro"
  | "dashboard.websiteReviews.noPlaceIdMessage"
  | "dashboard.websiteReviews.makeItEffortlessHeading"
  | "dashboard.websiteReviews.shareableLinkLabel"
  | "dashboard.websiteReviews.shareableLinkHelper"
  | "dashboard.websiteReviews.qrCodeLabel"
  | "dashboard.websiteReviews.qrAlt"
  | "dashboard.websiteReviews.downloadGenerating"
  | "dashboard.websiteReviews.downloadButton"
  | "dashboard.websiteReviews.downloadErrorFallback"
  | "dashboard.websiteReviews.qrHelper"
  // --- Step L6 (beat 1): shared common.* additions for the smaller
  // sections below (backTo/fallback patterns + generic listing-field
  // labels reused across Overview and Intake, per explicit instruction
  // to reuse existing copy instead of duplicating per-section keys).
  | "dashboard.common.backTo"
  | "dashboard.common.businessFallback"
  | "dashboard.common.businessNameFallback"
  | "dashboard.common.connectGoogleBusinessProfile"
  | "dashboard.common.notAvailable"
  | "dashboard.common.addressLabel"
  | "dashboard.common.phoneLabel"
  | "dashboard.common.ratingLabel"
  | "dashboard.common.reviewsLabel"
  | "dashboard.common.websiteLabel"
  // --- Overview section (app/business/[id]/page.tsx, BusinessScoreView.tsx,
  // ActionPlanSection.tsx, LocalBenchmarkTile.tsx, LiveListingSection.tsx,
  // AssistantLauncher.tsx). content.checks.* / content.listingChange.*
  // (L3) keep flowing through unchanged — not re-extracted here.
  | "dashboard.overview.assistantDataErrorFallback"
  | "dashboard.overview.categoryNotDeterminable"
  | "dashboard.overview.rescanTasksConfirmed.one"
  | "dashboard.overview.rescanTasksConfirmed.other"
  | "dashboard.overview.rescanTasksReopened.one"
  | "dashboard.overview.rescanTasksReopened.other"
  | "dashboard.overview.rescanListingChangesFound.one"
  | "dashboard.overview.rescanListingChangesFound.other"
  | "dashboard.overview.rescanSummary"
  | "dashboard.overview.rescanNothingChanged"
  | "dashboard.overview.rescanNoResultsError"
  | "dashboard.overview.rescanErrorFallback"
  | "dashboard.overview.rescanning"
  | "dashboard.overview.rescanNow"
  | "dashboard.overview.gradeMeaningAriaLabel"
  | "dashboard.overview.gradeRangesHeading"
  | "dashboard.overview.sinceLastScanLabel"
  | "dashboard.overview.trackingStartsNow"
  | "dashboard.overview.noChange"
  | "dashboard.overview.recentScansHeading"
  | "dashboard.overview.hoursLabel"
  | "dashboard.overview.googleMapsLabel"
  | "dashboard.overview.viewOnGoogleMaps"
  | "dashboard.overview.noPriorScanChanges"
  | "dashboard.overview.scoringUpdatedBetweenScans"
  | "dashboard.overview.nothingChangedSinceLastScan"
  | "dashboard.overview.updatedPillLabel"
  | "dashboard.overview.noPriorScanListingChanges"
  | "dashboard.overview.predatesListingTracking"
  | "dashboard.overview.nothingChangedOnListing"
  | "dashboard.overview.untitledBusiness"
  | "dashboard.overview.noAddressOnFile"
  | "dashboard.overview.scoringVersionNote"
  | "dashboard.overview.viewCompetitors"
  | "dashboard.overview.currentScoreHeading"
  | "dashboard.overview.gradeLabel"
  | "dashboard.overview.projectedLabel"
  | "dashboard.overview.scoreOutOf100WithGrade"
  | "dashboard.overview.seeActionPlan"
  | "dashboard.overview.assistantUnavailablePrefix"
  | "dashboard.overview.atAGlanceHeading"
  | "dashboard.overview.googleRatingLabel"
  | "dashboard.overview.googleReviewsLabel"
  | "dashboard.overview.businessListingHeading"
  | "dashboard.overview.liveListingHeading"
  | "dashboard.overview.whatChangedHeading"
  | "dashboard.overview.scoreImpactHeading"
  | "dashboard.overview.wherePointsAreHeading"
  | "dashboard.overview.detailedChecksHeading"
  | "dashboard.overview.scanHistoryHeading"
  | "dashboard.overview.noSavedScans"
  | "dashboard.overview.dateColumn"
  | "dashboard.overview.scoreColumn"
  | "dashboard.overview.gradeColumn"
  | "dashboard.overview.versionColumn"
  | "dashboard.overview.actionPlan.toDo"
  | "dashboard.overview.actionPlan.completeThisWeek"
  | "dashboard.overview.actionPlan.inProgressFraction"
  | "dashboard.overview.actionPlan.notQuiteYet"
  | "dashboard.overview.actionPlan.inProgress"
  | "dashboard.overview.actionPlan.checkedWorse"
  | "dashboard.overview.actionPlan.checkedNoChange"
  | "dashboard.overview.actionPlan.checkedWithDate"
  | "dashboard.overview.actionPlan.checkedNoDate"
  | "dashboard.overview.actionPlan.willCheckNextRescan"
  | "dashboard.overview.actionPlan.doneThisWeek"
  | "dashboard.overview.actionPlan.progressText"
  | "dashboard.overview.actionPlan.downTo"
  | "dashboard.overview.actionPlan.stillAt"
  | "dashboard.overview.actionPlan.movedWrongWay"
  | "dashboard.overview.actionPlan.realProgress"
  | "dashboard.overview.actionPlan.noRealChangeYet"
  | "dashboard.overview.actionPlan.googleStillDoesntShow"
  | "dashboard.overview.actionPlan.quickWin"
  | "dashboard.overview.actionPlan.thisWeeksAction"
  | "dashboard.overview.actionPlan.ongoingOutcome"
  | "dashboard.overview.actionPlan.firstStep"
  | "dashboard.overview.actionPlan.longerTerm"
  | "dashboard.overview.actionPlan.couldNotSave"
  | "dashboard.overview.actionPlan.hideHowToFix"
  | "dashboard.overview.actionPlan.howToFixIt"
  | "dashboard.overview.actionPlan.doThisLabel"
  | "dashboard.overview.actionPlan.howLabel"
  | "dashboard.overview.actionPlan.ownerActionOnGoogle"
  | "dashboard.overview.actionPlan.saving"
  | "dashboard.overview.actionPlan.didThisAgain"
  | "dashboard.overview.actionPlan.didThis"
  | "dashboard.overview.actionPlan.pointsThisWeek"
  | "dashboard.overview.actionPlan.pointsUpTo"
  | "dashboard.overview.actionPlan.confirmedWinsHeading"
  | "dashboard.overview.actionPlan.pointsConfirmed"
  | "dashboard.overview.localBenchmarkLabel"
  | "dashboard.overview.saveScanToSeeRanking"
  | "dashboard.overview.noComparablePeers"
  | "dashboard.overview.rankOfPeerCount"
  | "dashboard.overview.aheadOfNearby"
  | "dashboard.overview.smallSampleSuffix"
  | "dashboard.overview.profileChecklistTitle"
  | "dashboard.overview.profileChecklistDescription"
  | "dashboard.overview.gbpConnectedNotWiredUp"
  | "dashboard.overview.ptsAvailable"
  | "dashboard.overview.askPostAI"
  | "dashboard.overview.betaLabel"
  | "dashboard.overview.assistantPrompt"
  | "dashboard.overview.pastConversations.one"
  | "dashboard.overview.pastConversations.other"
  | "dashboard.overview.postAiOverlayTitle"
  // --- Connect-GBP section (app/business/[id]/connect-gbp/*,
  // components/gbp/ConnectToUnlock.tsx).
  | "dashboard.connectGbp.unlockEditableListingTitle"
  | "dashboard.connectGbp.unlockEditableListingBody"
  | "dashboard.connectGbp.unlockCompletenessFixesTitle"
  | "dashboard.connectGbp.unlockCompletenessFixesBody"
  | "dashboard.connectGbp.unlockReviewRecencyTitle"
  | "dashboard.connectGbp.unlockReviewRecencyBody"
  | "dashboard.connectGbp.unlockReplyAssistantTitle"
  | "dashboard.connectGbp.unlockReplyAssistantBody"
  | "dashboard.connectGbp.unlockReplyRateStatsTitle"
  | "dashboard.connectGbp.unlockReplyRateStatsBody"
  | "dashboard.connectGbp.unlockInsightsLeadsTitle"
  | "dashboard.connectGbp.unlockInsightsLeadsBody"
  | "dashboard.connectGbp.unlockPostsTrackingTitle"
  | "dashboard.connectGbp.unlockPostsTrackingBody"
  | "dashboard.connectGbp.disconnecting"
  | "dashboard.connectGbp.disconnect"
  | "dashboard.connectGbp.disconnectError"
  | "dashboard.connectGbp.pageTitle"
  | "dashboard.connectGbp.pageSubtitle"
  | "dashboard.connectGbp.justConnectedMessage"
  | "dashboard.connectGbp.connectedHeading"
  | "dashboard.connectGbp.sinceDate"
  | "dashboard.connectGbp.connectedFallback"
  | "dashboard.connectGbp.notWiredUpSuffix"
  | "dashboard.connectGbp.readyToConnectHeading"
  | "dashboard.connectGbp.oauthConfiguredBody"
  | "dashboard.connectGbp.oauthNotConfiguredBody"
  | "dashboard.connectGbp.skipForNow"
  | "dashboard.connectGbp.connectToUnlock"
  | "dashboard.connectGbp.needsConnectedGbp"
  // --- Reports section (app/business/[id]/reports/*).
  | "dashboard.reports.pageTitle"
  | "dashboard.reports.subtitle"
  | "dashboard.reports.scoreOverTimeHeading"
  | "dashboard.reports.monthlyRecapHeading"
  | "dashboard.reports.whatWeveVerifiedHeading"
  // --- Intake section (app/business/new/*). No business exists yet at
  // this stage, so page.tsx wires these via DEFAULT_LOCALE explicitly.
  | "dashboard.intake.pageTitle"
  | "dashboard.intake.pageSubtitle"
  | "dashboard.intake.nameLabel"
  | "dashboard.intake.categoryLabel"
  | "dashboard.intake.languageLabel"
  | "dashboard.intake.savedOpening"
  | "dashboard.intake.saving"
  | "dashboard.intake.addThisBusiness"
  | "dashboard.intake.sessionExpiredError"
  | "dashboard.intake.findBusinessHeading"
  | "dashboard.intake.businessNameFieldLabel"
  | "dashboard.intake.businessNamePlaceholder"
  | "dashboard.intake.locationFieldLabel"
  | "dashboard.intake.locationPlaceholder"
  | "dashboard.intake.searching"
  | "dashboard.intake.searchButton"
  | "dashboard.intake.searchFailedError"
  | "dashboard.intake.resultHeading"
  | "dashboard.intake.noMatchingBusiness"
  | "dashboard.intake.multipleMatches"
  // --- Lib sweep: lib/reviews.ts's ratingCaption()/reviewCountCaption(),
  // rendered only in website-reviews's ReviewsView.tsx — namespaced under
  // the existing dashboard.websiteReviews.* section rather than a new
  // dashboard.reviewsLib.*, since that's the only place these render.
  | "dashboard.websiteReviews.ratingCaptionNoRating"
  | "dashboard.websiteReviews.ratingCaptionAtTarget"
  | "dashboard.websiteReviews.ratingCaptionBelowTarget"
  | "dashboard.websiteReviews.reviewCountCaptionNone"
  | "dashboard.websiteReviews.reviewCountCaptionPassed"
  | "dashboard.websiteReviews.reviewCountCaptionRemaining.one"
  | "dashboard.websiteReviews.reviewCountCaptionRemaining.other"
  // --- Step L6 (beat 2), Part B: Reports section's own child components
  // (MonthlyRecapCard.tsx, MonthlyEmailReportCard.tsx, ScoreHistoryChart.tsx).
  | "dashboard.reports.recapFirstScanMessage"
  | "dashboard.reports.recapWhatChangedHeading"
  | "dashboard.reports.recapChangesUnavailable"
  | "dashboard.reports.recapNoChangesDetected"
  | "dashboard.reports.recapPreparingDownload"
  | "dashboard.reports.recapDownloadButton"
  | "dashboard.reports.recapShareButton"
  | "dashboard.reports.recapImageError"
  | "dashboard.reports.recapShareTitle"
  | "dashboard.reports.recapShareText"
  | "dashboard.reports.recapShareDropped"
  | "dashboard.reports.recapShareRose"
  | "dashboard.reports.emailSaveError"
  | "dashboard.reports.monthlyEmailReportLabel"
  | "dashboard.reports.onLabel"
  | "dashboard.reports.offLabel"
  | "dashboard.reports.emailComingSoon"
  | "dashboard.reports.emailOffMessage"
  | "dashboard.reports.emailFirstReportBaseline"
  | "dashboard.reports.emailLastSentNext"
  | "dashboard.reports.chartRangeWeekly"
  | "dashboard.reports.chartRange6Months"
  | "dashboard.reports.chartRangeAllTime"
  | "dashboard.reports.chartRangeLabelWeek"
  | "dashboard.reports.chartRangeLabel6Months"
  | "dashboard.reports.chartRangeLabelAllTime"
  | "dashboard.reports.chartToday"
  | "dashboard.reports.chartDaysAgo.one"
  | "dashboard.reports.chartDaysAgo.other"
  | "dashboard.reports.chartNoHistoryYet"
  | "dashboard.reports.chartNotEnoughHistory"
  | "dashboard.reports.chartChangeLabel"
  | "dashboard.reports.chartTotalScansLabel"
  | "dashboard.reports.chartLastScanLabel"
  | "dashboard.reports.chartMoreEarlier"
  | "dashboard.reports.chartAriaLabel";

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
  | "dashboard.growth.coupon.startLimitError"
  | "dashboard.common.redemptionCount"
  | "dashboard.website.refreshAvailableInError"
  | "dashboard.website.availableInDays"
  | "dashboard.website.seeMorePages"
  | "dashboard.overview.rescanTasksConfirmed"
  | "dashboard.overview.rescanTasksReopened"
  | "dashboard.overview.rescanListingChangesFound"
  | "dashboard.overview.pastConversations"
  | "dashboard.websiteReviews.reviewCountCaptionRemaining"
  | "dashboard.reports.chartDaysAgo";

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

    // --- dashboard.common.* — Step L5 (beat 1), Part A: app-wide shared
    // UI strings, pure extraction, byte-for-byte.
    "dashboard.common.copyText": "Copy text",
    "dashboard.common.copied": "Copied",
    "dashboard.common.close": "Close",
    "dashboard.common.noRedemptionsLogged": "No redemptions logged yet",
    "dashboard.common.redemptionCount.one": "{count} redemption logged",
    "dashboard.common.redemptionCount.other": "{count} redemptions logged",

    // --- dashboard.website.* — Step L5 (beat 1), Part B: the Website
    // section's own chrome. content.checks.* (L3) is never duplicated
    // here; bizProfiles/lib/starterSite.ts preset data stays untouched.
    "dashboard.website.backTo": "Back to {name}",
    "dashboard.website.businessFallback": "business",
    "dashboard.website.businessNameFallback": "Your business",
    "dashboard.website.pageTitle": "Website",
    "dashboard.website.faqDraftHeading": "FAQ draft",
    "dashboard.website.faqDraftIntro":
      "A starter FAQ for your website, based on what customers of this kind of business typically ask — publishing tools are still coming together, but you're welcome to copy this in today.",
    "dashboard.website.visualAnalysisHeading": "Visual analysis",
    "dashboard.website.visualAnalysisSubtitle": "What customers actually see when they visit your live site.",
    "dashboard.website.refreshScreenshotsButton": "Refresh screenshots",
    "dashboard.website.refreshingScreenshots": "Refreshing...",
    "dashboard.website.refreshAvailableInError.one": "Screenshots refresh available in {count} day.",
    "dashboard.website.refreshAvailableInError.other": "Screenshots refresh available in {count} days.",
    "dashboard.website.noWebsiteToScreenshot": "This business has no website to screenshot.",
    "dashboard.website.refreshErrorFallback": "Couldn't refresh screenshots — try again shortly.",
    "dashboard.website.availableInDays.one": "Available in {count} day",
    "dashboard.website.availableInDays.other": "Available in {count} days",
    "dashboard.website.screenshotAlt": "Screenshot of the {label} page",
    "dashboard.website.tapToView": "Tap to view",
    "dashboard.website.couldntCapturePage": "Couldn't capture this page",
    "dashboard.website.prevPageAriaLabel": "Previous page",
    "dashboard.website.nextPageAriaLabel": "Next page",
    "dashboard.website.lightboxCouldntCapture": "We couldn't capture this page.",
    "dashboard.website.lightboxPageCounter": "{current} of {total}",
    "dashboard.website.viewFullSizeAriaLabel": "View full-size homepage screenshot",
    "dashboard.website.homepageScreenshotAlt": "Screenshot of the business's live website",
    "dashboard.website.hideOtherPages": "Hide other pages",
    "dashboard.website.seeMorePages.one": "See {count} more page",
    "dashboard.website.seeMorePages.other": "See {count} more pages",
    "dashboard.website.noPreviewCaptured": "We couldn't capture a preview of this site.",
    "dashboard.website.noPreviewCapturedNote":
      "Some sites block automated screenshot tools, or a preview hasn't been captured yet — this doesn't affect your Website score.",
    "dashboard.website.screenshotsCaptured": "Screenshots captured {date}",
    "dashboard.website.homepageLabel": "Homepage",
    "dashboard.website.scoreHeading": "Website score",
    "dashboard.website.ptsAbbrev": "pts",
    "dashboard.website.technicalHeading": "Technical",
    "dashboard.website.contentContactHeading": "Content & contact",
    "dashboard.website.couldntVerifyPrefix": "Couldn't verify —",
    "dashboard.website.lighthouseScoreLabel": "Lighthouse mobile score",
    "dashboard.website.signalTitle": "Title",
    "dashboard.website.signalMeta": "Meta description",
    "dashboard.website.signalViewport": "Viewport",
    "dashboard.website.signalHeadings": "Headings",
    "dashboard.website.outOf100": "/ 100",
    "dashboard.website.collapsible.title": "Starter website generator",
    "dashboard.website.collapsible.subtitle":
      "— build a backup or fresh starting point from your real listing data",
    "dashboard.website.collapsible.hide": "Hide starter website generator",
    "dashboard.website.starter.taglineSizeSmall": "Small",
    "dashboard.website.starter.taglineSizeMedium": "Medium",
    "dashboard.website.starter.taglineSizeLarge": "Large",
    "dashboard.website.starter.placementBelow": "Below name",
    "dashboard.website.starter.placementAbove": "Above name",
    "dashboard.website.starter.notOnFile": "Not on file",
    "dashboard.website.starter.eyebrow": "Starter website generator",
    "dashboard.website.starter.headlineNoWebsite": "Turn your Google data into a real website",
    "dashboard.website.starter.headlineUnderperforming": "Your current site may be holding you back",
    "dashboard.website.starter.headlineBackup": "Build a backup starter site",
    "dashboard.website.starter.subcopyNoWebsite":
      "No website is one of the biggest gaps in your PostScore. This builds a real, mobile-friendly one-page site from your actual Google listing data — nothing invented.",
    "dashboard.website.starter.subcopyUnderperforming":
      "Your website's real, measured PostScore is lower than what this free starter template would score for the same business — see the visual analysis above for exactly why. A clean rebuild could score better.",
    "dashboard.website.starter.subcopyBackup":
      "You already have a website on file, so this is here if you ever want a simple backup or a fresh starting point — not something you need.",
    "dashboard.website.starter.taglineLabel": "Tagline",
    "dashboard.website.starter.taglineOptionalHint": "(optional — write your own)",
    "dashboard.website.starter.taglinePlaceholder": "e.g. Fresh, fast, made-to-order",
    "dashboard.website.starter.taglineHelper":
      "Left blank, the site just won't show a tagline — we never write one for you.",
    "dashboard.website.starter.taglineStyleLabel": "Tagline style",
    "dashboard.website.starter.taglineFontLabel": "Font",
    "dashboard.website.starter.taglineColorAriaLabel": "Tagline color",
    "dashboard.website.starter.colorLabel": "Color",
    "dashboard.website.starter.reset": "Reset",
    "dashboard.website.starter.sizeLabel": "Size",
    "dashboard.website.starter.placementLabel": "Placement",
    "dashboard.website.starter.colorThemeLabel": "Color theme",
    "dashboard.website.starter.customAccentAriaLabel": "Custom accent color",
    "dashboard.website.starter.customAccentSuffix": " · custom accent",
    "dashboard.website.starter.fontSectionLabel": "Font",
    "dashboard.website.starter.photosLabel": "Photos",
    "dashboard.website.starter.photosOptionalHint": "(optional — your own photos)",
    "dashboard.website.starter.photosHelper":
      "Embedded directly in the downloaded file — each photo adds to its size, so a few good ones go further than many.",
    "dashboard.website.starter.heroPhotoLabel": "Hero photo",
    "dashboard.website.starter.removePhoto": "Remove",
    "dashboard.website.starter.uploadHeroPhoto": "Upload a hero photo",
    "dashboard.website.starter.contentPhotosLabel": "Content photos ({current}/{max})",
    "dashboard.website.starter.removePhotoAriaLabel": "Remove photo",
    "dashboard.website.starter.photoErrorFallback": "Couldn't process that photo — try a different image file.",
    "dashboard.website.starter.whatToIncludeLabel": "What to include",
    "dashboard.website.starter.whatToIncludeHint": "(all from your real listing)",
    "dashboard.website.starter.includeAddress": "Address & map",
    "dashboard.website.starter.includePhone": "Phone (click-to-call)",
    "dashboard.website.starter.includeHours": "Hours",
    "dashboard.website.starter.includeRating": "Rating & reviews",
    "dashboard.website.starter.livePreviewLabel": "Live preview — exactly what you'll download",
    "dashboard.website.starter.iframeTitle": "Live preview of your starter site",
    "dashboard.website.starter.downloadSiteButton": "Download site (HTML)",
    "dashboard.website.starter.downloadHelper":
      "A single, real HTML file — the same one shown above, with your chosen color theme, font, tagline, and sections baked right in. Open it in any browser, or upload it to any host to make it live.",
    "dashboard.website.starter.howToPublishHeading": "How to publish it",
    "dashboard.website.starter.publishStep1": "1. Download the file above.",
    "dashboard.website.starter.publishStep2Prefix": "2. Upload it as ",
    "dashboard.website.starter.publishStep2Suffix":
      " to any static host — a free option like Netlify Drop or GitHub Pages, or your existing hosting/cPanel if you have one.",
    "dashboard.website.starter.publishStep3": "3. That gives you a real, public URL for the site.",
    "dashboard.website.starter.publishStep4":
      "4. Add that URL to your Google Business Profile's website field, then re-save this business from Google Places here so PostScore picks it up.",
    "dashboard.website.starter.publishFootnote":
      "Downloading this file doesn't change your PostScore by itself — the Website points land only once the real site is live at a real URL, Google shows it on your listing, and a re-scan confirms it. That's the same honest rule every check on this app follows.",
    "dashboard.website.starter.alreadyPublishedHeading": "Already published it?",
    "dashboard.website.starter.markedDoneStatus":
      "Marked as pending — we'll confirm it for real the next time we re-scan your listing.",
    "dashboard.website.starter.notYetMarkedStatus":
      "This flags it on your action plan as pending — it still only completes once a re-scan verifies the real site.",
    "dashboard.website.starter.markErrorFallback": "Couldn't save that — try again.",
    "dashboard.website.starter.markSaving": "Saving...",
    "dashboard.website.starter.markMarked": "Marked",
    "dashboard.website.starter.markAsPublished": "Mark as published",

    // --- dashboard.websiteReviews.* — Step L5 (beat 1), Part B.
    "dashboard.websiteReviews.backTo": "Back to {name}",
    "dashboard.websiteReviews.businessFallback": "business",
    "dashboard.websiteReviews.pageTitle": "Reviews & Replies",
    "dashboard.websiteReviews.subtitle":
      "Everything here is your real Google data, or clearly labeled as coming soon — nothing fabricated.",
    "dashboard.websiteReviews.businessNameFallback": "Your business",
    "dashboard.websiteReviews.socialProofHeading": "Your review social proof",
    "dashboard.websiteReviews.avgRatingLabel": "Average rating",
    "dashboard.websiteReviews.reviewVolumeLabel": "Review volume",
    "dashboard.websiteReviews.ratingVolumeExplainer":
      "Rating and volume work together, not separately: a great rating from a handful of reviews doesn't carry much weight — customers (and Google) trust it more once it's backed by real volume. Building both together does more for how you're perceived than either alone.",
    "dashboard.websiteReviews.forExampleLabel": "For example:",
    "dashboard.websiteReviews.exampleStrongTrust": "{target}★ from 200 reviews — strong trust",
    "dashboard.websiteReviews.exampleBuildingTrust": "{target}★ from 5 reviews — still building trust",
    "dashboard.websiteReviews.rubricHeading": "The rubric behind your review score",
    "dashboard.websiteReviews.replyAssistantLabel": "Reply assistant",
    "dashboard.websiteReviews.replyAssistantConnectedBody":
      "Your Google Business Profile is connected — reading your actual reviews and drafting replies is a later update, not live yet. Nothing fabricated in the meantime.",
    "dashboard.websiteReviews.replyAssistantUnlockDescription":
      "Drafting replies to your actual reviews needs real Google Business Profile access — we only get your rating and review count today, not individual review content or authors. Connect your profile to unlock it.",
    "dashboard.websiteReviews.comingSoonLabel": "Coming soon",
    "dashboard.websiteReviews.autoTextTitle": "Auto-text customers after their visit",
    "dashboard.websiteReviews.autoTextBody":
      "Automatically texting a review link after a visit needs a way to know who visited and when — we don't have that yet. For now, sharing the link or sign above is on you.",
    "dashboard.websiteReviews.growthLeverEyebrow": "Growth lever",
    "dashboard.websiteReviews.growthLeverHeading": "Get more reviews — your #1 growth lever",
    "dashboard.websiteReviews.growthLeverIntro":
      "No matter your score, more reviews bring in more customers. Make leaving one effortless.",
    "dashboard.websiteReviews.noPlaceIdMessage":
      "We don't have a Google place ID on file for this business yet, so we can't build a real review link. Re-save it from a fresh Google Places lookup to pick one up.",
    "dashboard.websiteReviews.makeItEffortlessHeading": "Make it effortless",
    "dashboard.websiteReviews.shareableLinkLabel": "Shareable review link",
    "dashboard.websiteReviews.shareableLinkHelper":
      'Opens the real Google "write a review" screen for your listing. Text it to a customer, post it, or add it to a receipt or follow-up email — you send it yourself.',
    "dashboard.websiteReviews.qrCodeLabel": "Front-desk QR code",
    "dashboard.websiteReviews.qrAlt": "Scan to leave a Google review",
    "dashboard.websiteReviews.downloadGenerating": "Generating...",
    "dashboard.websiteReviews.downloadButton": "Download",
    "dashboard.websiteReviews.downloadErrorFallback": "Could not generate the image — try again.",
    "dashboard.websiteReviews.qrHelper": "A print-ready sign for your counter or window — you print and place it yourself.",

    // --- Step L6 (beat 1): dashboard.common.* additions shared across
    // Overview and Intake (generic listing-field labels + fallback/backTo
    // patterns), so these sections reuse rather than duplicate copy.
    "dashboard.common.backTo": "Back to {name}",
    "dashboard.common.businessFallback": "business",
    "dashboard.common.businessNameFallback": "Your business",
    "dashboard.common.connectGoogleBusinessProfile": "Connect Google Business Profile",
    "dashboard.common.notAvailable": "Not available",
    "dashboard.common.addressLabel": "Address",
    "dashboard.common.phoneLabel": "Phone",
    "dashboard.common.ratingLabel": "Rating",
    "dashboard.common.reviewsLabel": "Reviews",
    "dashboard.common.websiteLabel": "Website",

    // --- Overview section: app/business/[id]/page.tsx (server),
    // BusinessScoreView.tsx, ActionPlanSection.tsx, LocalBenchmarkTile.tsx,
    // LiveListingSection.tsx, AssistantLauncher.tsx.
    "dashboard.overview.assistantDataErrorFallback": "Couldn't load the assistant's grounding data.",
    "dashboard.overview.categoryNotDeterminable":
      "Not yet determinable — nothing in this category has real data yet.",
    "dashboard.overview.rescanTasksConfirmed.one": "{count} task confirmed (+{points} pts)",
    "dashboard.overview.rescanTasksConfirmed.other": "{count} tasks confirmed (+{points} pts)",
    "dashboard.overview.rescanTasksReopened.one": "{count} task back on your plan",
    "dashboard.overview.rescanTasksReopened.other": "{count} tasks back on your plan",
    "dashboard.overview.rescanListingChangesFound.one": "{count} listing change found",
    "dashboard.overview.rescanListingChangesFound.other": "{count} listing changes found",
    "dashboard.overview.rescanSummary": "Re-scanned — {parts}.",
    "dashboard.overview.rescanNothingChanged": "Re-scanned — nothing changed since last scan.",
    "dashboard.overview.rescanNoResultsError":
      "Couldn't find this listing on Google anymore — it may have been removed or merged into another listing.",
    "dashboard.overview.rescanErrorFallback": "Could not re-scan this business.",
    "dashboard.overview.rescanning": "Re-scanning...",
    "dashboard.overview.rescanNow": "Re-scan now",
    "dashboard.overview.gradeMeaningAriaLabel": "What does this grade mean?",
    "dashboard.overview.gradeRangesHeading": "Grade ranges",
    "dashboard.overview.sinceLastScanLabel": "Since last scan",
    "dashboard.overview.trackingStartsNow": "Tracking starts now — we'll show changes after your next scan.",
    "dashboard.overview.noChange": "No change",
    "dashboard.overview.recentScansHeading": "Recent scans",
    "dashboard.overview.hoursLabel": "Hours",
    "dashboard.overview.googleMapsLabel": "Google Maps",
    "dashboard.overview.viewOnGoogleMaps": "View on Google Maps",
    "dashboard.overview.noPriorScanChanges":
      "No prior scan to compare yet — changes will show up here after your next scan.",
    "dashboard.overview.scoringUpdatedBetweenScans":
      "Scoring was updated between these two scans ({previous} → {current}), so a check-by-check comparison isn't shown here — the total score above still reflects the real difference.",
    "dashboard.overview.nothingChangedSinceLastScan": "Nothing changed since your last scan.",
    "dashboard.overview.updatedPillLabel": "Updated",
    "dashboard.overview.noPriorScanListingChanges":
      "No prior scan to compare yet — real listing changes will show up here after your next re-scan.",
    "dashboard.overview.predatesListingTracking":
      "Your last scan predates listing-change tracking — this will start working from your next re-scan.",
    "dashboard.overview.nothingChangedOnListing": "Nothing changed on your listing since your last scan.",
    "dashboard.overview.untitledBusiness": "Untitled business",
    "dashboard.overview.noAddressOnFile": "No address on file",
    "dashboard.overview.scoringVersionNote":
      "Scoring version {version} · computed live from the saved Google Places data below",
    "dashboard.overview.viewCompetitors": "View competitors",
    "dashboard.overview.currentScoreHeading": "Current score",
    "dashboard.overview.gradeLabel": "Grade",
    "dashboard.overview.projectedLabel": "Projected if all suggestions completed",
    "dashboard.overview.scoreOutOf100WithGrade": "/ 100 · {grade}",
    "dashboard.overview.seeActionPlan": "See your action plan →",
    "dashboard.overview.assistantUnavailablePrefix": "The assistant isn't available right now: {message}",
    "dashboard.overview.atAGlanceHeading": "At a glance",
    "dashboard.overview.googleRatingLabel": "Google rating",
    "dashboard.overview.googleReviewsLabel": "Google reviews",
    "dashboard.overview.businessListingHeading": "Business listing",
    "dashboard.overview.liveListingHeading": "Your live Google listing",
    "dashboard.overview.whatChangedHeading": "What changed since your last scan",
    "dashboard.overview.scoreImpactHeading": "Score impact since your last scan",
    "dashboard.overview.wherePointsAreHeading": "Where your points are",
    "dashboard.overview.detailedChecksHeading": "Detailed checks",
    "dashboard.overview.scanHistoryHeading": "Scan history",
    "dashboard.overview.noSavedScans": 'No saved scans yet — click "{rescanNow}" above to record the current score.',
    "dashboard.overview.dateColumn": "Date",
    "dashboard.overview.scoreColumn": "Score",
    "dashboard.overview.gradeColumn": "Grade",
    "dashboard.overview.versionColumn": "Version",

    "dashboard.overview.actionPlan.toDo": "To do",
    "dashboard.overview.actionPlan.completeThisWeek": "Complete this week",
    "dashboard.overview.actionPlan.inProgressFraction": "In progress ({gained} of {targetDelta})",
    "dashboard.overview.actionPlan.notQuiteYet": "Not quite yet",
    "dashboard.overview.actionPlan.inProgress": "In progress",
    "dashboard.overview.actionPlan.checkedWorse": "Checked — worse",
    "dashboard.overview.actionPlan.checkedNoChange": "Checked — no change",
    "dashboard.overview.actionPlan.checkedWithDate": "Checked {date}.",
    "dashboard.overview.actionPlan.checkedNoDate": "Checked.",
    "dashboard.overview.actionPlan.willCheckNextRescan": "We'll check this on your next re-scan.",
    "dashboard.overview.actionPlan.doneThisWeek": "Done this week! You reached {current} reviews.",
    "dashboard.overview.actionPlan.progressText":
      "Progress: {gained} of {targetDelta} new reviews ({current} so far, {remaining} to go).",
    "dashboard.overview.actionPlan.downTo":
      "Down to {current} reviews (was {baseline}) — give it another go this week.",
    "dashboard.overview.actionPlan.stillAt": "Still {current} reviews — give it another go this week.",
    "dashboard.overview.actionPlan.movedWrongWay": "This moved the wrong way.",
    "dashboard.overview.actionPlan.realProgress":
      "Real progress — score points update automatically as the re-scan confirms it, never from clicking done.",
    "dashboard.overview.actionPlan.noRealChangeYet":
      "No real change yet — this confirms gradually as the real number rises, not from one action alone.",
    "dashboard.overview.actionPlan.googleStillDoesntShow":
      "Google still doesn't show this — double-check it saved, then re-scan again.",
    "dashboard.overview.actionPlan.quickWin": "Quick win",
    "dashboard.overview.actionPlan.thisWeeksAction": "This week's action",
    "dashboard.overview.actionPlan.ongoingOutcome": "Ongoing outcome",
    "dashboard.overview.actionPlan.firstStep": "First step",
    "dashboard.overview.actionPlan.longerTerm": "Longer-term",
    "dashboard.overview.actionPlan.couldNotSave": "Could not save that — try again.",
    "dashboard.overview.actionPlan.hideHowToFix": "Hide how to fix it",
    "dashboard.overview.actionPlan.howToFixIt": "How to fix it",
    "dashboard.overview.actionPlan.doThisLabel": "Do this: ",
    "dashboard.overview.actionPlan.howLabel": "How: ",
    "dashboard.overview.actionPlan.ownerActionOnGoogle":
      "This is a change you make yourself, on Google — PostScore can tell you exactly what to do, but we can't edit your listing for you.",
    "dashboard.overview.actionPlan.saving": "Saving...",
    "dashboard.overview.actionPlan.didThisAgain": "I did this again",
    "dashboard.overview.actionPlan.didThis": "I did this",
    "dashboard.overview.actionPlan.pointsThisWeek": "~+{points} pts this week",
    "dashboard.overview.actionPlan.pointsUpTo": "Up to +{points} pts",
    "dashboard.overview.actionPlan.confirmedWinsHeading": "Confirmed wins",
    "dashboard.overview.actionPlan.pointsConfirmed": "+{points} pts confirmed",

    "dashboard.overview.localBenchmarkLabel": "Local benchmark",
    "dashboard.overview.saveScanToSeeRanking": "Save a competitor scan to see your local ranking →",
    "dashboard.overview.noComparablePeers": "No comparable {competitorNoun} found in your last scan.",
    "dashboard.overview.rankOfPeerCount": "#{rank} of {peerCount}",
    "dashboard.overview.aheadOfNearby": "Ahead of {percentileAhead}% of {othersCount} nearby {competitorNoun}",
    "dashboard.overview.smallSampleSuffix": " — small sample",

    "dashboard.overview.profileChecklistTitle": "Profile-completeness checklist",
    "dashboard.overview.profileChecklistDescription":
      "Connect your Google Business Profile to see exactly which listing fields are missing, add fixes straight to your action plan, and track review recency from your real, live Google data.",
    "dashboard.overview.gbpConnectedNotWiredUp":
      "Google Business Profile connected. Live field-by-field completeness isn't wired up yet — that's a later update, not something broken here. We'll show your real checklist here once it ships.",
    "dashboard.overview.ptsAvailable": "+{points} pts available",

    "dashboard.overview.askPostAI": "Ask PostAI",
    "dashboard.overview.betaLabel": "Beta",
    "dashboard.overview.assistantPrompt": "Ask anything about your score, competitors, or what to fix next.",
    "dashboard.overview.pastConversations.one": " {count} past conversation saved.",
    "dashboard.overview.pastConversations.other": " {count} past conversations saved.",
    "dashboard.overview.postAiOverlayTitle": "PostAI",

    // --- Connect-GBP section: app/business/[id]/connect-gbp/*,
    // components/gbp/ConnectToUnlock.tsx.
    "dashboard.connectGbp.unlockEditableListingTitle": "Live, editable listing",
    "dashboard.connectGbp.unlockEditableListingBody":
      "Update your hours, phone, and other listing fields from PostScore instead of Google directly.",
    "dashboard.connectGbp.unlockCompletenessFixesTitle": "Profile-completeness fixes",
    "dashboard.connectGbp.unlockCompletenessFixesBody":
      "See exactly which listing fields are missing, and add each one straight to your action plan.",
    "dashboard.connectGbp.unlockReviewRecencyTitle": "Review recency",
    "dashboard.connectGbp.unlockReviewRecencyBody":
      "Know how fresh your reviews really are, not just your total count.",
    "dashboard.connectGbp.unlockReplyAssistantTitle": "Individual reviews + AI reply assistant",
    "dashboard.connectGbp.unlockReplyAssistantBody":
      "Read your actual reviews and get a drafted reply for each one, ready to post.",
    "dashboard.connectGbp.unlockReplyRateStatsTitle": "Reply-rate stats",
    "dashboard.connectGbp.unlockReplyRateStatsBody":
      "Track how many of your reviews you've actually replied to.",
    "dashboard.connectGbp.unlockInsightsLeadsTitle": "Insights + leads estimate",
    "dashboard.connectGbp.unlockInsightsLeadsBody":
      "Real views, calls, and clicks from your Google listing, and an estimated leads number built from them.",
    "dashboard.connectGbp.unlockPostsTrackingTitle": "Google Posts tracking",
    "dashboard.connectGbp.unlockPostsTrackingBody": "See what you've posted to Google and how it's landing.",
    "dashboard.connectGbp.disconnecting": "Disconnecting...",
    "dashboard.connectGbp.disconnect": "Disconnect",
    "dashboard.connectGbp.disconnectError": "Couldn't disconnect — try again.",
    "dashboard.connectGbp.pageTitle": "Connect your Google Business Profile",
    "dashboard.connectGbp.pageSubtitle":
      "Connecting lets PostScore read (and, for some fields, edit) your real Google Business Profile — on top of the public listing data we already score today.",
    "dashboard.connectGbp.justConnectedMessage":
      "Connected. We're still finishing Google's review process for full API access — the features below unlock as each one goes live, not all at once.",
    "dashboard.connectGbp.connectedHeading": "Google Business Profile connected",
    "dashboard.connectGbp.sinceDate": "Since {date}.",
    "dashboard.connectGbp.connectedFallback": "Connected.",
    "dashboard.connectGbp.notWiredUpSuffix":
      "Real listing/review/insights data isn't wired up yet — that's a later update, not something broken here.",
    "dashboard.connectGbp.readyToConnectHeading": "Ready to connect?",
    "dashboard.connectGbp.oauthConfiguredBody":
      "You'll go to Google to approve access, then come back here. You can disconnect at any time.",
    "dashboard.connectGbp.oauthNotConfiguredBody":
      "Google Business Profile connection isn't configured in this environment yet — check back soon.",
    "dashboard.connectGbp.skipForNow": "Skip for now",
    "dashboard.connectGbp.connectToUnlock": "Connect to unlock",
    "dashboard.connectGbp.needsConnectedGbp": "Needs a connected Google Business Profile.",

    // --- Reports section: app/business/[id]/reports/*.
    "dashboard.reports.pageTitle": "Reports & history",
    "dashboard.reports.subtitle": "Your real PostScore history — every number here comes from a scan you actually ran.",
    "dashboard.reports.scoreOverTimeHeading": "Score over time",
    "dashboard.reports.monthlyRecapHeading": "Monthly recap",
    "dashboard.reports.whatWeveVerifiedHeading": "What we've verified",

    // --- Intake section: app/business/new/*. No business exists yet at
    // this stage, so page.tsx wires these via DEFAULT_LOCALE explicitly.
    "dashboard.intake.pageTitle": "Add a business",
    "dashboard.intake.pageSubtitle": "Search for your real Google Business Profile listing to start scoring it.",
    "dashboard.intake.nameLabel": "Name",
    "dashboard.intake.categoryLabel": "Category",
    "dashboard.intake.languageLabel": "Language",
    "dashboard.intake.savedOpening": "Saved — opening…",
    "dashboard.intake.saving": "Saving...",
    "dashboard.intake.addThisBusiness": "Add this business",
    "dashboard.intake.sessionExpiredError": "Your session expired — log in again to save.",
    "dashboard.intake.findBusinessHeading": "Find your business on Google",
    "dashboard.intake.businessNameFieldLabel": "Business name",
    "dashboard.intake.businessNamePlaceholder": "e.g. Blue Bottle Coffee",
    "dashboard.intake.locationFieldLabel": "City / location",
    "dashboard.intake.locationPlaceholder": "e.g. Oakland, CA",
    "dashboard.intake.searching": "Searching...",
    "dashboard.intake.searchButton": "Search",
    "dashboard.intake.searchFailedError": "The search failed — check your connection and try again.",
    "dashboard.intake.resultHeading": "Result",
    "dashboard.intake.noMatchingBusiness":
      "No matching business found for that name and location. Try broadening the location or checking the spelling.",
    "dashboard.intake.multipleMatches": "Found {count} possible matches. Pick the correct one:",

    // --- Lib sweep: lib/reviews.ts's ratingCaption()/reviewCountCaption().
    "dashboard.websiteReviews.ratingCaptionNoRating":
      "No rating yet — this fills in once your listing has reviews.",
    "dashboard.websiteReviews.ratingCaptionAtTarget":
      "You're at {rating}★ — at or above the {target}+ most customers look for.",
    "dashboard.websiteReviews.ratingCaptionBelowTarget":
      "You're at {rating}★ — aim for {target}+ to build stronger trust at a glance.",
    "dashboard.websiteReviews.reviewCountCaptionNone":
      "No reviews yet — every review you get starts building this up.",
    "dashboard.websiteReviews.reviewCountCaptionPassed": "You've passed {milestone} reviews — {reviewCount} total.",
    "dashboard.websiteReviews.reviewCountCaptionRemaining.one": "{remaining} more review to reach {milestone}.",
    "dashboard.websiteReviews.reviewCountCaptionRemaining.other": "{remaining} more reviews to reach {milestone}.",

    // --- Step L6 (beat 2), Part B: Reports section's own child components.
    "dashboard.reports.recapFirstScanMessage":
      "This is your first recorded scan — a recap will appear here once you have two.",
    "dashboard.reports.recapWhatChangedHeading": "What changed",
    "dashboard.reports.recapChangesUnavailable":
      "One of these two scans predates listing-change tracking, so a real diff isn't available for this period.",
    "dashboard.reports.recapNoChangesDetected": "No real listing changes were detected in this period.",
    "dashboard.reports.recapPreparingDownload": "Preparing…",
    "dashboard.reports.recapDownloadButton": "Download",
    "dashboard.reports.recapShareButton": "Share",
    "dashboard.reports.recapImageError": "Couldn't generate image.",
    "dashboard.reports.recapShareTitle": "{businessName} — PostScore recap",
    "dashboard.reports.recapShareText": "{businessName}'s PostScore {direction} {fromScore} → {toScore} ({dateRangeLabel}).",
    "dashboard.reports.recapShareDropped": "dropped",
    "dashboard.reports.recapShareRose": "rose",
    "dashboard.reports.emailSaveError": "Couldn't save — try again.",
    "dashboard.reports.monthlyEmailReportLabel": "Monthly email report",
    "dashboard.reports.onLabel": "On",
    "dashboard.reports.offLabel": "Off",
    "dashboard.reports.emailComingSoon":
      "Coming soon — a real monthly recap of your PostScore, emailed to you automatically.",
    "dashboard.reports.emailOffMessage": "Off — you won't receive a monthly email report.",
    "dashboard.reports.emailFirstReportBaseline":
      "On — your first report will be a baseline (no month-over-month comparison yet).",
    "dashboard.reports.emailLastSentNext": "Last sent {lastSent} · Next report around {nextReport}",
    "dashboard.reports.chartRangeWeekly": "Weekly",
    "dashboard.reports.chartRange6Months": "6 months",
    "dashboard.reports.chartRangeAllTime": "All time",
    "dashboard.reports.chartRangeLabelWeek": "the last week",
    "dashboard.reports.chartRangeLabel6Months": "the last 6 months",
    "dashboard.reports.chartRangeLabelAllTime": "all time",
    "dashboard.reports.chartToday": "Today",
    "dashboard.reports.chartDaysAgo.one": "1 day ago",
    "dashboard.reports.chartDaysAgo.other": "{days} days ago",
    "dashboard.reports.chartNoHistoryYet":
      "You haven't run a scan yet — re-scan from the Overview page to start your history.",
    "dashboard.reports.chartNotEnoughHistory": "Not enough history yet — your chart fills in as you re-scan.",
    "dashboard.reports.chartChangeLabel": "Change · {range}",
    "dashboard.reports.chartTotalScansLabel": "Total scans recorded",
    "dashboard.reports.chartLastScanLabel": "Last scan",
    "dashboard.reports.chartMoreEarlier": "+{count} earlier",
    "dashboard.reports.chartAriaLabel": "Score over time, {count} scans, from {from} to {to}",
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

    // --- dashboard.common.* / dashboard.website.* / dashboard.websiteReviews.*
    // — reviewed Spanish translations for Step L5 (beat 1)'s shared UI +
    // Website + Website-reviews extraction. dashboard.website.excludedPoints.*
    // and dashboard.website.allVerified already had es values from L3 and
    // are not repeated here.
    "dashboard.common.copyText": "Copiar texto",
    "dashboard.common.copied": "Copiado",
    "dashboard.common.close": "Cerrar",
    "dashboard.common.noRedemptionsLogged": "Aún no se han registrado canjes",
    "dashboard.common.redemptionCount.one": "{count} canje registrado",
    "dashboard.common.redemptionCount.other": "{count} canjes registrados",
    "dashboard.website.backTo": "Volver a {name}",
    "dashboard.website.businessFallback": "negocio",
    "dashboard.website.businessNameFallback": "Su negocio",
    "dashboard.website.pageTitle": "Sitio web",
    "dashboard.website.faqDraftHeading": "Borrador de preguntas frecuentes",
    "dashboard.website.faqDraftIntro": "Una sección inicial de preguntas frecuentes para su sitio web, basada en lo que suelen preguntar los clientes de este tipo de negocio — las herramientas de publicación aún se están desarrollando, pero puede copiar esto hoy mismo.",
    "dashboard.website.visualAnalysisHeading": "Análisis visual",
    "dashboard.website.visualAnalysisSubtitle": "Lo que los clientes ven realmente cuando visitan su sitio en vivo.",
    "dashboard.website.refreshScreenshotsButton": "Actualizar capturas de pantalla",
    "dashboard.website.refreshingScreenshots": "Actualizando...",
    "dashboard.website.refreshAvailableInError.one": "La actualización de capturas estará disponible en {count} día.",
    "dashboard.website.refreshAvailableInError.other": "La actualización de capturas estará disponible en {count} días.",
    "dashboard.website.noWebsiteToScreenshot": "Este negocio no tiene un sitio web del que tomar capturas.",
    "dashboard.website.refreshErrorFallback": "No se pudieron actualizar las capturas — inténtelo de nuevo en un momento.",
    "dashboard.website.availableInDays.one": "Disponible en {count} día",
    "dashboard.website.availableInDays.other": "Disponible en {count} días",
    "dashboard.website.screenshotAlt": "Captura de pantalla de la página {label}",
    "dashboard.website.tapToView": "Pulse para ver",
    "dashboard.website.couldntCapturePage": "No se pudo capturar esta página",
    "dashboard.website.prevPageAriaLabel": "Página anterior",
    "dashboard.website.nextPageAriaLabel": "Página siguiente",
    "dashboard.website.lightboxCouldntCapture": "No pudimos capturar esta página.",
    "dashboard.website.lightboxPageCounter": "{current} de {total}",
    "dashboard.website.viewFullSizeAriaLabel": "Ver la captura de la página de inicio a tamaño completo",
    "dashboard.website.homepageScreenshotAlt": "Captura de pantalla del sitio web en vivo del negocio",
    "dashboard.website.hideOtherPages": "Ocultar otras páginas",
    "dashboard.website.seeMorePages.one": "Ver {count} página más",
    "dashboard.website.seeMorePages.other": "Ver {count} páginas más",
    "dashboard.website.noPreviewCaptured": "No pudimos capturar una vista previa de este sitio.",
    "dashboard.website.noPreviewCapturedNote": "Algunos sitios bloquean las herramientas automáticas de captura, o aún no se ha capturado una vista previa — esto no afecta su puntuación de Sitio web.",
    "dashboard.website.screenshotsCaptured": "Capturas tomadas el {date}",
    "dashboard.website.homepageLabel": "Página de inicio",
    "dashboard.website.scoreHeading": "Puntuación del sitio web",
    "dashboard.website.ptsAbbrev": "pts",
    "dashboard.website.technicalHeading": "Técnico",
    "dashboard.website.contentContactHeading": "Contenido y contacto",
    "dashboard.website.couldntVerifyPrefix": "No se pudo verificar —",
    "dashboard.website.lighthouseScoreLabel": "Puntuación móvil de Lighthouse",
    "dashboard.website.signalTitle": "Título",
    "dashboard.website.signalMeta": "Meta descripción",
    "dashboard.website.signalViewport": "Viewport",
    "dashboard.website.signalHeadings": "Encabezados",
    "dashboard.website.outOf100": "/ 100",
    "dashboard.website.collapsible.title": "Generador de sitio web inicial",
    "dashboard.website.collapsible.subtitle": "— cree una copia de seguridad o un punto de partida nuevo a partir de los datos reales de su ficha",
    "dashboard.website.collapsible.hide": "Ocultar el generador de sitio web inicial",
    "dashboard.website.starter.taglineSizeSmall": "Pequeño",
    "dashboard.website.starter.taglineSizeMedium": "Mediano",
    "dashboard.website.starter.taglineSizeLarge": "Grande",
    "dashboard.website.starter.placementBelow": "Debajo del nombre",
    "dashboard.website.starter.placementAbove": "Encima del nombre",
    "dashboard.website.starter.notOnFile": "No registrado",
    "dashboard.website.starter.eyebrow": "Generador de sitio web inicial",
    "dashboard.website.starter.headlineNoWebsite": "Convierta sus datos de Google en un sitio web real",
    "dashboard.website.starter.headlineUnderperforming": "Su sitio actual podría estar frenándolo",
    "dashboard.website.starter.headlineBackup": "Cree un sitio inicial de respaldo",
    "dashboard.website.starter.subcopyNoWebsite": "No tener un sitio web es una de las mayores deficiencias en su PostScore. Esto crea uno real, apto para móviles, de una sola página, a partir de los datos reales de su ficha de Google — nada inventado.",
    "dashboard.website.starter.subcopyUnderperforming": "El PostScore real y medido de su sitio web es más bajo que el que obtendría esta plantilla inicial gratuita para el mismo negocio — vea el análisis visual de arriba para saber exactamente por qué. Una reconstrucción limpia podría obtener una mejor puntuación.",
    "dashboard.website.starter.subcopyBackup": "Ya tiene un sitio web registrado, así que esto está aquí por si alguna vez quiere una copia de seguridad sencilla o un nuevo punto de partida — no es algo que necesite.",
    "dashboard.website.starter.taglineLabel": "Eslogan",
    "dashboard.website.starter.taglineOptionalHint": "(opcional — escriba el suyo)",
    "dashboard.website.starter.taglinePlaceholder": "p. ej. Fresco, rápido, hecho al momento",
    "dashboard.website.starter.taglineHelper": "Si lo deja en blanco, el sitio simplemente no mostrará un eslogan — nunca escribimos uno por usted.",
    "dashboard.website.starter.taglineStyleLabel": "Estilo del eslogan",
    "dashboard.website.starter.taglineFontLabel": "Fuente",
    "dashboard.website.starter.taglineColorAriaLabel": "Color del eslogan",
    "dashboard.website.starter.colorLabel": "Color",
    "dashboard.website.starter.reset": "Restablecer",
    "dashboard.website.starter.sizeLabel": "Tamaño",
    "dashboard.website.starter.placementLabel": "Ubicación",
    "dashboard.website.starter.colorThemeLabel": "Tema de color",
    "dashboard.website.starter.customAccentAriaLabel": "Color de acento personalizado",
    "dashboard.website.starter.customAccentSuffix": " · acento personalizado",
    "dashboard.website.starter.fontSectionLabel": "Fuente",
    "dashboard.website.starter.photosLabel": "Fotos",
    "dashboard.website.starter.photosOptionalHint": "(opcional — sus propias fotos)",
    "dashboard.website.starter.photosHelper": "Se incrustan directamente en el archivo descargado — cada foto aumenta su tamaño, así que unas pocas buenas rinden más que muchas.",
    "dashboard.website.starter.heroPhotoLabel": "Foto principal",
    "dashboard.website.starter.removePhoto": "Quitar",
    "dashboard.website.starter.uploadHeroPhoto": "Suba una foto principal",
    "dashboard.website.starter.contentPhotosLabel": "Fotos de contenido ({current}/{max})",
    "dashboard.website.starter.removePhotoAriaLabel": "Quitar foto",
    "dashboard.website.starter.photoErrorFallback": "No se pudo procesar esa foto — pruebe con un archivo de imagen diferente.",
    "dashboard.website.starter.whatToIncludeLabel": "Qué incluir",
    "dashboard.website.starter.whatToIncludeHint": "(todo de su ficha real)",
    "dashboard.website.starter.includeAddress": "Dirección y mapa",
    "dashboard.website.starter.includePhone": "Teléfono (clic para llamar)",
    "dashboard.website.starter.includeHours": "Horario",
    "dashboard.website.starter.includeRating": "Calificación y reseñas",
    "dashboard.website.starter.livePreviewLabel": "Vista previa en vivo — exactamente lo que descargará",
    "dashboard.website.starter.iframeTitle": "Vista previa en vivo de su sitio inicial",
    "dashboard.website.starter.downloadSiteButton": "Descargar sitio (HTML)",
    "dashboard.website.starter.downloadHelper": "Un único archivo HTML real — el mismo que se muestra arriba, con el tema de color, la fuente, el eslogan y las secciones que eligió ya integrados. Ábralo en cualquier navegador, o súbalo a cualquier alojamiento para ponerlo en vivo.",
    "dashboard.website.starter.howToPublishHeading": "Cómo publicarlo",
    "dashboard.website.starter.publishStep1": "1. Descargue el archivo de arriba.",
    "dashboard.website.starter.publishStep2Prefix": "2. Súbalo como ",
    "dashboard.website.starter.publishStep2Suffix": " a cualquier alojamiento estático — una opción gratuita como Netlify Drop o GitHub Pages, o su alojamiento/cPanel actual si tiene uno.",
    "dashboard.website.starter.publishStep3": "3. Eso le da una URL real y pública para el sitio.",
    "dashboard.website.starter.publishStep4": "4. Agregue esa URL al campo de sitio web de su Perfil de Negocio de Google, luego vuelva a guardar este negocio desde Google Places aquí para que PostScore lo detecte.",
    "dashboard.website.starter.publishFootnote": "Descargar este archivo no cambia su PostScore por sí solo — los puntos de Sitio web se acreditan únicamente cuando el sitio real está en vivo en una URL real, Google lo muestra en su ficha y un nuevo análisis lo confirma. Es la misma regla honesta que sigue cada comprobación de esta app.",
    "dashboard.website.starter.alreadyPublishedHeading": "¿Ya lo publicó?",
    "dashboard.website.starter.markedDoneStatus": "Marcado como pendiente — lo confirmaremos de verdad la próxima vez que analicemos su ficha.",
    "dashboard.website.starter.notYetMarkedStatus": "Esto lo marca como pendiente en su plan de acción — aún se completa solo cuando un nuevo análisis verifica el sitio real.",
    "dashboard.website.starter.markErrorFallback": "No se pudo guardar — inténtelo de nuevo.",
    "dashboard.website.starter.markSaving": "Guardando...",
    "dashboard.website.starter.markMarked": "Marcado",
    "dashboard.website.starter.markAsPublished": "Marcar como publicado",
    "dashboard.websiteReviews.backTo": "Volver a {name}",
    "dashboard.websiteReviews.businessFallback": "negocio",
    "dashboard.websiteReviews.pageTitle": "Reseñas y respuestas",
    "dashboard.websiteReviews.subtitle": "Todo lo que hay aquí son sus datos reales de Google, o está claramente marcado como próximamente — nada inventado.",
    "dashboard.websiteReviews.businessNameFallback": "Su negocio",
    "dashboard.websiteReviews.socialProofHeading": "Su prueba social de reseñas",
    "dashboard.websiteReviews.avgRatingLabel": "Calificación promedio",
    "dashboard.websiteReviews.reviewVolumeLabel": "Volumen de reseñas",
    "dashboard.websiteReviews.ratingVolumeExplainer": "La calificación y el volumen funcionan juntos, no por separado: una gran calificación con un puñado de reseñas no tiene mucho peso — los clientes (y Google) confían más en ella cuando está respaldada por un volumen real. Desarrollar ambos a la vez hace más por cómo lo perciben que cualquiera de los dos por separado.",
    "dashboard.websiteReviews.forExampleLabel": "Por ejemplo:",
    "dashboard.websiteReviews.exampleStrongTrust": "{target}★ de 200 reseñas — confianza sólida",
    "dashboard.websiteReviews.exampleBuildingTrust": "{target}★ de 5 reseñas — aún generando confianza",
    "dashboard.websiteReviews.rubricHeading": "El criterio detrás de su puntuación de reseñas",
    "dashboard.websiteReviews.replyAssistantLabel": "Asistente de respuestas",
    "dashboard.websiteReviews.replyAssistantConnectedBody": "Su Perfil de Negocio de Google está conectado — leer sus reseñas reales y redactar respuestas es una actualización futura, aún no está disponible. Nada inventado mientras tanto.",
    "dashboard.websiteReviews.replyAssistantUnlockDescription": "Redactar respuestas a sus reseñas reales requiere acceso real al Perfil de Negocio de Google — hoy solo obtenemos su calificación y su número de reseñas, no el contenido ni los autores de cada reseña. Conecte su perfil para desbloquearlo.",
    "dashboard.websiteReviews.comingSoonLabel": "Próximamente",
    "dashboard.websiteReviews.autoTextTitle": "Enviar mensajes automáticos a los clientes tras su visita",
    "dashboard.websiteReviews.autoTextBody": "Enviar automáticamente un enlace de reseña tras una visita requiere una forma de saber quién visitó y cuándo — aún no la tenemos. Por ahora, compartir el enlace o el cartel de arriba depende de usted.",
    "dashboard.websiteReviews.growthLeverEyebrow": "Palanca de crecimiento",
    "dashboard.websiteReviews.growthLeverHeading": "Consiga más reseñas — su palanca de crecimiento n.º 1",
    "dashboard.websiteReviews.growthLeverIntro": "Sea cual sea su puntuación, más reseñas atraen a más clientes. Haga que dejar una sea muy fácil.",
    "dashboard.websiteReviews.noPlaceIdMessage": "Aún no tenemos un ID de lugar de Google registrado para este negocio, así que no podemos crear un enlace de reseña real. Vuelva a guardarlo desde una búsqueda nueva en Google Places para obtener uno.",
    "dashboard.websiteReviews.makeItEffortlessHeading": "Hágalo muy fácil",
    "dashboard.websiteReviews.shareableLinkLabel": "Enlace de reseña para compartir",
    "dashboard.websiteReviews.shareableLinkHelper": "Abre la pantalla real de Google para \"escribir una reseña\" de su ficha. Envíelo por mensaje a un cliente, publíquelo o agréguelo a un recibo o correo de seguimiento — usted mismo lo envía.",
    "dashboard.websiteReviews.qrCodeLabel": "Código QR para el mostrador",
    "dashboard.websiteReviews.qrAlt": "Escanee para dejar una reseña en Google",
    "dashboard.websiteReviews.downloadGenerating": "Generando...",
    "dashboard.websiteReviews.downloadButton": "Descargar",
    "dashboard.websiteReviews.downloadErrorFallback": "No se pudo generar la imagen — inténtelo de nuevo.",
    "dashboard.websiteReviews.qrHelper": "Un cartel listo para imprimir para su mostrador o ventana — usted mismo lo imprime y lo coloca.",

    // --- Step L6 (beat 2): reviewed Spanish for the smaller dashboard
    // sections (Overview, Connect-GBP, Reports, Intake) + shared common.*
    // additions + the lib/reviews.ts sweep. scoreOutOf100WithGrade and
    // postAiOverlayTitle deliberately have no es entry (pure
    // placeholders/brand name) and fall back to English.
    "dashboard.overview.assistantDataErrorFallback": "No se pudieron cargar los datos de contexto del asistente.",
    "dashboard.overview.categoryNotDeterminable": "Aún no se puede determinar — todavía no hay datos reales en esta categoría.",
    "dashboard.overview.rescanTasksConfirmed.one": "{count} tarea confirmada (+{points} pts)",
    "dashboard.overview.rescanTasksConfirmed.other": "{count} tareas confirmadas (+{points} pts)",
    "dashboard.overview.rescanTasksReopened.one": "{count} tarea de vuelta en su plan",
    "dashboard.overview.rescanTasksReopened.other": "{count} tareas de vuelta en su plan",
    "dashboard.overview.rescanListingChangesFound.one": "{count} cambio detectado en su ficha",
    "dashboard.overview.rescanListingChangesFound.other": "{count} cambios detectados en su ficha",
    "dashboard.overview.rescanSummary": "Nuevo análisis — {parts}.",
    "dashboard.overview.rescanNothingChanged": "Nuevo análisis — nada cambió desde el último análisis.",
    "dashboard.overview.rescanNoResultsError": "Ya no se pudo encontrar esta ficha en Google — puede que se haya eliminado o fusionado con otra ficha.",
    "dashboard.overview.rescanErrorFallback": "No se pudo volver a analizar este negocio.",
    "dashboard.overview.rescanning": "Analizando de nuevo...",
    "dashboard.overview.rescanNow": "Analizar de nuevo",
    "dashboard.overview.gradeMeaningAriaLabel": "¿Qué significa esta nota?",
    "dashboard.overview.gradeRangesHeading": "Rangos de notas",
    "dashboard.overview.sinceLastScanLabel": "Desde el último análisis",
    "dashboard.overview.trackingStartsNow": "El seguimiento empieza ahora — mostraremos los cambios después de su próximo análisis.",
    "dashboard.overview.noChange": "Sin cambios",
    "dashboard.overview.recentScansHeading": "Análisis recientes",
    "dashboard.overview.hoursLabel": "Horario",
    "dashboard.overview.googleMapsLabel": "Google Maps",
    "dashboard.overview.viewOnGoogleMaps": "Ver en Google Maps",
    "dashboard.overview.noPriorScanChanges": "Aún no hay un análisis anterior con el que comparar — los cambios aparecerán aquí después de su próximo análisis.",
    "dashboard.overview.scoringUpdatedBetweenScans": "El sistema de puntuación se actualizó entre estos dos análisis ({previous} → {current}), así que aquí no se muestra una comparación comprobación por comprobación — la puntuación total de arriba sigue reflejando la diferencia real.",
    "dashboard.overview.nothingChangedSinceLastScan": "Nada cambió desde su último análisis.",
    "dashboard.overview.updatedPillLabel": "Actualizado",
    "dashboard.overview.noPriorScanListingChanges": "Aún no hay un análisis anterior con el que comparar — los cambios reales en su ficha aparecerán aquí después de su próximo análisis.",
    "dashboard.overview.predatesListingTracking": "Su último análisis es anterior al seguimiento de cambios en la ficha — esto empezará a funcionar a partir de su próximo análisis.",
    "dashboard.overview.nothingChangedOnListing": "Nada cambió en su ficha desde su último análisis.",
    "dashboard.overview.untitledBusiness": "Negocio sin nombre",
    "dashboard.overview.noAddressOnFile": "Sin dirección registrada",
    "dashboard.overview.scoringVersionNote": "Versión de puntuación {version} · calculada en vivo a partir de los datos guardados de Google Places de abajo",
    "dashboard.overview.viewCompetitors": "Ver competencia",
    "dashboard.overview.currentScoreHeading": "Puntuación actual",
    "dashboard.overview.gradeLabel": "Nota",
    "dashboard.overview.projectedLabel": "Proyectada si se completan todas las sugerencias",
    "dashboard.overview.seeActionPlan": "Ver su plan de acción →",
    "dashboard.overview.assistantUnavailablePrefix": "El asistente no está disponible en este momento: {message}",
    "dashboard.overview.atAGlanceHeading": "De un vistazo",
    "dashboard.overview.googleRatingLabel": "Calificación de Google",
    "dashboard.overview.googleReviewsLabel": "Reseñas de Google",
    "dashboard.overview.businessListingHeading": "Ficha del negocio",
    "dashboard.overview.liveListingHeading": "Su ficha de Google en vivo",
    "dashboard.overview.whatChangedHeading": "Qué cambió desde su último análisis",
    "dashboard.overview.scoreImpactHeading": "Impacto en la puntuación desde su último análisis",
    "dashboard.overview.wherePointsAreHeading": "Dónde están sus puntos",
    "dashboard.overview.detailedChecksHeading": "Comprobaciones detalladas",
    "dashboard.overview.scanHistoryHeading": "Historial de análisis",
    "dashboard.overview.noSavedScans": "Aún no hay análisis guardados — haga clic en \"{rescanNow}\" arriba para registrar la puntuación actual.",
    "dashboard.overview.dateColumn": "Fecha",
    "dashboard.overview.scoreColumn": "Puntuación",
    "dashboard.overview.gradeColumn": "Nota",
    "dashboard.overview.versionColumn": "Versión",
    "dashboard.overview.actionPlan.toDo": "Por hacer",
    "dashboard.overview.actionPlan.completeThisWeek": "Completar esta semana",
    "dashboard.overview.actionPlan.inProgressFraction": "En curso ({gained} de {targetDelta})",
    "dashboard.overview.actionPlan.notQuiteYet": "Todavía no",
    "dashboard.overview.actionPlan.inProgress": "En curso",
    "dashboard.overview.actionPlan.checkedWorse": "Comprobado — peor",
    "dashboard.overview.actionPlan.checkedNoChange": "Comprobado — sin cambios",
    "dashboard.overview.actionPlan.checkedWithDate": "Comprobado el {date}.",
    "dashboard.overview.actionPlan.checkedNoDate": "Comprobado.",
    "dashboard.overview.actionPlan.willCheckNextRescan": "Lo comprobaremos en su próximo análisis.",
    "dashboard.overview.actionPlan.doneThisWeek": "¡Hecho esta semana! Alcanzó {current} reseñas.",
    "dashboard.overview.actionPlan.progressText": "Progreso: {gained} de {targetDelta} reseñas nuevas ({current} hasta ahora, faltan {remaining}).",
    "dashboard.overview.actionPlan.downTo": "Bajó a {current} reseñas (antes {baseline}) — inténtelo de nuevo esta semana.",
    "dashboard.overview.actionPlan.stillAt": "Sigue en {current} reseñas — inténtelo de nuevo esta semana.",
    "dashboard.overview.actionPlan.movedWrongWay": "Esto se movió en la dirección equivocada.",
    "dashboard.overview.actionPlan.realProgress": "Progreso real — los puntos de la puntuación se actualizan automáticamente a medida que el nuevo análisis lo confirma, nunca por hacer clic en hecho.",
    "dashboard.overview.actionPlan.noRealChangeYet": "Aún no hay un cambio real — esto se confirma gradualmente a medida que sube el número real, no por una sola acción.",
    "dashboard.overview.actionPlan.googleStillDoesntShow": "Google aún no muestra esto — verifique que se guardó y luego vuelva a analizar.",
    "dashboard.overview.actionPlan.quickWin": "Logro rápido",
    "dashboard.overview.actionPlan.thisWeeksAction": "La acción de esta semana",
    "dashboard.overview.actionPlan.ongoingOutcome": "Resultado continuo",
    "dashboard.overview.actionPlan.firstStep": "Primer paso",
    "dashboard.overview.actionPlan.longerTerm": "A más largo plazo",
    "dashboard.overview.actionPlan.couldNotSave": "No se pudo guardar — inténtelo de nuevo.",
    "dashboard.overview.actionPlan.hideHowToFix": "Ocultar cómo solucionarlo",
    "dashboard.overview.actionPlan.howToFixIt": "Cómo solucionarlo",
    "dashboard.overview.actionPlan.doThisLabel": "Haga esto: ",
    "dashboard.overview.actionPlan.howLabel": "Cómo: ",
    "dashboard.overview.actionPlan.ownerActionOnGoogle": "Este es un cambio que usted mismo hace, en Google — PostScore puede decirle exactamente qué hacer, pero no podemos editar su ficha por usted.",
    "dashboard.overview.actionPlan.saving": "Guardando...",
    "dashboard.overview.actionPlan.didThisAgain": "Lo hice de nuevo",
    "dashboard.overview.actionPlan.didThis": "Ya lo hice",
    "dashboard.overview.actionPlan.pointsThisWeek": "~+{points} pts esta semana",
    "dashboard.overview.actionPlan.pointsUpTo": "Hasta +{points} pts",
    "dashboard.overview.actionPlan.confirmedWinsHeading": "Logros confirmados",
    "dashboard.overview.actionPlan.pointsConfirmed": "+{points} pts confirmados",
    "dashboard.overview.localBenchmarkLabel": "Referencia local",
    "dashboard.overview.saveScanToSeeRanking": "Guarde un análisis de la competencia para ver su posición local →",
    "dashboard.overview.noComparablePeers": "No se encontraron {competitorNoun} comparables en su último análisis.",
    "dashboard.overview.rankOfPeerCount": "#{rank} de {peerCount}",
    "dashboard.overview.aheadOfNearby": "Por delante del {percentileAhead}% de {othersCount} {competitorNoun} cercanos",
    "dashboard.overview.smallSampleSuffix": " — muestra pequeña",
    "dashboard.overview.profileChecklistTitle": "Lista de verificación de perfil completo",
    "dashboard.overview.profileChecklistDescription": "Conecte su Perfil de Negocio de Google para ver exactamente qué campos faltan en su ficha, agregar soluciones directamente a su plan de acción y hacer seguimiento de la actualidad de las reseñas a partir de sus datos reales y en vivo de Google.",
    "dashboard.overview.gbpConnectedNotWiredUp": "Perfil de Negocio de Google conectado. La verificación de campos en vivo aún no está habilitada — es una actualización futura, no algo averiado aquí. Mostraremos su lista real aquí cuando esté disponible.",
    "dashboard.overview.ptsAvailable": "+{points} pts disponibles",
    "dashboard.overview.askPostAI": "Pregunte a PostAI",
    "dashboard.overview.betaLabel": "Beta",
    "dashboard.overview.assistantPrompt": "Pregunte lo que sea sobre su puntuación, la competencia o qué mejorar a continuación.",
    "dashboard.overview.pastConversations.one": " {count} conversación anterior guardada.",
    "dashboard.overview.pastConversations.other": " {count} conversaciones anteriores guardadas.",
    "dashboard.connectGbp.unlockEditableListingTitle": "Ficha en vivo y editable",
    "dashboard.connectGbp.unlockEditableListingBody": "Actualice su horario, teléfono y otros campos de la ficha desde PostScore en lugar de directamente en Google.",
    "dashboard.connectGbp.unlockCompletenessFixesTitle": "Soluciones para completar el perfil",
    "dashboard.connectGbp.unlockCompletenessFixesBody": "Vea exactamente qué campos faltan en su ficha y agregue cada uno directamente a su plan de acción.",
    "dashboard.connectGbp.unlockReviewRecencyTitle": "Actualidad de las reseñas",
    "dashboard.connectGbp.unlockReviewRecencyBody": "Sepa qué tan recientes son realmente sus reseñas, no solo su número total.",
    "dashboard.connectGbp.unlockReplyAssistantTitle": "Reseñas individuales + asistente de respuestas con IA",
    "dashboard.connectGbp.unlockReplyAssistantBody": "Lea sus reseñas reales y obtenga una respuesta redactada para cada una, lista para publicar.",
    "dashboard.connectGbp.unlockReplyRateStatsTitle": "Estadísticas de tasa de respuesta",
    "dashboard.connectGbp.unlockReplyRateStatsBody": "Haga seguimiento de a cuántas de sus reseñas ha respondido realmente.",
    "dashboard.connectGbp.unlockInsightsLeadsTitle": "Métricas + estimación de clientes potenciales",
    "dashboard.connectGbp.unlockInsightsLeadsBody": "Vistas, llamadas y clics reales de su ficha de Google, y un número estimado de clientes potenciales calculado a partir de ellos.",
    "dashboard.connectGbp.unlockPostsTrackingTitle": "Seguimiento de publicaciones de Google",
    "dashboard.connectGbp.unlockPostsTrackingBody": "Vea lo que ha publicado en Google y cómo está funcionando.",
    "dashboard.connectGbp.disconnecting": "Desconectando...",
    "dashboard.connectGbp.disconnect": "Desconectar",
    "dashboard.connectGbp.disconnectError": "No se pudo desconectar — inténtelo de nuevo.",
    "dashboard.connectGbp.pageTitle": "Conecte su Perfil de Negocio de Google",
    "dashboard.connectGbp.pageSubtitle": "Conectarlo permite que PostScore lea (y, en algunos campos, edite) su Perfil de Negocio de Google real — además de los datos públicos de la ficha que ya evaluamos hoy.",
    "dashboard.connectGbp.justConnectedMessage": "Conectado. Todavía estamos completando el proceso de revisión de Google para el acceso completo a la API — las funciones de abajo se desbloquean a medida que cada una entra en funcionamiento, no todas a la vez.",
    "dashboard.connectGbp.connectedHeading": "Perfil de Negocio de Google conectado",
    "dashboard.connectGbp.sinceDate": "Desde el {date}.",
    "dashboard.connectGbp.connectedFallback": "Conectado.",
    "dashboard.connectGbp.notWiredUpSuffix": "Los datos reales de ficha, reseñas y métricas aún no están habilitados — es una actualización futura, no algo averiado aquí.",
    "dashboard.connectGbp.readyToConnectHeading": "¿Listo para conectar?",
    "dashboard.connectGbp.oauthConfiguredBody": "Irá a Google para aprobar el acceso y luego volverá aquí. Puede desconectarse en cualquier momento.",
    "dashboard.connectGbp.oauthNotConfiguredBody": "La conexión con el Perfil de Negocio de Google aún no está configurada en este entorno — vuelva pronto.",
    "dashboard.connectGbp.skipForNow": "Omitir por ahora",
    "dashboard.connectGbp.connectToUnlock": "Conectar para desbloquear",
    "dashboard.connectGbp.needsConnectedGbp": "Requiere un Perfil de Negocio de Google conectado.",
    "dashboard.reports.pageTitle": "Informes e historial",
    "dashboard.reports.subtitle": "Su historial real de PostScore — cada número aquí proviene de un análisis que realmente realizó.",
    "dashboard.reports.scoreOverTimeHeading": "Puntuación a lo largo del tiempo",
    "dashboard.reports.monthlyRecapHeading": "Resumen mensual",
    "dashboard.reports.whatWeveVerifiedHeading": "Lo que hemos verificado",
    "dashboard.intake.pageTitle": "Agregar un negocio",
    "dashboard.intake.pageSubtitle": "Busque su ficha real del Perfil de Negocio de Google para empezar a evaluarla.",
    "dashboard.intake.nameLabel": "Nombre",
    "dashboard.intake.categoryLabel": "Categoría",
    "dashboard.intake.languageLabel": "Idioma",
    "dashboard.intake.savedOpening": "Guardado — abriendo…",
    "dashboard.intake.saving": "Guardando...",
    "dashboard.intake.addThisBusiness": "Agregar este negocio",
    "dashboard.intake.sessionExpiredError": "Su sesión expiró — inicie sesión de nuevo para guardar.",
    "dashboard.intake.findBusinessHeading": "Encuentre su negocio en Google",
    "dashboard.intake.businessNameFieldLabel": "Nombre del negocio",
    "dashboard.intake.businessNamePlaceholder": "p. ej. Blue Bottle Coffee",
    "dashboard.intake.locationFieldLabel": "Ciudad / ubicación",
    "dashboard.intake.locationPlaceholder": "p. ej. Oakland, CA",
    "dashboard.intake.searching": "Buscando...",
    "dashboard.intake.searchButton": "Buscar",
    "dashboard.intake.searchFailedError": "La búsqueda falló — revise su conexión e inténtelo de nuevo.",
    "dashboard.intake.resultHeading": "Resultado",
    "dashboard.intake.noMatchingBusiness": "No se encontró ningún negocio que coincida con ese nombre y ubicación. Pruebe ampliando la ubicación o revisando la ortografía.",
    "dashboard.intake.multipleMatches": "Se encontraron {count} posibles coincidencias. Elija la correcta:",
    "dashboard.common.backTo": "Volver a {name}",
    "dashboard.common.businessFallback": "negocio",
    "dashboard.common.businessNameFallback": "Su negocio",
    "dashboard.common.connectGoogleBusinessProfile": "Conectar Perfil de Negocio de Google",
    "dashboard.common.notAvailable": "No disponible",
    "dashboard.common.addressLabel": "Dirección",
    "dashboard.common.phoneLabel": "Teléfono",
    "dashboard.common.ratingLabel": "Calificación",
    "dashboard.common.reviewsLabel": "Reseñas",
    "dashboard.common.websiteLabel": "Sitio web",
    "dashboard.websiteReviews.ratingCaptionNoRating": "Aún sin calificación — esto se completa cuando su ficha tenga reseñas.",
    "dashboard.websiteReviews.ratingCaptionAtTarget": "Está en {rating}★ — en o por encima del {target}+ que buscan la mayoría de los clientes.",
    "dashboard.websiteReviews.ratingCaptionBelowTarget": "Está en {rating}★ — apunte a {target}+ para generar mayor confianza a primera vista.",
    "dashboard.websiteReviews.reviewCountCaptionNone": "Aún sin reseñas — cada reseña que consiga empieza a construir esto.",
    "dashboard.websiteReviews.reviewCountCaptionPassed": "Ha superado las {milestone} reseñas — {reviewCount} en total.",
    "dashboard.websiteReviews.reviewCountCaptionRemaining.one": "{remaining} reseña más para alcanzar {milestone}.",
    "dashboard.websiteReviews.reviewCountCaptionRemaining.other": "{remaining} reseñas más para alcanzar {milestone}.",

    // --- Step L6 (beat 3): reviewed Spanish for the Reports children
    // (MonthlyRecapCard.tsx, MonthlyEmailReportCard.tsx, ScoreHistoryChart.tsx)
    // added in beat 2, Part B.
    "dashboard.reports.recapFirstScanMessage": "Este es su primer análisis registrado — aquí aparecerá un resumen cuando tenga dos.",
    "dashboard.reports.recapWhatChangedHeading": "Qué cambió",
    "dashboard.reports.recapChangesUnavailable": "Uno de estos dos análisis es anterior al seguimiento de cambios en la ficha, así que no hay una comparación real disponible para este período.",
    "dashboard.reports.recapNoChangesDetected": "No se detectaron cambios reales en la ficha durante este período.",
    "dashboard.reports.recapPreparingDownload": "Preparando…",
    "dashboard.reports.recapDownloadButton": "Descargar",
    "dashboard.reports.recapShareButton": "Compartir",
    "dashboard.reports.recapImageError": "No se pudo generar la imagen.",
    "dashboard.reports.recapShareTitle": "{businessName} — resumen de PostScore",
    "dashboard.reports.recapShareText": "El PostScore de {businessName} {direction} {fromScore} → {toScore} ({dateRangeLabel}).",
    "dashboard.reports.recapShareDropped": "bajó de",
    "dashboard.reports.recapShareRose": "subió de",
    "dashboard.reports.emailSaveError": "No se pudo guardar — inténtelo de nuevo.",
    "dashboard.reports.monthlyEmailReportLabel": "Informe mensual por correo",
    "dashboard.reports.onLabel": "Activado",
    "dashboard.reports.offLabel": "Desactivado",
    "dashboard.reports.emailComingSoon": "Próximamente — un resumen mensual real de su PostScore, enviado a su correo automáticamente.",
    "dashboard.reports.emailOffMessage": "Desactivado — no recibirá un informe mensual por correo.",
    "dashboard.reports.emailFirstReportBaseline": "Activado — su primer informe será un punto de partida (aún sin comparación de un mes a otro).",
    "dashboard.reports.emailLastSentNext": "Último envío {lastSent} · Próximo informe alrededor del {nextReport}",
    "dashboard.reports.chartRangeWeekly": "Semanal",
    "dashboard.reports.chartRange6Months": "6 meses",
    "dashboard.reports.chartRangeAllTime": "Todo el tiempo",
    "dashboard.reports.chartRangeLabelWeek": "la última semana",
    "dashboard.reports.chartRangeLabel6Months": "los últimos 6 meses",
    "dashboard.reports.chartRangeLabelAllTime": "todo el tiempo",
    "dashboard.reports.chartToday": "Hoy",
    "dashboard.reports.chartDaysAgo.one": "hace 1 día",
    "dashboard.reports.chartDaysAgo.other": "hace {days} días",
    "dashboard.reports.chartNoHistoryYet": "Aún no ha realizado un análisis — vuelva a analizar desde la página de Resumen para empezar su historial.",
    "dashboard.reports.chartNotEnoughHistory": "Aún no hay suficiente historial — su gráfico se completa a medida que vuelve a analizar.",
    "dashboard.reports.chartChangeLabel": "Cambio · {range}",
    "dashboard.reports.chartTotalScansLabel": "Total de análisis registrados",
    "dashboard.reports.chartLastScanLabel": "Último análisis",
    "dashboard.reports.chartMoreEarlier": "+{count} anteriores",
    "dashboard.reports.chartAriaLabel": "Puntuación a lo largo del tiempo, {count} análisis, de {from} a {to}",
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
