// "Add photos" (Premium): ONE photo per request (multipart: businessId,
// batchId, category, photo), so each stays under the request size limit.
// The owner, plan, practice mode and live allow list come from
// photoContext; off GOOGLE_WRITES_LIVE_PLACES every upload is refused
// ("editing_off") before any Google call. The bytes are read into memory,
// passed straight to Google (lib/gbpPhotos.server.ts) and dropped — never
// written to disk or storage.
import { NextResponse, type NextRequest } from "next/server";
import { isPhotoCategory, MAX_BYTES } from "@/lib/gbpPhotos";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "invalid", problem: "type" }, { status: 400 });
  }
  const businessId = String(form.get("businessId") ?? "");
  const batchId = String(form.get("batchId") ?? "");
  const category = form.get("category");
  const file = form.get("photo");
  if (!businessId || !isPhotoCategory(category) || !(file instanceof Blob)) return NextResponse.json({ status: "invalid", problem: "type" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ status: "invalid", problem: "too_big_file" });

  const { photoContext } = await import("@/lib/gbpPhotosContext.server");
  const c = await photoContext(businessId);
  if (!c.ok) return NextResponse.json(c.result);
  if (!c.canEdit) return NextResponse.json({ status: "editing_off" });
  if (c.practice) {
    const practice = await import("@/lib/gbpProfilePractice.server");
    const outcome = form.get("practiceOutcome");
    practice.setPracticeOutcome(businessId, practice.isPracticeOutcome(outcome) ? outcome : "accept");
  }
  const [{ uploadPhoto, supabasePhotoStore }] = await Promise.all([import("@/lib/gbpPhotos.server")]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await uploadPhoto(c.photo, { batchId, bytes, category }, supabasePhotoStore(c.admin), { fetchImpl: c.photoFetch, practice: c.practice });
  if (r.status === "error" && r.error === "reconnect") await c.markReconnect();
  return NextResponse.json(r);
}
