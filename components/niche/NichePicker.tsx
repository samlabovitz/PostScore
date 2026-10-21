"use client";

// Settings → Business type: a searchable list of every niche, grouped by
// type. Picking one saves it (and its type); "Use automatic detection"
// goes back to what Google's listing suggests. It changes who you're
// compared with — never your PostScore.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBusinessNiche, updateCompetitorsForNiche, type UpdateCompetitorsResult } from "@/app/actions/niches";
import { allNiches, nicheById, nicheLabel } from "@/lib/niches";
import { getBizProfileOptions } from "@/config/bizProfiles";
import { formatShortDate, t, useLocale, useTimeZone } from "@/lib/i18n";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function NichePicker({
  businessId,
  nicheId,
  source,
  suggestion,
}: {
  businessId: string;
  nicheId: string;
  source: "owner" | "approved" | "detected";
  suggestion: string | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(nicheId);
  const [status, setStatus] = useState<"idle" | "saved" | "updating" | "not_saved" | "error">("idle");
  const [competitors, setCompetitors] = useState<UpdateCompetitorsResult | null>(null);
  const timeZone = useTimeZone();
  const [pending, startTransition] = useTransition();
  const parents = useMemo(() => new Map(getBizProfileOptions(locale).map((o) => [o.id, o.label])), [locale]);

  const groups = useMemo(() => {
    const q = norm(query.trim());
    const list = allNiches().filter((n) => {
      if (!q) return true;
      return [n.label.en, n.label.es, ...n.keywords].some((s) => norm(s).includes(q)) || norm(parents.get(n.parent) ?? "").includes(q);
    });
    const byParent = new Map<string, typeof list>();
    for (const n of list) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
    // The business's own type first.
    const currentParent = nicheById(current)?.parent;
    return Array.from(byParent.entries()).sort(([a], [b]) => (a === currentParent ? -1 : b === currentParent ? 1 : 0));
  }, [query, parents, current]);

  function choose(id: string | null) {
    startTransition(async () => {
      setCompetitors(null);
      const result = await setBusinessNiche(businessId, id);
      if (result.status === "ok") {
        setCurrent(result.nicheId);
        if (!result.changed) {
          setStatus("saved");
          return;
        }
        // Saved at once; then ONE competitor search for the new type.
        setStatus("updating");
        const update = await updateCompetitorsForNiche(businessId);
        setCompetitors(update);
        setStatus("saved");
        router.refresh();
      } else if (result.status === "not_enabled") {
        if (id) setCurrent(id);
        setStatus("not_saved");
        router.refresh();
      } else setStatus("error");
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="niche-picker">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.niche.pickerLabel")}</div>
        <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.niche.pickerHelp")}</p>
      </div>
      <p className="text-[13px] text-ink">
        {t(locale, "dashboard.niche.current", { niche: nicheLabel(current, locale) })}{" "}
        <span className="text-ink-mute">{source === "owner" && current === nicheId ? t(locale, "dashboard.niche.yours") : t(locale, "dashboard.niche.detected")}</span>
      </p>
      {suggestion && suggestion !== current && (
        <button type="button" disabled={pending} onClick={() => choose(suggestion)} className="w-fit rounded-full border border-brass bg-brass/10 px-3 py-1 text-[12.5px] font-semibold text-ink">
          {t(locale, "dashboard.niche.suggestedTag")}: {nicheLabel(suggestion, locale)}
        </button>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t(locale, "dashboard.niche.search")}
        aria-label={t(locale, "dashboard.niche.search")}
        className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
      />
      <div className="max-h-80 overflow-y-auto rounded-lg border border-paper-line bg-white" role="listbox" aria-label={t(locale, "dashboard.niche.pickerLabel")}>
        {groups.length === 0 ? (
          <p className="p-3 text-[13px] text-ink-mute">{t(locale, "dashboard.niche.noMatches")}</p>
        ) : (
          groups.map(([parent, list]) => (
            <div key={parent}>
              <div className="sticky top-0 bg-paper px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{parents.get(parent) ?? parent}</div>
              {list.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="option"
                  aria-selected={n.id === current}
                  disabled={pending}
                  onClick={() => choose(n.id)}
                  className={`block w-full px-3 py-2 text-left text-[13.5px] hover:bg-paper ${n.id === current ? "font-semibold text-ink" : "text-ink-soft"}`}
                >
                  {n.label[locale]}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={() => choose(null)} className="text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
          {t(locale, "dashboard.niche.resetAuto")}
        </button>
        {status === "saved" && !competitors && <span className="text-[12.5px] text-green">{t(locale, "dashboard.niche.saved")}</span>}
        {(status === "updating" || competitors) && (
          <span className="text-[12.5px] text-green" role="status">
            {t(locale, "dashboard.niche.savedUpdating")}
          </span>
        )}
        {status === "not_saved" && <span className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.niche.notSaved")}</span>}
        {status === "error" && <span className="text-[12.5px] text-red">{t(locale, "dashboard.niche.notSaved")}</span>}
      </div>
      {competitors && (
        <p className="text-[12.5px] text-ink-soft" data-testid="competitor-update">
          {competitors.status === "updated"
            ? t(locale, "dashboard.niche.competitorsUpdated", { niche: nicheLabel(current, locale) })
            : competitors.status === "too_soon"
              ? t(locale, "dashboard.niche.competitorsTooSoon", { date: formatShortDate(competitors.nextAvailableAt, locale, timeZone), niche: nicheLabel(current, locale) })
              : competitors.status === "capped"
                ? t(locale, "dashboard.niche.competitorsCapped", { date: formatShortDate(competitors.nextAvailableAt, locale, timeZone), niche: nicheLabel(current, locale) })
                : competitors.status === "none_found"
                  ? t(locale, "dashboard.niche.competitorsNone", { niche: nicheLabel(current, locale) })
                  : competitors.status === "locked"
                    ? t(locale, "dashboard.free.nicheSavedNoScan")
                    : t(locale, "dashboard.niche.competitorsFailed")}
        </p>
      )}
    </div>
  );
}
