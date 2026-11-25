"use client";

// Day 25B step 5 (spec §2 Growth, §3 "Campaigns split"): the new design's
// Campaigns page — only Email, Text messages and Social posts, "Coming soon"
// with today's plan labels (Grow: locked with a Premium chip), and one line
// to Customer offers, where running coupons and referrals now live.

import Link from "next/link";
import { IconCrown, IconLock } from "@tabler/icons-react";
import { SectionTitle, SoonList, SoonRow } from "@/components/preview/PreviewParts";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { offersHref } from "@/lib/routes";
import { t, useLocale } from "@/lib/i18n";

export function CampaignChannels({ businessId, plan }: { businessId: string; plan: Plan }) {
  const locale = useLocale();
  const status = isPremiumPlan(plan) ? (
    t(locale, "dashboard.common.comingSoon")
  ) : (
    <span className="inline-flex items-center gap-1" data-testid="channel-premium">
      <IconLock size={11} aria-hidden className="text-brass" />
      <IconCrown size={11} aria-hidden className="text-brass" />
      {t(locale, "dashboard.settings.plan.name.premium")}
    </span>
  );
  return (
    <div className="flex flex-col gap-6 nav:gap-8" data-testid="campaign-channels">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, "dashboard.campaigns.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, "dashboard.campaigns.channelsSubtitle")}</p>
      </div>
      <section>
        <SectionTitle>{t(locale, "dashboard.campaigns.nextHeading")}</SectionTitle>
        <SoonList>
          <SoonRow title={t(locale, "dashboard.campaigns.email")} body={t(locale, "dashboard.campaigns.emailBody")} status={status} />
          <SoonRow title={t(locale, "dashboard.campaigns.text")} body={t(locale, "dashboard.campaigns.textBody")} status={status} />
          <SoonRow title={t(locale, "dashboard.campaigns.social")} body={t(locale, "dashboard.campaigns.socialBody")} status={status} />
        </SoonList>
      </section>
      <p className="text-[13.5px] text-ink-soft" data-testid="campaigns-offers-line">
        <Link href={offersHref(businessId)} className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
          {t(locale, "dashboard.campaigns.offersLink")}
        </Link>
      </p>
    </div>
  );
}
