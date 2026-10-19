"use client";

// "Add your hours" / "Edit for the website" — the starter-site builder's
// hours editor. Hours entered here appear on the generated website (and
// its schema.org openingHours) only; they never count toward the Google
// listing part of PostScore (lib/ownerHours.ts).

import { useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import {
  DAY_NAMES,
  OWNER_HOURS_NOTE_MAX,
  TIME_OPTIONS,
  copyMondayToAll,
  formatTime,
  sameEveryWeekday,
  sameSchedule,
  validateOwnerHours,
  type DayHours,
  type OwnerHours,
} from "@/lib/ownerHours";
import { saveStarterSiteHours } from "@/app/actions/starterSiteHours";

const k = (key: string) => `dashboard.website.starter.hours.${key}` as MessageKey;
const SELECT = "rounded-md border border-paper-deep bg-white px-1.5 py-1 text-[12.5px] text-ink outline-none focus:border-ink-soft";

/** The note under the Hours row (and in the editor) when the website's
 * hours aren't Google's. */
export function HoursDifferNote() {
  const locale = useLocale();
  return (
    <p data-testid="hours-differ" className="rounded-md bg-amber/10 px-2.5 py-1.5 text-[12px] text-ink">
      {t(locale, k("differ"))}
    </p>
  );
}

/** Points to the Action plan's Google hours step — Google is where the
 * hours count. */
export function HoursGoogleTip({ businessId }: { businessId: string }) {
  const locale = useLocale();
  return (
    <p className="text-[12px] text-ink-soft">
      {t(locale, k("tip"))}{" "}
      <Link href={`/business/${businessId}/growth#task-completeness-hours`} className="inline-flex items-center gap-0.5 font-semibold text-ink underline-offset-2 hover:underline">
        {t(locale, k("tipLink"))}
        <IconArrowRight size={12} aria-hidden />
      </Link>
    </p>
  );
}

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const locale = useLocale();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={SELECT}>
      {TIME_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {formatTime(opt, locale)}
        </option>
      ))}
    </select>
  );
}

export function StarterHoursEditor({
  businessId,
  initial,
  googleHours,
  onApply,
  onClose,
}: {
  businessId: string;
  /** Saved owner hours, else Google's, else a 9–5 weekday starting point. */
  initial: OwnerHours;
  /** Google's hours as a schedule (null when Google has none). */
  googleHours: OwnerHours | null;
  /** The hours to use on the website now (null = back to Google's). */
  onApply: (hours: OwnerHours | null) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const [hours, setHours] = useState<OwnerHours>(initial);
  const [save, setSave] = useState<{ kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string }>({ kind: "idle" });
  const errors = validateOwnerHours(hours);
  const valid = errors.every((e) => e === null);
  const differs = googleHours !== null && !sameSchedule(hours, googleHours);

  const setDay = (i: number, patch: Partial<DayHours>) => setHours((h) => ({ ...h, days: h.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const setRange = (i: number, r: number, field: "open" | "close", value: string) =>
    setHours((h) => ({ ...h, days: h.days.map((d, j) => (j === i ? { ...d, ranges: d.ranges.map((x, n) => (n === r ? { ...x, [field]: value } : x)) } : d)) }));

  async function persist(next: OwnerHours | null) {
    setSave({ kind: "saving" });
    onApply(next);
    const result = await saveStarterSiteHours(businessId, next).catch(() => ({ status: "error" as const, message: "" }));
    if (result.status === "ok") {
      setSave({ kind: "idle" });
      onClose();
    } else if (result.status === "not_enabled" || result.status === "error") {
      // Still on the preview and in the download — just not remembered.
      setSave({ kind: "error", message: t(locale, k("notSaved")) });
    } else {
      setSave({ kind: "error", message: t(locale, k("invalid")) });
    }
  }

  return (
    <div data-testid="hours-editor" className="mt-2 flex flex-col gap-3 rounded-lg border border-paper-deep bg-paper p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t(locale, k("modeLabel"))}>
        {(["weekly", "appointment"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={hours.mode === mode}
            onClick={() => setHours((h) => ({ ...h, mode }))}
            className={cn("rounded-full border px-3 py-1 text-[12.5px] font-medium", hours.mode === mode ? "border-brass bg-brass/10 text-ink" : "border-paper-deep bg-white text-ink-soft")}
          >
            {t(locale, k(mode === "weekly" ? "modeWeekly" : "modeAppointment"))}
          </button>
        ))}
      </div>

      {hours.mode === "weekly" ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setHours(sameEveryWeekday)} className="rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] font-semibold text-ink hover:border-ink-mute">
              {t(locale, k("sameWeekdays"))}
            </button>
            <button type="button" onClick={() => setHours(copyMondayToAll)} className="rounded-md border border-paper-deep bg-white px-2 py-1 text-[12px] font-semibold text-ink hover:border-ink-mute">
              {t(locale, k("copyMonday"))}
            </button>
          </div>
          <ul className="flex flex-col divide-y divide-paper-line rounded-md border border-paper-deep bg-white">
            {hours.days.map((day, i) => (
              <li key={i} data-testid="hours-day" className="flex flex-col gap-1.5 px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="w-24 text-[13px] font-semibold text-ink">{DAY_NAMES[locale][i]}</span>
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
                    <input type="checkbox" checked={day.open} onChange={(e) => setDay(i, { open: e.target.checked })} className="h-4 w-4 accent-brass" />
                    {day.open ? t(locale, k("open")) : t(locale, k("closed"))}
                  </label>
                  {day.open && (
                    <label className="flex items-center gap-1.5 text-[12.5px] text-ink">
                      <input type="checkbox" checked={day.allDay} onChange={(e) => setDay(i, { allDay: e.target.checked })} className="h-4 w-4 accent-brass" />
                      {t(locale, k("allDay"))}
                    </label>
                  )}
                </div>
                {day.open && !day.allDay && (
                  <div className="flex flex-col gap-1.5">
                    {day.ranges.map((r, n) => (
                      <div key={n} className="flex flex-wrap items-center gap-1.5">
                        <TimeSelect value={r.open} onChange={(v) => setRange(i, n, "open", v)} label={t(locale, k("opensAt"), { day: DAY_NAMES[locale][i] })} />
                        <span className="text-[12px] text-ink-mute">–</span>
                        <TimeSelect value={r.close} onChange={(v) => setRange(i, n, "close", v)} label={t(locale, k("closesAt"), { day: DAY_NAMES[locale][i] })} />
                        {n === 1 ? (
                          <button type="button" onClick={() => setDay(i, { ranges: day.ranges.slice(0, 1) })} aria-label={t(locale, k("removeRange"))} className="text-ink-soft hover:text-red">
                            <IconX size={14} />
                          </button>
                        ) : (
                          day.ranges.length === 1 && (
                            <button type="button" onClick={() => setDay(i, { ranges: [...day.ranges, { open: "17:00", close: "21:00" }] })} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-ink-soft hover:text-ink">
                              <IconPlus size={12} aria-hidden />
                              {t(locale, k("addRange"))}
                            </button>
                          )
                        )}
                      </div>
                    ))}
                    {day.ranges.some((r) => r.close < r.open) && !errors[i] && <span className="text-[11.5px] text-ink-mute">{t(locale, k("pastMidnight"))}</span>}
                    {errors[i] && (
                      <span role="alert" className="text-[12px] text-red">
                        {t(locale, k(errors[i] === "same_time" ? "errorSame" : "errorOverlap"))}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[12.5px] text-ink-soft">{t(locale, k("appointmentHelp"))}</p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[12.5px] font-medium text-ink-soft">
          {t(locale, k("noteLabel"))} <span className="font-normal text-ink-mute">{t(locale, k("optional"))}</span>
        </span>
        <input
          type="text"
          value={hours.note}
          maxLength={OWNER_HOURS_NOTE_MAX}
          onChange={(e) => setHours((h) => ({ ...h, note: e.target.value }))}
          placeholder={t(locale, k("notePlaceholder"))}
          className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
        />
        <span className="text-right text-[11px] text-ink-mute">
          {hours.note.length}/{OWNER_HOURS_NOTE_MAX}
        </span>
      </label>

      {differs && <HoursDifferNote />}
      <p className="text-[12px] text-ink-mute">{t(locale, k("websiteOnly"))}</p>
      <HoursGoogleTip businessId={businessId} />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="brass" size="sm" onClick={() => persist(hours)} disabled={!valid || save.kind === "saving"}>
          {save.kind === "saving" ? t(locale, k("saving")) : t(locale, k("save"))}
        </Button>
        <Button variant="default" size="sm" onClick={onClose}>
          {t(locale, k("cancel"))}
        </Button>
        {googleHours && (
          <button type="button" onClick={() => persist(null)} className="text-[12.5px] font-medium text-ink-soft underline hover:text-ink">
            {t(locale, k("useGoogle"))}
          </button>
        )}
      </div>
      {save.kind === "error" && (
        <p role="alert" className="text-[12px] text-amber">
          {save.message}
        </p>
      )}
    </div>
  );
}
