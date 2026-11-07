"use client";

// Settings → Business type. Closed: the current type as a selected box
// ("✓ Chinese restaurant", "We detected this" / "You chose this") and a
// Change button. Change opens the search (focused) and the list, with
// Cancel to close it untouched. Picking a type saves it, closes at once
// and shows "Saved" for a few seconds; "Use automatic detection" (only
// when the owner chose the type) goes back to what Google's listing
// suggests. Names are the banner's ("Chinese restaurant", not "Chinese").
// It changes who you're compared with — never your PostScore.
//
// The banner's and Competitors' "Change" links add ?change=business-type,
// which opens the picker on arrival.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconCheck } from "@tabler/icons-react";
import { setBusinessNiche, updateCompetitorsForNiche, type UpdateCompetitorsResult } from "@/app/actions/niches";
import { allNiches, nicheById, nicheDisplayName, OPEN_PICKER_PARAM } from "@/lib/niches";
import { getBizProfileOptions } from "@/config/bizProfiles";
import { formatShortDate, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";

export type NicheSource = "owner" | "approved" | "detected";

/** How long the "Saved" confirmation stays before it fades. */
export const SAVED_NOTE_MS = 3000;

/** The note under the selected type. */
export function nicheSourceNoteKey(source: NicheSource): MessageKey {
  return source === "owner" ? "dashboard.niche.youChoseThis" : "dashboard.niche.weDetectedThis";
}

/** "Use automatic detection" only makes sense after the owner chose one. */
export function showResetAuto(source: NicheSource): boolean {
  return source === "owner";
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function NichePicker({
  businessId,
  nicheId,
  source,
  suggestion,
  initialOpen = false,
}: {
  businessId: string;
  nicheId: string;
  source: NicheSource;
  suggestion: string | null;
  /** Tests and the "Change" links: start with the search open. */
  initialOpen?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const timeZone = useTimeZone();
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(nicheId);
  const [currentSource, setCurrentSource] = useState<NicheSource>(source);
  const [status, setStatus] = useState<"idle" | "saved" | "updating" | "not_saved" | "error">("idle");
  const [savedVisible, setSavedVisible] = useState(false);
  const [competitors, setCompetitors] = useState<UpdateCompetitorsResult | null>(null);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const parents = useMemo(() => new Map(getBizProfileOptions(locale).map((o) => [o.id, o.label])), [locale]);

  // Arriving from a "Change" link: open right away.
  useEffect(() => {
    try {
      if (window.location.search.includes(OPEN_PICKER_PARAM)) setOpen(true);
    } catch {
      // No location (never in a browser): stays closed.
    }
  }, []);

  // Opening focuses the search.
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // "Saved" fades after a few seconds.
  useEffect(() => {
    if (status !== "saved") return;
    setSavedVisible(true);
    const timer = setTimeout(() => setSavedVisible(false), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const groups = useMemo(() => {
    const q = norm(query.trim());
    const list = allNiches().filter((n) => {
      if (!q) return true;
      return [n.label.en, n.label.es, nicheDisplayName(n.id, "en"), nicheDisplayName(n.id, "es"), ...n.keywords].some((s) => norm(s).includes(q)) || norm(parents.get(n.parent) ?? "").includes(q);
    });
    const byParent = new Map<string, typeof list>();
    for (const n of list) byParent.set(n.parent, [...(byParent.get(n.parent) ?? []), n]);
    // The business's own type first.
    const currentParent = nicheById(current)?.parent;
    return Array.from(byParent.entries()).sort(([a], [b]) => (a === currentParent ? -1 : b === currentParent ? 1 : 0));
  }, [query, parents, current]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(id: string | null) {
    const before = { current, currentSource };
    // Close at once and show the choice; the save runs behind it.
    close();
    setStatus("idle");
    setCompetitors(null);
    if (id) {
      setCurrent(id);
      setCurrentSource("owner");
    }
    startTransition(async () => {
      const result = await setBusinessNiche(businessId, id);
      if (result.status === "ok") {
        setCurrent(result.nicheId);
        setCurrentSource(id ? "owner" : "detected");
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
        setStatus("not_saved");
        router.refresh();
      } else {
        setCurrent(before.current);
        setCurrentSource(before.currentSource);
        setStatus("error");
      }
    });
  }

  const name = nicheDisplayName(current, locale);
  return (
    <div className="flex flex-col gap-3" data-testid="niche-picker">
      <div>
        <div className="text-[13.5px] font-semibold text-ink">{t(locale, "dashboard.niche.pickerLabel")}</div>
        <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.niche.pickerHelp")}</p>
      </div>

      {/* The selected type, always shown. */}
      <div className="flex flex-wrap items-center gap-3">
        <div data-testid="niche-selected" className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 sm:flex-none sm:min-w-[260px]">
          <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-paper">
            <IconCheck size={13} stroke={3} />
          </span>
          <div className="min-w-0">
            <div className="break-words text-[14px] font-semibold text-ink">{name}</div>
            <div className="text-[12px] text-ink-soft">{t(locale, nicheSourceNoteKey(currentSource))}</div>
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="rounded-full border border-ink px-4 py-1.5 text-[13px] font-semibold text-ink hover:bg-ink hover:text-paper"
          >
            {t(locale, "dashboard.niche.change")}
          </button>
        )}
        <span aria-live="polite" className="text-[12.5px]">
          {status === "updating" && <span className="text-green">{t(locale, "dashboard.niche.savedUpdating")}</span>}
          {status === "saved" && (
            <span data-testid="niche-saved" className={`text-green transition-opacity duration-700 motion-reduce:transition-none ${savedVisible ? "opacity-100" : "opacity-0"}`}>
              {t(locale, "dashboard.niche.saved")}
            </span>
          )}
          {status === "not_saved" && <span className="text-ink-mute">{t(locale, "dashboard.niche.notSaved")}</span>}
          {status === "error" && <span className="text-red">{t(locale, "dashboard.niche.notSaved")}</span>}
        </span>
      </div>

      {open && (
        <div data-testid="niche-picker-open" className="flex flex-col gap-3">
          {suggestion && suggestion !== current && (
            <button type="button" disabled={pending} onClick={() => choose(suggestion)} className="w-fit rounded-full border border-brass bg-brass/10 px-3 py-1 text-[12.5px] font-semibold text-ink">
              {t(locale, "dashboard.niche.suggestedTag")}: {nicheDisplayName(suggestion, locale)}
            </button>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
              }}
              placeholder={t(locale, "dashboard.niche.search")}
              aria-label={t(locale, "dashboard.niche.search")}
              className="min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
            <button type="button" onClick={close} className="shrink-0 text-[13px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
              {t(locale, "dashboard.niche.cancel")}
            </button>
          </div>
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
                      onClick={() => (n.id === current ? close() : choose(n.id))}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-paper ${n.id === current ? "font-semibold text-ink" : "text-ink-soft"}`}
                    >
                      {nicheDisplayName(n.id, locale)}
                      {n.id === current && <IconCheck size={15} aria-hidden className="shrink-0 text-ink" />}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          {showResetAuto(currentSource) && (
            <button type="button" disabled={pending} onClick={() => choose(null)} className="w-fit text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:text-ink hover:underline">
              {t(locale, "dashboard.niche.resetAuto")}
            </button>
          )}
        </div>
      )}

      {competitors && (
        <p className="text-[12.5px] text-ink-soft" data-testid="competitor-update">
          {competitors.status === "updated"
            ? t(locale, "dashboard.niche.competitorsUpdated", { niche: name })
            : competitors.status === "too_soon"
              ? t(locale, "dashboard.niche.competitorsTooSoon", { date: formatShortDate(competitors.nextAvailableAt, locale, timeZone), niche: name })
              : competitors.status === "capped"
                ? t(locale, "dashboard.niche.competitorsCapped", { date: formatShortDate(competitors.nextAvailableAt, locale, timeZone), niche: name })
                : competitors.status === "none_found"
                  ? t(locale, "dashboard.niche.competitorsNone", { niche: name })
                  : competitors.status === "locked"
                    ? t(locale, "dashboard.free.nicheSavedNoScan")
                    : t(locale, "dashboard.niche.competitorsFailed")}
        </p>
      )}
    </div>
  );
}
