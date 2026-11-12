// Server-only. The Google side of "Update website on Google": the owner's
// OWN matched location only (or practice mode's fake Google), every call
// through gbpFetch (lib/gbpQuota.ts), and only after the owner clicks
// Approve (or "Yes, undo"). The caller (app/actions/gbpWebsiteLink.ts)
// has already checked the owner, the plan, practice mode and the live
// allow list (GOOGLE_WRITES_LIVE_PLACES).
// - check: the new address loads and isn't a parked page — a plain fetch
//   of the site, never Google.
// - apply, the same flow as Edit on Google (lib/gbpProfileEdits.server.ts):
//   1. gbp_changes and the edit log ready (else "not_enabled", nothing
//      sent), the approval limits allow it;
//   2. re-read the link on Google (the "before" is Google's, never the browser's);
//   3. save before → after in gbp_changes as "sending" BEFORE anything is sent;
//   4. ONE locations.patch with updateMask=websiteUri;
//   5. metadata.hasPendingEdits: held for review is a neutral wait;
//   6. read it back: verified only when Google shows it.
//   The edit log (gbp_profile_edit_log) gets the outcome — never the URL.
// - undo: the latest change, ≤ 7 days, on the location connected now, only
//   if the link wasn't changed on Google since (or Google is still
//   reviewing ours); saved first, one PATCH restoring the old link, then a
//   read-back.
import "server-only";
import { randomUUID } from "crypto";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import { call, hasPendingEdits, type GbpChangeStore, type GbpEditError, type GbpEditTarget, type GoogleCall, type GoogleWriteOutcome } from "@/lib/gbpAttributes.server";
import { fetchWebsiteHtml } from "@/lib/websiteAnalysis";
import { detectParkedDomain } from "@/lib/websiteContentAnalysis";
import { WEBSITE_LINK_FIELD, websiteLinkKind, latestWebsiteLinkUndo, sameWebsiteLink, websiteLinkInput, type WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";

const BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type WebsiteLinkCheck = { status: "ok"; url: string } | { status: "invalid" | "down" | "parked" };

/** Does this address load as a real website? A plain fetch of the site
 * (no Google call). Never trusts the browser's own check. */
export async function checkWebsiteLink(raw: unknown, fetchImpl: typeof fetch = fetch): Promise<WebsiteLinkCheck> {
  const url = websiteLinkInput(raw);
  if (!url) return { status: "invalid" };
  const fetched = await fetchWebsiteHtml(url, fetchImpl);
  if (!fetched.html) return { status: "down" };
  if (detectParkedDomain(fetched.html)) return { status: "parked" };
  return { status: "ok", url };
}

/** The website link on the Google listing right now (null = none). */
export async function readWebsiteLink(target: Pick<GbpEditTarget, "accessToken" | "locationName">, fetchImpl: typeof fetch = fetch): Promise<GoogleCall<string | null>> {
  const counter = { calls: 0 };
  try {
    return await readLink(gbpFetch(counter, fetchImpl), target);
  } finally {
    logGbpCalls("website-link-read", counter);
  }
}

async function readLink(f: typeof fetch, target: Pick<GbpEditTarget, "accessToken" | "locationName">): Promise<GoogleCall<string | null>> {
  const url = new URL(`${BASE}/${target.locationName}`);
  url.searchParams.set("readMask", "websiteUri");
  const res = await call<{ websiteUri?: string }>(f, target.accessToken, url.toString());
  return res.ok ? { ok: true, data: res.data.websiteUri?.trim() || null } : res;
}

/** ONE locations.patch, websiteUri only. `uri` null removes the link. */
async function patchLink(f: typeof fetch, target: GbpEditTarget, uri: string | null): Promise<GoogleCall<unknown>> {
  const url = new URL(`${BASE}/${target.locationName}`);
  url.searchParams.set("updateMask", WEBSITE_LINK_FIELD);
  return call(f, target.accessToken, url.toString(), { method: "PATCH", body: JSON.stringify(uri ? { websiteUri: uri } : {}) });
}

function reasonOf(res: Extract<GoogleCall<unknown>, { ok: false }>): string | null {
  return res.reason ?? (res.status ? String(res.status) : res.error);
}

export type ApplyWebsiteLinkResult =
  /** `verified`: Google reads back the new link; otherwise Google took it but doesn't show it yet.
   * `shown`: the link Google read back (undefined when the read-back failed). */
  | { status: "sent"; verified: boolean; before: string | null; shown?: string | null }
  | { status: "pending_review"; before: string | null }
  | { status: "no_change" }
  | { status: "error"; error: GbpEditError | "invalid" | "down" | "parked" };

export interface WebsiteLinkOptions {
  fetchImpl?: typeof fetch;
  now?: number;
  checkImpl?: typeof checkWebsiteLink;
  /** Practice mode's fake Google: its own kind in gbp_changes, practice = true in the log. */
  practice?: boolean;
}

export async function applyWebsiteLink(target: GbpEditTarget, raw: unknown, store: GbpChangeStore, options: WebsiteLinkOptions = {}): Promise<ApplyWebsiteLinkResult> {
  const now = options.now ?? Date.now();
  // 1. Both logs must exist, and the approval limits allow it — before any Google call.
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };
  // Checked again here: only an address that loads, and isn't parked.
  const checked = await (options.checkImpl ?? checkWebsiteLink)(raw);
  if (checked.status !== "ok") return { status: "error", error: checked.status };
  const result = await sendLink(target, checked.url, store, { ...options, now, undoOf: null });
  if (result.status === "error") return result;
  if (result.status === "no_change") return result;
  return result.status === "pending_review" ? { status: "pending_review", before: result.before } : { status: "sent", verified: result.verified, before: result.before, shown: result.shown };
}

type SendResult =
  | { status: "sent"; verified: boolean; before: string | null; shown: string | null | undefined; batchId: string }
  | { status: "pending_review"; before: string | null; batchId: string }
  | { status: "no_change" }
  | { status: "error"; error: GbpEditError };

/** Steps 2–6 for an edit or an undo: read, save first, one patch, held?, read back, log. */
async function sendLink(
  target: GbpEditTarget,
  uri: string | null,
  store: GbpChangeStore,
  options: WebsiteLinkOptions & { now: number; undoOf: string | null; expectBefore?: (current: string | null) => GbpEditError | "already" | null }
): Promise<SendResult> {
  const practice = options.practice === true;
  const action = options.undoOf ? "undo" : "edit";
  const log = (outcome: GoogleWriteOutcome, reason: string | null = null) =>
    store.logEdit({ business_id: target.businessId, user_id: target.userId, field: "website_link", action, outcome, practice, error_reason: reason, changed_count: 1 });
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  try {
    // 2. What Google has now.
    const current = await readLink(f, target);
    if (!current.ok) {
      await log("failed", `read:${reasonOf(current)}`);
      return { status: "error", error: current.error };
    }
    const refused = options.expectBefore?.(current.data) ?? null;
    if (refused === "already") return { status: "no_change" };
    if (refused) {
      await log("failed", refused);
      return { status: "error", error: refused };
    }
    if (!options.expectBefore && sameWebsiteLink(current.data, uri)) return { status: "no_change" };

    // 3. The previous link, saved before anything is sent.
    const batchId = randomUUID();
    const saved = await store.insert([
      {
        business_id: target.businessId,
        batch_id: batchId,
        kind: websiteLinkKind(practice),
        field: WEBSITE_LINK_FIELD,
        before_value: current.data,
        after_value: uri,
        approved_by: target.userId,
        approved_at: new Date(options.now).toISOString(),
        location_name: target.locationName,
        status: "sending",
        undo_of: options.undoOf,
      },
    ]);
    if (!saved) return { status: "error", error: "not_enabled" };

    // 4. The one change.
    const patched = await patchLink(f, target, uri);
    if (!patched.ok) {
      await store.setStatus(batchId, "failed", reasonOf(patched));
      await log("failed", reasonOf(patched));
      console.warn("[gbp-website] patch failed", JSON.stringify({ status: patched.status, reason: patched.reason }));
      return { status: "error", error: patched.error };
    }
    // 5. Held for review?
    if (await hasPendingEdits(f, target.accessToken, target.locationName)) {
      await store.setStatus(batchId, "pending_review", null);
      await log("pending_review");
      return { status: "pending_review", before: current.data, batchId };
    }
    // 6. Read it back.
    const readback = await readLink(f, target);
    const verified = readback.ok && sameWebsiteLink(readback.data, uri);
    await store.setStatus(batchId, "sent", verified ? null : readback.ok ? "read_back_differs" : `read_back_failed:${reasonOf(readback)}`);
    await log(verified ? "ok" : "unconfirmed", verified ? null : readback.ok ? "read_back_differs" : `read_back_failed:${reasonOf(readback)}`);
    return { status: "sent", verified, before: current.data, shown: readback.ok ? readback.data : undefined, batchId };
  } finally {
    logGbpCalls(`website-link-${action}`, counter);
  }
}

/** The latest website link change the owner may undo here (a database
 * read — no Google call). Null before the SQL is run. */
export async function getWebsiteLinkUndo(store: GbpChangeStore, businessId: string, locationName: string, now: number = Date.now(), practice = false): Promise<WebsiteLinkUndo | null> {
  const rows = await store.rowsSince(businessId, new Date(now - 8 * DAY_MS).toISOString(), websiteLinkKind(practice));
  return rows ? latestWebsiteLinkUndo(rows, now, locationName) : null;
}

export type UndoWebsiteLinkResult =
  /** `pending`: sent while Google reviews it. `shown`: the link Google reads back now (not while pending). */
  | { status: "sent"; pending?: boolean; shown?: string | null }
  | { status: "error"; error: GbpEditError; pending?: boolean };

/** Puts the old link back (removes it when there was none). Never
 * overwrites a link someone changed on Google since — unless Google is
 * still reviewing ours, when Google's read may show the old one anyway:
 * then the restore is always sent (code review M3). Saved before it's
 * sent, like an edit; not held to the one-minute wait. */
export async function undoWebsiteLink(target: GbpEditTarget, batchId: string, store: GbpChangeStore, options: Omit<WebsiteLinkOptions, "checkImpl"> = {}): Promise<UndoWebsiteLinkResult> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  const undo = await getWebsiteLinkUndo(store, target.businessId, target.locationName, now, practice);
  if (!undo || undo.batchId !== batchId) return { status: "error", error: "undo_expired" };
  if ((await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString())) === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_enabled" };

  const wasPending = undo.status === "pending_review";
  const result = await sendLink(target, undo.before, store, {
    ...options,
    now,
    undoOf: batchId,
    expectBefore: (current) => {
      if (sameWebsiteLink(current, undo.after)) return null;
      // Google may still be showing the old link while it reviews ours: send anyway.
      if (wasPending && sameWebsiteLink(current, undo.before)) return null;
      // Back already (changed on Google): nothing to send.
      if (sameWebsiteLink(current, undo.before)) return "already";
      return "changed_since";
    },
  });
  if (result.status === "error") return result;
  if (result.status === "sent" && !result.verified) {
    // Google doesn't show the old link back: "failed", so the change can still be undone again.
    await store.setStatus(result.batchId, "failed", "readback");
    return { status: "error", error: "undo_unverified" };
  }
  await store.markUndone(batchId, new Date(now).toISOString());
  if (result.status === "pending_review") return { status: "sent", pending: true };
  // Back already on Google (nothing sent): it shows the previous link.
  return { status: "sent", shown: result.status === "sent" ? result.shown : undo.before };
}
