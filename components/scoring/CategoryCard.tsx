import { IconAlertTriangle, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import Link from "next/link";
import { WebsiteCoverageNote } from "./WebsiteCoverageNote";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { CategoryResult, CheckResult } from "@/lib/scoring";
import { checkOutcome, formatPoints, type CheckOutcome } from "@/lib/checkOutcome";
import { ChangedOnGoogleNote } from "@/components/scoring/ChangedOnGoogleNote";

// Kept here for the UI that already imports them from this file.
export { checkOutcome, formatPoints, ChangedOnGoogleNote };
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { LockedFixRow } from "@/components/overview/FixPlanUpsell";
import { checkAnchorId } from "@/lib/postaiLinks";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { timeEstimateText, type CheckHowTo } from "@/lib/actionPlan";
import { breakdownAction } from "@/lib/breakdownAction";

/** A needs-work row's fix: its own "How to fix it" (steps, a rough time,
 * official links) and the PostScore page as a secondary link. */
export interface BreakdownFix {
  href: string;
  label: string;
  howTo?: CheckHowTo;
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
  lockedFixes = false,
  businessId = null,
}: {
  category: CategoryResult;
  /** The owner's own business: shows the customer-details answers
   * ("No parking available"…). Omitted = read-only. */
  businessId?: string | null;
  /** See WebsiteCoverageNote's scoreBasis. */
  scoreBasis?: number | null;
  /** Only used by the Website category's "partly checked" note. */
  hasWebsite?: boolean;
  /** Overview: just the check rows, inside the category's own card
   * (its heading and score are already shown there). */
  embedded?: boolean;
  /** Overview: a "how to fix it" link per check id, shown on rows that
   * need work (PostAI's link targets — lib/postaiLinks.ts). */
  fixLinks?: Record<string, BreakdownFix>;
  /** Free (the audit): a locked, blurred "How to fix this" row on rows
   * that need work — never the advice itself. */
  lockedFixes?: boolean;
}) {
  const locale = useLocale();
  if (embedded) {
    return <CheckRows category={category} fixLinks={fixLinks} lockedFixes={lockedFixes} businessId={businessId} />;
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
        <CheckRows category={category} businessId={businessId} />
      </div>
    </Card>
  );
}

function CheckRows({
  category,
  fixLinks,
  lockedFixes = false,
  businessId = null,
}: {
  category: CategoryResult;
  fixLinks?: Record<string, BreakdownFix>;
  lockedFixes?: boolean;
  businessId?: string | null;
}) {
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
          <RowStatus check={check} businessId={businessId} />
          <RowActions check={check} outcome={outcome} fix={fixLinks?.[check.id]} lockedFixes={lockedFixes} businessId={businessId} />
        </div>
      );
    })}
  </div>
  );
}

/** The row's status: ONE short sentence on what's missing (max 2 lines).
 * Customer details: the scored groups still missing on Google. */
function RowStatus({ check, businessId = null }: { check: CheckResult; businessId?: string | null }) {
  const locale = useLocale();
  // Day 23 2d-4: Google reads differently now than this saved result —
  // never words that contradict it; the page's own note covers "couldn't load".
  if (check.liveDiffers === "changed") return <ChangedOnGoogleNote businessId={businessId} />;
  if (check.liveDiffers === "unavailable") return null;
  const missing = missingParts(check);
  if (check.id === "completeness.customer_details" && missing !== null) {
    return (
      <p data-testid="customer-details-status" className="line-clamp-2 pl-[25px] text-[13px] text-ink-mute">
        {missing.length === 0 ? check.explanation : t(locale, "dashboard.breakdown.missingParts", { parts: partList(missing, locale) })}
      </p>
    );
  }
  return <p className="line-clamp-2 pl-[25px] text-[13px] text-ink-mute">{check.explanation}</p>;
}

/** Customer details: the scored groups not on Google yet (null: not known). */
function missingParts(check: CheckResult): string[] | null {
  const parts = (check.meta?.parts ?? "").split(",").filter(Boolean);
  if (check.meta?.present === undefined || parts.length === 0) return null;
  const present = new Set(check.meta.present.split(",").filter(Boolean));
  return parts.filter((p) => !present.has(p));
}

/** "parking & accessibility" / "estacionamiento y accesibilidad". */
function partList(parts: string[], locale: Locale): string {
  const names = parts.map((p) => t(locale, `content.checks.completeness.customer_details.partLabel.${p}` as MessageKey).toLowerCase());
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${t(locale, "dashboard.breakdown.and")} ${names[names.length - 1]}`;
}

/** ONE button on a row that's missing points: a verb, and where it's
 * fixed (lib/breakdownAction.ts), with the rough time as small grey text.
 * No inline editors, no "How to fix it" here — those are on the destination. */
function RowActions({
  check,
  outcome,
  fix,
  lockedFixes,
  businessId,
}: {
  check: CheckResult;
  outcome: CheckOutcome;
  fix: BreakdownFix | undefined;
  lockedFixes: boolean;
  businessId: string | null;
}) {
  const gbp = useGbpEdit();
  const locale = useLocale();
  if (outcome !== "needs_work") return null;
  if (lockedFixes) {
    return (
      <div data-testid="row-actions" className="ml-[25px] mt-1">
        <LockedFixRow blurred />
      </div>
    );
  }
  if (!businessId) return null;
  const action = breakdownAction({
    businessId,
    checkId: check.id,
    googleTab: gbp.enabled && gbp.premium && (gbp.connected || gbp.practice === true),
    fixHref: fix?.href ?? null,
    missingParts: missingParts(check) ?? undefined,
    hoursMismatch: check.id === "website.info_consistency" && /hour|horario/i.test(check.explanation),
  });
  if (!action) return null;
  const label =
    action.key === "addParts"
      ? t(locale, "dashboard.breakdown.action.addParts", { parts: partList((action.params?.parts ?? "").split("|"), locale) })
      : t(locale, `dashboard.breakdown.action.${action.key}` as MessageKey);
  return (
    <div data-testid="row-actions" className="ml-[25px] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link href={action.href} data-testid="row-action" className="inline-flex h-8 items-center rounded-lg border border-ink bg-ink px-3 text-[12.5px] font-semibold text-white hover:bg-ink/90">
        {label} →
      </Link>
      {fix?.howTo?.minutes ? <span className="text-[12px] text-ink-mute">{timeEstimateText(fix.howTo.minutes, locale)}</span> : null}
    </div>
  );
}
