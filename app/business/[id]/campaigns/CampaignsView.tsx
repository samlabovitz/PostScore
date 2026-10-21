"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconCheck, IconCrown, IconLock } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { HowToRunIt } from "./HowToRunIt";
import { SectionTitle, SoonList, SoonRow } from "@/components/preview/PreviewParts";
import type { BizProfile } from "@/config/bizProfiles";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import type { PromoRow } from "@/lib/promos";
import type { ReferralRow } from "@/lib/referrals";
import type { CardBusiness } from "@/lib/printStudio/design";
import { t, useLocale } from "@/lib/i18n";
import { campaignsTabFromParam, type CampaignsTab } from "@/lib/campaignsTabs";

// The builders generate random codes and read window.location on first
// render — client-only state, so they load with ssr:false (as they did on
// Growth) instead of risking a hydration mismatch.
const loadingCard = () => <Card className="p-8 text-sm text-ink-soft">…</Card>;
const CouponsSection = dynamic(() => import("./CouponsSection").then((m) => m.CouponsSection), { ssr: false, loading: loadingCard });
const ReferralSection = dynamic(() => import("./ReferralSection").then((m) => m.ReferralSection), { ssr: false, loading: loadingCard });
const AllCampaigns = dynamic(() => import("./AllCampaigns").then((m) => m.AllCampaigns), { ssr: false, loading: loadingCard });

export function CampaignsView({
  businessId,
  businessName,
  businessPhone,
  profile,
  initialPromos,
  initialReferral,
  loadFailed = false,
  plan,
  printBusiness,
}: {
  businessId: string;
  businessName: string | null;
  businessPhone: string | null;
  profile: BizProfile;
  initialPromos: PromoRow[];
  initialReferral: ReferralRow | null;
  loadFailed?: boolean;
  plan: Plan;
  printBusiness: CardBusiness | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  // "All campaigns" is the tracking home on Grow and up (where they open);
  // only its email, text and social campaigns are Premium (coming soon).
  const premium = isPremiumPlan(plan);
  const tab = campaignsTabFromParam(searchParams.get("tab"), profile);
  // The running campaigns live here, so a save on a designer tab shows up
  // on All campaigns at once (same rows and actions as before — no data
  // moves).
  const [promos, setPromos] = useState<PromoRow[]>(initialPromos);
  const [referral, setReferral] = useState<ReferralRow | null>(initialReferral);
  // After "Save & start tracking": a toast, and the new one highlighted at
  // the top of All campaigns for a few seconds.
  const [justSaved, setJustSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(null), 5000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);
  const name = businessName ?? t(locale, "dashboard.common.businessNameFallback");
  const hasTools = profile.couponsOk || profile.referralOk;

  function setTab(next: CampaignsTab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    // push (not replace) so back/forward moves between tabs.
    router.push(`/business/${businessId}/campaigns${query ? `?${query}` : ""}`, { scroll: false });
  }

  function saved(id: string) {
    setJustSaved(id);
    setTab("all");
  }

  const options: SegmentedControlOption<CampaignsTab>[] = [{ value: "all", label: t(locale, "dashboard.campaigns.tabAll") }];
  if (profile.couponsOk) options.push({ value: "coupons", label: t(locale, "dashboard.campaigns.tabCoupons") });
  if (profile.referralOk) options.push({ value: "referrals", label: t(locale, "dashboard.campaigns.tabReferrals") });

  // What a printed card may show; a bare fallback if it couldn't load.
  const cardBusiness: CardBusiness = printBusiness ?? { businessName, placeId: null, googleMapsUri: null, website: null, address: null, hours: null, icon: "star" };
  const soon = t(locale, "dashboard.common.comingSoon");
  // Email, text and social: Premium, not built yet — Grow sees the plan.
  const channelStatus = premium ? (
    soon
  ) : (
    <span className="inline-flex items-center gap-1" data-testid="channel-premium">
      <IconLock size={11} aria-hidden className="text-brass" />
      <IconCrown size={11} aria-hidden className="text-brass" />
      {t(locale, "dashboard.settings.plan.name.premium")}
    </span>
  );

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link href={`/business/${businessId}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.common.backTo", { name })}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.campaigns.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.campaigns.subtitle")}</p>
      </div>

      {options.length > 1 && <SegmentedControl options={options} value={tab} onChange={setTab} />}

      {tab === "all" && (
        <div className="flex flex-col gap-6 nav:gap-8">
          {hasTools ? (
            loadFailed ? (
              <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.campaigns.runningError")}</Card>
            ) : (
              <AllCampaigns
                businessName={name}
                businessPhone={businessPhone}
                couponsOk={profile.couponsOk}
                referralOk={profile.referralOk}
                promos={promos}
                referral={referral}
                onPromosChange={setPromos}
                onReferralChange={setReferral}
                highlightId={justSaved}
              />
            )
          ) : (
            <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.campaigns.notForType")}</Card>
          )}
          <section>
            <SectionTitle>{t(locale, "dashboard.campaigns.nextHeading")}</SectionTitle>
            <SoonList>
              <SoonRow title={t(locale, "dashboard.campaigns.email")} body={t(locale, "dashboard.campaigns.emailBody")} status={channelStatus} />
              <SoonRow title={t(locale, "dashboard.campaigns.text")} body={t(locale, "dashboard.campaigns.textBody")} status={channelStatus} />
              <SoonRow title={t(locale, "dashboard.campaigns.social")} body={t(locale, "dashboard.campaigns.socialBody")} status={channelStatus} />
            </SoonList>
          </section>
        </div>
      )}

      {/* Grow: the five-step guide, collapsed, above the designer. */}
      {plan === "grow" && (tab === "coupons" || tab === "referrals") && <HowToRunIt kind={tab} />}

      {tab === "coupons" && (
        <CouponsSection
          businessId={businessId}
          businessName={name}
          businessPhone={businessPhone}
          profile={profile}
          promos={promos}
          plan={plan}
          printBusiness={cardBusiness}
          onStarted={(promo) => {
            setPromos((prev) => [promo, ...prev]);
            saved(promo.id);
          }}
        />
      )}

      {tab === "referrals" && (
        <ReferralSection
          businessId={businessId}
          businessName={name}
          businessPhone={businessPhone}
          profile={profile}
          referral={referral}
          plan={plan}
          printBusiness={cardBusiness}
          onStarted={(row) => {
            setReferral(row);
            saved(row.id);
          }}
        />
      )}
      {justSaved && (
        <div role="status" data-testid="saved-toast" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-card">
          <IconCheck size={15} aria-hidden />
          {t(locale, "dashboard.campaigns.savedToast")}
        </div>
      )}
    </div>
  );
}
