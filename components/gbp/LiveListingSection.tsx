import { Card } from "@/components/ui/Card";
import { IconCircleCheck, IconCircleDashed } from "@tabler/icons-react";
import { ConnectToUnlockCard } from "@/components/gbp/ConnectToUnlock";

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
 *   1. Not connected → the same honest connect-to-unlock gate every
 *      other GBP-dependent feature uses.
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
}: {
  businessId: string;
  connected: boolean;
  fields?: GbpListingField[] | null;
}) {
  if (!connected) {
    return (
      <ConnectToUnlockCard
        businessId={businessId}
        title="Profile-completeness checklist"
        description="Connect your Google Business Profile to see exactly which listing fields are missing, add fixes straight to your action plan, and track review recency from your real, live Google data."
      />
    );
  }

  if (!fields) {
    return (
      <Card className="p-5 text-sm text-ink-soft">
        Google Business Profile connected. Live field-by-field completeness isn&apos;t wired up
        yet — that&apos;s a later update, not something broken here. We&apos;ll show your real
        checklist here once it ships.
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
                +{field.actionPlanPoints} pts available
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
