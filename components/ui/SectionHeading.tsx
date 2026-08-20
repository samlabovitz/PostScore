import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeadingProps {
  title: string;
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({ title, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <h2 className="whitespace-nowrap font-serif text-lg font-semibold text-ink">
        {title}
      </h2>
      <div className="h-px flex-1 bg-paper-line" />
      {action}
    </div>
  );
}
