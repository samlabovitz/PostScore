import { IconAlertTriangle, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { CategoryResult, Confidence } from "@/lib/scoring";

const CONFIDENCE_PILL: Record<Confidence, { variant: "green" | "brass" | "amber" | "neutral"; label: string }> = {
  VERIFIED: { variant: "green", label: "Verified" },
  LIKELY: { variant: "brass", label: "Likely" },
  UNCERTAIN: { variant: "amber", label: "Uncertain" },
  NOT_FOUND: { variant: "neutral", label: "Not found" },
};

/** A compact status symbol per confidence state — a solid green check for
 * anything actually verified, a muted dash for anything we don't (yet)
 * have data for, so the list reads at a glance before you get to the
 * per-check label and explanation. */
function ConfidenceIcon({ confidence }: { confidence: Confidence }) {
  switch (confidence) {
    case "VERIFIED":
      return <IconCircleCheck size={17} className="shrink-0 text-green" />;
    case "LIKELY":
      return <IconCircleCheck size={17} className="shrink-0 text-brass" />;
    case "UNCERTAIN":
      return <IconAlertTriangle size={17} className="shrink-0 text-amber" />;
    case "NOT_FOUND":
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
export function CategoryCard({ category }: { category: CategoryResult }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-ink">{category.label}</h3>
        <span className="text-sm text-ink-mute">
          {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)} pts
          <span className="ml-1.5 text-ink-mute/70">(of {category.weight} weight)</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-paper-line">
        {category.checks.map((check) => {
          const pill = CONFIDENCE_PILL[check.confidence];
          const isFull = check.earnedPoints !== null && check.earnedPoints >= check.maxPoints;
          return (
            <div key={check.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ConfidenceIcon confidence={check.confidence} />
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
                    {formatPoints(check.earnedPoints)} / {check.maxPoints}
                  </span>
                  <Pill variant={pill.variant}>{pill.label}</Pill>
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
