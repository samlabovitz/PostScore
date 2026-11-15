// Server-only. Every bit of Google Business Profile data PostScore keeps for
// a business, deleted in one place: on disconnect, 30 days after a lost
// connection (lib/storageCleanup.server.ts) and, later, on account deletion.
//   gbp_tokens, gbp_connections            → deleted
//   gbp_monthly_insights, gbp_google_edits → deleted
//   gbp_changes                            → before/after values blanked
//                                            (kind, field, status, dates kept);
//                                            practice rows deleted
//   review_reply_drafts                    → deleted
//   gbp_review_reply_log.review_id         → null (the audit row stays)
//   notifications (type "google")          → deleted
//   businesses.gbp_* scoring counts        → null
//   in-memory listing cache                → evicted on this server (others
//                                            expire within the hour)
// Our own results stay: scores, grades, points and the score history.
// `dryRun`: counts what it would touch, changes nothing.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface GoogleDataCounts {
  gbp_tokens: number;
  gbp_connections: number;
  gbp_monthly_insights: number;
  gbp_google_edits: number;
  gbp_changes_values: number;
  gbp_changes_practice: number;
  review_reply_drafts: number;
  reply_log_review_ids: number;
  notifications: number;
}

const PRACTICE_OR = "kind.like.%_practice,location_name.eq.locations/practice";

async function count(q: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const r = await q();
    return r.error ? 0 : (r.count ?? 0);
  } catch {
    return 0;
  }
}

/** How much Google data a business has (what deleteGoogleData would touch). */
export async function countGoogleData(admin: SupabaseClient, businessId: string): Promise<GoogleDataCounts> {
  const head = (table: string) => admin.from(table).select("*", { count: "exact", head: true }).eq("business_id", businessId);
  return {
    gbp_tokens: await count(() => head("gbp_tokens")),
    gbp_connections: await count(() => head("gbp_connections")),
    gbp_monthly_insights: await count(() => head("gbp_monthly_insights")),
    gbp_google_edits: await count(() => head("gbp_google_edits")),
    gbp_changes_values: await count(() => head("gbp_changes").or("before_value.not.is.null,after_value.not.is.null").not("kind", "like", "%_practice")),
    gbp_changes_practice: await count(() => head("gbp_changes").or(PRACTICE_OR)),
    review_reply_drafts: await count(() => head("review_reply_drafts")),
    reply_log_review_ids: await count(() => head("gbp_review_reply_log").not("review_id", "is", null)),
    notifications: await count(() => head("notifications").eq("type", "google")),
  };
}

/** Deletes (or, dry run, counts) every Google data row for the business. */
export async function deleteGoogleData(admin: SupabaseClient, businessId: string, options: { dryRun?: boolean } = {}): Promise<{ ok: boolean; counts: GoogleDataCounts }> {
  const counts = await countGoogleData(admin, businessId);
  if (options.dryRun) return { ok: true, counts };
  // Each step on its own: one that fails (a table before its SQL) never stops the rest.
  const ok: boolean[] = [];
  const run = async (step: () => PromiseLike<{ error: unknown }>) => {
    try {
      const r = await step();
      ok.push(!r.error);
    } catch {
      ok.push(false);
    }
  };
  await run(() => admin.from("gbp_tokens").delete().eq("business_id", businessId));
  await run(() => admin.from("gbp_connections").delete().eq("business_id", businessId));
  await run(() => admin.from("gbp_monthly_insights").delete().eq("business_id", businessId));
  await run(() => admin.from("gbp_google_edits").delete().eq("business_id", businessId));
  await run(() => admin.from("gbp_changes").delete().eq("business_id", businessId).or(PRACTICE_OR));
  await run(() => admin.from("gbp_changes").update({ before_value: null, after_value: null }).eq("business_id", businessId));
  await run(() => admin.from("review_reply_drafts").delete().eq("business_id", businessId));
  await run(() => admin.from("gbp_review_reply_log").update({ review_id: null }).eq("business_id", businessId));
  await run(() => admin.from("notifications").delete().eq("business_id", businessId).eq("type", "google"));
  try {
    await admin.from("businesses").update({ gbp_reviews_in_window: null, gbp_replied: null, gbp_has_recent_review: null }).eq("id", businessId);
    await admin.from("businesses").update({ gbp_recent_reviews: null }).eq("id", businessId);
  } catch {
    // Missing columns (SQL not run yet): nothing to clear.
  }
  const { forgetRealListing } = await import("@/lib/gbpRealListing.server");
  forgetRealListing(businessId);
  // The tokens and the connection must be gone; the rest is best effort (a table may not exist yet).
  return { ok: ok[0] !== false && ok[1] !== false, counts };
}
