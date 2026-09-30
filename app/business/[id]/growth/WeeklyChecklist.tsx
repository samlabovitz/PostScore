"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { setWeeklyCheckItem } from "@/app/actions/weeklyChecklist";
import { resolveToggleOutcome, type WeeklyChecklistItem, type WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { t, tPlural, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * "Your weekly routine" — five real Google habits PostScore has no way
 * to verify itself, so the owner checks them off by hand. Never earns
 * points, never appears in any projected score (see lib/weeklyChecklist.ts
 * and app/actions/weeklyChecklist.ts's own docs for why). Checking an
 * item optimistically updates, then reconciles with the server's real
 * state; on failure, the click is rolled back so the UI never lies
 * about what's actually saved.
 */
export function WeeklyChecklist({
  businessId,
  items,
  initialCheckedItemIds,
  initialStreakWeeks,
}: {
  businessId: string;
  items: WeeklyChecklistItem[];
  initialCheckedItemIds: WeeklyChecklistItemId[];
  initialStreakWeeks: number;
}) {
  const locale = useLocale();
  const [checkedIds, setCheckedIds] = useState<Set<WeeklyChecklistItemId>>(new Set(initialCheckedItemIds));
  const [streakWeeks, setStreakWeeks] = useState(initialStreakWeeks);
  const [pendingId, setPendingId] = useState<WeeklyChecklistItemId | null>(null);
  const [errorItemId, setErrorItemId] = useState<WeeklyChecklistItemId | null>(null);

  async function toggle(itemId: WeeklyChecklistItemId) {
    if (pendingId) return;
    const nextChecked = !checkedIds.has(itemId);
    const beforeCheckedItemIds = Array.from(checkedIds);

    setPendingId(itemId);
    setErrorItemId(null);
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (nextChecked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });

    const result = await setWeeklyCheckItem(businessId, itemId, nextChecked);
    const outcome = resolveToggleOutcome(beforeCheckedItemIds, result);

    if (outcome.kind === "committed") {
      setCheckedIds(new Set(outcome.checkedItemIds));
      setStreakWeeks(outcome.streakWeeks);
    } else {
      // The save didn't actually happen — revert to exactly the
      // pre-click state and say so, never leave the click looking like
      // it silently did nothing.
      setCheckedIds(new Set(outcome.checkedItemIds));
      setErrorItemId(itemId);
    }
    setPendingId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title={t(locale, "dashboard.growth.checklist.sectionHeading")}
        action={
          streakWeeks > 0 ? (
            <Pill variant="green" className="shrink-0">
              {tPlural(locale, "dashboard.growth.checklist.streak", streakWeeks)}
            </Pill>
          ) : undefined
        }
      />
      <Card className="p-5">
        <div className="flex flex-col divide-y divide-paper-line">
          {items.map((item) => {
            const checked = checkedIds.has(item.id);
            return (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 py-3 first:pt-0 last:pb-0"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  disabled={pendingId === item.id}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-brass"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-sm font-medium text-ink", checked && "line-through text-ink-mute")}>
                      {item.title}
                    </span>
                    {checked && (
                      <Pill variant="neutral" className="!px-2 !py-0.5 text-[10px]">
                        {t(locale, "dashboard.growth.checklist.checkedByYouLabel")}
                      </Pill>
                    )}
                  </div>
                  <p className="text-[12px] text-ink-mute">{item.howTo}</p>
                  {errorItemId === item.id && (
                    <p className="text-[12px] text-red">{t(locale, "dashboard.growth.checklist.saveError")}</p>
                  )}
                </div>
              </label>
            );
          })}
        </div>
        <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
          {t(locale, "dashboard.growth.checklist.note")}
        </p>
      </Card>
    </div>
  );
}
