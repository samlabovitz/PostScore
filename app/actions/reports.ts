"use server";

import { createClient } from "@/lib/supabase/server";
import { diffProfileSnapshots, type ProfileChange, type ProfileSnapshot } from "@/lib/profileChanges";
import { getGbpConnectionStatus } from "@/app/actions/gbp";

/** One real saved scan, exactly what the Reports page needs to plot the
 * score-over-time chart and diff listing changes — a narrower query than
 * getScoreHistory/getRecentScoreSnapshots in app/actions/scoring.ts,
 * which exist for other pages' own needs. */
export interface ReportsScoreRow {
  id: string;
  total: number;
  grade: string;
  created_at: string;
  /** Real Google listing fields at scan time (see buildProfileSnapshot in
   * lib/profileChanges.ts). Null for any scan saved before that column
   * existed — callers must treat that honestly as "nothing to diff from." */
  profile_snapshot_json: ProfileSnapshot | null;
}

export interface MonthlyRecap {
  previous: ReportsScoreRow;
  current: ReportsScoreRow;
  scoreDelta: number;
  daysBetween: number;
  changes: ProfileChange[];
  /** True when either scan predates profile-snapshot tracking — `changes`
   * is honestly empty in that case, not "nothing changed." */
  changesUnavailable: boolean;
}

export type GetReportsDataResult =
  | {
      status: "ok";
      businessName: string | null;
      /** Every saved scan for this business, oldest first. Real history
       * only — never padded, interpolated, or capped to make a range
       * toggle look fuller than it is. */
      history: ReportsScoreRow[];
      /** Real `tasks` rows a later re-scan actually confirmed at full
       * points (see reconcileTasks in lib/actionPlan.ts) — never a task
       * the owner merely marked done but that hasn't been re-verified
       * against real data. */
      confirmedFixCount: number;
      /** Sum of diffProfileSnapshots(...).length across every consecutive
       * pair of scans that both have a real profile snapshot — the total
       * count of real listing-field changes detected across this
       * business's whole scan history. */
      listingChangesDetected: number;
      /** Built from the two most recent scans, whatever the real gap
       * between them happens to be — null when there's fewer than two. */
      recap: MonthlyRecap | null;
      /** Whether this business has connected its Google Business Profile
       * (see app/actions/gbp.ts) — gates the "Reviews replied to" /
       * "Google Posts published" tiles between a real "not tracked yet"
       * (Phase 1 has no source of this data at all) and, later, real
       * counts once that data actually flows in. */
      gbpConnected: boolean;
    }
  | { status: "unauthenticated" }
  | { status: "not_found" };

/**
 * Loads everything the Reports page renders: the full real score history
 * (for the chart), a same-two-scans recap (score delta + real listing
 * changes), and the two counts the "what we've verified" card can
 * honestly show. RLS-scoped to the current user via the same
 * business-ownership checks every other business-scoped query here uses.
 */
export async function getReportsData(businessId: string): Promise<GetReportsDataResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", businessId)
    .single();

  if (businessError || !business) {
    return { status: "not_found" };
  }

  const { data: scores, error: scoresError } = await supabase
    .from("scores")
    .select("id, total, grade, created_at, profile_snapshot_json")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (scoresError) {
    return { status: "not_found" };
  }

  const history = (scores ?? []) as ReportsScoreRow[];

  let listingChangesDetected = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].profile_snapshot_json;
    const curr = history[i].profile_snapshot_json;
    if (prev && curr) {
      listingChangesDetected += diffProfileSnapshots(prev, curr).length;
    }
  }

  let recap: MonthlyRecap | null = null;
  if (history.length >= 2) {
    const previous = history[history.length - 2];
    const current = history[history.length - 1];
    const changesAvailable = Boolean(previous.profile_snapshot_json && current.profile_snapshot_json);
    recap = {
      previous,
      current,
      scoreDelta: current.total - previous.total,
      daysBetween: Math.round(
        (new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) / 86_400_000
      ),
      changes: changesAvailable
        ? diffProfileSnapshots(
            previous.profile_snapshot_json as ProfileSnapshot,
            current.profile_snapshot_json as ProfileSnapshot
          )
        : [],
      changesUnavailable: !changesAvailable,
    };
  }

  // Best-effort: a failed count here shouldn't fail the whole page, same
  // reasoning as reconcileActionPlanTasks in app/actions/scoring.ts.
  const { count: confirmedFixCount, error: tasksError } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("status", "completed");

  const gbpStatus = await getGbpConnectionStatus(businessId);

  return {
    status: "ok",
    businessName: business.name,
    history,
    confirmedFixCount: tasksError || confirmedFixCount === null ? 0 : confirmedFixCount,
    listingChangesDetected,
    recap,
    gbpConnected: gbpStatus.status === "ok" && gbpStatus.connected,
  };
}
