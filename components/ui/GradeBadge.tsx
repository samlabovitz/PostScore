import { cn } from "@/lib/utils";

type Grade = "A" | "B" | "C" | "D" | "F";

interface GradeBadgeProps {
  grade?: Grade | null;
  className?: string;
}

const gradeClasses: Record<Grade, string> = {
  A: "bg-green/10 text-green",
  B: "bg-green/10 text-green",
  C: "bg-amber/10 text-amber",
  D: "bg-amber/10 text-amber",
  F: "bg-red/10 text-red",
};

export function GradeBadge({ grade = null, className }: GradeBadgeProps) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-lg font-serif text-lg font-bold",
        grade ? gradeClasses[grade] : "bg-ink/5 text-ink-mute",
        className
      )}
    >
      {grade ?? "—"}
    </div>
  );
}
