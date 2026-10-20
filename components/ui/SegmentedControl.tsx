"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  /** Optional icon after the label (e.g. a lock on a Premium tab). */
  icon?: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** "sm" fits four options in a 375px-wide phone screen. */
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex w-fit gap-1 rounded-xl border border-paper-deep bg-paper p-1",
        className
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1.5 text-[12.5px]" : "px-4 py-2 text-[13px]",
            value === option.value
              ? "bg-white text-ink shadow-card"
              : "text-ink-soft hover:text-ink"
          )}
        >
          {option.icon ? (
            <span className="inline-flex items-center gap-1.5">
              {option.label}
              {option.icon}
            </span>
          ) : (
            option.label
          )}
        </button>
      ))}
    </div>
  );
}
