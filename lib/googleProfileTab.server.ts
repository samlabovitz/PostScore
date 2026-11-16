import "server-only";

// The Google Profile tab's saved data (lib/googleProfileTab.ts): coupons
// running, last month's listing changes / review replies / campaigns, the
// latest changes made from PostScore and what changed on the listing
// between the last two scans. Reads only, RLS-scoped, no Google calls; a
// failed read leaves its part empty, never a guess.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileSnapshot } from "@/lib/profileChanges";
import { changesAcross } from "@/lib/scanChanges";
import { FP_KEY_COLUMN, loadScanChangeRecords } from "@/lib/scanChanges.server";
import { loadGoogleEdits } from "@/lib/gbpGoogleEdits.server";
import {
  changedByOthers,
  watchedChanges,
  WATCHED_FIELDS,
  madeFromPostScore,
  monthKeyOf,
  monthListingChanges,
  monthRecap,
  previousMonthKey,
  type ChangeRow,
  type GoogleTabSaved,
  type WatchedField,
} from "@/lib/googleProfileTab";

const DAY_MS = 86_400_000;
const CHANGE_COLUMNS = "batch_id, kind, field, status, approved_at, undone_at, undo_closed_at, undo_of, before_value, after_value, location_name, error_reason";

/** This business's recent changes, with the practice flag once
 * supabase/gbp-changes-practice.sql has run (before it: the old markers). */
async function loadChangeRows(db: SupabaseClient, businessId: string, since: string): Promise<ChangeRow[]> {
  const read = (columns: string) => db.from("gbp_changes").select(columns).eq("business_id", businessId).gte("approved_at", since).order("approved_at", { ascending: false }).limit(200);
  const withFlag = await read(`${CHANGE_COLUMNS}, practice`);
  if (!withFlag.error) return (withFlag.data ?? []) as unknown as ChangeRow[];
  const without = await read(CHANGE_COLUMNS);
  return without.error ? [] : ((without.data ?? []) as unknown as ChangeRow[]);
}

export async function loadGoogleTabSaved(db: SupabaseClient, businessId: string, opts: { timeZone: string; practice: boolean; businessStatus: string | null; now?: Date }): Promise<GoogleTabSaved> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 70 * DAY_MS).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [changes, replies, promos, referrals, scans, googleEdits] = await Promise.all([
    loadChangeRows(db, businessId, since),
    db.from("gbp_review_reply_log").select("action, status, created_at").eq("business_id", businessId).gte("created_at", since).limit(1000),
    db.from("promos").select("active, expiry, created_at").eq("business_id", businessId).limit(200),
    db.from("referrals").select("created_at").eq("business_id", businessId).gte("created_at", since).limit(200),
    db.from("scores").select(`id, created_at, profile_snapshot_json, ${FP_KEY_COLUMN}`).eq("business_id", businessId).order("created_at", { ascending: false }).limit(2),
    // Changes by anyone else: ALWAYS the real Google check, even in practice mode.
    loadGoogleEdits(db, businessId, false).catch(() => null),
  ]);
  const rows = changes;
  const month = previousMonthKey(now, opts.timeZone);
  const inMonth = (iso: string) => monthKeyOf(iso, opts.timeZone) === month;

  const replyRows = ((replies.error ? [] : replies.data) ?? []) as Array<{ action: string; status: string; created_at: string }>;
  const repliesPosted = replyRows.filter((r) => r.action === "post" && (opts.practice ? r.status === "practice" : r.status === "ok" || r.status === "unconfirmed") && inMonth(r.created_at)).length;

  const promoRows = ((promos.error ? [] : promos.data) ?? []) as Array<{ active: boolean; expiry: string | null; created_at: string }>;
  const couponsRunning = promoRows.filter((p) => p.active && (!p.expiry || p.expiry >= today)).length;
  const referralRows = ((referrals.error ? [] : referrals.data) ?? []) as Array<{ created_at: string }>;
  const campaigns = promoRows.filter((p) => inMonth(p.created_at)).length + referralRows.filter((r) => inMonth(r.created_at)).length;

  const scanRows = ((scans.error ? [] : scans.data) ?? []) as unknown as Array<{ id: string; created_at: string; profile_snapshot_json: ProfileSnapshot | null; fp_key: string | null }>;
  let others: GoogleTabSaved["others"] = null;
  const [to, from] = scanRows;
  // Which fields changed between the two latest scans: our own change
  // records (lib/scanChanges.ts). Google's before/after values still come
  // from the saved snapshots while they exist (read live from 2c-4).
  const summary = to && from ? changesAcross([{ id: from.id, fpKey: from.fp_key ?? null }, { id: to.id, fpKey: to.fp_key ?? null }], await loadScanChangeRecords(db, [to.id])) : null;
  if (to && from && summary?.available) {
    const watched = new Set<WatchedField>(WATCHED_FIELDS);
    const fields = Array.from(new Set(summary.records.map((c) => c.field))).filter((f): f is WatchedField => watched.has(f as WatchedField));
    const theirs = changedByOthers(fields, rows, from.created_at, to.created_at);
    others = {
      fields: theirs,
      since: from.created_at,
      at: to.created_at,
      changes: from.profile_snapshot_json && to.profile_snapshot_json ? watchedChanges(from.profile_snapshot_json, to.profile_snapshot_json, theirs) : [],
    };
  }

  return {
    couponsRunning,
    lastMonth: month,
    recap: monthRecap({ listing: monthListingChanges(rows, month, opts.timeZone, opts.practice), replies: repliesPosted, campaigns }),
    made: madeFromPostScore(rows, now.getTime(), opts.practice),
    others,
    businessStatus: opts.businessStatus,
    googleEdits,
  };
}
