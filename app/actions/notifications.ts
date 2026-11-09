"use server";

// The Account menu's notifications (lib/notifications.ts): read through the
// owner's own session (RLS: only their businesses' notifications), and
// marked read the same way (read_at is the one column owners may change —
// supabase/notifications.sql). In-app only.

import { createClient } from "@/lib/supabase/server";
import type { NotificationRow, NotificationSeverity } from "@/lib/notifications";

/** Resolved ones stay listed this long ("Fixed ✓ Nov 12"), then drop off. */
const RESOLVED_SHOWN_DAYS = 30;
const MAX_SHOWN = 100;
const MISSING = new Set(["42P01", "PGRST205", "PGRST200"]);

export type MyNotificationsResult = { status: "ok"; items: NotificationRow[] } | { status: "unauthenticated" | "not_enabled" | "error" };

export async function getMyNotifications(now: Date = new Date()): Promise<MyNotificationsResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const since = new Date(now.getTime() - RESOLVED_SHOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, business_id, type, key, severity, payload, created_at, read_at, resolved_at, businesses(name)")
    .or(`resolved_at.is.null,resolved_at.gte.${since}`)
    .order("created_at", { ascending: false })
    .limit(MAX_SHOWN);
  if (error) return { status: MISSING.has(error.code ?? "") ? "not_enabled" : "error" };
  const items = ((data ?? []) as Array<Omit<NotificationRow, "business_name"> & { businesses: { name: string | null } | Array<{ name: string | null }> | null }>).map(({ businesses, ...row }) => ({
    ...row,
    severity: row.severity as NotificationSeverity,
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    business_name: (Array.isArray(businesses) ? businesses[0]?.name : businesses?.name) ?? null,
  }));
  return { status: "ok", items };
}

/** The owner clicked this notification (or its fix): just that one is read. */
export async function markNotificationRead(id: string): Promise<{ status: "ok" | "unauthenticated" | "error" }> {
  if (typeof id !== "string" || !id) return { status: "error" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  return { status: error ? "error" : "ok" };
}
