"use client";

// Day 25B step 5 (spec §2 Growth, §3 "Campaigns split"): Customer offers —
// opens on Running now (code, start, times used, +1, Share, End) with the
// tracking summary on top, then the Coupons and Referrals designers. First-
// time customers and Loyalty programs are "Coming soon" until Day 25D. Test
// offers are never listed or counted (lib/offers.server.ts), except for the
// dev test login's own, tagged "Test account".

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { HowToRunIt } from "@/app/business/[id]/campaigns/HowToRunIt";
import type { BizProfile } from "@/config/bizProfiles";
import type { Plan } from "@/lib/plan";
import type { PromoRow } from "@/lib/promos";
import type { ReferralRow } from "@/lib/referrals";
import type { CardBusiness } from "@/lib/printStudio/design";
import type { OfferSummary } from "@/lib/offerTesting";
import { campaignsPageHref, offersHref, type OffersTab } from "@/lib/routes";
import { formatShortDate, t, tPlural, useLocale, useTimeZone } from "@/lib/i18n";

const loadingCard = () => <Card className="p-8 text-sm text-ink-soft">…</Card>;
const CouponsSection = dynamic(() => import("@/app/business/[id]/campaigns/CouponsSection").then((m) => m.CouponsSection), { ssr: false, loading: loadingCard });
const ReferralSection = dynamic(() => import("@/app/business/[id]/campaigns/ReferralSection").then((m) => m.ReferralSection), { ssr: false, loading: loadingCard });
const AllCampaigns = dynamic(() => import("@/app/business/[id]/campaigns/AllCampaigns").then((m) => m.AllCampaigns), { ssr: false, loading: loadingCard });

/** ?tab= → the open tab ("running" by default; a designer only when this business type has it). */
export function offersTabFromParam(param: string | null | undefined, tools: { couponsOk: boolean; referralOk: boolean }): OffersTab {
  if (param === "coupons" && tools.couponsOk) return "coupons";
  if ((param === "referrals" || param === "referral") && tools.referralOk) return "referrals";
  if (param === "first-time" || param === "loyalty") return param;
  return "all";
}

export function OffersView({
  businessId,
  businessName,
  businessPhone,
  profile,
  initialPromos,
  initialReferral,
  summary,
  testAccount = false,
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
  summary: OfferSummary;
  /** The dev test login: its own test offers are listed and counted, tagged. */
  testAccount?: boolean;
  loadFailed?: boolean;
  plan: Plan;
  printBusiness: CardBusiness | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = offersTabFromParam(searchParams.get("tab"), profile);
  const [promos, setPromos] = useState<PromoRow[]>(initialPromos);
  const [referral, setReferral] = useState<ReferralRow | null>(initialReferral);
  // A new offer counts at once in the summary (started now, no uses yet).
  const [started, setStarted] = useState(0);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(null), 5000);
    return () => window.clearTimeout(timer);
  }, [justSaved]);
  const name = businessName ?? t(locale, "dashboard.common.businessNameFallback");
  const hasTools = profile.couponsOk || profile.referralOk;

  function setTab(next: OffersTab) {
    router.push(offersHref(businessId, next), { scroll: false });
  }
  function saved(id: string) {
    setStarted((n) => n + 1);
    setJustSaved(id);
    setTab("all");
  }

  const options: SegmentedControlOption<OffersTab>[] = [{ value: "all", label: t(locale, "dashboard.offers.tab.running") }];
  if (profile.couponsOk) options.push({ value: "coupons", label: t(locale, "dashboard.campaigns.tabCoupons") });
  if (profile.referralOk) options.push({ value: "referrals", label: t(locale, "dashboard.campaigns.tabReferrals") });
  options.push({ value: "first-time", label: t(locale, "dashboard.offers.tab.firstTime") }, { value: "loyalty", label: t(locale, "dashboard.offers.tab.loyalty") });

  const cardBusiness: CardBusiness = printBusiness ?? { businessName, placeId: null, googleMapsUri: null, website: null, address: null, hours: null, icon: "star" };
  const count = summary.count + started;

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.offers.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.offers.subtitle")}</p>
      </div>

      <SegmentedControl options={options} value={tab} onChange={setTab} />

      {tab === "all" && (
        <div className="flex flex-col gap-4">
          {/* Offer tracking (moved off the Growth plan): never a test offer for a real owner. */}
          <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 sm:p-5" data-testid="offers-summary">
            <span className="text-[14px] font-semibold text-ink">
              {count === 0
                ? t(locale, "dashboard.offers.summary.none")
                : `${
                    summary.since
                      ? tPlural(locale, "dashboard.offers.summary.started", count, { count, date: formatShortDate(summary.since, locale, timeZone) })
                      : tPlural(locale, "dashboard.offers.summary.startedToday", count, { count })
                  } · ${tPlural(locale, "dashboard.offers.summary.uses", summary.uses, { uses: summary.uses })}`}
            </span>
            {testAccount && (
              <span data-testid="offers-test-account" className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                {t(locale, "dashboard.nav.testAccount")}
              </span>
            )}
          </Card>
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
                emptyKey="dashboard.offers.noneRunning"
              />
            )
          ) : (
            <Card className="p-5 text-sm text-ink-soft">{t(locale, "dashboard.campaigns.notForType")}</Card>
          )}
          <p className="text-[13px] text-ink-soft">
            {t(locale, "dashboard.offers.campaignsLine")}{" "}
            <Link href={campaignsPageHref(businessId)} className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
              {t(locale, "dashboard.offers.campaignsLink")}
            </Link>
          </p>
        </div>
      )}

      {plan !== "free" && (tab === "coupons" || tab === "referrals") && <HowToRunIt kind={tab} />}

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

      {(tab === "first-time" || tab === "loyalty") && (
        <Card className="flex flex-col gap-2 p-5" data-testid={`offers-soon-${tab}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, tab === "first-time" ? "dashboard.offers.tab.firstTime" : "dashboard.offers.tab.loyalty")}</h2>
            <span className="rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>
          </div>
          <p className="text-[13.5px] text-ink-soft">{t(locale, tab === "first-time" ? "dashboard.offers.firstTimeBody" : "dashboard.offers.loyaltyBody")}</p>
        </Card>
      )}

      {justSaved && (
        <div role="status" data-testid="saved-toast" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white shadow-card">
          <IconCheck size={15} aria-hidden />
          {t(locale, "dashboard.offers.savedToast")}
        </div>
      )}
    </div>
  );
}
