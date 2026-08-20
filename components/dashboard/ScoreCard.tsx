import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { GradeBadge } from "@/components/ui/GradeBadge";

export function ScoreCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1c2f4c] to-[#111f34] p-5 shadow-card sm:p-6 nav:p-8">
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30"
        style={{
          background:
            "radial-gradient(circle, var(--color-brass) 0%, transparent 70%)",
        }}
      />

      <div className="relative grid grid-cols-1 items-center gap-6 nav:grid-cols-[auto_1fr_1fr] nav:gap-8">
        <ScoreGauge className="mx-auto nav:mx-0" />

        <div className="flex items-center gap-3">
          <GradeBadge />
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9FB0C7]">
              Grade
            </div>
            <div className="text-sm text-white/70">—</div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[.05] p-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-brass">
            Biggest opportunity
          </div>
          <div className="mt-1 text-sm text-white/70">—</div>
        </div>
      </div>
    </div>
  );
}
