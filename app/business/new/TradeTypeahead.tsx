"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { bizProfile, bizProfileById } from "@/config/bizProfiles";
import { searchTrades, tradeLabel, type TradeSearchResult } from "@/lib/tradeSearch";
import { t, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { PlaceDetails } from "@/lib/google/places";

export interface TradePick {
  tradeId: string;
  businessTypeId: string;
}

/**
 * The exact save-time mapping requested by Day 2 step 3: picking a
 * trade saves both business_type_override and trade_id; "Something
 * else" (pick === null) saves both as null, which saveBusiness/
 * saveBusinessWithClient then leave to Google-category auto-detection.
 * Pulled out as its own pure function (used by SaveControl in
 * AddBusinessSearch.tsx) so this mapping is directly testable without
 * touching Supabase.
 */
export function tradePickToSaveFields(pick: TradePick | null): {
  businessTypeOverride: string | null;
  tradeId: string | null;
} {
  return { businessTypeOverride: pick?.businessTypeId ?? null, tradeId: pick?.tradeId ?? null };
}

/** An empty/whitespace-only query never searches — same "no query, no
 * results" honesty searchTrades() itself already documents — kept as
 * its own function (rather than inlined in the component) so the exact
 * locale this passes to searchTrades() is directly testable. */
export function tradeResultsFor(query: string, locale: Locale): TradeSearchResult[] {
  return query.trim() ? searchTrades(query, locale) : [];
}

/**
 * Accessible combobox for picking the specific trade behind a new
 * business's type at intake (Day 2, step 3) — pre-filled with whatever
 * Google's own category auto-detects, searchable against
 * lib/tradeSearch.ts's full trade list, with an explicit "Something
 * else" option that keeps auto-detection rather than forcing a pick.
 *
 * `pick` is owned by the parent (AddBusinessSearch), not this
 * component, so the "Add this business" save step can read it — this
 * component only ever reports a change via `onPickChange`, the same
 * lifted-state pattern the page's language selector already uses.
 *
 * `locale` is the page's own language-selector value (see
 * AddBusinessSearch.tsx), not the fixed dashboard chrome locale this
 * pre-business page otherwise uses for its labels — the business being
 * created will actually operate in whatever language the owner picks
 * there, so trade names and this field's own strings follow it too.
 */
export function TradeTypeahead({
  place,
  locale,
  pick,
  onPickChange,
}: {
  place: PlaceDetails;
  locale: Locale;
  pick: TradePick | null;
  onPickChange: (pick: TradePick | null) => void;
}) {
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const autoDetectedLabel = useMemo(
    () => bizProfile(place.primaryCategory, place.primaryType, locale, place.categories, place.name).label,
    [place.primaryCategory, place.primaryType, place.categories, place.name, locale]
  );

  const committedLabel = pick ? (tradeLabel(pick.tradeId, locale) ?? autoDetectedLabel) : autoDetectedLabel;

  const [value, setValue] = useState(committedLabel);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Keeps the displayed value honest whenever the owner isn't actively
  // typing: on mount, after a selection closes the dropdown, and if the
  // language selector changes (a picked trade's name re-renders in the
  // new language; the auto-detected label does too).
  useEffect(() => {
    if (!isOpen) setValue(committedLabel);
  }, [committedLabel, isOpen]);

  const trimmed = value.trim();
  const results: TradeSearchResult[] = tradeResultsFor(value, locale);
  const somethingElseIndex = results.length;
  const optionCount = results.length + 1;

  function selectTrade(result: TradeSearchResult) {
    onPickChange({ tradeId: result.id, businessTypeId: result.businessTypeId });
    setValue(result.label);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function selectSomethingElse() {
    onPickChange(null);
    setValue(autoDetectedLabel);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function moveActive(delta: number) {
    setActiveIndex((prev) => {
      if (optionCount === 0) return -1;
      if (prev < 0) return delta > 0 ? 0 : optionCount - 1;
      return (prev + delta + optionCount) % optionCount;
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        moveActive(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!isOpen) setIsOpen(true);
        moveActive(-1);
        break;
      case "Enter":
        if (isOpen && activeIndex >= 0) {
          e.preventDefault();
          if (activeIndex === somethingElseIndex) selectSomethingElse();
          else selectTrade(results[activeIndex]);
        }
        break;
      case "Escape":
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
          setActiveIndex(-1);
          setValue(committedLabel);
        }
        break;
      default:
        break;
    }
  }

  return (
    <div className="relative flex flex-col gap-0.5 border-b border-paper-line py-2.5 last:border-b-0">
      <label htmlFor={inputId} className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
        {t(locale, "dashboard.intake.tradeLabel")}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        autoComplete="off"
        value={value}
        onFocus={() => {
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onChange={(e) => {
          setValue(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setIsOpen(false);
          setActiveIndex(-1);
          setValue(committedLabel);
        }}
        className="mt-1 w-full max-w-sm rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
      />
      {!pick && <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.intake.tradeAutoDetectedHelper")}</p>}

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t(locale, "dashboard.intake.tradeLabel")}
          className="absolute left-0 top-full z-10 mt-1 max-h-72 w-full max-w-sm overflow-auto rounded-lg border border-paper-deep bg-white shadow-md"
        >
          {trimmed && results.length === 0 && (
            <li aria-live="polite" className="px-3 py-2.5 text-[13px] text-ink-mute">
              {t(locale, "dashboard.intake.tradeNoMatch")}
            </li>
          )}
          {results.map((result, index) => {
            const typeLabel = bizProfileById(result.businessTypeId, locale)?.label ?? "";
            return (
              <li
                key={result.id}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                // Keeps focus on the input through the click (no blur
                // fires), so the click's own onClick handler — not the
                // input's blur-revert — decides what happens.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectTrade(result)}
                className={cn(
                  "cursor-pointer px-3 py-2.5 text-sm",
                  index === activeIndex ? "bg-paper-line" : "hover:bg-paper"
                )}
              >
                <div className="text-ink">{result.label}</div>
                <div className="text-[11px] text-ink-mute">{typeLabel}</div>
              </li>
            );
          })}
          <li
            id={`${listboxId}-opt-${somethingElseIndex}`}
            role="option"
            aria-selected={somethingElseIndex === activeIndex}
            onMouseDown={(e) => e.preventDefault()}
            onClick={selectSomethingElse}
            className={cn(
              "cursor-pointer border-t border-paper-line px-3 py-2.5 text-sm text-ink-soft",
              somethingElseIndex === activeIndex ? "bg-paper-line" : "hover:bg-paper"
            )}
          >
            {t(locale, "dashboard.intake.tradeSomethingElse")}
          </li>
        </ul>
      )}
    </div>
  );
}
