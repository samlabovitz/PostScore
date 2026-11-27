"use client";

// Growth plan (new design): "This week's checklist" (lib/growthHabits.ts). Each habit is a box: the owner ticks it
// (weekly_checks, app/actions/weeklyChecklist.ts) or PostScore checks it when it can see it (the post, a new photo,
// an offer started in PostScore). Ticking plays the old celebration: a confetti burst at the box, and the first time
// the week counts toward the tier (1 verified action or 2 check-offs, lib/growthTier.ts), the trophy toast. The list
// resets Monday in the business's own time zone; nothing carries over.

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { IconCheck, IconTrophy, IconX } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { setWeeklyCheckItem } from "@/app/actions/weeklyChecklist";
import { celebrationKey, claimCelebration, confettiBurst } from "@/lib/celebrate";
import { checkOffsToCount, type Habit, type HabitId } from "@/lib/growthHabits";
import type { CallDays } from "@/lib/gbpInsights";
import { weekdayName } from "@/components/gbp/GoogleRecs";
import type { AutoCheckSource, WeeklyChecklistItemId } from "@/lib/weeklyChecklist";
import { getReviewsHref, googleListingHref, offersHref } from "@/lib/routes";
import { formatShortDate, t, tPlural, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const H = (key: string) => `dashboard.habits.${key}` as MessageKey;
const KEY: Record<HabitId, string> = { post_update: "post", share_review_link: "reviews", add_photo: "photo", start_offer: "offer", seasonal_idea: "seasonal" };

/** A habit's title and how-to; the seasonal idea names the holiday and its date. */
export function habitText(habit: Habit, locale: Locale): { title: string; howTo: string } {
  const k = KEY[habit.id];
  const holiday = habit.holiday ? t(locale, `dashboard.googleTab.fields.holiday.${habit.holiday.id}` as MessageKey) : "";
  const date = habit.holiday ? formatShortDate(`${habit.holiday.date}T12:00:00Z`, locale, "UTC") : "";
  return { title: t(locale, H(`${k}.title`), { holiday, date }), howTo: t(locale, H(`${k}.howTo`)) };
}

/** Each habit's own way in. */
export function habitLink(businessId: string, id: HabitId, locale: Locale): { href: string; label: string } {
  const label = t(locale, H(`${KEY[id]}.link`));
  if (id === "post_update") return { href: "#more-ways", label };
  if (id === "share_review_link") return { href: getReviewsHref(businessId, { hash: "review-link" }), label };
  if (id === "add_photo") return { href: googleListingHref(businessId, { hash: "edit-photos" }), label };
  return { href: offersHref(businessId), label };
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function HabitChecklist({
  businessId,
  habits,
  weekStart,
  checked: initialChecked,
  auto: initialAuto,
  connected,
  week,
  postDay = null,
}: {
  /** "Post on Google": the best day to post, from the call-day data (null: not enough data — no line). */
  postDay?: { weekday: number; busiest: CallDays } | null;
  businessId: string;
  habits: Habit[];
  weekStart: string;
  /** This week's checked ids (the owner's and PostScore's). */
  checked: WeeklyChecklistItemId[];
  auto: Partial<Record<WeeklyChecklistItemId, AutoCheckSource>>;
  connected: boolean;
  /** This week's counted actions at load (the tier's own count), or null when the tier couldn't be read. */
  week: { verified: number; told: number } | null;
}) {
  const locale = useLocale();
  const [checked, setChecked] = useState<Set<WeeklyChecklistItemId>>(() => new Set(initialChecked));
  const [auto, setAuto] = useState(initialAuto);
  const [failed, setFailed] = useState<HabitId | null>(null);
  const [toast, setToast] = useState(false);
  const [pending, start] = useTransition();
  const boxes = useRef<Partial<Record<HabitId, HTMLButtonElement | null>>>({});
  // The owner's own check-offs at load: each one added since counts as one more "told" for the tier.
  const mineAtLoad = useRef(initialChecked.filter((id) => !initialAuto[id]).length);
  const mine = Array.from(checked).filter((id) => !auto[id]).length;
  const tier = week ? { verified: week.verified, told: week.told + (mine - mineAtLoad.current) } : null;
  const needs = tier ? checkOffsToCount(tier) : null;
  const countedAtLoad = useRef(week ? checkOffsToCount(week) === 0 : true);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(false), 7000);
    return () => clearTimeout(timer);
  }, [toast]);

  const done = habits.filter((h) => checked.has(h.id)).length;
  const toggle = (id: HabitId) =>
    start(async () => {
      const next = !checked.has(id);
      const before = new Set(checked);
      setFailed(null);
      setChecked((s) => {
        const n = new Set(s);
        if (next) n.add(id);
        else n.delete(id);
        return n;
      });
      if (next) {
        const rect = boxes.current[id]?.getBoundingClientRect();
        if (rect) confettiBurst(rect, 40, 1200);
      }
      const r = await setWeeklyCheckItem(businessId, id, next, { habits: true }).catch(() => null);
      if (!r || r.status !== "ok") {
        setChecked(before);
        setFailed(id);
        return;
      }
      setChecked(new Set(r.state.checkedItemIds));
      setAuto(r.state.auto);
      // The first time this week counts: the trophy toast (once per week on this device).
      if (next && week && !countedAtLoad.current) {
        const mineNow = r.state.checkedItemIds.filter((x) => !r.state.auto[x]).length;
        if (checkOffsToCount({ verified: week.verified, told: week.told + (mineNow - mineAtLoad.current) }) === 0 && claimCelebration(celebrationKey("habits", businessId, weekStart))) setToast(true);
      }
    });

  return (
    <section id="this-week" className="scroll-mt-20" data-testid="habit-checklist">
      <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-semibold text-ink">{t(locale, H("title"))}</h2>
          <p className="text-[13px] text-ink-mute">{t(locale, H("range"), { from: formatShortDate(`${weekStart}T12:00:00Z`, locale, "UTC"), to: formatShortDate(`${addDays(weekStart, 6)}T12:00:00Z`, locale, "UTC") })}</p>
        </div>
        <div className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-soft" data-testid="habit-progress">
          <span>{t(locale, H("progress"), { done, count: habits.length })}</span>
          <span aria-hidden className="h-2 w-28 overflow-hidden rounded-full bg-paper-deep">
            <span className="block h-full rounded-full bg-green transition-[width] duration-300" style={{ width: `${habits.length ? (done / habits.length) * 100 : 0}%` }} />
          </span>
        </div>
      </div>
      {needs !== null && (
        <div className="mb-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-green)_25%,white)] bg-[color:color-mix(in_srgb,var(--color-green)_7%,white)] px-3.5 py-2.5 text-[13.5px] text-ink" data-testid="habit-counts" data-counts={needs === 0 || undefined}>
          {needs === 0 ? (
            <>
              <b className="text-green">✓ {t(locale, H("counts"))}</b> <span className="text-ink-soft">{t(locale, H("countsMore"))}</span>
            </>
          ) : (
            <b className="text-ink">{tPlural(locale, "dashboard.habits.needs", needs, { count: needs })}</b>
          )}
        </div>
      )}
      <Card className="flex flex-col !p-0">
        <ul className="divide-y divide-paper-line">
          {habits.map((habit) => {
            const on = checked.has(habit.id);
            const by = auto[habit.id];
            const { title, howTo } = habitText(habit, locale);
            const link = habitLink(businessId, habit.id, locale);
            const tags: Array<{ key: string; text: string; tone: "auto" | "score" | "plain" }> = [];
            if (by) tags.push({ key: "auto", text: t(locale, H(by === "sent" ? "tag.autoSent" : "tag.autoSeen")), tone: "auto" });
            else if (habit.check === "google" && connected) tags.push({ key: "can", text: t(locale, H("tag.autoCan")), tone: "auto" });
            else if (habit.check === "postscore") tags.push({ key: "offer", text: t(locale, H("tag.offerAuto")), tone: "auto" });
            else tags.push({ key: "self", text: t(locale, H("tag.self")), tone: "plain" });
            if (habit.id === "seasonal_idea") tags.unshift({ key: "seasonal", text: t(locale, H("tag.seasonal")), tone: "plain" });
            if (habit.score) tags.push({ key: "score", text: t(locale, H(habit.score === "reviews" ? "tag.scoreReviews" : "tag.scorePhotos")), tone: "score" });
            return (
              <li key={habit.id} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2 px-4 py-4 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center sm:px-5" data-testid={`habit-${habit.id}`} data-done={on || undefined} data-auto={by ?? undefined}>
                <button
                  type="button"
                  ref={(el) => {
                    boxes.current[habit.id] = el;
                  }}
                  role="checkbox"
                  aria-checked={on}
                  aria-label={t(locale, H("mark"), { title })}
                  // PostScore's own check (it saw or sent it): nothing for the owner to undo.
                  disabled={pending || !!by}
                  onClick={() => toggle(habit.id)}
                  className={cn("mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border-2 transition-colors sm:mt-0", on ? "border-green bg-green text-white" : "border-[#cfc8b6] bg-white text-transparent hover:border-ink-soft", by && "cursor-default")}
                  data-testid="habit-box"
                >
                  <IconCheck size={16} stroke={3} aria-hidden />
                </button>
                <div className="min-w-0">
                  <p className={cn("text-[15px] font-semibold", on ? "text-ink-mute line-through decoration-[#b9c2cf]" : "text-ink")}>{title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-mute">{howTo}</p>
                  {habit.id === "post_update" && postDay && (
                    <p className="mt-0.5 text-[12.5px] font-medium text-ink-soft" data-testid="habit-best-day">
                      {t(locale, H("post.bestDay"), { day: weekdayName(postDay.weekday, locale), days: t(locale, `dashboard.googleTab.s2.dayGroup.${postDay.busiest}` as MessageKey) })}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag.key}
                        data-testid={`habit-tag-${tag.key}`}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11.5px] font-semibold",
                          tag.tone === "auto" ? "border-[#d3e0f3] bg-[#eaf1fb] text-[#2f5687]" : tag.tone === "score" ? "border-[#ead7b0] bg-[#faf3e4] text-[#8a6420]" : "border-paper-deep bg-white text-ink-soft"
                        )}
                      >
                        {tag.text}
                      </span>
                    ))}
                  </div>
                  {failed === habit.id && <p className="mt-1 text-[12.5px] text-red">{t(locale, H("failed"))}</p>}
                </div>
                <Link href={link.href} className="col-start-2 inline-flex w-fit items-center rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-soft sm:col-start-3" data-testid={`habit-link-${habit.id}`}>
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="mt-2 px-1 text-[12.5px] text-ink-mute">{t(locale, H("reset"))}</p>
      {!connected && <p className="mt-1 px-1 text-[12.5px] text-ink-soft" data-testid="habit-connect">{t(locale, H("connect"))}</p>}
      {toast && (
        <div role="status" data-testid="habit-toast" className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_45%,white)] bg-white px-4 py-3 shadow-card">
          <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass text-white">
            <IconTrophy size={16} />
          </span>
          <p className="flex-1 text-[13.5px] font-semibold text-ink">{t(locale, H("toast"))}</p>
          <button type="button" onClick={() => setToast(false)} aria-label={t(locale, "dashboard.websiteReviews.studio.close")} className="rounded-lg p-1 text-ink-mute hover:bg-paper hover:text-ink">
            <IconX size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
