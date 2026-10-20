// Server side of the weekly recap, the weekly snapshots and "Since your
// last visit". Every function takes the caller's (RLS-scoped) Supabase
// client, reads only data already saved — scans, competitor scans, tasks,
// the weekly routine — and never calls Google or PageSpeed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseChartCategories } from "@/lib/scoreHistory";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { groupSavedScans, SAVED_SCAN_COLUMNS, type SavedScanRow } from "@/lib/savedCompetitorScans";
import { ownerStanding } from "@/lib/competitorComparison";
import { unfinishedNewScanIds, withoutUnfinished } from "@/lib/competitorScoringStatus";
import { WEEKLY_CHECKLIST_ITEM_IDS } from "@/lib/weeklyChecklist";
import type { Locale } from "@/lib/i18n";
import { SNAPSHOT_COLUMNS, snapshotFromWeek, weeksNeedingSnapshots, type WeeklySnapshotRow } from "./snapshots";
import { buildWeekSummary, type WeeklyScan } from "./weeklyReport";
import { weekBounds } from "./weeks";
import { loadCompetitorScope } from "@/lib/businessNiche.server";


/** Every saved scan for a business, oldest first. */
export async function loadWeeklyScans(supabase: SupabaseClient, businessId: string): Promise<WeeklyScan[]> {
  const { data } = await supabase
    .from("scores")
    .select("id, total, grade, created_at, scoring_version, profile_snapshot_json, breakdown_categories:breakdown_json->categories")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    total: Number(r.total),
    grade: String(r.grade ?? ""),
    createdAt: String(r.created_at),
    scoringVersion: typeof r.scoring_version === "string" && r.scoring_version ? r.scoring_version : null,
    categories: parseChartCategories(r.breakdown_categories),
    profile: (r.profile_snapshot_json as ProfileSnapshot | null) ?? null,
  }));
}

/** The owner's local rank (shared ownerStanding / rankBy) from the latest
 * saved competitor scan at or before `at`, and the scan before that one. */
export async function rankAt(supabase: SupabaseClient, businessId: string, at: string): Promise<{ rank: number; of: number; previous: number | null } | null> {
  const [{ data, error }, unfinished, scope] = await Promise.all([
    supabase.from("competitor_scans").select(SAVED_SCAN_COLUMNS).eq("business_id", businessId).lte("created_at", at).order("created_at", { ascending: false }).limit(150),
    unfinishedNewScanIds(supabase, businessId),
    loadCompetitorScope(supabase, businessId),
  ]);
  if (error || !data) return null;
  const rows = withoutUnfinished(data as SavedScanRow[], unfinished);
  const ids = Array.from(new Set(rows.map((r) => r.scan_id)));
  if (ids.length === 0) return null;
  const standing = (id: string) => {
    const scan = groupSavedScans(rows.filter((r) => r.scan_id === id))[0];
    return scan ? ownerStanding(scan, scope) : null;
  };
  const now = standing(ids[0]);
  if (!now) return null;
  return { rank: now.rank, of: now.of, previous: ids[1] ? standing(ids[1])?.rank ?? null : null };
}

/** Action-plan fixes a re-scan confirmed in [from, to). */
export async function fixesConfirmedBetween(supabase: SupabaseClient, businessId: string, from: string, to: string): Promise<number> {
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "completed")
    .gte("verified_at", from)
    .lt("verified_at", to);
  return count ?? 0;
}

/** Weekly routine items checked that week (of the fixed list). */
export async function routineFor(supabase: SupabaseClient, businessId: string, weekStart: string): Promise<{ done: number; total: number }> {
  const { data } = await supabase.from("weekly_checks").select("item_id").eq("business_id", businessId).eq("week_start", weekStart);
  const done = new Set(((data ?? []) as Array<{ item_id: string }>).map((r) => r.item_id).filter((id) => (WEEKLY_CHECKLIST_ITEM_IDS as readonly string[]).includes(id))).size;
  return { done, total: WEEKLY_CHECKLIST_ITEM_IDS.length };
}

/** A missing table (the SQL file hasn't been run yet). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? ""));
}

export async function loadSnapshotWeeks(supabase: SupabaseClient, businessId: string): Promise<{ enabled: boolean; weeks: Set<string> }> {
  const { data, error } = await supabase.from("weekly_snapshots").select("week_start").eq("business_id", businessId);
  if (error) return { enabled: !isMissingTable(error), weeks: new Set() };
  return { enabled: true, weeks: new Set(((data ?? []) as Array<{ week_start: string }>).map((r) => r.week_start)) };
}

/** Freezes every finished week that has scans but no snapshot yet.
 * Insert-only (unique business + week): never overwrites, never
 * duplicates. Returns the weeks it added. */
export async function ensureWeeklySnapshots(
  supabase: SupabaseClient,
  businessId: string,
  scans: WeeklyScan[],
  timeZone: string,
  locale: Locale,
  now: Date = new Date()
): Promise<{ enabled: boolean; added: string[] }> {
  const existing = await loadSnapshotWeeks(supabase, businessId);
  if (!existing.enabled) return { enabled: false, added: [] };
  const todo = weeksNeedingSnapshots(
    scans.map((s) => s.createdAt),
    existing.weeks,
    now,
    timeZone
  ).slice(-104); // at most two years in one go
  const rows: WeeklySnapshotRow[] = [];
  for (const weekStart of todo) {
    const week = buildWeekSummary(weekStart, scans, timeZone, locale);
    const { start, end } = weekBounds(weekStart, timeZone);
    const [rank, fixes] = await Promise.all([
      rankAt(supabase, businessId, end.toISOString()),
      fixesConfirmedBetween(supabase, businessId, start.toISOString(), end.toISOString()),
    ]);
    const row = snapshotFromWeek(businessId, week, { rank: rank?.rank ?? null, rankOf: rank?.of ?? null, prevRank: rank?.previous ?? null, fixesConfirmed: fixes });
    if (row) rows.push(row);
  }
  if (rows.length === 0) return { enabled: true, added: [] };
  const { error } = await supabase.from("weekly_snapshots").upsert(rows, { onConflict: "business_id,week_start", ignoreDuplicates: true });
  if (error) return { enabled: !isMissingTable(error), added: [] };
  return { enabled: true, added: rows.map((r) => r.week_start) };
}

export async function loadSnapshot(supabase: SupabaseClient, businessId: string, weekStart: string): Promise<WeeklySnapshotRow | null> {
  const { data, error } = await supabase.from("weekly_snapshots").select(SNAPSHOT_COLUMNS).eq("business_id", businessId).eq("week_start", weekStart).maybeSingle();
  if (error) return null;
  return (data as WeeklySnapshotRow | null) ?? null;
}

/** Past reports, newest first: a page of rows, the total, and the years. */
export async function loadPastReports(
  supabase: SupabaseClient,
  businessId: string,
  options: { offset: number; limit: number; year?: number | null }
): Promise<{ rows: WeeklySnapshotRow[]; total: number; years: number[] }> {
  let query = supabase.from("weekly_snapshots").select(SNAPSHOT_COLUMNS, { count: "exact" }).eq("business_id", businessId);
  if (options.year) query = query.gte("week_start", `${options.year}-01-01`).lte("week_start", `${options.year}-12-31`);
  const [{ data, count, error }, { data: all }] = await Promise.all([
    query.order("week_start", { ascending: false }).range(options.offset, options.offset + options.limit - 1),
    supabase.from("weekly_snapshots").select("week_start").eq("business_id", businessId),
  ]);
  if (error) return { rows: [], total: 0, years: [] };
  const years = Array.from(new Set(((all ?? []) as Array<{ week_start: string }>).map((r) => Number(r.week_start.slice(0, 4))))).sort((a, b) => b - a);
  return { rows: (data ?? []) as WeeklySnapshotRow[], total: count ?? 0, years };
}
