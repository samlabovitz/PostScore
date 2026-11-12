"use server";

// "Update website on Google" (Premium, Google connected): the Overview's
// Website link check, the Website page's warning card and the Google
// Profile tab. Every action checks, on the server: the signed-in owner
// (RLS), Premium or Multi, not archived, Google connected with a matched
// location (lib/gbpWriteContext.server.ts). Opening the panel and checking
// an address only read. Only Approve and "Yes, undo" write to Google.
//
// Two test switches (lib/gbpReviewPractice.ts), as for every Google write:
// - practice mode (REVIEW_REPLIES_PRACTICE=1, never in production): the
//   same code against a fake Google with a sample listing — no connection
//   needed, nothing ever sent;
// - otherwise the real link loads read-only, and Approve / Undo are
//   refused here ("editing_off", nothing sent) unless the business is on
//   GOOGLE_WRITES_LIVE_PLACES (default: none).

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/premium";
import { isPremiumPlan } from "@/lib/plan";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";
import type { GoogleWriteContext } from "@/lib/gbpWriteContext.server";

type GbpEditErrorCode = import("@/lib/gbpAttributes.server").GbpEditError;
type CheckFailure = "invalid" | "down" | "parked";

export type OpenWebsiteLinkFixResult =
  /** `current`: the link on Google now; `suggested`: the site PostScore verified, when there is one;
   * `undo`: the latest change the owner may still undo (from gbp_changes). */
  | { status: "ok"; current: string | null; suggested: string | null; practice: boolean; canEdit: boolean; undo: WebsiteLinkUndo | null }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };

export type CheckWebsiteLinkActionResult = { status: "ok"; url: string } | { status: CheckFailure } | { status: "blocked"; reason: GbpEditBlock };

export type ApplyWebsiteLinkActionResult =
  /** `verified` false: Google took it but doesn't show it yet — a neutral wait.
   * `current`: the link Google reads back now (missing: the read-back failed). */
  | { status: "sent"; verified: boolean; undo: WebsiteLinkUndo | null; current?: string | null }
  /** `current`: still the old link while Google reviews the change. */
  | { status: "pending_review"; undo: WebsiteLinkUndo | null; current: string | null }
  | { status: "no_change" }
  /** Not practice mode, and this business isn't on GOOGLE_WRITES_LIVE_PLACES. Nothing sent. */
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode | CheckFailure };

export type UndoWebsiteLinkActionResult =
  /** `current`: the link Google reads back now (missing while Google reviews it). */
  | { status: "sent"; pending?: boolean; current?: string | null }
  | { status: "editing_off" }
  | { status: "blocked"; reason: GbpEditBlock }
  | { status: "error"; error: GbpEditErrorCode };

async function context(businessId: string) {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  return googleWriteContext(businessId);
}

async function lib() {
  const [link, attrs] = await Promise.all([import("@/lib/gbpWebsiteLink.server"), import("@/lib/gbpAttributes.server")]);
  return { link, attrs };
}

/** Practice mode: what the fake Google does with this Approve (the panel's choice). */
async function setOutcome(c: GoogleWriteContext, outcome: unknown) {
  if (!c.practice) return;
  const practice = await import("@/lib/gbpProfilePractice.server");
  practice.setPracticeOutcome(c.target.businessId, practice.isPracticeOutcome(outcome) ? outcome : "accept");
}

/** Opening the panel: what Google shows now, and the suggested site. Reads only. */
export async function openWebsiteLinkFix(businessId: string): Promise<OpenWebsiteLinkFixResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { link, attrs } = await lib();
  const current = await link.readWebsiteLink(c.target, c.fetchImpl);
  if (!current.ok) {
    if (current.error === "reconnect") await c.markReconnect();
    return { status: "error", error: current.error };
  }
  const { businessWebsiteUrl } = await import("@/lib/businessWebsite");
  const suggested = businessWebsiteUrl({ verified_website_url: c.business.verified_website_url });
  const { sameWebsiteLink } = await import("@/lib/gbpWebsiteLink");
  // The Undo line comes from gbp_changes, so it's there after a reload too.
  const undo = await link.getWebsiteLinkUndo(attrs.supabaseChangeStore(c.admin), businessId, c.target.locationName, Date.now(), c.practice).catch(() => null);
  return { status: "ok", current: current.data, suggested: suggested && !sameWebsiteLink(suggested, current.data) ? suggested : null, practice: c.practice, canEdit: c.canEdit, undo };
}

/** "Check this website": it loads, and isn't a parked page. No Google call. */
export async function checkWebsiteLinkAction(businessId: string, url: string): Promise<CheckWebsiteLinkActionResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result.status === "blocked" ? c.result : { status: "down" };
  const { link } = await lib();
  return link.checkWebsiteLink(url);
}

/** Approve (Beta) — after the owner saw before → after. */
export async function applyWebsiteLinkAction(businessId: string, url: string, practiceOutcome: unknown = null): Promise<ApplyWebsiteLinkActionResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  await setOutcome(c, practiceOutcome);
  const { link, attrs } = await lib();
  const store = attrs.supabaseChangeStore(c.admin);
  const result = await link.applyWebsiteLink(c.target, url, store, { fetchImpl: c.fetchImpl, practice: c.practice });
  if (result.status === "error") {
    if (result.error === "reconnect") await c.markReconnect();
    return result;
  }
  if (result.status === "no_change") return result;
  // Points wait for the next scan to see the new link live.
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  const undo = await link.getWebsiteLinkUndo(store, businessId, c.target.locationName, Date.now(), c.practice);
  return result.status === "pending_review"
    ? { status: "pending_review", undo, current: result.before }
    : { status: "sent", verified: result.verified, undo, ...(result.shown !== undefined ? { current: result.shown } : {}) };
}

/** "Yes, undo": the previous website link back on Google. */
export async function undoWebsiteLinkAction(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<UndoWebsiteLinkActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  await setOutcome(c, practiceOutcome);
  const { link, attrs } = await lib();
  const result = await link.undoWebsiteLink(c.target, batchId, attrs.supabaseChangeStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  if (result.status === "error") {
    if (result.error === "reconnect") await c.markReconnect();
    return { status: "error", error: result.error };
  }
  if (!c.practice) revalidatePath(`/business/${businessId}`, "layout");
  return result.pending ? { status: "sent", pending: true } : { status: "sent", ...(result.shown !== undefined ? { current: result.shown } : {}) };
}

/** For the page: the latest website link change the owner may still undo
 * (a database read through RLS — no Google call). Practice mode: the
 * practice listing's. Null on Free/Grow, when not connected, or before
 * the SQL has been run. */
export async function getWebsiteLinkUndoForPage(businessId: string): Promise<WebsiteLinkUndo | null> {
  try {
    if (!isPremiumPlan(await getPlan())) return null;
    const db = createClient();
    const { reviewRepliesPracticeOn } = await import("@/lib/gbpReviewPractice");
    const practice = reviewRepliesPracticeOn();
    const locationName = practice ? (await import("@/lib/gbpProfilePractice.server")).PRACTICE_PROFILE_LOCATION : await connectedLocation(db, businessId);
    if (!locationName) return null;
    const [{ supabaseChangeStore }, { getWebsiteLinkUndo }] = await Promise.all([import("@/lib/gbpAttributes.server"), import("@/lib/gbpWebsiteLink.server")]);
    return await getWebsiteLinkUndo(supabaseChangeStore(db), businessId, locationName, Date.now(), practice);
  } catch {
    return null;
  }
}

/** For the page (no Google call): practice mode, and whether Approve / Undo
 * are on for this business (GOOGLE_WRITES_LIVE_PLACES) — so the locked
 * buttons show before anything opens. Shared by the website link and
 * customer details. The server refuses again on every write. */
export async function googleWritesPageState(businessId: string): Promise<{ practice: boolean; canEdit: boolean }> {
  const { googleWritesAllowed, reviewRepliesPracticeOn } = await import("@/lib/gbpReviewPractice");
  if (reviewRepliesPracticeOn()) return { practice: true, canEdit: true };
  try {
    const { data } = await createClient().from("businesses").select("place_id").eq("id", businessId).maybeSingle();
    return { practice: false, canEdit: googleWritesAllowed((data as { place_id?: string | null } | null)?.place_id) };
  } catch {
    return { practice: false, canEdit: false };
  }
}

async function connectedLocation(db: ReturnType<typeof createClient>, businessId: string): Promise<string | null> {
  const { data: connection } = await db.from("gbp_connections").select("google_location_id").eq("business_id", businessId).maybeSingle();
  return (connection as { google_location_id?: string | null } | null)?.google_location_id ?? null;
}
