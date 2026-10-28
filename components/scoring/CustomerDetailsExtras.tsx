"use client";

// Under "Customer details on your listing": the owner's own answers ("No
// parking available", "We take no payments on site") — owner-entered,
// labeled "Added by you", each removing that part from the check. The
// steps and official links are the row's "How to fix it".

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
  const canRemove = list(check.meta?.ownerCanRemove).filter(
    (p): p is CustomerDetailsOwnerPart => p === "parking" || p === "payment",
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
    <div
      className="ml-[25px] mt-1 text-[12.5px] text-ink-soft"
      data-testid="customer-details-extras"
    >
      <fieldset className="flex flex-col gap-1.5 rounded-lg border border-paper-line bg-paper px-3 py-2">
        <legend className="px-1 text-[11.5px] font-medium text-ink-mute">
          {t(
            locale,
            "content.checks.completeness.customer_details.owner.heading",
          )}
        </legend>
        {canRemove.map((part) => {
          const checked = ownerRemoved.includes(part);
          return (
            <label key={part} className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                checked={checked}
                disabled={saving !== null}
                onChange={(e) => toggle(part, e.target.checked)}
                className="h-3.5 w-3.5 accent-[color:var(--color-brass)]"
              />
              <span>
                {t(
                  locale,
                  part === "parking"
                    ? "content.checks.completeness.customer_details.owner.noParking"
                    : "content.checks.completeness.customer_details.owner.noPayment",
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
      </fieldset>
    </div>
  );
}
