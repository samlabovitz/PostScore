"use client";

// "Who you're compared with" (Competitors page): the business's niche, the
// ranking scope toggle (Automatic · Direct only · Direct + areas I ticked),
// the honest line when Automatic widens, and the saved scan's competitors
// grouped into direct and each "also competes with" area — each area with
// a "Counts for me" tick. Saved scans only: changing anything here never
// calls Google; it just re-ranks what's already saved.

import Link from "next/link";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { setCompetitorAreas, setCompetitorScope } from "@/app/actions/niches";
import { availableAreas, groupCompetitors, scopeNote, type CompetitorScope, type ScopedScan, type ScopeMode } from "@/lib/competitorScope";
import { isGeneralNiche, nicheLabel } from "@/lib/niches";
import type { SavedCompetitorScan } from "@/lib/savedCompetitorScans";
import { t, useLocale } from "@/lib/i18n";

export function CompetitorGroups({
  businessId,
  scan,
  scope,
  scoped,
  enabled,
  onScopeChange,
}: {
  businessId: string;
  scan: SavedCompetitorScan;
  scope: CompetitorScope;
  scoped: ScopedScan;
  /** false until supabase/business-niches.sql is run (choices aren't saved). */
  enabled: boolean;
  onScopeChange: (scope: CompetitorScope) => void;
}) {
  const locale = useLocale();
  const [notSaved, setNotSaved] = useState(false);
  const [, startTransition] = useTransition();
  const general = isGeneralNiche(scope.nicheId);
  const groups = groupCompetitors(scan.entries, scope);
  const areas = availableAreas(scope.nicheId);
  const note = scopeNote(scoped, scope, locale);

  function save(next: CompetitorScope, kind: "mode" | "areas") {
    onScopeChange(next);
    if (!enabled) {
      setNotSaved(true);
      return;
    }
    startTransition(async () => {
      const result = kind === "mode" ? await setCompetitorScope(businessId, next.mode) : await setCompetitorAreas(businessId, next.areas);
      if (result.status === "not_enabled") setNotSaved(true);
    });
  }

  const modes: SegmentedControlOption<ScopeMode>[] = [
    { value: "auto", label: t(locale, "dashboard.competitors.groups.modeAuto") },
    { value: "direct", label: t(locale, "dashboard.competitors.groups.modeDirect") },
    { value: "wide", label: t(locale, "dashboard.competitors.groups.modeWide") },
  ];
  const names = (list: { name: string | null; placeId: string }[]) => list.map((e) => e.name ?? "—").join(" · ");
  const areaLabel = (id: string) => (id === scope.parent ? t(locale, "dashboard.competitors.groups.other") : nicheLabel(id, locale));

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="competitor-groups">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-ink">{t(locale, "dashboard.competitors.groups.heading")}</h2>
        <span className="text-[13px] text-ink-soft">
          {t(locale, "dashboard.competitors.groups.yourType", { niche: nicheLabel(scope.nicheId, locale) })} ·{" "}
          <Link href={`/business/${businessId}/settings#business-type`} className="font-semibold text-ink underline decoration-brass underline-offset-2">
            {t(locale, "dashboard.competitors.groups.change")}
          </Link>
        </span>
      </div>

      {general ? (
        <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.competitors.groups.allSameKind")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{t(locale, "dashboard.competitors.groups.scopeLabel")}</span>
            <SegmentedControl size="sm" options={modes} value={scope.mode} onChange={(mode) => save({ ...scope, mode }, "mode")} />
            {note ? (
              <p className="text-[13px] text-ink" data-testid="scope-note">{note}</p>
            ) : scope.mode === "auto" && scoped.effective === "direct" ? (
              <p className="text-[13px] text-ink-soft">{t(locale, "dashboard.competitors.groups.autoDirect", { count: scoped.directCount })}</p>
            ) : null}
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-ink">
              {t(locale, "dashboard.competitors.groups.direct")} · {groups.direct.length}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-ink-soft">{groups.direct.length > 0 ? names(groups.direct) : t(locale, "dashboard.competitors.groups.noneInScan")}</p>
          </div>

          <div>
            <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{t(locale, "dashboard.competitors.groups.also")}</h3>
            <ul className="flex flex-col divide-y divide-paper-line" data-testid="area-list">
              {areas.map((area) => {
                const list = groups.byArea.get(area) ?? [];
                const ticked = scope.areas.includes(area);
                return (
                  <li key={area} className="flex items-start gap-2.5 py-2">
                    <input
                      type="checkbox"
                      id={`area-${area}`}
                      checked={ticked}
                      onChange={(e) => save({ ...scope, areas: e.target.checked ? [...scope.areas, area] : scope.areas.filter((a) => a !== area) }, "areas")}
                      className="mt-0.5 h-4 w-4 accent-brass"
                      aria-label={`${areaLabel(area)} — ${t(locale, "dashboard.competitors.groups.countsForMe")}`}
                    />
                    <label htmlFor={`area-${area}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="text-[13px] font-medium text-ink">
                        {areaLabel(area)} · {list.length}
                      </span>
                      <span className="block text-[12px] text-ink-mute">{list.length > 0 ? names(list) : t(locale, "dashboard.competitors.groups.noneInScan")}</span>
                    </label>
                    <span className="shrink-0 text-[11.5px] text-ink-mute">{t(locale, "dashboard.competitors.groups.countsForMe")}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.competitors.groups.byName")}</p>
        </>
      )}
      {notSaved && <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.competitors.groups.notSaved")}</p>}
    </Card>
  );
}
