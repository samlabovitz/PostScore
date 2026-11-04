// The one-time "We updated how PostScore scores …" note on the Overview —
// one per scoring version (v1.12.0 reviews and listing; v1.13.0 the
// website's speed and phone checks). Pure.

import type { MessageKey } from "@/lib/i18n";

/** lib/scoring.ts SCORING_VERSION (kept here so the browser never loads
 * the scoring engine for a note; a test keeps them equal). */
export const SCORING_NOTE_VERSION = "1.13.0";

/** The note's dismissal key (promo_dismissals; never expires) — a new
 * version gets its own, so it shows once for that version. */
export const SCORING_NOTE_KEY = `scoring-${SCORING_NOTE_VERSION}`;

/** What this version changed, in the owner's words (EN + ES). */
export const SCORING_NOTE_MESSAGE: MessageKey = "dashboard.overview.scoringUpdateNote.v1_13_0";

/** Shown once the newest saved score is this version and an earlier one
 * was made another way (newest first). */
export function scoringNoteApplies(history: Array<{ scoring_version: string | null }>): boolean {
  const latest = history[0]?.scoring_version ?? null;
  return latest === SCORING_NOTE_VERSION && history.slice(1).some((h) => !!h.scoring_version && h.scoring_version !== latest);
}
