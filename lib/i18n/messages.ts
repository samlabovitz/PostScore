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
  // --- Sidebar nav + profile dropdown (components/layout/Sidebar.tsx,
  // both client components already inside LocaleProvider).
  | "dashboard.nav.overview"
  | "dashboard.nav.growth"
  | "dashboard.nav.reviews"
  | "dashboard.nav.website"
  | "dashboard.nav.competitors"
  | "dashboard.nav.pricing"
  | "dashboard.nav.reports"
  | "dashboard.nav.account"
  | "dashboard.nav.logOut"
  // --- Dashboard shell chrome (components/layout/DashboardShell.tsx +
  // the business-picker states in Sidebar.tsx). "Untitled business" and
  // "No address on file" reuse dashboard.overview.untitledBusiness /
  // dashboard.overview.noAddressOnFile — identical text, not duplicated.
  | "dashboard.shell.openMenuAriaLabel"
  | "dashboard.shell.closeMenuAriaLabel"
  | "dashboard.shell.noBusinessSelected"
  | "dashboard.shell.addBusinessToGetStarted"
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
  // --- Shared content layer: the 3 scoring category names
  // (lib/scoring.ts's CATEGORY_LABELS). Shared between the dashboard
  // (CategoryProgressRow, CategoryCard — all 3 of its importing pages)
  // and the assistant grounding (lib/assistant.ts's
  // buildAssistantContextText/buildAssistantStarterPrompts) — same
  // reason as content.checks.* below.
  | "content.categories.visibility"
  | "content.categories.completeness"
  | "content.categories.website"
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
  // --- Shared content layer: action-plan task copy (lib/actionPlan.ts's
  // ACTION_PLAN_COPY/FALLBACK_COPY). Keyed by each check's own stable id,
  // same convention as content.checks.* above. Rendered by
  // ActionPlanSection.tsx's TaskCard (task.why/action/fix).
  | "content.actionPlan.visibility.rating.why"
  | "content.actionPlan.visibility.rating.action"
  | "content.actionPlan.visibility.rating.fix"
  | "content.actionPlan.visibility.rating.weeklyAction"
  | "content.actionPlan.visibility.review_count.why"
  | "content.actionPlan.visibility.review_count.action"
  | "content.actionPlan.visibility.review_count.fix"
  | "content.actionPlan.visibility.review_count.weeklyAction"
  | "content.actionPlan.visibility.review_recency.why"
  | "content.actionPlan.visibility.review_recency.action"
  | "content.actionPlan.visibility.review_recency.fix"
  | "content.actionPlan.completeness.phone.why"
  | "content.actionPlan.completeness.phone.action"
  | "content.actionPlan.completeness.phone.fix"
  | "content.actionPlan.completeness.address.why"
  | "content.actionPlan.completeness.address.action"
  | "content.actionPlan.completeness.address.fix"
  | "content.actionPlan.completeness.hours.why"
  | "content.actionPlan.completeness.hours.action"
  | "content.actionPlan.completeness.hours.fix"
  | "content.actionPlan.completeness.website_link.why"
  | "content.actionPlan.completeness.website_link.action"
  | "content.actionPlan.completeness.website_link.fix"
  | "content.actionPlan.completeness.categories.why"
  | "content.actionPlan.completeness.categories.action"
  | "content.actionPlan.completeness.categories.fix"
  | "content.actionPlan.completeness.photos.why"
  | "content.actionPlan.completeness.photos.action"
  | "content.actionPlan.completeness.photos.fix"
  | "content.actionPlan.completeness.business_status.why"
  | "content.actionPlan.completeness.business_status.action"
  | "content.actionPlan.completeness.business_status.fix"
  | "content.actionPlan.website.has_website.why"
  | "content.actionPlan.website.has_website.action"
  | "content.actionPlan.website.has_website.fix"
  | "content.actionPlan.website.https.why"
  | "content.actionPlan.website.https.action"
  | "content.actionPlan.website.https.fix"
  | "content.actionPlan.website.performance_mobile.why"
  | "content.actionPlan.website.performance_mobile.action"
  | "content.actionPlan.website.performance_mobile.fix"
  | "content.actionPlan.website.content_depth.why"
  | "content.actionPlan.website.content_depth.action"
  | "content.actionPlan.website.content_depth.fix"
  | "content.actionPlan.website.contact_conversion.why"
  | "content.actionPlan.website.contact_conversion.action"
  | "content.actionPlan.website.contact_conversion.fix"
  | "content.actionPlan.fallback.why"
  | "content.actionPlan.fallback.action"
  | "content.actionPlan.fallback.fix"
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
  // components/scoring/CategoryCard.tsx — shared by 3 pages (Overview,
  // Website, Reviews). "pts" reuses the existing dashboard.website.ptsAbbrev
  // key instead of duplicating it (was hardcoded separately before).
  | "dashboard.overview.confidenceVerified"
  | "dashboard.overview.confidenceLikely"
  | "dashboard.overview.confidenceUncertain"
  | "dashboard.overview.confidenceNotFound"
  | "dashboard.overview.categoryWeightAnnotation"
  | "dashboard.overview.hoursLabel"
  // --- lib/hours.ts's formatOpeningHours() — the two fixed English
  // strings a locale-formatted hours line can contain besides real
  // Google times; everything else in that function is Intl-formatted,
  // not translated text.
  | "dashboard.overview.hoursClosed"
  | "dashboard.overview.hoursOpen24"
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
  // --- Assistant ("PostAI") chrome: components/assistant/AssistantOverlay.tsx,
  // AssistantView.tsx, BusinessMemoryPanel.tsx. Does NOT include the
  // model's system prompt/grounding text (lib/assistant.ts) or the
  // starter-prompt questions it generates — those are sent to the model
  // verbatim and are Step L7's separate "respond in the owner's language"
  // territory, not UI dictionary text.
  | "dashboard.assistant.closeAriaLabel"
  | "dashboard.assistant.generalGuidanceLabel"
  | "dashboard.assistant.thinking"
  | "dashboard.assistant.yourBusinessFallback"
  | "dashboard.assistant.emptyStateHeadline"
  | "dashboard.assistant.emptyStateBody"
  | "dashboard.assistant.noPastConversations"
  | "dashboard.assistant.newConversationFallback"
  | "dashboard.assistant.historyMessageCount.one"
  | "dashboard.assistant.historyMessageCount.other"
  | "dashboard.assistant.couldNotReachFallback"
  | "dashboard.assistant.couldNotLoadPastConversations"
  | "dashboard.assistant.couldNotLoadConversation"
  | "dashboard.assistant.groundedInScore"
  | "dashboard.assistant.continuingConversation"
  | "dashboard.assistant.newConversationSavedNote"
  | "dashboard.assistant.backToChat"
  | "dashboard.assistant.historyButton"
  | "dashboard.assistant.newChatButton"
  | "dashboard.assistant.inputPlaceholder"
  | "dashboard.assistant.sendButton"
  // sendAssistantMessage's own server-action error fallbacks
  // (app/actions/assistant.ts) — rendered in the chat UI via
  // result.message, so chrome, not model output. Threaded via
  // normalizeLocale(business.language), same as other server actions.
  | "dashboard.assistant.errorTypeQuestionFirst"
  | "dashboard.assistant.errorCouldNotStartConversation"
  | "dashboard.assistant.errorCouldNotSaveMessage"
  | "dashboard.assistant.errorCouldNotGetReply"
  // Starter-prompt questions (lib/assistant.ts's buildAssistantStarterPrompts).
  // Genuinely dual-purpose: rendered as button labels AND sent to the
  // model verbatim as the user's message when clicked — resolved ONCE
  // via locale so the two can never desync (see Step L7 beat 1/2's
  // "ambiguous" note, now resolved). es intentionally left absent —
  // reviewed Spanish supplied separately, not auto-translated.
  | "dashboard.assistant.starterPrompts.whatsHurtingScore"
  | "dashboard.assistant.starterPrompts.top3ThisWeek"
  | "dashboard.assistant.starterPrompts.whatsChangedSinceStart"
  | "dashboard.assistant.starterPrompts.whyCategoryLosingPoints"
  | "dashboard.assistant.starterPrompts.compareToCompetitorsAvailable"
  | "dashboard.assistant.starterPrompts.compareToCompetitorsUnavailable"
  | "dashboard.assistant.starterPrompts.howToGetMoreReviews"
  | "dashboard.assistant.starterPrompts.ratingGoodEnough"
  | "dashboard.assistant.starterPrompts.startBuildingRatingFromZero"
  | "dashboard.assistant.memory.noSavedScans"
  | "dashboard.assistant.memory.onlyOneScore"
  | "dashboard.assistant.memory.pointsSinceDate"
  | "dashboard.assistant.memory.noConfirmedFixed"
  | "dashboard.assistant.memory.pointsGainedWithDate"
  | "dashboard.assistant.memory.pointsGainedNoDate"
  | "dashboard.assistant.memory.removeServiceAriaLabel"
  | "dashboard.assistant.memory.noServicesYet"
  | "dashboard.assistant.memory.serviceInputPlaceholder"
  | "dashboard.assistant.memory.addButton"
  | "dashboard.assistant.memory.businessTypeLabel"
  | "dashboard.assistant.memory.businessTypeCorrected"
  | "dashboard.assistant.memory.businessTypeAutoDetected"
  | "dashboard.assistant.memory.couldNotSaveFallback"
  | "dashboard.assistant.memory.heading"
  | "dashboard.assistant.memory.subheading"
  | "dashboard.assistant.memory.locationLabel"
  | "dashboard.assistant.memory.notOnFile"
  | "dashboard.assistant.memory.servicesJobValueHeading"
  | "dashboard.assistant.memory.editButton"
  | "dashboard.assistant.memory.servicesFieldLabel"
  | "dashboard.assistant.memory.jobValueRangeLabel"
  | "dashboard.assistant.memory.lowPlaceholder"
  | "dashboard.assistant.memory.highPlaceholder"
  | "dashboard.assistant.memory.toSeparator"
  | "dashboard.assistant.memory.errorMissingLow"
  | "dashboard.assistant.memory.errorMissingHigh"
  | "dashboard.assistant.memory.errorInvalidNumbers"
  | "dashboard.assistant.memory.errorLowExceedsHigh"
  | "dashboard.assistant.memory.servicesNotEntered"
  | "dashboard.assistant.memory.jobValueLine"
  | "dashboard.assistant.memory.jobValueNotEntered"
  | "dashboard.assistant.memory.fixedHeading"
  | "dashboard.assistant.memory.scoreTrendHeading"
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
  | "dashboard.reports.chartAriaLabel"
  // --- Pricing page (app/business/[id]/pricing/PricingView.tsx). Tier
  // labels/descriptions and basis labels mirror lib/pricing.ts's
  // PRICE_TIERS/ASSESSMENT_BASES (kept as local key lookups by id here,
  // since lib/pricing.ts itself stays English-only/untouched). The
  // "no_data" assessment basis has no key — BasisBadge never renders it.
  | "dashboard.pricing.pageTitle"
  | "dashboard.pricing.introText"
  | "dashboard.pricing.disclosureText"
  | "dashboard.pricing.rankingsHeading"
  | "dashboard.pricing.tier.underMarket.label"
  | "dashboard.pricing.tier.underMarket.description"
  | "dashboard.pricing.tier.competitive.label"
  | "dashboard.pricing.tier.competitive.description"
  | "dashboard.pricing.tier.upperMid.label"
  | "dashboard.pricing.tier.upperMid.description"
  | "dashboard.pricing.tier.premium.label"
  | "dashboard.pricing.tier.premium.description"
  | "dashboard.pricing.tier.noData.label"
  | "dashboard.pricing.tier.noData.description"
  | "dashboard.pricing.basis.verifiedLocal.label"
  | "dashboard.pricing.basis.generalEstimate.label"
  | "dashboard.pricing.servicesHeading"
  | "dashboard.pricing.removeServiceAriaLabel"
  | "dashboard.pricing.enterServiceName"
  | "dashboard.pricing.enterValidPrice"
  | "dashboard.pricing.couldNotAddRow"
  | "dashboard.pricing.couldNotSaveRow"
  | "dashboard.pricing.couldNotRemoveRow"
  | "dashboard.pricing.emptyServicesPrompt"
  | "dashboard.pricing.servicePlaceholder"
  | "dashboard.pricing.standardServiceFallback"
  | "dashboard.pricing.addServiceButton"
  | "dashboard.pricing.examplesPrefix"
  | "dashboard.pricing.priceLevelContextHeading"
  | "dashboard.pricing.youLabel"
  | "dashboard.pricing.assessmentEmptyState"
  | "dashboard.pricing.pricingTipsHeading"
  | "dashboard.pricing.generalStrategyFootnote"
  | "dashboard.pricing.noPricesError"
  | "dashboard.pricing.assessErrorFallback"
  | "dashboard.pricing.assessmentHeading"
  | "dashboard.pricing.assessingButton"
  | "dashboard.pricing.reassessButton"
  | "dashboard.pricing.assessButton"
  | "dashboard.pricing.lastAssessed"
  // --- Business-type profiles (config/bizProfiles.ts). Step L8 (beat 1).
  // bizProfiles.<contentProfileId>.<field>[.<itemKey>] — the 12 hand-
  // written content profiles (coupon/offer/referral/pricing presets,
  // couponAngles, growActions, faq — see docs/i18n/bizprofiles/*-en.md
  // for the full grouped list per profile). bizProfileOptions.<optionId>.
  // {label,competitorNoun} — the ~30 narrower, selectable business TYPES
  // (e.g. "barbershop") that reuse one of the 12 content profiles; a few
  // (salon/restaurant/practitioner/default) intentionally have no keys
  // here at all — their `label` is a direct source-level reference to
  // their content profile's own already-keyed label (see
  // BUSINESS_TYPE_OPTIONS in config/bizProfiles.ts), never a duplicate
  // key. es intentionally absent for every key below — reviewed Spanish
  // supplied separately, per profile.
  | "bizProfiles.salon.label"
  | "bizProfiles.salon.competitorNoun"
  | "bizProfiles.salon.couponPresets.pct_off_next_appt.label"
  | "bizProfiles.salon.couponPresets.pct_off_next_appt.description"
  | "bizProfiles.salon.couponPresets.flat_off_rebook.label"
  | "bizProfiles.salon.couponPresets.flat_off_rebook.description"
  | "bizProfiles.salon.couponPresets.bring_a_friend.label"
  | "bizProfiles.salon.couponPresets.bring_a_friend.description"
  | "bizProfiles.salon.offerTemplates.new_client_special.label"
  | "bizProfiles.salon.offerTemplates.new_client_special.description"
  | "bizProfiles.salon.offerTemplates.referral_credit.label"
  | "bizProfiles.salon.offerTemplates.referral_credit.description"
  | "bizProfiles.salon.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.salon.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.salon.referralPresets.pct_off_both.description"
  | "bizProfiles.salon.referralPresets.free_addon.referrerReward"
  | "bizProfiles.salon.referralPresets.free_addon.friendReward"
  | "bizProfiles.salon.referralPresets.free_addon.description"
  | "bizProfiles.salon.pricingTips.anchor_premium.label"
  | "bizProfiles.salon.pricingTips.anchor_premium.description"
  | "bizProfiles.salon.pricingTips.consult_price_chemical.label"
  | "bizProfiles.salon.pricingTips.consult_price_chemical.description"
  | "bizProfiles.salon.pricingTips.good_better_best.label"
  | "bizProfiles.salon.pricingTips.good_better_best.description"
  | "bizProfiles.salon.pricingTips.raise_when_booked_out.label"
  | "bizProfiles.salon.pricingTips.raise_when_booked_out.description"
  | "bizProfiles.salon.couponAngles.firstTime"
  | "bizProfiles.salon.couponAngles.seasonal"
  | "bizProfiles.salon.couponAngles.slowDay"
  | "bizProfiles.salon.growActions.action1"
  | "bizProfiles.salon.growActions.action2"
  | "bizProfiles.salon.growActions.action3"
  | "bizProfiles.salon.growActions.action4"
  | "bizProfiles.salon.pricingExamples.example1"
  | "bizProfiles.salon.pricingExamples.example2"
  | "bizProfiles.salon.pricingExamples.example3"
  | "bizProfiles.salon.faq.item1.question"
  | "bizProfiles.salon.faq.item1.answer"
  | "bizProfiles.salon.faq.item2.question"
  | "bizProfiles.salon.faq.item2.answer"
  | "bizProfiles.restaurant.label"
  | "bizProfiles.restaurant.competitorNoun"
  | "bizProfiles.restaurant.couponPresets.free_item_with_purchase.label"
  | "bizProfiles.restaurant.couponPresets.free_item_with_purchase.description"
  | "bizProfiles.restaurant.couponPresets.pct_off_pickup.label"
  | "bizProfiles.restaurant.couponPresets.pct_off_pickup.description"
  | "bizProfiles.restaurant.couponPresets.bogo_entree.label"
  | "bizProfiles.restaurant.couponPresets.bogo_entree.description"
  | "bizProfiles.restaurant.offerTemplates.happy_hour.label"
  | "bizProfiles.restaurant.offerTemplates.happy_hour.description"
  | "bizProfiles.restaurant.offerTemplates.first_online_order.label"
  | "bizProfiles.restaurant.offerTemplates.first_online_order.description"
  | "bizProfiles.restaurant.referralPresets.free_item_both.referrerReward"
  | "bizProfiles.restaurant.referralPresets.free_item_both.friendReward"
  | "bizProfiles.restaurant.referralPresets.free_item_both.description"
  | "bizProfiles.restaurant.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.restaurant.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.restaurant.referralPresets.pct_off_both.description"
  | "bizProfiles.restaurant.pricingTips.anchor_standout_dish.label"
  | "bizProfiles.restaurant.pricingTips.anchor_standout_dish.description"
  | "bizProfiles.restaurant.pricingTips.steer_to_margin.label"
  | "bizProfiles.restaurant.pricingTips.steer_to_margin.description"
  | "bizProfiles.restaurant.pricingTips.review_prices_periodically.label"
  | "bizProfiles.restaurant.pricingTips.review_prices_periodically.description"
  | "bizProfiles.restaurant.pricingTips.bundle_combo.label"
  | "bizProfiles.restaurant.pricingTips.bundle_combo.description"
  | "bizProfiles.restaurant.couponAngles.firstTime"
  | "bizProfiles.restaurant.couponAngles.seasonal"
  | "bizProfiles.restaurant.couponAngles.slowDay"
  | "bizProfiles.restaurant.growActions.action1"
  | "bizProfiles.restaurant.growActions.action2"
  | "bizProfiles.restaurant.growActions.action3"
  | "bizProfiles.restaurant.growActions.action4"
  | "bizProfiles.restaurant.pricingExamples.example1"
  | "bizProfiles.restaurant.pricingExamples.example2"
  | "bizProfiles.restaurant.pricingExamples.example3"
  | "bizProfiles.restaurant.faq.item1.question"
  | "bizProfiles.restaurant.faq.item1.answer"
  | "bizProfiles.restaurant.faq.item2.question"
  | "bizProfiles.restaurant.faq.item2.answer"
  | "bizProfiles.liquor_wine.label"
  | "bizProfiles.liquor_wine.competitorNoun"
  | "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.label"
  | "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.description"
  | "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.label"
  | "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.description"
  | "bizProfiles.liquor_wine.couponPresets.case_discount.label"
  | "bizProfiles.liquor_wine.couponPresets.case_discount.description"
  | "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.label"
  | "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.description"
  | "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.label"
  | "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.description"
  | "bizProfiles.liquor_wine.referralPresets.credit_both.referrerReward"
  | "bizProfiles.liquor_wine.referralPresets.credit_both.friendReward"
  | "bizProfiles.liquor_wine.referralPresets.credit_both.description"
  | "bizProfiles.liquor_wine.referralPresets.case_discount_referral.referrerReward"
  | "bizProfiles.liquor_wine.referralPresets.case_discount_referral.friendReward"
  | "bizProfiles.liquor_wine.referralPresets.case_discount_referral.description"
  | "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.label"
  | "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.description"
  | "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.label"
  | "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.description"
  | "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.label"
  | "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.description"
  | "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.label"
  | "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.description"
  | "bizProfiles.liquor_wine.couponAngles.firstTime"
  | "bizProfiles.liquor_wine.couponAngles.seasonal"
  | "bizProfiles.liquor_wine.couponAngles.slowDay"
  | "bizProfiles.liquor_wine.growActions.action1"
  | "bizProfiles.liquor_wine.growActions.action2"
  | "bizProfiles.liquor_wine.growActions.action3"
  | "bizProfiles.liquor_wine.growActions.action4"
  | "bizProfiles.liquor_wine.pricingExamples.example1"
  | "bizProfiles.liquor_wine.pricingExamples.example2"
  | "bizProfiles.liquor_wine.pricingExamples.example3"
  | "bizProfiles.liquor_wine.faq.item1.question"
  | "bizProfiles.liquor_wine.faq.item1.answer"
  | "bizProfiles.liquor_wine.faq.item2.question"
  | "bizProfiles.liquor_wine.faq.item2.answer"
  | "bizProfiles.grocery_market.label"
  | "bizProfiles.grocery_market.competitorNoun"
  | "bizProfiles.grocery_market.couponPresets.flat_off_basket.label"
  | "bizProfiles.grocery_market.couponPresets.flat_off_basket.description"
  | "bizProfiles.grocery_market.couponPresets.weekly_special.label"
  | "bizProfiles.grocery_market.couponPresets.weekly_special.description"
  | "bizProfiles.grocery_market.couponPresets.loyalty_repeat.label"
  | "bizProfiles.grocery_market.couponPresets.loyalty_repeat.description"
  | "bizProfiles.grocery_market.offerTemplates.new_shopper_special.label"
  | "bizProfiles.grocery_market.offerTemplates.new_shopper_special.description"
  | "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.label"
  | "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.description"
  | "bizProfiles.grocery_market.referralPresets.credit_both.referrerReward"
  | "bizProfiles.grocery_market.referralPresets.credit_both.friendReward"
  | "bizProfiles.grocery_market.referralPresets.credit_both.description"
  | "bizProfiles.grocery_market.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.grocery_market.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.grocery_market.referralPresets.pct_off_both.description"
  | "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.label"
  | "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.description"
  | "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.label"
  | "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.description"
  | "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.label"
  | "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.description"
  | "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.label"
  | "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.description"
  | "bizProfiles.grocery_market.couponAngles.firstTime"
  | "bizProfiles.grocery_market.couponAngles.seasonal"
  | "bizProfiles.grocery_market.couponAngles.slowDay"
  | "bizProfiles.grocery_market.growActions.action1"
  | "bizProfiles.grocery_market.growActions.action2"
  | "bizProfiles.grocery_market.growActions.action3"
  | "bizProfiles.grocery_market.growActions.action4"
  | "bizProfiles.grocery_market.pricingExamples.example1"
  | "bizProfiles.grocery_market.pricingExamples.example2"
  | "bizProfiles.grocery_market.pricingExamples.example3"
  | "bizProfiles.grocery_market.faq.item1.question"
  | "bizProfiles.grocery_market.faq.item1.answer"
  | "bizProfiles.grocery_market.faq.item2.question"
  | "bizProfiles.grocery_market.faq.item2.answer"
  | "bizProfiles.cafe_bakery.label"
  | "bizProfiles.cafe_bakery.competitorNoun"
  | "bizProfiles.cafe_bakery.couponPresets.flat_off_order.label"
  | "bizProfiles.cafe_bakery.couponPresets.flat_off_order.description"
  | "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.label"
  | "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.description"
  | "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.label"
  | "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.description"
  | "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.label"
  | "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.description"
  | "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.label"
  | "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.description"
  | "bizProfiles.cafe_bakery.referralPresets.free_item_both.referrerReward"
  | "bizProfiles.cafe_bakery.referralPresets.free_item_both.friendReward"
  | "bizProfiles.cafe_bakery.referralPresets.free_item_both.description"
  | "bizProfiles.cafe_bakery.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.cafe_bakery.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.cafe_bakery.referralPresets.pct_off_both.description"
  | "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.label"
  | "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.description"
  | "bizProfiles.cafe_bakery.pricingTips.bundle_combo.label"
  | "bizProfiles.cafe_bakery.pricingTips.bundle_combo.description"
  | "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.label"
  | "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.description"
  | "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.label"
  | "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.description"
  | "bizProfiles.cafe_bakery.couponAngles.firstTime"
  | "bizProfiles.cafe_bakery.couponAngles.seasonal"
  | "bizProfiles.cafe_bakery.couponAngles.slowDay"
  | "bizProfiles.cafe_bakery.growActions.action1"
  | "bizProfiles.cafe_bakery.growActions.action2"
  | "bizProfiles.cafe_bakery.growActions.action3"
  | "bizProfiles.cafe_bakery.growActions.action4"
  | "bizProfiles.cafe_bakery.pricingExamples.example1"
  | "bizProfiles.cafe_bakery.pricingExamples.example2"
  | "bizProfiles.cafe_bakery.pricingExamples.example3"
  | "bizProfiles.cafe_bakery.faq.item1.question"
  | "bizProfiles.cafe_bakery.faq.item1.answer"
  | "bizProfiles.cafe_bakery.faq.item2.question"
  | "bizProfiles.cafe_bakery.faq.item2.answer"
  | "bizProfiles.lawyer.label"
  | "bizProfiles.lawyer.competitorNoun"
  | "bizProfiles.lawyer.couponPresets.free_consultation.label"
  | "bizProfiles.lawyer.couponPresets.free_consultation.description"
  | "bizProfiles.lawyer.couponPresets.flat_fee_review.label"
  | "bizProfiles.lawyer.couponPresets.flat_fee_review.description"
  | "bizProfiles.lawyer.offerTemplates.new_client_doc_review.label"
  | "bizProfiles.lawyer.offerTemplates.new_client_doc_review.description"
  | "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.label"
  | "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.description"
  | "bizProfiles.lawyer.pricingTips.tiered_consultation.label"
  | "bizProfiles.lawyer.pricingTips.tiered_consultation.description"
  | "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.label"
  | "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.description"
  | "bizProfiles.lawyer.pricingTips.scope_in_writing.label"
  | "bizProfiles.lawyer.pricingTips.scope_in_writing.description"
  | "bizProfiles.lawyer.couponAngles.firstTime"
  | "bizProfiles.lawyer.couponAngles.seasonal"
  | "bizProfiles.lawyer.couponAngles.slowDay"
  | "bizProfiles.lawyer.growActions.action1"
  | "bizProfiles.lawyer.growActions.action2"
  | "bizProfiles.lawyer.growActions.action3"
  | "bizProfiles.lawyer.growActions.action4"
  | "bizProfiles.lawyer.pricingExamples.example1"
  | "bizProfiles.lawyer.pricingExamples.example2"
  | "bizProfiles.lawyer.pricingExamples.example3"
  | "bizProfiles.lawyer.faq.item1.question"
  | "bizProfiles.lawyer.faq.item1.answer"
  | "bizProfiles.lawyer.faq.item2.question"
  | "bizProfiles.lawyer.faq.item2.answer"
  | "bizProfiles.professional_services.label"
  | "bizProfiles.professional_services.competitorNoun"
  | "bizProfiles.professional_services.couponPresets.free_consultation.label"
  | "bizProfiles.professional_services.couponPresets.free_consultation.description"
  | "bizProfiles.professional_services.couponPresets.flat_fee_package.label"
  | "bizProfiles.professional_services.couponPresets.flat_fee_package.description"
  | "bizProfiles.professional_services.couponPresets.new_client_pct.label"
  | "bizProfiles.professional_services.couponPresets.new_client_pct.description"
  | "bizProfiles.professional_services.offerTemplates.new_client_return_discount.label"
  | "bizProfiles.professional_services.offerTemplates.new_client_return_discount.description"
  | "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.label"
  | "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.description"
  | "bizProfiles.professional_services.referralPresets.credit_both.referrerReward"
  | "bizProfiles.professional_services.referralPresets.credit_both.friendReward"
  | "bizProfiles.professional_services.referralPresets.credit_both.description"
  | "bizProfiles.professional_services.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.professional_services.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.professional_services.referralPresets.pct_off_both.description"
  | "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.label"
  | "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.description"
  | "bizProfiles.professional_services.pricingTips.tiered_by_complexity.label"
  | "bizProfiles.professional_services.pricingTips.tiered_by_complexity.description"
  | "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.label"
  | "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.description"
  | "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.label"
  | "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.description"
  | "bizProfiles.professional_services.couponAngles.firstTime"
  | "bizProfiles.professional_services.couponAngles.seasonal"
  | "bizProfiles.professional_services.couponAngles.slowDay"
  | "bizProfiles.professional_services.growActions.action1"
  | "bizProfiles.professional_services.growActions.action2"
  | "bizProfiles.professional_services.growActions.action3"
  | "bizProfiles.professional_services.growActions.action4"
  | "bizProfiles.professional_services.pricingExamples.example1"
  | "bizProfiles.professional_services.pricingExamples.example2"
  | "bizProfiles.professional_services.pricingExamples.example3"
  | "bizProfiles.professional_services.faq.item1.question"
  | "bizProfiles.professional_services.faq.item1.answer"
  | "bizProfiles.professional_services.faq.item2.question"
  | "bizProfiles.professional_services.faq.item2.answer"
  | "bizProfiles.practitioner.label"
  | "bizProfiles.practitioner.competitorNoun"
  | "bizProfiles.practitioner.couponPresets.pct_off_next_session.label"
  | "bizProfiles.practitioner.couponPresets.pct_off_next_session.description"
  | "bizProfiles.practitioner.couponPresets.free_intro_consult.label"
  | "bizProfiles.practitioner.couponPresets.free_intro_consult.description"
  | "bizProfiles.practitioner.couponPresets.class_pack_bonus.label"
  | "bizProfiles.practitioner.couponPresets.class_pack_bonus.description"
  | "bizProfiles.practitioner.offerTemplates.new_client_special.label"
  | "bizProfiles.practitioner.offerTemplates.new_client_special.description"
  | "bizProfiles.practitioner.offerTemplates.referral_free_class.label"
  | "bizProfiles.practitioner.offerTemplates.referral_free_class.description"
  | "bizProfiles.practitioner.referralPresets.free_session_both.referrerReward"
  | "bizProfiles.practitioner.referralPresets.free_session_both.friendReward"
  | "bizProfiles.practitioner.referralPresets.free_session_both.description"
  | "bizProfiles.practitioner.referralPresets.credit_toward_session.referrerReward"
  | "bizProfiles.practitioner.referralPresets.credit_toward_session.friendReward"
  | "bizProfiles.practitioner.referralPresets.credit_toward_session.description"
  | "bizProfiles.practitioner.pricingTips.package_pricing.label"
  | "bizProfiles.practitioner.pricingTips.package_pricing.description"
  | "bizProfiles.practitioner.pricingTips.low_cost_intro.label"
  | "bizProfiles.practitioner.pricingTips.low_cost_intro.description"
  | "bizProfiles.practitioner.pricingTips.raise_when_booked_out.label"
  | "bizProfiles.practitioner.pricingTips.raise_when_booked_out.description"
  | "bizProfiles.practitioner.pricingTips.price_by_format.label"
  | "bizProfiles.practitioner.pricingTips.price_by_format.description"
  | "bizProfiles.practitioner.couponAngles.firstTime"
  | "bizProfiles.practitioner.couponAngles.seasonal"
  | "bizProfiles.practitioner.couponAngles.slowDay"
  | "bizProfiles.practitioner.growActions.action1"
  | "bizProfiles.practitioner.growActions.action2"
  | "bizProfiles.practitioner.growActions.action3"
  | "bizProfiles.practitioner.growActions.action4"
  | "bizProfiles.practitioner.pricingExamples.example1"
  | "bizProfiles.practitioner.pricingExamples.example2"
  | "bizProfiles.practitioner.pricingExamples.example3"
  | "bizProfiles.practitioner.faq.item1.question"
  | "bizProfiles.practitioner.faq.item1.answer"
  | "bizProfiles.practitioner.faq.item2.question"
  | "bizProfiles.practitioner.faq.item2.answer"
  | "bizProfiles.gym_fitness.label"
  | "bizProfiles.gym_fitness.competitorNoun"
  | "bizProfiles.gym_fitness.couponPresets.first_month_pct.label"
  | "bizProfiles.gym_fitness.couponPresets.first_month_pct.description"
  | "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.label"
  | "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.description"
  | "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.label"
  | "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.description"
  | "bizProfiles.gym_fitness.offerTemplates.new_member_special.label"
  | "bizProfiles.gym_fitness.offerTemplates.new_member_special.description"
  | "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.label"
  | "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.description"
  | "bizProfiles.gym_fitness.referralPresets.free_month_both.referrerReward"
  | "bizProfiles.gym_fitness.referralPresets.free_month_both.friendReward"
  | "bizProfiles.gym_fitness.referralPresets.free_month_both.description"
  | "bizProfiles.gym_fitness.referralPresets.free_session_both.referrerReward"
  | "bizProfiles.gym_fitness.referralPresets.free_session_both.friendReward"
  | "bizProfiles.gym_fitness.referralPresets.free_session_both.description"
  | "bizProfiles.gym_fitness.pricingTips.tiered_membership.label"
  | "bizProfiles.gym_fitness.pricingTips.tiered_membership.description"
  | "bizProfiles.gym_fitness.pricingTips.annual_discount.label"
  | "bizProfiles.gym_fitness.pricingTips.annual_discount.description"
  | "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.label"
  | "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.description"
  | "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.label"
  | "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.description"
  | "bizProfiles.gym_fitness.couponAngles.firstTime"
  | "bizProfiles.gym_fitness.couponAngles.seasonal"
  | "bizProfiles.gym_fitness.couponAngles.slowDay"
  | "bizProfiles.gym_fitness.growActions.action1"
  | "bizProfiles.gym_fitness.growActions.action2"
  | "bizProfiles.gym_fitness.growActions.action3"
  | "bizProfiles.gym_fitness.growActions.action4"
  | "bizProfiles.gym_fitness.pricingExamples.example1"
  | "bizProfiles.gym_fitness.pricingExamples.example2"
  | "bizProfiles.gym_fitness.pricingExamples.example3"
  | "bizProfiles.gym_fitness.faq.item1.question"
  | "bizProfiles.gym_fitness.faq.item1.answer"
  | "bizProfiles.gym_fitness.faq.item2.question"
  | "bizProfiles.gym_fitness.faq.item2.answer"
  | "bizProfiles.trades.label"
  | "bizProfiles.trades.competitorNoun"
  | "bizProfiles.trades.couponPresets.flat_off_first_call.label"
  | "bizProfiles.trades.couponPresets.flat_off_first_call.description"
  | "bizProfiles.trades.couponPresets.seasonal_tuneup.label"
  | "bizProfiles.trades.couponPresets.seasonal_tuneup.description"
  | "bizProfiles.trades.couponPresets.bundle_multiple_jobs.label"
  | "bizProfiles.trades.couponPresets.bundle_multiple_jobs.description"
  | "bizProfiles.trades.offerTemplates.new_customer_first_call.label"
  | "bizProfiles.trades.offerTemplates.new_customer_first_call.description"
  | "bizProfiles.trades.offerTemplates.seasonal_maintenance.label"
  | "bizProfiles.trades.offerTemplates.seasonal_maintenance.description"
  | "bizProfiles.trades.referralPresets.flat_off_both.referrerReward"
  | "bizProfiles.trades.referralPresets.flat_off_both.friendReward"
  | "bizProfiles.trades.referralPresets.flat_off_both.description"
  | "bizProfiles.trades.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.trades.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.trades.referralPresets.pct_off_both.description"
  | "bizProfiles.trades.pricingTips.flat_vs_hourly.label"
  | "bizProfiles.trades.pricingTips.flat_vs_hourly.description"
  | "bizProfiles.trades.pricingTips.travel_radius_pricing.label"
  | "bizProfiles.trades.pricingTips.travel_radius_pricing.description"
  | "bizProfiles.trades.pricingTips.seasonal_demand_pricing.label"
  | "bizProfiles.trades.pricingTips.seasonal_demand_pricing.description"
  | "bizProfiles.trades.pricingTips.bundle_multiple_jobs.label"
  | "bizProfiles.trades.pricingTips.bundle_multiple_jobs.description"
  | "bizProfiles.trades.couponAngles.firstTime"
  | "bizProfiles.trades.couponAngles.seasonal"
  | "bizProfiles.trades.couponAngles.slowDay"
  | "bizProfiles.trades.growActions.action1"
  | "bizProfiles.trades.growActions.action2"
  | "bizProfiles.trades.growActions.action3"
  | "bizProfiles.trades.growActions.action4"
  | "bizProfiles.trades.pricingExamples.example1"
  | "bizProfiles.trades.pricingExamples.example2"
  | "bizProfiles.trades.pricingExamples.example3"
  | "bizProfiles.trades.faq.item1.question"
  | "bizProfiles.trades.faq.item1.answer"
  | "bizProfiles.trades.faq.item2.question"
  | "bizProfiles.trades.faq.item2.answer"
  | "bizProfiles.retail.label"
  | "bizProfiles.retail.competitorNoun"
  | "bizProfiles.retail.couponPresets.flat_off_threshold.label"
  | "bizProfiles.retail.couponPresets.flat_off_threshold.description"
  | "bizProfiles.retail.couponPresets.bogo.label"
  | "bizProfiles.retail.couponPresets.bogo.description"
  | "bizProfiles.retail.couponPresets.bulk_discount.label"
  | "bizProfiles.retail.couponPresets.bulk_discount.description"
  | "bizProfiles.retail.offerTemplates.welcome_offer.label"
  | "bizProfiles.retail.offerTemplates.welcome_offer.description"
  | "bizProfiles.retail.offerTemplates.seasonal_clearance.label"
  | "bizProfiles.retail.offerTemplates.seasonal_clearance.description"
  | "bizProfiles.retail.referralPresets.credit_both.referrerReward"
  | "bizProfiles.retail.referralPresets.credit_both.friendReward"
  | "bizProfiles.retail.referralPresets.credit_both.description"
  | "bizProfiles.retail.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.retail.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.retail.referralPresets.pct_off_both.description"
  | "bizProfiles.retail.pricingTips.anchor_pricing.label"
  | "bizProfiles.retail.pricingTips.anchor_pricing.description"
  | "bizProfiles.retail.pricingTips.bulk_bundle_pricing.label"
  | "bizProfiles.retail.pricingTips.bulk_bundle_pricing.description"
  | "bizProfiles.retail.pricingTips.seasonal_markdowns.label"
  | "bizProfiles.retail.pricingTips.seasonal_markdowns.description"
  | "bizProfiles.retail.pricingTips.raise_on_demand.label"
  | "bizProfiles.retail.pricingTips.raise_on_demand.description"
  | "bizProfiles.retail.couponAngles.firstTime"
  | "bizProfiles.retail.couponAngles.seasonal"
  | "bizProfiles.retail.couponAngles.slowDay"
  | "bizProfiles.retail.growActions.action1"
  | "bizProfiles.retail.growActions.action2"
  | "bizProfiles.retail.growActions.action3"
  | "bizProfiles.retail.growActions.action4"
  | "bizProfiles.retail.pricingExamples.example1"
  | "bizProfiles.retail.pricingExamples.example2"
  | "bizProfiles.retail.pricingExamples.example3"
  | "bizProfiles.retail.faq.item1.question"
  | "bizProfiles.retail.faq.item1.answer"
  | "bizProfiles.retail.faq.item2.question"
  | "bizProfiles.retail.faq.item2.answer"
  | "bizProfiles.default.label"
  | "bizProfiles.default.competitorNoun"
  | "bizProfiles.default.couponPresets.flat_off_purchase.label"
  | "bizProfiles.default.couponPresets.flat_off_purchase.description"
  | "bizProfiles.default.couponPresets.pct_off_new_customer.label"
  | "bizProfiles.default.couponPresets.pct_off_new_customer.description"
  | "bizProfiles.default.offerTemplates.welcome_offer.label"
  | "bizProfiles.default.offerTemplates.welcome_offer.description"
  | "bizProfiles.default.offerTemplates.seasonal_special.label"
  | "bizProfiles.default.offerTemplates.seasonal_special.description"
  | "bizProfiles.default.referralPresets.credit_both.referrerReward"
  | "bizProfiles.default.referralPresets.credit_both.friendReward"
  | "bizProfiles.default.referralPresets.credit_both.description"
  | "bizProfiles.default.referralPresets.pct_off_both.referrerReward"
  | "bizProfiles.default.referralPresets.pct_off_both.friendReward"
  | "bizProfiles.default.referralPresets.pct_off_both.description"
  | "bizProfiles.default.pricingTips.anchor_pricing.label"
  | "bizProfiles.default.pricingTips.anchor_pricing.description"
  | "bizProfiles.default.pricingTips.good_better_best.label"
  | "bizProfiles.default.pricingTips.good_better_best.description"
  | "bizProfiles.default.pricingTips.raise_when_consistently_busy.label"
  | "bizProfiles.default.pricingTips.raise_when_consistently_busy.description"
  | "bizProfiles.default.pricingTips.bundle_package.label"
  | "bizProfiles.default.pricingTips.bundle_package.description"
  | "bizProfiles.default.couponAngles.firstTime"
  | "bizProfiles.default.couponAngles.seasonal"
  | "bizProfiles.default.couponAngles.slowDay"
  | "bizProfiles.default.growActions.action1"
  | "bizProfiles.default.growActions.action2"
  | "bizProfiles.default.growActions.action3"
  | "bizProfiles.default.growActions.action4"
  | "bizProfiles.default.pricingExamples.example1"
  | "bizProfiles.default.pricingExamples.example2"
  | "bizProfiles.default.pricingExamples.example3"
  | "bizProfiles.default.faq.item1.question"
  | "bizProfiles.default.faq.item1.answer"
  | "bizProfiles.default.faq.item2.question"
  | "bizProfiles.default.faq.item2.answer"
  | "bizProfileOptions.barbershop.label"
  | "bizProfileOptions.barbershop.competitorNoun"
  | "bizProfileOptions.spa.label"
  | "bizProfileOptions.spa.competitorNoun"
  | "bizProfileOptions.nail_salon.label"
  | "bizProfileOptions.nail_salon.competitorNoun"
  | "bizProfileOptions.cafe.label"
  | "bizProfileOptions.cafe.competitorNoun"
  | "bizProfileOptions.bar.label"
  | "bizProfileOptions.bar.competitorNoun"
  | "bizProfileOptions.bakery.label"
  | "bizProfileOptions.bakery.competitorNoun"
  | "bizProfileOptions.liquor_store.label"
  | "bizProfileOptions.liquor_store.competitorNoun"
  | "bizProfileOptions.grocery_market.label"
  | "bizProfileOptions.grocery_market.competitorNoun"
  | "bizProfileOptions.hardware_store.label"
  | "bizProfileOptions.hardware_store.competitorNoun"
  | "bizProfileOptions.florist.label"
  | "bizProfileOptions.florist.competitorNoun"
  | "bizProfileOptions.retail_boutique.label"
  | "bizProfileOptions.retail_boutique.competitorNoun"
  | "bizProfileOptions.gym_fitness.label"
  | "bizProfileOptions.gym_fitness.competitorNoun"
  | "bizProfileOptions.pet_services.label"
  | "bizProfileOptions.pet_services.competitorNoun"
  | "bizProfileOptions.dentist.label"
  | "bizProfileOptions.dentist.competitorNoun"
  | "bizProfileOptions.medical_clinic.label"
  | "bizProfileOptions.medical_clinic.competitorNoun"
  | "bizProfileOptions.lawyer.label"
  | "bizProfileOptions.accountant.label"
  | "bizProfileOptions.accountant.competitorNoun"
  | "bizProfileOptions.real_estate.label"
  | "bizProfileOptions.real_estate.competitorNoun"
  | "bizProfileOptions.consultant.label"
  | "bizProfileOptions.consultant.competitorNoun"
  | "bizProfileOptions.coach.label"
  | "bizProfileOptions.coach.competitorNoun"
  | "bizProfileOptions.tutor_education.label"
  | "bizProfileOptions.tutor_education.competitorNoun"
  | "bizProfileOptions.photographer.label"
  | "bizProfileOptions.photographer.competitorNoun"
  | "bizProfileOptions.auto_repair.label"
  | "bizProfileOptions.auto_repair.competitorNoun"
  | "bizProfileOptions.plumber.label"
  | "bizProfileOptions.plumber.competitorNoun"
  | "bizProfileOptions.electrician.label"
  | "bizProfileOptions.electrician.competitorNoun"
  | "bizProfileOptions.landscaper.label"
  | "bizProfileOptions.landscaper.competitorNoun"
  | "bizProfileOptions.cleaning_service.label"
  | "bizProfileOptions.cleaning_service.competitorNoun";

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
  | "dashboard.reports.chartDaysAgo"
  | "dashboard.assistant.historyMessageCount";

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

    "dashboard.nav.overview": "Overview",
    "dashboard.nav.growth": "Growth",
    "dashboard.nav.reviews": "Reviews",
    "dashboard.nav.website": "Website",
    "dashboard.nav.competitors": "Competitors",
    "dashboard.nav.pricing": "Pricing",
    "dashboard.nav.reports": "Reports",
    "dashboard.nav.account": "Account",
    "dashboard.nav.logOut": "Log out",
    "dashboard.shell.openMenuAriaLabel": "Open menu",
    "dashboard.shell.closeMenuAriaLabel": "Close menu",
    "dashboard.shell.noBusinessSelected": "No business selected",
    "dashboard.shell.addBusinessToGetStarted": "+ Add a business to get started",

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

    // --- content.categories.* — lib/scoring.ts's CATEGORY_LABELS.
    "content.categories.visibility": "Visibility & Reputation",
    "content.categories.completeness": "Google Listing Completeness",
    "content.categories.website": "Website",

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

    // --- content.actionPlan.* — lib/actionPlan.ts's ACTION_PLAN_COPY/FALLBACK_COPY.
    "content.actionPlan.visibility.rating.why":
      "Your star rating is often the first thing a potential customer sees — a stronger average rating directly raises the odds they pick you over a nearby competitor.",
    "content.actionPlan.visibility.rating.action":
      "Ask recent happy customers for a review, and reply to any negative ones so future customers see you take feedback seriously.",
    "content.actionPlan.visibility.rating.fix":
      "Go to the Reviews page → use the \"Get more reviews\" section: download your front-desk QR code or copy your review link and share it with customers right after a good visit. A steady trickle beats one big batch.",
    "content.actionPlan.visibility.rating.weeklyAction":
      "Ask 3-5 of your happiest recent customers for a Google review this week — fresh reviews are the fastest real lever on your rating.",
    "content.actionPlan.visibility.review_count.why":
      "More reviews means more social proof — customers trust a business with dozens of reviews far more than one with a handful, even at the same star rating.",
    "content.actionPlan.visibility.review_count.action":
      "Make leaving a review as easy as possible, and ask consistently rather than just once.",
    "content.actionPlan.visibility.review_count.fix":
      "Go to the Reviews page → \"Get more reviews\" section: copy your review link into receipts, follow-up texts, or emails, or print the front-desk QR code for checkout.",
    "content.actionPlan.visibility.review_count.weeklyAction":
      "Ask 3-5 recent customers for a Google review this week — every real review adds up toward a stronger review base.",
    "content.actionPlan.visibility.review_recency.why":
      "A steady stream of recent reviews signals an active, currently-trustworthy business — a rating built entirely on old reviews looks stale to customers and to Google.",
    "content.actionPlan.visibility.review_recency.action":
      "Keep asking for reviews on an ongoing basis, not in one push.",
    "content.actionPlan.visibility.review_recency.fix":
      "Go to the Reviews page → \"Get more reviews\" section and keep sharing your review link or QR code on an ongoing basis — a recurring reminder (weekly, or after every N customers) keeps new reviews coming in instead of stopping after one round.",
    "content.actionPlan.completeness.phone.why":
      "A missing phone number is one of the fastest ways to lose a customer who's ready to call right now.",
    "content.actionPlan.completeness.phone.action": "Add your business phone number to your Google Business Profile.",
    "content.actionPlan.completeness.phone.fix": "In Google Business Profile: Edit profile → Contact information → Phone number.",
    "content.actionPlan.completeness.address.why":
      "Without a verified address, customers — and Google Maps — can't reliably find you, which can keep you out of local search results entirely.",
    "content.actionPlan.completeness.address.action": "Add or correct your business address on Google Business Profile.",
    "content.actionPlan.completeness.address.fix": "In Google Business Profile: Edit profile → Business information → Address.",
    "content.actionPlan.completeness.hours.why":
      "Customers routinely check hours before visiting — if they're missing, many will just choose a competitor who's listed clearly.",
    "content.actionPlan.completeness.hours.action": "Add your real business hours to Google Business Profile.",
    "content.actionPlan.completeness.hours.fix":
      "In Google Business Profile: Edit profile → Business information → Hours. Fill in every day, including holiday hours if they differ.",
    "content.actionPlan.completeness.website_link.why":
      "Linking your website on your Google listing gives customers one more trusted way to learn more and convert, right from search results.",
    "content.actionPlan.completeness.website_link.action": "Link your website URL on your Google Business Profile.",
    "content.actionPlan.completeness.website_link.fix":
      "Don't have a site yet? Build one in minutes on the Website page's starter-site builder. Once you have a URL, add it to your Google Business Profile: Edit profile → Business information → Website.",
    "content.actionPlan.completeness.categories.why":
      "Categories are how Google matches your listing to what people are actually searching for — more accurate categories mean more relevant searches you show up in.",
    "content.actionPlan.completeness.categories.action": "Add or expand your business categories on Google Business Profile.",
    "content.actionPlan.completeness.categories.fix":
      "In Google Business Profile: Edit profile → Business information → Category. Add every category that genuinely describes what you offer, with the most specific one as primary.",
    "content.actionPlan.completeness.photos.why":
      "Listings with real photos get substantially more clicks and calls — photos are often a customer's first real impression of your business.",
    "content.actionPlan.completeness.photos.action": "Add real, current photos of your business to Google Business Profile.",
    "content.actionPlan.completeness.photos.fix":
      "In Google Business Profile: Photos → Add photos. Storefront, interior, team, and your products or work are the highest-impact shots.",
    "content.actionPlan.completeness.business_status.why":
      "If Google shows your listing as closed — temporarily or permanently — when you're actually open, customers won't even consider visiting.",
    "content.actionPlan.completeness.business_status.action":
      "Verify your listing shows as Operational, and if it's wrong, ask Google to correct it.",
    "content.actionPlan.completeness.business_status.fix":
      "In Google Business Profile, check your listing status. Use \"Reopen this business\" if it's marked closed in error, or file a reinstatement request if the listing was suspended.",
    "content.actionPlan.website.has_website.why":
      "A website is one of the strongest trust signals for a customer doing their research — without one, you're relying entirely on your Google listing to make the sale.",
    "content.actionPlan.website.has_website.action": "Get a website up for your business, even a simple one.",
    "content.actionPlan.website.has_website.fix":
      "Go to the Website page → use the starter-site builder: it turns your real Google listing data (hours, services, photos) into a live one-page site in minutes, no design work needed. Want something more custom later? A builder like Squarespace or Wix works too — but this gets you live today.",
    "content.actionPlan.website.https.why":
      "Browsers actively warn visitors when a site isn't secure, which erodes trust fast — HTTPS is a baseline expectation today, not a nice-to-have.",
    "content.actionPlan.website.https.action": "Move your website to HTTPS.",
    "content.actionPlan.website.https.fix":
      "Most hosts issue a free SSL certificate — check your hosting provider's dashboard for an \"enable HTTPS\" or \"SSL\" option, or ask whoever manages your site to turn it on.",
    "content.actionPlan.website.performance_mobile.why":
      "A slow-loading site loses visitors before they ever see what you offer — and Google itself factors real-world site speed into search ranking.",
    "content.actionPlan.website.performance_mobile.action": "Speed up your website, especially on mobile.",
    "content.actionPlan.website.performance_mobile.fix":
      "Compress large images, remove unnecessary scripts/plugins, and use a fast host. PostScore's starter-site builder (Website page) generates a lightweight page that scores well on this by construction.",
    "content.actionPlan.website.content_depth.why":
      "A bare, single-block page reads as unfinished to both visitors and Google — real content is what actually convinces someone to trust and choose you.",
    "content.actionPlan.website.content_depth.action":
      "Build out real content on your site: a clear title, a meta description, a few genuine sections, and real text about what you offer.",
    "content.actionPlan.website.content_depth.fix":
      "Go to the Website page → the starter-site builder already includes a title, meta description, mobile viewport tag, and real sections built from your Google listing data — a fast way to replace a thin page.",
    "content.actionPlan.website.contact_conversion.why":
      "If a visitor can't immediately see how to reach you or what to do next, most will just leave instead of hunting for a contact method.",
    "content.actionPlan.website.contact_conversion.action":
      "Add a real click-to-call phone or email link, and a clear call-to-action, to your website.",
    "content.actionPlan.website.contact_conversion.fix":
      "Go to the Website page → the starter-site builder includes a click-to-call phone link and a clear call-to-action by default whenever a phone number is on file.",
    "content.actionPlan.fallback.why": "Improving this check helps your overall PostScore.",
    "content.actionPlan.fallback.action": "Review the explanation above and address the underlying gap.",
    "content.actionPlan.fallback.fix": "See this check's explanation for exactly what's missing.",

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
    "dashboard.overview.confidenceVerified": "Verified",
    "dashboard.overview.confidenceLikely": "Likely",
    "dashboard.overview.confidenceUncertain": "Uncertain",
    "dashboard.overview.confidenceNotFound": "Not found",
    "dashboard.overview.categoryWeightAnnotation": "(of {weight} weight)",
    "dashboard.overview.hoursLabel": "Hours",
    "dashboard.overview.hoursClosed": "Closed",
    "dashboard.overview.hoursOpen24": "Open 24 hours",
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

    // --- Assistant ("PostAI") chrome: components/assistant/AssistantOverlay.tsx,
    // AssistantView.tsx, BusinessMemoryPanel.tsx.
    "dashboard.assistant.closeAriaLabel": "Close assistant",
    "dashboard.assistant.generalGuidanceLabel": "General guidance",
    "dashboard.assistant.thinking": "Thinking…",
    "dashboard.assistant.yourBusinessFallback": "your business",
    "dashboard.assistant.emptyStateHeadline": "Ask anything about {business}'s presence",
    "dashboard.assistant.emptyStateBody":
      "Answers are grounded in your real PostScore data. General strategy tips are always labeled separately.",
    "dashboard.assistant.noPastConversations": "No past conversations yet.",
    "dashboard.assistant.newConversationFallback": "New conversation",
    "dashboard.assistant.historyMessageCount.one": "{count} message",
    "dashboard.assistant.historyMessageCount.other": "{count} messages",
    "dashboard.assistant.couldNotReachFallback": "Couldn't reach the assistant — try again.",
    "dashboard.assistant.couldNotLoadPastConversations": "Couldn't load past conversations.",
    "dashboard.assistant.couldNotLoadConversation": "Couldn't load this conversation.",
    "dashboard.assistant.groundedInScore":
      "Grounded in your real PostScore ({total}/100) — general tips are always labeled, nothing is fabricated.",
    "dashboard.assistant.continuingConversation": "Continuing this conversation",
    "dashboard.assistant.newConversationSavedNote": "New conversation — past chats are saved",
    "dashboard.assistant.backToChat": "Back to chat",
    "dashboard.assistant.historyButton": "History",
    "dashboard.assistant.newChatButton": "New chat",
    "dashboard.assistant.inputPlaceholder":
      "Ask about your score, action plan, competitors, or general marketing advice…",
    "dashboard.assistant.sendButton": "Send",
    "dashboard.assistant.errorTypeQuestionFirst": "Type a question first.",
    "dashboard.assistant.errorCouldNotStartConversation": "Could not start a new conversation.",
    "dashboard.assistant.errorCouldNotSaveMessage": "Could not save your message.",
    "dashboard.assistant.errorCouldNotGetReply": "Couldn't get a reply.",
    "dashboard.assistant.starterPrompts.whatsHurtingScore": "What's hurting my score the most right now?",
    "dashboard.assistant.starterPrompts.top3ThisWeek": "What are the top 3 things I should fix this week?",
    "dashboard.assistant.starterPrompts.whatsChangedSinceStart": "What's changed since I started?",
    "dashboard.assistant.starterPrompts.whyCategoryLosingPoints": "Why is my {category} section losing points?",
    "dashboard.assistant.starterPrompts.compareToCompetitorsAvailable": "How do I compare to my nearby competitors?",
    "dashboard.assistant.starterPrompts.compareToCompetitorsUnavailable": "How can I compare to my nearby competitors?",
    "dashboard.assistant.starterPrompts.howToGetMoreReviews": "How do I get more Google reviews?",
    "dashboard.assistant.starterPrompts.ratingGoodEnough":
      "Is my rating good enough, or should I focus on getting more reviews?",
    "dashboard.assistant.starterPrompts.startBuildingRatingFromZero": "How do I start building a rating from zero reviews?",
    "dashboard.assistant.memory.noSavedScans": "No saved scans yet.",
    "dashboard.assistant.memory.onlyOneScore": "Only one saved score so far — {total}/100 on {date}. No trend yet.",
    "dashboard.assistant.memory.pointsSinceDate": "{delta} pts since {date}",
    "dashboard.assistant.memory.noConfirmedFixed": "Nothing confirmed fixed yet.",
    "dashboard.assistant.memory.pointsGainedWithDate": "+{points} pts · {date}",
    "dashboard.assistant.memory.pointsGainedNoDate": "+{points} pts",
    "dashboard.assistant.memory.removeServiceAriaLabel": "Remove {service}",
    "dashboard.assistant.memory.noServicesYet": "No services added yet.",
    "dashboard.assistant.memory.serviceInputPlaceholder": "e.g. Haircuts",
    "dashboard.assistant.memory.addButton": "Add",
    "dashboard.assistant.memory.businessTypeLabel": "Business type",
    "dashboard.assistant.memory.businessTypeCorrected": 'Corrected by you — Google detected "{autoDetected}."',
    "dashboard.assistant.memory.businessTypeAutoDetected": "Auto-detected from your Google listing.",
    "dashboard.assistant.memory.couldNotSaveFallback": "Couldn't save — try again.",
    "dashboard.assistant.memory.heading": "What I know about your business",
    "dashboard.assistant.memory.subheading": "The real facts the assistant remembers, every session.",
    "dashboard.assistant.memory.locationLabel": "Location",
    "dashboard.assistant.memory.notOnFile": "Not on file",
    "dashboard.assistant.memory.servicesJobValueHeading": "Services & typical job value",
    "dashboard.assistant.memory.editButton": "Edit",
    "dashboard.assistant.memory.servicesFieldLabel": "Services",
    "dashboard.assistant.memory.jobValueRangeLabel": "Typical job/ticket value range",
    "dashboard.assistant.memory.lowPlaceholder": "Low",
    "dashboard.assistant.memory.highPlaceholder": "High",
    "dashboard.assistant.memory.toSeparator": "to $",
    "dashboard.assistant.memory.errorMissingLow": "Enter a low value too, or clear the high value.",
    "dashboard.assistant.memory.errorMissingHigh": "Enter a high value too, or clear the low value.",
    "dashboard.assistant.memory.errorInvalidNumbers": "Enter valid positive numbers.",
    "dashboard.assistant.memory.errorLowExceedsHigh": "The low value can't be more than the high value.",
    "dashboard.assistant.memory.servicesNotEntered": "Not entered yet.",
    "dashboard.assistant.memory.jobValueLine": "Typical job/ticket value: ${low} to ${high}",
    "dashboard.assistant.memory.jobValueNotEntered": "Typical job/ticket value: not entered yet.",
    "dashboard.assistant.memory.fixedHeading": "What you've fixed",
    "dashboard.assistant.memory.scoreTrendHeading": "Score trend",

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

    // --- Pricing page. See the matching comment on the MessageKey union
    // above.
    "dashboard.pricing.pageTitle": "Price check",
    "dashboard.pricing.introText":
      "Enter your prices and see how they compare to your local market — with advice on where you can adjust to bring more people in.",
    "dashboard.pricing.disclosureText":
      "Optional and private. Prices aren't part of your score — this is just a tool. You type in what you charge; we compare it to local market data where we can find it, and give a clear estimate where we can't. We never guess a competitor's exact price.",
    "dashboard.pricing.rankingsHeading": "What the rankings mean",
    "dashboard.pricing.tier.underMarket.label": "Under market",
    "dashboard.pricing.tier.underMarket.description":
      "Below the local range — there may be room to raise this price.",
    "dashboard.pricing.tier.competitive.label": "Competitive",
    "dashboard.pricing.tier.competitive.description": "Within the typical local range for this service.",
    "dashboard.pricing.tier.upperMid.label": "Upper-mid",
    "dashboard.pricing.tier.upperMid.description": "Toward the top of the local range.",
    "dashboard.pricing.tier.premium.label": "Premium",
    "dashboard.pricing.tier.premium.description": "Above the local range — fine if your reviews back it up.",
    "dashboard.pricing.tier.noData.label": "No market data",
    "dashboard.pricing.tier.noData.description": "We couldn't find reliable local prices, so we won't guess.",
    "dashboard.pricing.basis.verifiedLocal.label": "Based on local price levels",
    "dashboard.pricing.basis.generalEstimate.label": "General estimate",
    "dashboard.pricing.servicesHeading": "Your services & prices",
    "dashboard.pricing.removeServiceAriaLabel": "Remove {service}",
    "dashboard.pricing.enterServiceName": "Enter a service name.",
    "dashboard.pricing.enterValidPrice": "Enter a valid price.",
    "dashboard.pricing.couldNotAddRow": "Could not add this row.",
    "dashboard.pricing.couldNotSaveRow": "Could not save this row.",
    "dashboard.pricing.couldNotRemoveRow": "Could not remove this row.",
    "dashboard.pricing.emptyServicesPrompt":
      "Add a service and what you charge for it below to get started.",
    "dashboard.pricing.servicePlaceholder": "e.g. {example}",
    "dashboard.pricing.standardServiceFallback": "Standard Service",
    "dashboard.pricing.addServiceButton": "Add",
    "dashboard.pricing.examplesPrefix": "Examples: {examples}",
    "dashboard.pricing.priceLevelContextHeading": "Real Google price-level context",
    "dashboard.pricing.youLabel": "You",
    "dashboard.pricing.assessmentEmptyState":
      "Add your prices, then click \"Assess my pricing\" to see how they compare.",
    "dashboard.pricing.pricingTipsHeading": "Pricing tips for {profile}",
    "dashboard.pricing.generalStrategyFootnote":
      "General pricing strategy for this type of business — not a data-driven analysis of your actual prices. For that, use \"Assess my pricing\" above.",
    "dashboard.pricing.noPricesError": "Add at least one service and price above first.",
    "dashboard.pricing.assessErrorFallback": "Couldn't assess pricing — try again.",
    "dashboard.pricing.assessmentHeading": "Your pricing assessment",
    "dashboard.pricing.assessingButton": "Assessing…",
    "dashboard.pricing.reassessButton": "Re-assess my pricing",
    "dashboard.pricing.assessButton": "Assess my pricing",
    "dashboard.pricing.lastAssessed": "Last assessed {date}",

    // --- Business-type profiles (config/bizProfiles.ts). See the
    // matching comment on the MessageKey union above.
    "bizProfiles.salon.label": "Salon & Personal Care",
    "bizProfiles.salon.competitorNoun": "salons",
    "bizProfiles.salon.couponPresets.pct_off_next_appt.label": "10% off your next appointment",
    "bizProfiles.salon.couponPresets.pct_off_next_appt.description": "A simple loyalty nudge — give it to anyone who books their next visit before leaving.",
    "bizProfiles.salon.couponPresets.flat_off_rebook.label": "$15 off your next visit when you rebook today",
    "bizProfiles.salon.couponPresets.flat_off_rebook.description": "Rewards booking ahead specifically, which smooths out your schedule.",
    "bizProfiles.salon.couponPresets.bring_a_friend.label": "Bring a friend: you both get 15% off",
    "bizProfiles.salon.couponPresets.bring_a_friend.description": "Turns an existing client into new foot traffic without any ad spend.",
    "bizProfiles.salon.offerTemplates.new_client_special.label": "New client special: 20% off your first appointment",
    "bizProfiles.salon.offerTemplates.new_client_special.description": "The single highest-converting offer for a service business — removes the risk of trying someone new.",
    "bizProfiles.salon.offerTemplates.referral_credit.label": "Referral reward: $10 credit for you and your friend",
    "bizProfiles.salon.offerTemplates.referral_credit.description": "Pairs well with the coupon above — give both people a reason to act.",
    "bizProfiles.salon.referralPresets.pct_off_both.referrerReward": "$15 off your next visit",
    "bizProfiles.salon.referralPresets.pct_off_both.friendReward": "20% off their first visit",
    "bizProfiles.salon.referralPresets.pct_off_both.description": "The classic salon referral — rewards loyalty and removes the risk of trying someone new.",
    "bizProfiles.salon.referralPresets.free_addon.referrerReward": "A free add-on (blowout, brow wax, etc.) on your next visit",
    "bizProfiles.salon.referralPresets.free_addon.friendReward": "10% off their first appointment",
    "bizProfiles.salon.referralPresets.free_addon.description": "Costs you time and product, not cash — a good option if you'd rather not discount services directly.",
    "bizProfiles.salon.pricingTips.anchor_premium.label": "Anchor with your premium service",
    "bizProfiles.salon.pricingTips.anchor_premium.description": "List your most premium color or treatment service first on your menu — even clients who choose a basic cut anchor their expectations against it, making your mid-tier services feel reasonably priced by comparison.",
    "bizProfiles.salon.pricingTips.consult_price_chemical.label": "Price chemical services by consultation",
    "bizProfiles.salon.pricingTips.consult_price_chemical.description": "Hair length and thickness vary enormously; a flat price for color or treatments either underpays you on thick, long hair or overprices thin, short hair. Quote those after a quick look, not off a fixed menu price.",
    "bizProfiles.salon.pricingTips.good_better_best.label": "Offer a good/better/best tier",
    "bizProfiles.salon.pricingTips.good_better_best.description": "A basic blowout, a deluxe version, and a premium add-on let clients self-select their spend instead of you guessing one price that's wrong for everyone.",
    "bizProfiles.salon.pricingTips.raise_when_booked_out.label": "Raise prices when you're consistently booked 1-2 weeks out",
    "bizProfiles.salon.pricingTips.raise_when_booked_out.description": "A steadily full calendar — not just a busy Saturday — is the honest signal you're underpriced relative to demand.",
    "bizProfiles.salon.couponAngles.firstTime": "New client special: 20% off your first appointment",
    "bizProfiles.salon.couponAngles.seasonal": "Holiday styling special: book your seasonal look this week",
    "bizProfiles.salon.couponAngles.slowDay": "20% off Tuesday & Wednesday appointments",
    "bizProfiles.salon.growActions.action1": "Ask every client at checkout for a Google review — the best time is right after a great appointment.",
    "bizProfiles.salon.growActions.action2": "Post real before/after photos weekly; personal-care listings live and die on photos.",
    "bizProfiles.salon.growActions.action3": "Offer a small rebooking discount right at checkout so the next visit gets locked in.",
    "bizProfiles.salon.growActions.action4": "Run a seasonal styling special around holidays or events people book ahead for.",
    "bizProfiles.salon.pricingExamples.example1": "Women's Haircut",
    "bizProfiles.salon.pricingExamples.example2": "Men's Haircut",
    "bizProfiles.salon.pricingExamples.example3": "Color & Highlights",
    "bizProfiles.salon.faq.item1.question": "Do I need an appointment at {businessName}?",
    "bizProfiles.salon.faq.item1.answer": "We recommend booking ahead to guarantee your preferred time, though walk-ins may be available depending on the day.",
    "bizProfiles.salon.faq.item2.question": "What areas does {businessName} serve near {city}?",
    "bizProfiles.salon.faq.item2.answer": "We're located in {city} and welcome clients from the surrounding area.",
    "bizProfiles.restaurant.label": "Restaurant & Food Service",
    "bizProfiles.restaurant.competitorNoun": "restaurants",
    "bizProfiles.restaurant.couponPresets.free_item_with_purchase.label": "Free appetizer or dessert with any entrée",
    "bizProfiles.restaurant.couponPresets.free_item_with_purchase.description": "Feels generous without discounting your core menu price.",
    "bizProfiles.restaurant.couponPresets.pct_off_pickup.label": "15% off pickup or online orders",
    "bizProfiles.restaurant.couponPresets.pct_off_pickup.description": "Pushes traffic toward your cheapest-to-fulfill order channel.",
    "bizProfiles.restaurant.couponPresets.bogo_entree.label": "Buy one entrée, get one 50% off (dine-in only)",
    "bizProfiles.restaurant.couponPresets.bogo_entree.description": "A classic slow-night traffic driver — restrict it to your quietest hours.",
    "bizProfiles.restaurant.offerTemplates.happy_hour.label": "Happy hour: 20% off drinks, 4–6pm",
    "bizProfiles.restaurant.offerTemplates.happy_hour.description": "Fills the gap between lunch and dinner rushes.",
    "bizProfiles.restaurant.offerTemplates.first_online_order.label": "First-time online order: free delivery",
    "bizProfiles.restaurant.offerTemplates.first_online_order.description": "Removes the biggest friction point for a customer trying you for the first time.",
    "bizProfiles.restaurant.referralPresets.free_item_both.referrerReward": "A free appetizer or dessert on your next visit",
    "bizProfiles.restaurant.referralPresets.free_item_both.friendReward": "A free appetizer or dessert on their first order",
    "bizProfiles.restaurant.referralPresets.free_item_both.description": "Free items cost less than a straight discount and feel generous to both sides.",
    "bizProfiles.restaurant.referralPresets.pct_off_both.referrerReward": "$10 off your next order",
    "bizProfiles.restaurant.referralPresets.pct_off_both.friendReward": "15% off their first order",
    "bizProfiles.restaurant.referralPresets.pct_off_both.description": "Straightforward cash-off works well for takeout and delivery orders.",
    "bizProfiles.restaurant.pricingTips.anchor_standout_dish.label": "Anchor with one standout high-price dish",
    "bizProfiles.restaurant.pricingTips.anchor_standout_dish.description": "A single $32 entrée on the menu makes every $18-22 entrée look reasonable by comparison, even if few people actually order the anchor item itself.",
    "bizProfiles.restaurant.pricingTips.steer_to_margin.label": "Steer orders to your best-margin items",
    "bizProfiles.restaurant.pricingTips.steer_to_margin.description": "Highlighting a strong-margin dish (bolding it, adding \"chef's favorite\") lifts orders toward it without discounting anything.",
    "bizProfiles.restaurant.pricingTips.review_prices_periodically.label": "Review menu prices on a schedule, not by feel",
    "bizProfiles.restaurant.pricingTips.review_prices_periodically.description": "Many restaurants underprice for years because reprinting the menu feels like a hassle. A quarterly price review against your real food costs avoids slow margin erosion.",
    "bizProfiles.restaurant.pricingTips.bundle_combo.label": "Use combo or bundle pricing",
    "bizProfiles.restaurant.pricingTips.bundle_combo.description": "Pairing an app or side with an entrée at a set combined price increases the average ticket without feeling like a price hike to the customer.",
    "bizProfiles.restaurant.couponAngles.firstTime": "First-time online order: free delivery",
    "bizProfiles.restaurant.couponAngles.seasonal": "Seasonal menu special: this month's feature, 15% off",
    "bizProfiles.restaurant.couponAngles.slowDay": "Buy one entrée, get one 50% off — dine-in, Sunday–Tuesday",
    "bizProfiles.restaurant.growActions.action1": "Ask happy diners for a Google review before they leave, or on the receipt.",
    "bizProfiles.restaurant.growActions.action2": "Post daily or weekly specials as real photos — food photos are the single biggest driver of clicks.",
    "bizProfiles.restaurant.growActions.action3": "Make sure your menu and prices are current on your Google listing.",
    "bizProfiles.restaurant.growActions.action4": "Run a promotion on your slowest night of the week instead of discounting your busiest.",
    "bizProfiles.restaurant.pricingExamples.example1": "Entrée",
    "bizProfiles.restaurant.pricingExamples.example2": "Appetizer",
    "bizProfiles.restaurant.pricingExamples.example3": "Dessert",
    "bizProfiles.restaurant.faq.item1.question": "Does {businessName} take reservations?",
    "bizProfiles.restaurant.faq.item1.answer": "Give us a call or check our website to see reservation availability.",
    "bizProfiles.restaurant.faq.item2.question": "Does {businessName} offer takeout or delivery?",
    "bizProfiles.restaurant.faq.item2.answer": "Yes — order for pickup directly, or through your preferred delivery app.",
    "bizProfiles.liquor_wine.label": "Liquor & Wine Store",
    "bizProfiles.liquor_wine.competitorNoun": "liquor stores",
    "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.label": "$5 off a $30+ purchase",
    "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.description": "A simple threshold discount that nudges a single-bottle visit into a bigger basket.",
    "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.label": "Buy 2 bottles, get 10% off",
    "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.description": "Rewards buying more than one bottle without discounting your best sellers outright.",
    "bizProfiles.liquor_wine.couponPresets.case_discount.label": "10% off when you buy a full case (12 bottles)",
    "bizProfiles.liquor_wine.couponPresets.case_discount.description": "Standard retail case-discount math — moves volume and rewards your best customers.",
    "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.label": "Featured wine or spirit of the month: 15% off",
    "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.description": "Gives repeat customers a reason to check back, and lets you move a specific bottle.",
    "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.label": "New customer: 10% off your first purchase",
    "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.description": "Low-risk way to get a first-time shopper to choose you over a bigger chain store.",
    "bizProfiles.liquor_wine.referralPresets.credit_both.referrerReward": "$5 credit toward your next purchase",
    "bizProfiles.liquor_wine.referralPresets.credit_both.friendReward": "$5 off their first purchase",
    "bizProfiles.liquor_wine.referralPresets.credit_both.description": "Simple cash-off works well for a straightforward retail purchase.",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.referrerReward": "10% off your next case",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.friendReward": "10% off their first purchase",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.description": "Rewards your best (case-buying) customers specifically for bringing in new ones.",
    "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.label": "Use a few loss-leader items to drive traffic",
    "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.description": "A handful of well-known, aggressively-priced bottles get people in the door; make it back on higher-margin wine and spirits they buy alongside them.",
    "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.label": "Price cases to reward bulk buying",
    "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.description": "A standard 10-15% case discount is expected in this category — not offering one pushes case-sized purchases to a competitor who does.",
    "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.label": "Feature your best-margin bottles at eye level",
    "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.description": 'Placement and a "staff pick" tag lift sales on your best-margin bottles more effectively than discounting your worst-margin ones.',
    "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.label": "Plan promotions around real seasonal demand spikes",
    "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.description": "Holidays, tailgate season, and summer cookouts are when case-sized purchases naturally happen — put your promotional budget there instead of spreading it evenly all year.",
    "bizProfiles.liquor_wine.couponAngles.firstTime": "New customer: 10% off your first purchase",
    "bizProfiles.liquor_wine.couponAngles.seasonal": "Holiday case discount: 15% off mixed cases through New Year's",
    "bizProfiles.liquor_wine.couponAngles.slowDay": "10% off purchases on your slowest weekday",
    "bizProfiles.liquor_wine.growActions.action1": "Ask regulars for a Google review at checkout — it's the fastest way to build trust with first-time shoppers.",
    "bizProfiles.liquor_wine.growActions.action2": "Post real photos of new arrivals, seasonal picks, and your featured bottle of the month.",
    "bizProfiles.liquor_wine.growActions.action3": "Highlight a weekly or monthly staff pick — gives repeat customers a reason to check back.",
    "bizProfiles.liquor_wine.growActions.action4": "Run a case-discount promotion around holidays (Thanksgiving, New Year's, summer cookouts) when case buying spikes.",
    "bizProfiles.liquor_wine.pricingExamples.example1": "Bottle of Wine",
    "bizProfiles.liquor_wine.pricingExamples.example2": "Six-Pack of Beer",
    "bizProfiles.liquor_wine.pricingExamples.example3": "Case (12 bottles)",
    "bizProfiles.liquor_wine.faq.item1.question": "Does {businessName} offer tastings or take special orders?",
    "bizProfiles.liquor_wine.faq.item1.answer": "Call or stop by to ask about upcoming tastings and special-order requests.",
    "bizProfiles.liquor_wine.faq.item2.question": "What are {businessName}'s hours near {city}?",
    "bizProfiles.liquor_wine.faq.item2.answer": "See our current hours on our Google Business Profile listing.",
    "bizProfiles.grocery_market.label": "Grocery / Market",
    "bizProfiles.grocery_market.competitorNoun": "grocery stores",
    "bizProfiles.grocery_market.couponPresets.flat_off_basket.label": "$5 off a $40+ basket",
    "bizProfiles.grocery_market.couponPresets.flat_off_basket.description": "A threshold discount sized to your typical basket, not a single item.",
    "bizProfiles.grocery_market.couponPresets.weekly_special.label": "This week's special: featured items discounted",
    "bizProfiles.grocery_market.couponPresets.weekly_special.description": "Keeps the store feeling fresh and gives shoppers a reason to check back weekly.",
    "bizProfiles.grocery_market.couponPresets.loyalty_repeat.label": "Loyalty: every 10th shop, $10 off",
    "bizProfiles.grocery_market.couponPresets.loyalty_repeat.description": "Rewards shopping frequency directly — the real driver of grocery revenue.",
    "bizProfiles.grocery_market.offerTemplates.new_shopper_special.label": "New shopper special: $10 off your first $40+ order",
    "bizProfiles.grocery_market.offerTemplates.new_shopper_special.description": "Removes the risk of switching from wherever a shopper usually goes.",
    "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.label": "Seasonal produce sale: this week's fresh picks discounted",
    "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.description": "Moves perishable inventory while it's at its best, and reads as genuinely fresh.",
    "bizProfiles.grocery_market.referralPresets.credit_both.referrerReward": "$10 credit toward your next shop",
    "bizProfiles.grocery_market.referralPresets.credit_both.friendReward": "$10 off their first $40+ order",
    "bizProfiles.grocery_market.referralPresets.credit_both.description": "Store credit brings the referrer back for another shop, not just a one-time reward.",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.referrerReward": "10% off your next shop",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.friendReward": "10% off their first shop",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.description": "Simple and universally understood for a basket-based purchase.",
    "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.label": "Use weekly specials as loss leaders",
    "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.description": "A few aggressively-priced staples each week pull shoppers in; the rest of their basket is where the real margin comes from.",
    "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.label": "Price bulk and case items to reward bigger baskets",
    "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.description": "A modest per-unit discount on multi-packs increases average basket size without discounting everyday single items.",
    "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.label": "Adjust produce pricing to real seasonal supply costs",
    "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.description": "Produce cost swings with the season — repricing it on a schedule protects margin better than a fixed year-round price.",
    "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.label": "Use loyalty rewards to raise visit frequency, not to discount margin",
    "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.description": "A repeat-shop reward (every 10th visit, say) grows revenue by bringing shoppers back more often, rather than cutting the price of every visit.",
    "bizProfiles.grocery_market.couponAngles.firstTime": "New shopper special: $10 off your first $40+ order",
    "bizProfiles.grocery_market.couponAngles.seasonal": "Seasonal produce sale: this week's fresh picks discounted",
    "bizProfiles.grocery_market.couponAngles.slowDay": "$5 off a $40+ basket on your slowest shopping day",
    "bizProfiles.grocery_market.growActions.action1": "Ask regular shoppers for a Google review at checkout.",
    "bizProfiles.grocery_market.growActions.action2": "Post real photos of fresh produce and this week's specials — food photos drive foot traffic.",
    "bizProfiles.grocery_market.growActions.action3": "Keep your weekly specials and hours current on your Google listing.",
    "bizProfiles.grocery_market.growActions.action4": "Start a simple loyalty program (e.g. every 10th shop, $10 off) to reward repeat shoppers.",
    "bizProfiles.grocery_market.pricingExamples.example1": "Weekly Basket",
    "bizProfiles.grocery_market.pricingExamples.example2": "Featured Special Item",
    "bizProfiles.grocery_market.pricingExamples.example3": "Bulk/Case Item",
    "bizProfiles.grocery_market.faq.item1.question": "Does {businessName} offer delivery or curbside pickup?",
    "bizProfiles.grocery_market.faq.item1.answer": "Call or check our website to see current delivery and pickup options.",
    "bizProfiles.grocery_market.faq.item2.question": "What are {businessName}'s hours near {city}?",
    "bizProfiles.grocery_market.faq.item2.answer": "See our current hours on our Google Business Profile listing.",
    "bizProfiles.cafe_bakery.label": "Café & Bakery",
    "bizProfiles.cafe_bakery.competitorNoun": "cafes",
    "bizProfiles.cafe_bakery.couponPresets.flat_off_order.label": "$2 off any order of $10+",
    "bizProfiles.cafe_bakery.couponPresets.flat_off_order.description": "A low, easy threshold that fits a typical coffee-and-pastry order.",
    "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.label": "Free pastry or drink with any $15+ purchase",
    "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.description": "Feels generous without discounting your core menu price.",
    "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.label": "Buy 9 drinks, get the 10th free",
    "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.description": "The classic café loyalty structure — rewards habitual repeat visits.",
    "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.label": "First-time customer: free drink or pastry with any purchase",
    "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.description": "Removes the risk of trying somewhere new for their morning coffee run.",
    "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.label": "20% off orders before 9am",
    "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.description": "Fills your early slow hours instead of discounting your rush.",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.referrerReward": "A free drink or pastry on your next visit",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.friendReward": "A free drink or pastry on their first visit",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.description": "Free items cost less than a straight discount and feel generous to both sides.",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.referrerReward": "$5 off your next order",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.friendReward": "15% off their first order",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.description": "Straightforward cash-off for a typical coffee-shop order.",
    "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.label": "Anchor with a specialty or premium drink",
    "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.description": "A $7 specialty latte on the board makes your $4.50 standard latte feel like the reasonable choice.",
    "bizProfiles.cafe_bakery.pricingTips.bundle_combo.label": "Use combo pricing for a drink + pastry",
    "bizProfiles.cafe_bakery.pricingTips.bundle_combo.description": "A set combined price for a drink and a pastry lifts average ticket without feeling like a price hike.",
    "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.label": "Review prices as ingredient costs shift",
    "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.description": "Coffee, dairy, and flour costs move often; check menu pricing against real costs on a schedule rather than by feel.",
    "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.label": "Use a loyalty punch card instead of blanket discounts",
    "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.description": "Rewarding the 10th visit costs less over time than discounting every visit, and it drives repeat frequency specifically.",
    "bizProfiles.cafe_bakery.couponAngles.firstTime": "First-time customer: free drink or pastry with any purchase",
    "bizProfiles.cafe_bakery.couponAngles.seasonal": "Seasonal drink or pastry: try it this month, 15% off",
    "bizProfiles.cafe_bakery.couponAngles.slowDay": "20% off orders during your slowest afternoon hours",
    "bizProfiles.cafe_bakery.growActions.action1": "Ask happy customers for a Google review before they leave.",
    "bizProfiles.cafe_bakery.growActions.action2": "Post daily photos of fresh pastries, seasonal drinks, and the space itself.",
    "bizProfiles.cafe_bakery.growActions.action3": "Keep your menu and prices current on your Google listing.",
    "bizProfiles.cafe_bakery.growActions.action4": "Run a loyalty punch card (physical or digital) to reward regulars.",
    "bizProfiles.cafe_bakery.pricingExamples.example1": "Coffee/Espresso Drink",
    "bizProfiles.cafe_bakery.pricingExamples.example2": "Pastry/Baked Good",
    "bizProfiles.cafe_bakery.pricingExamples.example3": "Sandwich or Light Bite",
    "bizProfiles.cafe_bakery.faq.item1.question": "Does {businessName} have Wi-Fi or seating to work from?",
    "bizProfiles.cafe_bakery.faq.item1.answer": "Yes — stop in and ask about seating and Wi-Fi availability.",
    "bizProfiles.cafe_bakery.faq.item2.question": "Does {businessName} take special orders for cakes or catering?",
    "bizProfiles.cafe_bakery.faq.item2.answer": "Call or stop by to ask about special orders and catering.",
    "bizProfiles.lawyer.label": "Legal Services",
    "bizProfiles.lawyer.competitorNoun": "firms",
    "bizProfiles.lawyer.couponPresets.free_consultation.label": "Free 30-minute initial consultation",
    "bizProfiles.lawyer.couponPresets.free_consultation.description": "The standard, ethically uncomplicated way most firms lower the barrier to a first call.",
    "bizProfiles.lawyer.couponPresets.flat_fee_review.label": "Flat-fee case review for a set price",
    "bizProfiles.lawyer.couponPresets.flat_fee_review.description": "Gives a price-anxious prospective client a known cost to get real advice.",
    "bizProfiles.lawyer.offerTemplates.new_client_doc_review.label": "New client discount on document preparation",
    "bizProfiles.lawyer.offerTemplates.new_client_doc_review.description": "A concrete, bounded discount that doesn't touch contingency or hourly case work.",
    "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.label": "Use flat fees for commodity work",
    "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.description": "For predictable matters like document review or uncontested filings, a known flat fee removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust.",
    "bizProfiles.lawyer.pricingTips.tiered_consultation.label": "Offer a tiered consultation",
    "bizProfiles.lawyer.pricingTips.tiered_consultation.description": "A free 15-minute phone screen plus a paid 1-hour strategy session lets price-sensitive prospects self-select in without you working for free indefinitely.",
    "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.label": "Raise rates when you're turning away work",
    "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.description": "Consistently declining matters you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase.",
    "bizProfiles.lawyer.pricingTips.scope_in_writing.label": "Put what's included in writing",
    "bizProfiles.lawyer.pricingTips.scope_in_writing.description": "Being explicit about what a flat fee covers (and what triggers hourly billing) up front prevents fee disputes later.",
    "bizProfiles.lawyer.couponAngles.firstTime": "Free 30-minute initial consultation",
    "bizProfiles.lawyer.couponAngles.seasonal": "Year-end document review special — get your paperwork in order",
    "bizProfiles.lawyer.couponAngles.slowDay": "Flat-fee case review, available this week",
    "bizProfiles.lawyer.growActions.action1": "Ask satisfied clients for a Google review once their matter is resolved, where doing so is ethically appropriate.",
    "bizProfiles.lawyer.growActions.action2": "Publish a short, plain-language FAQ answering the questions {city} clients actually ask before calling.",
    "bizProfiles.lawyer.growActions.action3": "Keep your practice areas and attorney bios current — this is often the deciding factor between two firms.",
    "bizProfiles.lawyer.growActions.action4": "Respond calmly and professionally to any negative review; how a firm handles criticism is itself evidence to a prospective client.",
    "bizProfiles.lawyer.pricingExamples.example1": "Initial Consultation",
    "bizProfiles.lawyer.pricingExamples.example2": "Flat-Fee Document Review",
    "bizProfiles.lawyer.pricingExamples.example3": "Hourly Rate",
    "bizProfiles.lawyer.faq.item1.question": "Does {businessName} offer a free consultation?",
    "bizProfiles.lawyer.faq.item1.answer": "Yes — call or use our contact form to schedule an initial consultation.",
    "bizProfiles.lawyer.faq.item2.question": "What areas of law does {businessName} practice?",
    "bizProfiles.lawyer.faq.item2.answer": "See our practice areas page for the specific matters we handle.",
    "bizProfiles.professional_services.label": "Accounting & Tax",
    "bizProfiles.professional_services.competitorNoun": "accounting firms",
    "bizProfiles.professional_services.couponPresets.free_consultation.label": "Free 30-minute initial consultation",
    "bizProfiles.professional_services.couponPresets.free_consultation.description": "Lowers the barrier to a first call for a prospect who isn't sure what they need yet.",
    "bizProfiles.professional_services.couponPresets.flat_fee_package.label": "Flat-fee package for a simple return or bookkeeping setup",
    "bizProfiles.professional_services.couponPresets.flat_fee_package.description": "Gives a price-anxious prospective client a known cost instead of an open-ended hourly estimate.",
    "bizProfiles.professional_services.couponPresets.new_client_pct.label": "10% off your first year of service",
    "bizProfiles.professional_services.couponPresets.new_client_pct.description": "A bounded discount that doesn't touch your ongoing engagement rate.",
    "bizProfiles.professional_services.offerTemplates.new_client_return_discount.label": "New client discount: $50 off your first tax return",
    "bizProfiles.professional_services.offerTemplates.new_client_return_discount.description": "A concrete, low-risk reason to switch from a prior preparer.",
    "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.label": "Bundle monthly bookkeeping and annual tax prep into one flat package price",
    "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.description": "Packaging recurring and annual work together increases what a client books with you at once.",
    "bizProfiles.professional_services.referralPresets.credit_both.referrerReward": "$25 credit toward your next invoice",
    "bizProfiles.professional_services.referralPresets.credit_both.friendReward": "$50 off their first service",
    "bizProfiles.professional_services.referralPresets.credit_both.description": "Invoice credit keeps the referrer engaged as an ongoing client rather than a one-time discount.",
    "bizProfiles.professional_services.referralPresets.pct_off_both.referrerReward": "10% off your next year of service",
    "bizProfiles.professional_services.referralPresets.pct_off_both.friendReward": "10% off their first year",
    "bizProfiles.professional_services.referralPresets.pct_off_both.description": "Simple and proportional for an ongoing engagement rather than a one-off purchase.",
    "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.label": "Use flat fees for straightforward returns",
    "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.description": "A known flat fee for a simple return removes the price anxiety of an open-ended hourly estimate most prospective clients don't trust.",
    "bizProfiles.professional_services.pricingTips.tiered_by_complexity.label": "Tier pricing by complexity, not by client",
    "bizProfiles.professional_services.pricingTips.tiered_by_complexity.description": "A simple/standard/complex return tier lets clients self-select based on their actual situation instead of one flat price under- or over-charging most of them.",
    "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.label": "Use a monthly retainer for ongoing bookkeeping",
    "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.description": "A predictable monthly retainer for recurring bookkeeping work is easier for a client to budget for than variable hourly billing, and smooths your own revenue.",
    "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.label": "Raise rates when you're turning away work",
    "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.description": "Consistently declining new engagements you'd otherwise take is the real signal you're underpriced — not how long it's been since your last increase.",
    "bizProfiles.professional_services.couponAngles.firstTime": "Free 30-minute initial consultation",
    "bizProfiles.professional_services.couponAngles.seasonal": "Tax season special: book your return early and save",
    "bizProfiles.professional_services.couponAngles.slowDay": "Flat-fee bookkeeping setup review, available this week",
    "bizProfiles.professional_services.growActions.action1": "Ask satisfied clients for a Google review once their return or engagement is complete.",
    "bizProfiles.professional_services.growActions.action2": "Publish a short FAQ answering the tax/bookkeeping questions {city} clients actually ask.",
    "bizProfiles.professional_services.growActions.action3": "Keep your services and credentials current on your listing — clients compare this directly.",
    "bizProfiles.professional_services.growActions.action4": "Offer a free consultation to convert price-sensitive prospects who are still deciding.",
    "bizProfiles.professional_services.pricingExamples.example1": "Individual Tax Return",
    "bizProfiles.professional_services.pricingExamples.example2": "Business Tax Return",
    "bizProfiles.professional_services.pricingExamples.example3": "Monthly Bookkeeping",
    "bizProfiles.professional_services.faq.item1.question": "Does {businessName} offer a free consultation?",
    "bizProfiles.professional_services.faq.item1.answer": "Yes — call or use our contact form to schedule an initial consultation.",
    "bizProfiles.professional_services.faq.item2.question": "What services does {businessName} provide?",
    "bizProfiles.professional_services.faq.item2.answer": "See our services page for the specific accounting and tax services we offer.",
    "bizProfiles.practitioner.label": "Practitioner, Coaching & Classes",
    "bizProfiles.practitioner.competitorNoun": "practitioners",
    "bizProfiles.practitioner.couponPresets.pct_off_next_session.label": "10% off your next session or class",
    "bizProfiles.practitioner.couponPresets.pct_off_next_session.description": "The direct equivalent of a loyalty discount when there's no product to discount instead.",
    "bizProfiles.practitioner.couponPresets.free_intro_consult.label": "Free consultation or intro session for new clients",
    "bizProfiles.practitioner.couponPresets.free_intro_consult.description": "Lets a new client experience your style before committing money.",
    "bizProfiles.practitioner.couponPresets.class_pack_bonus.label": "Buy a 5-session pack, get 1 free",
    "bizProfiles.practitioner.couponPresets.class_pack_bonus.description": "Rewards commitment and smooths out your booking calendar.",
    "bizProfiles.practitioner.offerTemplates.new_client_special.label": "New client special: 20% off your first session",
    "bizProfiles.practitioner.offerTemplates.new_client_special.description": "Same logic as any service business — remove the risk of trying someone new.",
    "bizProfiles.practitioner.offerTemplates.referral_free_class.label": "Refer a friend: you both get a free class",
    "bizProfiles.practitioner.offerTemplates.referral_free_class.description": "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    "bizProfiles.practitioner.referralPresets.free_session_both.referrerReward": "A free class or session",
    "bizProfiles.practitioner.referralPresets.free_session_both.friendReward": "A free class or session",
    "bizProfiles.practitioner.referralPresets.free_session_both.description": "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.referrerReward": "$15 credit toward your next session",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.friendReward": "20% off their first session",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.description": "Works well for 1:1 appointment-based practices where a free slot is a real cost.",
    "bizProfiles.practitioner.pricingTips.package_pricing.label": "Sell session packages, not just singles",
    "bizProfiles.practitioner.pricingTips.package_pricing.description": "A 5- or 10-session bundle rewards commitment and smooths your calendar, and clients who've prepaid rarely no-show.",
    "bizProfiles.practitioner.pricingTips.low_cost_intro.label": "Use a free or low-cost intro session to convert",
    "bizProfiles.practitioner.pricingTips.low_cost_intro.description": "A short intro session converts hesitant leads without permanently discounting your real rate — keep it clearly framed as a one-time offer.",
    "bizProfiles.practitioner.pricingTips.raise_when_booked_out.label": "Raise your rate when you're consistently booked out",
    "bizProfiles.practitioner.pricingTips.raise_when_booked_out.description": "A calendar that's full 2+ weeks ahead, week after week, is real demand — not just a busy stretch — and the honest signal it's time to raise your rate.",
    "bizProfiles.practitioner.pricingTips.price_by_format.label": "Price the same expertise differently by format",
    "bizProfiles.practitioner.pricingTips.price_by_format.description": "A group class and a 1:1 session use the same skill but cost you very differently to deliver — price each by format rather than discounting your core 1:1 rate.",
    "bizProfiles.practitioner.couponAngles.firstTime": "Free consultation or intro session for new clients",
    "bizProfiles.practitioner.couponAngles.seasonal": "New season, new goals: 15% off a fresh session pack",
    "bizProfiles.practitioner.couponAngles.slowDay": "10% off weekday morning sessions",
    "bizProfiles.practitioner.growActions.action1": "Ask clients for a Google review right after a session that clearly went well.",
    "bizProfiles.practitioner.growActions.action2": "Share a short client testimonial or result monthly — this stands in for the photos a storefront business would post.",
    "bizProfiles.practitioner.growActions.action3": "List your specialties and formats (virtual, in-person, group, 1:1) clearly, since you may not have a menu or storefront to show instead.",
    "bizProfiles.practitioner.growActions.action4": "Offer a free intro session or class to convert new leads who are still deciding.",
    "bizProfiles.practitioner.pricingExamples.example1": "1:1 Session",
    "bizProfiles.practitioner.pricingExamples.example2": "Group Class",
    "bizProfiles.practitioner.pricingExamples.example3": "Intro Session",
    "bizProfiles.practitioner.faq.item1.question": "Does {businessName} offer virtual or remote sessions?",
    "bizProfiles.practitioner.faq.item1.answer": "Yes — ask about virtual options if an in-person session near {city} doesn't fit your schedule.",
    "bizProfiles.practitioner.faq.item2.question": "Do I need to book an appointment with {businessName} in advance?",
    "bizProfiles.practitioner.faq.item2.answer": "Yes, sessions are by appointment — reach out to check current availability.",
    "bizProfiles.gym_fitness.label": "Gym & Fitness Studio",
    "bizProfiles.gym_fitness.competitorNoun": "gyms",
    "bizProfiles.gym_fitness.couponPresets.first_month_pct.label": "50% off your first month",
    "bizProfiles.gym_fitness.couponPresets.first_month_pct.description": "The standard, highest-converting gym offer — removes the risk of committing to a new place.",
    "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.label": "No enrollment fee for new members this month",
    "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.description": "Removes a common friction point without discounting your actual membership rate.",
    "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.label": "Buy a 10-class pack, get 2 classes free",
    "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.description": "Rewards commitment and smooths out class attendance without discounting drop-in rate.",
    "bizProfiles.gym_fitness.offerTemplates.new_member_special.label": "New member special: 50% off your first month, no enrollment fee",
    "bizProfiles.gym_fitness.offerTemplates.new_member_special.description": "Stacks the two lowest-risk offers into one strong first-time hook.",
    "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.label": "Bring a friend: you both get a free class or session",
    "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.description": "Costs you one class slot, not cash — effective since a class has near-zero marginal cost per extra person.",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.referrerReward": "A free month of membership",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.friendReward": "50% off their first month",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.description": "Membership is your recurring revenue, so rewarding with more of it costs you less than it's worth to a member.",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.referrerReward": "A free class or session",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.friendReward": "A free class or session",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.description": "Especially effective for group classes, where an extra attendee costs you almost nothing.",
    "bizProfiles.gym_fitness.pricingTips.tiered_membership.label": "Offer tiered membership levels",
    "bizProfiles.gym_fitness.pricingTips.tiered_membership.description": "A basic, unlimited, and premium-with-training tier lets members self-select their spend instead of one price fitting everyone poorly.",
    "bizProfiles.gym_fitness.pricingTips.annual_discount.label": "Discount annual memberships to lock in commitment",
    "bizProfiles.gym_fitness.pricingTips.annual_discount.description": "A modest discount for paying annually improves your cash flow and retention more than it costs you in margin.",
    "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.label": "Price off-peak sessions lower to fill slow hours",
    "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.description": "Discounting mid-day or early-morning slots fills capacity that would otherwise sit empty, without touching your peak-hour rate.",
    "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.label": "Raise rates when classes are consistently full",
    "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.description": "Waitlisted classes week after week are the honest signal you're underpriced relative to demand.",
    "bizProfiles.gym_fitness.couponAngles.firstTime": "New member special: 50% off your first month, no enrollment fee",
    "bizProfiles.gym_fitness.couponAngles.seasonal": "New Year, new goals: 50% off your first month",
    "bizProfiles.gym_fitness.couponAngles.slowDay": "20% off off-peak (mid-day) class sign-ups",
    "bizProfiles.gym_fitness.growActions.action1": "Ask members for a Google review after a great class or a real milestone.",
    "bizProfiles.gym_fitness.growActions.action2": "Post real photos of classes, the space, and member results (with permission).",
    "bizProfiles.gym_fitness.growActions.action3": "Keep your class schedule and current promotions up to date on your listing.",
    "bizProfiles.gym_fitness.growActions.action4": "Run a 'bring a friend' week where existing members can bring a guest free.",
    "bizProfiles.gym_fitness.pricingExamples.example1": "Monthly Membership",
    "bizProfiles.gym_fitness.pricingExamples.example2": "Drop-in Class",
    "bizProfiles.gym_fitness.pricingExamples.example3": "Personal Training Session",
    "bizProfiles.gym_fitness.faq.item1.question": "Does {businessName} offer a free trial class or day pass?",
    "bizProfiles.gym_fitness.faq.item1.answer": "Yes — ask about trial options when you stop by or call.",
    "bizProfiles.gym_fitness.faq.item2.question": "What is {businessName}'s class schedule?",
    "bizProfiles.gym_fitness.faq.item2.answer": "See our current class schedule on our website or by calling.",
    "bizProfiles.trades.label": "Trades & Home Services",
    "bizProfiles.trades.competitorNoun": "service providers",
    "bizProfiles.trades.couponPresets.flat_off_first_call.label": "$25 off your first service call",
    "bizProfiles.trades.couponPresets.flat_off_first_call.description": "Removes the risk of trying a new provider for a job that's otherwise hard to price-shop.",
    "bizProfiles.trades.couponPresets.seasonal_tuneup.label": "Seasonal tune-up special: $20 off an inspection or maintenance visit",
    "bizProfiles.trades.couponPresets.seasonal_tuneup.description": "Fills your slower season with real, useful maintenance work instead of sitting idle.",
    "bizProfiles.trades.couponPresets.bundle_multiple_jobs.label": "10% off when you bundle two or more jobs in one visit",
    "bizProfiles.trades.couponPresets.bundle_multiple_jobs.description": "Rewards a bigger ticket per trip out, which is where your real margin is (less drive time per dollar billed).",
    "bizProfiles.trades.offerTemplates.new_customer_first_call.label": "New customer special: $25 off your first service call",
    "bizProfiles.trades.offerTemplates.new_customer_first_call.description": "The single highest-converting offer for a trade — lowers the risk of trying someone new.",
    "bizProfiles.trades.offerTemplates.seasonal_maintenance.label": "Seasonal maintenance special (e.g. AC tune-up before summer, furnace check before winter)",
    "bizProfiles.trades.offerTemplates.seasonal_maintenance.description": "Turns a predictable seasonal need into booked revenue before it becomes an emergency call.",
    "bizProfiles.trades.referralPresets.flat_off_both.referrerReward": "$25 off your next service call",
    "bizProfiles.trades.referralPresets.flat_off_both.friendReward": "$25 off their first service call",
    "bizProfiles.trades.referralPresets.flat_off_both.description": "Straightforward cash-off for a straightforward service-call business.",
    "bizProfiles.trades.referralPresets.pct_off_both.referrerReward": "10% off your next service",
    "bizProfiles.trades.referralPresets.pct_off_both.friendReward": "10% off their first service",
    "bizProfiles.trades.referralPresets.pct_off_both.description": "Scales with the job size instead of a flat amount that might be too small for a big job or too generous for a small one.",
    "bizProfiles.trades.pricingTips.flat_vs_hourly.label": "Decide flat-rate vs. hourly per job type",
    "bizProfiles.trades.pricingTips.flat_vs_hourly.description": "A predictable job (a drain clog, an outlet swap) is a good flat-rate candidate; open-ended diagnostic work is better billed hourly so you're not eating the risk of the unknown.",
    "bizProfiles.trades.pricingTips.travel_radius_pricing.label": "Price a trip charge for jobs outside your core area",
    "bizProfiles.trades.pricingTips.travel_radius_pricing.description": "A modest travel fee for farther jobs protects your margin without turning away work closer to home that doesn't need one.",
    "bizProfiles.trades.pricingTips.seasonal_demand_pricing.label": "Raise prices in your peak season, discount your slow one",
    "bizProfiles.trades.pricingTips.seasonal_demand_pricing.description": "Demand for most trades swings hard by season — pricing flat all year leaves money on the table in peak months and idle capacity in slow ones.",
    "bizProfiles.trades.pricingTips.bundle_multiple_jobs.label": "Bundle multiple jobs at one property",
    "bizProfiles.trades.pricingTips.bundle_multiple_jobs.description": "A small discount for handling two or three jobs in one visit still nets you more per hour than two separate trips.",
    "bizProfiles.trades.couponAngles.firstTime": "New customer special: $25 off your first service call",
    "bizProfiles.trades.couponAngles.seasonal": "Seasonal tune-up special: $20 off an inspection before the season changes",
    "bizProfiles.trades.couponAngles.slowDay": "10% off service calls booked on weekday mornings",
    "bizProfiles.trades.growActions.action1": "Ask every satisfied customer for a Google review right after the job's done.",
    "bizProfiles.trades.growActions.action2": "Post real before/after photos of completed jobs.",
    "bizProfiles.trades.growActions.action3": "Keep your service area and emergency-availability info current on your listing.",
    "bizProfiles.trades.growActions.action4": "Offer a seasonal tune-up special to fill your slower season with booked work.",
    "bizProfiles.trades.pricingExamples.example1": "Service Call",
    "bizProfiles.trades.pricingExamples.example2": "Standard Job",
    "bizProfiles.trades.pricingExamples.example3": "Seasonal Tune-Up",
    "bizProfiles.trades.faq.item1.question": "Does {businessName} offer emergency or same-day service?",
    "bizProfiles.trades.faq.item1.answer": "Call to check current availability for emergency or same-day appointments.",
    "bizProfiles.trades.faq.item2.question": "What areas near {city} does {businessName} serve?",
    "bizProfiles.trades.faq.item2.answer": "We serve {city} and the surrounding area — call to confirm we cover your location.",
    "bizProfiles.retail.label": "Retail Store",
    "bizProfiles.retail.competitorNoun": "retailers",
    "bizProfiles.retail.couponPresets.flat_off_threshold.label": "$10 off a $50+ purchase",
    "bizProfiles.retail.couponPresets.flat_off_threshold.description": "A threshold discount that nudges a smaller purchase into a bigger one.",
    "bizProfiles.retail.couponPresets.bogo.label": "Buy one, get one 50% off select items",
    "bizProfiles.retail.couponPresets.bogo.description": "A classic retail traffic driver — great for moving seasonal or overstocked items.",
    "bizProfiles.retail.couponPresets.bulk_discount.label": "10% off when you buy 3 or more",
    "bizProfiles.retail.couponPresets.bulk_discount.description": "Rewards a bigger basket without discounting a single-item purchase.",
    "bizProfiles.retail.offerTemplates.welcome_offer.label": "New customer welcome offer: 15% off your first purchase",
    "bizProfiles.retail.offerTemplates.welcome_offer.description": "Give first-time customers a clear reason to choose you over a competitor.",
    "bizProfiles.retail.offerTemplates.seasonal_clearance.label": "Seasonal sale: discount last season's stock to make room for new arrivals",
    "bizProfiles.retail.offerTemplates.seasonal_clearance.description": "Moves aging inventory while giving repeat customers a reason to check back.",
    "bizProfiles.retail.referralPresets.credit_both.referrerReward": "$10 store credit",
    "bizProfiles.retail.referralPresets.credit_both.friendReward": "$10 off their first purchase",
    "bizProfiles.retail.referralPresets.credit_both.description": "Store credit keeps the referrer coming back rather than a one-time cash reward.",
    "bizProfiles.retail.referralPresets.pct_off_both.referrerReward": "10% off your next purchase",
    "bizProfiles.retail.referralPresets.pct_off_both.friendReward": "15% off their first purchase",
    "bizProfiles.retail.referralPresets.pct_off_both.description": "Simple and universally understood for a straightforward retail purchase.",
    "bizProfiles.retail.pricingTips.anchor_pricing.label": "Anchor with your highest-priced item",
    "bizProfiles.retail.pricingTips.anchor_pricing.description": "Showing a premium option first makes your mid-tier items feel reasonably priced by comparison.",
    "bizProfiles.retail.pricingTips.bulk_bundle_pricing.label": "Price bundles or multi-packs to increase average sale",
    "bizProfiles.retail.pricingTips.bulk_bundle_pricing.description": "A modest per-unit discount on a bundle lifts average sale size without discounting a single-item purchase.",
    "bizProfiles.retail.pricingTips.seasonal_markdowns.label": "Plan a seasonal markdown schedule",
    "bizProfiles.retail.pricingTips.seasonal_markdowns.description": "A planned clearance cadence (end of season, holiday) protects margin better than ad hoc discounting whenever inventory feels stale.",
    "bizProfiles.retail.pricingTips.raise_on_demand.label": "Raise prices on items that consistently sell out",
    "bizProfiles.retail.pricingTips.raise_on_demand.description": "An item that sells out every time you restock it is underpriced relative to real demand.",
    "bizProfiles.retail.couponAngles.firstTime": "New customer welcome offer: 15% off your first purchase",
    "bizProfiles.retail.couponAngles.seasonal": "Seasonal sale — tied to the season or an upcoming holiday",
    "bizProfiles.retail.couponAngles.slowDay": "$10 off a $50+ purchase on your slowest shopping day",
    "bizProfiles.retail.growActions.action1": "Ask happy customers for a Google review at checkout.",
    "bizProfiles.retail.growActions.action2": "Post real photos of new arrivals and in-store displays weekly.",
    "bizProfiles.retail.growActions.action3": "Keep your hours and current promotions up to date on your Google listing.",
    "bizProfiles.retail.growActions.action4": "Run a seasonal clearance sale to move older stock and highlight new arrivals.",
    "bizProfiles.retail.pricingExamples.example1": "Standard Item",
    "bizProfiles.retail.pricingExamples.example2": "Featured/New Arrival",
    "bizProfiles.retail.pricingExamples.example3": "Bulk/Multi-pack",
    "bizProfiles.retail.faq.item1.question": "Does {businessName} accept returns or exchanges?",
    "bizProfiles.retail.faq.item1.answer": "Yes — ask about our return and exchange policy at checkout.",
    "bizProfiles.retail.faq.item2.question": "What are {businessName}'s hours near {city}?",
    "bizProfiles.retail.faq.item2.answer": "See our current hours on our Google Business Profile listing.",
    "bizProfiles.default.label": "General Business",
    "bizProfiles.default.competitorNoun": "businesses",
    "bizProfiles.default.couponPresets.flat_off_purchase.label": "$10 off a $50+ purchase or visit",
    "bizProfiles.default.couponPresets.flat_off_purchase.description": "Works for almost any transaction-based business without assuming how you charge.",
    "bizProfiles.default.couponPresets.pct_off_new_customer.label": "10% off for new customers",
    "bizProfiles.default.couponPresets.pct_off_new_customer.description": "A low-risk, universally understood way to convert a first-time visitor.",
    "bizProfiles.default.offerTemplates.welcome_offer.label": "New customer welcome offer",
    "bizProfiles.default.offerTemplates.welcome_offer.description": "Give first-time customers a clear reason to choose you over a competitor.",
    "bizProfiles.default.offerTemplates.seasonal_special.label": "Seasonal special",
    "bizProfiles.default.offerTemplates.seasonal_special.description": "Tie a promotion to a real calendar moment relevant to your customers.",
    "bizProfiles.default.referralPresets.credit_both.referrerReward": "$10 account credit",
    "bizProfiles.default.referralPresets.credit_both.friendReward": "$10 off their first purchase",
    "bizProfiles.default.referralPresets.credit_both.description": "Account credit keeps them coming back; works for almost any retail or transaction-based business.",
    "bizProfiles.default.referralPresets.pct_off_both.referrerReward": "10% off your next purchase",
    "bizProfiles.default.referralPresets.pct_off_both.friendReward": "10% off their first purchase",
    "bizProfiles.default.referralPresets.pct_off_both.description": "A simple, universally understood reward for both sides.",
    "bizProfiles.default.pricingTips.anchor_pricing.label": "Anchor with your highest-priced option",
    "bizProfiles.default.pricingTips.anchor_pricing.description": "Showing your highest-priced option first makes your mid-tier option feel like the reasonable middle ground, even if few customers pick the anchor itself.",
    "bizProfiles.default.pricingTips.good_better_best.label": "Offer a good/better/best tier",
    "bizProfiles.default.pricingTips.good_better_best.description": "A basic, a standard, and a premium option each give price-sensitive and premium customers a natural fit — one price is rarely right for both.",
    "bizProfiles.default.pricingTips.raise_when_consistently_busy.label": "Raise prices on sustained demand, not a hunch",
    "bizProfiles.default.pricingTips.raise_when_consistently_busy.description": "Being consistently busy for weeks — not just one good week — is the honest signal you're underpriced, not how long it's been since your last increase.",
    "bizProfiles.default.pricingTips.bundle_package.label": "Bundle or package related work",
    "bizProfiles.default.pricingTips.bundle_package.description": "Combining related services or items into one package price can lift your average sale without feeling like a price increase to the customer.",
    "bizProfiles.default.couponAngles.firstTime": "10% off for new customers",
    "bizProfiles.default.couponAngles.seasonal": "Seasonal special — tied to what's happening this month",
    "bizProfiles.default.couponAngles.slowDay": "$10 off a $50+ purchase or visit on your slowest day of the week",
    "bizProfiles.default.growActions.action1": "Ask happy customers for a Google review — it's the single highest-leverage thing most small businesses skip.",
    "bizProfiles.default.growActions.action2": "Keep your hours, phone number, and website current on your Google listing.",
    "bizProfiles.default.growActions.action3": "Add a few recent, real photos of your business.",
    "bizProfiles.default.growActions.action4": "Reply to every review you get, positive or negative — it's visible to every future customer.",
    "bizProfiles.default.pricingExamples.example1": "Standard Service",
    "bizProfiles.default.pricingExamples.example2": "Service Call",
    "bizProfiles.default.pricingExamples.example3": "Product/Item",
    "bizProfiles.default.faq.item1.question": "How can I contact {businessName}?",
    "bizProfiles.default.faq.item1.answer": "Call us or use the contact information on our Google listing.",
    "bizProfiles.default.faq.item2.question": "What are {businessName}'s hours?",
    "bizProfiles.default.faq.item2.answer": "See our current hours on our Google Business Profile listing.",
    "bizProfileOptions.barbershop.label": "Barbershop",
    "bizProfileOptions.barbershop.competitorNoun": "barbershops",
    "bizProfileOptions.spa.label": "Spa & Wellness",
    "bizProfileOptions.spa.competitorNoun": "spas",
    "bizProfileOptions.nail_salon.label": "Nail Salon",
    "bizProfileOptions.nail_salon.competitorNoun": "nail salons",
    "bizProfileOptions.cafe.label": "Café / Coffee Shop",
    "bizProfileOptions.cafe.competitorNoun": "cafes",
    "bizProfileOptions.bar.label": "Bar / Pub",
    "bizProfileOptions.bar.competitorNoun": "bars",
    "bizProfileOptions.bakery.label": "Bakery",
    "bizProfileOptions.bakery.competitorNoun": "bakeries",
    "bizProfileOptions.liquor_store.label": "Liquor & Wine Store",
    "bizProfileOptions.liquor_store.competitorNoun": "liquor stores",
    "bizProfileOptions.grocery_market.label": "Grocery / Market",
    "bizProfileOptions.grocery_market.competitorNoun": "grocery stores",
    "bizProfileOptions.hardware_store.label": "Hardware Store",
    "bizProfileOptions.hardware_store.competitorNoun": "hardware stores",
    "bizProfileOptions.florist.label": "Florist",
    "bizProfileOptions.florist.competitorNoun": "florists",
    "bizProfileOptions.retail_boutique.label": "Retail / Boutique",
    "bizProfileOptions.retail_boutique.competitorNoun": "boutiques",
    "bizProfileOptions.gym_fitness.label": "Gym & Fitness Studio",
    "bizProfileOptions.gym_fitness.competitorNoun": "gyms",
    "bizProfileOptions.pet_services.label": "Pet Services",
    "bizProfileOptions.pet_services.competitorNoun": "pet-service businesses",
    "bizProfileOptions.dentist.label": "Dentist",
    "bizProfileOptions.dentist.competitorNoun": "dental practices",
    "bizProfileOptions.medical_clinic.label": "Medical / Clinic",
    "bizProfileOptions.medical_clinic.competitorNoun": "medical practices",
    "bizProfileOptions.lawyer.label": "Law Firm",
    "bizProfileOptions.accountant.label": "Accounting & Tax",
    "bizProfileOptions.accountant.competitorNoun": "accounting firms",
    "bizProfileOptions.real_estate.label": "Real Estate",
    "bizProfileOptions.real_estate.competitorNoun": "real estate agencies",
    "bizProfileOptions.consultant.label": "Consulting",
    "bizProfileOptions.consultant.competitorNoun": "consultants",
    "bizProfileOptions.coach.label": "Coaching",
    "bizProfileOptions.coach.competitorNoun": "coaches",
    "bizProfileOptions.tutor_education.label": "Tutoring & Education",
    "bizProfileOptions.tutor_education.competitorNoun": "tutoring services",
    "bizProfileOptions.photographer.label": "Photography",
    "bizProfileOptions.photographer.competitorNoun": "photographers",
    "bizProfileOptions.auto_repair.label": "Auto Repair",
    "bizProfileOptions.auto_repair.competitorNoun": "auto shops",
    "bizProfileOptions.plumber.label": "Plumbing",
    "bizProfileOptions.plumber.competitorNoun": "plumbers",
    "bizProfileOptions.electrician.label": "Electrical",
    "bizProfileOptions.electrician.competitorNoun": "electricians",
    "bizProfileOptions.landscaper.label": "Landscaping",
    "bizProfileOptions.landscaper.competitorNoun": "landscapers",
    "bizProfileOptions.cleaning_service.label": "Cleaning Service",
    "bizProfileOptions.cleaning_service.competitorNoun": "cleaning services",
  },
  es: {
    "language.en": "Inglés",
    "language.es": "Español",
    "common.save": "Guardar",
    // "common.cancel" intentionally left untranslated for now — t()
    // below falls back to the English string ("Cancel") until this is
    // filled in, so leaving it out is safe rather than a bug.
    "common.and": "y",

    "dashboard.nav.overview": "Resumen",
    "dashboard.nav.growth": "Crecimiento",
    "dashboard.nav.reviews": "Reseñas",
    "dashboard.nav.website": "Sitio web",
    "dashboard.nav.competitors": "Competencia",
    "dashboard.nav.pricing": "Precios",
    "dashboard.nav.reports": "Informes",
    "dashboard.nav.account": "Cuenta",
    "dashboard.nav.logOut": "Cerrar sesión",
    "dashboard.shell.openMenuAriaLabel": "Abrir menú",
    "dashboard.shell.closeMenuAriaLabel": "Cerrar menú",
    "dashboard.shell.noBusinessSelected": "Ningún negocio seleccionado",
    "dashboard.shell.addBusinessToGetStarted": "+ Agregar un negocio para empezar",

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

    // --- content.categories.* — reviewed Spanish.
    "content.categories.visibility": "Visibilidad y reputación",
    "content.categories.completeness": "Integridad de la ficha de Google",
    "content.categories.website": "Sitio web",

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

    // --- content.actionPlan.* — lib/actionPlan.ts's ACTION_PLAN_COPY/FALLBACK_COPY.
    "content.actionPlan.visibility.rating.why":
      "Su calificación de estrellas suele ser lo primero que ve un cliente potencial — una mejor calificación promedio aumenta directamente las probabilidades de que lo elijan a usted en lugar de a un competidor cercano.",
    "content.actionPlan.visibility.rating.action":
      "Pida una reseña a clientes satisfechos recientes y responda a las negativas para que los futuros clientes vean que toma en serio los comentarios.",
    "content.actionPlan.visibility.rating.fix":
      "Vaya a la página de Reseñas → use la sección \"Conseguir más reseñas\": descargue el código QR para su mostrador o copie su enlace de reseña y compártalo con los clientes justo después de una buena visita. Un flujo constante supera a un gran lote de una sola vez.",
    "content.actionPlan.visibility.rating.weeklyAction":
      "Pida una reseña de Google a 3-5 de sus clientes recientes más satisfechos esta semana — las reseñas recientes son la palanca real más rápida para su calificación.",
    "content.actionPlan.visibility.review_count.why":
      "Más reseñas significa más prueba social — los clientes confían mucho más en un negocio con decenas de reseñas que en uno con un puñado, aun con la misma calificación de estrellas.",
    "content.actionPlan.visibility.review_count.action":
      "Haga que dejar una reseña sea lo más fácil posible, y pídalo de forma constante en lugar de una sola vez.",
    "content.actionPlan.visibility.review_count.fix":
      "Vaya a la página de Reseñas → sección \"Conseguir más reseñas\": copie su enlace de reseña en los recibos, mensajes de seguimiento o correos, o imprima el código QR del mostrador para el momento de pagar.",
    "content.actionPlan.visibility.review_count.weeklyAction":
      "Pida una reseña de Google a 3-5 clientes recientes esta semana — cada reseña real suma para construir una base de reseñas más sólida.",
    "content.actionPlan.visibility.review_recency.why":
      "Un flujo constante de reseñas recientes indica un negocio activo y confiable en el presente — una calificación basada únicamente en reseñas antiguas se ve desactualizada para los clientes y para Google.",
    "content.actionPlan.visibility.review_recency.action":
      "Siga pidiendo reseñas de forma continua, no en un solo impulso.",
    "content.actionPlan.visibility.review_recency.fix":
      "Vaya a la página de Reseñas → sección \"Conseguir más reseñas\" y siga compartiendo su enlace de reseña o código QR de forma continua — un recordatorio recurrente (semanal, o después de cada N clientes) mantiene el flujo de nuevas reseñas en lugar de detenerse tras una sola ronda.",
    "content.actionPlan.completeness.phone.why":
      "Un número de teléfono faltante es una de las formas más rápidas de perder a un cliente que está listo para llamar en ese momento.",
    "content.actionPlan.completeness.phone.action": "Agregue el número de teléfono de su negocio a su Perfil de Negocio de Google.",
    "content.actionPlan.completeness.phone.fix": "En el Perfil de Negocio de Google: Editar perfil → Información de contacto → Número de teléfono.",
    "content.actionPlan.completeness.address.why":
      "Sin una dirección verificada, los clientes — y Google Maps — no pueden encontrarlo de forma fiable, lo que puede dejarlo fuera de los resultados de búsqueda locales por completo.",
    "content.actionPlan.completeness.address.action": "Agregue o corrija la dirección de su negocio en el Perfil de Negocio de Google.",
    "content.actionPlan.completeness.address.fix": "En el Perfil de Negocio de Google: Editar perfil → Información de la empresa → Dirección.",
    "content.actionPlan.completeness.hours.why":
      "Los clientes suelen consultar el horario antes de visitar — si falta, muchos simplemente elegirán a un competidor que lo tenga indicado con claridad.",
    "content.actionPlan.completeness.hours.action": "Agregue el horario real de su negocio al Perfil de Negocio de Google.",
    "content.actionPlan.completeness.hours.fix":
      "En el Perfil de Negocio de Google: Editar perfil → Información de la empresa → Horario de atención. Complete todos los días, incluidos los horarios de días festivos si son diferentes.",
    "content.actionPlan.completeness.website_link.why":
      "Enlazar su sitio web en su ficha de Google les da a los clientes una forma confiable más de obtener información y convertir, directamente desde los resultados de búsqueda.",
    "content.actionPlan.completeness.website_link.action": "Enlace la URL de su sitio web en su Perfil de Negocio de Google.",
    "content.actionPlan.completeness.website_link.fix":
      "¿Aún no tiene un sitio? Cree uno en minutos con el generador de sitio inicial de la página de Sitio web. Una vez que tenga una URL, agréguela a su Perfil de Negocio de Google: Editar perfil → Información de la empresa → Sitio web.",
    "content.actionPlan.completeness.categories.why":
      "Las categorías son la forma en que Google relaciona su ficha con lo que la gente realmente busca — categorías más precisas significan más búsquedas relevantes en las que aparece.",
    "content.actionPlan.completeness.categories.action": "Agregue o amplíe las categorías de su negocio en el Perfil de Negocio de Google.",
    "content.actionPlan.completeness.categories.fix":
      "En el Perfil de Negocio de Google: Editar perfil → Información de la empresa → Categoría. Agregue todas las categorías que describan genuinamente lo que ofrece, con la más específica como principal.",
    "content.actionPlan.completeness.photos.why":
      "Las fichas con fotos reales reciben muchos más clics y llamadas — las fotos suelen ser la primera impresión real que un cliente tiene de su negocio.",
    "content.actionPlan.completeness.photos.action": "Agregue fotos reales y actuales de su negocio al Perfil de Negocio de Google.",
    "content.actionPlan.completeness.photos.fix":
      "En el Perfil de Negocio de Google: Fotos → Agregar fotos. La fachada, el interior, el equipo y sus productos o trabajos son las tomas de mayor impacto.",
    "content.actionPlan.completeness.business_status.why":
      "Si Google muestra su ficha como cerrada — temporal o permanentemente — cuando en realidad está abierto, los clientes ni siquiera considerarán visitarlo.",
    "content.actionPlan.completeness.business_status.action":
      "Verifique que su ficha aparezca como Operativo y, si es incorrecto, pídale a Google que lo corrija.",
    "content.actionPlan.completeness.business_status.fix":
      "En el Perfil de Negocio de Google, revise el estado de su ficha. Use \"Reabrir este negocio\" si está marcada como cerrada por error, o presente una solicitud de restablecimiento si la ficha fue suspendida.",
    "content.actionPlan.website.has_website.why":
      "Un sitio web es una de las señales de confianza más fuertes para un cliente que está investigando — sin uno, depende por completo de su ficha de Google para lograr la venta.",
    "content.actionPlan.website.has_website.action": "Ponga en marcha un sitio web para su negocio, aunque sea sencillo.",
    "content.actionPlan.website.has_website.fix":
      "Vaya a la página de Sitio web → use el generador de sitio inicial: convierte los datos reales de su ficha de Google (horario, servicios, fotos) en un sitio de una página en vivo en minutos, sin trabajo de diseño. ¿Quiere algo más personalizado más adelante? Un creador como Squarespace o Wix también sirve — pero esto lo pone en vivo hoy.",
    "content.actionPlan.website.https.why":
      "Los navegadores advierten activamente a los visitantes cuando un sitio no es seguro, lo que erosiona la confianza rápidamente — HTTPS es una expectativa básica hoy en día, no un lujo.",
    "content.actionPlan.website.https.action": "Migre su sitio web a HTTPS.",
    "content.actionPlan.website.https.fix":
      "La mayoría de los alojamientos emiten un certificado SSL gratuito — busque en el panel de su proveedor de alojamiento una opción para \"habilitar HTTPS\" o \"SSL\", o pídale a quien administra su sitio que lo active.",
    "content.actionPlan.website.performance_mobile.why":
      "Un sitio de carga lenta pierde visitantes antes de que siquiera vean lo que ofrece — y el propio Google tiene en cuenta la velocidad real del sitio en el posicionamiento de búsqueda.",
    "content.actionPlan.website.performance_mobile.action": "Acelere su sitio web, especialmente en móvil.",
    "content.actionPlan.website.performance_mobile.fix":
      "Comprima las imágenes grandes, elimine los scripts o complementos innecesarios y use un alojamiento rápido. El generador de sitio inicial de PostScore (página de Sitio web) genera una página ligera que obtiene una buena puntuación en esto por su propia construcción.",
    "content.actionPlan.website.content_depth.why":
      "Una página vacía de un solo bloque se percibe como sin terminar tanto para los visitantes como para Google — el contenido real es lo que de verdad convence a alguien de confiar en usted y elegirlo.",
    "content.actionPlan.website.content_depth.action":
      "Desarrolle contenido real en su sitio: un título claro, una meta descripción, algunas secciones genuinas y texto real sobre lo que ofrece.",
    "content.actionPlan.website.content_depth.fix":
      "Vaya a la página de Sitio web → el generador de sitio inicial ya incluye un título, una meta descripción, una etiqueta viewport para móviles y secciones reales creadas a partir de los datos de su ficha de Google — una forma rápida de reemplazar una página con poco contenido.",
    "content.actionPlan.website.contact_conversion.why":
      "Si un visitante no puede ver de inmediato cómo contactarlo o qué hacer a continuación, la mayoría simplemente se irá en lugar de buscar una forma de contacto.",
    "content.actionPlan.website.contact_conversion.action":
      "Agregue a su sitio web un enlace real de teléfono con clic para llamar o de correo electrónico, y una llamada a la acción clara.",
    "content.actionPlan.website.contact_conversion.fix":
      "Vaya a la página de Sitio web → el generador de sitio inicial incluye un enlace de teléfono con clic para llamar y una llamada a la acción clara de forma predeterminada siempre que haya un número de teléfono registrado.",
    "content.actionPlan.fallback.why": "Mejorar esta comprobación ayuda a su PostScore en general.",
    "content.actionPlan.fallback.action": "Revise la explicación de arriba y aborde la deficiencia subyacente.",
    "content.actionPlan.fallback.fix": "Consulte la explicación de esta comprobación para saber exactamente qué falta.",

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
    "dashboard.overview.confidenceVerified": "Verificado",
    "dashboard.overview.confidenceLikely": "Probable",
    "dashboard.overview.confidenceUncertain": "Sin confirmar",
    "dashboard.overview.confidenceNotFound": "No encontrado",
    "dashboard.overview.categoryWeightAnnotation": "(peso: {weight})",
    "dashboard.overview.hoursLabel": "Horario",
    "dashboard.overview.hoursClosed": "Cerrado",
    "dashboard.overview.hoursOpen24": "Abierto las 24 horas",
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

    // --- Assistant ("PostAI") chrome: components/assistant/AssistantOverlay.tsx,
    // AssistantView.tsx, BusinessMemoryPanel.tsx.
    "dashboard.assistant.closeAriaLabel": "Cerrar asistente",
    "dashboard.assistant.generalGuidanceLabel": "Orientación general",
    "dashboard.assistant.thinking": "Pensando…",
    "dashboard.assistant.yourBusinessFallback": "su negocio",
    "dashboard.assistant.emptyStateHeadline": "Pregunte lo que sea sobre la presencia de {business}",
    "dashboard.assistant.emptyStateBody":
      "Las respuestas se basan en sus datos reales de PostScore. Los consejos generales de estrategia siempre se etiquetan por separado.",
    "dashboard.assistant.noPastConversations": "Aún no hay conversaciones anteriores.",
    "dashboard.assistant.newConversationFallback": "Nueva conversación",
    "dashboard.assistant.historyMessageCount.one": "{count} mensaje",
    "dashboard.assistant.historyMessageCount.other": "{count} mensajes",
    "dashboard.assistant.couldNotReachFallback": "No se pudo contactar al asistente — inténtelo de nuevo.",
    "dashboard.assistant.couldNotLoadPastConversations": "No se pudieron cargar las conversaciones anteriores.",
    "dashboard.assistant.couldNotLoadConversation": "No se pudo cargar esta conversación.",
    "dashboard.assistant.groundedInScore":
      "Basado en su PostScore real ({total}/100) — los consejos generales siempre se etiquetan, nada es inventado.",
    "dashboard.assistant.continuingConversation": "Continuando esta conversación",
    "dashboard.assistant.newConversationSavedNote": "Nueva conversación — los chats anteriores se guardan",
    "dashboard.assistant.backToChat": "Volver al chat",
    "dashboard.assistant.historyButton": "Historial",
    "dashboard.assistant.newChatButton": "Nuevo chat",
    "dashboard.assistant.inputPlaceholder":
      "Pregunte sobre su puntuación, plan de acción, competencia o consejos generales de marketing…",
    "dashboard.assistant.sendButton": "Enviar",
    "dashboard.assistant.errorTypeQuestionFirst": "Escriba una pregunta primero.",
    "dashboard.assistant.errorCouldNotStartConversation": "No se pudo iniciar una nueva conversación.",
    "dashboard.assistant.errorCouldNotSaveMessage": "No se pudo guardar su mensaje.",
    "dashboard.assistant.errorCouldNotGetReply": "No se pudo obtener una respuesta.",
    "dashboard.assistant.starterPrompts.whatsHurtingScore": "¿Qué es lo que más está perjudicando mi puntuación ahora mismo?",
    "dashboard.assistant.starterPrompts.top3ThisWeek": "¿Cuáles son las 3 cosas principales que debería solucionar esta semana?",
    "dashboard.assistant.starterPrompts.whatsChangedSinceStart": "¿Qué ha cambiado desde que empecé?",
    "dashboard.assistant.starterPrompts.whyCategoryLosingPoints": "¿Por qué mi sección de {category} está perdiendo puntos?",
    "dashboard.assistant.starterPrompts.compareToCompetitorsAvailable": "¿Cómo me comparo con mis competidores cercanos?",
    "dashboard.assistant.starterPrompts.compareToCompetitorsUnavailable": "¿Cómo puedo compararme con mis competidores cercanos?",
    "dashboard.assistant.starterPrompts.howToGetMoreReviews": "¿Cómo consigo más reseñas de Google?",
    "dashboard.assistant.starterPrompts.ratingGoodEnough":
      "¿Mi calificación es suficiente, o debería enfocarme en conseguir más reseñas?",
    "dashboard.assistant.starterPrompts.startBuildingRatingFromZero":
      "¿Cómo empiezo a construir una calificación desde cero reseñas?",
    "dashboard.assistant.memory.noSavedScans": "Aún no hay análisis guardados.",
    "dashboard.assistant.memory.onlyOneScore":
      "Solo una puntuación guardada hasta ahora — {total}/100 el {date}. Aún no hay tendencia.",
    "dashboard.assistant.memory.pointsSinceDate": "{delta} pts desde el {date}",
    "dashboard.assistant.memory.noConfirmedFixed": "Aún no hay nada confirmado como solucionado.",
    "dashboard.assistant.memory.pointsGainedWithDate": "+{points} pts · {date}",
    "dashboard.assistant.memory.pointsGainedNoDate": "+{points} pts",
    "dashboard.assistant.memory.removeServiceAriaLabel": "Quitar {service}",
    "dashboard.assistant.memory.noServicesYet": "Aún no se han agregado servicios.",
    "dashboard.assistant.memory.serviceInputPlaceholder": "p. ej. Cortes de cabello",
    "dashboard.assistant.memory.addButton": "Agregar",
    "dashboard.assistant.memory.businessTypeLabel": "Tipo de negocio",
    "dashboard.assistant.memory.businessTypeCorrected": 'Corregido por usted — Google detectó "{autoDetected}."',
    "dashboard.assistant.memory.businessTypeAutoDetected": "Detectado automáticamente de su ficha de Google.",
    "dashboard.assistant.memory.couldNotSaveFallback": "No se pudo guardar — inténtelo de nuevo.",
    "dashboard.assistant.memory.heading": "Lo que sé sobre su negocio",
    "dashboard.assistant.memory.subheading": "Los datos reales que el asistente recuerda, en cada sesión.",
    "dashboard.assistant.memory.locationLabel": "Ubicación",
    "dashboard.assistant.memory.notOnFile": "No registrado",
    "dashboard.assistant.memory.servicesJobValueHeading": "Servicios y valor típico por trabajo",
    "dashboard.assistant.memory.editButton": "Editar",
    "dashboard.assistant.memory.servicesFieldLabel": "Servicios",
    "dashboard.assistant.memory.jobValueRangeLabel": "Rango de valor típico por trabajo/ticket",
    "dashboard.assistant.memory.lowPlaceholder": "Mínimo",
    "dashboard.assistant.memory.highPlaceholder": "Máximo",
    "dashboard.assistant.memory.toSeparator": "a $",
    "dashboard.assistant.memory.errorMissingLow": "Ingrese también un valor mínimo, o borre el valor máximo.",
    "dashboard.assistant.memory.errorMissingHigh": "Ingrese también un valor máximo, o borre el valor mínimo.",
    "dashboard.assistant.memory.errorInvalidNumbers": "Ingrese números positivos válidos.",
    "dashboard.assistant.memory.errorLowExceedsHigh": "El valor mínimo no puede ser mayor que el valor máximo.",
    "dashboard.assistant.memory.servicesNotEntered": "Aún no se ha ingresado.",
    "dashboard.assistant.memory.jobValueLine": "Valor típico por trabajo/ticket: ${low} a ${high}",
    "dashboard.assistant.memory.jobValueNotEntered": "Valor típico por trabajo/ticket: aún no se ha ingresado.",
    "dashboard.assistant.memory.fixedHeading": "Lo que ha solucionado",
    "dashboard.assistant.memory.scoreTrendHeading": "Tendencia de la puntuación",

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

    // --- Pricing page. Draft Spanish — pending your review.
    "dashboard.pricing.pageTitle": "Revisión de precios",
    "dashboard.pricing.introText":
      "Ingrese sus precios y vea cómo se comparan con su mercado local — con consejos sobre dónde puede ajustar para atraer a más clientes.",
    "dashboard.pricing.disclosureText":
      "Opcional y privado. Los precios no forman parte de su puntuación — es solo una herramienta. Usted ingresa lo que cobra; lo comparamos con datos del mercado local cuando podemos encontrarlos, y damos una estimación clara cuando no podemos. Nunca adivinamos el precio exacto de un competidor.",
    "dashboard.pricing.rankingsHeading": "Qué significan las clasificaciones",
    "dashboard.pricing.tier.underMarket.label": "Por debajo del mercado",
    "dashboard.pricing.tier.underMarket.description":
      "Por debajo del rango local — puede haber margen para subir este precio.",
    "dashboard.pricing.tier.competitive.label": "Competitivo",
    "dashboard.pricing.tier.competitive.description": "Dentro del rango local típico para este servicio.",
    "dashboard.pricing.tier.upperMid.label": "Medio-alto",
    "dashboard.pricing.tier.upperMid.description": "Hacia la parte alta del rango local.",
    "dashboard.pricing.tier.premium.label": "Premium",
    "dashboard.pricing.tier.premium.description": "Por encima del rango local — está bien si sus reseñas lo respaldan.",
    "dashboard.pricing.tier.noData.label": "Sin datos de mercado",
    "dashboard.pricing.tier.noData.description": "No pudimos encontrar precios locales confiables, así que no vamos a adivinar.",
    "dashboard.pricing.basis.verifiedLocal.label": "Basado en niveles de precios locales",
    "dashboard.pricing.basis.generalEstimate.label": "Estimación general",
    "dashboard.pricing.servicesHeading": "Sus servicios y precios",
    "dashboard.pricing.removeServiceAriaLabel": "Quitar {service}",
    "dashboard.pricing.enterServiceName": "Ingrese el nombre de un servicio.",
    "dashboard.pricing.enterValidPrice": "Ingrese un precio válido.",
    "dashboard.pricing.couldNotAddRow": "No se pudo agregar esta fila.",
    "dashboard.pricing.couldNotSaveRow": "No se pudo guardar esta fila.",
    "dashboard.pricing.couldNotRemoveRow": "No se pudo quitar esta fila.",
    "dashboard.pricing.emptyServicesPrompt":
      "Para empezar, agregue abajo un servicio y lo que cobra por él.",
    "dashboard.pricing.servicePlaceholder": "p. ej. {example}",
    "dashboard.pricing.standardServiceFallback": "Servicio estándar",
    "dashboard.pricing.addServiceButton": "Agregar",
    "dashboard.pricing.examplesPrefix": "Ejemplos: {examples}",
    "dashboard.pricing.priceLevelContextHeading": "Nivel de precios real según Google",
    "dashboard.pricing.youLabel": "Su negocio",
    "dashboard.pricing.assessmentEmptyState":
      "Agregue sus precios y luego haga clic en \"Evaluar mis precios\" para ver cómo se comparan.",
    "dashboard.pricing.pricingTipsHeading": "Consejos de precios para {profile}",
    "dashboard.pricing.generalStrategyFootnote":
      "Estrategia general de precios para este tipo de negocio — no es un análisis basado en datos de sus precios reales. Para eso, use \"Evaluar mis precios\" arriba.",
    "dashboard.pricing.noPricesError": "Primero agregue arriba al menos un servicio con su precio.",
    "dashboard.pricing.assessErrorFallback": "No se pudieron evaluar los precios — inténtelo de nuevo.",
    "dashboard.pricing.assessmentHeading": "Su evaluación de precios",
    "dashboard.pricing.assessingButton": "Evaluando…",
    "dashboard.pricing.reassessButton": "Volver a evaluar mis precios",
    "dashboard.pricing.assessButton": "Evaluar mis precios",
    "dashboard.pricing.lastAssessed": "Última evaluación: {date}",

    // --- Business-type profiles (config/bizProfiles.ts). Reviewed Spanish,
    // added profile-by-profile as supplied. growActions.* intentionally
    // absent (dead content — never rendered — falls back to English).
    "bizProfiles.salon.label": "Salón y cuidado personal",
    "bizProfiles.salon.competitorNoun": "salones",
    "bizProfiles.salon.couponPresets.pct_off_next_appt.label": "10% de descuento en su próxima cita",
    "bizProfiles.salon.couponPresets.pct_off_next_appt.description":
      "Un simple incentivo de fidelidad — désela a cualquiera que reserve su próxima visita antes de irse.",
    "bizProfiles.salon.couponPresets.flat_off_rebook.label": "$15 de descuento en su próxima visita si reserva hoy",
    "bizProfiles.salon.couponPresets.flat_off_rebook.description":
      "Recompensa específicamente reservar con anticipación, lo que equilibra su agenda.",
    "bizProfiles.salon.couponPresets.bring_a_friend.label": "Traiga a un amigo: ambos reciben 15% de descuento",
    "bizProfiles.salon.couponPresets.bring_a_friend.description":
      "Convierte a un cliente actual en nuevo tráfico de clientes sin ningún gasto en publicidad.",
    "bizProfiles.salon.offerTemplates.new_client_special.label":
      "Especial para clientes nuevos: 20% de descuento en su primera cita",
    "bizProfiles.salon.offerTemplates.new_client_special.description":
      "La oferta con mayor conversión para un negocio de servicios — elimina el riesgo de probar algo nuevo.",
    "bizProfiles.salon.offerTemplates.referral_credit.label":
      "Recompensa por recomendación: $10 de crédito para usted y su amigo",
    "bizProfiles.salon.offerTemplates.referral_credit.description":
      "Combina bien con el cupón de arriba — dele a ambas personas una razón para actuar.",
    "bizProfiles.salon.couponAngles.firstTime":
      "Especial para clientes nuevos: 20% de descuento en su primera cita",
    "bizProfiles.salon.couponAngles.seasonal":
      "Especial de peinado navideño: reserve su look de temporada esta semana",
    "bizProfiles.salon.couponAngles.slowDay": "20% de descuento en citas de martes y miércoles",
    "bizProfiles.salon.faq.item1.question": "¿Necesito una cita en {businessName}?",
    "bizProfiles.salon.faq.item1.answer":
      "Recomendamos reservar con anticipación para garantizar su horario preferido, aunque puede haber disponibilidad sin cita según el día.",
    "bizProfiles.salon.faq.item2.question": "¿A qué zonas presta servicio {businessName} cerca de {city}?",
    "bizProfiles.salon.faq.item2.answer":
      "Estamos ubicados en {city} y damos la bienvenida a clientes de los alrededores.",
    "bizProfiles.salon.referralPresets.pct_off_both.referrerReward": "$15 de descuento en su próxima visita",
    "bizProfiles.salon.referralPresets.pct_off_both.friendReward": "20% de descuento en su primera visita",
    "bizProfiles.salon.referralPresets.pct_off_both.description":
      "La recomendación clásica de salón — premia la fidelidad y elimina el riesgo de probar algo nuevo.",
    "bizProfiles.salon.referralPresets.free_addon.referrerReward":
      "Un servicio adicional gratis (secado, depilación de cejas, etc.) en su próxima visita",
    "bizProfiles.salon.referralPresets.free_addon.friendReward": "10% de descuento en su primera cita",
    "bizProfiles.salon.referralPresets.free_addon.description":
      "Le cuesta tiempo y producto, no efectivo — una buena opción si prefiere no descontar los servicios directamente.",
    "bizProfiles.salon.pricingExamples.example1": "Corte de cabello para mujer",
    "bizProfiles.salon.pricingExamples.example2": "Corte de cabello para hombre",
    "bizProfiles.salon.pricingExamples.example3": "Color y mechas",
    "bizProfiles.salon.pricingTips.anchor_premium.label": "Ancle con su servicio premium",
    "bizProfiles.salon.pricingTips.anchor_premium.description":
      "Ponga su servicio de color o tratamiento más premium primero en su menú — incluso los clientes que eligen un corte básico anclan sus expectativas con ese, lo que hace que sus servicios de gama media parezcan tener un precio razonable en comparación.",
    "bizProfiles.salon.pricingTips.consult_price_chemical.label": "Cotice los servicios químicos por consulta",
    "bizProfiles.salon.pricingTips.consult_price_chemical.description":
      "El largo y el grosor del cabello varían enormemente; un precio fijo para color o tratamientos le hace perder dinero con cabello largo y grueso, o cobra de más por cabello fino y corto. Cotice esos después de un vistazo rápido, no con un precio fijo de menú.",
    "bizProfiles.salon.pricingTips.good_better_best.label": "Ofrezca un nivel bueno/mejor/premium",
    "bizProfiles.salon.pricingTips.good_better_best.description":
      "Un secado básico, una versión deluxe y un servicio adicional premium permiten que los clientes elijan cuánto gastar en lugar de que usted adivine un solo precio que no le sirve a nadie.",
    "bizProfiles.salon.pricingTips.raise_when_booked_out.label":
      "Suba los precios cuando esté reservado con 1-2 semanas de anticipación de forma constante",
    "bizProfiles.salon.pricingTips.raise_when_booked_out.description":
      "Una agenda constantemente llena — no solo un sábado ocupado — es la señal honesta de que sus precios están por debajo de la demanda.",
    "bizProfiles.restaurant.label": "Restaurante y servicio de comida",
    "bizProfiles.restaurant.competitorNoun": "restaurantes",
    "bizProfiles.restaurant.couponPresets.free_item_with_purchase.label":
      "Aperitivo o postre gratis con cualquier plato principal",
    "bizProfiles.restaurant.couponPresets.free_item_with_purchase.description":
      "Se siente generoso sin descontar el precio de su menú principal.",
    "bizProfiles.restaurant.couponPresets.pct_off_pickup.label":
      "15% de descuento en pedidos para recoger o en línea",
    "bizProfiles.restaurant.couponPresets.pct_off_pickup.description":
      "Dirige el tráfico hacia su canal de pedidos más económico de atender.",
    "bizProfiles.restaurant.couponPresets.bogo_entree.label":
      "Compre un plato principal y llévese el segundo al 50% (solo para comer en el lugar)",
    "bizProfiles.restaurant.couponPresets.bogo_entree.description":
      "Un clásico para atraer tráfico en noches lentas — limítelo a sus horas más tranquilas.",
    "bizProfiles.restaurant.offerTemplates.happy_hour.label": "Happy hour: 20% de descuento en bebidas, de 4 a 6 pm",
    "bizProfiles.restaurant.offerTemplates.happy_hour.description":
      "Llena el hueco entre el ajetreo del almuerzo y el de la cena.",
    "bizProfiles.restaurant.offerTemplates.first_online_order.label": "Primer pedido en línea: envío gratis",
    "bizProfiles.restaurant.offerTemplates.first_online_order.description":
      "Elimina el mayor punto de fricción para un cliente que lo prueba por primera vez.",
    "bizProfiles.restaurant.couponAngles.firstTime": "Primer pedido en línea: envío gratis",
    "bizProfiles.restaurant.couponAngles.seasonal":
      "Especial del menú de temporada: el plato destacado de este mes, 15% de descuento",
    "bizProfiles.restaurant.couponAngles.slowDay":
      "Compre un plato principal y llévese el segundo al 50% — para comer en el lugar, de domingo a martes",
    "bizProfiles.restaurant.faq.item1.question": "¿{businessName} acepta reservaciones?",
    "bizProfiles.restaurant.faq.item1.answer":
      "Llámenos o consulte nuestro sitio web para ver la disponibilidad de reservaciones.",
    "bizProfiles.restaurant.faq.item2.question": "¿{businessName} ofrece comida para llevar o a domicilio?",
    "bizProfiles.restaurant.faq.item2.answer":
      "Sí — haga su pedido para recoger directamente, o a través de su app de entrega preferida.",
    "bizProfiles.restaurant.referralPresets.free_item_both.referrerReward":
      "Un aperitivo o postre gratis en su próxima visita",
    "bizProfiles.restaurant.referralPresets.free_item_both.friendReward":
      "Un aperitivo o postre gratis en su primer pedido",
    "bizProfiles.restaurant.referralPresets.free_item_both.description":
      "Los productos gratis cuestan menos que un descuento directo y se sienten generosos para ambas partes.",
    "bizProfiles.restaurant.referralPresets.pct_off_both.referrerReward": "$10 de descuento en su próximo pedido",
    "bizProfiles.restaurant.referralPresets.pct_off_both.friendReward": "15% de descuento en su primer pedido",
    "bizProfiles.restaurant.referralPresets.pct_off_both.description":
      "El descuento directo en efectivo funciona bien para pedidos para llevar y a domicilio.",
    "bizProfiles.restaurant.pricingExamples.example1": "Plato principal",
    "bizProfiles.restaurant.pricingExamples.example2": "Entrada",
    "bizProfiles.restaurant.pricingExamples.example3": "Postre",
    "bizProfiles.restaurant.pricingTips.anchor_standout_dish.label": "Ancle con un plato destacado de precio alto",
    "bizProfiles.restaurant.pricingTips.anchor_standout_dish.description":
      "Un solo plato principal de $32 en el menú hace que cada plato de $18 a $22 parezca razonable en comparación, aunque pocas personas pidan realmente el plato ancla.",
    "bizProfiles.restaurant.pricingTips.steer_to_margin.label": "Dirija los pedidos hacia sus platos de mejor margen",
    "bizProfiles.restaurant.pricingTips.steer_to_margin.description":
      'Destacar un plato de buen margen (poniéndolo en negrita, agregando "el favorito del chef") aumenta los pedidos hacia él sin descontar nada.',
    "bizProfiles.restaurant.pricingTips.review_prices_periodically.label":
      "Revise los precios del menú con un calendario, no por intuición",
    "bizProfiles.restaurant.pricingTips.review_prices_periodically.description":
      "Muchos restaurantes cobran de menos durante años porque reimprimir el menú se siente como una molestia. Una revisión trimestral de precios frente a sus costos reales de comida evita una erosión lenta del margen.",
    "bizProfiles.restaurant.pricingTips.bundle_combo.label": "Use precios de combo o paquete",
    "bizProfiles.restaurant.pricingTips.bundle_combo.description":
      "Combinar un aperitivo o acompañamiento con un plato principal a un precio conjunto fijo aumenta el ticket promedio sin que el cliente lo sienta como un aumento de precio.",
    "bizProfiles.liquor_wine.label": "Licorería y tienda de vinos",
    "bizProfiles.liquor_wine.competitorNoun": "licorerías",
    "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.label": "$5 de descuento en compras de $30 o más",
    "bizProfiles.liquor_wine.couponPresets.flat_off_purchase.description":
      "Un simple descuento por umbral que convierte la visita por una sola botella en una compra más grande.",
    "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.label": "Compre 2 botellas y obtenga 10% de descuento",
    "bizProfiles.liquor_wine.couponPresets.bottle_bogo_pct.description":
      "Premia comprar más de una botella sin descontar directamente sus más vendidas.",
    "bizProfiles.liquor_wine.couponPresets.case_discount.label":
      "10% de descuento al comprar una caja completa (12 botellas)",
    "bizProfiles.liquor_wine.couponPresets.case_discount.description":
      "El cálculo estándar de descuento por caja en el comercio minorista — mueve volumen y premia a sus mejores clientes.",
    "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.label":
      "Vino o licor destacado del mes: 15% de descuento",
    "bizProfiles.liquor_wine.offerTemplates.featured_bottle_month.description":
      "Les da a los clientes habituales una razón para volver, y le permite mover una botella específica.",
    "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.label":
      "Cliente nuevo: 10% de descuento en su primera compra",
    "bizProfiles.liquor_wine.offerTemplates.new_customer_pct.description":
      "Una forma de bajo riesgo de que un comprador primerizo lo elija a usted en lugar de una cadena más grande.",
    "bizProfiles.liquor_wine.couponAngles.firstTime": "Cliente nuevo: 10% de descuento en su primera compra",
    "bizProfiles.liquor_wine.couponAngles.seasonal":
      "Descuento navideño por caja: 15% de descuento en cajas mixtas hasta Año Nuevo",
    "bizProfiles.liquor_wine.couponAngles.slowDay": "10% de descuento en compras en su día de semana más lento",
    "bizProfiles.liquor_wine.faq.item1.question": "¿{businessName} ofrece catas o acepta pedidos especiales?",
    "bizProfiles.liquor_wine.faq.item1.answer":
      "Llame o pase a preguntar sobre las próximas catas y las solicitudes de pedidos especiales.",
    "bizProfiles.liquor_wine.faq.item2.question": "¿Cuál es el horario de {businessName} cerca de {city}?",
    "bizProfiles.liquor_wine.faq.item2.answer":
      "Consulte nuestro horario actual en nuestra ficha del Perfil de Negocio de Google.",
    "bizProfiles.liquor_wine.referralPresets.credit_both.referrerReward": "$5 de crédito para su próxima compra",
    "bizProfiles.liquor_wine.referralPresets.credit_both.friendReward": "$5 de descuento en su primera compra",
    "bizProfiles.liquor_wine.referralPresets.credit_both.description":
      "El descuento directo en efectivo funciona bien para una compra minorista sencilla.",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.referrerReward":
      "10% de descuento en su próxima caja",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.friendReward":
      "10% de descuento en su primera compra",
    "bizProfiles.liquor_wine.referralPresets.case_discount_referral.description":
      "Premia específicamente a sus mejores clientes (los que compran por caja) por traer nuevos.",
    "bizProfiles.liquor_wine.pricingExamples.example1": "Botella de vino",
    "bizProfiles.liquor_wine.pricingExamples.example2": "Six-pack de cerveza",
    "bizProfiles.liquor_wine.pricingExamples.example3": "Caja (12 botellas)",
    "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.label":
      "Use algunos productos gancho para atraer tráfico",
    "bizProfiles.liquor_wine.pricingTips.loss_leader_traffic.description":
      "Un puñado de botellas conocidas con precios muy competitivos atrae a la gente; recupere el margen con los vinos y licores de mayor margen que compran junto a ellas.",
    "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.label":
      "Fije precios de caja para premiar la compra al por mayor",
    "bizProfiles.liquor_wine.pricingTips.case_bulk_discount.description":
      "Un descuento estándar del 10-15% por caja se espera en esta categoría — no ofrecerlo empuja las compras por caja hacia un competidor que sí lo hace.",
    "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.label":
      "Exhiba sus botellas de mejor margen a la altura de los ojos",
    "bizProfiles.liquor_wine.pricingTips.feature_margin_bottles.description":
      'La ubicación y una etiqueta de "recomendación del personal" aumentan las ventas de sus botellas de mejor margen de forma más eficaz que descontar las de peor margen.',
    "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.label":
      "Planifique promociones según los picos reales de demanda por temporada",
    "bizProfiles.liquor_wine.pricingTips.seasonal_pricing.description":
      "Las fiestas, la temporada de eventos deportivos y las parrilladas de verano son cuando ocurren naturalmente las compras por caja — destine ahí su presupuesto promocional en lugar de repartirlo de forma pareja todo el año.",
    "bizProfiles.grocery_market.label": "Supermercado / mercado",
    "bizProfiles.grocery_market.competitorNoun": "supermercados",
    "bizProfiles.grocery_market.couponPresets.flat_off_basket.label":
      "$5 de descuento en compras de $40 o más",
    "bizProfiles.grocery_market.couponPresets.flat_off_basket.description":
      "Un descuento por umbral ajustado a su canasta típica, no a un solo artículo.",
    "bizProfiles.grocery_market.couponPresets.weekly_special.label":
      "El especial de esta semana: artículos destacados con descuento",
    "bizProfiles.grocery_market.couponPresets.weekly_special.description":
      "Mantiene la tienda con una sensación de frescura y les da a los compradores una razón para volver cada semana.",
    "bizProfiles.grocery_market.couponPresets.loyalty_repeat.label":
      "Fidelidad: cada 10.ª compra, $10 de descuento",
    "bizProfiles.grocery_market.couponPresets.loyalty_repeat.description":
      "Premia directamente la frecuencia de compra — el verdadero motor de los ingresos de un supermercado.",
    "bizProfiles.grocery_market.offerTemplates.new_shopper_special.label":
      "Especial para compradores nuevos: $10 de descuento en su primer pedido de $40 o más",
    "bizProfiles.grocery_market.offerTemplates.new_shopper_special.description":
      "Elimina el riesgo de cambiar de donde el comprador suele ir.",
    "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.label":
      "Oferta de productos de temporada: los frescos destacados de esta semana con descuento",
    "bizProfiles.grocery_market.offerTemplates.seasonal_produce_sale.description":
      "Mueve el inventario perecedero mientras está en su mejor momento, y se percibe como genuinamente fresco.",
    "bizProfiles.grocery_market.couponAngles.firstTime":
      "Especial para compradores nuevos: $10 de descuento en su primer pedido de $40 o más",
    "bizProfiles.grocery_market.couponAngles.seasonal":
      "Oferta de productos de temporada: los frescos destacados de esta semana con descuento",
    "bizProfiles.grocery_market.couponAngles.slowDay":
      "$5 de descuento en compras de $40 o más en su día de compra más lento",
    "bizProfiles.grocery_market.faq.item1.question":
      "¿{businessName} ofrece entrega a domicilio o recogida en la acera?",
    "bizProfiles.grocery_market.faq.item1.answer":
      "Llame o consulte nuestro sitio web para ver las opciones actuales de entrega y recogida.",
    "bizProfiles.grocery_market.faq.item2.question": "¿Cuál es el horario de {businessName} cerca de {city}?",
    "bizProfiles.grocery_market.faq.item2.answer":
      "Consulte nuestro horario actual en nuestra ficha del Perfil de Negocio de Google.",
    "bizProfiles.grocery_market.referralPresets.credit_both.referrerReward":
      "$10 de crédito para su próxima compra",
    "bizProfiles.grocery_market.referralPresets.credit_both.friendReward":
      "$10 de descuento en su primer pedido de $40 o más",
    "bizProfiles.grocery_market.referralPresets.credit_both.description":
      "El crédito en la tienda hace que quien recomienda vuelva a comprar, no es solo una recompensa de una sola vez.",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.referrerReward":
      "10% de descuento en su próxima compra",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.friendReward":
      "10% de descuento en su primera compra",
    "bizProfiles.grocery_market.referralPresets.pct_off_both.description":
      "Simple y entendido por todos para una compra basada en canasta.",
    "bizProfiles.grocery_market.pricingExamples.example1": "Canasta semanal",
    "bizProfiles.grocery_market.pricingExamples.example2": "Artículo especial destacado",
    "bizProfiles.grocery_market.pricingExamples.example3": "Artículo a granel/por caja",
    "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.label":
      "Use los especiales semanales como productos gancho",
    "bizProfiles.grocery_market.pricingTips.loss_leader_weekly_specials.description":
      "Unos pocos productos básicos con precios muy competitivos cada semana atraen a los compradores; el resto de su canasta es de donde viene el verdadero margen.",
    "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.label":
      "Fije precios de productos a granel y por caja para premiar las canastas más grandes",
    "bizProfiles.grocery_market.pricingTips.bulk_case_pricing.description":
      "Un descuento modesto por unidad en los paquetes múltiples aumenta el tamaño promedio de la canasta sin descontar los artículos individuales de todos los días.",
    "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.label":
      "Ajuste el precio de los productos frescos según los costos reales de suministro por temporada",
    "bizProfiles.grocery_market.pricingTips.seasonal_produce_pricing.description":
      "El costo de los productos frescos varía con la temporada — reajustar su precio con un calendario protege el margen mejor que un precio fijo todo el año.",
    "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.label":
      "Use recompensas de fidelidad para aumentar la frecuencia de visita, no para descontar el margen",
    "bizProfiles.grocery_market.pricingTips.loyalty_raises_frequency.description":
      "Una recompensa por compra repetida (cada 10.ª visita, por ejemplo) hace crecer los ingresos trayendo a los compradores de vuelta más seguido, en lugar de recortar el precio de cada visita.",
    "bizProfiles.cafe_bakery.label": "Cafetería y panadería",
    "bizProfiles.cafe_bakery.competitorNoun": "cafeterías",
    "bizProfiles.cafe_bakery.couponPresets.flat_off_order.label":
      "$2 de descuento en cualquier pedido de $10 o más",
    "bizProfiles.cafe_bakery.couponPresets.flat_off_order.description":
      "Un umbral bajo y fácil que se ajusta a un pedido típico de café y repostería.",
    "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.label":
      "Repostería o bebida gratis con cualquier compra de $15 o más",
    "bizProfiles.cafe_bakery.couponPresets.free_item_with_purchase.description":
      "Se siente generoso sin descontar el precio de su menú principal.",
    "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.label": "Compre 9 bebidas y llévese la 10.ª gratis",
    "bizProfiles.cafe_bakery.couponPresets.loyalty_punch.description":
      "La clásica estructura de fidelidad de las cafeterías — premia las visitas repetidas y habituales.",
    "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.label":
      "Cliente por primera vez: bebida o repostería gratis con cualquier compra",
    "bizProfiles.cafe_bakery.offerTemplates.first_visit_special.description":
      "Elimina el riesgo de probar un lugar nuevo para su café de la mañana.",
    "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.label":
      "20% de descuento en pedidos antes de las 9 am",
    "bizProfiles.cafe_bakery.offerTemplates.morning_slow_hours.description":
      "Llena sus horas lentas de la mañana en lugar de descontar su hora pico.",
    "bizProfiles.cafe_bakery.couponAngles.firstTime":
      "Cliente por primera vez: bebida o repostería gratis con cualquier compra",
    "bizProfiles.cafe_bakery.couponAngles.seasonal":
      "Bebida o repostería de temporada: pruébela este mes, 15% de descuento",
    "bizProfiles.cafe_bakery.couponAngles.slowDay":
      "20% de descuento en pedidos durante sus horas más lentas de la tarde",
    "bizProfiles.cafe_bakery.faq.item1.question": "¿{businessName} tiene Wi-Fi o lugares para trabajar?",
    "bizProfiles.cafe_bakery.faq.item1.answer": "Sí — pase y pregunte sobre la disponibilidad de asientos y Wi-Fi.",
    "bizProfiles.cafe_bakery.faq.item2.question":
      "¿{businessName} acepta pedidos especiales de pasteles o servicio de catering?",
    "bizProfiles.cafe_bakery.faq.item2.answer": "Llame o pase a preguntar sobre pedidos especiales y catering.",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.referrerReward":
      "Una bebida o repostería gratis en su próxima visita",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.friendReward":
      "Una bebida o repostería gratis en su primera visita",
    "bizProfiles.cafe_bakery.referralPresets.free_item_both.description":
      "Los productos gratis cuestan menos que un descuento directo y se sienten generosos para ambas partes.",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.referrerReward": "$5 de descuento en su próximo pedido",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.friendReward": "15% de descuento en su primer pedido",
    "bizProfiles.cafe_bakery.referralPresets.pct_off_both.description":
      "Descuento directo en efectivo para un pedido típico de cafetería.",
    "bizProfiles.cafe_bakery.pricingExamples.example1": "Café/bebida de espresso",
    "bizProfiles.cafe_bakery.pricingExamples.example2": "Repostería/producto horneado",
    "bizProfiles.cafe_bakery.pricingExamples.example3": "Sándwich o bocadillo ligero",
    "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.label":
      "Ancle con una bebida especial o premium",
    "bizProfiles.cafe_bakery.pricingTips.anchor_specialty_drink.description":
      "Un latte especial de $7 en la pizarra hace que su latte estándar de $4.50 parezca la opción razonable.",
    "bizProfiles.cafe_bakery.pricingTips.bundle_combo.label": "Use precios de combo para una bebida + repostería",
    "bizProfiles.cafe_bakery.pricingTips.bundle_combo.description":
      "Un precio conjunto fijo para una bebida y una repostería aumenta el ticket promedio sin sentirse como un aumento de precio.",
    "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.label":
      "Revise los precios a medida que cambian los costos de los ingredientes",
    "bizProfiles.cafe_bakery.pricingTips.review_ingredient_costs.description":
      "Los costos del café, los lácteos y la harina cambian con frecuencia; compare los precios del menú con los costos reales según un calendario, no por intuición.",
    "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.label":
      "Use una tarjeta de sellos de fidelidad en lugar de descuentos generalizados",
    "bizProfiles.cafe_bakery.pricingTips.loyalty_over_discount.description":
      "Premiar la 10.ª visita cuesta menos con el tiempo que descontar cada visita, y aumenta específicamente la frecuencia de repetición.",
    "bizProfiles.lawyer.label": "Servicios legales",
    "bizProfiles.lawyer.competitorNoun": "bufetes",
    "bizProfiles.lawyer.couponPresets.free_consultation.label": "Consulta inicial gratuita de 30 minutos",
    "bizProfiles.lawyer.couponPresets.free_consultation.description":
      "La forma estándar y éticamente sencilla en que la mayoría de los bufetes reducen la barrera para una primera llamada.",
    "bizProfiles.lawyer.couponPresets.flat_fee_review.label":
      "Revisión de caso a tarifa fija por un precio establecido",
    "bizProfiles.lawyer.couponPresets.flat_fee_review.description":
      "Le da a un cliente potencial preocupado por el precio un costo conocido para obtener asesoría real.",
    "bizProfiles.lawyer.offerTemplates.new_client_doc_review.label":
      "Descuento para clientes nuevos en la preparación de documentos",
    "bizProfiles.lawyer.offerTemplates.new_client_doc_review.description":
      "Un descuento concreto y acotado que no afecta el trabajo por horas ni a resultado.",
    "bizProfiles.lawyer.couponAngles.firstTime": "Consulta inicial gratuita de 30 minutos",
    "bizProfiles.lawyer.couponAngles.seasonal":
      "Especial de revisión de documentos de fin de año — ponga sus papeles en orden",
    "bizProfiles.lawyer.couponAngles.slowDay": "Revisión de caso a tarifa fija, disponible esta semana",
    "bizProfiles.lawyer.faq.item1.question": "¿{businessName} ofrece una consulta gratuita?",
    "bizProfiles.lawyer.faq.item1.answer":
      "Sí — llame o use nuestro formulario de contacto para programar una consulta inicial.",
    "bizProfiles.lawyer.faq.item2.question": "¿En qué áreas del derecho ejerce {businessName}?",
    "bizProfiles.lawyer.faq.item2.answer":
      "Consulte nuestra página de áreas de práctica para los asuntos específicos que manejamos.",
    "bizProfiles.lawyer.pricingExamples.example1": "Consulta inicial",
    "bizProfiles.lawyer.pricingExamples.example2": "Revisión de documentos a tarifa fija",
    "bizProfiles.lawyer.pricingExamples.example3": "Tarifa por hora",
    "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.label":
      "Use tarifas fijas para el trabajo estandarizado",
    "bizProfiles.lawyer.pricingTips.flat_fee_commodity_work.description":
      "Para asuntos predecibles como la revisión de documentos o trámites no impugnados, una tarifa fija conocida elimina la ansiedad por el precio que genera un presupuesto por horas abierto, en el que la mayoría de los clientes potenciales no confía.",
    "bizProfiles.lawyer.pricingTips.tiered_consultation.label": "Ofrezca una consulta por niveles",
    "bizProfiles.lawyer.pricingTips.tiered_consultation.description":
      "Una evaluación telefónica gratuita de 15 minutos más una sesión de estrategia pagada de 1 hora permite que los clientes potenciales sensibles al precio se seleccionen solos, sin que usted trabaje gratis indefinidamente.",
    "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.label":
      "Suba sus tarifas cuando esté rechazando trabajo",
    "bizProfiles.lawyer.pricingTips.raise_when_turning_away_work.description":
      "Rechazar de forma constante asuntos que de otro modo aceptaría es la verdadera señal de que sus precios están por debajo — no cuánto tiempo ha pasado desde su último aumento.",
    "bizProfiles.lawyer.pricingTips.scope_in_writing.label": "Ponga por escrito lo que está incluido",
    "bizProfiles.lawyer.pricingTips.scope_in_writing.description":
      "Ser explícito por adelantado sobre lo que cubre una tarifa fija (y qué activa la facturación por horas) evita disputas sobre honorarios más adelante.",
    "bizProfiles.professional_services.label": "Contabilidad e impuestos",
    "bizProfiles.professional_services.competitorNoun": "firmas contables",
    "bizProfiles.professional_services.couponPresets.free_consultation.label":
      "Consulta inicial gratuita de 30 minutos",
    "bizProfiles.professional_services.couponPresets.free_consultation.description":
      "Reduce la barrera para una primera llamada de un cliente potencial que aún no está seguro de lo que necesita.",
    "bizProfiles.professional_services.couponPresets.flat_fee_package.label":
      "Paquete a tarifa fija para una declaración sencilla o la configuración de la contabilidad",
    "bizProfiles.professional_services.couponPresets.flat_fee_package.description":
      "Le da a un cliente potencial preocupado por el precio un costo conocido en lugar de un presupuesto por horas abierto.",
    "bizProfiles.professional_services.couponPresets.new_client_pct.label":
      "10% de descuento en su primer año de servicio",
    "bizProfiles.professional_services.couponPresets.new_client_pct.description":
      "Un descuento acotado que no afecta su tarifa de trabajo continuo.",
    "bizProfiles.professional_services.offerTemplates.new_client_return_discount.label":
      "Descuento para clientes nuevos: $50 de descuento en su primera declaración de impuestos",
    "bizProfiles.professional_services.offerTemplates.new_client_return_discount.description":
      "Una razón concreta y de bajo riesgo para cambiar de un preparador anterior.",
    "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.label":
      "Combine la contabilidad mensual y la preparación anual de impuestos en un solo precio de paquete fijo",
    "bizProfiles.professional_services.offerTemplates.bundle_bookkeeping_tax.description":
      "Agrupar el trabajo recurrente y el anual aumenta lo que un cliente contrata con usted de una sola vez.",
    "bizProfiles.professional_services.couponAngles.firstTime": "Consulta inicial gratuita de 30 minutos",
    "bizProfiles.professional_services.couponAngles.seasonal":
      "Especial de temporada de impuestos: reserve su declaración con anticipación y ahorre",
    "bizProfiles.professional_services.couponAngles.slowDay":
      "Revisión de la configuración de contabilidad a tarifa fija, disponible esta semana",
    "bizProfiles.professional_services.faq.item1.question": "¿{businessName} ofrece una consulta gratuita?",
    "bizProfiles.professional_services.faq.item1.answer":
      "Sí — llame o use nuestro formulario de contacto para programar una consulta inicial.",
    "bizProfiles.professional_services.faq.item2.question": "¿Qué servicios ofrece {businessName}?",
    "bizProfiles.professional_services.faq.item2.answer":
      "Consulte nuestra página de servicios para los servicios específicos de contabilidad e impuestos que ofrecemos.",
    "bizProfiles.professional_services.referralPresets.credit_both.referrerReward":
      "$25 de crédito para su próxima factura",
    "bizProfiles.professional_services.referralPresets.credit_both.friendReward":
      "$50 de descuento en su primer servicio",
    "bizProfiles.professional_services.referralPresets.credit_both.description":
      "El crédito en la factura mantiene a quien recomienda como cliente continuo, en lugar de ser un descuento de una sola vez.",
    "bizProfiles.professional_services.referralPresets.pct_off_both.referrerReward":
      "10% de descuento en su próximo año de servicio",
    "bizProfiles.professional_services.referralPresets.pct_off_both.friendReward":
      "10% de descuento en su primer año",
    "bizProfiles.professional_services.referralPresets.pct_off_both.description":
      "Simple y proporcional para un trabajo continuo en lugar de una compra única.",
    "bizProfiles.professional_services.pricingExamples.example1": "Declaración de impuestos personal",
    "bizProfiles.professional_services.pricingExamples.example2": "Declaración de impuestos de empresa",
    "bizProfiles.professional_services.pricingExamples.example3": "Contabilidad mensual",
    "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.label":
      "Use tarifas fijas para declaraciones sencillas",
    "bizProfiles.professional_services.pricingTips.flat_fee_commodity_work.description":
      "Una tarifa fija conocida para una declaración sencilla elimina la ansiedad por el precio que genera un presupuesto por horas abierto, en el que la mayoría de los clientes potenciales no confía.",
    "bizProfiles.professional_services.pricingTips.tiered_by_complexity.label":
      "Escalone los precios por complejidad, no por cliente",
    "bizProfiles.professional_services.pricingTips.tiered_by_complexity.description":
      "Un nivel de declaración sencilla/estándar/compleja permite que los clientes se seleccionen según su situación real, en lugar de un precio único que le cobra de más o de menos a la mayoría.",
    "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.label":
      "Use una tarifa mensual fija para la contabilidad continua",
    "bizProfiles.professional_services.pricingTips.retainer_for_ongoing.description":
      "Una tarifa mensual fija predecible para el trabajo recurrente de contabilidad es más fácil de presupuestar para un cliente que la facturación variable por horas, y estabiliza sus propios ingresos.",
    "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.label":
      "Suba sus tarifas cuando esté rechazando trabajo",
    "bizProfiles.professional_services.pricingTips.raise_when_turning_away_work.description":
      "Rechazar de forma constante nuevos trabajos que de otro modo aceptaría es la verdadera señal de que sus precios están por debajo — no cuánto tiempo ha pasado desde su último aumento.",
    "bizProfiles.practitioner.label": "Profesional, coaching y clases",
    "bizProfiles.practitioner.competitorNoun": "profesionales",
    "bizProfiles.practitioner.couponPresets.pct_off_next_session.label":
      "10% de descuento en su próxima sesión o clase",
    "bizProfiles.practitioner.couponPresets.pct_off_next_session.description":
      "El equivalente directo a un descuento de fidelidad cuando no hay un producto que descontar en su lugar.",
    "bizProfiles.practitioner.couponPresets.free_intro_consult.label":
      "Consulta o sesión introductoria gratis para clientes nuevos",
    "bizProfiles.practitioner.couponPresets.free_intro_consult.description":
      "Permite que un cliente nuevo experimente su estilo antes de comprometer dinero.",
    "bizProfiles.practitioner.couponPresets.class_pack_bonus.label":
      "Compre un paquete de 5 sesiones y llévese 1 gratis",
    "bizProfiles.practitioner.couponPresets.class_pack_bonus.description":
      "Premia el compromiso y equilibra su agenda de reservas.",
    "bizProfiles.practitioner.offerTemplates.new_client_special.label":
      "Especial para clientes nuevos: 20% de descuento en su primera sesión",
    "bizProfiles.practitioner.offerTemplates.new_client_special.description":
      "La misma lógica que cualquier negocio de servicios — elimine el riesgo de probar algo nuevo.",
    "bizProfiles.practitioner.offerTemplates.referral_free_class.label":
      "Recomiende a un amigo: ambos reciben una clase gratis",
    "bizProfiles.practitioner.offerTemplates.referral_free_class.description":
      "Especialmente eficaz para las clases grupales, donde un asistente adicional casi no le cuesta nada.",
    "bizProfiles.practitioner.couponAngles.firstTime": "Consulta o sesión introductoria gratis para clientes nuevos",
    "bizProfiles.practitioner.couponAngles.seasonal":
      "Nueva temporada, nuevas metas: 15% de descuento en un nuevo paquete de sesiones",
    "bizProfiles.practitioner.couponAngles.slowDay": "10% de descuento en sesiones de mañana entre semana",
    "bizProfiles.practitioner.faq.item1.question": "¿{businessName} ofrece sesiones virtuales o a distancia?",
    "bizProfiles.practitioner.faq.item1.answer":
      "Sí — pregunte por las opciones virtuales si una sesión presencial cerca de {city} no se ajusta a su horario.",
    "bizProfiles.practitioner.faq.item2.question":
      "¿Necesito reservar una cita con {businessName} con anticipación?",
    "bizProfiles.practitioner.faq.item2.answer":
      "Sí, las sesiones son con cita — comuníquese para consultar la disponibilidad actual.",
    "bizProfiles.practitioner.referralPresets.free_session_both.referrerReward": "Una clase o sesión gratis",
    "bizProfiles.practitioner.referralPresets.free_session_both.friendReward": "Una clase o sesión gratis",
    "bizProfiles.practitioner.referralPresets.free_session_both.description":
      "Especialmente eficaz para las clases grupales, donde un asistente adicional casi no le cuesta nada.",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.referrerReward":
      "$15 de crédito para su próxima sesión",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.friendReward":
      "20% de descuento en su primera sesión",
    "bizProfiles.practitioner.referralPresets.credit_toward_session.description":
      "Funciona bien para prácticas individuales con cita, donde un espacio libre es un costo real.",
    "bizProfiles.practitioner.pricingExamples.example1": "Sesión individual",
    "bizProfiles.practitioner.pricingExamples.example2": "Clase grupal",
    "bizProfiles.practitioner.pricingExamples.example3": "Sesión introductoria",
    "bizProfiles.practitioner.pricingTips.package_pricing.label":
      "Venda paquetes de sesiones, no solo sesiones sueltas",
    "bizProfiles.practitioner.pricingTips.package_pricing.description":
      "Un paquete de 5 o 10 sesiones premia el compromiso y equilibra su agenda, y los clientes que han pagado por adelantado rara vez faltan a la cita.",
    "bizProfiles.practitioner.pricingTips.low_cost_intro.label":
      "Use una sesión introductoria gratis o de bajo costo para convertir",
    "bizProfiles.practitioner.pricingTips.low_cost_intro.description":
      "Una sesión introductoria corta convierte a los clientes indecisos sin descontar permanentemente su tarifa real — preséntela claramente como una oferta de una sola vez.",
    "bizProfiles.practitioner.pricingTips.raise_when_booked_out.label":
      "Suba su tarifa cuando esté reservado de forma constante",
    "bizProfiles.practitioner.pricingTips.raise_when_booked_out.description":
      "Una agenda que está llena con 2 o más semanas de anticipación, semana tras semana, es demanda real — no solo una racha ocupada — y la señal honesta de que es momento de subir su tarifa.",
    "bizProfiles.practitioner.pricingTips.price_by_format.label":
      "Cobre la misma experiencia de forma diferente según el formato",
    "bizProfiles.practitioner.pricingTips.price_by_format.description":
      "Una clase grupal y una sesión individual usan la misma habilidad pero le cuestan muy diferente de impartir — cobre cada una por formato en lugar de descontar su tarifa individual principal.",
    "bizProfiles.gym_fitness.label": "Gimnasio y estudio de fitness",
    "bizProfiles.gym_fitness.competitorNoun": "gimnasios",
    "bizProfiles.gym_fitness.couponPresets.first_month_pct.label": "50% de descuento en su primer mes",
    "bizProfiles.gym_fitness.couponPresets.first_month_pct.description":
      "La oferta de gimnasio estándar y con mayor conversión — elimina el riesgo de comprometerse con un lugar nuevo.",
    "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.label":
      "Sin cuota de inscripción para nuevos miembros este mes",
    "bizProfiles.gym_fitness.couponPresets.no_enrollment_fee.description":
      "Elimina un punto de fricción común sin descontar su tarifa de membresía real.",
    "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.label":
      "Compre un paquete de 10 clases y llévese 2 clases gratis",
    "bizProfiles.gym_fitness.couponPresets.class_pack_bonus.description":
      "Premia el compromiso y equilibra la asistencia a clases sin descontar la tarifa de clase suelta.",
    "bizProfiles.gym_fitness.offerTemplates.new_member_special.label":
      "Especial para nuevos miembros: 50% de descuento en su primer mes, sin cuota de inscripción",
    "bizProfiles.gym_fitness.offerTemplates.new_member_special.description":
      "Combina las dos ofertas de menor riesgo en un solo gancho fuerte para la primera vez.",
    "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.label":
      "Traiga a un amigo: ambos reciben una clase o sesión gratis",
    "bizProfiles.gym_fitness.offerTemplates.bring_a_friend.description":
      "Le cuesta un espacio de clase, no efectivo — eficaz porque una clase tiene un costo marginal casi nulo por persona adicional.",
    "bizProfiles.gym_fitness.couponAngles.firstTime":
      "Especial para nuevos miembros: 50% de descuento en su primer mes, sin cuota de inscripción",
    "bizProfiles.gym_fitness.couponAngles.seasonal": "Año nuevo, nuevas metas: 50% de descuento en su primer mes",
    "bizProfiles.gym_fitness.couponAngles.slowDay":
      "20% de descuento en inscripciones a clases en horas de menor afluencia (mediodía)",
    "bizProfiles.gym_fitness.faq.item1.question":
      "¿{businessName} ofrece una clase de prueba gratis o un pase de día?",
    "bizProfiles.gym_fitness.faq.item1.answer": "Sí — pregunte por las opciones de prueba cuando pase o llame.",
    "bizProfiles.gym_fitness.faq.item2.question": "¿Cuál es el horario de clases de {businessName}?",
    "bizProfiles.gym_fitness.faq.item2.answer":
      "Consulte nuestro horario de clases actual en nuestro sitio web o llamando.",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.referrerReward": "Un mes de membresía gratis",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.friendReward": "50% de descuento en su primer mes",
    "bizProfiles.gym_fitness.referralPresets.free_month_both.description":
      "La membresía es su ingreso recurrente, así que premiar con más de ella le cuesta menos de lo que vale para un miembro.",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.referrerReward": "Una clase o sesión gratis",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.friendReward": "Una clase o sesión gratis",
    "bizProfiles.gym_fitness.referralPresets.free_session_both.description":
      "Especialmente eficaz para las clases grupales, donde un asistente adicional casi no le cuesta nada.",
    "bizProfiles.gym_fitness.pricingExamples.example1": "Membresía mensual",
    "bizProfiles.gym_fitness.pricingExamples.example2": "Clase suelta",
    "bizProfiles.gym_fitness.pricingExamples.example3": "Sesión de entrenamiento personal",
    "bizProfiles.gym_fitness.pricingTips.tiered_membership.label": "Ofrezca niveles de membresía escalonados",
    "bizProfiles.gym_fitness.pricingTips.tiered_membership.description":
      "Un nivel básico, uno ilimitado y uno premium con entrenamiento permite que los miembros elijan cuánto gastar, en lugar de un solo precio que le queda mal a todos.",
    "bizProfiles.gym_fitness.pricingTips.annual_discount.label":
      "Descuente las membresías anuales para asegurar el compromiso",
    "bizProfiles.gym_fitness.pricingTips.annual_discount.description":
      "Un descuento modesto por pagar anualmente mejora su flujo de caja y su retención más de lo que le cuesta en margen.",
    "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.label":
      "Cobre menos por las sesiones en horas de menor afluencia para llenar las horas lentas",
    "bizProfiles.gym_fitness.pricingTips.off_peak_pricing.description":
      "Descontar los horarios de mediodía o temprano en la mañana llena la capacidad que de otro modo quedaría vacía, sin tocar su tarifa de hora pico.",
    "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.label":
      "Suba las tarifas cuando las clases estén llenas de forma constante",
    "bizProfiles.gym_fitness.pricingTips.raise_when_classes_full.description":
      "Clases con lista de espera semana tras semana son la señal honesta de que sus precios están por debajo de la demanda.",
    "bizProfiles.trades.label": "Oficios y servicios para el hogar",
    "bizProfiles.trades.competitorNoun": "proveedores de servicios",
    "bizProfiles.trades.couponPresets.flat_off_first_call.label":
      "$25 de descuento en su primera visita de servicio",
    "bizProfiles.trades.couponPresets.flat_off_first_call.description":
      "Elimina el riesgo de probar un nuevo proveedor para un trabajo que de otro modo es difícil de comparar por precio.",
    "bizProfiles.trades.couponPresets.seasonal_tuneup.label":
      "Especial de mantenimiento de temporada: $20 de descuento en una inspección o visita de mantenimiento",
    "bizProfiles.trades.couponPresets.seasonal_tuneup.description":
      "Llena su temporada más lenta con trabajo de mantenimiento real y útil en lugar de estar inactivo.",
    "bizProfiles.trades.couponPresets.bundle_multiple_jobs.label":
      "10% de descuento al combinar dos o más trabajos en una sola visita",
    "bizProfiles.trades.couponPresets.bundle_multiple_jobs.description":
      "Premia un ticket más grande por salida, que es donde está su verdadero margen (menos tiempo de traslado por cada dólar facturado).",
    "bizProfiles.trades.offerTemplates.new_customer_first_call.label":
      "Especial para clientes nuevos: $25 de descuento en su primera visita de servicio",
    "bizProfiles.trades.offerTemplates.new_customer_first_call.description":
      "La oferta con mayor conversión para un oficio — reduce el riesgo de probar a alguien nuevo.",
    "bizProfiles.trades.offerTemplates.seasonal_maintenance.label":
      "Especial de mantenimiento de temporada (p. ej. revisión del aire acondicionado antes del verano, revisión de la calefacción antes del invierno)",
    "bizProfiles.trades.offerTemplates.seasonal_maintenance.description":
      "Convierte una necesidad de temporada predecible en ingresos reservados antes de que se vuelva una llamada de emergencia.",
    "bizProfiles.trades.couponAngles.firstTime":
      "Especial para clientes nuevos: $25 de descuento en su primera visita de servicio",
    "bizProfiles.trades.couponAngles.seasonal":
      "Especial de mantenimiento de temporada: $20 de descuento en una inspección antes de que cambie la temporada",
    "bizProfiles.trades.couponAngles.slowDay":
      "10% de descuento en visitas de servicio reservadas para las mañanas entre semana",
    "bizProfiles.trades.faq.item1.question": "¿{businessName} ofrece servicio de emergencia o el mismo día?",
    "bizProfiles.trades.faq.item1.answer":
      "Llame para consultar la disponibilidad actual de citas de emergencia o el mismo día.",
    "bizProfiles.trades.faq.item2.question": "¿A qué zonas cerca de {city} presta servicio {businessName}?",
    "bizProfiles.trades.faq.item2.answer":
      "Prestamos servicio en {city} y los alrededores — llame para confirmar que cubrimos su ubicación.",
    "bizProfiles.trades.referralPresets.flat_off_both.referrerReward":
      "$25 de descuento en su próxima visita de servicio",
    "bizProfiles.trades.referralPresets.flat_off_both.friendReward":
      "$25 de descuento en su primera visita de servicio",
    "bizProfiles.trades.referralPresets.flat_off_both.description":
      "Descuento directo en efectivo para un negocio sencillo de visitas de servicio.",
    "bizProfiles.trades.referralPresets.pct_off_both.referrerReward": "10% de descuento en su próximo servicio",
    "bizProfiles.trades.referralPresets.pct_off_both.friendReward": "10% de descuento en su primer servicio",
    "bizProfiles.trades.referralPresets.pct_off_both.description":
      "Escala con el tamaño del trabajo en lugar de un monto fijo que podría ser muy pequeño para un trabajo grande o muy generoso para uno pequeño.",
    "bizProfiles.trades.pricingExamples.example1": "Visita de servicio",
    "bizProfiles.trades.pricingExamples.example2": "Trabajo estándar",
    "bizProfiles.trades.pricingExamples.example3": "Mantenimiento de temporada",
    "bizProfiles.trades.pricingTips.flat_vs_hourly.label":
      "Decida tarifa fija vs. por hora según el tipo de trabajo",
    "bizProfiles.trades.pricingTips.flat_vs_hourly.description":
      "Un trabajo predecible (un desagüe tapado, cambiar un tomacorriente) es un buen candidato para tarifa fija; el trabajo de diagnóstico abierto es mejor facturarlo por hora para que no asuma usted el riesgo de lo desconocido.",
    "bizProfiles.trades.pricingTips.travel_radius_pricing.label":
      "Cobre un cargo por traslado para trabajos fuera de su zona principal",
    "bizProfiles.trades.pricingTips.travel_radius_pricing.description":
      "Una tarifa de traslado modesta para trabajos más lejanos protege su margen sin rechazar el trabajo más cercano que no la necesita.",
    "bizProfiles.trades.pricingTips.seasonal_demand_pricing.label":
      "Suba los precios en su temporada alta, descuente en la baja",
    "bizProfiles.trades.pricingTips.seasonal_demand_pricing.description":
      "La demanda de la mayoría de los oficios varía mucho por temporada — cobrar lo mismo todo el año deja dinero sobre la mesa en los meses pico y capacidad ociosa en los lentos.",
    "bizProfiles.trades.pricingTips.bundle_multiple_jobs.label": "Combine varios trabajos en una misma propiedad",
    "bizProfiles.trades.pricingTips.bundle_multiple_jobs.description":
      "Un pequeño descuento por manejar dos o tres trabajos en una sola visita aún le deja más por hora que dos salidas separadas.",
    "bizProfiles.retail.label": "Tienda minorista",
    "bizProfiles.retail.competitorNoun": "minoristas",
    "bizProfiles.retail.couponPresets.flat_off_threshold.label": "$10 de descuento en compras de $50 o más",
    "bizProfiles.retail.couponPresets.flat_off_threshold.description":
      "Un descuento por umbral que convierte una compra más pequeña en una más grande.",
    "bizProfiles.retail.couponPresets.bogo.label": "Compre uno y llévese el segundo al 50% en artículos seleccionados",
    "bizProfiles.retail.couponPresets.bogo.description":
      "Un clásico para atraer tráfico minorista — ideal para mover artículos de temporada o con exceso de inventario.",
    "bizProfiles.retail.couponPresets.bulk_discount.label": "10% de descuento al comprar 3 o más",
    "bizProfiles.retail.couponPresets.bulk_discount.description":
      "Premia una compra más grande sin descontar la compra de un solo artículo.",
    "bizProfiles.retail.offerTemplates.welcome_offer.label":
      "Oferta de bienvenida para clientes nuevos: 15% de descuento en su primera compra",
    "bizProfiles.retail.offerTemplates.welcome_offer.description":
      "Dele a los clientes primerizos una razón clara para elegirlo a usted en lugar de a un competidor.",
    "bizProfiles.retail.offerTemplates.seasonal_clearance.label":
      "Oferta de temporada: descuente el inventario de la temporada pasada para hacer espacio a las novedades",
    "bizProfiles.retail.offerTemplates.seasonal_clearance.description":
      "Mueve el inventario antiguo y les da a los clientes habituales una razón para volver.",
    "bizProfiles.retail.couponAngles.firstTime":
      "Oferta de bienvenida para clientes nuevos: 15% de descuento en su primera compra",
    "bizProfiles.retail.couponAngles.seasonal":
      "Oferta de temporada — vinculada a la temporada o a un día festivo próximo",
    "bizProfiles.retail.couponAngles.slowDay":
      "$10 de descuento en compras de $50 o más en su día de compra más lento",
    "bizProfiles.retail.faq.item1.question": "¿{businessName} acepta devoluciones o cambios?",
    "bizProfiles.retail.faq.item1.answer":
      "Sí — pregunte por nuestra política de devoluciones y cambios al momento de pagar.",
    "bizProfiles.retail.faq.item2.question": "¿Cuál es el horario de {businessName} cerca de {city}?",
    "bizProfiles.retail.faq.item2.answer":
      "Consulte nuestro horario actual en nuestra ficha del Perfil de Negocio de Google.",
    "bizProfiles.retail.referralPresets.credit_both.referrerReward": "$10 de crédito en la tienda",
    "bizProfiles.retail.referralPresets.credit_both.friendReward": "$10 de descuento en su primera compra",
    "bizProfiles.retail.referralPresets.credit_both.description":
      "El crédito en la tienda hace que quien recomienda siga volviendo, en lugar de una recompensa única en efectivo.",
    "bizProfiles.retail.referralPresets.pct_off_both.referrerReward": "10% de descuento en su próxima compra",
    "bizProfiles.retail.referralPresets.pct_off_both.friendReward": "15% de descuento en su primera compra",
    "bizProfiles.retail.referralPresets.pct_off_both.description":
      "Simple y entendido por todos para una compra minorista sencilla.",
    "bizProfiles.retail.pricingExamples.example1": "Artículo estándar",
    "bizProfiles.retail.pricingExamples.example2": "Destacado/novedad",
    "bizProfiles.retail.pricingExamples.example3": "A granel/paquete múltiple",
    "bizProfiles.retail.pricingTips.anchor_pricing.label": "Ancle con su artículo de precio más alto",
    "bizProfiles.retail.pricingTips.anchor_pricing.description":
      "Mostrar primero una opción premium hace que sus artículos de gama media parezcan tener un precio razonable en comparación.",
    "bizProfiles.retail.pricingTips.bulk_bundle_pricing.label":
      "Fije precios de paquetes o multipacks para aumentar la venta promedio",
    "bizProfiles.retail.pricingTips.bulk_bundle_pricing.description":
      "Un descuento modesto por unidad en un paquete aumenta el tamaño de la venta promedio sin descontar la compra de un solo artículo.",
    "bizProfiles.retail.pricingTips.seasonal_markdowns.label": "Planifique un calendario de rebajas por temporada",
    "bizProfiles.retail.pricingTips.seasonal_markdowns.description":
      "Un ritmo de liquidación planificado (fin de temporada, día festivo) protege el margen mejor que descontar de forma improvisada cada vez que el inventario se siente estancado.",
    "bizProfiles.retail.pricingTips.raise_on_demand.label":
      "Suba los precios de los artículos que se agotan de forma constante",
    "bizProfiles.retail.pricingTips.raise_on_demand.description":
      "Un artículo que se agota cada vez que lo reabastece tiene un precio por debajo de la demanda real.",
    "bizProfiles.default.label": "Negocio general",
    "bizProfiles.default.competitorNoun": "negocios",
    "bizProfiles.default.couponPresets.flat_off_purchase.label":
      "$10 de descuento en una compra o visita de $50 o más",
    "bizProfiles.default.couponPresets.flat_off_purchase.description":
      "Funciona para casi cualquier negocio basado en transacciones sin suponer cómo cobra usted.",
    "bizProfiles.default.couponPresets.pct_off_new_customer.label": "10% de descuento para clientes nuevos",
    "bizProfiles.default.couponPresets.pct_off_new_customer.description":
      "Una forma de bajo riesgo y entendida por todos de convertir a un visitante primerizo.",
    "bizProfiles.default.offerTemplates.welcome_offer.label": "Oferta de bienvenida para clientes nuevos",
    "bizProfiles.default.offerTemplates.welcome_offer.description":
      "Dele a los clientes primerizos una razón clara para elegirlo a usted en lugar de a un competidor.",
    "bizProfiles.default.offerTemplates.seasonal_special.label": "Especial de temporada",
    "bizProfiles.default.offerTemplates.seasonal_special.description":
      "Vincule una promoción a un momento real del calendario relevante para sus clientes.",
    "bizProfiles.default.couponAngles.firstTime": "10% de descuento para clientes nuevos",
    "bizProfiles.default.couponAngles.seasonal": "Especial de temporada — vinculado a lo que sucede este mes",
    "bizProfiles.default.couponAngles.slowDay":
      "$10 de descuento en una compra o visita de $50 o más en su día más lento de la semana",
    "bizProfiles.default.faq.item1.question": "¿Cómo puedo contactar a {businessName}?",
    "bizProfiles.default.faq.item1.answer": "Llámenos o use la información de contacto en nuestra ficha de Google.",
    "bizProfiles.default.faq.item2.question": "¿Cuál es el horario de {businessName}?",
    "bizProfiles.default.faq.item2.answer":
      "Consulte nuestro horario actual en nuestra ficha del Perfil de Negocio de Google.",
    "bizProfiles.default.referralPresets.credit_both.referrerReward": "$10 de crédito en su cuenta",
    "bizProfiles.default.referralPresets.credit_both.friendReward": "$10 de descuento en su primera compra",
    "bizProfiles.default.referralPresets.credit_both.description":
      "El crédito en la cuenta hace que sigan volviendo; funciona para casi cualquier negocio minorista o basado en transacciones.",
    "bizProfiles.default.referralPresets.pct_off_both.referrerReward": "10% de descuento en su próxima compra",
    "bizProfiles.default.referralPresets.pct_off_both.friendReward": "10% de descuento en su primera compra",
    "bizProfiles.default.referralPresets.pct_off_both.description":
      "Una recompensa simple y entendida por todos para ambas partes.",
    "bizProfiles.default.pricingExamples.example1": "Servicio estándar",
    "bizProfiles.default.pricingExamples.example2": "Visita de servicio",
    "bizProfiles.default.pricingExamples.example3": "Producto/artículo",
    "bizProfiles.default.pricingTips.anchor_pricing.label": "Ancle con su opción de precio más alto",
    "bizProfiles.default.pricingTips.anchor_pricing.description":
      "Mostrar primero su opción de precio más alto hace que su opción de gama media parezca el punto medio razonable, aunque pocos clientes elijan la opción ancla en sí.",
    "bizProfiles.default.pricingTips.good_better_best.label": "Ofrezca un nivel bueno/mejor/premium",
    "bizProfiles.default.pricingTips.good_better_best.description":
      "Una opción básica, una estándar y una premium le dan a los clientes sensibles al precio y a los premium un ajuste natural — un solo precio rara vez es el adecuado para ambos.",
    "bizProfiles.default.pricingTips.raise_when_consistently_busy.label":
      "Suba los precios ante una demanda sostenida, no por corazonada",
    "bizProfiles.default.pricingTips.raise_when_consistently_busy.description":
      "Estar ocupado de forma constante durante semanas — no solo una buena semana — es la señal honesta de que sus precios están por debajo, no cuánto tiempo ha pasado desde su último aumento.",
    "bizProfiles.default.pricingTips.bundle_package.label": "Combine o agrupe trabajos relacionados",
    "bizProfiles.default.pricingTips.bundle_package.description":
      "Combinar servicios o artículos relacionados en un solo precio de paquete puede aumentar su venta promedio sin que el cliente lo sienta como un aumento de precio.",
    "bizProfileOptions.accountant.label": "Contabilidad e impuestos",
    "bizProfileOptions.accountant.competitorNoun": "firmas contables",
    "bizProfileOptions.auto_repair.label": "Reparación de autos",
    "bizProfileOptions.auto_repair.competitorNoun": "talleres mecánicos",
    "bizProfileOptions.bakery.label": "Panadería",
    "bizProfileOptions.bakery.competitorNoun": "panaderías",
    "bizProfileOptions.bar.label": "Bar / cantina",
    "bizProfileOptions.bar.competitorNoun": "bares",
    "bizProfileOptions.barbershop.label": "Barbería",
    "bizProfileOptions.barbershop.competitorNoun": "barberías",
    "bizProfileOptions.cafe.label": "Café / cafetería",
    "bizProfileOptions.cafe.competitorNoun": "cafeterías",
    "bizProfileOptions.cleaning_service.label": "Servicio de limpieza",
    "bizProfileOptions.cleaning_service.competitorNoun": "servicios de limpieza",
    "bizProfileOptions.coach.label": "Coaching",
    "bizProfileOptions.coach.competitorNoun": "coaches",
    "bizProfileOptions.consultant.label": "Consultoría",
    "bizProfileOptions.consultant.competitorNoun": "consultores",
    "bizProfileOptions.dentist.label": "Dentista",
    "bizProfileOptions.dentist.competitorNoun": "consultorios dentales",
    "bizProfileOptions.electrician.label": "Electricidad",
    "bizProfileOptions.electrician.competitorNoun": "electricistas",
    "bizProfileOptions.florist.label": "Floristería",
    "bizProfileOptions.florist.competitorNoun": "floristerías",
    "bizProfileOptions.grocery_market.label": "Supermercado / mercado",
    "bizProfileOptions.grocery_market.competitorNoun": "supermercados",
    "bizProfileOptions.gym_fitness.label": "Gimnasio y estudio de fitness",
    "bizProfileOptions.gym_fitness.competitorNoun": "gimnasios",
    "bizProfileOptions.hardware_store.label": "Ferretería",
    "bizProfileOptions.hardware_store.competitorNoun": "ferreterías",
    "bizProfileOptions.landscaper.label": "Jardinería",
    "bizProfileOptions.landscaper.competitorNoun": "jardineros",
    "bizProfileOptions.lawyer.label": "Bufete de abogados",
    "bizProfileOptions.liquor_store.label": "Licorería y tienda de vinos",
    "bizProfileOptions.liquor_store.competitorNoun": "licorerías",
    "bizProfileOptions.medical_clinic.label": "Consultorio médico / clínica",
    "bizProfileOptions.medical_clinic.competitorNoun": "consultorios médicos",
    "bizProfileOptions.nail_salon.label": "Salón de uñas",
    "bizProfileOptions.nail_salon.competitorNoun": "salones de uñas",
    "bizProfileOptions.pet_services.label": "Servicios para mascotas",
    "bizProfileOptions.pet_services.competitorNoun": "negocios de servicios para mascotas",
    "bizProfileOptions.photographer.label": "Fotografía",
    "bizProfileOptions.photographer.competitorNoun": "fotógrafos",
    "bizProfileOptions.plumber.label": "Plomería",
    "bizProfileOptions.plumber.competitorNoun": "plomeros",
    "bizProfileOptions.real_estate.label": "Bienes raíces",
    "bizProfileOptions.real_estate.competitorNoun": "agencias inmobiliarias",
    "bizProfileOptions.retail_boutique.label": "Tienda / boutique",
    "bizProfileOptions.retail_boutique.competitorNoun": "boutiques",
    "bizProfileOptions.spa.label": "Spa y bienestar",
    "bizProfileOptions.spa.competitorNoun": "spas",
    "bizProfileOptions.tutor_education.label": "Tutoría y educación",
    "bizProfileOptions.tutor_education.competitorNoun": "servicios de tutoría",
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
