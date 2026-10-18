"use client";

import { useState } from "react";
import Link from "next/link";
import { IconCalendarEvent, IconCheck, IconClock, IconMessageCircle, IconPhoto, IconQrcode } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
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
const ITEM_ICON: Record<WeeklyChecklistItemId, typeof IconClock> = {
  post_update: IconCalendarEvent,
  reply_reviews: IconMessageCircle,
  share_review_link: IconQrcode,
  add_photo: IconPhoto,
  check_hours: IconClock,
};

/** Where an item is done inside PostScore, when there's a page for it. */
function itemLink(itemId: WeeklyChecklistItemId, businessId: string): { href: string; labelKey: "dashboard.overview.growBanner.reviews.cta" } | null {
  return itemId === "share_review_link" ? { href: `/business/${businessId}/website-reviews#get-more-reviews`, labelKey: "dashboard.overview.growBanner.reviews.cta" } : null;
}

/** A small ring: how much of this week's routine is done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden className="-rotate-90 shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" stroke="var(--color-paper-deep)" />
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" stroke="var(--color-brass)" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - share)} />
    </svg>
  );
}

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

  const doneCount = items.filter((item) => checkedIds.has(item.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title={t(locale, "dashboard.growth.checklist.sectionHeading")}
        action={
          streakWeeks > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-[color:color-mix(in_srgb,var(--color-green)_35%,white)] bg-[color:color-mix(in_srgb,var(--color-green)_10%,white)] px-2.5 py-0.5 text-[11.5px] font-semibold text-green">
              {tPlural(locale, "dashboard.growth.checklist.streak", streakWeeks)}
            </span>
          ) : undefined
        }
      />
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-3 border-b border-paper-line pb-3">
          <ProgressRing done={doneCount} total={items.length} />
          <p className="text-[13px] font-medium text-ink">
            {t(locale, "dashboard.growth.checklist.progress", { done: doneCount, total: items.length })}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-paper-line">
          {items.map((item) => {
            const checked = checkedIds.has(item.id);
            const Icon = ITEM_ICON[item.id] ?? IconCheck;
            const link = itemLink(item.id, businessId);
            return (
              <li key={item.id} className="flex items-start gap-3 py-3 last:pb-0">
                {/* A large, easy-to-tap checkbox (the whole row label toggles it). */}
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.id)}
                    disabled={pendingId === item.id}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brass",
                      checked ? "border-brass bg-brass text-ink" : "border-paper-deep bg-white"
                    )}
                  >
                    {checked && <IconCheck size={15} strokeWidth={3} />}
                  </span>
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                    <Icon size={17} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn("text-[14px] font-medium text-ink", checked && "text-ink-mute line-through")}>{item.title}</span>
                    <span className="text-[12.5px] leading-snug text-ink-soft">{item.howTo}</span>
                    {checked && <span className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.growth.checklist.checkedByYouLabel")}</span>}
                    {errorItemId === item.id && <span className="text-[12px] text-red">{t(locale, "dashboard.growth.checklist.saveError")}</span>}
                    {/* A link inside the label never toggles the checkbox. */}
                    {link && (
                      <Link href={link.href} className={cn(LINK_PILL_CLASS, "mt-1.5")}>
                        {t(locale, link.labelKey)}
                      </Link>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">{t(locale, "dashboard.growth.checklist.note")}</p>
      </Card>
    </div>
  );
}
