// Server-only. The "Order online" / "Booking link" card and "Add to 'Order
// online'" on the platform link card: the owner's own ordering or booking
// link on Google (My Business Place Actions API), changed only after the
// owner approves (app/actions/gbpOrderLink.ts, app/actions/gbpPlaceActions.ts).
// Every call goes through gbpFetch (lib/gbpQuota.ts).
//
// A change (add, change or remove one link), in order — the same flow as
// Edit on Google (lib/gbpProfileEdits.server.ts):
// 1. gbp_changes and the edit log must be ready (else "not set up", nothing
//    sent), and the approval limits allow it (one a minute, a daily cap);
// 2. read the links from Google — the "before" is Google's, never the browser's;
// 3. save before → after in gbp_changes as "sending" BEFORE anything is sent;
// 4. ONE create, patch (updateMask=uri) or delete;
// 5. read the links back: "updated" only when Google shows it, otherwise
//    "unconfirmed" — a neutral wait, never a false ✓.
// The gbp_changes row then says sent / failed, and gbp_profile_edit_log
// gets one row: who, when, the outcome and the link type — never the URL.
// A partner's link (DoorDash's own, say) is never changed or removed.
import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed, latestUndoable } from "@/lib/gbpAttributes";
import { supabaseProfileEditStore, type EditOutcome, type ProfileEditStore, type ProfileTarget } from "@/lib/gbpProfileEdits.server";
import { call, listPlaceActionLinks, PLACE_ACTIONS_BASE, type Call, type PlaceActionError } from "@/lib/gbpPlaceActions.server";
import { sectionOf, type PlaceActionLink, type PlaceActionSection } from "@/lib/gbpPlaceActions";
import {
  linksInSection,
  newLinkTypeFor,
  ORDER_LINK_FIELD,
  ORDER_LINK_KIND,
  ORDER_LINK_KIND_PRACTICE,
  readStoredLink,
  sameLink,
  storeLink,
  type OrderLinkOnGoogle,
  type OrderLinkOp,
  type StoredLink,
} from "@/lib/gbpOrderLink";

const DAY_MS = 24 * 60 * 60 * 1000;
const UNDO_DAYS = 7;
const MISSING = new Set(["PGRST204", "PGRST205", "42703", "42P01"]);

export type OrderLinkError = PlaceActionError | "not_set_up" | "changed_since" | "undo_expired";

export interface OrderLinkStore extends Pick<ProfileEditStore, "approvalsSince" | "rowsSince" | "insertSending" | "setStatus" | "markUndone"> {
  /** The created link's name, once Google gives it (so Undo can remove exactly that link). */
  setAfter(batchId: string, after: string | null): Promise<void>;
  /** Is gbp_profile_edit_log ready for order links (supabase/gbp-order-link.sql)? */
  editLogReady(businessId: string): Promise<boolean>;
  logEdit(row: { business_id: string; user_id: string; action: "edit" | "undo"; outcome: EditOutcome; practice: boolean; error_reason: string | null; link_type: string }): Promise<void>;
}

export function supabaseOrderLinkStore(db: SupabaseClient): OrderLinkStore {
  const shared = supabaseProfileEditStore(db);
  return {
    approvalsSince: shared.approvalsSince,
    rowsSince: shared.rowsSince,
    insertSending: shared.insertSending,
    setStatus: shared.setStatus,
    markUndone: shared.markUndone,
    async setAfter(batchId, after) {
      await db.from("gbp_changes").update({ after_value: after }).eq("batch_id", batchId);
    },
    async editLogReady(businessId) {
      // link_type comes with supabase/gbp-order-link.sql (which also lets the log take 'order_link').
      // A plain select: a head request hides a missing column's error code.
      const { error } = await db.from("gbp_profile_edit_log").select("link_type").eq("business_id", businessId).limit(1);
      return !error || !MISSING.has(error.code ?? "");
    },
    async logEdit(row) {
      const { error } = await db.from("gbp_profile_edit_log").insert({ ...row, field: ORDER_LINK_FIELD, error_reason: row.error_reason ? row.error_reason.slice(0, 120) : null });
      if (error) console.error(`[gbp-order-link] edit log failed for ${row.business_id}: ${error.code ?? "unknown"}`);
    },
  };
}

export type ApplyOrderLinkResult =
  /** Google shows it. */
  | { status: "updated"; undoBatchId: string }
  /** Google took it but doesn't show it yet — a neutral wait. */
  | { status: "unconfirmed"; undoBatchId: string }
  | { status: "no_change" }
  | { status: "error"; error: OrderLinkError; reason?: string | null };

/** Internal, for Undo: re-add with the old type; remove the link we added even when Google never showed it (held). */
type Op = OrderLinkOp | { op: "add"; url: string; section: PlaceActionSection; type: string } | { op: "remove"; name: string; added: StoredLink };

function reasonOf(res: Extract<Call<unknown>, { ok: false }>): string | null {
  return res.reason ?? (res.status ? String(res.status) : res.error);
}

/** The owner's own link with this name on this location — or why not. */
function ownLink(target: ProfileTarget, links: PlaceActionLink[], name: string): { ok: true; link: OrderLinkOnGoogle } | { ok: false; problem: "rejected" | "changed_since" } {
  if (!name.startsWith(`${target.locationName}/placeActionLinks/`)) return { ok: false, problem: "rejected" };
  const link = links.find((l) => l.name === name);
  if (!link) return { ok: false, problem: "changed_since" };
  const section = sectionOf(link.placeActionType);
  const mine = section ? linksInSection([link], section)[0] : null;
  // A partner's link is never changed or removed.
  if (!mine || !mine.editable) return { ok: false, problem: "rejected" };
  return { ok: true, link: mine };
}

export async function applyOrderLinkEdit(
  target: ProfileTarget,
  op: Op,
  store: OrderLinkStore,
  options: { fetchImpl?: typeof fetch; now?: number; practice?: boolean; undoOf?: string | null } = {}
): Promise<ApplyOrderLinkResult> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  const action = options.undoOf ? "undo" : "edit";
  // 1. Both logs ready, and the approval limits — before any Google call.
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_set_up" };
  const allowed = options.undoOf ? "ok" : approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  try {
    // 2. What Google has now.
    const current = await listPlaceActionLinks(target, options.fetchImpl ?? fetch);
    if (!current.ok) return { status: "error", error: current.error, reason: current.reason };

    let before: StoredLink | null = null;
    let after: StoredLink | null = null;
    if (op.op === "add") {
      if (linksInSection(current.data, op.section).some((l) => sameLink(l.uri, op.url))) return { status: "no_change" };
      after = { name: null, uri: op.url, type: "type" in op ? op.type : newLinkTypeFor(op.section) };
    } else {
      const found = ownLink(target, current.data, op.name);
      // Undo of a link Google never showed (held): still removed, by the name Google gave it.
      if (!found.ok && op.op === "remove" && "added" in op && found.problem === "changed_since") before = op.added;
      else if (!found.ok) return { status: "error", error: found.problem };
      else before = { name: found.link.name, uri: found.link.uri, type: found.link.type };
      if (op.op === "change") {
        if (sameLink(before.uri, op.url)) return { status: "no_change" };
        after = { ...before, uri: op.url };
      }
    }
    const linkType = (after ?? before)!.type;
    const log = (outcome: EditOutcome, reason: string | null = null) =>
      store.logEdit({ business_id: target.businessId, user_id: target.userId, action, outcome, practice, error_reason: reason, link_type: linkType });

    // 3. The previous value, saved before anything is sent.
    const batchId = randomUUID();
    const saved = await store.insertSending({
      business_id: target.businessId,
      batch_id: batchId,
      kind: practice ? ORDER_LINK_KIND_PRACTICE : ORDER_LINK_KIND,
      field: ORDER_LINK_FIELD,
      before_value: storeLink(before),
      after_value: storeLink(after),
      approved_by: target.userId,
      approved_at: new Date(now).toISOString(),
      location_name: target.locationName,
      undo_of: options.undoOf ?? null,
    });
    if (!saved) return { status: "error", error: "not_set_up" };

    // 4. The one change.
    let sent: Call<PlaceActionLink>;
    if (op.op === "add") {
      sent = await call<PlaceActionLink>(f, target.accessToken, `${PLACE_ACTIONS_BASE}/${target.locationName}/placeActionLinks`, {
        method: "POST",
        body: JSON.stringify({ uri: after!.uri, placeActionType: after!.type }),
      });
      if (sent.ok && sent.data.name) {
        after = { ...after!, name: sent.data.name };
        await store.setAfter(batchId, storeLink(after));
      }
    } else if (op.op === "change") {
      const url = new URL(`${PLACE_ACTIONS_BASE}/${before!.name}`);
      url.searchParams.set("updateMask", "uri");
      sent = await call<PlaceActionLink>(f, target.accessToken, url.toString(), { method: "PATCH", body: JSON.stringify({ uri: after!.uri, placeActionType: before!.type }) });
    } else {
      sent = await call<PlaceActionLink>(f, target.accessToken, `${PLACE_ACTIONS_BASE}/${before!.name}`, { method: "DELETE" });
      // Already gone (a held link Google dropped): nothing left to remove.
      if (!sent.ok && sent.status === 404 && "added" in op) sent = { ok: true, data: {} };
    }
    if (!sent.ok) {
      await store.setStatus(batchId, "failed", reasonOf(sent));
      await log("failed", reasonOf(sent));
      return { status: "error", error: sent.error, reason: sent.reason };
    }

    // 5. Read it back.
    await store.setStatus(batchId, "sent", null);
    const readBack = await listPlaceActionLinks(target, options.fetchImpl ?? fetch);
    const shown =
      readBack.ok &&
      (after
        ? readBack.data.some((l) => (!after!.name || l.name === after!.name) && sameLink(l.uri, after!.uri) && sectionOf(l.placeActionType) === sectionOf(after!.type))
        : !readBack.data.some((l) => l.name === before!.name));
    if (shown) {
      await log("ok");
      return { status: "updated", undoBatchId: batchId };
    }
    await log("unconfirmed", readBack.ok ? "read_back_differs" : `read_back_failed:${reasonOf(readBack)}`);
    return { status: "unconfirmed", undoBatchId: batchId };
  } finally {
    logGbpCalls(`order-link-${action}`, counter);
  }
}

export interface OrderLinkUndo {
  batchId: string;
  approvedAt: string;
  undoUntil: string;
  /** null: the change added a link. */
  before: StoredLink | null;
  /** null: the change removed a link. */
  after: StoredLink | null;
  section: PlaceActionSection | null;
}

/** The latest link change the owner may still undo — the same rules as
 * every Google edit (latestUndoable: 7 days, not failed, not an undo, not
 * undone, made on the location connected now). A database read. */
export async function getOrderLinkUndo(store: Pick<OrderLinkStore, "rowsSince">, businessId: string, locationName: string, practice: boolean, now: number = Date.now()): Promise<OrderLinkUndo | null> {
  const rows = await store.rowsSince(businessId, new Date(now - (UNDO_DAYS + 1) * DAY_MS).toISOString(), practice ? ORDER_LINK_KIND_PRACTICE : ORDER_LINK_KIND);
  if (!rows) return null;
  const mine = rows.filter((r) => r.field === ORDER_LINK_FIELD && r.location_name === locationName && r.status !== "sending");
  const undoable = latestUndoable(mine, now, locationName);
  const row = undoable ? mine.find((r) => r.batch_id === undoable.batchId) : null;
  if (!undoable || !row) return null;
  const before = readStoredLink(row.before_value);
  const after = readStoredLink(row.after_value);
  if (!before && !after) return null;
  return { batchId: undoable.batchId, approvedAt: undoable.approvedAt, undoUntil: undoable.undoUntil, before, after, section: sectionOf((after ?? before)!.type) };
}

/** Puts the previous link back — never over a link someone changed on Google since. Logged like an edit. */
export async function undoOrderLink(
  target: ProfileTarget,
  batchId: string,
  store: OrderLinkStore,
  options: { fetchImpl?: typeof fetch; now?: number; practice?: boolean } = {}
): Promise<ApplyOrderLinkResult> {
  const now = options.now ?? Date.now();
  const undo = await getOrderLinkUndo(store, target.businessId, target.locationName, options.practice === true, now);
  if (!undo || undo.batchId !== batchId || !undo.section) return { status: "error", error: "undo_expired" };
  const current = await listPlaceActionLinks(target, options.fetchImpl ?? fetch);
  if (!current.ok) return { status: "error", error: current.error, reason: current.reason };

  let op: Op;
  if (!undo.before) {
    // Undo an add: remove exactly the link added — unless it was changed on Google since.
    const added = undo.after!;
    if (!added.name) return { status: "error", error: "undo_expired" };
    const live = current.data.find((l) => l.name === added.name);
    if (live && !sameLink(live.uri, added.uri)) return { status: "error", error: "changed_since" };
    op = { op: "remove", name: added.name, added };
  } else if (undo.after) {
    // Undo a change: the old address back on the same link.
    const live = current.data.find((l) => l.name === undo.after!.name);
    if (!live || !(sameLink(live.uri, undo.after.uri) || sameLink(live.uri, undo.before.uri))) return { status: "error", error: "changed_since" };
    op = { op: "change", name: undo.after.name!, url: undo.before.uri };
  } else {
    // Undo a remove: add the old link back — not when another of the owner's links took its place.
    const own = linksInSection(current.data, undo.section).filter((l) => l.editable);
    if (own.some((l) => !sameLink(l.uri, undo.before!.uri))) return { status: "error", error: "changed_since" };
    op = { op: "add", url: undo.before.uri, section: undo.section, type: undo.before.type };
  }
  const result = await applyOrderLinkEdit(target, op, store, { ...options, undoOf: batchId });
  if (result.status !== "error") await store.markUndone(batchId, new Date(now).toISOString());
  return result;
}
