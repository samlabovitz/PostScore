// Pure formatting/parsing for scripts/rescan-all.ts's
// ~/Desktop/rescan-report.md — no side effects, no network, no file I/O.
//
// Day 4 Task B: a partial run (--only and/or --limit) must never
// overwrite the full report and silently delete every OTHER business's
// results. This module is what makes that possible: it can parse an
// EXISTING report back into structured per-business entries, merge a
// fresh partial run's entries into that existing set (replacing only
// the businesses this run actually touched, keeping everyone else
// exactly as they were), and re-render the whole thing — including any
// hand-written narrative content appended after the auto-generated
// sections (e.g. a "Follow-up" note), which is preserved byte-for-byte
// rather than discarded.
//
// Deliberately its own file (not inlined in scripts/rescan-all.ts):
// rescan-all.ts's own top-level code reads .env.local and instantiates
// a real Supabase client as soon as it's imported, and dynamically
// loads rescanBusinessWithClient through a server-only workaround —
// none of that belongs in something a plain vitest test should be able
// to import directly.

import { CHECKS, type ScoreBreakdown } from "../lib/scoring";

export type CheckState = "full" | "partial" | "zero" | "not scored";

export const WEBSITE_CHECK_IDS = CHECKS.filter((c) => c.id.startsWith("website.")).map((c) => c.id);

export function checkState(breakdown: ScoreBreakdown, checkId: string): CheckState {
  const check = breakdown.checks.find((c) => c.id === checkId);
  if (!check || check.confidence === "NOT_FOUND") return "not scored";
  if (check.earnedPoints === check.maxPoints) return "full";
  if (check.earnedPoints === 0) return "zero";
  return "partial";
}

/** One business's real result, in the exact shape the report renders —
 * either a failure (no score/checks at all) or a real before/after
 * score plus every website check's before/after state and real reason
 * (if any). This is the shape BOTH a fresh rescan and a parsed-back
 * existing report section produce, so the two can be merged as equals. */
export interface BusinessEntry {
  businessId: string;
  businessName: string;
  status: "ok" | "failed";
  failReason?: string;
  /** undefined = "no previous score" (a business scored for the very
   * first time) or, for afterTotal, "?" (a rescan reported success but
   * the new score couldn't be read back — shouldn't normally happen). */
  beforeTotal?: number;
  afterTotal?: number;
  checks?: Record<string, { before: CheckState; after: CheckState; reason: string | null }>;
}

/** Builds a real BusinessEntry from a fresh rescan's actual data — the
 * only place beforeBreakdown/afterBreakdown ever get turned into the
 * display states, so a fresh run and a parsed-back one can never
 * compute states differently. */
export function toBusinessEntry(input: {
  businessId: string;
  businessName: string;
  beforeTotal?: number;
  beforeBreakdown?: ScoreBreakdown;
  afterTotal?: number;
  afterBreakdown?: ScoreBreakdown;
  reasonFor: (checkId: string) => string | null;
}): BusinessEntry {
  const checks: BusinessEntry["checks"] = {};
  for (const checkId of WEBSITE_CHECK_IDS) {
    const before = input.beforeBreakdown ? checkState(input.beforeBreakdown, checkId) : "not scored";
    const after = input.afterBreakdown ? checkState(input.afterBreakdown, checkId) : "not scored";
    const reason = after === "not scored" ? input.reasonFor(checkId) : null;
    checks[checkId] = { before, after, reason };
  }
  return {
    businessId: input.businessId,
    businessName: input.businessName,
    status: "ok",
    beforeTotal: input.beforeTotal,
    afterTotal: input.afterTotal,
    checks,
  };
}

function renderBusinessEntry(e: BusinessEntry): string {
  const lines: string[] = [];
  lines.push(`## ${e.businessName} (${e.businessId})`);
  if (e.status === "failed") {
    lines.push(`**FAILED**: ${e.failReason}`);
    return lines.join("\n");
  }
  lines.push(`Score: ${e.beforeTotal ?? "no previous score"} -> ${e.afterTotal ?? "?"}`);
  lines.push("");
  lines.push("| Check | Before | After | Reason if still not scored |");
  lines.push("|---|---|---|---|");
  for (const checkId of WEBSITE_CHECK_IDS) {
    const c = e.checks?.[checkId] ?? { before: "not scored" as CheckState, after: "not scored" as CheckState, reason: null };
    lines.push(`| ${checkId} | ${c.before} | ${c.after} | ${c.reason ?? "—"} |`);
  }
  return lines.join("\n");
}

export interface TotalsSummary {
  total: number;
  succeeded: number;
  failed: number;
  measuredBefore: number;
  measuredAfter: number;
  httpsDownCount: number;
  httpsBlockedCount: number;
  pageSpeedTimedOutCount: number;
  pageSpeedHttpErrorCount: number;
}

export function computeTotals(entries: BusinessEntry[]): TotalsSummary {
  let measuredBefore = 0;
  let measuredAfter = 0;
  let httpsDownCount = 0;
  let httpsBlockedCount = 0;
  let pageSpeedTimedOutCount = 0;
  let pageSpeedHttpErrorCount = 0;

  for (const e of entries) {
    if (e.status !== "ok" || !e.checks) continue;
    const perf = e.checks["website.performance_mobile"];
    if (perf) {
      if (perf.before !== "not scored") measuredBefore++;
      if (perf.after !== "not scored") measuredAfter++;
      if (perf.reason === "timed_out") pageSpeedTimedOutCount++;
      if (perf.reason?.startsWith("http_error")) pageSpeedHttpErrorCount++;
    }
    const https = e.checks["website.https"];
    if (https) {
      if (https.reason === "down") httpsDownCount++;
      if (https.reason === "blocked_automated_check") httpsBlockedCount++;
    }
  }

  return {
    total: entries.length,
    succeeded: entries.filter((e) => e.status === "ok").length,
    failed: entries.filter((e) => e.status === "failed").length,
    measuredBefore,
    measuredAfter,
    httpsDownCount,
    httpsBlockedCount,
    pageSpeedTimedOutCount,
    pageSpeedHttpErrorCount,
  };
}

export interface SignificantChange {
  businessName: string;
  before: number;
  after: number;
  delta: number;
  reasons: string[];
}

export function computeSignificantChanges(entries: BusinessEntry[]): SignificantChange[] {
  const out: SignificantChange[] = [];
  for (const e of entries) {
    if (e.status !== "ok" || e.beforeTotal === undefined || e.afterTotal === undefined) continue;
    const delta = e.afterTotal - e.beforeTotal;
    if (Math.abs(delta) <= 5) continue;
    const changeReasons: string[] = [];
    if (e.checks) {
      for (const checkId of WEBSITE_CHECK_IDS) {
        const c = e.checks[checkId];
        if (c && c.before !== c.after) {
          changeReasons.push(`${checkId}: ${c.before} -> ${c.after}${c.reason ? ` (${c.reason})` : ""}`);
        }
      }
    }
    out.push({
      businessName: e.businessName,
      before: e.beforeTotal,
      after: e.afterTotal,
      delta,
      reasons: changeReasons.length > 0 ? changeReasons : ["no individual website check state changed — see full score breakdown"],
    });
  }
  return out;
}

/**
 * Renders the complete report: header, every business entry (in the
 * order given — callers decide ordering, e.g. existing-order-preserved
 * for a merge), Totals and "score changed by more than 5 points"
 * (always recomputed fresh from `entries`, never trusted from old
 * text), then any preserved trailing content verbatim.
 */
export function renderFullReport(
  entries: BusinessEntry[],
  timestampIso: string,
  subtitle: string,
  trailingContent: string
): string {
  const lines: string[] = [];
  lines.push(`# Bulk re-scan report — ${timestampIso}`);
  lines.push("");
  lines.push(subtitle);
  lines.push("");
  for (const e of entries) {
    lines.push(renderBusinessEntry(e));
    lines.push("");
  }

  const totals = computeTotals(entries);
  lines.push("## Totals");
  lines.push(`- Businesses in this report: ${totals.total}`);
  lines.push(`- Succeeded: ${totals.succeeded}`);
  lines.push(`- Failed: ${totals.failed}`);
  lines.push(`- Had a measured mobile-speed score BEFORE: ${totals.measuredBefore}`);
  lines.push(`- Have a measured mobile-speed score AFTER: ${totals.measuredAfter}`);
  lines.push(`- website.https unreachable, reason "down": ${totals.httpsDownCount}`);
  lines.push(`- website.https unreachable, reason "blocked_automated_check": ${totals.httpsBlockedCount}`);
  lines.push(`- website.performance_mobile unmeasured, reason "timed_out": ${totals.pageSpeedTimedOutCount}`);
  lines.push(`- website.performance_mobile unmeasured, reason "http_error": ${totals.pageSpeedHttpErrorCount}`);
  lines.push("");

  lines.push("## Businesses whose score changed by more than 5 points");
  const changes = computeSignificantChanges(entries);
  if (changes.length === 0) {
    lines.push("None.");
  } else {
    for (const c of changes) {
      lines.push(
        `- **${c.businessName}**: ${c.before} -> ${c.after} (${c.delta > 0 ? "+" : ""}${c.delta}). Reason(s): ${c.reasons.join("; ")}`
      );
    }
  }

  if (trailingContent.trim().length > 0) {
    lines.push("");
    lines.push(trailingContent.trim());
  }

  return lines.join("\n");
}

export interface ParsedExistingReport {
  entries: BusinessEntry[];
  /** Any content after the auto-generated Totals/significant-changes
   * sections — hand-written narrative (e.g. a "Follow-up" note) that
   * must survive a merge untouched. "" when there was none. */
  trailingContent: string;
}

function parseBusinessEntryBody(businessId: string, businessName: string, body: string): BusinessEntry {
  const failedMatch = body.match(/^\*\*FAILED\*\*:\s*([\s\S]*?)\s*$/m);
  if (failedMatch && !body.includes("| Check |")) {
    return { businessId, businessName, status: "failed", failReason: failedMatch[1] };
  }

  const scoreMatch = body.match(/^Score:\s*(.+?)\s*->\s*(.+?)\s*$/m);
  const rawBefore = scoreMatch?.[1];
  const rawAfter = scoreMatch?.[2];
  // afterTotal's raw text can carry a trailing parenthetical note (see
  // the Endless Nails follow-up entry) — only the leading number/token
  // matters for re-parsing.
  const beforeTotal = rawBefore && rawBefore !== "no previous score" ? Number(rawBefore) : undefined;
  const afterToken = rawAfter?.split(/\s*\(/)[0]?.trim();
  const afterTotal = afterToken && afterToken !== "?" ? Number(afterToken) : undefined;

  const checks: BusinessEntry["checks"] = {};
  const rowRe = /^\|\s*(website\.[a-z_]+)\s*\|\s*([a-z ]+?)\s*\|\s*([a-z ]+?)\s*\|\s*(.+?)\s*\|\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(body)) !== null) {
    const [, checkId, before, after, reasonRaw] = m;
    checks[checkId] = {
      before: before as CheckState,
      after: after as CheckState,
      reason: reasonRaw === "—" ? null : reasonRaw,
    };
  }

  return {
    businessId,
    businessName,
    status: "ok",
    beforeTotal: Number.isNaN(beforeTotal) ? undefined : beforeTotal,
    afterTotal: Number.isNaN(afterTotal) ? undefined : afterTotal,
    checks,
  };
}

/**
 * Parses a previously-written report back into structured entries plus
 * any trailing hand-written content. Returns null when `content`
 * doesn't even start with this report's own real header — a foreign or
 * corrupted file is never guessed at, the caller falls back to writing
 * a fresh report for just this run rather than risking a bad merge.
 */
export function parseExistingReport(content: string): ParsedExistingReport | null {
  if (!content.startsWith("# Bulk re-scan report")) return null;

  const lines = content.split("\n");
  const sections: Array<{ header: string; body: string }> = [];
  let currentHeader: string | null = null;
  let currentBody: string[] = [];
  const flush = () => {
    if (currentHeader !== null) sections.push({ header: currentHeader, body: currentBody.join("\n") });
  };
  for (const line of lines) {
    if (line.startsWith("## ")) {
      flush();
      currentHeader = line.slice(3).trim();
      currentBody = [];
    } else if (currentHeader !== null) {
      currentBody.push(line);
    }
  }
  flush();

  const entries: BusinessEntry[] = [];
  const trailingParts: string[] = [];
  let pastAutoGeneratedSections = false;

  for (const section of sections) {
    if (section.header === "Totals" || section.header === "Businesses whose score changed by more than 5 points") {
      pastAutoGeneratedSections = true;
      continue;
    }
    if (pastAutoGeneratedSections) {
      trailingParts.push(`## ${section.header}\n${section.body}`.trimEnd());
      continue;
    }
    const match = section.header.match(/^(.*) \(([^)]+)\)$/);
    if (!match) {
      // Doesn't look like a real "<name> (<id>)" business entry, and we
      // haven't reached Totals yet — never guess, just preserve it.
      trailingParts.push(`## ${section.header}\n${section.body}`.trimEnd());
      continue;
    }
    const [, businessName, businessId] = match;
    entries.push(parseBusinessEntryBody(businessId, businessName, section.body));
  }

  return { entries, trailingContent: trailingParts.join("\n\n") };
}

/**
 * Merges a fresh partial run's entries into the existing set: a
 * business this run touched is REPLACED in place (same position as
 * before); every other existing business is kept completely unchanged;
 * a business in `fresh` that wasn't in `existing` at all (new since the
 * last report) is appended at the end. Never drops an existing entry.
 */
export function mergeBusinessEntries(existing: BusinessEntry[], fresh: BusinessEntry[]): BusinessEntry[] {
  const freshById = new Map(fresh.map((e) => [e.businessId, e]));
  const seen = new Set<string>();
  const merged = existing.map((e) => {
    seen.add(e.businessId);
    return freshById.get(e.businessId) ?? e;
  });
  for (const e of fresh) {
    if (!seen.has(e.businessId)) merged.push(e);
  }
  return merged;
}
