import { cn } from "@/lib/utils";

interface ScoreGaugeProps {
  score?: number | null;
  size?: number;
  className?: string;
}

const VIEWBOX = 180;
const RADIUS = 76;
const STROKE_WIDTH = 13;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreGauge({ score = null, size = 150, className }: ScoreGaugeProps) {
  const clamped = score == null ? null : Math.max(0, Math.min(100, score));
  const offset =
    clamped == null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - clamped / 100);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        width={size}
        height={size}
        className="-rotate-90"
      >
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
        />
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={RADIUS}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          stroke="var(--color-brass)"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-1000 ease-[cubic-bezier(0.4,0,0.2,1)]"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-serif text-[52px] font-bold leading-none text-white">
          {clamped == null ? "—" : Math.round(clamped)}
        </div>
        <div className="mt-1 text-[13px] text-[#9FB0C7]">/ 100</div>
      </div>
    </div>
  );
}
