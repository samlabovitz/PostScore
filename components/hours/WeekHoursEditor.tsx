"use client";

// A week of hours, Monday to Sunday — the one editor behind the Google
// Profile tab's "Edit on Google" (components/gbp/ProfileEditsOnGoogle.tsx)
// and Settings → "Your business details" (components/settings/OwnerDetailsCard.tsx),
// so both look and work the same. Each day: Open / Closed, then its
// opening and closing times (components/hours/TimePicker.tsx), "Add
// hours" for a split shift, "Open 24 hours". Monday copies to the other
// weekdays, or to every day. A close before its open runs past midnight
// ("until 2:00 AM next day"). Problems from lib/gbpProfileEdits.ts hoursProblems.

import { IconCopy, IconPlus, IconX } from "@tabler/icons-react";
import { TimePicker } from "@/components/hours/TimePicker";
import { hoursProblems, WEEK_ORDER, type DayHours, type WeeklyHours } from "@/lib/gbpProfileEdits";
import { copyToWeekdays, dayName, overnightNote, sameEveryDay } from "@/lib/hoursEditor";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.gbpProfileEdits.hours.${key}` as MessageKey;
const E = (key: string) => `dashboard.hoursEditor.${key}` as MessageKey;
const DEFAULT_RANGE = { open: 9 * 60, close: 17 * 60 };
const LINK = "inline-flex w-fit items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink";

export function WeekHoursEditor({ value, onChange, maxRanges }: { value: WeeklyHours; onChange: (week: WeeklyHours) => void; maxRanges: number }) {
  const locale = useLocale();
  const problems = hoursProblems(value);
  const setDay = (day: number, d: DayHours) => onChange(value.map((x, i) => (i === day ? d : x)));
  const words = { nextDay: (time: string) => t(locale, E("untilNextDay"), { time }), midnight: t(locale, E("untilMidnight")) };

  return (
    <div className="flex flex-col gap-2" data-testid="hours-editor">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button type="button" onClick={() => onChange(sameEveryDay(value))} className={LINK} data-testid="hours-same-every-day">
          <IconCopy size={13} aria-hidden />
          {t(locale, E("sameEveryDay"))}
        </button>
      </div>
      {WEEK_ORDER.map((day) => {
        const d = value[day];
        const name = dayName(day, locale);
        const open = d.mode !== "closed";
        const dayProblems = problems.filter((p) => p.day === day);
        return (
          <div key={day} data-testid={`hours-day-${day}`} className={cn("flex flex-col gap-1.5 rounded-lg border bg-white p-2.5", dayProblems.length ? "border-red/50" : "border-paper-deep")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-[13px] font-semibold text-ink">{name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={open}
                aria-label={name}
                data-testid={`hours-toggle-${day}`}
                onClick={() => setDay(day, open ? { mode: "closed" } : { mode: "open", ranges: [{ ...DEFAULT_RANGE }] })}
                className="inline-flex items-center gap-2 text-[13px] text-ink"
              >
                <span className={cn("relative h-5 w-9 rounded-full transition-colors", open ? "bg-green" : "bg-paper-deep")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", open ? "left-[18px]" : "left-0.5")} />
                </span>
                {t(locale, K(open ? "open" : "closed"))}
              </button>
              {open && (
                <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                  <input
                    type="checkbox"
                    checked={d.mode === "open24"}
                    data-testid={`hours-24-${day}`}
                    onChange={(e) => setDay(day, e.target.checked ? { mode: "open24" } : { mode: "open", ranges: [{ ...DEFAULT_RANGE }] })}
                  />
                  {t(locale, K("open24"))}
                </label>
              )}
              {day === 1 && (
                <button type="button" onClick={() => onChange(copyToWeekdays(value))} className={cn(LINK, "ml-auto")} data-testid="hours-copy-weekdays">
                  <IconCopy size={13} aria-hidden />
                  {t(locale, E("copyWeekdays"))}
                </button>
              )}
            </div>
            {d.mode === "open" && (
              <div className="flex flex-col gap-1.5 sm:pl-[104px]">
                {d.ranges.map((r, i) => {
                  const note = overnightNote(r.open, r.close, locale, words);
                  const setRange = (next: { open?: number; close?: number }) => setDay(day, { mode: "open", ranges: d.ranges.map((x, j) => (j === i ? { ...x, ...next } : x)) });
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
                      <TimePicker value={r.open} onChange={(open) => setRange({ open })} label={`${name} — ${t(locale, K("opens"))}`} testId={`hours-open-${day}-${i}`} />
                      <span aria-hidden>–</span>
                      <TimePicker value={r.close} onChange={(close) => setRange({ close })} label={`${name} — ${t(locale, K("closes"))}`} testId={`hours-close-${day}-${i}`} />
                      {note && (
                        <span className="text-[12px] text-ink-soft" data-testid={`hours-overnight-${day}-${i}`}>
                          {note}
                        </span>
                      )}
                      {d.ranges.length > 1 && (
                        <button type="button" onClick={() => setDay(day, { mode: "open", ranges: d.ranges.filter((_, j) => j !== i) })} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-ink-soft hover:text-ink">
                          <IconX size={12} aria-hidden />
                          {t(locale, K("remove"))}
                        </button>
                      )}
                    </div>
                  );
                })}
                {d.ranges.length < maxRanges && (
                  <button
                    type="button"
                    data-testid={`hours-add-${day}`}
                    onClick={() => {
                      const last = d.ranges[d.ranges.length - 1];
                      const start = last ? Math.min(last.close + 60, 23 * 60) : 9 * 60;
                      setDay(day, { mode: "open", ranges: [...d.ranges, { open: start, close: Math.min(start + 120, 23 * 60 + 45) }] });
                    }}
                    className={LINK}
                  >
                    <IconPlus size={13} aria-hidden />
                    {t(locale, K("addRange"))}
                  </button>
                )}
              </div>
            )}
            {dayProblems.map((p, i) => (
              <p key={i} role="alert" className="text-[12.5px] text-red sm:pl-[104px]">
                {t(locale, K(`problem.${p.problem}`))}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
