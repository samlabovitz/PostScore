"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { GRADE_THRESHOLDS } from "@/lib/scoring";
import type { ReportsScoreRow } from "@/app/actions/reports";

type RangeKey = "week" | "6m" | "all";

const RANGE_OPTIONS: SegmentedControlOption<RangeKey>[] = [
  { value: "week", label: "Weekly" },
  { value: "6m", label: "6 months" },
  { value: "all", label: "All time" },
];

const RANGE_LABEL: Record<RangeKey, string> = {
  week: "the last week",
  "6m": "the last 6 months",
  all: "all time",
};

function cutoffFor(range: RangeKey): number | null {
  if (range === "week") return Date.now() - 7 * 86_400_000;
  if (range === "6m") {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.getTime();
  }
  return null;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysAgoLabel(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 220;
const PAD_LEFT = 34;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 26;

/** A real score-over-time line chart — plots exactly the scans in the
 * `history` prop (every saved row in `scores`, oldest first), never a
 * fabricated or interpolated point. When the selected range doesn't have
 * at least two real scans to draw a line between, this shows an honest
 * "not enough history yet" state instead of a fake or flat line. */
export function ScoreHistoryChart({ history }: { history: ReportsScoreRow[] }) {
  const [range, setRange] = useState<RangeKey>("6m");

  const filtered = useMemo(() => {
    const cutoff = cutoffFor(range);
    if (cutoff === null) return history;
    return history.filter((row) => new Date(row.created_at).getTime() >= cutoff);
  }, [history, range]);

  const changeOverRange =
    filtered.length >= 2 ? filtered[filtered.length - 1].total - filtered[0].total : null;

  const last = history[history.length - 1] ?? null;

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-serif text-base font-semibold text-ink">Score over time</h3>
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      <div className="mt-5">
        {history.length === 0 ? (
          <EmptyState message="You haven't run a scan yet — re-scan from the Overview page to start your history." />
        ) : filtered.length < 2 ? (
          <EmptyState message="Not enough history yet — your chart fills in as you re-scan." />
        ) : (
          <>
            <Chart points={filtered} />
            <PointsLegend points={filtered} />
          </>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6 border-t border-paper-line pt-4 sm:w-fit sm:grid-cols-3 sm:gap-10">
        <StatTile
          label={`Change · ${RANGE_LABEL[range]}`}
          value={
            changeOverRange === null
              ? "—"
              : changeOverRange === 0
                ? "No change"
                : changeOverRange > 0
                  ? `+${changeOverRange}`
                  : `${changeOverRange}`
          }
        />
        <StatTile label="Total scans recorded" value={history.length} />
        <StatTile label="Last scan" value={last ? daysAgoLabel(last.created_at) : "—"} />
      </div>
    </Card>
  );
}

/** The exact value behind every dot on the chart, always visible rather
 * than hidden behind hover — works on touch devices and gives precise
 * numbers a line chart alone can't. Newest first; capped so a long
 * "All time" range doesn't turn into an unreadable wall of chips. */
function PointsLegend({ points }: { points: ReportsScoreRow[] }) {
  const newestFirst = [...points].reverse();
  const shown = newestFirst.slice(0, 12);
  const hiddenCount = newestFirst.length - shown.length;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {shown.map((p) => (
        <span
          key={p.id}
          className="rounded-md bg-paper px-2 py-1 text-[11px] tabular-nums text-ink-soft"
        >
          {formatShortDate(p.created_at)} · {p.total} ({p.grade})
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="rounded-md px-2 py-1 text-[11px] text-ink-mute">+{hiddenCount} earlier</span>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-paper-deep bg-paper/60 px-6 text-center text-sm text-ink-soft">
      {message}
    </div>
  );
}

/** Real grade bands (from GRADE_THRESHOLDS in lib/scoring.ts) drawn as
 * faint background tints so a glance at the line's height tells you
 * roughly what grade it was scoring, using the engine's own real
 * thresholds — never hand-picked cutoffs. */
function gradeBands(yFor: (score: number) => number) {
  const bands: { top: number; bottom: number; color: string }[] = [];
  const sorted = [...GRADE_THRESHOLDS].sort((a, b) => b.min - a.min);
  for (let i = 0; i < sorted.length; i++) {
    const min = sorted[i].min;
    const max = i === 0 ? 100 : sorted[i - 1].min;
    const color = min >= 80 ? "#2e6b45" : min >= 60 ? "#c77d28" : "#b23a2f";
    bands.push({ top: yFor(max), bottom: yFor(min), color });
  }
  return bands;
}

function Chart({ points }: { points: ReportsScoreRow[] }) {
  const innerWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const minTime = new Date(points[0].created_at).getTime();
  const maxTime = new Date(points[points.length - 1].created_at).getTime();
  const timeSpan = maxTime - minTime;

  const xFor = (iso: string) => {
    if (timeSpan === 0) return PAD_LEFT + innerWidth / 2;
    const t = new Date(iso).getTime();
    return PAD_LEFT + ((t - minTime) / timeSpan) * innerWidth;
  };
  const yFor = (score: number) => PAD_TOP + (1 - Math.max(0, Math.min(100, score)) / 100) * innerHeight;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.created_at).toFixed(1)} ${yFor(p.total).toFixed(1)}`)
    .join(" ");

  const bands = gradeBands(yFor);
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <svg
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      className="h-[220px] w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Score over time, ${points.length} scans, from ${points[0].total} to ${points[points.length - 1].total}`}
    >
      {bands.map((band, i) => (
        <rect
          key={i}
          x={PAD_LEFT}
          y={band.top}
          width={innerWidth}
          height={Math.max(0, band.bottom - band.top)}
          fill={band.color}
          opacity={0.05}
        />
      ))}

      {gridLines.map((g) => (
        <g key={g}>
          <line
            x1={PAD_LEFT}
            x2={CHART_WIDTH - PAD_RIGHT}
            y1={yFor(g)}
            y2={yFor(g)}
            stroke="#e0dac8"
            strokeWidth={1}
          />
          <text x={PAD_LEFT - 8} y={yFor(g) + 3} textAnchor="end" fontSize={10} fill="#6b7890">
            {g}
          </text>
        </g>
      ))}

      <path d={linePath} fill="none" stroke="#b8862f" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <circle
            key={p.id}
            cx={xFor(p.created_at)}
            cy={yFor(p.total)}
            r={isLast ? 5 : 3.5}
            fill={isLast ? "#b8862f" : "#ffffff"}
            stroke="#b8862f"
            strokeWidth={2}
          />
        );
      })}

      <text x={xFor(points[0].created_at)} y={CHART_HEIGHT - 6} textAnchor="start" fontSize={11} fill="#6b7890">
        {formatShortDate(points[0].created_at)}
      </text>
      <text
        x={xFor(points[points.length - 1].created_at)}
        y={CHART_HEIGHT - 6}
        textAnchor="end"
        fontSize={11}
        fill="#6b7890"
      >
        {formatShortDate(points[points.length - 1].created_at)}
      </text>
    </svg>
  );
}
