"use server";

// "Update website on Google" (Premium, Google connected): the Overview's
// urgent alert and the Website link check. Every action checks, on the
// server: the signed-in owner (RLS), Premium or Multi, not archived,
// Google connected with a matched location (lib/gbpEditGate.server.ts).
// Opening the panel and checking an address only read. Only "Approve and
// update Google" and "Yes, undo" write to Google.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan } from "@/lib/plan";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";

type GbpEditErrorCode = import("@/lib/gbpAttributes.server").GbpEditError;
type CheckFailure = "invalid" | "down" | "parked";

export type OpenWebsiteLinkFixResult =
  /** `current`: the link on Google now; `suggested`: the site PostScore verified, when there is one. */
  | { status: "ok"; current: string | null; suggested: string | null }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };

export type CheckWebsiteLinkActionResult = { status: "ok"; url: string } | { status: CheckFailure } | { status: "blocked"; reason: GbpEditBlock };

export type ApplyWebsiteLinkActionResult =
  | { status: "sent"; verified: boolean; undo: WebsiteLinkUndo | null }
  | { status: "pending_review"; undo: WebsiteLinkUndo | null }
  | { status: "no_change" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode | CheckFailure };

export type UndoWebsiteLinkActionResult =
  | { status: "sent"; pending?: boolean }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };

async function gate(businessId: string) {
  const { gbpEditGate } = await import("@/lib/gbpEditGate.server");
  return gbpEditGate(businessId, { requirePremium: true });
}

async function lib() {
  const [link, attrs] = await Promise.all([import("@/lib/gbpWebsiteLink.server"), import("@/lib/gbpAttributes.server")]);
  return { link, attrs };
}

/** Opening the panel: what Google shows now, and the suggested site. Reads only. */
export async function openWebsiteLinkFix(businessId: string): Promise<OpenWebsiteLinkFixResult> {
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const { link } = await lib();
  const current = await link.readWebsiteLink(g.target);
  if (!current.ok) {
    if (current.error === "reconnect") await g.tokens.markGbpReconnect(g.admin, businessId);
    return { status: "error", error: current.error };
  }
  const { businessWebsiteUrl } = await import("@/lib/businessWebsite");
  const suggested = businessWebsiteUrl({ verified_website_url: g.business.verified_website_url });
  return { status: "ok", current: current.data, suggested: suggested && !(await import("@/lib/gbpWebsiteLink")).sameWebsiteLink(suggested, current.data) ? suggested : null };
}

/** "Check this website": it loads, and isn't a parked page. No Google call. */
export async function checkWebsiteLinkAction(businessId: string, url: string): Promise<CheckWebsiteLinkActionResult> {
  const g = await gate(businessId);
  if (!g.ok) return g.result.status === "blocked" ? g.result : { status: "down" };
  const { link } = await lib();
  return link.checkWebsiteLink(url);
}

/** "Approve and update Google" — after the owner saw before → after. */
export async function applyWebsiteLinkAction(businessId: string, url: string): Promise<ApplyWebsiteLinkActionResult> {
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const { link, attrs } = await lib();
  const store = attrs.supabaseChangeStore(g.admin);
  const result = await link.applyWebsiteLink(g.target, url, store);
  if (result.status === "error") {
    if (result.error === "reconnect") await g.tokens.markGbpReconnect(g.admin, businessId);
    return result;
  }
  if (result.status === "no_change") return result;
  // Points wait for the next scan to see the new link live.
  revalidatePath(`/business/${businessId}`, "layout");
  const undo = result.logged ? await link.getWebsiteLinkUndo(store, businessId, g.target.locationName) : null;
  return result.status === "pending_review" ? { status: "pending_review", undo } : { status: "sent", verified: result.verified, undo };
}

/** "Yes, undo": the previous website link back on Google. */
export async function undoWebsiteLinkAction(businessId: string, batchId: string): Promise<UndoWebsiteLinkActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const g = await gate(businessId);
  if (!g.ok) return g.result;
  const { link, attrs } = await lib();
  const result = await link.undoWebsiteLink(g.target, batchId, attrs.supabaseChangeStore(g.admin));
  if (result.status === "error") {
    if (result.error === "reconnect") await g.tokens.markGbpReconnect(g.admin, businessId);
    return { status: "error", error: result.error };
  }
  revalidatePath(`/business/${businessId}`, "layout");
  return result;
}

/** For the page: the latest website link change the owner may still undo
 * (a database read through RLS — no Google call). Null on Free/Grow, when
 * not connected, or before the SQL has been run. */
export async function getWebsiteLinkUndoForPage(businessId: string): Promise<WebsiteLinkUndo | null> {
  try {
    if (!isPremiumPlan(await getPlan())) return null;
    const db = createClient();
    const { data: connection } = await db.from("gbp_connections").select("google_location_id").eq("business_id", businessId).maybeSingle();
    const locationName = (connection as { google_location_id?: string | null } | null)?.google_location_id;
    if (!locationName) return null;
    const [{ supabaseChangeStore }, { getWebsiteLinkUndo }] = await Promise.all([import("@/lib/gbpAttributes.server"), import("@/lib/gbpWebsiteLink.server")]);
    return await getWebsiteLinkUndo(supabaseChangeStore(db), businessId, locationName);
  } catch {
    return null;
  }
}
