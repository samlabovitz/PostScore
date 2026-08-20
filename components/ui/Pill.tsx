import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type PillVariant = "brass" | "green" | "red" | "amber" | "neutral";

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant;
}

const variantClasses: Record<PillVariant, string> = {
  brass: "bg-brass/10 text-brass",
  green: "bg-green/10 text-green",
  red: "bg-red/10 text-red",
  amber: "bg-amber/10 text-amber",
  neutral: "bg-ink/5 text-ink-soft",
};

export function Pill({ variant = "neutral", className, ...props }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
