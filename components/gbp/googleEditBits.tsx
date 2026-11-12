"use client";

// The pieces every "Edit on Google" change shares (hours, phone,
// description, the ordering / booking link, the website link, customer
// details): Approve with its Beta label, the locked look when changes to
// Google are off for the business (not on GOOGLE_WRITES_LIVE_PLACES), the
// practice-mode chooser, and the message tones — green for done, neutral
// or amber while waiting, red only for real failures.

import { useState } from "react";
import { IconBrandGoogle, IconFlask, IconLock } from "@tabler/icons-react";
import { formatShortDate, t, useLocale, useTimeZone, type MessageKey } from "@/lib/i18n";

const K = (key: string) => `dashboard.gbpProfileEdits.${key}` as MessageKey;

export const TONE = {
  done: "font-semibold text-green",
  waiting: "rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] px-3 py-2 text-ink",
  neutral: "text-ink-soft",
  failure: "text-red",
} as const;

/** Read-only: Approve and Undo look the same — grey, a lock, the tooltip on a wrapper. */
export function LockedButton({ label, testId }: { label: string; testId: string }) {
  const locale = useLocale();
  const tip = t(locale, K("editingOff"));
  return (
    <span title={tip} className="inline-flex">
      <button type="button" disabled aria-disabled="true" data-testid={testId} data-locked="true" aria-label={`${label} — ${tip}`} className="inline-flex cursor-not-allowed items-center gap-1 rounded-lg border border-paper-deep bg-paper px-3.5 py-2 text-[13px] font-medium text-ink-mute">
        <IconLock size={12} aria-hidden />
        {label}
      </button>
    </span>
  );
}

export function ApproveButton({ canEdit, busy, disabled, onClick, testId, label }: { canEdit: boolean; busy: boolean; disabled: boolean; onClick: () => void; testId: string; label?: string }) {
  const locale = useLocale();
  if (!canEdit) return <LockedButton label={label ?? t(locale, K("approve"))} testId={testId} />;
  return (
    <button type="button" data-testid={testId} disabled={busy || disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper disabled:cursor-not-allowed disabled:opacity-50">
      <IconBrandGoogle size={14} aria-hidden />
      {busy ? t(locale, K("approving")) : (label ?? t(locale, K("approve")))}
      <span data-testid="beta-label" className="rounded bg-[color:color-mix(in_srgb,var(--color-paper)_20%,transparent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em]">
        {t(locale, K("beta"))}
      </span>
    </button>
  );
}

export type PracticeOutcome = "accept" | "refuse" | "hold";

/** Practice mode: "Nothing is sent to Google", and what the practice Google does with the next Approve. */
export function PracticeChooser({ outcome, onChange, testId = "practice-outcome" }: { outcome: PracticeOutcome; onChange: (o: PracticeOutcome) => void; testId?: string }) {
  const locale = useLocale();
  return (
    <div data-testid={`${testId}-banner`} role="status" className="flex flex-col gap-1.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_45%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_10%,white)] px-3 py-2 text-[12.5px] text-ink">
      <p className="flex items-center gap-2 font-semibold">
        <IconFlask size={15} aria-hidden />
        {t(locale, K("practiceBanner"))}
      </p>
      <label className="flex flex-wrap items-center gap-2 text-ink-soft">
        {t(locale, K("practiceBody"))}
        <select data-testid={testId} value={outcome} onChange={(e) => onChange(e.target.value as PracticeOutcome)} className="rounded-lg border border-paper-deep bg-white px-2 py-1 text-[12.5px] text-ink">
          {(["accept", "refuse", "hold"] as PracticeOutcome[]).map((o) => (
            <option key={o} value={o}>
              {t(locale, K(`practiceOutcome.${o}`))}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Real Google, but changes are off for this business: what's shown is read-only. */
export function ReadOnlyNote({ testId }: { testId: string }) {
  const locale = useLocale();
  return (
    <p data-testid={testId} className="flex items-start gap-2 rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[12.5px] leading-snug text-ink">
      <IconLock size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
      {t(locale, K("readOnly"))}
    </p>
  );
}

/** "You can undo this until {date}. Undo" → the confirm step → "Yes, undo"
 * (locked when changes to Google are off for the business). The Booking
 * link card's look, shared by the website link and customer details. */
export function UndoLine({ until, confirmText, canEdit, busy, onUndo, testId }: { until: string; confirmText: string; canEdit: boolean; busy: boolean; onUndo: () => void; testId: string }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [confirming, setConfirming] = useState(false);
  if (confirming || busy) {
    return (
      <div role="alertdialog" data-testid={`${testId}-confirm`} className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-deep bg-white p-2.5 text-[13px] text-ink">
        <span>{confirmText}</span>
        {canEdit ? (
          <button type="button" data-testid={`${testId}-yes`} disabled={busy} onClick={() => (setConfirming(false), onUndo())} className="rounded-lg border border-ink bg-ink px-3 py-1 text-[13px] font-semibold text-paper disabled:opacity-50">
            {busy ? t(locale, K("approving")) : t(locale, K("undoYes"))}
          </button>
        ) : (
          <LockedButton label={t(locale, K("undoYes"))} testId={`${testId}-yes`} />
        )}
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg border border-paper-deep bg-white px-3 py-1 text-[13px] font-medium text-ink">
          {t(locale, K("cancel"))}
        </button>
      </div>
    );
  }
  return (
    <p data-testid={testId} className="text-[12.5px] text-ink-soft">
      {t(locale, K("undoUntil"), { date: formatShortDate(until, locale, timeZone) })}{" "}
      <button type="button" data-testid={`${testId}-button`} onClick={() => setConfirming(true)} className="font-semibold text-ink underline underline-offset-2">
        {t(locale, K("undo"))}
      </button>
    </p>
  );
}
