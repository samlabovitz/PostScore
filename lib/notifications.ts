// In-app notifications (supabase/notifications.sql) — the Account menu's
// "Notifications". In-app only: never emails or texts. Pure.
//
// Today only "urgent" ones are created (lib/urgency.ts): one per issue per
// business, opened when a scan finds it and resolved automatically when a
// later scan shows it's fixed. Each kind is one entry in NOTIFICATION_KINDS
// (its wording and where it's fixed), so others can be added later — a
// Google change approved, a new review, a score drop.

import { URGENT_ISSUES, type UrgentIssue } from "@/lib/urgency";
import type { MessageKey } from "@/lib/i18n";

export type NotificationType = "urgent";
export type NotificationSeverity = "urgent" | "high" | "info";

/** A notifications row as the owner reads it (RLS), with its business's name. */
export interface NotificationRow {
  id: string;
  business_id: string;
  business_name: string | null;
  type: string;
  key: string;
  severity: NotificationSeverity;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
}

/** What a notification says, and where it's fixed. */
export interface NotificationView {
  message: MessageKey;
  fixLabel: MessageKey;
  fixHref: string;
}

function isUrgentIssue(key: string): key is UrgentIssue {
  return (URGENT_ISSUES as readonly string[]).includes(key);
}

/** Where each urgent issue is fixed. */
export function urgentFixHref(issue: UrgentIssue, businessId: string): string {
  switch (issue) {
    case "site_down":
      return `/business/${businessId}/website`;
    case "site_unsafe":
      return `/business/${businessId}/website#check-security`;
    case "broken_link":
      return `/business/${businessId}/website#check-links`;
    case "phone_mismatch":
      return `/business/${businessId}/website#check-info_consistency`;
    case "no_phone":
      return `/business/${businessId}#check-phone`;
    case "no_hours":
      return `/business/${businessId}#check-hours`;
    case "listing_link":
      // The Website link check, with "Update website on Google" right in it.
      return `/business/${businessId}#check-website_link`;
  }
}

/** Every kind of notification: its wording and its fix (for a fixed one,
 * where the related check is). Add a kind here. */
const NOTIFICATION_KINDS: Record<NotificationType, (row: Pick<NotificationRow, "key" | "payload" | "business_id">) => NotificationView | null> = {
  urgent: (row) => {
    if (!isUrgentIssue(row.key)) return null;
    const message: MessageKey =
      row.key === "listing_link"
        ? row.payload.parked === true
          ? "dashboard.urgent.issue.listing_link_parked"
          : "dashboard.urgent.issue.listing_link_broken"
        : (`dashboard.urgent.issue.${row.key}` as MessageKey);
    return { message, fixLabel: `dashboard.urgent.fix.${row.key}` as MessageKey, fixHref: urgentFixHref(row.key, row.business_id) };
  },
};

/** A notification's wording and fix, or null for a kind this version doesn't know. */
export function notificationView(row: Pick<NotificationRow, "type" | "key" | "payload" | "business_id">): NotificationView | null {
  const kind = NOTIFICATION_KINDS[row.type as NotificationType];
  return kind ? kind(row) : null;
}

/** Counted on the Account badge until the owner clicks it — a fixed one
 * too (the good news counts until they've seen it). Opening the panel
 * never marks anything read. */
export function isUnread(row: Pick<NotificationRow, "read_at">): boolean {
  return row.read_at === null;
}

export function unreadCount(rows: Array<Pick<NotificationRow, "read_at">>): number {
  return rows.filter(isUnread).length;
}

/** The red circle's text: hidden at 0, "9+" above 9. */
export function badgeText(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}

/** Newest first; open ones before resolved ones. */
export function sortNotifications<T extends Pick<NotificationRow, "created_at" | "resolved_at">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.resolved_at !== null) - Number(b.resolved_at !== null) || b.created_at.localeCompare(a.created_at));
}

/** Grouped by business, groups in order of their newest notification. */
export function groupByBusiness<T extends Pick<NotificationRow, "business_id" | "business_name" | "created_at" | "resolved_at">>(rows: T[]): Array<{ businessId: string; businessName: string | null; items: T[] }> {
  const groups = new Map<string, { businessId: string; businessName: string | null; items: T[] }>();
  for (const row of sortNotifications(rows)) {
    const g = groups.get(row.business_id) ?? { businessId: row.business_id, businessName: row.business_name, items: [] };
    g.items.push(row);
    groups.set(row.business_id, g);
  }
  return Array.from(groups.values());
}

/**
 * What a scan changes for one business's urgent notifications: one new
 * notification for each urgent issue that has no open one (never a
 * duplicate), and every open one whose issue is gone resolved. `open`:
 * this business's unresolved "urgent" notifications.
 */
export function urgentNotificationChanges(
  open: Array<Pick<NotificationRow, "id" | "key">>,
  issues: readonly UrgentIssue[]
): { create: UrgentIssue[]; resolve: string[] } {
  const openKeys = new Set(open.map((n) => n.key));
  return {
    create: issues.filter((i) => !openKeys.has(i)),
    resolve: open.filter((n) => !issues.includes(n.key as UrgentIssue)).map((n) => n.id),
  };
}
