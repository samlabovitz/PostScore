// Server only. Counts Free AI calls (supabase/free-ai-usage.sql) — the
// rules are in lib/freeAiAllowance.ts. Every Free PostAI question and
// review reply draft goes through reserveFreeAi BEFORE the AI is called:
// 1. a 'pending' row is added (it counts at once);
// 2. this week's rows for the business and kind are counted — over 3, the
//    row is removed and the call refused ("limit");
// 3. this month's Free rows across ALL businesses are counted — over
//    FREE_AI_MONTHLY_CAP, the row is removed and the call refused ("paused");
// 4. the caller calls the AI, then `confirm` (it counts) or `release` (a
//    failed call never uses one up).
// All writes use the service role; callers check ownership first.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowanceLeft, allowanceWindow, capMonth, FREE_AI_WEEKLY, freeAiMonthlyCap, type FreeAiAllowance, type FreeAiKind } from "@/lib/freeAiAllowance";

export type FreeAiReservation =
  /** `left`: what remains AFTER this call (the reserved row counts). */
  | { status: "ok"; id: string; left: number; resetsAt: string }
  | { status: "limit"; resetsAt: string }
  | { status: "paused"; until: string; resetsAt: string }
  | { status: "unavailable" };

async function countRows(db: SupabaseClient, filter: { businessId?: string; kind?: FreeAiKind; since: string }): Promise<number | null> {
  let query = db.from("free_ai_usage").select("id", { count: "exact", head: true }).gte("created_at", filter.since);
  if (filter.businessId) query = query.eq("business_id", filter.businessId);
  if (filter.kind) query = query.eq("kind", filter.kind);
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

/** When this business's week started: its last owner re-scan, else its
 * first scan, else when it was added. */
export async function freeAllowanceAnchor(db: SupabaseClient, businessId: string): Promise<string | null> {
  const { data: rescan } = await db
    .from("places_calls")
    .select("created_at")
    .eq("business_id", businessId)
    .eq("kind", "owner_rescan")
    .order("created_at", { ascending: false })
    .limit(1);
  if (rescan && rescan.length > 0) return (rescan[0] as { created_at: string }).created_at;
  const { data: first } = await db.from("scores").select("created_at").eq("business_id", businessId).order("created_at", { ascending: true }).limit(1);
  if (first && first.length > 0) return (first[0] as { created_at: string }).created_at;
  const { data: business } = await db.from("businesses").select("created_at").eq("id", businessId).maybeSingle();
  return (business as { created_at?: string } | null)?.created_at ?? null;
}

export async function reserveFreeAiWithClient(
  db: SupabaseClient,
  args: { businessId: string; userId: string | null; kind: FreeAiKind; anchor: string | null; now?: Date; cap?: number }
): Promise<FreeAiReservation> {
  const now = args.now ?? new Date();
  const week = allowanceWindow(args.anchor, now);
  const month = capMonth(now);
  let id: string;
  try {
    const { data, error } = await db.from("free_ai_usage").insert({ business_id: args.businessId, user_id: args.userId, kind: args.kind, status: "pending" }).select("id").single();
    if (error || !data) return { status: "unavailable" };
    id = (data as { id: string }).id;
  } catch {
    return { status: "unavailable" };
  }
  const release = () => releaseFreeAiWithClient(db, id);

  const used = await countRows(db, { businessId: args.businessId, kind: args.kind, since: week.start });
  if (used === null) {
    await release();
    return { status: "unavailable" };
  }
  if (used > FREE_AI_WEEKLY) {
    await release();
    return { status: "limit", resetsAt: week.resetsAt };
  }
  const monthTotal = await countRows(db, { since: month.start });
  if (monthTotal === null) {
    await release();
    return { status: "unavailable" };
  }
  if (monthTotal > (args.cap ?? freeAiMonthlyCap())) {
    await release();
    return { status: "paused", until: month.resumesAt, resetsAt: week.resetsAt };
  }
  return { status: "ok", id, left: allowanceLeft(used), resetsAt: week.resetsAt };
}

/** A failed AI call: the question / draft isn't used up. */
export async function releaseFreeAiWithClient(db: SupabaseClient, id: string): Promise<void> {
  try {
    await db.from("free_ai_usage").delete().eq("id", id);
  } catch {
    // Best effort: a stuck 'pending' row only ever errs toward fewer calls.
  }
}

/** A finished AI call. */
export async function confirmFreeAiWithClient(db: SupabaseClient, id: string): Promise<void> {
  try {
    await db.from("free_ai_usage").update({ status: "ok" }).eq("id", id);
  } catch {
    // The pending row already counts.
  }
}

/** What's left this week (and whether the month's budget is used up). */
export async function freeAiAllowanceWithClient(
  db: SupabaseClient,
  args: { businessId: string; kind: FreeAiKind; anchor: string | null; now?: Date; cap?: number }
): Promise<FreeAiAllowance> {
  const now = args.now ?? new Date();
  const week = allowanceWindow(args.anchor, now);
  const month = capMonth(now);
  const [used, monthTotal] = await Promise.all([countRows(db, { businessId: args.businessId, kind: args.kind, since: week.start }), countRows(db, { since: month.start })]);
  if (used === null || monthTotal === null) return { status: "unavailable" };
  const left = allowanceLeft(used);
  return monthTotal >= (args.cap ?? freeAiMonthlyCap()) ? { status: "paused", left, resetsAt: week.resetsAt, until: month.resumesAt } : { status: "ok", left, resetsAt: week.resetsAt };
}

async function admin(): Promise<SupabaseClient> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  return createAdminClient();
}

/** The real database (service role). */
export async function reserveFreeAi(businessId: string, userId: string | null, kind: FreeAiKind): Promise<FreeAiReservation & { db?: SupabaseClient }> {
  try {
    const db = await admin();
    const reservation = await reserveFreeAiWithClient(db, { businessId, userId, kind, anchor: await freeAllowanceAnchor(db, businessId) });
    return { ...reservation, db };
  } catch {
    return { status: "unavailable" };
  }
}

export async function freeAiAllowance(businessId: string, kind: FreeAiKind): Promise<FreeAiAllowance> {
  try {
    const db = await admin();
    return await freeAiAllowanceWithClient(db, { businessId, kind, anchor: await freeAllowanceAnchor(db, businessId) });
  } catch {
    return { status: "unavailable" };
  }
}
