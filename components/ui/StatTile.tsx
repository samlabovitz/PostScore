import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value?: string | number | null;
  className?: string;
}

export function StatTile({ label, value = "—", className }: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">
        {label}
      </span>
      <span className="font-serif text-[26px] font-semibold text-ink">
        {value}
      </span>
    </div>
  );
}
