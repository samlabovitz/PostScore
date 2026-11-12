"use server";

// Premium "Edit on Google": the "Order online" card (food businesses) or
// "Booking link" card (salons and other appointment businesses) — the
// owner's own ordering or booking link on Google (lib/gbpOrderLink.server.ts).
// Opening only reads; only "Approve" (Add / Change / Remove) and
// "Yes, undo" write to Google.
//
// Practice mode and the live allow list (GOOGLE_WRITES_LIVE_PLACES)
// are lib/gbpOrderLinkContext.server.ts: off the list, the real links load
// and every change is refused here ("editing_off"), nothing sent.

import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import { checkOrderLink, linksInSection, sectionForOrderKind, type OrderLinkKind, type OrderLinkOnGoogle, type OrderLinkProblem, type OwnSite } from "@/lib/gbpOrderLink";
import type { OrderLinkError, OrderLinkUndo } from "@/lib/gbpOrderLink.server";
import type { OrderLinkContext } from "@/lib/gbpOrderLinkContext.server";
import type { GbpEditError } from "@/lib/gbpAttributes.server";

type Blocked = { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: GbpEditError };

export interface OrderLinkView {
  status: "ok";
  kind: OrderLinkKind;
  /** Google's links in the card's section, the owner's own first. */
  links: OrderLinkOnGoogle[];
  ownSite: OwnSite;
  undo: OrderLinkUndo | null;
  practice: boolean;
  canEdit: boolean;
}

export type OpenOrderLinkResult = OrderLinkView | { status: "none" } | Blocked | { status: "error"; error: OrderLinkError };

async function lib() {
  const [context, server, read] = await Promise.all([import("@/lib/gbpOrderLinkContext.server"), import("@/lib/gbpOrderLink.server"), import("@/lib/gbpPlaceActions.server")]);
  return { context, server, read };
}

async function undoFor(c: OrderLinkContext, kind: OrderLinkKind): Promise<OrderLinkUndo | null> {
  const { getOrderLinkUndo, supabaseOrderLinkStore } = await import("@/lib/gbpOrderLink.server");
  const undo = await getOrderLinkUndo(supabaseOrderLinkStore(c.admin), c.target.businessId, c.target.locationName, c.practice);
  return undo && undo.section === sectionForOrderKind(kind) ? undo : null;
}

async function linksFor(c: OrderLinkContext, kind: OrderLinkKind): Promise<{ ok: true; links: OrderLinkOnGoogle[] } | { ok: false; error: OrderLinkError }> {
  const { listPlaceActionLinks } = await import("@/lib/gbpPlaceActions.server");
  const res = await listPlaceActionLinks(c.target, c.fetchImpl);
  if (!res.ok) {
    if (res.error === "reconnect") await c.markReconnect();
    return { ok: false, error: res.error };
  }
  return { ok: true, links: linksInSection(res.data, sectionForOrderKind(kind)) };
}

/** Opening the card: Google's links now (read live), and any undo. */
export async function openOrderLink(businessId: string): Promise<OpenOrderLinkResult> {
  const { context } = await lib();
  const c = await context.orderLinkContext(businessId);
  if (!c.ok) return c.result;
  if (!c.kind) return { status: "none" };
  const links = await linksFor(c, c.kind);
  if (!links.ok) return { status: "error", error: links.error };
  return { status: "ok", kind: c.kind, links: links.links, ownSite: c.ownSite, undo: await undoFor(c, c.kind), practice: c.practice, canEdit: c.canEdit };
}

export type OrderLinkRequest = { op: "add"; url: string } | { op: "change"; name: string; url: string } | { op: "remove"; name: string };

export type OrderLinkActionResult =
  | { status: "updated" | "unconfirmed"; links: OrderLinkOnGoogle[] | null; undo: OrderLinkUndo | null }
  | { status: "no_change" }
  /** Checked here before anything is sent. */
  | { status: "invalid"; problem: OrderLinkProblem }
  /** Not practice mode, and not on GOOGLE_WRITES_LIVE_PLACES. Nothing sent. */
  | { status: "editing_off" }
  | { status: "none" }
  | Blocked
  | { status: "error"; error: OrderLinkError };

function isRequest(v: unknown): v is OrderLinkRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.op === "add") return typeof r.url === "string";
  if (r.op === "change") return typeof r.url === "string" && typeof r.name === "string";
  return r.op === "remove" && typeof r.name === "string";
}

async function setOutcome(c: OrderLinkContext, practiceOutcome: unknown) {
  if (!c.practice) return;
  const practice = await import("@/lib/gbpProfilePractice.server");
  practice.setPracticeOutcome(c.target.businessId, practice.isPracticeOutcome(practiceOutcome) ? practiceOutcome : "accept");
}

async function afterChange(c: OrderLinkContext, kind: OrderLinkKind, result: Awaited<ReturnType<typeof import("@/lib/gbpOrderLink.server").applyOrderLinkEdit>>): Promise<OrderLinkActionResult> {
  if (result.status === "error") {
    if (result.error === "reconnect") await c.markReconnect();
    return { status: "error", error: result.error };
  }
  if (result.status === "no_change") return result;
  if (!c.practice) revalidatePath(`/business/${c.target.businessId}`, "layout");
  const links = await linksFor(c, kind);
  return { status: result.status, links: links.ok ? links.links : null, undo: await undoFor(c, kind) };
}

/** "Approve" (Beta): add, change or remove the link — after the owner saw Google's link and theirs. */
export async function applyOrderLinkAction(businessId: string, request: unknown, practiceOutcome: unknown = null): Promise<OrderLinkActionResult> {
  if (!isRequest(request)) return { status: "invalid", problem: "invalid" };
  const { context, server } = await lib();
  const c = await context.orderLinkContext(businessId);
  if (!c.ok) return c.result;
  if (!c.kind) return { status: "none" };
  if (!c.canEdit) return { status: "editing_off" };
  let op: import("@/lib/gbpOrderLink").OrderLinkOp;
  if (request.op === "remove") op = request;
  else {
    // The same rules as the card shows — never trust the browser's check.
    const checked = checkOrderLink(request.url, c.kind, c.ownSite);
    if (!checked.ok) return { status: "invalid", problem: checked.problem };
    op = request.op === "add" ? { op: "add", url: checked.url, section: sectionForOrderKind(c.kind) } : { op: "change", name: request.name, url: checked.url };
  }
  await setOutcome(c, practiceOutcome);
  const result = await server.applyOrderLinkEdit(c.target, op, server.supabaseOrderLinkStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  return afterChange(c, c.kind, result);
}

/** "Yes, undo": the previous link back on Google. */
export async function undoOrderLinkAction(businessId: string, batchId: string, practiceOutcome: unknown = null): Promise<OrderLinkActionResult> {
  if (typeof batchId !== "string" || !batchId) return { status: "error", error: "undo_expired" };
  const { context, server } = await lib();
  const c = await context.orderLinkContext(businessId);
  if (!c.ok) return c.result;
  if (!c.kind) return { status: "none" };
  if (!c.canEdit) return { status: "editing_off" };
  await setOutcome(c, practiceOutcome);
  const result = await server.undoOrderLink(c.target, batchId, server.supabaseOrderLinkStore(c.admin), { fetchImpl: c.fetchImpl, practice: c.practice });
  return afterChange(c, c.kind, result);
}
