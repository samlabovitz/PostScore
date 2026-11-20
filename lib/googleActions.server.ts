import "server-only";

// Day 23C: what the owner did from PostScore, by day — review replies
// (gbp_review_reply_log), photos and listing edits (gbp_changes), coupons
// and referral cards started — for the action markers on section 1's chart
// and "Since you did this". Reads only, RLS-scoped, no Google calls; a
// failed read leaves its part out, never a guess.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPracticeRow, listingChangeKind, type ChangeRow } from "@/lib/googleProfileTab";
import { localToday, type ActionEvent } from "@/lib/googleRecommendations";

/** Far enough back for the 6-month chart. */
const SINCE_DAYS = 220;

const dateIn = (iso: string, timeZone: string) => localToday(Date.parse(iso), timeZone).date;

/** The actions, one event per day and kind, oldest first. */
export function groupActions(
  rows: { replies: Array<{ action: string; status: string; created_at: string }>; changes: ChangeRow[]; promos: Array<{ created_at: string }>; referrals: Array<{ created_at: string }> },
  opts: { timeZone: string; practice: boolean }
): ActionEvent[] {
  const events = new Map<string, ActionEvent>();
  const add = (date: string, kind: ActionEvent["kind"], what?: string) => {
    const key = `${date}|${kind}`;
    const e = events.get(key) ?? { date, kind, count: 0, ...(kind === "listing" ? { what: [] } : {}) };
    e.count++;
    if (what && e.what && !e.what.includes(what)) e.what.push(what);
    events.set(key, e);
  };
  for (const r of rows.replies) {
    if (r.action !== "post" || !(opts.practice ? r.status === "practice" : r.status === "ok" || r.status === "unconfirmed")) continue;
    add(dateIn(r.created_at, opts.timeZone), "replies");
  }
  const batches = new Set<string>();
  for (const r of rows.changes) {
    if (isPracticeRow(r) !== opts.practice || r.undo_of || r.undone_at || (r.status !== "sent" && r.status !== "pending_review")) continue;
    const k = listingChangeKind(r.kind, r.field);
    if (!k) continue;
    if (k === "photos") add(dateIn(r.approved_at, opts.timeZone), "photos");
    else {
      // One listing edit per batch (a batch can carry several fields).
      if (batches.has(`${r.batch_id}|${k}`)) continue;
      batches.add(`${r.batch_id}|${k}`);
      const date = dateIn(r.approved_at, opts.timeZone);
      const key = `${date}|listing`;
      const e = events.get(key);
      if (e?.what?.includes(k)) continue;
      add(date, "listing", k);
    }
  }
  for (const p of [...rows.promos, ...rows.referrals]) add(dateIn(p.created_at, opts.timeZone), "campaign");
  return Array.from(events.values()).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export async function loadActionEvents(db: SupabaseClient, businessId: string, opts: { timeZone: string; practice: boolean; now?: Date }): Promise<ActionEvent[]> {
  const since = new Date((opts.now ?? new Date()).getTime() - SINCE_DAYS * 86_400_000).toISOString();
  const changeCols = "batch_id, kind, field, status, approved_at, undone_at, undo_of, location_name";
  const [replies, withFlag, promos, referrals] = await Promise.all([
    db.from("gbp_review_reply_log").select("action, status, created_at").eq("business_id", businessId).gte("created_at", since).limit(2000),
    db.from("gbp_changes").select(`${changeCols}, practice`).eq("business_id", businessId).gte("approved_at", since).limit(1000),
    db.from("promos").select("created_at").eq("business_id", businessId).gte("created_at", since).limit(500),
    db.from("referrals").select("created_at").eq("business_id", businessId).gte("created_at", since).limit(500),
  ]);
  // Before supabase/gbp-changes-practice.sql: the old practice markers.
  const changes = withFlag.error ? await db.from("gbp_changes").select(changeCols).eq("business_id", businessId).gte("approved_at", since).limit(1000) : withFlag;
  const list = <T,>(r: { data: unknown; error: unknown }) => ((r.error ? [] : r.data) ?? []) as T[];
  return groupActions(
    {
      replies: list(replies),
      changes: list<ChangeRow>(changes),
      promos: list(promos),
      referrals: list(referrals),
    },
    opts
  );
}
