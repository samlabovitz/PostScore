import { cn } from "@/lib/utils";

/** A plain horizontal progress bar. `percent` null renders an empty
 * track with no fill — an honest "nothing to show yet" rather than a
 * fake zero-width sliver that looks like real data. */
export function ProgressBar({
  percent,
  className,
}: {
  percent: number | null;
  className?: string;
}) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-paper-deep", className)}>
      {percent !== null && (
        <div
          className="h-full rounded-full bg-brass transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      )}
    </div>
  );
}
