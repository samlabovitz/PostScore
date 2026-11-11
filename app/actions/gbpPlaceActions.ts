"use server";

// "Order online" awareness: the ordering / booking platform in the Google
// listing's website spot (lib/gbpPlaceActions.ts). Reading Google's
// "Order online" / "Reservations" / "Appointments" links needs Google
// connected (any plan); adding one is Premium, after the owner approves,
// with Undo for 7 days. Never removes the website link.
//
// The add and the undo go through the same code and switches as the
// "Order online" / "Booking link" card (lib/gbpOrderLink.server.ts,
// lib/gbpOrderLinkContext.server.ts): practice mode's fake Google, and
// the live allow list GBP_PLACE_ACTIONS_LIVE_PLACES — off the list the
// links load read-only and Add / Undo are refused here.

import { revalidatePath } from "next/cache";
import { existingLinkFor, websitePlatform, type WebsitePlatform } from "@/lib/gbpPlaceActions";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { OrderLinkError, OrderLinkUndo } from "@/lib/gbpOrderLink.server";
import type { GbpEditError } from "@/lib/gbpAttributes.server";

type PlaceActionError = OrderLinkError | GbpEditError;

export type PlatformLinkStatus =
  /** No ordering / booking platform in the website spot. */
  | { status: "none" }
  | {
      status: "ok";
      platform: WebsitePlatform;
      alreadyOnGoogle: boolean;
      /** Premium. */
      canAdd: boolean;
      /** Practice mode, or on the live allow list; false: Add and Undo show locked. */
      canEdit?: boolean;
      practice?: boolean;
      undo: OrderLinkUndo | null;
    }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: PlaceActionError };

/** Read once per business per 10 minutes at most (a page view never
 * repeats Google calls). Cleared on add / undo. Never for practice mode. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; links: import("@/lib/gbpPlaceActions").PlaceActionLink[] }>();

async function lib() {
  const [context, server, read] = await Promise.all([import("@/lib/gbpOrderLinkContext.server"), import("@/lib/gbpOrderLink.server"), import("@/lib/gbpPlaceActions.server")]);
  return { context, server, read };
}

/** The latest link change on the location in use (any section the website platform belongs to). */
async function undoFor(c: import("@/lib/gbpOrderLinkContext.server").OrderLinkContext, platform: WebsitePlatform): Promise<OrderLinkUndo | null> {
  const { getOrderLinkUndo, supabaseOrderLinkStore } = await import("@/lib/gbpOrderLink.server");
  const undo = await getOrderLinkUndo(supabaseOrderLinkStore(c.admin), c.target.businessId, c.target.locationName, c.practice);
  return undo && undo.section === platform.section ? undo : null;
}

/** Is the platform already in its Google section? Read-only. */
export async function getPlatformLinkStatus(businessId: string): Promise<PlatformLinkStatus> {
  const { context, read } = await lib();
  const c = await context.orderLinkContext(businessId, { requirePremium: false });
  if (!c.ok) return c.result;
  const platform = websitePlatform(c.website);
  if (!platform || !platform.section) return { status: "none" };
  const hit = c.practice ? null : cache.get(businessId);
  let links = hit && Date.now() - hit.at < CACHE_MS ? hit.links : null;
  if (!links) {
    const res = await read.listPlaceActionLinks(c.target, c.fetchImpl);
    if (!res.ok) {
      if (res.error === "reconnect") await c.markReconnect();
      return { status: "error", error: res.error };
    }
    links = res.data;
    if (!c.practice) cache.set(businessId, { at: Date.now(), links });
  }
  return {
    status: "ok",
    platform,
    alreadyOnGoogle: existingLinkFor(platform, links) !== null,
    canAdd: c.premium,
    canEdit: c.canEdit,
    practice: c.practice,
    undo: await undoFor(c, platform),
  };
}

/** `mapsUri`: Google's own link to the live listing, for "View on Google". */
export type AddPlatformLinkResult =
  | { status: "sent"; undo: OrderLinkUndo | null; mapsUri?: string | null }
  /** Google took it but doesn't show it yet — a neutral wait. */
  | { status: "unconfirmed"; undo: OrderLinkUndo | null; mapsUri?: string | null }
  | { status: "already" }
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: PlaceActionError; mapsUri?: string | null };

async function mapsUriFor(c: import("@/lib/gbpOrderLinkContext.server").OrderLinkContext): Promise<string | null> {
  if (c.practice) return null;
  const { readGbpMapsUri } = await import("@/lib/gbpMapsUri.server");
  return readGbpMapsUri(c.target);
}

/** "Add to 'Order online' on Google" — Premium, after the owner approved. */
export async function addPlatformLinkAction(businessId: string): Promise<AddPlatformLinkResult> {
  const { context, server, read } = await lib();
  const c = await context.orderLinkContext(businessId);
  if (!c.ok) return c.result.status === "blocked" ? c.result : { status: "error", error: c.result.error };
  if (!c.canEdit) return { status: "editing_off" };
  // The website on the business's own row — never a link from the browser.
  const platform = websitePlatform(c.website);
  if (!platform || !platform.section || !/^https:\/\//i.test(platform.url)) return { status: "error", error: "rejected" };
  // Any link to the same platform, in any of Google's sections: already there.
  const current = await read.listPlaceActionLinks(c.target, c.fetchImpl);
  if (!current.ok) {
    if (current.error === "reconnect") await c.markReconnect();
    return { status: "error", error: current.error };
  }
  if (existingLinkFor(platform, current.data)) return { status: "already" };
  const result = await server.applyOrderLinkEdit(c.target, { op: "add", url: platform.url, section: platform.section }, server.supabaseOrderLinkStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  cache.delete(businessId);
  if (result.status === "error") {
    if (result.error === "reconnect") await c.markReconnect();
    return { status: "error", error: result.error, mapsUri: await mapsUriFor(c) };
  }
  if (result.status === "no_change") return { status: "already" };
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return { status: result.status === "updated" ? "sent" : "unconfirmed", undo: await undoFor(c, platform), mapsUri: await mapsUriFor(c) };
}

/** Undo: removes the link PostScore added (7 days, only if not changed since). */
export async function undoPlatformLinkAction(
  businessId: string,
  batchId: string
): Promise<{ status: "sent"; mapsUri?: string | null } | { status: "editing_off" } | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: PlaceActionError; mapsUri?: string | null }> {
  const { context, server } = await lib();
  const c = await context.orderLinkContext(businessId);
  if (!c.ok) return c.result.status === "blocked" ? c.result : { status: "error", error: c.result.error };
  if (!c.canEdit) return { status: "editing_off" };
  const result = await server.undoOrderLink(c.target, batchId, server.supabaseOrderLinkStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  cache.delete(businessId);
  if (result.status === "error") return { status: "error", error: result.error, mapsUri: await mapsUriFor(c) };
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return { status: "sent", mapsUri: await mapsUriFor(c) };
}
