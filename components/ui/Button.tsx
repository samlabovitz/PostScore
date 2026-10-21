import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "default" | "primary" | "brass";
type ButtonSize = "default" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-white text-ink border border-paper-deep hover:border-ink-soft",
  primary: "bg-ink text-white border border-ink hover:bg-[#0e1a2f]",
  brass: "bg-brass text-white border border-brass hover:bg-[#a5772a]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "text-sm px-5 py-[11px]",
  sm: "text-[13px] px-[15px] py-[7px]",
};

/** The same classes as <Button> — for a control that must look like one
 * (e.g. a locked action opening the promo box). */
export function buttonClasses(variant: ButtonVariant = "default", size: ButtonSize = "default", className?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "default", size = "default", ...props },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={buttonClasses(variant, size, className)}
        {...props}
      />
    );
  }
);
