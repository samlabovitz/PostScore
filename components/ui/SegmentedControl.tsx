"use client";

import { cn } from "@/lib/utils";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
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
            "rounded-lg px-4 py-2 text-[13px] font-medium transition-colors",
            value === option.value
              ? "bg-white text-ink shadow-card"
              : "text-ink-soft hover:text-ink"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
