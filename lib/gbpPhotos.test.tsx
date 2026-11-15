import { afterEach, describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// "Add photos": the checks every photo passes, metadata (EXIF / GPS)
// removed, Google's categories per business type, the upload flow on a
// mocked v4 media API (save first → startUpload → bytes → create → read
// back), Undo deleting the media items, the read-only fallback, practice
// mode never reaching Google, and no image ever stored.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const ctx = vi.hoisted(() => ({ canEdit: false }));
vi.mock("@/lib/gbpPhotosContext.server", () => ({
  photoContext: async () => ({ ok: true, admin: {}, canEdit: ctx.canEdit, practice: false, target: {}, photo: { businessId: "b1", userId: "u1", parent: "accounts/1/locations/2", accessToken: "t" }, photoFetch: vi.fn(), markReconnect: vi.fn() }),
}));

import { MIN_BYTES, photoProblem, suggestedCategories, targetSize } from "@/lib/gbpPhotos";
import { hasImageMetadata, imageSize, stripImageMetadata } from "@/lib/imageMeta";
import { latestPhotoUndo, undoPhotos, uploadPhoto, type PhotoRow, type PhotoStore } from "@/lib/gbpPhotos.server";
import { practicePhotoFetch, PRACTICE_PHOTO_PARENT } from "@/lib/gbpPhotosPractice.server";
import { PhotoUpload } from "@/components/gbp/PhotoUpload";
import { LocaleProvider } from "@/lib/i18n";

afterEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// A JPEG with EXIF (GPS) and a comment, and a PNG with text chunks.
// ---------------------------------------------------------------------------
const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 0xff, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
function jpeg(width: number, height: number, scanBytes = MIN_BYTES + 2000): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    ...seg(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 41.0762N 73.8587W")]),
    ...seg(0xfe, ascii("taken at home")),
    ...seg(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    ...new Array(scanBytes).fill(0x55),
    0xff, 0xd9,
  ]);
}
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: number[]) => [0, 0, (data.length >> 8) & 0xff, data.length & 0xff, ...ascii(type), ...data, 0, 0, 0, 0];
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [...u32(width), ...u32(height), 8, 2, 0, 0, 0]), ...chunk("tEXt", ascii("GPS\0 41.07N")), ...chunk("IDAT", [1, 2, 3]), ...chunk("IEND", [])]);
}

describe("file checks", () => {
  test("10 KB–5 MB, JPG/PNG, at least 720×720", () => {
    expect(photoProblem({ type: "image/jpeg", bytes: 200_000, width: 1200, height: 900 })).toBeNull();
    expect(photoProblem({ type: "image/gif", bytes: 200_000, width: 1200, height: 900 })).toBe("type");
    expect(photoProblem({ type: "image/png", bytes: 5_000, width: 1200, height: 900 })).toBe("too_small_file");
    expect(photoProblem({ type: "image/jpeg", bytes: 6 * 1024 * 1024, width: 1200, height: 900 })).toBe("too_big_file");
    expect(photoProblem({ type: "image/jpeg", bytes: 200_000, width: 1200, height: 700 })).toBe("too_small_size");
  });
  test("re-encoded at most 3000 px on the long side; square crop from the middle", () => {
    expect(targetSize(6000, 4000)).toMatchObject({ width: 3000, height: 2000 });
    expect(targetSize(1600, 1200, true)).toEqual({ width: 1200, height: 1200, sx: 200, sy: 0, sw: 1200, sh: 1200 });
  });
});

describe("metadata stripping", () => {
  test("JPEG: EXIF (with GPS) and comments removed, the image and its size kept", () => {
    const original = jpeg(1200, 900);
    expect(hasImageMetadata(original)).toBe(true);
    const clean = stripImageMetadata(original);
    expect(hasImageMetadata(clean)).toBe(false);
    expect(Buffer.from(clean).includes(Buffer.from("GPS"))).toBe(false);
    expect(Buffer.from(clean).includes(Buffer.from("taken at home"))).toBe(false);
    expect(imageSize(clean)).toEqual({ width: 1200, height: 900 });
    expect(clean[clean.length - 1]).toBe(0xd9);
  });
  test("PNG: text chunks removed, the size read from IHDR", () => {
    const clean = stripImageMetadata(png(800, 800));
    expect(hasImageMetadata(png(800, 800))).toBe(true);
    expect(hasImageMetadata(clean)).toBe(false);
    expect(imageSize(clean)).toEqual({ width: 800, height: 800 });
  });
});

describe("categories", () => {
  test("the best types per business type", () => {
    expect(suggestedCategories("hair")).toEqual(["INTERIOR", "AT_WORK", "TEAMS", "PRODUCT"]);
    expect(suggestedCategories("restaurant")[0]).toBe("PRODUCT");
    expect(suggestedCategories(null)).toEqual(["INTERIOR", "EXTERIOR", "AT_WORK", "TEAMS"]);
  });
});

// ---------------------------------------------------------------------------
// The upload flow on a mocked v4 API.
// ---------------------------------------------------------------------------
function memoryStore() {
  const rows: Array<PhotoRow & Record<string, unknown>> = [];
  const logs: unknown[] = [];
  const store: PhotoStore = {
    approvalsSince: async () => [],
    editLogReady: async () => true,
    batchRows: async (_b, batchId) => rows.filter((r) => r.batch_id === batchId),
    insert: async (row) => {
      const id = `row${rows.length + 1}`;
      rows.push({ id, undone_at: null, ...(row as object) } as PhotoRow & Record<string, unknown>);
      return id;
    },
    update: async (id, patch) => void Object.assign(rows.find((r) => r.id === id)!, patch),
    markUndone: async (_b, batchId, at) => rows.filter((r) => r.batch_id === batchId).forEach((r) => (r.undone_at = at)),
    logEdit: async (l) => void logs.push(l),
  };
  return { store, rows, logs };
}
const TARGET = { businessId: "b1", userId: "u1", parent: "accounts/1/locations/2", accessToken: "tok" };
const BATCH = "0d6b1a7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

function googleMock() {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith("/media:startUpload")) return json({ resourceName: "ref-1" });
    if (url.includes("/upload/v1/media/")) return json({});
    if (url.endsWith("/accounts/1/locations/2/media") && method === "POST") return json({ name: "accounts/1/locations/2/media/m1" });
    if (method === "GET") return json({ name: "accounts/1/locations/2/media/m1" });
    if (method === "DELETE") return json({});
    return new Response("{}", { status: 400 });
  }) as typeof fetch;
  return { f, calls };
}

describe("upload flow", () => {
  test("saved first, then startUpload → bytes (no metadata) → create with the category → read back", async () => {
    const { store, rows, logs } = memoryStore();
    const { f, calls } = googleMock();
    const r = await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(1200, 900), category: "AT_WORK" }, store, { fetchImpl: f });
    expect(r).toEqual({ status: "added", name: "accounts/1/locations/2/media/m1", verified: true });
    expect(calls.map((c) => `${c.method} ${c.url.replace("https://mybusiness.googleapis.com", "")}`)).toEqual([
      "POST /v4/accounts/1/locations/2/media:startUpload",
      "POST /upload/v1/media/ref-1?upload_type=media",
      "POST /v4/accounts/1/locations/2/media",
      "GET /v4/accounts/1/locations/2/media/m1",
    ]);
    const sent = calls[1].body as Uint8Array;
    expect(hasImageMetadata(sent)).toBe(false);
    expect(JSON.parse(calls[2].body as string)).toEqual({ mediaFormat: "PHOTO", locationAssociation: { category: "AT_WORK" }, dataRef: { resourceName: "ref-1" } });
    // No image stored: only the media name and the category.
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].after_value as string)).toEqual({ name: "accounts/1/locations/2/media/m1", category: "AT_WORK" });
    expect(JSON.stringify(rows).length).toBeLessThan(800);
    expect(rows[0]).toMatchObject({ kind: "photos", field: "media", status: "sent", before_value: null });
    expect(logs).toEqual([expect.objectContaining({ field: "photos", action: "edit", outcome: "ok" })]);
  });

  test("too small, or an 11th photo: refused before any Google call", async () => {
    const { store } = memoryStore();
    const { f, calls } = googleMock();
    expect(await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(600, 600), category: "INTERIOR" }, store, { fetchImpl: f })).toEqual({ status: "invalid", problem: "too_small_size" });
    for (let i = 0; i < 10; i++) await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(1200, 900), category: "INTERIOR" }, store, { fetchImpl: f });
    const before = calls.length;
    expect(await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(1200, 900), category: "INTERIOR" }, store, { fetchImpl: f })).toEqual({ status: "invalid", problem: "too_many" });
    expect(calls.length).toBe(before);
  });

  test("a failed create marks the row failed (nothing else kept)", async () => {
    const { store, rows } = memoryStore();
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith(":startUpload")) return new Response(JSON.stringify({ resourceName: "ref-1" }));
      if (url.includes("/upload/")) return new Response("{}");
      return new Response(JSON.stringify({ error: { status: "PERMISSION_DENIED" } }), { status: init?.method === "POST" ? 403 : 404 });
    }) as typeof fetch;
    expect(await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(1200, 900), category: "INTERIOR" }, store, { fetchImpl: f })).toEqual({ status: "error", error: "permission" });
    expect(rows[0].status).toBe("failed");
  });

  test("Undo deletes each media item of the batch (only this listing's)", async () => {
    const { store, rows } = memoryStore();
    const { f, calls } = googleMock();
    await uploadPhoto(TARGET, { batchId: BATCH, bytes: jpeg(1200, 900), category: "INTERIOR" }, store, { fetchImpl: f });
    rows.push({ id: "x", batch_id: BATCH, after_value: JSON.stringify({ name: "accounts/9/locations/9/media/other", category: "INTERIOR" }), approved_at: rows[0].approved_at, status: "sent", undone_at: null });
    expect(latestPhotoUndo(rows, Date.now())).toMatchObject({ batchId: BATCH, count: 2 });
    calls.length = 0;
    expect(await undoPhotos(TARGET, BATCH, store, { fetchImpl: f })).toEqual({ status: "undone", deleted: 1 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE https://mybusiness.googleapis.com/v4/accounts/1/locations/2/media/m1"]);
    expect(rows.every((r) => r.undone_at)).toBe(true);
    expect(await undoPhotos(TARGET, BATCH, store, { fetchImpl: f, now: Date.now() + 8 * 86_400_000 })).toEqual({ status: "error", error: "undo_expired" });
  });

  test("practice mode: the fake answers, Google is never called", async () => {
    const real = vi.spyOn(globalThis, "fetch");
    const { store, rows } = memoryStore();
    const r = await uploadPhoto({ ...TARGET, parent: PRACTICE_PHOTO_PARENT }, { batchId: BATCH, bytes: jpeg(1200, 900), category: "TEAMS" }, store, { fetchImpl: practicePhotoFetch("b1"), practice: true });
    expect(r).toMatchObject({ status: "added", verified: true });
    expect(rows[0].kind).toBe("photos_practice");
    expect(await undoPhotos({ ...TARGET, parent: PRACTICE_PHOTO_PARENT }, BATCH, store, { fetchImpl: practicePhotoFetch("b1"), practice: true })).toEqual({ status: "undone", deleted: 1 });
    expect(real).not.toHaveBeenCalled();
  });
});

describe("read-only places", () => {
  test("the upload route refuses before any Google call", async () => {
    ctx.canEdit = false;
    const { POST } = await import("@/app/api/gbp/photos/route");
    const form = new FormData();
    form.set("businessId", "b1");
    form.set("batchId", BATCH);
    form.set("category", "INTERIOR");
    form.set("photo", new Blob([jpeg(1200, 900) as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), "p.jpg");
    const res = await POST(new Request("http://localhost/api/gbp/photos", { method: "POST", body: form }) as never);
    expect(await res.json()).toEqual({ status: "editing_off" });
  });

  test("the panel shows the Business Profile link and the 3 steps", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <PhotoUpload businessId="b1" initial={{ status: "ok", canEdit: false, practice: false, undo: null, nicheId: "hair_salon" }} />
      </LocaleProvider>
    );
    expect(html).toContain('data-testid="photos-on-google"');
    expect(html).toContain("Tap Photos");
    expect(html).toContain("Pick the type (Interior, Exterior, At work, Team…)");
    expect(html).toContain("https://business.google.com/");
  });

  test("writes allowed: the picker, the tips and the salon's best types", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en" timeZone="America/New_York">
        <PhotoUpload businessId="b1" initial={{ status: "ok", canEdit: true, practice: false, undo: null, nicheId: "hair_salon" }} />
      </LocaleProvider>
    );
    expect(html).toContain('data-testid="photo-drop"');
    expect(html).toContain("No stock photos, text overlays or logos.");
    expect(html).toContain("Best types for your business: Interior, At work, Team, Product");
  });
});
