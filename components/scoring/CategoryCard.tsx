import { IconAlertTriangle, IconCircleCheck, IconMinus } from "@tabler/icons-react";
import Link from "next/link";
import { WebsiteCoverageNote } from "./WebsiteCoverageNote";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/utils";
import type { CategoryResult, CheckResult } from "@/lib/scoring";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { LockedFixRow } from "@/components/overview/FixPlanUpsell";
import { checkAnchorId } from "@/lib/postaiLinks";
import { CustomerDetailsExtras } from "@/components/scoring/CustomerDetailsExtras";
import { CustomerDetailsGoogleEdit, optionLabel, useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { CUSTOMER_DETAIL_OPTIONS, PART_ORDER } from "@/lib/gbpAttributes";
import { timeEstimateText, type CheckHowTo } from "@/lib/actionPlan";

/** A needs-work row's fix: its own "How to fix it" (steps, a rough time,
 * official links) and the PostScore page as a secondary link. */
export interface BreakdownFix {
  href: string;
  label: string;
  howTo?: CheckHowTo;
}

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
          <RowStatus check={check} />
          <RowActions check={check} outcome={outcome} fix={fixLinks?.[check.id]} lockedFixes={lockedFixes} businessId={businessId} />
        </div>
      );
    })}
  </div>
  );
}

/** The row's status: "✓ Accessibility · ✓ Payment options · ✗ Parking" +
 * one plain line for customer details; the check's own explanation
 * otherwise. */
function RowStatus({ check }: { check: CheckResult }) {
  const locale = useLocale();
  const parts = (check.meta?.parts ?? "").split(",").filter(Boolean);
  const present = check.meta?.present !== undefined ? new Set(check.meta.present.split(",").filter(Boolean)) : null;
  if (check.id === "completeness.customer_details" && parts.length > 0 && present) {
    return (
      <div data-testid="customer-details-status" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pl-[25px] text-[12.5px]">
        {parts.map((part) => (
          <span key={part} className={cn("rounded-full px-2 py-px font-medium", present.has(part) ? "bg-green/10 text-green" : "bg-paper-deep text-ink-soft")}>
            {present.has(part) ? "✓" : "✗"} {t(locale, `content.checks.completeness.customer_details.partLabel.${part}` as MessageKey)}
          </span>
        ))}
        <span className="w-full text-[13px] text-ink-mute">{t(locale, "dashboard.customerDetails.why")}</span>
      </div>
    );
  }
  return <p className="pl-[25px] text-[13px] text-ink-mute">{check.explanation}</p>;
}

/** One primary action, then small secondary links — the same on every
 * row: "How to fix it" (or, for customer details on Premium, "Update on
 * Google"), the PostScore page as a small text link. */
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
  const needsWork = outcome === "needs_work";
  const customerDetails = check.id === "completeness.customer_details" && !!businessId;
  // Premium (connected or not): the Google action is the one action.
  const googleAction = customerDetails && gbp.enabled && gbp.premium;
  const canRemove = customerDetails && (check.meta?.ownerCanRemove ?? "").split(",").some(Boolean);
  if (!needsWork && !googleAction && !canRemove) return null;
  return (
    <div data-testid="row-actions" className="ml-[25px] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {googleAction ? (
        <>
          <CustomerDetailsGoogleEdit businessId={businessId!} className="basis-full" />
          {/* Connected: the steps stay, for doing it on Google directly. */}
          {gbp.connected && needsWork && fix?.howTo && !lockedFixes && (
            <HowToFix howTo={fix.howTo} customerDetailsParts={null} intro={t(locale, "dashboard.gbpEdit.howToIntro")} />
          )}
        </>
      ) : needsWork && lockedFixes ? (
        <LockedFixRow blurred />
      ) : needsWork && fix?.howTo ? (
        <HowToFix howTo={fix.howTo} customerDetailsParts={customerDetails ? (check.meta?.parts ?? "").split(",").filter(Boolean) : null} />
      ) : null}
      {customerDetails && needsWork && !googleAction && !lockedFixes && <CustomerDetailsGoogleEdit businessId={businessId!} />}
      {needsWork && fix && !lockedFixes && (
        <Link href={fix.href} className="text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline">
          {fix.label}
        </Link>
      )}
      {canRemove && <CustomerDetailsExtras check={check} businessId={businessId} />}
    </div>
  );
}

/** "How to fix it": the steps, a rough time and official links — opens in
 * place (no box); for customer details, the choices Google usually offers. */
function HowToFix({ howTo, customerDetailsParts, intro }: { howTo: CheckHowTo; customerDetailsParts: string[] | null; intro?: string }) {
  const locale = useLocale();
  return (
    <details data-testid="row-how-to" className="group text-[12.5px] leading-relaxed text-ink-soft open:basis-full">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-ink hover:text-brass [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {t(locale, "content.actionPlan.step.howToFix")}
        {howTo.minutes ? <span className="font-normal text-ink-mute">· {timeEstimateText(howTo.minutes, locale)}</span> : null}
      </summary>
      {intro && (
        <p data-testid="row-how-to-intro" className="mt-1 font-medium text-ink">
          {intro}
        </p>
      )}
      <p className="mt-1">{howTo.steps}</p>
      {customerDetailsParts && customerDetailsParts.length > 0 && (
        <div data-testid="row-how-to-options" className="mt-1.5">
          <p className="font-medium text-ink">{t(locale, "dashboard.customerDetails.howToOptions")}</p>
          <ul className="ml-4 list-disc">
            {PART_ORDER.filter((part) => customerDetailsParts.includes(part)).map((part) => (
              <li key={part}>
                <span className="font-medium text-ink">{t(locale, `content.checks.completeness.customer_details.partLabel.${part}` as MessageKey)}:</span>{" "}
                {CUSTOMER_DETAIL_OPTIONS[part].map((id) => optionLabel(id, locale)).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {howTo.links.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {howTo.links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
              {link.label} ↗
            </a>
          ))}
        </p>
      )}
    </details>
  );
}
