// The one-time "We updated how PostScore scores …" note on the Overview —
// one per scoring version (v1.12.0 reviews and listing; v1.13.0 the
// website's speed and phone checks). Pure.

import type { MessageKey } from "@/lib/i18n";

/** The version whose note this is (kept here so the browser never loads
 * the scoring engine for a note). 1.13.1 only re-weighs existing checks,
 * so it reuses this note: shown once (one dismissal) for 1.13.0 and up. */
export const SCORING_NOTE_VERSION = "1.13.0";

/** The note's dismissal key (promo_dismissals; never expires) — a new
 * version gets its own, so it shows once for that version. */
export const SCORING_NOTE_KEY = `scoring-${SCORING_NOTE_VERSION}`;

/** What this version changed, in the owner's words (EN + ES). */
export const SCORING_NOTE_MESSAGE: MessageKey = "dashboard.overview.scoringUpdateNote.v1_13_0";

function atLeast(version: string, min: string): boolean {
  const a = version.split(".").map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

/** Shown once the newest saved score is this version or later and an
 * earlier one was made before it (newest first) — until dismissed. */
export function scoringNoteApplies(history: Array<{ scoring_version: string | null }>): boolean {
  const latest = history[0]?.scoring_version ?? null;
  return !!latest && atLeast(latest, SCORING_NOTE_VERSION) && history.slice(1).some((h) => !!h.scoring_version && !atLeast(h.scoring_version, SCORING_NOTE_VERSION));
}
