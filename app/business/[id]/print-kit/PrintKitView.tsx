"use client";

// Day 25B step 5 (spec §2 Growth, §5): Growth → Print kit & QR — one place
// for every printable: the review QR (+ PNG, free on every plan), the review
// sign (Sign Studio), coupon and referral cards (into their designers) with
// the uses logged on them, and first-time and loyalty cards (Coming soon,
// Day 25D). Free: the review QR only, the rest locked; Grow: basic; Premium:
// the full designers. QR codes open Google or the offer directly, so there
// are no scan counts to show yet — the page says so.

import Link from "next/link";
import { useState } from "react";
import { IconCrown, IconDownload, IconLock, IconArrowRight } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { ReviewQrTile } from "@/app/business/[id]/website-reviews/GetMoreReviews";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { isPremiumPlan, type Plan } from "@/lib/plan";
import { getReviewsHref, offersHref } from "@/lib/routes";
import { t, tPlural, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.printKit.${key}` as MessageKey;

type Level = "free" | "locked" | "basic" | "full" | "soon";

function LevelChip({ level }: { level: Level }) {
  const locale = useLocale();
  if (level === "soon") return <span className="rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>;
  if (level === "locked")
    return (
      <span data-testid="print-kit-locked" className="inline-flex items-center gap-1 rounded-full border border-paper-deep bg-white px-2 py-0.5 text-[11.5px] font-semibold text-ink">
        <IconLock size={11} aria-hidden className="text-brass" />
        {t(locale, "dashboard.settings.plan.name.grow")}
      </span>
    );
  const key = level === "free" ? "level.free" : level === "basic" ? "level.basic" : "level.full";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold", level === "full" ? "bg-[color:color-mix(in_srgb,var(--color-brass)_15%,white)] text-ink" : "bg-paper-deep text-ink-soft")}>
      {level === "full" && <IconCrown size={11} aria-hidden className="text-brass" />}
      {t(locale, K(key))}
    </span>
  );
}

function KitRow({ title, body, level, href, cta, uses, testId }: { title: string; body: string; level: Level; href?: string | null; cta?: string; uses?: string | null; testId: string }) {
  return (
    <li data-testid={testId} data-level={level} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-semibold text-ink">{title}</span>
          <LevelChip level={level} />
        </div>
        <p className="mt-0.5 text-[13px] text-ink-soft">{body}</p>
        {uses && <p className="mt-0.5 text-[12.5px] font-medium text-ink">{uses}</p>}
      </div>
      {href && cta && level !== "soon" && (
        <Link href={href} className="inline-flex w-fit shrink-0 items-center gap-1 rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-soft">
          {cta}
          <IconArrowRight size={14} aria-hidden />
        </Link>
      )}
    </li>
  );
}

export function PrintKitView({
  businessId,
  placeId,
  plan,
  tools,
  uses,
}: {
  businessId: string;
  placeId: string | null;
  plan: Plan;
  /** This business type's offer tools (config/bizProfiles.ts). */
  tools: { couponsOk: boolean; referralOk: boolean };
  /** Uses logged on the running coupons and referral program (never a test offer for a real owner). */
  uses: { coupons: number | null; referrals: number | null };
}) {
  const locale = useLocale();
  const [downloading, setDownloading] = useState(false);
  const free = plan === "free";
  const paidLevel: Level = free ? "locked" : isPremiumPlan(plan) ? "full" : "basic";
  const reviewUrl = placeId ? buildGoogleReviewUrl(placeId) : null;
  const usesLine = (n: number | null) => (n === null ? null : tPlural(locale, "dashboard.printKit.uses", n, { count: n }));

  async function downloadPng() {
    if (!reviewUrl) return;
    setDownloading(true);
    try {
      const { downloadQrPng } = await import("@/lib/signStudio/output");
      await downloadQrPng(reviewUrl);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{t(locale, K("title"))}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">{t(locale, K("subtitle"))}</p>
      </div>

      {/* The review QR: free on every plan. */}
      <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center" data-testid="print-kit-review-qr">
        {reviewUrl ? <ReviewQrTile reviewUrl={reviewUrl} label={t(locale, K("qrLabel"))} /> : <p className="text-sm text-ink-soft">{t(locale, K("noPlaceId"))}</p>}
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, K("reviewQr"))}</h2>
            <LevelChip level="free" />
          </div>
          <p className="text-[13px] text-ink-soft">{t(locale, K("reviewQrBody"))}</p>
          {reviewUrl && (
            <button type="button" onClick={downloadPng} disabled={downloading} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-brass px-3 py-1.5 text-[13px] font-semibold text-ink hover:bg-[#a5772a] disabled:opacity-60">
              <IconDownload size={15} aria-hidden />
              {t(locale, "dashboard.websiteReviews.hero.downloadQr")}
            </button>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <ul className="flex flex-col divide-y divide-paper-line">
          <KitRow testId="print-kit-sign" title={t(locale, K("sign"))} body={t(locale, K("signBody"))} level={paidLevel} href={getReviewsHref(businessId, { hash: "get-more-reviews" })} cta={t(locale, K("openSignStudio"))} />
          {tools.couponsOk && (
            <KitRow testId="print-kit-coupons" title={t(locale, K("coupons"))} body={t(locale, K("couponsBody"))} level={paidLevel} href={offersHref(businessId, "coupons")} cta={t(locale, K("openDesigner"))} uses={free ? null : usesLine(uses.coupons)} />
          )}
          {tools.referralOk && (
            <KitRow testId="print-kit-referrals" title={t(locale, K("referrals"))} body={t(locale, K("referralsBody"))} level={paidLevel} href={offersHref(businessId, "referrals")} cta={t(locale, K("openDesigner"))} uses={free ? null : usesLine(uses.referrals)} />
          )}
          <KitRow testId="print-kit-first-time" title={t(locale, K("firstTime"))} body={t(locale, K("firstTimeBody"))} level="soon" />
          <KitRow testId="print-kit-loyalty" title={t(locale, K("loyalty"))} body={t(locale, K("loyaltyBody"))} level="soon" />
        </ul>
      </Card>

      <p className="text-[12.5px] text-ink-mute" data-testid="print-kit-scans-note">{t(locale, K("scansNote"))}</p>
    </div>
  );
}
