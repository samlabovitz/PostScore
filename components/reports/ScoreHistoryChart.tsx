"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/SegmentedControl";
import { GRADE_THRESHOLDS } from "@/lib/scoring";
import type { ReportsScoreRow } from "@/app/actions/reports";
import {
  calendarDaysAgo,
  formatDateTime,
  formatMonthDay,
  formatShortDate,
  t,
  tPlural,
  useLocale,
  type Locale,
  type MessageKey,
} from "@/lib/i18n";
import {
  CHART_CATEGORY_IDS,
  DEFAULT_RANGE,
  RANGE_KEYS,
  dailyPoints,
  groupOverlappingMarkers,
  hasEnoughForLine,
  historyRows,
  inRange,
  summarizeRange,
  versionMarkerIndexes,
  zoomedDomain,
  type ChartCategoryId,
  type DayPoint,
  type HistoryScan,
  type RangeKey,
} from "@/lib/scoreHistory";
import { cn } from "@/lib/utils";

// Colors: the overall line is PostScore brass; the three category lines
// use a validated categorical set (dataviz validator: lightness band,
// chroma, CVD and normal-vision separation, 3:1 contrast on white — all
// pass). Green/amber/red stay reserved for grades.
const OVERALL_COLOR = "#b8862f";
const CATEGORY_COLORS: Record<ChartCategoryId, string> = {
  listing: "#2a5aa8",
  website: "#b8862f",
  reviews: "#7a4fb0",
};
const CATEGORY_LABEL_KEYS: Record<ChartCategoryId, MessageKey> = {
  listing: "dashboard.reports.chartCategoryListing",
  website: "dashboard.reports.chartCategoryWebsite",
  reviews: "dashboard.reports.chartCategoryReviews",
};
const GRID = "#e0dac8";
const AXIS_TEXT = "#6b7890";

const RANGE_LABEL_KEYS: Record<RangeKey, MessageKey> = {
  "30d": "dashboard.reports.chartRange30d",
  "90d": "dashboard.reports.chartRange90d",
  "1y": "dashboard.reports.chartRange1y",
  all: "dashboard.reports.chartRangeAllTime",
};

type ViewKey = "overall" | "categories";

const HEIGHT = 240;
const PAD_BASE = { left: 30, right: 44, top: 26, bottom: 24 };
/** "By category" ticks read "100%" — wider than a bare "100". */
const PAD_LEFT_PERCENT = 40;
/** Rough width of one 10.5px marker label, for overlap grouping. */
function markerLabelWidth(label: string): number {
  return label.length * 5.8 + 12;
}
/** Server and first client render use this width, then the real one. */
const DEFAULT_WIDTH = 640;
const HISTORY_PAGE = 10;

function toScan(row: ReportsScoreRow): HistoryScan {
  return {
    id: row.id,
    total: row.total,
    grade: row.grade,
    createdAt: row.created_at,
    scoringVersion: row.scoring_version ?? null,
    categories: row.categories ?? null,
  };
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function lastScanLabel(iso: string, locale: Locale, now: Date): string {
  const days = calendarDaysAgo(iso, now);
  if (days <= 0) return t(locale, "dashboard.reports.chartToday");
  if (days === 1) return t(locale, "dashboard.reports.chartYesterday");
  return tPlural(locale, "dashboard.reports.chartDaysAgo", days, { days });
}

/** Score over time for one business — one point per day (that day's
 * latest real scan), a y-axis zoomed to the data, "Scoring updated"
 * markers where the saved scoring version changed, a summary row and a
 * collapsible scan history. Never plots an interpolated or guessed
 * value; a range with fewer than two days of scans says so honestly. */
export function ScoreHistoryChart({ history }: { history: ReportsScoreRow[] }) {
  const locale = useLocale();
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [view, setView] = useState<ViewKey>("overall");
  // One clock for the whole render, so ranges, rows and "last scan" agree.
  const [now] = useState(() => new Date());

  const scans = useMemo(() => history.map(toScan), [history]);
  const allDays = useMemo(() => dailyPoints(scans), [scans]);
  const days = useMemo(() => inRange(allDays, range, now), [allDays, range, now]);
  const scansInRange = useMemo(() => inRange(scans, range, now).length, [scans, range, now]);
  const summary = useMemo(() => summarizeRange(days, scansInRange), [days, scansInRange]);
  const rows = useMemo(() => historyRows(scans, range, now), [scans, range, now]);

  const hasCategories = days.length > 0 && days.every((d) => d.categories !== null);
  const effectiveView: ViewKey = hasCategories ? view : "overall";
  const latest = scans.length > 0 ? scans.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a)) : null;

  const rangeOptions: SegmentedControlOption<RangeKey>[] = RANGE_KEYS.map((key) => ({
    value: key,
    label: t(locale, RANGE_LABEL_KEYS[key]),
  }));
  const viewOptions: SegmentedControlOption<ViewKey>[] = [
    { value: "overall", label: t(locale, "dashboard.reports.chartViewOverall") },
    { value: "categories", label: t(locale, "dashboard.reports.chartViewByCategory") },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl options={rangeOptions} value={range} onChange={setRange} size="sm" />
        {hasCategories && <SegmentedControl options={viewOptions} value={view} onChange={setView} size="sm" />}
      </div>

      <div className="mt-4">
        {scans.length === 0 ? (
          <EmptyState message={t(locale, "dashboard.reports.chartNoHistoryYet")} />
        ) : !hasEnoughForLine(days) ? (
          <EmptyState message={t(locale, "dashboard.reports.chartNotEnoughHistory")} />
        ) : (
          <Chart points={days} view={effectiveView} />
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-paper-line pt-4 sm:grid-cols-4">
        <SummaryStat
          label={t(locale, "dashboard.reports.chartSummaryChange")}
          value={summary && days.length >= 2 ? `${summary.first} → ${summary.last}` : "—"}
          detail={
            summary && days.length >= 2 ? (
              <>
                <span className="tabular-nums">{signed(summary.change)}</span>
                {summary.includesScoringUpdate && (
                  <>
                    {" · "}
                    {t(locale, "dashboard.reports.chartIncludesScoringUpdate")}{" "}
                    <InfoTip text={t(locale, "dashboard.reports.chartScoringUpdatedTooltip")} />
                  </>
                )}
              </>
            ) : null
          }
        />
        <SummaryStat
          label={t(locale, "dashboard.reports.chartSummaryBest")}
          value={summary ? summary.best.total : "—"}
          detail={summary ? formatShortDate(summary.best.createdAt, locale) : null}
        />
        <SummaryStat label={t(locale, "dashboard.reports.chartSummaryScans")} value={scansInRange} />
        <SummaryStat
          label={t(locale, "dashboard.reports.chartLastScanLabel")}
          value={latest ? lastScanLabel(latest.createdAt, locale, now) : "—"}
          detail={latest ? formatShortDate(latest.createdAt, locale) : null}
        />
      </div>

      {rows.length > 0 && <ScanHistory rows={rows} />}
    </Card>
  );
}

function SummaryStat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-mute">{label}</span>
      <span className="font-serif text-[22px] font-semibold leading-tight text-ink tabular-nums sm:text-[24px]">{value}</span>
      {detail && <span className="text-[12px] leading-snug text-ink-soft">{detail}</span>}
    </div>
  );
}

/** A small "what does this mean?" button: the text shows on hover, on
 * keyboard focus, and on tap (touch has no hover). */
function InfoTip({ text, className }: { text: string; className?: string }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={t(locale, "dashboard.reports.chartWhatIsThis")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
      >
        <IconInfoCircle size={14} />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-1.5 w-[220px] -translate-x-1/2 rounded-lg border border-paper-deep bg-white p-2.5 text-[12px] font-normal normal-case leading-snug tracking-normal text-ink-soft shadow-card"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed border-paper-deep bg-paper/60 px-6 text-center text-sm text-ink-soft">
      {message}
    </div>
  );
}

/** Monotone cubic (Fritsch–Carlson) path through the points: smooth,
 * but never overshoots between two real scans — the curve can't show a
 * peak or dip that no scan recorded. */
function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push(dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i]);
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * slope[i];
      m[i + 1] = tau * b * slope[i];
    }
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function gradeBandColor(min: number): string {
  return min >= 80 ? "#2e6b45" : min >= 60 ? "#c77d28" : "#b23a2f";
}

function Chart({ points, view }: { points: DayPoint[]; view: ViewKey }) {
  const locale = useLocale();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [active, setActive] = useState<number | null>(null);
  /** Index (into markerGroups) of the open "Scoring updated" tooltip. */
  const [openMarker, setOpenMarker] = useState<number | null>(null);

  // A tapped point stays open (touch has no hover) until a tap lands
  // outside the chart.
  useEffect(() => {
    if (active === null) return;
    const close = (e: globalThis.PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [active]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series: { id: string; color: string; values: number[] }[] =
    view === "overall"
      ? [{ id: "overall", color: OVERALL_COLOR, values: points.map((p) => p.total) }]
      : CHART_CATEGORY_IDS.map((id) => ({
          id,
          color: CATEGORY_COLORS[id],
          values: points.map((p) => Math.round(p.categories![id].percent)),
        }));

  const PAD = { ...PAD_BASE, left: view === "categories" ? PAD_LEFT_PERCENT : PAD_BASE.left };
  const domain = zoomedDomain(series.flatMap((s) => s.values));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const t0 = Date.parse(points[0].createdAt);
  const t1 = Date.parse(points[points.length - 1].createdAt);
  const xFor = (i: number) => PAD.left + (t1 === t0 ? innerW / 2 : ((Date.parse(points[i].createdAt) - t0) / (t1 - t0)) * innerW);
  const yFor = (v: number) => PAD.top + (1 - (v - domain.min) / (domain.max - domain.min)) * innerH;
  const markers = versionMarkerIndexes(points);
  // Midway between the two days whose saved versions differ.
  const markerX = (i: number) => (xFor(i - 1) + xFor(i)) / 2;
  const markerGroups = groupOverlappingMarkers(
    markers.map(markerX),
    markerLabelWidth(t(locale, "dashboard.reports.chartScoringUpdated")) + 8
  );
  const lastIndex = points.length - 1;

  const bands = GRADE_THRESHOLDS.map((g, i) => {
    const upper = i === 0 ? 100 : GRADE_THRESHOLDS[i - 1].min;
    const lo = Math.max(g.min, domain.min);
    const hi = Math.min(upper, domain.max);
    return hi > lo ? { grade: g.grade, top: yFor(hi), bottom: yFor(lo), color: gradeBandColor(g.min) } : null;
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  function nearestIndex(clientX: number): number {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return lastIndex;
    const x = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(xFor(i) - x) < Math.abs(xFor(best) - x)) best = i;
    return best;
  }
  function onPointer(e: PointerEvent<SVGRectElement>) {
    setActive(nearestIndex(e.clientX));
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? lastIndex) - 1));
    else if (e.key === "ArrowRight") setActive((i) => Math.min(lastIndex, (i ?? lastIndex) + 1));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  }

  const axisNote =
    view === "overall"
      ? t(locale, "dashboard.reports.chartAxisZoomed", { min: domain.min, max: domain.max })
      : t(locale, "dashboard.reports.chartAxisZoomedCategories", { min: domain.min, max: domain.max });

  return (
    <div>
      {view === "categories" && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-soft">
          {CHART_CATEGORY_IDS.map((id) => (
            <li key={id} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-[2px] w-4 rounded-full" style={{ background: CATEGORY_COLORS[id] }} />
              {t(locale, CATEGORY_LABEL_KEYS[id])}
            </li>
          ))}
        </ul>
      )}
      <p className="mb-1 text-[11.5px] text-ink-mute">{axisNote}</p>

      <div ref={wrapRef} className="relative w-full select-none" onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}>
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block max-w-full touch-pan-y focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
          role="img"
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
          aria-label={t(locale, "dashboard.reports.chartAriaLabel", {
            count: points.length,
            from: points[0].total,
            to: points[lastIndex].total,
          })}
        >
          {bands.map((b) => (
            <g key={b.grade}>
              <rect x={PAD.left} y={b.top} width={innerW} height={Math.max(0, b.bottom - b.top)} fill={b.color} opacity={0.05} />
              {b.bottom - b.top >= 14 && (
                <text x={width - 6} y={(b.top + b.bottom) / 2 + 4} textAnchor="end" fontSize={11} fontWeight={600} fill={AXIS_TEXT} opacity={0.75}>
                  {b.grade}
                </text>
              )}
            </g>
          ))}

          {domain.ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={yFor(v)} y2={yFor(v)} stroke={GRID} strokeWidth={1} />
              <text x={PAD.left - 6} y={yFor(v) + 3.5} textAnchor="end" fontSize={10.5} fill={AXIS_TEXT}>
                {view === "overall" ? v : `${v}%`}
              </text>
            </g>
          ))}
          {domain.min > 0 && (
            // Axis-break mark: the y-axis doesn't start at 0.
            <path
              d={`M ${PAD.left - 4} ${PAD.top + innerH + 1} l 4 -3 l 4 3`}
              fill="none"
              stroke={AXIS_TEXT}
              strokeWidth={1.2}
            />
          )}

          {markers.map((i) => {
            const x = markerX(i);
            return <line key={`m${i}`} x1={x} x2={x} y1={PAD.top - 4} y2={PAD.top + innerH} stroke={AXIS_TEXT} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />;
          })}

          {series.map((s) => {
            const pts = s.values.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
            const line = monotonePath(pts);
            const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;
            return (
              <g key={s.id}>
                {view === "overall" && <path d={area} fill={s.color} opacity={0.1} />}
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {view === "overall" &&
                  pts.slice(0, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#ffffff" stroke={s.color} strokeWidth={2} />)}
                <circle cx={pts[lastIndex].x} cy={pts[lastIndex].y} r={view === "overall" ? 6 : 4} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              </g>
            );
          })}

          {view === "overall" && (
            <text
              x={xFor(lastIndex) + 9}
              y={yFor(points[lastIndex].total) + 4.5}
              fontSize={13}
              fontWeight={700}
              fill="#14243f"
            >
              {points[lastIndex].total}
            </text>
          )}

          {active !== null && (
            <g pointerEvents="none">
              <line x1={xFor(active)} x2={xFor(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="#14243f" strokeWidth={1} opacity={0.35} />
              {series.map((s) => (
                <circle key={s.id} cx={xFor(active)} cy={yFor(s.values[active])} r={5} fill={s.color} stroke="#ffffff" strokeWidth={2} />
              ))}
            </g>
          )}

          <text x={PAD.left} y={HEIGHT - 6} textAnchor="start" fontSize={11} fill={AXIS_TEXT}>
            {formatMonthDay(points[0].createdAt, locale)}
          </text>
          <text x={PAD.left + innerW} y={HEIGHT - 6} textAnchor="end" fontSize={11} fill={AXIS_TEXT}>
            {formatMonthDay(points[lastIndex].createdAt, locale)}
          </text>

          {/* Hit layer: the crosshair snaps to the nearest day, so the
              pointer never has to land on the 2px line. */}
          <rect
            x={PAD.left - 8}
            y={PAD.top}
            width={innerW + 16}
            height={innerH}
            fill="transparent"
            onPointerMove={onPointer}
            onPointerDown={onPointer}
          />
        </svg>

        {markerGroups.map((group, g) => {
          const xs = group.map((k) => markerX(markers[k]));
          const x = (xs[0] + xs[xs.length - 1]) / 2;
          const label =
            group.length > 1
              ? t(locale, "dashboard.reports.chartScoringUpdatedCount", { count: group.length })
              : t(locale, "dashboard.reports.chartScoringUpdated");
          return (
            <button
              key={`ml${markers[group[0]]}`}
              type="button"
              onClick={() => setOpenMarker((m) => (m === g ? null : g))}
              onMouseEnter={() => setOpenMarker(g)}
              onMouseLeave={() => setOpenMarker(null)}
              onFocus={() => setOpenMarker(g)}
              onBlur={() => setOpenMarker(null)}
              aria-expanded={openMarker === g}
              className="absolute top-0 -translate-x-1/2 whitespace-nowrap rounded px-1 text-[10.5px] font-medium leading-4 text-ink-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass"
              style={{ left: Math.min(Math.max(x, markerLabelWidth(label) / 2), width - markerLabelWidth(label) / 2) }}
            >
              {label}
              {openMarker === g && (
                <span
                  role="tooltip"
                  className="absolute left-1/2 top-full z-20 mt-1 w-[230px] -translate-x-1/2 whitespace-normal rounded-lg border border-paper-deep bg-white p-2.5 text-left text-[12px] font-normal leading-snug text-ink-soft shadow-card"
                >
                  <span className="mb-1 block font-medium text-ink">
                    {group.map((k) => formatShortDate(points[markers[k]].createdAt, locale)).join(" · ")}
                  </span>
                  {t(locale, "dashboard.reports.chartScoringUpdatedTooltip")}
                </span>
              )}
            </button>
          );
        })}

        {active !== null && <PointTooltip point={points[active]} x={xFor(active)} width={width} view={view} />}
      </div>
    </div>
  );
}

function PointTooltip({ point, x, width, view }: { point: DayPoint; x: number; width: number; view: ViewKey }) {
  const locale = useLocale();
  const TIP_W = 196;
  const left = Math.min(Math.max(x - TIP_W / 2, 0), width - TIP_W);
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 rounded-lg border border-paper-deep bg-white p-3 shadow-card"
      style={{ left, top: PAD_BASE.top + 4, width: TIP_W }}
    >
      <div className="text-[11.5px] text-ink-mute">{formatShortDate(point.createdAt, locale)}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-serif text-[22px] font-semibold leading-none text-ink tabular-nums">{point.total}</span>
        <span className="text-[12px] text-ink-soft">{t(locale, "dashboard.reports.chartTooltipGrade", { grade: point.grade })}</span>
      </div>
      {point.categories && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-paper-line pt-2">
          {CHART_CATEGORY_IDS.map((id) => {
            const c = point.categories![id];
            return (
              <li key={id} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-ink-soft">
                  <span aria-hidden className="inline-block h-[2px] w-3 rounded-full" style={{ background: view === "categories" ? CATEGORY_COLORS[id] : "#c9c1ad" }} />
                  {t(locale, CATEGORY_LABEL_KEYS[id])}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {view === "categories" ? `${Math.round(c.percent)}%` : `${c.points} / ${c.weight}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {point.scansThatDay > 1 && (
        <div className="mt-2 text-[11px] leading-snug text-ink-mute">
          {tPlural(locale, "dashboard.reports.chartTooltipScansThatDay", point.scansThatDay, { count: point.scansThatDay })}
        </div>
      )}
    </div>
  );
}

function ScanHistory({ rows }: { rows: ReturnType<typeof historyRows> }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, HISTORY_PAGE);

  return (
    <div className="mt-4 border-t border-paper-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
      >
        <IconChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
        {t(locale, "dashboard.reports.chartHistoryHeading")}
      </button>
      {open && (
        <div className="mt-3">
          <table className="w-full table-fixed text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-ink-mute">
                <th className="w-[46%] pb-2 font-medium">{t(locale, "dashboard.reports.chartHistoryDate")}</th>
                <th className="pb-2 text-right font-medium">{t(locale, "dashboard.reports.chartHistoryScore")}</th>
                <th className="pb-2 text-right font-medium">{t(locale, "dashboard.reports.chartHistoryGrade")}</th>
                <th className="pb-2 text-right font-medium">{t(locale, "dashboard.reports.chartHistoryChange")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-t border-paper-line align-top">
                  <td className="py-2 pr-2 text-ink">
                    <div className="tabular-nums">{formatDateTime(row.createdAt, locale)}</div>
                    {row.scoringUpdated && (
                      <span className="mt-1 inline-flex items-center gap-0.5 rounded-md bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft">
                        {t(locale, "dashboard.reports.chartScoringUpdated")}
                        <InfoTip text={t(locale, "dashboard.reports.chartScoringUpdatedTooltip")} />
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ink">{row.total}</td>
                  <td className="py-2 text-right text-ink-soft">{row.grade}</td>
                  <td className="py-2 text-right tabular-nums text-ink-soft">
                    {row.changeFromPrevious === null ? (
                      <span className="text-[11.5px] text-ink-mute">{t(locale, "dashboard.reports.chartHistoryFirstScan")}</span>
                    ) : (
                      signed(row.changeFromPrevious)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > HISTORY_PAGE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 text-[13px] font-medium text-brass hover:underline"
            >
              {showAll
                ? t(locale, "dashboard.reports.chartHistoryShowFewer")
                : t(locale, "dashboard.reports.chartHistoryShowAll", { count: rows.length })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
