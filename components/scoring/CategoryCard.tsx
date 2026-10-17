import { IconAlertTriangle, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import Link from "next/link";
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
type CheckOutcome = "done" | "needs_work" | "couldnt_check" | "excellent" | "good";

/** The Star rating row is labeled by the rating itself (ratingBand in
 * lib/scoring.ts): 4.5★+ "Excellent" and 4.3★+ "Good" are never "Needs
 * work", even while more reviews would still add points. */
export function checkOutcome(check: Pick<CheckResult, "id" | "earnedPoints" | "maxPoints" | "meta">): CheckOutcome {
  if (check.earnedPoints === null) return "couldnt_check";
  if (check.id === "visibility.rating" && check.meta?.ratingBand === "excellent") return "excellent";
  if (check.id === "visibility.rating" && check.meta?.ratingBand === "good") return "good";
  return check.earnedPoints >= check.maxPoints ? "done" : "needs_work";
}

const OUTCOME_PILL: Record<CheckOutcome, { variant: "green" | "amber" | "neutral"; labelKey: MessageKey }> = {
  done: { variant: "green", labelKey: "dashboard.checkResult.done" },
  needs_work: { variant: "amber", labelKey: "dashboard.checkResult.needsWork" },
  couldnt_check: { variant: "neutral", labelKey: "dashboard.checkResult.couldntCheck" },
  excellent: { variant: "green", labelKey: "dashboard.checkResult.excellent" },
  good: { variant: "green", labelKey: "dashboard.checkResult.good" },
};

function OutcomeIcon({ outcome }: { outcome: CheckOutcome }) {
  switch (outcome) {
    case "done":
    case "excellent":
    case "good":
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
  embedded = false,
  fixLinks,
}: {
  category: CategoryResult;
  /** See WebsiteCoverageNote's scoreBasis. */
  scoreBasis?: number | null;
  /** Only used by the Website category's "partly checked" note. */
  hasWebsite?: boolean;
  /** Overview: just the check rows, inside the category's own card
   * (its heading and score are already shown there). */
  embedded?: boolean;
  /** Overview: a "how to fix it" link per check id, shown on rows that
   * need work (PostAI's link targets — lib/postaiLinks.ts). */
  fixLinks?: Record<string, { href: string; label: string }>;
}) {
  const locale = useLocale();
  if (embedded) {
    return <CheckRows category={category} fixLinks={fixLinks} />;
  }
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

      <div className="mt-4">
        <CheckRows category={category} />
      </div>
    </Card>
  );
}

function CheckRows({ category, fixLinks }: { category: CategoryResult; fixLinks?: Record<string, { href: string; label: string }> }) {
  const locale = useLocale();
  return (
  <div className="flex flex-col divide-y divide-paper-line">
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
          {outcome === "needs_work" && fixLinks?.[check.id] && (
            <Link
              href={fixLinks[check.id].href}
              className="ml-[25px] mt-1 inline-flex w-fit max-w-full items-center rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-ink transition-colors hover:border-brass hover:bg-[color:color-mix(in_srgb,var(--color-brass)_20%,transparent)]"
            >
              {fixLinks[check.id].label}
            </Link>
          )}
        </div>
      );
    })}
  </div>
  );
}
