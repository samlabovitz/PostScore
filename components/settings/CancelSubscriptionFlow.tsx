"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import type { CancellationFeedback, CancellationReasonCode } from "@/lib/subscription";

const TEXT_MAX_LENGTH = 500;

/** Order matters — this is the order the reasons are shown in. No
 * option is ever pre-selected. */
const REASON_OPTIONS: Array<{ code: CancellationReasonCode; labelKey: MessageKey }> = [
  { code: "too_expensive", labelKey: "dashboard.cancelSubscription.reasonTooExpensive" },
  { code: "not_enough_results", labelKey: "dashboard.cancelSubscription.reasonNotEnoughResults" },
  { code: "no_time", labelKey: "dashboard.cancelSubscription.reasonNoTime" },
  { code: "didnt_work", labelKey: "dashboard.cancelSubscription.reasonDidntWork" },
  { code: "switching", labelKey: "dashboard.cancelSubscription.reasonSwitching" },
  { code: "business_changing", labelKey: "dashboard.cancelSubscription.reasonBusinessChanging" },
  { code: "short_term", labelKey: "dashboard.cancelSubscription.reasonShortTerm" },
  { code: "other", labelKey: "dashboard.cancelSubscription.reasonOther" },
  { code: "prefer_not_to_say", labelKey: "dashboard.cancelSubscription.reasonPreferNotToSay" },
];

/** Only these three reasons have a reason-specific follow-up text box —
 * every other reason (and no reason at all) shows just the general
 * "anything we could have done better?" field. */
const FOLLOW_UP_LABEL_KEY: Partial<Record<CancellationReasonCode, MessageKey>> = {
  didnt_work: "dashboard.cancelSubscription.didntWorkFollowUpLabel",
  switching: "dashboard.cancelSubscription.switchingFollowUpLabel",
  other: "dashboard.cancelSubscription.otherFollowUpLabel",
};

function formatPeriodEndDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(
    new Date(iso)
  );
}

type FlowState =
  | { step: "reason" }
  | { step: "confirm" }
  | { step: "submitting" }
  | { step: "error"; message: string }
  | { step: "success" };

/**
 * The two-step cancellation flow: an optional-everything reason survey,
 * then a confirm step with equal-weight cancel/keep buttons — no guilt
 * language, no retention offers, no pre-selected reason. This component
 * never calls lib/subscription.ts's cancelSubscription() itself; the
 * caller's onConfirm does that (or, in the dev preview at
 * app/dev/cancel-flow, fakes it) — this stays a pure, reusable UI piece.
 */
export function CancelSubscriptionFlow({
  businessId,
  periodEndDate,
  onConfirm,
  onKeepPlan,
}: {
  businessId: string;
  /** ISO date the plan really stays active until — the real Settings
   * page must source this from the real Stripe subscription once one
   * exists; the dev preview passes a clearly-labeled sample. Never
   * guessed by this component. */
  periodEndDate: string;
  /** Called only once the owner confirms cancellation on step 2. */
  onConfirm: (feedback: CancellationFeedback) => Promise<void>;
  /** Called when the owner picks "Keep my plan" from either step. */
  onKeepPlan?: () => void;
}) {
  const locale = useLocale();
  const [state, setState] = useState<FlowState>({ step: "reason" });
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode | null>(null);
  const [detail, setDetail] = useState("");
  const [improvement, setImprovement] = useState("");

  const followUpLabelKey = reasonCode ? FOLLOW_UP_LABEL_KEY[reasonCode] : undefined;
  const formattedDate = formatPeriodEndDate(periodEndDate, locale);

  async function handleConfirm() {
    setState({ step: "submitting" });
    const feedback: CancellationFeedback = {
      reasonCode,
      detail: detail.trim() ? detail.trim() : null,
      improvement: improvement.trim() ? improvement.trim() : null,
      locale,
      businessId,
      createdAt: new Date().toISOString(),
    };
    try {
      await onConfirm(feedback);
      setState({ step: "success" });
    } catch {
      setState({ step: "error", message: t(locale, "dashboard.cancelSubscription.error") });
    }
  }

  if (state.step === "success") {
    return (
      <Card className="p-5">
        <p className="text-sm text-ink">
          {t(locale, "dashboard.cancelSubscription.successMessage", { date: formattedDate })}
        </p>
      </Card>
    );
  }

  if (state.step === "confirm" || state.step === "submitting" || state.step === "error") {
    const submitting = state.step === "submitting";
    return (
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">
            {t(locale, "dashboard.cancelSubscription.step2Heading")}
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {t(locale, "dashboard.cancelSubscription.step2Body", { date: formattedDate })}
          </p>
        </div>

        {state.step === "error" && <p className="text-[13px] text-red">{state.message}</p>}

        <div className="flex flex-wrap gap-2.5">
          <Button type="button" variant="default" onClick={handleConfirm} disabled={submitting}>
            {t(locale, "dashboard.cancelSubscription.confirmCancelButton")}
          </Button>
          <Button type="button" variant="default" onClick={onKeepPlan} disabled={submitting}>
            {t(locale, "dashboard.cancelSubscription.keepPlanButton")}
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setState({ step: "reason" })}
          disabled={submitting}
          className="w-fit text-[12.5px] font-medium text-ink-mute hover:text-ink disabled:opacity-50"
        >
          {t(locale, "dashboard.cancelSubscription.backLink")}
        </button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink">
          {t(locale, "dashboard.cancelSubscription.step1Heading")}
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-mute">{t(locale, "dashboard.cancelSubscription.step1Note")}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        {REASON_OPTIONS.map(({ code, labelKey }) => (
          <label key={code} className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="radio"
              name="cancellation-reason"
              value={code}
              checked={reasonCode === code}
              onChange={() => setReasonCode(code)}
              className="h-4 w-4 accent-brass"
            />
            {t(locale, labelKey)}
          </label>
        ))}
      </fieldset>

      {followUpLabelKey && (
        <div>
          <label className="mb-1 block text-[12.5px] font-medium text-ink-soft">{t(locale, followUpLabelKey)}</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, TEXT_MAX_LENGTH))}
            maxLength={TEXT_MAX_LENGTH}
            rows={2}
            className="w-full resize-none rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-[12.5px] font-medium text-ink-soft">
          {t(locale, "dashboard.cancelSubscription.improvementLabel")}
        </label>
        <textarea
          value={improvement}
          onChange={(e) => setImprovement(e.target.value.slice(0, TEXT_MAX_LENGTH))}
          maxLength={TEXT_MAX_LENGTH}
          rows={2}
          className="w-full resize-none rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
        />
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button type="button" variant="brass" onClick={() => setState({ step: "confirm" })}>
          {t(locale, "dashboard.cancelSubscription.continueButton")}
        </Button>
        <Button type="button" variant="default" onClick={onKeepPlan}>
          {t(locale, "dashboard.cancelSubscription.keepPlanButton")}
        </Button>
      </div>
    </Card>
  );
}
