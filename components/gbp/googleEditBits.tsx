"use client";

// The pieces every "Edit on Google" change shares (hours, phone,
// description, the ordering / booking link): Approve with its Beta label,
// the locked look when editing is off for the business (not on the live
// allow list), and the message tones — green for done, neutral or amber
// while waiting, red only for real failures.

import { IconBrandGoogle, IconLock } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

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
