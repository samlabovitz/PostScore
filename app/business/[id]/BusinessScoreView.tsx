"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { GradeBadge } from "@/components/ui/GradeBadge";
import { ScoreGauge } from "@/components/ui/ScoreGauge";
import { cn } from "@/lib/utils";
import { saveScoreSnapshot } from "@/app/actions/scoring";
import type { BusinessRecord, ScoreHistoryRow } from "@/app/actions/scoring";
import type {
  CategoryResult,
  Confidence,
  ScoreWithSuggestions,
} from "@/lib/scoring";

const CONFIDENCE_PILL: Record<Confidence, { variant: "green" | "brass" | "amber" | "neutral"; label: string }> = {
  VERIFIED: { variant: "green", label: "Verified" },
  LIKELY: { variant: "brass", label: "Likely" },
  UNCERTAIN: { variant: "amber", label: "Uncertain" },
  NOT_FOUND: { variant: "neutral", label: "Not found" },
};

function formatPoints(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function CategoryCard({ category }: { category: CategoryResult }) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-base font-semibold text-ink">{category.label}</h3>
        <span className="text-sm text-ink-mute">
          {formatPoints(category.earnedPoints)} / {formatPoints(category.possiblePoints)} pts
          <span className="ml-1.5 text-ink-mute/70">(of {category.weight} weight)</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-paper-line">
        {category.checks.map((check) => {
          const pill = CONFIDENCE_PILL[check.confidence];
          const isFull = check.earnedPoints !== null && check.earnedPoints >= check.maxPoints;
          return (
            <div key={check.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink">{check.label}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-sm tabular-nums",
                      check.earnedPoints === null
                        ? "text-ink-mute"
                        : isFull
                          ? "text-green"
                          : "text-ink-soft"
                    )}
                  >
                    {formatPoints(check.earnedPoints)} / {check.maxPoints}
                  </span>
                  <Pill variant={pill.variant}>{pill.label}</Pill>
                </div>
              </div>
              <p className="text-[13px] text-ink-mute">{check.explanation}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SaveScanControl({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleSave() {
    setState({ kind: "saving" });
    const result = await saveScoreSnapshot(businessId);
    if (result.status === "saved") {
      setState({ kind: "saved" });
      router.refresh();
    } else if (result.status === "error") {
      setState({ kind: "error", message: result.message });
    } else {
      setState({ kind: "error", message: "Could not save this scan." });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="brass" size="sm" onClick={handleSave} disabled={state.kind === "saving"}>
        {state.kind === "saving" ? "Saving scan..." : "Save this scan to history"}
      </Button>
      {state.kind === "saved" && <span className="text-sm text-green">Saved.</span>}
      {state.kind === "error" && <span className="text-sm text-red">{state.message}</span>}
    </div>
  );
}

export function BusinessScoreView({
  businessId,
  business,
  result,
  history,
}: {
  businessId: string;
  business: BusinessRecord;
  result: ScoreWithSuggestions;
  history: ScoreHistoryRow[];
}) {
  const { breakdown, suggestions, projectedBreakdown } = result;

  return (
    <div className="flex flex-col gap-6 nav:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">
            {business.name ?? "Untitled business"}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{business.address ?? "No address on file"}</p>
          <p className="mt-1 text-xs text-ink-mute">
            Scoring version {breakdown.scoringVersion} · computed live from the saved Google Places
            data below
          </p>
        </div>
        <SaveScanControl businessId={businessId} />
      </div>

      <SectionHeading title="Current score" />
      <div className="rounded-2xl bg-gradient-to-br from-[#1c2f4c] to-[#111f34] p-5 shadow-card sm:p-6 nav:p-8">
        <div className="grid grid-cols-1 items-center gap-6 nav:grid-cols-[auto_1fr_1fr] nav:gap-8">
          <ScoreGauge score={breakdown.total} className="mx-auto nav:mx-0" />
          <div className="flex items-center gap-3">
            <GradeBadge grade={breakdown.grade} />
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9FB0C7]">
                Grade
              </div>
              <div className="text-sm text-white/70">
                {breakdown.total} / 100
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.05] p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-brass">
              Projected if all suggestions completed
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold text-white">
                {projectedBreakdown.total}
              </span>
              <span className="text-sm text-white/60">/ 100 · {projectedBreakdown.grade}</span>
            </div>
          </div>
        </div>
      </div>

      <SectionHeading title="Breakdown" />
      <div className="grid grid-cols-1 gap-4 nav:grid-cols-3">
        {breakdown.categories.map((category) => (
          <CategoryCard key={category.id} category={category} />
        ))}
      </div>

      <SectionHeading title={`Suggestions (${suggestions.length})`} />
      {suggestions.length === 0 ? (
        <Card className="p-5 text-sm text-ink-soft">
          Every determinable check is already earning full points. Nothing to suggest right now.
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-col divide-y divide-paper-line">
            {suggestions.map((s) => (
              <div key={s.checkId} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-medium text-ink">{s.advice}</div>
                  <div className="mt-0.5 text-[12px] text-ink-mute">
                    {s.label} · from check <code className="text-[11px]">{s.checkId}</code>
                  </div>
                </div>
                <Pill variant="brass" className="shrink-0">
                  +{formatPoints(s.promisedPoints)} pts
                </Pill>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
            Each fix above is guaranteed to move its own check to full points. The projected score
            ({projectedBreakdown.total}) is computed by actually re-running the scoring engine on
            simulated fixed data — not by adding these numbers up — so it can move by more or less
            than their sum if fixing one thing also changes what another check can verify (for
            example, adding a website also makes the HTTPS check determinable).
          </p>
        </Card>
      )}

      <SectionHeading title="Scan history" />
      <Card className="p-5">
        {history.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No saved scans yet — click &quot;Save this scan to history&quot; above to record the
            current score.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-mute">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Grade</th>
                <th className="pb-2 font-medium">Version</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-t border-paper-line">
                  <td className="py-2 text-ink">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 text-ink">{row.total}</td>
                  <td className="py-2 text-ink">{row.grade}</td>
                  <td className="py-2 text-ink-mute">{row.scoring_version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
