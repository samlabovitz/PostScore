"use client";

// Day 2b: the Overview for a business with no Google listing. Only its
// website is scored, and it says so everywhere: "Website score — no
// Google listing", never a PostScore, never a grade, no competitor rank.
// The first fix is always creating a Google Business Profile; linking
// one later turns this into a normal business (same id and history).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconExternalLink, IconRefresh, IconWorld } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { WebsiteCoverageNote } from "@/components/scoring/WebsiteCoverageNote";
import { recheckWebsiteOnlyBusiness } from "@/app/actions/businesses";
import type { CategoryResult, Suggestion } from "@/lib/scoring";
import { formatDateTime, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";

export const GOOGLE_BUSINESS_PROFILE_URL = "https://www.google.com/business/";

const GBP_STEPS: MessageKey[] = [
  "dashboard.websiteOnly.gbp.step1",
  "dashboard.websiteOnly.gbp.step2",
  "dashboard.websiteOnly.gbp.step3",
  "dashboard.websiteOnly.gbp.step4",
  "dashboard.websiteOnly.gbp.step5",
];

export function WebsiteOnlyOverview({
  businessId,
  businessName,
  website,
  websiteCategory,
  websiteFixes,
  checkedAt,
}: {
  businessId: string;
  businessName: string | null;
  website: string | null;
  /** The live Website category — the same checks the Website page shows. */
  websiteCategory: CategoryResult | null;
  /** The website's own losing checks, biggest first. */
  websiteFixes: Suggestion[];
  checkedAt: string | null;
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [recheckNote, setRecheckNote] = useState<string | null>(null);
  const score =
    websiteCategory && websiteCategory.possiblePoints > 0 && websiteCategory.relativeScore !== null
      ? Math.round(websiteCategory.relativeScore)
      : null;

  function recheck() {
    setRecheckNote(null);
    startTransition(async () => {
      const result = await recheckWebsiteOnlyBusiness(businessId);
      if (result.status === "ok") router.refresh();
      else if (result.status === "too_soon") setRecheckNote(t(locale, "dashboard.websiteOnly.tooSoon"));
      else if (result.status === "error") setRecheckNote(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {businessName ?? t(locale, "dashboard.overview.untitledBusiness")}
          </h1>
          <Pill variant="amber">{t(locale, "dashboard.websiteOnly.pill")}</Pill>
        </div>
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex max-w-full items-center gap-1.5 break-all text-[13px] text-ink-soft hover:text-ink"
          >
            <IconWorld size={14} className="shrink-0" />
            {website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.websiteOnly.scoreLabel")}
        </div>
        {score !== null ? (
          <div className="font-serif text-4xl font-semibold text-ink">
            {score}
            <span className="text-lg text-ink-mute">/100</span>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{t(locale, "dashboard.websiteOnly.notChecked")}</p>
        )}
        {websiteCategory && (
          <WebsiteCoverageNote category={websiteCategory} hasWebsite className="text-[12.5px] text-ink-mute" />
        )}
        <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.websiteOnly.notPostScore")}</p>
        <div className="flex flex-wrap items-center gap-3 border-t border-paper-line pt-3">
          <Button size="sm" onClick={recheck} disabled={pending}>
            <IconRefresh size={14} />
            {pending ? t(locale, "dashboard.websiteOnly.rechecking") : t(locale, "dashboard.websiteOnly.recheck")}
          </Button>
          {checkedAt && (
            <span className="text-[12px] text-ink-mute">
              {t(locale, "dashboard.websiteOnly.checkedAt", { date: formatDateTime(checkedAt, locale, timeZone) })}
            </span>
          )}
        </div>
        {recheckNote && <p className="text-[12px] text-ink-soft">{recheckNote}</p>}
      </Card>

      <SectionHeading title={t(locale, "dashboard.websiteOnly.firstFixLabel")} />
      <Card id="create-google-profile" className="flex scroll-mt-20 flex-col gap-3 p-5">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.websiteOnly.gbp.title")}</h2>
        <p className="text-sm text-ink-soft">{t(locale, "dashboard.websiteOnly.gbp.why")}</p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-ink">
          {GBP_STEPS.map((key) => (
            <li key={key}>{t(locale, key)}</li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-3 pt-1">
          <a
            href={GOOGLE_BUSINESS_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brass px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#a5772a]"
          >
            {t(locale, "dashboard.websiteOnly.gbp.open")}
            <IconExternalLink size={14} />
          </a>
          <Link
            href={`/business/new?attach=${businessId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep bg-white px-4 py-2 text-[13px] font-semibold text-ink hover:border-ink-soft"
          >
            {t(locale, "dashboard.websiteOnly.linkListing")}
          </Link>
        </div>
      </Card>

      <SectionHeading title={t(locale, "dashboard.websiteOnly.websiteFixesHeading")} />
      <Card className="flex flex-col gap-3 p-5">
        {websiteFixes.length === 0 ? (
          <p className="text-sm text-ink-soft">{t(locale, "dashboard.websiteOnly.noWebsiteFixes")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-paper-line">
            {websiteFixes.slice(0, 3).map((fix) => (
              <li key={fix.checkId} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-sm font-medium text-ink">{fix.label}</div>
                <p className="text-[13px] text-ink-soft">{fix.advice}</p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/business/${businessId}/website`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink hover:text-brass"
        >
          {t(locale, "dashboard.websiteOnly.websiteFixesLink")}
          <IconArrowRight size={14} />
        </Link>
      </Card>
    </div>
  );
}
