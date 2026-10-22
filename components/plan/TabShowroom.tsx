"use client";

// A locked tab's SHOWROOM (Free only — lib/freeTabs.ts): one screen with
// the tab's name, ONE "With Grow | Premium adds" card (the page's only plan
// comparison — no promo cards at the bottom), and the tab's
// sections as LockedPreviews built from the business's real counts — the
// advice itself is never in the page. The Grow + Premium cards come from
// the shell (components/upgrade/PromoCards). No data loads here beyond
// the promo facts, and nothing makes a paid call.

import Link from "next/link";
import { IconArrowLeft, IconBrandGoogle, IconCheck, IconCrown, IconLock, IconQrcode, IconTicket, IconUsers } from "@tabler/icons-react";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { NO_FACTS, unlockLine } from "@/lib/upgradePromos";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { SHOWROOM_NAV, type ShowroomTab } from "@/lib/freeTabs";
import { LockedPreview } from "@/components/plan/LockedPreview";
import { useUpgrade } from "@/components/upgrade/UpgradeContext";
import { fixesSummary } from "@/components/overview/FreeOverview";
import dynamic from "next/dynamic";
import { DesignerPreview } from "./DesignerPreview";
import { GUIDE_STEPS } from "@/app/business/[id]/campaigns/HowToRunIt";
import { GetMoreReviews } from "@/app/business/[id]/website-reviews/GetMoreReviews";
import { MAX_ACTIVE_PROMOS } from "@/lib/promos";
import { MAX_ACTIVE_REFERRALS } from "@/lib/referrals";
import { PASS_ON, type CardBusiness } from "@/lib/printStudio/design";
import type { BizProfile } from "@/config/bizProfiles";
import type { ReviewsPageData } from "@/app/actions/reviews";

const S = (key: string) => `dashboard.free.showroom.${key}` as MessageKey;

/** "With Grow" per tab. */
const GROW_BULLETS: Record<ShowroomTab, string[]> = {
  growth: ["g1", "g2", "g3"],
  campaigns: ["g1", "g2", "g3", "g4"],
  reviews: ["g1", "g2", "g3"],
  pricing: ["g1", "g2", "g3"],
  reports: ["g1", "g2", "g3"],
};

/** "Premium adds" per tab (anything not built says "coming soon"). */
const PREMIUM_ADDS: Record<ShowroomTab, string[]> = {
  growth: ["p1", "p2", "p3"],
  campaigns: ["p1", "p3"],
  reviews: ["p1", "p2"],
  pricing: ["p1"],
  reports: ["p1"],
};

/** The weekly routine always has its five habits (lib/weeklyChecklist.ts). */
const ROUTINE_HABITS = 5;

export interface ShowroomData {
  businessName: string;
  /** Campaigns: what the real designers need (null when not loaded). */
  designer: ShowroomDesigner | null;
  /** Reviews: the real review link / QR / sign designer's data. */
  reviews: ReviewsPageData | null;
}

export interface ShowroomDesigner {
  profile: BizProfile;
  printBusiness: CardBusiness;
  businessPhone: string | null;
}

// The designers generate codes and read the browser on first render —
// client-only, as on the Campaigns page.
const CouponBuilder = dynamic(() => import("@/app/business/[id]/campaigns/CouponBuilder").then((m) => m.CouponBuilder), { ssr: false });
const ReferralBuilder = dynamic(() => import("@/app/business/[id]/campaigns/ReferralBuilder").then((m) => m.ReferralBuilder), { ssr: false });
const noStart = async () => ({ status: "error" as const, message: "" });

function Sections({ tab, businessId, data }: { tab: ShowroomTab; businessId: string; data: ShowroomData }) {
  const locale = useLocale();
  const f = useUpgrade()?.facts ?? NO_FACTS;
  const line = (id: Parameters<typeof unlockLine>[0]) => unlockLine(id, f, locale);
  switch (tab) {
    case "growth":
      return (
        <>
          {/* Google Profile (Premium, coming soon) first, then the Grow sections. */}
          <LockedPreview icon={IconBrandGoogle} title={t(locale, "dashboard.free.tile.google")} unlock={line("connect")} feature="googleProfile" soon rows={2} />
          <LockedPreview title={t(locale, "dashboard.free.actionPlanTitle")} summary={fixesSummary(f.issueCount ?? 0, f.fixPoints, locale)} unlock={line("plan")} rows={4} />
          <LockedPreview title={t(locale, "dashboard.growth.checklist.sectionHeading")} summary={t(locale, "dashboard.free.sumHabits", { count: ROUTINE_HABITS })} unlock={line("routine")} />
          <LockedPreview title={t(locale, "dashboard.growth.moves.sectionHeading")} unlock={line("tools")} shape="card" />
        </>
      );
    case "campaigns":
      return (
        <>
          {/* All campaigns: tracking is Grow; only email, text and social are Premium. */}
          <LockedPreview title={t(locale, "dashboard.campaigns.tabAll")} unlock={line("tracking")} rows={2} />
          <LockedPreview compact title={t(locale, "dashboard.campaigns.channelsTitle")} unlock={line("hub")} feature="campaignHub" soon />
          <LockedPreview
            title={t(locale, "dashboard.campaigns.guide.heading")}
            labels={GUIDE_STEPS.map((s) => t(locale, `dashboard.campaigns.guide.${s}` as MessageKey))}
            unlock={line("campaignGuides")}
          />
          {data.designer?.profile.couponsOk && (
            <DesignerPreview icon={IconTicket} title={t(locale, "dashboard.free.designer.coupon")} description={t(locale, "dashboard.overview.growBanner.tools.coupons.desc")}>
              <CouponBuilder
                preview
                businessId={businessId}
                plan="grow"
                printBusiness={data.designer.printBusiness}
                businessName={data.businessName}
                businessPhone={data.designer.businessPhone}
                profile={data.designer.profile}
                activeCount={0}
                maxActive={MAX_ACTIVE_PROMOS}
                onStart={noStart as never}
              />
            </DesignerPreview>
          )}
          {data.designer?.profile.referralOk && (
            <DesignerPreview icon={IconUsers} title={t(locale, "dashboard.free.designer.referral")} description={t(locale, "dashboard.overview.growBanner.tools.referral.desc")}>
              <ReferralBuilder
                preview
                businessId={businessId}
                passOn={PASS_ON[0]}
                onPassOnChange={() => undefined}
                plan="grow"
                printBusiness={data.designer.printBusiness}
                businessName={data.businessName}
                profile={data.designer.profile}
                activeCount={0}
                maxActive={MAX_ACTIVE_REFERRALS}
                onStart={noStart as never}
              />
            </DesignerPreview>
          )}
        </>
      );
    case "reviews":
      return (
        <>
          <Link href={`/business/${businessId}#free-reviews`} className="w-fit text-[13.5px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
            {t(locale, S("reviewLinkOnOverview"))}
          </Link>
          <LockedPreview
            title={t(locale, "dashboard.websiteReviews.guide.heading")}
            labels={["whenTitle", "scriptTitle", "whereTitle"].map((k) => t(locale, `dashboard.websiteReviews.guide.${k}` as MessageKey))}
            unlock={line("reviews") ?? line("plan")}
          />
          {data.reviews && (
            <DesignerPreview feature="reviewSign" icon={IconQrcode} title={t(locale, "dashboard.free.designer.sign")} description={t(locale, "dashboard.free.designer.signDesc")}>
              <GetMoreReviews
                showroom
                businessId={businessId}
                businessName={data.reviews.businessName}
                placeId={data.reviews.placeId}
                verifiedSocials={data.reviews.verifiedSocials}
                plan="grow"
              />
            </DesignerPreview>
          )}
        </>
      );
    case "pricing":
      return (
        <>
          <LockedPreview title={t(locale, S("priceCheck"))} unlock={line("priceCheck")} shape="card" />
          <LockedPreview title={t(locale, S("priceTips"))} unlock={line("priceTips")} />
        </>
      );
    case "reports":
      return (
        <>
          <LockedPreview title={t(locale, S("weeklyRecap"))} unlock={line("weeklyRecap")} />
          <LockedPreview title={t(locale, S("pdfReports"))} unlock={line("pdfReports")} feature="premium" shape="card" />
        </>
      );
  }
}

export function TabShowroom({
  tab,
  businessId,
  businessName,
  designer = null,
  reviews = null,
}: {
  tab: ShowroomTab;
  businessId: string;
  businessName: string | null;
  designer?: ShowroomDesigner | null;
  reviews?: ReviewsPageData | null;
}) {
  const locale = useLocale();
  const name = businessName ?? t(locale, "dashboard.common.businessNameFallback");
  return (
    <div data-testid="tab-showroom" data-tab={tab} className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link href={`/business/${businessId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
          <IconArrowLeft size={15} />
          {t(locale, S("backToAudit"))}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, SHOWROOM_NAV[tab])}</h1>
          <span data-testid="showroom-chip" className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2.5 py-0.5 text-[12px] font-semibold text-ink">
            <IconLock size={12} aria-hidden className="text-brass" />
            {t(locale, S("chip"))}
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, S("subtitle"), { name })}</p>
      </div>

      {/* With Grow | Premium adds — stacked on a phone; both buttons under it. */}
      <section data-testid="showroom-plans" className="flex flex-col gap-4 rounded-2xl border border-paper-deep bg-white p-4 shadow-card sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, S("withGrow"))}</h2>
            <ul className="mt-2 flex flex-col gap-1.5" data-testid="showroom-grow">
              {GROW_BULLETS[tab].map((b) => (
                <li key={b} className="flex items-start gap-2 text-[14px] text-ink">
                  <IconCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-green" />
                  {t(locale, S(`${tab}.${b}`))}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)] p-3">
            <span className="absolute -top-2.5 right-3 rounded-full bg-ink px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white">{t(locale, "dashboard.settings.plans.bestValue")}</span>
            <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-ink">
              <IconCrown size={14} aria-hidden className="text-brass" />
              {t(locale, S("premiumAdds"))}
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5" data-testid="showroom-premium">
              {PREMIUM_ADDS[tab].map((b) => (
                <li key={b} className="flex items-start gap-2 text-[14px] text-ink">
                  <IconCrown size={15} aria-hidden className="mt-0.5 shrink-0 text-brass" />
                  {t(locale, S(`${tab}.${b}`))}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <UpgradeTrigger feature="grow" variant="pair" />
      </section>

      {/* ≥32px and a thin rule between sections, so each designer reads as its own. */}
      <div className="flex flex-col gap-6 divide-y divide-paper-line [&>*+*]:pt-6">
        <Sections tab={tab} businessId={businessId} data={{ businessName: name, designer, reviews }} />
      </div>
    </div>
  );
}
