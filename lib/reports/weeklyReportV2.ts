// The weekly report, redesigned (Day 22) — three letter pages, for every
// report from WEEKLY_REPORT_V2_FROM on; past weeks keep the one-page
// layout (lib/reports/reportPdf.ts). The look of the free audit: a gold top
// bar, Playfair Display headings, Inter text, navy and gold, numbered gold
// circles and cream "what to say" boxes.
//   1 Summary — the score, what moved (rows that add up), the local rank
//     by business type, categories out of their real totals, checks
//     waiting on Google (only while it isn't connected), reviews and the
//     top 3 next steps.
//   2 Your plan this week — those 3 steps in detail, with real scripts.
//   3 Grow this week — post once, share it three places: real dates from
//     the business's own website when we found them (verbatim, never
//     invented), else fixed ideas by business type; what PostScore does
//     today / where it's headed (by plan and the Google-writes switch);
//     an upgrade box on Free, a "next week" note on paid plans.
// Every number comes from WeeklyReportV2Data, built from saved data by
// lib/reports/weeklyReportV2Data.server.ts. A missing section is skipped,
// never printed as "undefined". Pure.

import { GOOGLE_MAPS_LOGO_RATIO } from "@/lib/google/mapsLogoPng";
import { printable, wrap, type FontRole, type Measurer, type PrintPage, type SignElement } from "@/lib/signStudio/elements";
import { breakdownFromChecks, unroundedTotal, type CheckResult } from "@/lib/scoring";
import { formatCount, formatLongDate, formatShortDate, t, type Locale, type MessageKey } from "@/lib/i18n";
import { eventDateMentions } from "@/lib/websiteTrust";
import { GOOGLE_WRITES_FOR_EVERYONE } from "@/lib/googleWritesLaunch";
import type { Plan } from "@/lib/plan";
import { arcPath, C, compactWeekLabel, LETTER, starPath, type ReportData } from "./reportPdf";

/** The first week drawn with this layout; earlier weeks keep the old one. */
export const WEEKLY_REPORT_V2_FROM = "2026-11-09";

export function usesWeeklyReportV2(weekStart: string, pastWeek: boolean): boolean {
  return !pastWeek && weekStart >= WEEKLY_REPORT_V2_FROM;
}

const K = (key: string) => `dashboard.reports.v2.${key}` as MessageKey;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface PointsMovedRow {
  label: string;
  /** Whole points on the 0–100 total. */
  delta: number;
}

export interface PointsMoved {
  from: number;
  to: number;
  /** One row per check that changed; they add up to to − from − scoringUpdate. */
  rows: PointsMovedRow[];
  /** A scoring update in between: shown on its own, never a gain or loss. */
  scoringUpdate: { from: number; to: number } | null;
  /** The versions differ and no update snapshot splits them: no rows. */
  unsplit: boolean;
}

export interface PlanStep {
  /** Page 1's short name ("Business hours"); page 2 uses `title`. */
  label: string;
  title: string;
  urgent: boolean;
  minutes: number | null;
  /** "+4 pts" / "up to +10 pts" / "about +2 pts". */
  points: string;
  /** One line for page 1's "Top 3 next steps". */
  summary: string;
  why: string;
  bullets: string[];
  /** "What to say:" or "A starting point:" in a cream box. */
  script: { label: string; text: string } | null;
}

export interface PostRow {
  /** The date as shown ("Nov 21"). */
  when: string;
  /** The event's own title from the website, cleaned — null when there's
   * no clean title (the row says "Workshop listed on your website"). */
  title: string | null;
  idea: string;
}

export type Posts =
  /** `listing`: what an untitled row says ("Workshop listed on your
   * website" for classes, "Event listed on your website" for venues). */
  { kind: "website"; site: string; checkedAt: string; listing: ListingKind; rows: PostRow[] } | { kind: "ideas"; ideas: string[] };

export interface WeeklyReportV2Data {
  base: ReportData;
  plan: Plan;
  /** The first saved full scan (the starting point), when this is the first report. */
  firstReport: { scannedAt: string } | null;
  moved: PointsMoved | null;
  /** "#3 of 5 nearby art & pottery studios". null: no rank. */
  rankText: string | null;
  /** One short line under each category (same order as base.categories). */
  categoryLines: string[];
  /** Checks that can only run with Google connected — empty when connected. */
  waiting: { checks: Array<{ label: string; points: number }>; category: { label: string; points: number | null; weight: number } } | null;
  steps: PlanStep[];
  posts: Posts;
  today: Array<{ text: string; beta: boolean }>;
  headed: string[];
  /** When the scan the report is built from ran. */
  scanAt: string | null;
}

// ---------------------------------------------------------------------------
// Where your points moved
// ---------------------------------------------------------------------------

/** Each changed check's share of the change, applied one at a time on the
 * real scoring math (a category is scaled by the checks it could run, so
 * points aren't a plain sum), then rounded to whole points that add up to
 * exactly `to − from`. Rows that round to 0 are left out. */
export function pointsMovedRows(previous: CheckResult[], current: CheckResult[], from: number, to: number, label: (check: CheckResult) => string): PointsMovedRow[] {
  const changed = current.filter((c) => {
    const p = previous.find((x) => x.id === c.id);
    return p && (p.earnedPoints !== c.earnedPoints || p.confidence !== c.confidence);
  });
  if (changed.length === 0) return [];
  const total = (checks: CheckResult[]) => unroundedTotal(breakdownFromChecks(checks).categories);
  let checks = previous.map((c) => ({ ...c }));
  let before = total(checks);
  const raw: Array<{ label: string; value: number }> = [];
  for (const c of changed) {
    checks = checks.map((x) => (x.id === c.id ? { ...x, earnedPoints: c.earnedPoints, confidence: c.confidence } : x));
    const after = total(checks);
    raw.push({ label: label(c), value: after - before });
    before = after;
  }
  // Largest remainder, so the whole-point rows add up to the shown change.
  const target = to - from;
  const floors = raw.map((r) => Math.trunc(r.value));
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rest: r.value - floors[i] })).sort((a, b) => (left > 0 ? b.rest - a.rest : a.rest - b.rest));
  for (const o of order) {
    if (left === 0) break;
    const step = left > 0 ? 1 : -1;
    floors[o.i] += step;
    left -= step;
  }
  // Still off (more points than rows could take): the biggest row takes it.
  if (left !== 0) floors[raw.reduce((best, r, i) => (Math.abs(r.value) > Math.abs(raw[best].value) ? i : best), 0)] += left;
  return raw
    .map((r, i) => ({ label: r.label, delta: floors[i] }))
    .filter((r) => r.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** At most `max` rows; the rest become one "Other changes (n)" row, so the
 * list still adds up. */
export function capMovedRows(rows: PointsMovedRow[], max: number, locale: Locale): PointsMovedRow[] {
  if (rows.length <= max) return rows;
  const kept = rows.slice(0, max - 1);
  const rest = rows.slice(max - 1);
  const delta = rest.reduce((a, r) => a + r.delta, 0);
  return delta === 0 ? kept : [...kept, { label: t(locale, K("otherChanges"), { count: rest.length }), delta }];
}

// ---------------------------------------------------------------------------
// Checks waiting on Google
// ---------------------------------------------------------------------------

/** Checks that only Google connected can run (it shares few reviews
 * publicly). Only while it isn't connected. */
export const WAITING_ON_GOOGLE_CHECKS = ["visibility.review_recency", "visibility.review_replies"];

export function waitingOnGoogle(checks: CheckResult[], connected: boolean): CheckResult[] {
  if (connected) return [];
  return checks.filter((c) => WAITING_ON_GOOGLE_CHECKS.includes(c.id) && c.earnedPoints === null && c.confidence === "NOT_FOUND");
}

// ---------------------------------------------------------------------------
// Posts: real dates from the website, else fixed ideas
// ---------------------------------------------------------------------------

/** Prices, times and repeated words out; null unless what's left reads as
 * a short title (1–6 words, starts with a capital, not a sentence, no date
 * or question). */
export function cleanEventTitle(raw: string): string | null {
  const stripped = raw
    .replace(/\$\s*\d[\d\s.,]*/g, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:-|–|to)?\s*(?:\d{1,2}(?::\d{2})?\s*)?(?:a\.?m\.?|p\.?m\.?)/gi, " ")
    .replace(/[^A-Za-z0-9\u00C0-\u024F&'’ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A repeated word, or a near-repeat ("Luminary Luminari"), counts once.
  const same = (a: string, b: string | undefined) => !!b && (a.toLowerCase() === b.toLowerCase() || (a.length >= 6 && b.length >= 6 && a.slice(0, 6).toLowerCase() === b.slice(0, 6).toLowerCase()));
  const words = stripped.split(" ").filter((w, i, all) => w && !same(w, all[i - 1]));
  if (words.length === 0 || words.length > 6) return null;
  const title = words.join(" ").replace(/^[&'’ -]+|[&'’ -]+$/g, "");
  if (!/^[A-Z\u00C0-\u00DE]/.test(title) || /\d/.test(title)) return null;
  return title;
}

/** A line that's only a month or weekday ("November"): never a title. */
const CALENDAR_WORD =
  /^(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*|(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado)\.?$/i;
const looksLikeTitleLine = (line: string) => !/[.?!:]\s*$/.test(line) && !SNIPPET_BREAK_DATE.test(line) && !CALENDAR_WORD.test(line.trim()) && cleanEventTitle(line) !== null;

/** The event's title: the short title line(s) right before the line its
 * date starts on — two short lines join ("Charcuterie" + "Set $75" →
 * "Charcuterie Set"); a sentence, a date or nothing before it → null.
 * Never guessed. */
export function eventTitleBefore(lines: string[], dateLine: number, sameLineBefore: string): string | null {
  const own = cleanEventTitle(sameLineBefore);
  if (own && sameLineBefore.trim()) return own;
  const picked: string[] = [];
  for (let i = dateLine - 1, looked = 0; i >= 0 && looked < 8 && picked.length < 2; i--, looked++) {
    const line = lines[i];
    // Fragments a page split out of a line ("a", "Sun" + "day,", "$65"): skipped.
    if ((line.match(/[A-Za-z\u00C0-\u024F]/g) ?? []).length <= 3) continue;
    if (!looksLikeTitleLine(line)) break;
    picked.unshift(line);
  }
  if (picked.length === 0) return null;
  const joined = picked.length === 2 ? cleanEventTitle(`${picked[0]} ${picked[1]}`) : null;
  return joined ?? cleanEventTitle(picked[picked.length - 1]);
}

export type ListingKind = "workshop" | "event";

/** Business types that run their own classes/workshops or host events — the
 * only ones whose website dates are listed (a gift shop's "events" page
 * lists the town's events, not its own). null: post ideas instead. */
const LISTING_KIND_BY_PROFILE: Record<string, ListingKind> = { tutor_education: "workshop", gym_fitness: "workshop", events: "event", community_center: "event", recreation: "event", bar: "event" };

export function listingKind(profileId: string): ListingKind | null {
  return LISTING_KIND_BY_PROFILE[profileId] ?? null;
}

/** Another organization's event ("SALT Presents Newsies", "hosted by the
 * library"): never listed as the business's own. */
const OTHER_HOST = /\b(?:presents|presented by|hosted by|sponsored by|presenta|presentado por|organizado por)\b/i;

/** Upcoming dates (tomorrow … +35 days) from the business's own classes/events
 * page, each with its own title from the page (eventTitleBefore) — or no
 * title ("Workshop listed on your website"). One row per date, in order;
 * dates near another organization's name ("… Presents …") are left out.
 * Nothing invented; [] when none. */
export function websitePostRows(page: { lines: string[] }, now: Date, locale: Locale, max = 7): PostRow[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const horizon = today + 35 * 86_400_000;
  // The lines joined, so a date split across lines still counts; each date
  // maps back to the line it starts on.
  const starts: number[] = [];
  let text = "";
  for (const line of page.lines) {
    starts.push(text.length);
    text += `${line} `;
  }
  const lineAt = (index: number) => {
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= index) i++;
    return i;
  };
  const rows: Array<PostRow & { at: number }> = [];
  // A date right after another one ("November 22nd 1pm, November 28th
  // 12pm") is the same event: it keeps that event's title.
  let previous: { end: number; title: string | null } | null = null;
  for (const m of eventDateMentions(text, now)) {
    const line = lineAt(m.index);
    const sameEvent: boolean = previous !== null && previous.end <= m.index && ONLY_TIMES_BETWEEN.test(text.slice(previous.end, m.index));
    const title: string | null = eventTitleBefore(page.lines, line, text.slice(starts[line], m.index).replace(WEEKDAY_WORDS, "")) ?? (sameEvent ? previous!.title : null);
    previous = { end: m.end, title };
    const at = m.date.getTime();
    if (at <= today || at > horizon) continue;
    const ymd = new Date(at).toISOString().slice(0, 10);
    const when = formatShortDate(`${ymd}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "");
    if (rows.some((r) => r.when === when)) continue;
    if (OTHER_HOST.test(page.lines.slice(Math.max(0, line - 2), line + 1).join(" "))) continue;
    const postBy = at - 7 * 86_400_000;
    const idea =
      postBy > today
        ? t(locale, K("ideaBefore"), { date: formatShortDate(`${new Date(postBy).toISOString().slice(0, 10)}T12:00:00Z`, locale, "UTC").replace(/,? \d{4}$/, "") })
        : t(locale, K("ideaNow"));
    rows.push({ when, title, idea, at });
  }
  return rows
    .sort((a, b) => a.at - b.at)
    .slice(0, max)
    .map((r) => ({ when: r.when, title: r.title, idea: r.idea }));
}

/** Only times, weekdays and separators between two dates ("1pm, ", " and "). */
const ONLY_TIMES_BETWEEN = /^(?:[\s,;&\-–—/]|\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|and|y|or|o|(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?\.?)*$/i;

/** A month-and-day date: never part of a title. */
const SNIPPET_BREAK_DATE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b/i;
const WEEKDAY_WORDS = /\b(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?\.?,?\s*$|\b(?:domingo|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado),?\s*$/i;

export type PostFamily = "food" | "beauty" | "retail" | "classes" | "services";

const FAMILY_BY_PROFILE: Record<string, PostFamily> = {
  salon: "beauty",
  barbershop: "beauty",
  nail_salon: "beauty",
  spa: "beauty",
  tattoo_body_art: "beauty",
  retail_boutique: "retail",
  specialty_store: "retail",
  liquor_store: "retail",
  grocery_market: "retail",
  hardware_store: "retail",
  tutor_education: "classes",
  gym_fitness: "classes",
  childcare: "classes",
};

export function postFamily(profileId: string, isFood: boolean): PostFamily {
  return isFood ? "food" : (FAMILY_BY_PROFILE[profileId] ?? "services");
}

/** Four fixed post ideas for the business's family — no dates, prices or events. */
export function familyPostIdeas(family: PostFamily, locale: Locale): string[] {
  return [1, 2, 3, 4].map((n) => t(locale, K(`ideas.${family}.${n}`)));
}

// ---------------------------------------------------------------------------
// What PostScore does today / where it's headed
// ---------------------------------------------------------------------------

export function todayItems(plan: Plan, locale: Locale, launched: boolean = GOOGLE_WRITES_FOR_EVERYONE): Array<{ text: string; beta: boolean }> {
  const item = (key: string, beta = false) => ({ text: t(locale, K(`today.${key}`)), beta });
  if (plan === "free") return [item("score"), item("reviewLink"), item("postai3"), item("replies3")];
  const paid = [item("plan"), item("signs"), item("cards"), item(plan === "grow" ? "postai100" : "postaiUnlimited"), item("report")];
  if (plan === "grow") return paid;
  return [...paid, item("editGoogle", !launched), item("replyGoogle", !launched)];
}

export function headedItems(plan: Plan, locale: Locale, launched: boolean = GOOGLE_WRITES_FOR_EVERYONE): string[] {
  // Google results (who searches, calls, clicks) are live since Day 22B — not "headed".
  const items = [t(locale, K("headed.posts"))];
  // Editing the listing and posting replies: on for everyone at launch.
  if (!launched) items.push(t(locale, K(plan === "premium" || plan === "multi" ? "headed.everyone" : "headed.editGoogle")));
  return items;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const W = LETTER.width;
const H = LETTER.height;
const M = 54;
const INNER = W - 2 * M;
const FOOT_Y = H - 40;
const CREAM = "#f8f3ea";
const NAVY = "#1b2440";

type Para = (x: number, y: number, s: string, size: number, role: FontRole, color: string, width: number, maxLines: number, lead?: number) => number;

function pageKit(m: Measurer) {
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
  const lines = (s: string, size: number, role: FontRole, width: number, maxLines: number) => {
    const all = wrap(printable(s, m, role), m, role, size, width, 60) ?? [];
    const shown = all.slice(0, maxLines);
    if (all.length > maxLines && shown.length > 0) {
      let last = shown[maxLines - 1];
      while (last && m.width(`${last}…`, role, size) > width) last = last.slice(0, -1);
      shown[maxLines - 1] = `${last.trimEnd()}…`;
    }
    return shown;
  };
  const para: Para = (x, y, s, size, role, color, width, maxLines, lead = 1.4) => {
    const shown = lines(s, size, role, width, maxLines);
    shown.forEach((line, i) => text(x, y + i * size * lead, line, size, role, color));
    return y + shown.length * size * lead;
  };
  /** Small gold capitals, shortened with "…" to fit before the right margin. */
  const eyebrow = (x: number, y: number, s: string, color = C.brass) => {
    let up = printable(s.toUpperCase(), m, "bodyBold");
    const max = W - M - x;
    if (m.width(up, "bodyBold", 8.5, 1) > max) {
      while (up && m.width(`${up}…`, "bodyBold", 8.5, 1) > max) up = up.slice(0, -1);
      up = `${up.trimEnd()}…`;
    }
    return text(x, y, up, 8.5, "bodyBold", color, 1);
  };
  const rule = (y: number) => els.push({ kind: "line", x1: M, y1: y, x2: W - M, y2: y, color: C.line, width: 0.75, dash: false });
  const circleNumber = (x: number, y: number, n: number) => {
    els.push({ kind: "rect", x, y, w: 18, h: 18, r: 9, fill: C.white, stroke: C.brass, strokeWidth: 1 });
    const s = String(n);
    text(x + 9 - m.width(s, "bodyBold", 9.5) / 2, y + 12.5, s, 9.5, "bodyBold", C.brass);
  };
  const topBar = () => els.push({ kind: "rect", x: 0, y: 0, w: W, h: 8, r: 0, fill: C.brass, stroke: null, strokeWidth: 0 });
  const footer = (left: string) => {
    els.push({ kind: "line", x1: M, y1: FOOT_Y - 14, x2: W - M, y2: FOOT_Y - 14, color: C.line, width: 0.75, dash: false });
    para(M, FOOT_Y, left, 8, "body", C.inkMute, INNER - 70, 1);
    rightText(W - M, FOOT_Y, "PostScore", 8.5, "bodyBold", C.brass);
  };
  /** A cream box with a gold left edge, its label bold. Returns the y after it. */
  const scriptBox = (x: number, y: number, width: number, label: string, body: string) => {
    const size = 9.5;
    const lead = size * 1.45;
    const bodyLines = lines(body, size, "body", width - 24, 4);
    const labelRows = label ? 1 : 0;
    const h = (bodyLines.length + labelRows) * lead + 10;
    els.push({ kind: "rect", x, y, w: width, h, r: 2, fill: "#f3ede2", stroke: null, strokeWidth: 0 });
    els.push({ kind: "rect", x, y, w: 3, h, r: 0, fill: C.brass, stroke: null, strokeWidth: 0 });
    if (label) text(x + 12, y + 14, label, size, "bodyBold", C.ink);
    bodyLines.forEach((line, i) => text(x + 12, y + 14 + (i + labelRows) * lead, line, size, "body", C.inkSoft));
    return y + h;
  };
  const page = (): PrintPage => ({ width: W, height: H, panels: [{ x: 0, y: 0, w: W, h: H, rotate: 0, elements: els }], marks: [] });
  return { els, text, rightText, para, lines, eyebrow, rule, circleNumber, topBar, footer, scriptBox, page };
}

/** Same total, no check moved and no scoring update: just "No change this week". */
export function isNoChange(mv: PointsMoved): boolean {
  return !mv.unsplit && mv.from === mv.to && mv.rows.length === 0 && mv.scoringUpdate === null;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

function pageOne(d: WeeklyReportV2Data, m: Measurer): PrintPage {
  const k = pageKit(m);
  const { base } = d;
  const { locale, timeZone } = base;
  k.topBar();
  const weekly = base.weekly;
  k.eyebrow(M, 46, weekly ? t(locale, "dashboard.reports.pdf.weeklyTitle", { week: compactWeekLabel(weekly.weekStart, weekly.weekEnd, locale) }) : t(locale, "dashboard.reports.pdf.title"));
  k.rightText(W - M, 46, t(locale, "dashboard.reports.pdf.generated", { date: formatLongDate(base.generatedAt, locale, timeZone) }), 9, "body", C.inkMute);
  const logoH = 12;
  const logoW = logoH * GOOGLE_MAPS_LOGO_RATIO;
  k.els.push({ kind: "googleMapsLogo", x: W - M - logoW, y: 58, h: logoH });
  let y = k.para(M, 76, base.business.name, 24, "headline", C.ink, INNER - logoW - 16, 2, 1.12);
  if (base.business.address) y = k.para(M, y + 2, base.business.address, 10, "body", C.inkSoft, INNER - logoW - 16, 1);
  y += 8;
  k.rule(y);
  y += 18;

  // Ring + grade
  const ringR = 44;
  const cx = M + ringR + 6;
  const cy = y + ringR + 2;
  k.els.push({ kind: "path", d: arcPath(cx, cy, ringR, 0.99999), fill: "none", stroke: C.paperDeep, strokeWidth: 10 });
  if (base.score.total > 0) k.els.push({ kind: "path", d: arcPath(cx, cy, ringR, base.score.total / 100), fill: "none", stroke: C.brass, strokeWidth: 10 });
  const totalStr = String(base.score.total);
  k.text(cx - m.width(totalStr, "headline", 30) / 2, cy + 6, totalStr, 30, "headline", C.ink);
  const outOf = t(locale, "dashboard.reports.pdf.outOf");
  k.text(cx - m.width(outOf, "body", 8) / 2, cy + 20, outOf, 8, "body", C.inkMute);
  const gradeStr = t(locale, "dashboard.reports.pdf.grade", { grade: base.score.grade });
  const gw = m.width(gradeStr, "bodyBold", 9.5) + 18;
  k.els.push({ kind: "rect", x: cx - gw / 2, y: cy + ringR + 10, w: gw, h: 17, r: 8.5, fill: NAVY, stroke: null, strokeWidth: 0 });
  k.text(cx - gw / 2 + 9, cy + ringR + 22, gradeStr, 9.5, "bodyBold", C.white);

  const colX = M + 2 * ringR + 40;
  const colW = W - M - colX;
  let ry = y + 10;
  if (weekly?.noNewScanSince) {
    k.eyebrow(colX, ry, t(locale, "dashboard.reports.pdf.changeLabelWeekly"));
    ry = k.para(colX, ry + 18, t(locale, "dashboard.reports.pdf.noNewScan", { date: formatShortDate(weekly.noNewScanSince, locale, timeZone) }), 10.5, "body", C.inkSoft, colW, 3);
  } else if (d.firstReport || !d.moved) {
    k.eyebrow(colX, ry, t(locale, K("startingPoint")));
    ry += 22;
    const scoreW = k.text(colX, ry + 2, totalStr, 22, "headline", C.ink);
    k.text(colX + scoreW + 6, ry, t(locale, K("startingLine"), { grade: base.score.grade }), 10.5, "body", C.inkSoft);
    const scanned = d.firstReport?.scannedAt ?? d.scanAt;
    ry = k.para(colX, ry + 16, scanned ? t(locale, K("startingNote"), { date: formatShortDate(scanned, locale, timeZone) }) : t(locale, K("startingNoteNoDate")), 9.5, "body", C.inkSoft, colW, 2);
  } else {
    const mv = d.moved;
    k.eyebrow(colX, ry, t(locale, K("movedLabel")));
    ry += 22;
    if (isNoChange(mv)) {
      ry = k.para(colX, ry, t(locale, K("noChangeWeek")), 13, "bodyBold", C.ink, colW, 1);
    } else {
      let x = colX;
      x += k.text(x, ry + 2, String(mv.from), 22, "headline", C.ink) + 6;
      x += k.text(x, ry, "→", 13, "body", C.inkMute) + 6;
      x += k.text(x, ry + 2, String(mv.to), 22, "headline", C.ink) + 8;
      const net = mv.to - mv.from - (mv.scoringUpdate ? mv.scoringUpdate.to - mv.scoringUpdate.from : 0);
      if (!mv.unsplit) k.text(x, ry, `(${signed(net)})`, 11, "bodyBold", net > 0 ? C.green : net < 0 ? C.red : C.inkMute);
      ry += 14;
      if (mv.unsplit) ry = k.para(colX, ry, t(locale, K("scoringUnsplit")), 9, "body", C.inkSoft, colW, 2);
      else if (mv.rows.length === 0) ry = k.para(colX, ry, t(locale, K("movedNone")), 9.5, "body", C.inkSoft, colW, 1);
      for (const row of mv.rows) {
        const ds = signed(row.delta);
        k.rightText(W - M, ry, ds, 9, "bodyBold", row.delta > 0 ? C.green : C.red);
        k.para(colX, ry, row.label, 9, "body", C.inkSoft, colW - 40, 1);
        ry += 12.5;
      }
      if (mv.scoringUpdate) ry = k.para(colX, ry, t(locale, K("scoringUpdate"), { from: mv.scoringUpdate.from, to: mv.scoringUpdate.to }), 8.5, "body", C.inkMute, colW, 2);
    }
  }
  ry += 10;
  k.eyebrow(colX, ry, t(locale, "dashboard.reports.pdf.rankLabel"));
  ry += 17;
  ry = k.para(colX, ry, d.rankText ?? t(locale, "dashboard.reports.pdf.rankNone"), 12, d.rankText ? "bodyBold" : "body", d.rankText ? C.ink : C.inkSoft, colW, 2);
  y = Math.max(cy + ringR + 38, ry + 6);
  k.rule(y);
  y += 22;

  // Categories
  k.eyebrow(M, y, t(locale, "dashboard.reports.pdf.categoriesHeading"));
  k.rightText(W - M, y, t(locale, K("outOfNote")), 8.5, "body", C.inkMute);
  y += 20;
  base.categories.forEach((cat, i) => {
    k.text(M, y, cat.label, 11.5, "bodyBold", C.ink);
    k.rightText(W - M, y, `${cat.points === null ? "—" : Math.round(cat.points)} / ${cat.weight}`, 11.5, "bodyBold", C.ink);
    const by = y + 7;
    k.els.push({ kind: "rect", x: M, y: by, w: INNER, h: 7, r: 3.5, fill: C.paperDeep, stroke: null, strokeWidth: 0 });
    const share = cat.points !== null && cat.weight > 0 ? Math.max(0, Math.min(1, cat.points / cat.weight)) : 0;
    if (share > 0) k.els.push({ kind: "rect", x: M, y: by, w: Math.max(7, INNER * share), h: 7, r: 3.5, fill: C.brass, stroke: null, strokeWidth: 0 });
    const line = d.categoryLines[i];
    if (line) k.para(M, by + 17, line, 8.5, "body", C.inkMute, INNER, 1);
    y = by + 33;
  });

  // Waiting on Google (only while it isn't connected)
  if (d.waiting && d.waiting.checks.length > 0) {
    const w = d.waiting;
    const n = w.checks.length;
    const names = w.checks.map((c) => t(locale, K(c.points === 1 ? "checkPtsOne" : "checkPts"), { label: c.label, points: c.points }));
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")}${t(locale, K("and"))}${names.at(-1)}`;
    const body = t(locale, K("waitingBody"), { checks: list, category: w.category.label, points: w.category.points === null ? "—" : Math.round(w.category.points), weight: w.category.weight });
    const bodyLines = k.lines(body, 8.5, "body", INNER - 24, 5);
    const h = 28 + bodyLines.length * 11.6;
    k.els.push({ kind: "rect", x: M, y, w: INNER, h, r: 6, fill: CREAM, stroke: C.brass, strokeWidth: 0.75, dash: true });
    k.eyebrow(M + 12, y + 16, t(locale, n === 1 ? K("waitingTitleOne") : K("waitingTitle"), { count: n }), C.ink);
    bodyLines.forEach((line, i) => k.text(M + 12, y + 29 + i * 11.6, line, 8.5, "body", C.inkSoft));
    y += h + 12;
  }
  k.rule(y);
  y += 20;

  // Reviews | Top 3
  const gap = 26;
  const leftW = (INNER - gap) * 0.48;
  const rightX = M + leftW + gap;
  const rightW = INNER - leftW - gap;
  const top = y;
  let ly = top;
  k.eyebrow(M, ly, t(locale, "dashboard.reports.pdf.reviewsHeading"));
  ly += 16;
  const r = base.reviews;
  k.text(M, ly, t(locale, "dashboard.reports.pdf.rating"), 8.5, "body", C.inkMute);
  k.text(M + leftW / 2, ly, t(locale, "dashboard.reports.pdf.reviewCount"), 8.5, "body", C.inkMute);
  const ratingStr = r.rating === null ? "—" : r.rating.toFixed(1);
  const rw = k.text(M, ly + 22, ratingStr, 20, "headline", C.ink);
  if (r.rating !== null) k.els.push({ kind: "path", d: starPath(M + rw + 10, ly + 15, 6.5), fill: C.brass });
  k.text(M + leftW / 2, ly + 22, r.count === null ? "—" : formatCount(r.count, locale), 20, "headline", C.ink);
  ly += 36;
  const reviewLimit = FOOT_Y - 30;
  if (r.goalLines && r.goalLines.length > 0) {
    r.goalLines.forEach((line, i) => {
      if (ly + 12 < reviewLimit) ly = k.para(M, ly + 1, line, 9, i === 1 ? "bodyBold" : "body", i === 1 ? C.ink : C.inkSoft, leftW, 2) + 2;
    });
  } else if (r.nearbyAverage !== null) ly = k.para(M, ly, t(locale, "dashboard.reports.pdf.nearbyAverage", { count: formatCount(r.nearbyAverage, locale) }), 9, "body", C.inkSoft, leftW, 1);
  if (weekly?.routine && ly + 14 < reviewLimit)
    k.para(M, ly + 10, t(locale, "dashboard.reports.pdf.routine", { done: weekly.routine.done, total: weekly.routine.total }), 9, "bodyBold", C.ink, leftW, 1);

  let ny = top;
  k.eyebrow(rightX, ny, t(locale, d.steps.length >= 3 ? "dashboard.reports.pdf.nextHeading" : "dashboard.reports.pdf.nextHeadingFew"));
  ny += 14;
  if (d.steps.length === 0) k.para(rightX, ny + 4, t(locale, "dashboard.reports.pdf.nextNone"), 9.5, "body", C.inkSoft, rightW, 2);
  d.steps.slice(0, 3).forEach((step, i) => {
    if (ny > FOOT_Y - 44) return;
    k.circleNumber(rightX, ny, i + 1);
    const tx = rightX + 26;
    const tw = rightW - 26;
    const pts = step.urgent ? `${t(locale, "dashboard.overview.recs.urgent")} · ${step.points}` : step.points;
    const pw = m.width(pts, "bodyBold", 8.5);
    k.text(rightX + rightW - pw, ny + 12, pts, 8.5, "bodyBold", step.urgent ? C.red : C.green);
    let sy = k.para(tx, ny + 12, step.label, 10.5, "bodyBold", C.ink, tw - pw - 8, 1);
    // The last step keeps to the room above the footer.
    sy = k.para(tx, sy + 1, step.summary, 9, "body", C.inkSoft, tw, ny + 50 > FOOT_Y - 24 ? 1 : 2);
    ny = sy + 8;
  });

  k.footer(t(locale, "dashboard.reports.pdf.footer"));
  return k.page();
}

function pageTwo(d: WeeklyReportV2Data, m: Measurer): PrintPage {
  const k = pageKit(m);
  const { locale, timeZone } = d.base;
  k.topBar();
  k.eyebrow(M, 52, t(locale, K("p2Eyebrow"), { name: d.base.business.name }));
  let y = k.para(M, 84, t(locale, d.steps.length >= 3 ? K("p2Title") : K("p2TitleFew")), 24, "headline", C.ink, INNER, 1, 1.1);
  y = k.para(M, y + 4, t(locale, d.steps.length > 0 ? K("p2Intro") : K("p2None")), 10, "body", C.inkSoft, INNER, 3) + 8;
  const limit = FOOT_Y - 24;
  d.steps.slice(0, 3).forEach((step, i) => {
    if (y > limit - 60) return;
    k.rule(y);
    y += 16;
    k.circleNumber(M, y - 2, i + 1);
    const tx = M + 30;
    const tw = INNER - 30;
    const meta = [step.urgent ? t(locale, "dashboard.overview.recs.urgent") : null, step.points, step.minutes ? t(locale, K("minutes"), { minutes: step.minutes }) : null].filter(Boolean).join(" · ");
    const mw = m.width(meta, "bodyBold", 8.5);
    k.text(W - M - mw, y + 10, meta, 8.5, "bodyBold", step.urgent ? C.red : C.green);
    y = k.para(tx, y + 11, step.title, 12, "bodyBold", C.ink, tw - mw - 10, 1) + 3;
    if (step.why) y = k.para(tx, y, step.why, 9.8, "body", C.inkSoft, tw, 4) + 3;
    for (const b of step.bullets) {
      if (y > limit - 20) break;
      k.els.push({ kind: "rect", x: tx + 2, y: y - 4, w: 3.5, h: 3.5, r: 1.75, fill: C.ink, stroke: null, strokeWidth: 0 });
      y = k.para(tx + 12, y, b, 9.5, "body", C.ink, tw - 12, 3) + 2;
    }
    if (step.script && y < limit - 40) y = k.scriptBox(tx, y + 2, tw, step.script.label, step.script.text) + 4;
    y += 10;
  });
  k.footer(d.scanAt ? t(locale, K("p2Footer"), { date: formatShortDate(d.scanAt, locale, timeZone) }) : t(locale, "dashboard.reports.pdf.footer"));
  return k.page();
}

function pageThree(d: WeeklyReportV2Data, m: Measurer): PrintPage {
  const k = pageKit(m);
  const { locale, timeZone } = d.base;
  k.topBar();
  k.eyebrow(M, 52, t(locale, K("p3Eyebrow")));
  let y = k.para(M, 84, t(locale, K("p3Title")), 24, "headline", C.ink, INNER, 1, 1.1);
  y = k.para(M, y + 4, t(locale, K("p3Intro")), 10, "body", C.inkSoft, INNER, 3) + 8;

  // Write it once → Google → Facebook → Instagram
  let x = M;
  ["chip1", "chip2", "chip3", "chip4"].forEach((key, i) => {
    const label = t(locale, K(key));
    const w = m.width(label, "bodyBold", 9.5) + 20;
    k.els.push({ kind: "rect", x, y, w, h: 20, r: 10, fill: C.white, stroke: C.line, strokeWidth: 0.9 });
    k.text(x + 10, y + 13.5, label, 9.5, "bodyBold", C.ink);
    x += w;
    if (i < 3) {
      k.text(x + 5, y + 14, "→", 10, "body", C.brass);
      x += 20;
    }
  });
  y += 36;
  y = k.para(M, y, t(locale, K("rhythm")), 10, "body", C.inkSoft, INNER, 2) + 10;

  // The two boxes and the last box get their room first; the posts take what's left.
  const gap = 14;
  const colW = (INNER - gap) / 2;
  const itemLines = (items: string[], width: number) => items.reduce((n, s) => n + k.lines(s, 9, "body", width, 3).length, 0);
  const todayH =
    30 +
    itemLines(
      d.today.map((i) => i.text),
      colW - 34 - 34
    ) *
      12.6 +
    d.today.length * 3;
  const headedH = 30 + itemLines(d.headed, colW - 34) * 12.6 + d.headed.length * 16;
  const boxH = Math.max(todayH, headedH) + 8;
  const free = d.plan === "free";
  const lastLines = k.lines(t(locale, free ? K("upgradeBody") : K("teaserBody")), 9.5, "body", INNER - 28, 5);
  const lastH = 36 + lastLines.length * 13.5;
  const postsLimit = FOOT_Y - 24 - lastH - 14 - boxH - 14;

  if (d.posts.kind === "website" && d.posts.rows.length > 0) {
    k.eyebrow(M, y, t(locale, K("datesHeading")));
    y += 16;
    const c1 = M;
    const c2 = M + 80;
    const c3 = M + 300;
    k.text(c1, y, t(locale, K("colDate")).toUpperCase(), 7.5, "bodyBold", C.inkMute, 0.6);
    k.text(c2, y, t(locale, K("colSite")).toUpperCase(), 7.5, "bodyBold", C.inkMute, 0.6);
    k.text(c3, y, t(locale, K("colIdea")).toUpperCase(), 7.5, "bodyBold", C.inkMute, 0.6);
    y += 6;
    for (const row of d.posts.rows) {
      // Room for this row and the note under the table.
      const titleText = row.title ?? t(locale, K(d.posts.listing === "event" ? "eventFallbackEvent" : "eventFallback"));
      const rowH = Math.max(k.lines(titleText, 9, "body", c3 - c2 - 12, 2).length, k.lines(row.idea, 9, "body", W - M - c3, 2).length) * 12.6 + 16;
      if (y + rowH + 24 > postsLimit) break;
      k.rule(y);
      y += 13;
      k.text(c1, y, row.when, 9.5, "bodyBold", C.ink);
      const a = k.para(c2, y, titleText, 9, row.title ? "bodyBold" : "body", row.title ? C.ink : C.inkMute, c3 - c2 - 12, 2);
      const b = k.para(c3, y, row.idea, 9, "body", C.inkSoft, W - M - c3, 2);
      y = Math.max(a, b) + 3;
    }
    k.rule(y);
    y = k.para(M, y + 12, t(locale, K("datesNote"), { site: d.posts.site, date: formatShortDate(d.posts.checkedAt, locale, timeZone) }), 8, "body", C.inkMute, INNER, 1) + 10;
  } else if (d.posts.kind === "ideas") {
    k.eyebrow(M, y, t(locale, K("ideasHeading")));
    y += 16;
    for (const idea of d.posts.ideas) {
      if (y + 28 > postsLimit) break;
      k.els.push({ kind: "rect", x: M + 2, y: y - 4, w: 3.5, h: 3.5, r: 1.75, fill: C.brass, stroke: null, strokeWidth: 0 });
      y = k.para(M + 12, y, idea, 9.5, "body", C.ink, INNER - 12, 2) + 3;
    }
    y += 8;
  }

  // Today | Where it's headed
  const boxTop = y;
  {
    k.els.push({ kind: "rect", x: M, y: boxTop, w: colW, h: boxH, r: 6, fill: C.white, stroke: C.line, strokeWidth: 0.9 });
    k.eyebrow(M + 12, boxTop + 18, t(locale, K("todayHeading")));
    let ty = boxTop + 34;
    for (const item of d.today) {
      if (ty > boxTop + boxH - 10) break;
      k.els.push({ kind: "rect", x: M + 14, y: ty - 4, w: 3.5, h: 3.5, r: 1.75, fill: C.ink, stroke: null, strokeWidth: 0 });
      ty = k.para(M + 24, ty, item.text, 9, "body", C.ink, colW - 34 - 34, 3);
      if (item.beta) {
        const bw = m.width("Beta", "bodyBold", 7.5) + 10;
        k.els.push({ kind: "rect", x: M + colW - 12 - bw, y: ty - 21, w: bw, h: 12, r: 6, fill: CREAM, stroke: null, strokeWidth: 0 });
        k.text(M + colW - 7 - bw, ty - 12.5, "Beta", 7.5, "bodyBold", C.brass);
      }
      ty += 3;
    }
    const hx = M + colW + gap;
    k.els.push({ kind: "rect", x: hx, y: boxTop, w: colW, h: boxH, r: 6, fill: NAVY, stroke: null, strokeWidth: 0 });
    k.eyebrow(hx + 12, boxTop + 18, t(locale, K("headedHeading")));
    let hy = boxTop + 34;
    const soon = t(locale, "dashboard.common.comingSoon");
    for (const item of d.headed) {
      if (hy > boxTop + boxH - 20) break;
      k.els.push({ kind: "rect", x: hx + 14, y: hy - 4, w: 3.5, h: 3.5, r: 1.75, fill: C.white, stroke: null, strokeWidth: 0 });
      hy = k.para(hx + 24, hy, item, 9, "body", C.white, colW - 34, 3);
      const sw = m.width(soon, "bodyBold", 7.5) + 12;
      k.els.push({ kind: "rect", x: hx + 24, y: hy - 7, w: sw, h: 12, r: 6, fill: "#34406a", stroke: null, strokeWidth: 0 });
      k.text(hx + 30, hy + 1.5, soon, 7.5, "bodyBold", "#e9c77d");
      hy += 16;
    }
    y = boxTop + boxH + 14;
  }

  // Free: upgrade. Paid: next week.
  const title = t(locale, free ? K("upgradeTitle") : K("teaserTitle"));
  const bodyLines = lastLines;
  const h = lastH;
  if (y + h < FOOT_Y - 20) {
    k.els.push({ kind: "rect", x: M, y, w: INNER, h, r: 6, fill: CREAM, stroke: C.brass, strokeWidth: 0.9 });
    k.eyebrow(M + 14, y + 18, title);
    bodyLines.forEach((line, i) => k.text(M + 14, y + 34 + i * 13.5, line, 9.5, "body", C.ink));
  }
  k.footer(t(locale, K("p3Footer"), { name: d.base.business.name }));
  return k.page();
}

/** The three pages. Never more: every section is capped to its space. */
export function layoutWeeklyReportV2(data: WeeklyReportV2Data, m: Measurer): PrintPage[] {
  return [pageOne(data, m), pageTwo(data, m), pageThree(data, m)];
}

/** Every text the pages print, for tests ("undefined" never appears). */
export function printedTexts(pages: PrintPage[]): string[] {
  return pages.flatMap((p) => p.panels.flatMap((panel) => panel.elements.flatMap((e) => (e.kind === "text" ? [e.text] : []))));
}
