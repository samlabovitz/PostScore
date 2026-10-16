import { IconAlertTriangle, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import { WebsiteCoverageNote } from "./WebsiteCoverageNote";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { CategoryResult, CheckResult } from "@/lib/scoring";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { checkAnchorId } from "@/lib/postaiLinks";

/** Day 4 Step 3: each row is labeled by its RESULT — never by how sure
 * we are of it (the old green "Verified" read as a pass even at 0 / 1):
 * full points → "Done", fewer → "Needs work", excluded → "Couldn't check". */
type CheckOutcome = "done" | "needs_work" | "couldnt_check";

export function checkOutcome(check: Pick<CheckResult, "earnedPoints" | "maxPoints">): CheckOutcome {
  if (check.earnedPoints === null) return "couldnt_check";
  return check.earnedPoints >= check.maxPoints ? "done" : "needs_work";
}

const OUTCOME_PILL: Record<CheckOutcome, { variant: "green" | "amber" | "neutral"; labelKey: MessageKey }> = {
  done: { variant: "green", labelKey: "dashboard.checkResult.done" },
  needs_work: { variant: "amber", labelKey: "dashboard.checkResult.needsWork" },
  couldnt_check: { variant: "neutral", labelKey: "dashboard.checkResult.couldntCheck" },
};

function OutcomeIcon({ outcome }: { outcome: CheckOutcome }) {
  switch (outcome) {
    case "done":
      return <IconCircleCheck size={17} className="shrink-0 text-green" />;
    case "needs_work":
      return <IconAlertTriangle size={17} className="shrink-0 text-amber" />;
    case "couldnt_check":
      return <IconMinus size={17} className="shrink-0 text-ink-mute" />;
  }
}

export function formatPoints(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Renders one scoring category's real checks — label, earned/max
 * points, and confidence — straight off a live ScoreBreakdown. Used by
 * the full score breakdown (BusinessScoreView) and by any page that
 * wants to show just one category's real rubric (e.g. the Reviews page
 * showing only "visibility") without re-deriving or re-styling it. */
export function CategoryCard({
  category,
  hasWebsite = false,
  scoreBasis = null,
}: {
  category: CategoryResult;
  /** See WebsiteCoverageNote's scoreBasis. */
  scoreBasis?: number | null;
  /** Only used by the Website category's "partly checked" note. */
  hasWebsite?: boolean;
}) {
  const locale = useLocale();
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-ink">{category.label}</h3>
        <span className="text-sm text-ink-mute">
          {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)}{" "}
          {t(locale, "dashboard.website.ptsAbbrev")}
          <span className="ml-1.5 text-ink-mute/70">
            {t(locale, "dashboard.overview.categoryWeightAnnotation", { weight: category.weight })}
          </span>
        </span>
      </div>
      <WebsiteCoverageNote category={category} hasWebsite={hasWebsite} scoreBasis={scoreBasis} className="mt-1 text-[12px] text-ink-mute" />

      <div className="mt-4 flex flex-col divide-y divide-paper-line">
        {category.checks.map((check) => {
          const outcome = checkOutcome(check);
          const pill = OUTCOME_PILL[outcome];
          const isFull = check.earnedPoints !== null && check.earnedPoints >= check.maxPoints;
          return (
            <div
              key={check.id}
              id={checkAnchorId(check.id)}
              className="flex scroll-mt-20 flex-col gap-1 rounded-lg py-3 transition-colors duration-700 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <OutcomeIcon outcome={outcome} />
                  {check.label}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-sm tabular-nums",
                      check.earnedPoints === null
                        ? "text-ink-mute"
                        : isFull
                          ? "text-green"
                          : "text-ink-soft"
                    )}
                  >
                    {formatPoints(check.earnedPoints)} / {formatPoints(check.maxPoints)}
                  </span>
                  <Pill variant={pill.variant}>{t(locale, pill.labelKey)}</Pill>
                </div>
              </div>
              <p className="pl-[25px] text-[13px] text-ink-mute">{check.explanation}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
