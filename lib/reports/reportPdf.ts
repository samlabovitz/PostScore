// The one-page "PostScore report" (US Letter) — laid out with the same
// print elements as the review sign and the cards (lib/signStudio), so
// the server PDF is vector text in real fonts. Every number comes from
// ReportData, which the server fills from the same sources the Overview
// and Reports pages use: the live score and categories, the shared
// ownerStanding rank (rankBy), the action plan's top recommendations and
// the two most recent saved scans. Nothing here is invented for print.

import { printable, wrap, type FontRole, type Measurer, type PrintPage, type SignElement } from "@/lib/signStudio/elements";
import { formatCount, formatLongDate, formatShortDate, t, tPlural, type Locale } from "@/lib/i18n";

export const LETTER = { width: 612, height: 792 } as const;

export const C = {
  ink: "#14243f",
  inkSoft: "#3a4a66",
  inkMute: "#6b7890",
  brass: "#b8862f",
  green: "#2e6b45",
  red: "#b23a2f",
  paper: "#f5f1e8",
  paperDeep: "#eae4d5",
  line: "#e0dac8",
  white: "#ffffff",
};

export interface ReportCategory {
  label: string;
  /** Weighted points toward the 0–100 total (null: nothing checkable). */
  points: number | null;
  weight: number;
  /** Bar shares (0–1) — the same categoryBarShares the Overview draws. */
  earned: number;
  unchecked: number;
  done: number;
  needsWork: number;
  couldntCheck: number;
}

export interface ReportNextStep {
  title: string;
  detail: string;
  points: string;
}

export interface ReportData {
  locale: Locale;
  timeZone: string;
  generatedAt: string;
  business: { name: string; address: string | null };
  score: { total: number; grade: string };
  /** The two most recent saved scans. null on the first scan. */
  period: {
    from: string;
    to: string;
    days: number;
    fromScore: number;
    toScore: number;
    /** Same scoring version on both scans — the delta means something. */
    comparable: boolean;
  } | null;
  categories: ReportCategory[];
  rank: { rank: number; of: number; noun: string; previousRank: number | null } | null;
  changes: { listing: string[]; listingUnavailable: boolean; fixesConfirmed: number };
  nextSteps: ReportNextStep[];
  reviews: { rating: number | null; count: number | null; countChange: number | null; nearbyAverage: number | null };
  /** The weekly report: same page, with the week in the header and the
   * change box comparing the week's scan with the last scan before it. */
  weekly?: WeeklyMeta;
}

export interface WeeklyMeta {
  weekStart: string;
  /** The week's Sunday. */
  weekEnd: string;
  /** No scan this week: when the last one ran (the page shows its numbers). */
  noNewScanSince: string | null;
  /** When the scan it's compared with ran (null: nothing to compare). */
  comparedWith: string | null;
  comparedInWeek: boolean;
  /** Weekly routine items checked that week. */
  routine: { done: number; total: number } | null;
  /** A finished week: next steps are about today, so they're not shown. */
  pastWeek: boolean;
}

/** "Oct 19–25, 2026" / "Sep 28 – Oct 4, 2026" / "Dec 29, 2025 – Jan 4, 2026" —
 * a week's Monday–Sunday as plain calendar days. */
export function compactWeekLabel(weekStart: string, weekEnd: string, locale: Locale): string {
  const day = (ymd: string) => formatShortDate(`${ymd}T12:00:00Z`, locale, "UTC");
  const [sy, sm] = weekStart.split("-");
  const [ey, em] = weekEnd.split("-");
  const endDay = String(Number(weekEnd.slice(8)));
  if (sy === ey && sm === em) {
    // "Oct 19–25, 2026" / "19–25 oct 2026"
    const full = day(weekStart);
    return locale === "es" ? full.replace(/^(\d+)/, `$1–${endDay}`) : full.replace(/(\d+), /, `$1–${endDay}, `);
  }
  if (sy === ey) {
    const end = day(weekEnd);
    const start = day(weekStart).replace(locale === "es" ? / \d{4}$/ : /, \d{4}$/, "");
    return `${start} – ${end}`;
  }
  return `${day(weekStart)} – ${day(weekEnd)}`;
}

/** "postscore-weekly-modern-liquors-2026-10-12.pdf" */
export function weeklyReportFileName(name: string, weekStart: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `postscore-weekly-${slug || "business"}-${weekStart}.pdf`;
}

/** "Oct 16 – Oct 18, 2026 (2 days)" — dates and the day count in the
 * business's own time zone. */
export function periodLabel(period: { from: string; to: string; days: number }, locale: Locale, timeZone: string): string {
  return `${formatShortDate(period.from, locale, timeZone)} – ${formatShortDate(period.to, locale, timeZone)} (${tPlural(locale, "dashboard.reports.recapDayCount", period.days)})`;
}

/** The share headline — only for real good news (score up on comparable
 * scans, or a better local rank). null means: don't offer Share. */
export function shareHeadline(data: Pick<ReportData, "locale" | "timeZone" | "period" | "rank" | "generatedAt"> & { business: { name: string } }): string | null {
  const { locale, period, rank } = data;
  const name = data.business.name;
  if (period && period.comparable && period.toScore > period.fromScore) {
    // "Modern Liquors' PostScore" / "Joe's PostScore"; Spanish uses "de {name}".
    const owner = locale === "es" ? name : /s$/i.test(name) ? `${name}'` : `${name}'s`;
    const withinMonth = Date.parse(data.generatedAt) - Date.parse(period.from) <= 31 * 86_400_000;
    return withinMonth
      ? t(locale, "dashboard.reports.share.scoreRose", { owner, from: period.fromScore, to: period.toScore })
      : t(locale, "dashboard.reports.share.scoreRoseSince", { owner, from: period.fromScore, to: period.toScore, date: formatShortDate(period.from, locale, data.timeZone) });
  }
  if (rank && rank.previousRank !== null && rank.rank < rank.previousRank) {
    return t(locale, "dashboard.reports.share.rankUp", { name, rank: rank.rank, of: rank.of, noun: rank.noun });
  }
  return null;
}

/** Whole points, as the Overview shows them ("15 / 40"). */
function formatPoints(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

/** A ring arc from 12 o'clock, clockwise, as an SVG path (y down). */
export function arcPath(cx: number, cy: number, r: number, fraction: number): string {
  const f = Math.max(0, Math.min(0.9999, fraction));
  const a = f * 2 * Math.PI;
  const x = cx + r * Math.sin(a);
  const y = cy - r * Math.cos(a);
  return `M${cx} ${cy - r}A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** Five-point star (y down), centered at (cx, cy). */
export function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export function layoutReport(data: ReportData, m: Measurer): PrintPage {
  const { locale, timeZone } = data;
  const W = LETTER.width;
  const M = 48;
  const inner = W - 2 * M;
  const els: SignElement[] = [];
  const text = (x: number, y: number, s: string, size: number, role: FontRole, color: string, letterSpacing = 0) => {
    const clean = printable(s, m, role);
    if (clean) els.push({ kind: "text", x, y, text: clean, size, role, color, letterSpacing });
    return m.width(clean, role, size, letterSpacing);
  };
  const rightText = (xRight: number, y: number, s: string, size: number, role: FontRole, color: string) => {
    const clean = printable(s, m, role);
    text(xRight - m.width(clean, role, size), y, clean, size, role, color);
  };
  /** Wrapped paragraph; returns the y after it. */
  const para = (x: number, y: number, s: string, size: number, role: "body" | "bodyBold" | "headline", color: string, width: number, maxLines: number, lead = 1.35) => {
    const lines = wrap(printable(s, m, role), m, role, size, width, 50) ?? [];
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines) {
      // Trim the last line with an ellipsis rather than overflow.
      let last = shown[maxLines - 1];
      while (last && m.width(`${last}…`, role, size) > width) last = last.slice(0, -1);
      shown[maxLines - 1] = `${last.trimEnd()}…`;
    }
    shown.forEach((line, i) => text(x, y + i * size * lead, line, size, role, color));
    return y + shown.length * size * lead;
  };
  const eyebrow = (x: number, y: number, s: string) => text(x, y, s.toUpperCase(), 8.5, "bodyBold", C.brass, 0.9);
  const rule = (y: number) => els.push({ kind: "line", x1: M, y1: y, x2: W - M, y2: y, color: C.line, width: 0.75, dash: false });

  // ---- Header band ----
  els.push({ kind: "rect", x: 0, y: 0, w: W, h: 6, r: 0, fill: C.brass, stroke: null, strokeWidth: 0 });
  const weekly = data.weekly ?? null;
  eyebrow(M, 40, weekly ? t(locale, "dashboard.reports.pdf.weeklyTitle", { week: compactWeekLabel(weekly.weekStart, weekly.weekEnd, locale) }) : t(locale, "dashboard.reports.pdf.title"));
  rightText(W - M, 40, t(locale, "dashboard.reports.pdf.generated", { date: formatLongDate(data.generatedAt, locale, timeZone) }), 9, "body", C.inkMute);
  let y = para(M, 66, data.business.name, 22, "headline", C.ink, inner, 2, 1.15);
  if (data.business.address) y = para(M, y + 2, data.business.address, 10, "body", C.inkSoft, inner, 2);
  y += 10;
  rule(y);
  y += 22;

  // ---- Score ring + period change + rank ----
  const ringR = 46;
  const cx = M + ringR + 4;
  const cy = y + ringR + 4;
  els.push({ kind: "path", d: arcPath(cx, cy, ringR, 0.99999), fill: "none", stroke: C.paperDeep, strokeWidth: 9 });
  if (data.score.total > 0) els.push({ kind: "path", d: arcPath(cx, cy, ringR, data.score.total / 100), fill: "none", stroke: C.brass, strokeWidth: 9 });
  const totalStr = String(data.score.total);
  text(cx - m.width(totalStr, "headline", 30) / 2, cy + 6, totalStr, 30, "headline", C.ink);
  const outOf = t(locale, "dashboard.reports.pdf.outOf");
  text(cx - m.width(outOf, "body", 8) / 2, cy + 20, outOf, 8, "body", C.inkMute);
  const gradeStr = t(locale, "dashboard.reports.pdf.grade", { grade: data.score.grade });
  const gw = m.width(gradeStr, "bodyBold", 9.5) + 16;
  els.push({ kind: "rect", x: cx - gw / 2, y: cy + ringR + 10, w: gw, h: 17, r: 8.5, fill: C.ink, stroke: null, strokeWidth: 0 });
  text(cx - gw / 2 + 8, cy + ringR + 22, gradeStr, 9.5, "bodyBold", C.white);

  const colX = M + 2 * ringR + 40;
  const colW = W - M - colX;
  let ry = y + 14;
  eyebrow(colX, ry, t(locale, weekly ? "dashboard.reports.pdf.changeLabelWeekly" : "dashboard.reports.pdf.changeLabel"));
  ry += 20;
  // The weekly report labels what it compares with ("Compared with Oct 16"),
  // never a "(0 days)" period.
  const comparedLine = weekly?.comparedWith
    ? t(locale, weekly.comparedInWeek ? "dashboard.reports.pdf.comparedWithInWeek" : "dashboard.reports.pdf.comparedWith", { date: formatShortDate(weekly.comparedWith, locale, timeZone) })
    : null;
  const periodLine = data.period ? comparedLine ?? (weekly ? null : periodLabel(data.period, locale, timeZone)) : null;
  if (weekly?.noNewScanSince) {
    ry = para(colX, ry, t(locale, "dashboard.reports.pdf.noNewScan", { date: formatShortDate(weekly.noNewScanSince, locale, timeZone) }), 11, "body", C.inkSoft, colW, 3);
  } else if (!data.period) {
    ry = para(colX, ry, t(locale, "dashboard.reports.pdf.firstScan"), 11, "body", C.inkSoft, colW, 2);
  } else if (!data.period.comparable) {
    ry = para(colX, ry, t(locale, "dashboard.reports.pdf.scoringUpdated"), 10, "body", C.inkSoft, colW, 3);
    if (periodLine) ry = para(colX, ry + 2, periodLine, 9, "body", C.inkMute, colW, 1);
  } else {
    const d = data.period.toScore - data.period.fromScore;
    const delta = d === 0 ? t(locale, "dashboard.reports.pdf.noChange") : d > 0 ? `+${d}` : String(d);
    let x = colX;
    x += text(x, ry + 8, String(data.period.fromScore), 26, "headline", C.ink) + 8;
    x += text(x, ry + 5, "→", 16, "body", C.inkMute) + 8;
    x += text(x, ry + 8, String(data.period.toScore), 26, "headline", C.ink) + 10;
    text(x, ry + 6, `(${delta})`, 13, "bodyBold", d > 0 ? C.green : d < 0 ? C.red : C.inkMute);
    ry = periodLine ? para(colX, ry + 26, periodLine, 9.5, "body", C.inkMute, colW, 1) : ry + 26;
  }
  ry += 14;
  eyebrow(colX, ry, t(locale, "dashboard.reports.pdf.rankLabel"));
  ry += 18;
  if (data.rank) {
    const rw = text(colX, ry, t(locale, "dashboard.reports.pdf.rank", { rank: data.rank.rank, of: data.rank.of, noun: data.rank.noun }), 12, "bodyBold", C.ink);
    const prev = data.rank.previousRank;
    if (prev !== null && prev !== data.rank.rank) {
      const up = data.rank.rank < prev;
      text(colX + rw + 8, ry, t(locale, up ? "dashboard.reports.pdf.rankUp" : "dashboard.reports.pdf.rankDown", { previous: prev }), 9.5, "body", up ? C.green : C.red);
    }
  } else {
    text(colX, ry, t(locale, "dashboard.reports.pdf.rankNone"), 10.5, "body", C.inkSoft);
  }
  y = Math.max(cy + ringR + 40, ry + 16);
  rule(y);
  y += 26;

  // ---- Category bars (the Overview's numbers) ----
  eyebrow(M, y, t(locale, "dashboard.reports.pdf.categoriesHeading"));
  rightText(W - M, y, t(locale, "dashboard.reports.pdf.hatchedNote"), 8, "body", C.inkMute);
  y += 16;
  for (const cat of data.categories) {
    text(M, y, cat.label, 11, "bodyBold", C.ink);
    rightText(W - M, y, `${formatPoints(cat.points)} / ${cat.weight}`, 11, "bodyBold", C.ink);
    const by = y + 6;
    const bh = 7;
    els.push({ kind: "rect", x: M, y: by, w: inner, h: bh, r: 3.5, fill: C.paperDeep, stroke: null, strokeWidth: 0 });
    if (cat.unchecked > 0) {
      const ux = M + inner * (1 - cat.unchecked);
      // Diagonal hatching = couldn't check (as on the Overview).
      const xe = M + inner;
      for (let hx = ux - bh; hx < xe; hx += 4) {
        const t0 = Math.max(0, (ux - hx) / bh);
        const t1 = Math.min(1, (xe - hx) / bh);
        if (t0 < t1) els.push({ kind: "line", x1: hx + t0 * bh, y1: by + bh - t0 * bh, x2: hx + t1 * bh, y2: by + bh - t1 * bh, color: C.inkMute, width: 0.6, dash: false });
      }
    }
    if (cat.earned > 0) els.push({ kind: "rect", x: M, y: by, w: Math.max(bh, inner * cat.earned), h: bh, r: 3.5, fill: C.brass, stroke: null, strokeWidth: 0 });
    const counts = [
      tPlural(locale, "dashboard.overview.breakdown.done", cat.done, { count: cat.done }),
      tPlural(locale, "dashboard.overview.breakdown.needsWork", cat.needsWork, { count: cat.needsWork }),
      ...(cat.couldntCheck > 0 ? [tPlural(locale, "dashboard.overview.breakdown.couldntCheck", cat.couldntCheck, { count: cat.couldntCheck })] : []),
    ].join(" · ");
    text(M, by + bh + 12, counts, 8.5, "body", C.inkMute);
    y = by + bh + 36;
  }
  y -= 4;
  rule(y);
  y += 26;

  // ---- Two columns: what changed + reviews | next steps ----
  const gap = 28;
  const leftW = (inner - gap) * 0.48;
  const rightX = M + leftW + gap;
  const rightW = inner - leftW - gap;
  const top = y;

  let ly = top;
  eyebrow(M, ly, t(locale, "dashboard.reports.recapWhatChangedHeading"));
  ly += 16;
  if (data.period && periodLine && !weekly?.noNewScanSince) ly = para(M, ly - 2, periodLine, 8.5, "body", C.inkMute, leftW, 1) + 6;
  const changeLines = [
    ...data.changes.listing.slice(0, 4),
    ...(data.changes.fixesConfirmed > 0 ? [t(locale, "dashboard.reports.pdf.fixesConfirmed", { count: data.changes.fixesConfirmed })] : []),
  ];
  if (weekly?.noNewScanSince) {
    ly = para(M, ly, t(locale, "dashboard.reports.pdf.noScanChanges"), 10, "body", C.inkSoft, leftW, 3);
  } else if (!data.period) {
    ly = para(M, ly, t(locale, "dashboard.reports.pdf.firstScan"), 10, "body", C.inkSoft, leftW, 2);
  } else if (data.changes.listingUnavailable && changeLines.length === 0) {
    ly = para(M, ly, t(locale, "dashboard.reports.recapChangesUnavailable"), 10, "body", C.inkSoft, leftW, 3);
  } else if (changeLines.length === 0) {
    ly = para(M, ly, t(locale, "dashboard.reports.pdf.changedNone"), 10, "body", C.inkSoft, leftW, 2);
  } else {
    for (const line of changeLines) {
      els.push({ kind: "rect", x: M, y: ly - 4.5, w: 3.5, h: 3.5, r: 1.75, fill: C.brass, stroke: null, strokeWidth: 0 });
      ly = para(M + 10, ly, line, 10.5, "body", C.ink, leftW - 10, 2) + 5;
    }
  }
  ly += 22;
  eyebrow(M, ly, t(locale, "dashboard.reports.pdf.reviewsHeading"));
  ly += 18;
  const r = data.reviews;
  // Rating with a drawn star (no font glyph needed).
  text(M, ly + 6, t(locale, "dashboard.reports.pdf.rating"), 8.5, "body", C.inkMute);
  const ratingStr = r.rating === null ? "—" : r.rating.toFixed(1);
  const rw = text(M, ly + 26, ratingStr, 20, "headline", C.ink);
  if (r.rating !== null) els.push({ kind: "path", d: starPath(M + rw + 10, ly + 19, 6.5), fill: C.brass });
  const cX = M + leftW / 2;
  text(cX, ly + 6, t(locale, "dashboard.reports.pdf.reviewCount"), 8.5, "body", C.inkMute);
  text(cX, ly + 26, r.count === null ? "—" : formatCount(r.count, locale), 20, "headline", C.ink);
  ly += 40;
  if (r.countChange !== null) {
    const change = r.countChange > 0 ? `+${r.countChange}` : String(r.countChange);
    const line = r.countChange === 0 ? t(locale, "dashboard.reports.pdf.reviewNoChange") : t(locale, "dashboard.reports.pdf.reviewChange", { change });
    ly = para(M, ly, line, 9.5, "body", C.inkSoft, leftW, 1);
  }
  if (r.nearbyAverage !== null) ly = para(M, ly + 1, t(locale, "dashboard.reports.pdf.nearbyAverage", { count: formatCount(r.nearbyAverage, locale) }), 9.5, "body", C.inkSoft, leftW, 1);
  // One line, only when it fits above the footer.
  if (weekly?.routine && ly + 22 < LETTER.height - 70) {
    para(M, ly + 12, t(locale, "dashboard.reports.pdf.routine", { done: weekly.routine.done, total: weekly.routine.total }), 9.5, "bodyBold", C.ink, leftW, 1);
  }

  let ny = top;
  eyebrow(rightX, ny, t(locale, data.nextSteps.length >= 3 ? "dashboard.reports.pdf.nextHeading" : "dashboard.reports.pdf.nextHeadingFew"));
  ny += 16;
  if (weekly?.pastWeek) {
    para(rightX, ny, t(locale, "dashboard.reports.pdf.nextPastWeek"), 10, "body", C.inkSoft, rightW, 3);
  } else if (data.nextSteps.length === 0) {
    para(rightX, ny, t(locale, "dashboard.reports.pdf.nextNone"), 10, "body", C.inkSoft, rightW, 2);
  } else {
    data.nextSteps.slice(0, 3).forEach((step, i) => {
      const boxTop = ny - 12;
      const n = String(i + 1);
      els.push({ kind: "rect", x: rightX, y: boxTop, w: 17, h: 17, r: 8.5, fill: C.paper, stroke: C.brass, strokeWidth: 0.75 });
      text(rightX + 8.5 - m.width(n, "bodyBold", 9) / 2, boxTop + 12, n, 9, "bodyBold", C.ink);
      const tx = rightX + 26;
      const tw = rightW - 26;
      const pw = m.width(step.points, "bodyBold", 9);
      text(rightX + rightW - pw, ny, step.points, 9, "bodyBold", C.green);
      let sy = para(tx, ny, step.title, 11, "bodyBold", C.ink, tw - pw - 8, 2);
      sy = para(tx, sy + 2, step.detail, 9.5, "body", C.inkSoft, tw, 3);
      ny = sy + 20;
    });
  }

  // ---- Footer ----
  const fy = LETTER.height - 40;
  els.push({ kind: "line", x1: M, y1: fy - 16, x2: W - M, y2: fy - 16, color: C.line, width: 0.75, dash: false });
  text(M, fy, t(locale, "dashboard.reports.pdf.footer"), 8.5, "body", C.inkMute);
  rightText(W - M, fy, "PostScore", 8.5, "bodyBold", C.brass);

  return { width: LETTER.width, height: LETTER.height, panels: [{ x: 0, y: 0, w: LETTER.width, h: LETTER.height, rotate: 0, elements: els }], marks: [] };
}
