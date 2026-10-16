"use client";

// Day 2b: shown instead of a page that only works with a Google listing
// (Growth, Reviews, Competitors, Pricing, Reports) when the business is
// "website only" — says why, honestly, and points to the one fix. Never
// a fake rating, rank or plan.

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

export type ListingOnlyPage = "growth" | "reviews" | "competitors" | "pricing" | "reports";

const REASON: Record<ListingOnlyPage, MessageKey> = {
  growth: "dashboard.websiteOnly.needsListing.reason.growth",
  reviews: "dashboard.websiteOnly.needsListing.reason.reviews",
  competitors: "dashboard.websiteOnly.needsListing.reason.competitors",
  pricing: "dashboard.websiteOnly.needsListing.reason.pricing",
  reports: "dashboard.websiteOnly.needsListing.reason.reports",
};

export function NeedsGoogleListing({ businessId, page }: { businessId: string; page: ListingOnlyPage }) {
  const locale = useLocale();
  return (
    <Card className="flex flex-col items-start gap-3 p-6">
      <h1 className="font-serif text-xl font-semibold text-ink">{t(locale, "dashboard.websiteOnly.needsListing.title")}</h1>
      <p className="max-w-2xl text-sm text-ink-soft">{t(locale, REASON[page])}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/business/${businessId}#create-google-profile`}
          className="rounded-lg bg-brass px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#a5772a]"
        >
          {t(locale, "dashboard.websiteOnly.needsListing.howTo")}
        </Link>
        <Link
          href={`/business/${businessId}/website`}
          className="rounded-lg border border-paper-deep bg-white px-4 py-2 text-[13px] font-semibold text-ink hover:border-ink-soft"
        >
          {t(locale, "dashboard.websiteOnly.needsListing.website")}
        </Link>
      </div>
    </Card>
  );
}
