"use server";

// "Add photos" (Premium): opening the panel (can PostScore send them, the
// latest undo), finishing a batch (the listing's photo count read again),
// and Undo (delete that batch's photos from the listing, ≤ 7 days). The
// uploads themselves are app/api/gbp/photos/route.ts. Off
// GOOGLE_WRITES_LIVE_PLACES every write is refused ("editing_off").

import { googlePagePaths } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import type { GbpEditBlock } from "@/lib/gbpEditGate.server";
import type { PhotoUndo } from "@/lib/gbpPhotos.server";

type Blocked = { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: string };

export type OpenPhotoUploadResult = { status: "ok"; canEdit: boolean; practice: boolean; undo: PhotoUndo | null; nicheId: string | null } | Blocked;

async function context(businessId: string) {
  const { photoContext } = await import("@/lib/gbpPhotosContext.server");
  return photoContext(businessId);
}

async function latestUndo(admin: import("@supabase/supabase-js").SupabaseClient, businessId: string, practice: boolean): Promise<PhotoUndo | null> {
  const [{ latestPhotoUndo }, { photosKind }] = await Promise.all([import("@/lib/gbpPhotos.server"), import("@/lib/gbpPhotos")]);
  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const { data, error } = await admin.from("gbp_changes").select("id, batch_id, after_value, approved_at, status, undone_at, undo_of").eq("business_id", businessId).eq("kind", photosKind(practice)).gte("approved_at", since);
  return error ? null : latestPhotoUndo((data ?? []) as never, Date.now());
}

export async function openPhotoUpload(businessId: string): Promise<OpenPhotoUploadResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  const { data } = await c.admin.from("businesses").select("niche_id").eq("id", businessId).maybeSingle();
  return { status: "ok", canEdit: c.canEdit, practice: c.practice, undo: await latestUndo(c.admin, businessId, c.practice).catch(() => null), nicheId: (data as { niche_id?: string | null } | null)?.niche_id ?? null };
}

/** After the last photo: the listing's photo count and newest date read again, so the row and lever update. */
export async function finishPhotoBatch(businessId: string): Promise<{ status: "ok"; undo: PhotoUndo | null } | Blocked> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.practice) {
    const { refreshPhotosAndPosts } = await import("@/lib/gbpMediaPosts.server");
    await refreshPhotosAndPosts(c.admin, businessId).catch(() => null);
    const { forgetRealListing } = await import("@/lib/gbpRealListing.server");
    forgetRealListing(businessId);
    for (const p of googlePagePaths(businessId)) revalidatePath(p);
  }
  return { status: "ok", undo: await latestUndo(c.admin, businessId, c.practice).catch(() => null) };
}

export type UndoPhotosResult = { status: "undone"; deleted: number } | { status: "editing_off" } | Blocked;

export async function undoPhotosAction(businessId: string, batchId: string): Promise<UndoPhotosResult> {
  const c = await context(businessId);
  if (!c.ok) return c.result;
  if (!c.canEdit) return { status: "editing_off" };
  const { undoPhotos, supabasePhotoStore } = await import("@/lib/gbpPhotos.server");
  const r = await undoPhotos(c.photo, batchId, supabasePhotoStore(c.admin), { fetchImpl: c.photoFetch, practice: c.practice });
  if (r.status === "error" && r.error === "reconnect") await c.markReconnect();
  if (!c.practice) {
    const { refreshPhotosAndPosts } = await import("@/lib/gbpMediaPosts.server");
    await refreshPhotosAndPosts(c.admin, businessId).catch(() => null);
    for (const p of googlePagePaths(businessId)) revalidatePath(p);
  }
  return r.status === "undone" ? r : { status: "error", error: r.error };
}
