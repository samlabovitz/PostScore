// The one-time "We updated how PostScore scores reviews and your listing"
// note on the Overview (scoring v1.12.0). Pure.

/** lib/scoring.ts SCORING_VERSION_V112 (kept here so the browser never
 * loads the scoring engine for a note; a test keeps them equal). */
export const SCORING_NOTE_VERSION = "1.12.0";

/** The note's dismissal key (promo_dismissals; never expires). */
export const SCORING_NOTE_KEY = "scoring-1.12.0";

/** Shown once the newest saved score is v1.12.0 and an earlier one was
 * made another way (newest first). */
export function scoringNoteApplies(history: Array<{ scoring_version: string | null }>): boolean {
  const latest = history[0]?.scoring_version ?? null;
  return latest === SCORING_NOTE_VERSION && history.slice(1).some((h) => !!h.scoring_version && h.scoring_version !== latest);
}
