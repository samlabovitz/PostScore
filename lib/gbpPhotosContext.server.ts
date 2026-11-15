// Server-only. Who may add photos and where they go: the owner, the plan,
// practice mode and the live allow list (googleWriteContext), plus the v4
// parent ("accounts/…/locations/…") from gbp_connections. Practice mode
// gets the in-memory fake (lib/gbpPhotosPractice.server.ts), never Google.
import "server-only";
import type { GoogleWriteContext, GoogleWriteBlocked } from "@/lib/gbpWriteContext.server";
import type { PhotoTarget } from "@/lib/gbpPhotos.server";

export type PhotoContext = (Extract<GoogleWriteContext, { ok: true }> & { photo: PhotoTarget; photoFetch: typeof fetch }) | GoogleWriteBlocked | { ok: false; result: { status: "error"; error: "not_connected" } };

export async function photoContext(businessId: string): Promise<PhotoContext> {
  const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
  const c = await googleWriteContext(businessId);
  if (!c.ok) return c;
  if (c.practice) {
    const { practicePhotoFetch, PRACTICE_PHOTO_PARENT } = await import("@/lib/gbpPhotosPractice.server");
    return { ...c, photo: { businessId, userId: c.target.userId, parent: PRACTICE_PHOTO_PARENT, accessToken: "practice-token" }, photoFetch: practicePhotoFetch(businessId) };
  }
  const { data } = await c.admin.from("gbp_connections").select("google_account_id, google_location_id").eq("business_id", businessId).maybeSingle();
  const conn = data as { google_account_id?: string | null; google_location_id?: string | null } | null;
  if (!conn?.google_account_id?.startsWith("accounts/") || !conn.google_location_id?.startsWith("locations/")) return { ok: false, result: { status: "error", error: "not_connected" } };
  return { ...c, photo: { businessId, userId: c.target.userId, parent: `${conn.google_account_id}/${conn.google_location_id}`, accessToken: c.target.accessToken }, photoFetch: fetch };
}
