"use client";

import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** "The nearest established bakeries are 11–13 miles away…" — real
 * straight-line distances, no drive times (lib/competitorQuality.ts). */
export function DistanceNote({ note, noun, compact = false }: { note: { min: number; max: number }; noun: string; compact?: boolean }) {
  const locale = useLocale();
  const range = note.min === note.max ? String(note.min) : `${note.min}–${note.max}`;
  return (
    <p data-testid="distance-note" className={cn("text-ink-soft", compact ? "mt-2 text-[12px]" : "mb-3 text-[13px]")}>
      {t(locale, "dashboard.competitors.distanceNote", { noun, range })}
    </p>
  );
}
