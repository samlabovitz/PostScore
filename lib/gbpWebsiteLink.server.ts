// Server-only. The Google side of "Update website on Google": the owner's
// OWN matched location only, every call through gbpFetch
// (lib/gbpQuota.ts), and only after the owner clicks Approve (or "Yes,
// undo"). Same safety as customer details (lib/gbpAttributes.server.ts):
// - check: the new address loads and isn't a parked page — a plain fetch
//   of the site, never Google.
// - apply: re-reads the link on Google (the logged "before" is Google's,
//   never the browser's), ONE locations.patch with updateMask=websiteUri,
//   then metadata.hasPendingEdits and a read-back. Logged in gbp_changes
//   (kind "website_uri", with location_name), failures too.
// - undo: the latest change, ≤ 7 days, on the location connected now, only
//   if the link wasn't changed on Google since (or Google is still
//   reviewing ours); one PATCH restoring the old link, then a re-check.
import "server-only";
import { randomUUID } from "crypto";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import { call, hasPendingEdits, type GbpChangeStore, type GbpEditError, type GbpEditTarget, type GoogleCall } from "@/lib/gbpAttributes.server";
import { fetchWebsiteHtml } from "@/lib/websiteAnalysis";
import { detectParkedDomain } from "@/lib/websiteContentAnalysis";
import { WEBSITE_LINK_FIELD, WEBSITE_LINK_KIND, latestWebsiteLinkUndo, sameWebsiteLink, websiteLinkInput, type WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";

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
  /** `verified`: Google reads back the new link. `logged` false: sent, but no undo can be offered. */
  | { status: "sent"; verified: boolean; logged: boolean; before: string | null }
  | { status: "pending_review"; logged: boolean; before: string | null }
  | { status: "no_change" }
  | { status: "error"; error: GbpEditError | "invalid" | "down" | "parked" };

export async function applyWebsiteLink(
  target: GbpEditTarget,
  raw: unknown,
  store: GbpChangeStore,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
  checkImpl: typeof checkWebsiteLink = checkWebsiteLink
): Promise<ApplyWebsiteLinkResult> {
  // The log must exist before anything is sent.
  const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
  if (approvals === null) return { status: "error", error: "not_enabled" };
  const allowed = approvalAllowed(approvals, now);
  if (allowed !== "ok") return { status: "error", error: allowed };
  // Checked again here: only an address that loads, and isn't parked.
  const checked = await checkImpl(raw);
  if (checked.status !== "ok") return { status: "error", error: checked.status };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    const current = await readLink(f, target);
    if (!current.ok) return { status: "error", error: current.error };
    if (sameWebsiteLink(current.data, checked.url)) return { status: "no_change" };

    const patched = await patchLink(f, target, checked.url);
    const pending = patched.ok ? await hasPendingEdits(f, target.accessToken, target.locationName) : false;
    const readback = patched.ok && !pending ? await readLink(f, target) : null;
    const status = !patched.ok ? "failed" : pending ? "pending_review" : "sent";
    const logged = await store.insert([
      {
        business_id: target.businessId,
        batch_id: randomUUID(),
        kind: WEBSITE_LINK_KIND,
        field: WEBSITE_LINK_FIELD,
        before_value: current.data,
        after_value: checked.url,
        approved_by: target.userId,
        approved_at: new Date(now).toISOString(),
        location_name: target.locationName,
        status,
        error_reason: patched.ok ? null : reasonOf(patched),
      },
    ]);
    if (!patched.ok) {
      console.warn("[gbp-website] patch failed", JSON.stringify({ status: patched.status, reason: patched.reason }));
      return { status: "error", error: patched.error };
    }
    if (pending) return { status: "pending_review", logged, before: current.data };
    return { status: "sent", verified: !!readback?.ok && sameWebsiteLink(readback.data, checked.url), logged, before: current.data };
  } finally {
    logGbpCalls("website-link-apply", counter);
  }
}

/** The latest website link change the owner may undo here (a database
 * read — no Google call). Null before the SQL is run. */
export async function getWebsiteLinkUndo(store: GbpChangeStore, businessId: string, locationName: string, now: number = Date.now()): Promise<WebsiteLinkUndo | null> {
  const rows = await store.rowsSince(businessId, new Date(now - 8 * DAY_MS).toISOString(), WEBSITE_LINK_KIND);
  return rows ? latestWebsiteLinkUndo(rows, now, locationName) : null;
}

export type UndoWebsiteLinkResult =
  | { status: "sent"; pending?: boolean }
  | { status: "error"; error: GbpEditError; pending?: boolean };

/** Puts the old link back (removes it when there was none). Never
 * overwrites a link someone changed on Google since — unless Google is
 * still reviewing ours, when Google's read may show the old one anyway:
 * then the restore is always sent (code review M3). */
export async function undoWebsiteLink(target: GbpEditTarget, batchId: string, store: GbpChangeStore, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<UndoWebsiteLinkResult> {
  const undo = await getWebsiteLinkUndo(store, target.businessId, target.locationName, now);
  if (!undo || undo.batchId !== batchId) return { status: "error", error: "undo_expired" };

  const at = new Date(now).toISOString();
  const log = (status: "sent" | "pending_review" | "failed", reason: string | null) =>
    store.insert([
      {
        business_id: target.businessId,
        batch_id: randomUUID(),
        kind: WEBSITE_LINK_KIND,
        field: WEBSITE_LINK_FIELD,
        before_value: undo.after,
        after_value: undo.before,
        approved_by: target.userId,
        approved_at: at,
        location_name: target.locationName,
        status,
        error_reason: reason,
        undo_of: batchId,
      },
    ]);

  const counter = { calls: 0 };
  const f = gbpFetch(counter, fetchImpl);
  try {
    const current = await readLink(f, target);
    if (!current.ok) {
      await log("failed", `read:${reasonOf(current)}`);
      return { status: "error", error: current.error };
    }
    const wasPending = undo.status === "pending_review";
    const stillOurs = sameWebsiteLink(current.data, undo.after);
    const alreadyBack = sameWebsiteLink(current.data, undo.before);
    if (!stillOurs && !(wasPending && alreadyBack)) {
      if (alreadyBack) {
        // Back already (changed on Google): nothing to send.
        await log("sent", "already_restored");
        await store.markUndone(batchId, at);
        return { status: "sent" };
      }
      await log("failed", "changed_since");
      return { status: "error", error: "changed_since" };
    }
    const patched = await patchLink(f, target, undo.before);
    if (!patched.ok) {
      await log("failed", reasonOf(patched));
      return { status: "error", error: patched.error };
    }
    const pending = await hasPendingEdits(f, target.accessToken, target.locationName);
    if (pending) {
      await log("pending_review", null);
      await store.markUndone(batchId, at);
      return { status: "sent", pending: true };
    }
    const readback = await readLink(f, target);
    if (!readback.ok || !sameWebsiteLink(readback.data, undo.before)) {
      await log("failed", readback.ok ? "readback" : `readback_failed:${reasonOf(readback)}`);
      return { status: "error", error: "undo_unverified" };
    }
    await log("sent", null);
    await store.markUndone(batchId, at);
    return { status: "sent" };
  } finally {
    logGbpCalls("website-link-undo", counter);
  }
}
