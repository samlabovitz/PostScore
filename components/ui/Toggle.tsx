"use client";

import { cn } from "@/lib/utils";

/** A small accessible on/off switch — a real `role="switch"` button, not
 * a styled checkbox hidden behind a label, so screen readers announce
 * its state correctly. Purely presentational: the caller owns the
 * checked state and what onChange actually persists. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:pointer-events-none disabled:opacity-45",
        checked ? "border-brass bg-brass" : "border-paper-deep bg-paper-deep"
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-card transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
