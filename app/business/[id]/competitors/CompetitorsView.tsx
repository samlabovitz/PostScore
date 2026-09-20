"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconStar, IconMessageCircle, IconWorld, IconWorldOff, IconMapPin } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { cn } from "@/lib/utils";
import { saveCompetitorScan } from "@/app/actions/competitors";
import type { CompetitorScanResult, RankedCompetitor } from "@/lib/competitors";
import { t, tPlural, useLocale, type Locale } from "@/lib/i18n";

function milesLabel(meters: number, locale: Locale): string {
  const mi = meters / 1609.34;
  return `${mi < 0.1 ? "<0.1" : mi.toFixed(1)}${t(locale, "dashboard.competitors.milesSuffix")}`;
}

function SignalChips({ entry }: { entry: RankedCompetitor }) {
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill variant="neutral" className="gap-1">
        <IconStar size={12} className={entry.rating !== null ? "text-brass" : "text-ink-mute"} />
        {entry.rating !== null ? entry.rating.toFixed(1) : t(locale, "dashboard.competitors.noRating")}
      </Pill>
      <Pill variant="neutral" className="gap-1">
        <IconMessageCircle size={12} />
        {entry.reviewCount !== null
          ? tPlural(locale, "dashboard.competitors.reviewCount", entry.reviewCount, {
              count: entry.reviewCount.toLocaleString(),
            })
          : t(locale, "dashboard.competitors.noReviewCount")}
      </Pill>
      <Pill variant={entry.hasWebsite ? "green" : "amber"} className="gap-1">
        {entry.hasWebsite ? <IconWorld size={12} /> : <IconWorldOff size={12} />}
        {entry.hasWebsite ? t(locale, "dashboard.competitors.hasWebsite") : t(locale, "dashboard.competitors.noWebsite")}
      </Pill>
      {entry.distanceMeters !== null && (
        <Pill variant="neutral" className="gap-1">
          <IconMapPin size={12} />
          {milesLabel(entry.distanceMeters, locale)}
        </Pill>
      )}
    </div>
  );
}

function RankedRow({ entry, rank }: { entry: RankedCompetitor; rank: number }) {
  const locale = useLocale();
  const row = (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        entry.isSubject
          ? "border-brass bg-brass/[.06]"
          : "border-paper-deep bg-white"
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-serif text-sm font-semibold",
            entry.isSubject ? "bg-brass text-white" : "bg-paper-deep text-ink-soft"
          )}
        >
          {rank}
        </span>
        <GradeBadge grade={entry.breakdown.grade} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">{entry.name}</span>
            {entry.isSubject && (
              <Pill variant="brass" className="shrink-0">
                {t(locale, "dashboard.competitors.yourBusiness")}
              </Pill>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-mute">
            {entry.address ?? t(locale, "dashboard.competitors.noAddress")}
          </div>
          <div className="mt-2">
            <SignalChips entry={entry} />
          </div>
        </div>
      </div>
      <div className="text-right sm:pl-3">
        <div className="font-serif text-2xl font-bold text-ink">{entry.breakdown.total}</div>
        <div className="text-[11px] uppercase tracking-[0.06em] text-ink-mute">
          {t(locale, "dashboard.competitors.postscoreOutOf100")}
        </div>
      </div>
    </div>
  );

  if (entry.googleMapsUri) {
    return (
      <a href={entry.googleMapsUri} target="_blank" rel="noreferrer" className="block">
        {row}
      </a>
    );
  }
  return row;
}

function SaveScanControl({ businessId }: { businessId: string }) {
  const locale = useLocale();
  const router = useRouter();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    const result = await saveCompetitorScan(businessId);
    if (result.status === "saved") {
      setState({ kind: "saved" });
      router.refresh();
    } else if (result.status === "no_data") {
      setState({ kind: "error", message: t(locale, "dashboard.competitors.noComparableCompetitors") });
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: t(locale, "dashboard.competitors.saveError") });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="brass" size="sm" onClick={handleSave} disabled={state.kind === "saving"}>
        {state.kind === "saving" ? t(locale, "dashboard.competitors.savingScan") : t(locale, "dashboard.competitors.saveScan")}
      </Button>
      {state.kind === "saved" && <span className="text-sm text-green">{t(locale, "dashboard.competitors.saved")}</span>}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

export function CompetitorsView({
  businessId,
  businessName,
  competitorNoun,
  result,
}: {
  businessId: string;
  businessName: string | null;
  /** The resolved business-type profile's noun, e.g. "salons" — see config/bizProfiles.ts. */
  competitorNoun: string;
  result: CompetitorScanResult;
}) {
  const locale = useLocale();
  const competitorCount = result.ranked.filter((r) => !r.isSubject).length;

  const categoryClause = result.categoryLabel
    ? t(locale, "dashboard.competitors.categoryClause", { categoryLabel: result.categoryLabel })
    : "";
  const subtitle = t(locale, "dashboard.competitors.subtitle", { competitorNoun, categoryClause });

  const rankSuffix = result.subjectRank
    ? t(locale, "dashboard.competitors.rankSuffix", { rank: result.subjectRank, total: result.ranked.length })
    : "";
  const rankedHeading = t(locale, "dashboard.competitors.rankedHeading", { rankSuffix });

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div>
        <Link
          href={`/business/${businessId}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
        >
          <IconArrowLeft size={15} />
          {t(locale, "dashboard.competitors.backTo", {
            name: businessName ?? t(locale, "dashboard.competitors.businessFallback"),
          })}
        </Link>
        <h1 className="mt-2 font-serif text-2xl font-semibold text-ink nav:text-[27px]">
          {t(locale, "dashboard.competitors.title")}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      </div>

      <Card className="p-4 text-sm text-ink-soft">{result.message}</Card>

      {result.status === "ok" && result.ranked.length > 0 && (
        <>
          <SectionHeading title={rankedHeading} action={<SaveScanControl businessId={businessId} />} />
          <div className="flex flex-col gap-3">
            {result.ranked.map((entry, i) => (
              <RankedRow key={entry.placeId} entry={entry} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {result.unscored.length > 0 && (
        <>
          <SectionHeading title={t(locale, "dashboard.competitors.unscoredHeading")} />
          <Card className="p-5">
            <div className="flex flex-col divide-y divide-paper-line">
              {result.unscored.map((u) => (
                <div key={u.placeId} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-sm font-medium text-ink">{u.name}</div>
                    <div className="mt-0.5 text-[12px] text-ink-mute">
                      {u.address ?? t(locale, "dashboard.competitors.noAddress")} · {milesLabel(u.distanceMeters, locale)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-mute">{u.reason}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {result.status === "ok" && competitorCount === 0 && result.unscored.length === 0 && (
        <Card className="p-5 text-sm text-ink-soft">
          {t(locale, "dashboard.competitors.nothingToCompare", {
            total: result.ranked[0]?.breakdown.total ?? "—",
          })}
        </Card>
      )}
    </div>
  );
}
