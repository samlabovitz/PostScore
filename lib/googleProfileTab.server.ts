import "server-only";

// The Google Profile tab's saved data (lib/googleProfileTab.ts): coupons
// running, last month's listing changes / review replies / campaigns, the
// latest changes made from PostScore and what changed on the listing
// between the last two scans. Reads only, RLS-scoped, no Google calls; a
// failed read leaves its part empty, never a guess.

import type { SupabaseClient } from "@supabase/supabase-js";
import { diffProfileSnapshots, type ProfileSnapshot } from "@/lib/profileChanges";
import {
  changedByOthers,
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

export async function loadGoogleTabSaved(db: SupabaseClient, businessId: string, opts: { timeZone: string; practice: boolean; businessStatus: string | null; now?: Date }): Promise<GoogleTabSaved> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - 70 * DAY_MS).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [changes, replies, promos, referrals, scans] = await Promise.all([
    db.from("gbp_changes").select("batch_id, kind, field, status, approved_at, undone_at, undo_closed_at, undo_of").eq("business_id", businessId).gte("approved_at", since).order("approved_at", { ascending: false }).limit(200),
    db.from("gbp_review_reply_log").select("action, status, created_at").eq("business_id", businessId).gte("created_at", since).limit(1000),
    db.from("promos").select("active, expiry, created_at").eq("business_id", businessId).limit(200),
    db.from("referrals").select("created_at").eq("business_id", businessId).gte("created_at", since).limit(200),
    db.from("scores").select("created_at, profile_snapshot_json").eq("business_id", businessId).not("profile_snapshot_json", "is", null).order("created_at", { ascending: false }).limit(2),
  ]);
  const rows = ((changes.error ? [] : changes.data) ?? []) as ChangeRow[];
  const month = previousMonthKey(now, opts.timeZone);
  const inMonth = (iso: string) => monthKeyOf(iso, opts.timeZone) === month;

  const replyRows = ((replies.error ? [] : replies.data) ?? []) as Array<{ action: string; status: string; created_at: string }>;
  const repliesPosted = replyRows.filter((r) => r.action === "post" && (opts.practice ? r.status === "practice" : r.status === "ok" || r.status === "unconfirmed") && inMonth(r.created_at)).length;

  const promoRows = ((promos.error ? [] : promos.data) ?? []) as Array<{ active: boolean; expiry: string | null; created_at: string }>;
  const couponsRunning = promoRows.filter((p) => p.active && (!p.expiry || p.expiry >= today)).length;
  const referralRows = ((referrals.error ? [] : referrals.data) ?? []) as Array<{ created_at: string }>;
  const campaigns = promoRows.filter((p) => inMonth(p.created_at)).length + referralRows.filter((r) => inMonth(r.created_at)).length;

  const scanRows = ((scans.error ? [] : scans.data) ?? []) as Array<{ created_at: string; profile_snapshot_json: ProfileSnapshot | null }>;
  let others: GoogleTabSaved["others"] = null;
  const [to, from] = scanRows;
  if (to?.profile_snapshot_json && from?.profile_snapshot_json) {
    const watched = new Set<WatchedField>(["phone", "hours", "website"]);
    const fields = Array.from(new Set(diffProfileSnapshots(from.profile_snapshot_json, to.profile_snapshot_json, "en").map((c) => c.field))).filter((f): f is WatchedField => watched.has(f as WatchedField));
    others = { fields: changedByOthers(fields, rows, from.created_at, to.created_at), since: from.created_at };
  }

  return {
    couponsRunning,
    lastMonth: month,
    recap: monthRecap({ listing: monthListingChanges(rows, month, opts.timeZone, opts.practice), replies: repliesPosted, campaigns }),
    made: madeFromPostScore(rows, now.getTime(), opts.practice),
    others,
    businessStatus: opts.businessStatus,
  };
}
