// Pure helpers behind the Overview page's "what changed since last scan"
// feed (app/business/[id]/BusinessScoreView.tsx's ChangesFeed) — split
// out from that "use client" component so these can be unit-tested
// directly, without pulling in that file's transitive server-only
// dependency chain (app/actions/scoring.ts etc.).

import { checkLabelKey, type CheckResult, type ScoreBreakdown } from "./scoring";
import { t, type Locale } from "./i18n";

export interface CheckChange {
  check: CheckResult;
  fromPoints: number | null;
  toPoints: number | null;
  /** True when this check's own meta.method differs between the two
   * scans being compared (today, the only check that ever sets
   * meta.method is website.performance_mobile — see CheckResult.meta's
   * own doc). The point delta here is confounded by a change in HOW the
   * check was measured, not necessarily a real underlying change, so a
   * caller must show an honest "measurement method updated" message
   * instead of implying the business got faster or slower. */
  methodChanged: boolean;
}

/** Pure diff between two real, previously-saved breakdowns — only
 * checks whose earned points or confidence actually changed, sorted by
 * the size of the change. Never inferred or estimated. */
export function diffBreakdowns(previous: ScoreBreakdown, current: ScoreBreakdown): CheckChange[] {
  const changes: CheckChange[] = [];
  for (const check of current.checks) {
    const prevCheck = previous.checks.find((c) => c.id === check.id);
    if (!prevCheck) continue;
    if (prevCheck.earnedPoints !== check.earnedPoints || prevCheck.confidence !== check.confidence) {
      const methodChanged = (prevCheck.meta?.method ?? null) !== (check.meta?.method ?? null);
      changes.push({ check, fromPoints: prevCheck.earnedPoints, toPoints: check.earnedPoints, methodChanged });
    }
  }
  return changes.sort((a, b) => {
    const deltaA = Math.abs((a.toPoints ?? 0) - (a.fromPoints ?? 0));
    const deltaB = Math.abs((b.toPoints ?? 0) - (b.fromPoints ?? 0));
    return deltaB - deltaA;
  });
}

/**
 * Re-resolves one stored check's display text for the CURRENT locale,
 * rather than trusting `check.label`/`check.explanation` — both frozen
 * at whatever locale was live the moment the scan that stored them ran
 * (almost always English; see app/actions/scoring.ts's
 * saveScoreSnapshotWithClient). The label comes from the check's stable
 * id via checkLabelKey(); the explanation comes from `liveBreakdown`
 * (the real, current-locale score already computed for this page load),
 * matched by that same id. Either lookup can honestly miss —
 * checkLabelKey() for an id CHECKS no longer defines, liveBreakdown for
 * an id the live score didn't determine this run — and each falls back
 * to its own stored value independently rather than guessing.
 */
export function resolveChangeDisplay(
  check: CheckResult,
  liveBreakdown: ScoreBreakdown,
  locale: Locale
): { label: string; explanation: string } {
  const labelKey = checkLabelKey(check.id);
  const label = labelKey ? t(locale, labelKey) : check.label;
  const liveCheck = liveBreakdown.checks.find((c) => c.id === check.id);
  const explanation = liveCheck ? liveCheck.explanation : check.explanation;
  return { label, explanation };
}
