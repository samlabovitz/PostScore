// Server-only. Writes in-app notifications (supabase/notifications.sql)
// with the service role — owners only read them and mark them read. Never
// fails a scan: before the SQL is run, or on any error, it does nothing.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { urgentNotificationChanges } from "@/lib/notifications";
import { businessRowToScoringInput, scoreBusiness, V112_SCORING_COLUMNS, type BusinessScoringRow } from "@/lib/scoring";
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
export function urgentIssuesFromSavedRow(row: BusinessScoringRow & { place_id?: string | null; listing_mode?: string | null }): { issues: UrgentIssue[]; listingParked: boolean } {
  const input = businessRowToScoringInput(row);
  const hasListing = !!row.place_id && row.listing_mode !== "website_only";
  return { issues: urgentIssues(input, scoreBusiness(input), { hasListing }), listingParked: input.websiteAnalysis?.websiteTrust?.listingLinkParked === true };
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

/** The businesses columns the score reads — the same data the Overview scores. */
export const SAVED_SCORING_SELECT = `id, name, place_id, listing_mode, address, phone, website, rating, review_count, category, categories, primary_type, business_type_override, opening_hours, opening_hours_periods, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, ${V112_SCORING_COLUMNS}`;

/** The same rules as after a scan, from the business's saved data (no
 * Google call, no website fetch). */
export async function syncNotificationsFromSavedRow(
  admin: SupabaseClient,
  row: BusinessScoringRow & { id: string; place_id?: string | null; listing_mode?: string | null },
  now: Date = new Date(),
  dryRun = false
) {
  const { issues, listingParked } = urgentIssuesFromSavedRow(row);
  return { issues, ...(await syncUrgentNotifications(admin, row.id, issues, { listingParked }, now, dryRun)) };
}

/** When each business last synced on a page load (this server process). */
const lastSavedSync = new Map<string, number>();

/**
 * A business page loads: brings its notifications up to date with its
 * saved data — so owners never wait for a new scan (the real Colorful Yun
 * Nan case: scanned before the notifications table existed). At most once
 * per business per hour per server; never fails the page.
 *
 * `supabase` is the owner's own (RLS) client: reading the row through it
 * is what proves the business is theirs before the service role writes.
 */
export async function syncNotificationsForPage(supabase: SupabaseClient, businessId: string, now: Date = new Date(), lastSyncAt: Map<string, number> = lastSavedSync): Promise<void> {
  if (!savedSyncDue(lastSyncAt, businessId, now.getTime())) return;
  try {
    const { data, error } = await supabase.from("businesses").select(SAVED_SCORING_SELECT).eq("id", businessId).maybeSingle();
    if (error || !data) return;
    const { createAdminClient } = await import("@/lib/supabase/admin");
    await syncNotificationsFromSavedRow(createAdminClient(), data as unknown as BusinessScoringRow & { id: string }, now);
  } catch (err) {
    console.error(`[notifications] page sync failed for ${businessId}:`, err instanceof Error ? err.message : err);
  }
}
