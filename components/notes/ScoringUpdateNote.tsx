"use client";

// Once, after the first v1.12.0 scan: "We updated how PostScore scores
// reviews and your listing…" — until "Got it" (remembered on the account,
// app/actions/oneTimeNotes.ts, and on this device).

import { useEffect, useState } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import { dismissOneTimeNote } from "@/app/actions/oneTimeNotes";
import { SCORING_NOTE_KEY } from "@/lib/scoringUpdateNote";
import { t, useLocale } from "@/lib/i18n";

const storageKey = (businessId: string) => `postscore:${SCORING_NOTE_KEY}:${businessId}`;

export function ScoringUpdateNote({ businessId }: { businessId: string }) {
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
    void dismissOneTimeNote(businessId, SCORING_NOTE_KEY);
  }

  return (
    <div role="status" data-testid="scoring-update-note" className="flex items-start gap-2 rounded-lg border border-paper-deep bg-paper p-3 text-[13px] text-ink">
      <IconInfoCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-brass" />
      <p className="min-w-0 flex-1 leading-snug">{t(locale, "dashboard.overview.scoringUpdateNote")}</p>
      <button type="button" onClick={dismiss} data-testid="scoring-update-note-ok" className="shrink-0 rounded-md px-2 py-0.5 font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink">
        {t(locale, "dashboard.competitors.selectionUpdatedOk")}
      </button>
    </div>
  );
}
