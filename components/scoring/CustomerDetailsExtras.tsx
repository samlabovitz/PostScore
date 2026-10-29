"use client";

// "Doesn't apply to you?" on "Customer details on your listing": a small
// popover with the owner's own answers ("No parking available", "We take
// no payments on site") — owner-entered, labeled "Added by you", each
// removing that part from the check. The same answers are in the Update
// on Google panel.

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  setCustomerDetailsOwnerAnswer,
  type CustomerDetailsOwnerPart,
} from "@/app/actions/customerDetails";
import { t, useLocale } from "@/lib/i18n";
import type { CheckResult } from "@/lib/scoring";

const list = (value: string | undefined) =>
  value ? value.split(",").filter(Boolean) : [];

export function CustomerDetailsExtras({
  check,
  businessId,
}: {
  check: Pick<CheckResult, "meta">;
  businessId?: string | null;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState<CustomerDetailsOwnerPart | null>(null);
  const [failed, setFailed] = useState(false);
  const ownerRemoved = list(check.meta?.ownerRemoved);
  // Parking first, the same order as the Update on Google panel.
  const canRemove = (["parking", "payment"] as const).filter((p) =>
    list(check.meta?.ownerCanRemove).includes(p),
  );

  async function toggle(part: CustomerDetailsOwnerPart, notAvailable: boolean) {
    setSaving(part);
    setFailed(false);
    const result = await setCustomerDetailsOwnerAnswer(
      businessId!,
      part,
      notAvailable,
    );
    setSaving(null);
    if (result.status === "ok") router.refresh();
    else setFailed(true);
  }

  if (!businessId || canRemove.length === 0) return null;
  return (
    <details className="relative" data-testid="customer-details-extras">
      <summary className="cursor-pointer list-none text-[12px] font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline [&::-webkit-details-marker]:hidden">
        {t(locale, "dashboard.customerDetails.doesntApply")}
      </summary>
      <div className="absolute left-0 z-20 mt-1 flex w-max max-w-[min(20rem,calc(100vw-3rem))] flex-col gap-1.5 rounded-lg border border-paper-deep bg-white px-3 py-2 text-[12.5px] text-ink shadow-card">
        {canRemove.map((part) => {
          const checked = ownerRemoved.includes(part);
          return (
            <label key={part} className="flex items-center gap-2 whitespace-nowrap">
              <input
                type="checkbox"
                checked={checked}
                disabled={saving !== null}
                onChange={(e) => toggle(part, e.target.checked)}
                className="h-3.5 w-3.5 shrink-0 accent-[color:var(--color-brass)]"
              />
              <span>
                {t(
                  locale,
                  part === "parking"
                    ? "dashboard.gbpEdit.ownerNoParking"
                    : "dashboard.gbpEdit.ownerNoPayment",
                )}
              </span>
              {checked && (
                <span className="rounded-full bg-paper-deep px-2 py-px text-[10.5px] font-semibold text-ink-soft">
                  {t(locale, "dashboard.memory.addedByYou")}
                </span>
              )}
              {saving === part && (
                <span className="text-ink-mute">
                  {t(
                    locale,
                    "content.checks.completeness.customer_details.owner.saving",
                  )}
                </span>
              )}
            </label>
          );
        })}
        {failed && (
          <p className="text-red">
            {t(
              locale,
              "content.checks.completeness.customer_details.owner.error",
            )}
          </p>
        )}
      </div>
    </details>
  );
}
