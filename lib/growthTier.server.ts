// Server-only. Day 25B step 6: a business's Growth facts (lib/growthTier.ts)
// from our own saved rows — Google changes sent from PostScore, review replies
// posted, offers started and their +1s, check-offs, photos and new reviews
// seen on scans, the Business Profile monthly numbers already saved for Google
// results, and the neutral-week facts. Reads only; writes nothing. Test rows
// are tagged (§6.2): practice mode, an internal account, an offer marked
// is_test, an undone Google change — with a tally of what each rule removed.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessTimeZone } from "@/lib/businessTimeZone";
import { addDays, mondayOf, localDate, type GrowthAction, type GrowthFacts, type MonthInsights, type NeutralReason } from "@/lib/growthTier";

/** Dated +1 logging (offer_uses) started with Day 25B step 6: R4 can't be checked before it. */
export const OFFER_USE_LOG_SINCE = "2026-11-24T05:00:00Z";

export interface InternalAccounts {
  /** The dev test login's user id (its businesses count their own test rows). */
  devLoginId: string | null;
  /** Every internal account: the dev test login and PLAN_SWITCHER_EMAILS users. */
  internalIds: Set<string>;
}

export interface RemovedTally {
  practice: number;
  internal: number;
  isTest: number;
  undone: number;
}

export interface LoadedFacts {
  facts: GrowthFacts;
  ownerKind: "dev" | "internal" | "owner";
  removed: RemovedTally;
}

/** Internal accounts from the env (no emails printed or returned). */
export async function loadInternalAccounts(admin: SupabaseClient, env: Record<string, string | undefined> = process.env): Promise<InternalAccounts> {
  const dev = (env.DEV_TEST_LOGIN_EMAIL ?? "").trim().toLowerCase();
  const switchers = new Set((env.PLAN_SWITCHER_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));
  let devLoginId: string | null = null;
  const internalIds = new Set<string>();
  for (let page = 1; page < 50; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    for (const u of data?.users ?? []) {
      const email = (u.email ?? "").toLowerCase();
      if (dev && email === dev) devLoginId = u.id;
      if ((dev && email === dev) || switchers.has(email)) internalIds.add(u.id);
    }
    if (!data || data.users.length < 200) break;
  }
  return { devLoginId, internalIds };
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function loadGrowthFacts(admin: SupabaseClient, businessId: string, internal: InternalAccounts, opts: { countTestRows?: boolean } = {}): Promise<LoadedFacts | null> {
  const { data: biz } = await admin.from("businesses").select("id, owner_id, lat, lng").eq("id", businessId).maybeSingle();
  if (!biz) return null;
  const ownerId = String((biz as Row).owner_id);
  const ownerKind: LoadedFacts["ownerKind"] = ownerId === internal.devLoginId ? "dev" : internal.internalIds.has(ownerId) ? "internal" : "owner";
  const ownerInternal = internal.internalIds.has(ownerId);
  const timeZone = businessTimeZone((biz as Row).lat, (biz as Row).lng);
  const q = (table: string, cols: string) => admin.from(table).select(cols).eq("business_id", businessId);
  const [changes, replies, promos, referrals, scanChanges, tasks, checks, uses, insights, conn, closed, start, settings, scans] = await Promise.all([
    q("gbp_changes", "approved_at, approved_by, kind, status, practice, undo_of, undone_at"),
    q("gbp_review_reply_log", "created_at, user_id, action, status"),
    q("promos", "created_at, is_test"),
    q("referrals", "created_at, is_test"),
    q("scan_changes", "at, field, direction, delta"),
    q("tasks", "marked_done_at"),
    q("weekly_checks", "checked_at"),
    q("offer_uses", "created_at, is_test, logged_by"),
    q("gbp_monthly_insights", "month, calls, directions, bookings, website_clicks"),
    admin.from("gbp_connections").select("status, disconnected_at").eq("business_id", businessId).maybeSingle(),
    q("growth_closed_weeks", "week_start"),
    admin.from("growth_business_start").select("counts_from").eq("business_id", businessId).maybeSingle(),
    admin.from("growth_settings").select("reset_at").eq("id", 1).maybeSingle(),
    // The listing shown closed (our own saved check result, never Google's text).
    admin.from("scores").select("created_at, status:breakdown_json->checks").eq("business_id", businessId).order("created_at", { ascending: true }),
  ]);
  const rows = (r: { data: unknown }) => ((r.data ?? []) as Row[]);
  const removed: RemovedTally = { practice: 0, internal: 0, isTest: 0, undone: 0 };
  const actions: GrowthAction[] = [];
  const push = (a: GrowthAction, why: { practice?: boolean; internal?: boolean; isTest?: boolean; undone?: boolean }) => {
    if (why.undone) removed.undone++;
    else if (why.practice) removed.practice++;
    else if (why.isTest) removed.isTest++;
    else if (why.internal) removed.internal++;
    actions.push({ ...a, test: !!(why.practice || why.internal || why.isTest), undone: !!why.undone });
  };

  // Google changes sent from PostScore (each approved item counts on its own).
  for (const c of rows(changes)) {
    if (c.status !== "sent" && c.status !== "pending_review") continue;
    const at = str(c.approved_at);
    if (!at) continue;
    const kind = String(c.kind ?? "");
    push({ at, kind: "verified", source: kind.startsWith("local_post") ? "post_published" : "listing_change" }, {
      undone: !!c.undone_at || !!c.undo_of,
      practice: c.practice === true || kind.endsWith("_practice"),
      internal: !!c.approved_by && internal.internalIds.has(String(c.approved_by)),
    });
  }
  // Replies posted (practice rows are tests).
  for (const r of rows(replies)) {
    if (r.action !== "post" || r.status === "failed") continue;
    push({ at: String(r.created_at), kind: "verified", source: "review_reply" }, { practice: r.status === "practice", internal: !!r.user_id && internal.internalIds.has(String(r.user_id)) });
  }
  // Offers started (created in PostScore).
  for (const o of [...rows(promos), ...rows(referrals)]) push({ at: String(o.created_at), kind: "verified", source: "offer_started" }, { isTest: o.is_test === true, internal: ownerInternal });
  // New photos seen on a scan (Google observed; never a test).
  const reviewIncreases: GrowthFacts["reviewIncreases"] = [];
  for (const s of rows(scanChanges)) {
    if (s.field === "photos" && s.direction === "up") actions.push({ at: String(s.at), kind: "verified", source: "photo_seen" });
    if (s.field === "reviews" && s.direction === "up") reviewIncreases.push({ at: String(s.at), delta: Number(s.delta) || 0 });
  }
  // "You told us": fixes marked done, weekly routine items, +1s.
  for (const t of rows(tasks)) push({ at: String(t.marked_done_at), kind: "told", source: "task_marked" }, { internal: ownerInternal });
  for (const c of rows(checks)) push({ at: String(c.checked_at), kind: "told", source: "routine_item" }, { internal: ownerInternal });
  for (const u of rows(uses)) push({ at: String(u.created_at), kind: "told", source: "offer_use" }, { isTest: u.is_test === true, internal: ownerInternal || (!!u.logged_by && internal.internalIds.has(String(u.logged_by))) });

  const monthInsights: MonthInsights[] = rows(insights).map((i) => ({
    month: String(i.month).slice(0, 7),
    calls: Number(i.calls) || 0,
    directions: Number(i.directions) || 0,
    bookings: Number(i.bookings) || 0,
    websiteClicks: Number(i.website_clicks) || 0,
  }));

  // Neutral weeks.
  const neutralWeeks: Record<string, NeutralReason> = {};
  for (const c of rows(closed)) neutralWeeks[String(c.week_start)] = "closed_marked";
  const connection = conn.data as Row | null;
  const disconnectedAt = str(connection?.disconnected_at);
  if (connection && connection.status !== "connected" && disconnectedAt) {
    // The first 2 weeks after Google disconnects (with a "Reconnect Google" nudge).
    const first = mondayOf(localDate(disconnectedAt, timeZone));
    neutralWeeks[first] ??= "disconnected";
    neutralWeeks[addDays(first, 7)] ??= "disconnected";
  }
  // The listing shown closed on a scan: the weeks until the next scan shows it open.
  const scanRows = rows(scans).map((s) => ({ at: String(s.created_at), closed: listingClosed(s.status) }));
  for (let i = 0; i < scanRows.length; i++) {
    if (!scanRows[i].closed) continue;
    const from = mondayOf(localDate(scanRows[i].at, timeZone));
    const until = scanRows[i + 1] ? localDate(scanRows[i + 1].at, timeZone) : localDate(new Date().toISOString(), timeZone);
    for (let w = addDays(from, 7); addDays(w, 7) <= until; w = addDays(w, 7)) neutralWeeks[w] ??= "listing_closed";
  }

  const starts = [str((start.data as Row | null)?.counts_from), str((settings.data as Row | null)?.reset_at)].filter((x): x is string => !!x).sort();
  return {
    ownerKind,
    removed,
    facts: {
      timeZone,
      actions,
      countTestRows: opts.countTestRows ?? ownerKind === "dev",
      countsFrom: starts.length ? starts[starts.length - 1] : null,
      insights: monthInsights,
      connected: connection?.status === "connected",
      reviewIncreases,
      offerUseLogSince: OFFER_USE_LOG_SINCE,
      neutralWeeks,
      // No billing yet: no plan history to freeze on (lib/plan.ts).
      freePeriods: [],
    },
  };
}

/** A saved scan's "Operational status" check says the listing isn't open (our own result). */
function listingClosed(checks: unknown): boolean {
  if (!Array.isArray(checks)) return false;
  const c = (checks as Array<{ id?: string; earnedPoints?: number | null; maxPoints?: number }>).find((x) => x.id === "completeness.business_status");
  return !!c && c.earnedPoints === 0 && (c.maxPoints ?? 0) > 0;
}
