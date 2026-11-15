// Server-only. "Add photos" to the listing (Business Profile API v4 media),
// one photo per call, with the same safety flow as every write. The caller
// (app/api/gbp/photos/route.ts) has already checked the owner, the plan,
// practice mode and the live allow list (GOOGLE_WRITES_LIVE_PLACES).
//   1. the approval limits (once per batch — the first photo), at most 10;
//   2. metadata stripped again (EXIF / GPS / XMP), size and dimensions checked;
//   3. a gbp_changes row saved as "sending" first — Google's media name and
//      the category only, never the image;
//   4. media:startUpload → upload the bytes → media.create with the category;
//   5. read back (GET the media item): "Added · Google is reviewing".
// The image bytes only ever live in memory for this one request: no file,
// no storage, nothing kept. Undo (≤ 7 days): DELETE each media item of the batch.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gbpFetch, logGbpCalls } from "@/lib/gbpQuota";
import { approvalAllowed } from "@/lib/gbpAttributes";
import { call, type GbpEditError, type GoogleWriteLogRow } from "@/lib/gbpAttributes.server";
import { MAX_BYTES, MAX_PHOTOS, MIN_BYTES, MIN_SIDE, photosKind, type PhotoCategory, type StoredPhoto } from "@/lib/gbpPhotos";
import { imageSize, imageTypeOf, stripImageMetadata } from "@/lib/imageMeta";

const V4 = "https://mybusiness.googleapis.com/v4";
const UPLOAD = "https://mybusiness.googleapis.com/upload/v1/media";
const DAY_MS = 86_400_000;
export const PHOTO_UNDO_DAYS = 7;

export interface PhotoTarget {
  businessId: string;
  userId: string;
  /** "accounts/1/locations/2" (v4 names the account too). */
  parent: string;
  accessToken: string;
}

export interface PhotoRow {
  id: string;
  batch_id: string;
  after_value: string | null;
  approved_at: string;
  status: string;
  undone_at: string | null;
}

export interface PhotoStore {
  approvalsSince(businessId: string, since: string): Promise<string[] | null>;
  editLogReady(businessId: string): Promise<boolean>;
  batchRows(businessId: string, batchId: string): Promise<PhotoRow[] | null>;
  /** The id of the saved row, or null: not saved, nothing is sent. */
  insert(row: Record<string, unknown>): Promise<string | null>;
  update(id: string, patch: Record<string, unknown>): Promise<void>;
  markUndone(businessId: string, batchId: string, at: string): Promise<void>;
  logEdit(row: GoogleWriteLogRow): Promise<void>;
}

export function supabasePhotoStore(db: SupabaseClient): PhotoStore {
  return {
    async approvalsSince(businessId, since) {
      const { data, error } = await db.from("gbp_changes").select("batch_id, approved_at").eq("business_id", businessId).gte("approved_at", since);
      if (error) return null;
      const by = new Map<string, string>();
      for (const r of (data ?? []) as Array<{ batch_id: string; approved_at: string }>) if (!by.has(r.batch_id)) by.set(r.batch_id, r.approved_at);
      return Array.from(by.values());
    },
    async editLogReady(businessId) {
      const { error } = await db.from("gbp_profile_edit_log").select("changed_count").eq("business_id", businessId).limit(1);
      return !error;
    },
    async batchRows(businessId, batchId) {
      const { data, error } = await db.from("gbp_changes").select("id, batch_id, after_value, approved_at, status, undone_at").eq("business_id", businessId).eq("batch_id", batchId).is("undo_of", null);
      return error ? null : ((data ?? []) as PhotoRow[]);
    },
    async insert(row) {
      const { data, error } = await db.from("gbp_changes").insert(row).select("id").single();
      return error ? null : ((data as { id: string }).id ?? null);
    },
    async update(id, patch) {
      await db.from("gbp_changes").update(patch).eq("id", id);
    },
    async markUndone(businessId, batchId, at) {
      await db.from("gbp_changes").update({ undone_at: at }).eq("business_id", businessId).eq("batch_id", batchId);
    },
    async logEdit(row) {
      await db.from("gbp_profile_edit_log").insert({ ...row, error_reason: row.error_reason ? row.error_reason.slice(0, 120) : null });
    },
  };
}

export type PhotoUploadResult =
  | { status: "added"; name: string; verified: boolean }
  | { status: "invalid"; problem: "type" | "too_small_file" | "too_big_file" | "too_small_size" | "too_many" }
  | { status: "error"; error: GbpEditError };

const reasonOf = (r: { reason?: string | null; status?: number | null; error: string }) => r.reason ?? (r.status ? String(r.status) : r.error);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function uploadPhoto(
  target: PhotoTarget,
  input: { batchId: string; bytes: Uint8Array; category: PhotoCategory },
  store: PhotoStore,
  options: { fetchImpl?: typeof fetch; practice?: boolean; now?: number } = {}
): Promise<PhotoUploadResult> {
  const now = options.now ?? Date.now();
  const practice = options.practice === true;
  if (!UUID.test(input.batchId)) return { status: "error", error: "failed" };

  // 2. The photo itself — the bytes Google gets have no metadata left.
  const type = imageTypeOf(input.bytes);
  if (!type) return { status: "invalid", problem: "type" };
  const bytes = stripImageMetadata(input.bytes);
  if (bytes.length < MIN_BYTES) return { status: "invalid", problem: "too_small_file" };
  if (bytes.length > MAX_BYTES) return { status: "invalid", problem: "too_big_file" };
  const size = imageSize(bytes);
  if (!size || size.width < MIN_SIDE || size.height < MIN_SIDE) return { status: "invalid", problem: "too_small_size" };

  // 1. The limits: one approval per batch, at most 10 photos in it.
  const rows = await store.batchRows(target.businessId, input.batchId);
  if (rows === null || !(await store.editLogReady(target.businessId))) return { status: "error", error: "not_enabled" };
  if (rows.length >= MAX_PHOTOS) return { status: "invalid", problem: "too_many" };
  if (rows.length === 0) {
    const approvals = await store.approvalsSince(target.businessId, new Date(now - DAY_MS).toISOString());
    if (approvals === null) return { status: "error", error: "not_enabled" };
    const allowed = approvalAllowed(approvals, now);
    if (allowed !== "ok") return { status: "error", error: allowed };
  } else if (rows.some((r) => now - Date.parse(r.approved_at) > 60 * 60 * 1000)) {
    // A batch is one sitting: an hour-old batch id isn't reused.
    return { status: "error", error: "failed" };
  }

  const log = (outcome: "ok" | "unconfirmed" | "failed", reason: string | null = null) =>
    store.logEdit({ business_id: target.businessId, user_id: target.userId, field: "photos", action: "edit", outcome, practice, error_reason: reason, changed_count: 1 });

  // 3. Saved first — the name and category only.
  const stored: StoredPhoto = { name: null, category: input.category };
  const rowId = await store.insert({
    business_id: target.businessId,
    batch_id: input.batchId,
    kind: photosKind(practice),
    field: "media",
    before_value: null,
    after_value: JSON.stringify(stored),
    approved_by: target.userId,
    approved_at: new Date(rows.length === 0 ? now : Date.parse(rows[0].approved_at)).toISOString(),
    location_name: target.parent.replace(/^accounts\/[^/]+\//, ""),
    status: "sending",
  });
  if (!rowId) return { status: "error", error: "not_enabled" };

  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  const fail = async (res: { error: GbpEditError; reason?: string | null; status?: number | null }, step: string) => {
    await store.update(rowId, { status: "failed", error_reason: `${step}:${reasonOf(res)}`.slice(0, 120) });
    await log("failed", `${step}:${reasonOf(res)}`);
    return { status: "error" as const, error: res.error };
  };
  try {
    // 4. startUpload → the bytes → media.create.
    const started = await call<{ resourceName?: string }>(f, target.accessToken, `${V4}/${target.parent}/media:startUpload`, { method: "POST", body: "{}" });
    if (!started.ok || !started.data.resourceName) return fail(started.ok ? { error: "failed", reason: "no_resource" } : started, "start");
    let uploaded: Response;
    try {
      uploaded = await f(`${UPLOAD}/${encodeURIComponent(started.data.resourceName)}?upload_type=media`, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.accessToken}`, "Content-Type": type === "png" ? "image/png" : "image/jpeg" },
        body: bytes as unknown as BodyInit,
      });
    } catch {
      return fail({ error: "failed", reason: "network" }, "upload");
    }
    if (!uploaded.ok) return fail({ error: uploaded.status === 401 ? "reconnect" : uploaded.status === 403 ? "permission" : "failed", status: uploaded.status }, "upload");
    const created = await call<{ name?: string }>(f, target.accessToken, `${V4}/${target.parent}/media`, {
      method: "POST",
      body: JSON.stringify({ mediaFormat: "PHOTO", locationAssociation: { category: input.category }, dataRef: { resourceName: started.data.resourceName } }),
    });
    if (!created.ok || !created.data.name) return fail(created.ok ? { error: "failed", reason: "no_name" } : created, "create");
    const name = created.data.name;

    // 5. Read it back.
    const back = await call<{ name?: string }>(f, target.accessToken, `${V4}/${name}`);
    const verified = back.ok && back.data.name === name;
    await store.update(rowId, { status: "sent", error_reason: verified ? null : "read_back_failed", after_value: JSON.stringify({ ...stored, name }) });
    await log(verified ? "ok" : "unconfirmed", verified ? null : "read_back_failed");
    return { status: "added", name, verified };
  } finally {
    logGbpCalls("photos-upload", counter);
  }
}

export interface PhotoUndo {
  batchId: string;
  count: number;
  undoUntil: string;
}

/** The latest batch of photos the owner may still undo. */
export function latestPhotoUndo(rows: Array<PhotoRow & { undo_of?: string | null }>, now: number): PhotoUndo | null {
  const sent = rows.filter((r) => !r.undo_of && r.status === "sent" && !r.undone_at).sort((a, b) => b.approved_at.localeCompare(a.approved_at));
  const last = sent[0];
  if (!last) return null;
  const at = Date.parse(last.approved_at);
  if (now - at > PHOTO_UNDO_DAYS * DAY_MS) return null;
  return { batchId: last.batch_id, count: sent.filter((r) => r.batch_id === last.batch_id).length, undoUntil: new Date(at + PHOTO_UNDO_DAYS * DAY_MS).toISOString() };
}

/** Undo: delete each photo of the batch from the listing (≤ 7 days). */
export async function undoPhotos(target: PhotoTarget, batchId: string, store: PhotoStore, options: { fetchImpl?: typeof fetch; practice?: boolean; now?: number } = {}): Promise<{ status: "undone"; deleted: number } | { status: "error"; error: GbpEditError | "undo_expired" }> {
  const now = options.now ?? Date.now();
  const rows = await store.batchRows(target.businessId, batchId);
  if (!rows || rows.length === 0) return { status: "error", error: "undo_expired" };
  const sent = rows.filter((r) => r.status === "sent" && !r.undone_at);
  if (sent.length === 0 || now - Date.parse(sent[0].approved_at) > PHOTO_UNDO_DAYS * DAY_MS) return { status: "error", error: "undo_expired" };
  const counter = { calls: 0 };
  const f = gbpFetch(counter, options.fetchImpl ?? fetch);
  let deleted = 0;
  let lastError: GbpEditError | null = null;
  try {
    for (const r of sent) {
      const name = (JSON.parse(r.after_value ?? "{}") as StoredPhoto).name;
      // Only this business's own media items.
      if (!name || !name.startsWith(`${target.parent}/media/`)) continue;
      const res = await call(f, target.accessToken, `${V4}/${name}`, { method: "DELETE" });
      // Already gone (404) counts as deleted.
      if (res.ok || res.status === 404) deleted++;
      else lastError = res.error;
    }
  } finally {
    logGbpCalls("photos-undo", counter);
  }
  await store.logEdit({ business_id: target.businessId, user_id: target.userId, field: "photos", action: "undo", outcome: lastError ? "failed" : "ok", practice: options.practice === true, error_reason: lastError, changed_count: deleted });
  if (lastError && deleted === 0) return { status: "error", error: lastError };
  await store.markUndone(target.businessId, batchId, new Date(now).toISOString());
  return { status: "undone", deleted };
}
