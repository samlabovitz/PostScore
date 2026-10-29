"use server";

// "Order online" awareness: the ordering / booking platform in the Google
// listing's website spot (lib/gbpPlaceActions.ts). Reading Google's
// "Order online" / "Reservations" / "Appointments" links needs Google
// connected (any plan); adding one is Premium, after the owner approves,
// with Undo for 7 days. Never removes the website link.

import { revalidatePath } from "next/cache";
import { latestUndoable, type UndoableChange } from "@/lib/gbpAttributes";
import { existingLinkFor, websitePlatform, type WebsitePlatform } from "@/lib/gbpPlaceActions";
import { isPremiumPlan } from "@/lib/plan";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";

type PlaceActionError = import("@/lib/gbpPlaceActions.server").PlaceActionError | "changed_since" | "undo_expired";

export type PlatformLinkStatus =
  /** No ordering / booking platform in the website spot. */
  | { status: "none" }
  | { status: "ok"; platform: WebsitePlatform; alreadyOnGoogle: boolean; canAdd: boolean; undo: UndoableChange | null }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: PlaceActionError };

/** Read once per business per 10 minutes at most (a page view never
 * repeats Google calls). Cleared on add / undo. */
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; links: import("@/lib/gbpPlaceActions").PlaceActionLink[] }>();

async function lib() {
  const [gate, server, attrs] = await Promise.all([import("@/lib/gbpEditGate.server"), import("@/lib/gbpPlaceActions.server"), import("@/lib/gbpAttributes.server")]);
  return { gate, server, attrs };
}

async function placeActionUndo(store: import("@/lib/gbpAttributes.server").GbpChangeStore, businessId: string): Promise<UndoableChange | null> {
  const rows = await store.rowsSince(businessId, new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), "place_action");
  return rows ? latestUndoable(rows, Date.now()) : null;
}

/** Is the platform already in its Google section? Read-only. */
export async function getPlatformLinkStatus(businessId: string): Promise<PlatformLinkStatus> {
  const { gate, server, attrs } = await lib();
  const g = await gate.gbpEditGate(businessId, { requirePremium: false });
  if (!g.ok) return g.result;
  const platform = websitePlatform(g.business.website);
  if (!platform || !platform.section) return { status: "none" };
  const hit = cache.get(businessId);
  let links = hit && Date.now() - hit.at < CACHE_MS ? hit.links : null;
  if (!links) {
    const res = await server.listPlaceActionLinks(g.target);
    if (!res.ok) {
      if (res.error === "reconnect") await g.tokens.markGbpReconnect(g.admin, businessId);
      return { status: "error", error: res.error };
    }
    links = res.data;
    cache.set(businessId, { at: Date.now(), links });
  }
  return {
    status: "ok",
    platform,
    alreadyOnGoogle: existingLinkFor(platform, links) !== null,
    canAdd: isPremiumPlan(g.plan),
    undo: await placeActionUndo(attrs.supabaseChangeStore(g.admin), businessId),
  };
}

export type AddPlatformLinkResult = { status: "sent"; undo: UndoableChange | null } | { status: "already" } | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: PlaceActionError };

/** "Add to 'Order online' on Google" — Premium, after the owner approved. */
export async function addPlatformLinkAction(businessId: string): Promise<AddPlatformLinkResult> {
  const { gate, server, attrs } = await lib();
  const g = await gate.gbpEditGate(businessId, { requirePremium: true });
  if (!g.ok) return g.result;
  // The website on the business's own row — never a link from the browser.
  const platform = websitePlatform(g.business.website);
  if (!platform || !platform.section) return { status: "error", error: "rejected" };
  const store = attrs.supabaseChangeStore(g.admin);
  const result = await server.addPlatformLink(g.target, platform, store);
  cache.delete(businessId);
  if (result.status === "error") {
    if (result.error === "reconnect") await g.tokens.markGbpReconnect(g.admin, businessId);
    return result;
  }
  revalidatePath(`/business/${businessId}`, "layout");
  return result.status === "already" ? result : { status: "sent", undo: await placeActionUndo(store, businessId) };
}

/** Undo: removes the link PostScore added (7 days, only if still there). */
export async function undoPlatformLinkAction(businessId: string, batchId: string): Promise<{ status: "sent" } | { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: PlaceActionError }> {
  const { gate, server, attrs } = await lib();
  const g = await gate.gbpEditGate(businessId, { requirePremium: true });
  if (!g.ok) return g.result;
  const store = attrs.supabaseChangeStore(g.admin);
  const undo = await placeActionUndo(store, businessId);
  if (!undo || undo.batchId !== batchId || !undo.changes[0]) return { status: "error", error: "undo_expired" };
  const result = await server.removeAddedLink(g.target, undo.changes[0].id, batchId, store);
  cache.delete(businessId);
  if (result.status === "sent") revalidatePath(`/business/${businessId}`, "layout");
  return result;
}
