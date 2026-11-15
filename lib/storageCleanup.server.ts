// Server-only. The nightly storage cleanup (app/api/cron/storage-cleanup,
// netlify/functions/storage-cleanup-scheduler.mts). Each rule counts what it
// would change and, unless it's a dry run, changes it. Logs and returns
// counts only — never ids or values. Dry run unless STORAGE_CLEANUP_LIVE=true.
//   lat_lng            businesses.lat/lng read from Places > 30 days ago → null
//   change_values      gbp_changes before/after past the 7-day undo → null
//   practice_changes   practice gbp_changes rows > 7 days → deleted
//   google_edit_values gbp_google_edits values 30 days after resolved → null
//   reply_drafts       review_reply_drafts > 90 days → deleted
//   lost_connections   Google data 30 days after a lost connection → deleted
//   screenshots        files of deleted businesses, unused, or > 90 days → deleted
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const DAY = 86_400_000;
export const LAT_LNG_DAYS = 30;
export const UNDO_DAYS = 7;
export const EDIT_VALUE_DAYS = 30;
export const DRAFT_DAYS = 90;
export const LOST_CONNECTION_DAYS = 30;

export type CleanupRule = "lat_lng" | "change_values" | "practice_changes" | "google_edit_values" | "reply_drafts" | "lost_connections" | "screenshots";
export interface RuleResult {
  rule: CleanupRule;
  count: number;
  /** The rule couldn't run (e.g. a column before its SQL) — nothing changed. */
  skipped?: string;
}

export function storageCleanupLive(env: Record<string, string | undefined> = process.env): boolean {
  return env.STORAGE_CLEANUP_LIVE === "true";
}

const iso = (now: number, days: number) => new Date(now - days * DAY).toISOString();
const PRACTICE_OR = "kind.like.%_practice,location_name.eq.locations/practice";

type Head = { count: number | null; error: { message: string } | null };

async function counted(rule: CleanupRule, head: PromiseLike<Head>, apply: () => PromiseLike<{ error: { message: string } | null }>, dryRun: boolean): Promise<RuleResult> {
  const h = await head;
  if (h.error) return { rule, count: 0, skipped: h.error.message.slice(0, 80) };
  const count = h.count ?? 0;
  if (!dryRun && count > 0) {
    const r = await apply();
    if (r.error) return { rule, count: 0, skipped: r.error.message.slice(0, 80) };
  }
  return { rule, count };
}

export async function cleanLatLng(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const cutoff = iso(now, LAT_LNG_DAYS);
  return counted(
    "lat_lng",
    admin.from("businesses").select("id", { count: "exact", head: true }).not("lat", "is", null).lt("lat_lng_fetched_at", cutoff),
    () => admin.from("businesses").update({ lat: null, lng: null }).not("lat", "is", null).lt("lat_lng_fetched_at", cutoff),
    dryRun
  );
}

export async function cleanChangeValues(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const cutoff = iso(now, UNDO_DAYS);
  const values = "before_value.not.is.null,after_value.not.is.null";
  return counted(
    "change_values",
    admin.from("gbp_changes").select("id", { count: "exact", head: true }).lt("approved_at", cutoff).or(values).not("kind", "like", "%_practice"),
    () => admin.from("gbp_changes").update({ before_value: null, after_value: null }).lt("approved_at", cutoff).or(values).not("kind", "like", "%_practice"),
    dryRun
  );
}

export async function cleanPracticeChanges(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const cutoff = iso(now, UNDO_DAYS);
  return counted(
    "practice_changes",
    admin.from("gbp_changes").select("id", { count: "exact", head: true }).lt("approved_at", cutoff).or(PRACTICE_OR),
    () => admin.from("gbp_changes").delete().lt("approved_at", cutoff).or(PRACTICE_OR),
    dryRun
  );
}

export async function cleanGoogleEditValues(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const cutoff = iso(now, EDIT_VALUE_DAYS);
  return counted(
    "google_edit_values",
    admin.from("gbp_google_edits").select("id", { count: "exact", head: true }).lt("resolved_at", cutoff).or("owner_value.not.is.null,google_value.not.is.null"),
    () => admin.from("gbp_google_edits").update({ owner_value: null, google_value: null }).lt("resolved_at", cutoff).or("owner_value.not.is.null,google_value.not.is.null"),
    dryRun
  );
}

export async function cleanReplyDrafts(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const cutoff = iso(now, DRAFT_DAYS);
  return counted(
    "reply_drafts",
    admin.from("review_reply_drafts").select("id", { count: "exact", head: true }).lt("created_at", cutoff),
    () => admin.from("review_reply_drafts").delete().lt("created_at", cutoff),
    dryRun
  );
}

/** Google refused the connection 30+ days ago and the owner hasn't reconnected: every Google value goes. */
export async function cleanLostConnections(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  const { data, error } = await admin.from("gbp_connections").select("business_id").neq("status", "connected").lt("disconnected_at", iso(now, LOST_CONNECTION_DAYS));
  if (error) return { rule: "lost_connections", count: 0, skipped: error.message.slice(0, 80) };
  const ids = ((data ?? []) as Array<{ business_id: string }>).map((r) => r.business_id);
  if (!dryRun) {
    const { deleteGoogleData } = await import("@/lib/gbpDataCleanup.server");
    for (const id of ids) await deleteGoogleData(admin, id);
  }
  return { rule: "lost_connections", count: ids.length };
}

export async function cleanScreenshots(admin: SupabaseClient, now: number, dryRun: boolean): Promise<RuleResult> {
  try {
    const { sweepScreenshots } = await import("@/lib/screenshotStorage.server");
    const r = await sweepScreenshots(admin, { now, dryRun });
    return { rule: "screenshots", count: dryRun ? r.plan.length : r.deleted };
  } catch (err) {
    return { rule: "screenshots", count: 0, skipped: (err instanceof Error ? err.message : "error").slice(0, 80) };
  }
}

export async function runStorageCleanup(admin: SupabaseClient, options: { now?: number; dryRun: boolean }): Promise<RuleResult[]> {
  const now = options.now ?? Date.now();
  const rules = [cleanLatLng, cleanChangeValues, cleanPracticeChanges, cleanGoogleEditValues, cleanReplyDrafts, cleanLostConnections, cleanScreenshots];
  const out: RuleResult[] = [];
  for (const rule of rules) {
    try {
      out.push(await rule(admin, now, options.dryRun));
    } catch (err) {
      out.push({ rule: rule.name as CleanupRule, count: 0, skipped: (err instanceof Error ? err.message : "error").slice(0, 80) });
    }
  }
  return out;
}
