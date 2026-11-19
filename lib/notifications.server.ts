// Server-only. Writes in-app notifications (supabase/notifications.sql)
// with the service role — owners only read them and mark them read. Never
// fails a scan: before the SQL is run, or on any error, it does nothing.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { urgentNotificationChanges } from "@/lib/notifications";
import { businessRowToScoringInput, scoreBusiness, OWNER_SCORING_COLUMNS, type BusinessScoringRow } from "@/lib/scoring";
import { withSavedScore, type SavedScoreRow } from "@/lib/savedScore";
import { latestSavedScore } from "@/lib/savedScore.server";
import { urgentIssues, type UrgentIssue } from "@/lib/urgency";

/**
 * After a scan: opens one "urgent" notification per new urgent issue and
 * resolves the open ones the scan shows are fixed. `payload.parked` words
 * the website-link one ("a page that isn't yours" vs "doesn't work").
 */
export async function syncUrgentNotifications(
  admin: SupabaseClient,
  businessId: string,
  issues: readonly UrgentIssue[],
  facts: { listingParked: boolean },
  now: Date = new Date(),
  /** Report what it would do, change nothing (scripts/backfill-notifications.ts --dry-run). */
  dryRun = false
): Promise<{ created: number; resolved: number; plan?: { create: UrgentIssue[]; resolve: Array<{ id: string; key: string }> } }> {
  try {
    const { data, error } = await admin.from("notifications").select("id, key").eq("business_id", businessId).eq("type", "urgent").is("resolved_at", null);
    if (error) return { created: 0, resolved: 0 };
    const open = (data ?? []) as Array<{ id: string; key: string }>;
    const { create, resolve } = urgentNotificationChanges(open, issues);
    if (dryRun) return { created: 0, resolved: 0, plan: { create, resolve: open.filter((n) => resolve.includes(n.id)) } };
    let created = 0;
    for (const key of create) {
      const { error: insertError } = await admin.from("notifications").insert({
        business_id: businessId,
        type: "urgent",
        key,
        severity: "urgent",
        payload: key === "listing_link" ? { parked: facts.listingParked } : {},
        created_at: now.toISOString(),
      });
      // 23505: another scan just opened the same one (notifications_one_open) — fine.
      if (!insertError) created++;
    }
    if (resolve.length > 0) {
      // "Fixed ✓" comes back unread, so the owner sees the good news.
      const { error: resolveError } = await admin.from("notifications").update({ resolved_at: now.toISOString(), read_at: null }).in("id", resolve);
      if (resolveError) return { created, resolved: 0 };
    }
    return { created, resolved: resolve.length };
  } catch {
    return { created: 0, resolved: 0 };
  }
}

/**
 * The urgent issues in a business's SAVED data — the row its last scan
 * saved, scored the same way the Overview scores it. No Google call, no
 * website fetch: exactly what a scan would have found then.
 */
export function urgentIssuesFromSavedRow(
  row: BusinessScoringRow & { place_id?: string | null; listing_mode?: string | null },
  /** Day 23 2d-1: the latest saved scan — its checks' points decide (lib/savedScore.ts). */
  saved: SavedScoreRow | null = null
): { issues: UrgentIssue[]; listingParked: boolean } {
  const input = businessRowToScoringInput(row);
  const hasListing = !!row.place_id && row.listing_mode !== "website_only";
  const now = scoreBusiness(input);
  return { issues: urgentIssues(input, withSavedScore(now, saved) ?? now, { hasListing }), listingParked: input.websiteAnalysis?.websiteTrust?.listingLinkParked === true };
}

/** At most once per business per hour when pages load (lib/notifications.server.ts). */
export const SAVED_SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** Due for a sync from saved data? Records the attempt when it is. */
export function savedSyncDue(lastSyncAt: Map<string, number>, businessId: string, now: number): boolean {
  const last = lastSyncAt.get(businessId);
  if (last !== undefined && now - last < SAVED_SYNC_INTERVAL_MS) return false;
  lastSyncAt.set(businessId, now);
  return true;
}

/** The businesses columns the score reads — the same data the Overview scores:
 * our own results and the owner's answers; Google's values come from the
 * live read laid over them (Day 23 2d-5). */
export const SAVED_SCORING_SELECT = `id, place_id, listing_mode, business_type_override, biz_type_resolved, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, ${OWNER_SCORING_COLUMNS}`;

/** The same rules as after a scan, from the business's saved data (no
 * Google call, no website fetch). */
export async function syncNotificationsFromSavedRow(
  admin: SupabaseClient,
  row: BusinessScoringRow & { id: string; place_id?: string | null; listing_mode?: string | null },
  now: Date = new Date(),
  dryRun = false
) {
  const { issues, listingParked } = urgentIssuesFromSavedRow(row, await latestSavedScore(admin, row.id));
  return { issues, ...(await syncUrgentNotifications(admin, row.id, issues, { listingParked }, now, dryRun)) };
}

/** When each business last synced on a page load (this server process). */
const lastSavedSync = new Map<string, number>();

/**
 * A business page loads: brings its notifications up to date — with
 * Google's values from the visit's live read, when it made one — so owners
 * never wait for a new scan (the real Colorful Yun
 * Nan case: scanned before the notifications table existed). At most once
 * per business per hour per server; never fails the page.
 *
 * `supabase` is the owner's own (RLS) client: reading the row through it
 * is what proves the business is theirs before the service role writes.
 */
export async function syncNotificationsForPage(supabase: SupabaseClient, businessId: string, now: Date = new Date(), lastSyncAt: Map<string, number> = lastSavedSync): Promise<void> {
  // Day 23 2d-4: Google's values only from a read this visit already made
  // (never a Google call on every page); none yet — skip (every scan syncs).
  const { cachedOwnerListing } = await import("@/lib/ownerListing.server");
  const live = cachedOwnerListing(businessId, now.getTime());
  if (live?.status !== "ok") return;
  if (!savedSyncDue(lastSyncAt, businessId, now.getTime())) return;
  try {
    const { data, error } = await supabase.from("businesses").select(SAVED_SCORING_SELECT).eq("id", businessId).maybeSingle();
    if (error || !data) return;
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { withLiveListing } = await import("@/lib/ownerListing");
    await syncNotificationsFromSavedRow(createAdminClient(), withLiveListing(data as unknown as BusinessScoringRow & { id: string }, live), now);
  } catch (err) {
    console.error(`[notifications] page sync failed for ${businessId}:`, err instanceof Error ? err.message : err);
  }
}
