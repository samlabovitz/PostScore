"use client";

// One time, after the established-competitor update (lib/competitorQuality.ts):
// "We updated how we pick your competitors…" on the Competitors page and the
// rank card, until the owner taps "Got it" (remembered on the account —
// app/actions/competitors.ts — and on this device).

import { useEffect, useState } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { dismissCompetitorSelectionNote } from "@/app/actions/competitors";
import { SELECTION_NOTE_KEY } from "@/lib/competitorQuality";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const storageKey = (businessId: string) => `postscore:${SELECTION_NOTE_KEY}:${businessId}`;

export function CompetitorSelectionNote({ businessId, compact = false }: { businessId: string; compact?: boolean }) {
  const locale = useLocale();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(businessId)) === "1") setHidden(true);
    } catch {
      // No storage: the account remembers it.
    }
  }, [businessId]);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(storageKey(businessId), "1");
    } catch {
      // Private mode: the account still remembers it.
    }
    void dismissCompetitorSelectionNote(businessId);
  }

  return (
    <div
      role="status"
      data-testid="competitor-selection-note"
      className={cn("flex items-start gap-2 rounded-lg border border-paper-deep bg-paper text-ink", compact ? "mt-3 p-2.5 text-[12px]" : "p-3 text-[13px]")}
    >
      <IconInfoCircle size={compact ? 14 : 16} aria-hidden className="mt-0.5 shrink-0 text-brass" />
      <p className="min-w-0 flex-1 leading-snug">{t(locale, "dashboard.competitors.selectionUpdatedNote")}</p>
      <button type="button" onClick={dismiss} data-testid="competitor-selection-note-ok" className="shrink-0 rounded-md px-2 py-0.5 font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink">
        {t(locale, "dashboard.competitors.selectionUpdatedOk")}
      </button>
    </div>
  );
}
