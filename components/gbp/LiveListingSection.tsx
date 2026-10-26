"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import { IconCircleCheck, IconCircleDashed, IconLock } from "@tabler/icons-react";
import { t, useLocale } from "@/lib/i18n";

/**
 * One real Google Business Profile field this business's live listing
 * either has or is missing. Not used yet — see the doc comment on
 * LiveListingSection below — but typed now so Phase 2 has a real shape
 * to fill in rather than inventing one under deadline pressure.
 */
export interface GbpListingField {
  /** A stable id Phase 2 can key an action-plan task off of, e.g.
   * "gbp_hours" — mirrors the check_id pattern lib/actionPlan.ts already
   * uses for scoring-engine checks, so a per-field GBP fix can become a
   * real task the same way any other fix does. */
  id: string;
  label: string;
  complete: boolean;
  /** Real points this field would add to the action plan once fixed —
   * Phase 2 would compute this the same honest way
   * promised_points/verified_score_id already work in lib/actionPlan.ts.
   * Never rendered in Phase 1. */
  actionPlanPoints?: number;
}

/**
 * "Your live Google listing" — the profile-completeness section from
 * the prototype, structured now so Phase 2 can drop real field data in
 * without redesigning this component, but rendering nothing fabricated
 * today. Three real states, never a fourth invented one:
 *   1. Not connected → "Connect your Google Business Profile" (PostScore
 *      Premium), linking to the connect page — read-only "coming soon"
 *      (disabled button) until GBP_CONNECT_PUBLIC.
 *   2. Connected, but `fields` is null → Phase 1's actual state for
 *      every connected business today: we hold a token, but no code yet
 *      calls the Business Profile API to read real field completeness.
 *      Says so plainly rather than showing an empty or broken checklist.
 *   3. Connected with real `fields` → Phase 2's state once it exists:
 *      each incomplete field would render with an "Add to my plan"
 *      action, inserting a real row into `tasks` keyed by the field's
 *      `id` (see lib/actionPlan.ts's existing mark-done → re-scan-
 *      confirms flow) so a GBP-sourced fix becomes a real action-plan
 *      task exactly like any scoring-engine check does today. That
 *      write path doesn't exist yet, so this state is unreachable in
 *      Phase 1 — `fields` is never passed as non-null anywhere yet.
 */
export function LiveListingSection({
  businessId,
  connected,
  fields = null,
  premium = true,
}: {
  businessId: string;
  connected: boolean;
  /** Free and Grow are never sent to the Premium connect page — their
   * "See what's included" opens Compare plans. */
  premium?: boolean;
  fields?: GbpListingField[] | null;
}) {
  const locale = useLocale();

  // Free/Grow may be connected (for the review-reply check), but this
  // checklist is Premium: they keep seeing the Premium preview.
  if (!connected || !premium) {
    // Compact, like the original connect box. Opens the connect page,
    // which stays read-only "coming soon" until GBP_CONNECT_PUBLIC.
    return (
      <Card className="flex items-start gap-3 p-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
          <IconLock size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[13px] font-semibold text-ink">{t(locale, "dashboard.overview.profileChecklistTitle")}</h3>
            <span className="rounded-full bg-ink px-2 py-px text-[10.5px] font-semibold text-paper">
              {t(locale, "dashboard.overview.connectPremiumPill")}
            </span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">{t(locale, "dashboard.overview.profileChecklistDescription")}</p>
          <Link
            href={premium ? `/business/${businessId}/connect-gbp` : `/business/${businessId}/settings#compare-plans`}
            className={`mt-2 ${LINK_PILL_CLASS}`}
          >
            {t(locale, "dashboard.overview.seeWhatsIncluded")}
          </Link>
        </div>
      </Card>
    );
  }

  if (!fields) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        {t(locale, "dashboard.overview.gbpConnectedNotWiredUp")}
      </Card>
    );
  }

  // Unreachable in Phase 1 (see doc comment above) — kept real rather
  // than stubbed so Phase 2 only has to start passing real `fields`.
  return (
    <Card className="p-5">
      <div className="flex flex-col divide-y divide-paper-line">
        {fields.map((field) => (
          <div key={field.id} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-center gap-2.5">
              {field.complete ? (
                <IconCircleCheck size={16} className="shrink-0 text-green" />
              ) : (
                <IconCircleDashed size={16} className="shrink-0 text-ink-mute" />
              )}
              <span className="text-sm text-ink">{field.label}</span>
            </div>
            {!field.complete && field.actionPlanPoints !== undefined && (
              <span className="shrink-0 text-[12px] font-medium text-brass">
                {t(locale, "dashboard.overview.ptsAvailable", { points: field.actionPlanPoints })}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
