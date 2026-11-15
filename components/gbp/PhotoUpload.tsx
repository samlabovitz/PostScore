"use client";

// "Add photos" (the Photos row, the Photos lever and section 5's photos
// idea all open this): pick or drop up to 10 JPG / PNG photos, each checked
// in the browser (10 KB–5 MB, at least 720×720), turned upright from its
// EXIF and re-encoded — which drops every bit of metadata, location
// included — with an optional square crop and a Google category. Preview →
// Approve → one upload per photo (app/api/gbp/photos/route.ts) → "Added ·
// Google is reviewing" → 7-day Undo. Off GOOGLE_WRITES_LIVE_PLACES: the
// link to the Business Profile and the steps there instead. Practice mode
// never sends anything to Google.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { finishPhotoBatch, openPhotoUpload, undoPhotosAction, type OpenPhotoUploadResult } from "@/app/actions/gbpPhotos";
import { MAX_PHOTOS, PHOTO_CATEGORIES, photoProblem, suggestedCategories, targetSize, type PhotoCategory, type PhotoProblem } from "@/lib/gbpPhotos";
import { ideaTypeOf } from "@/lib/listingIdeas";
import { formatShortDate, t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.photos.${key}` as MessageKey;
const GOOGLE_BUSINESS_URL = "https://business.google.com/";
const BTN = "inline-flex h-[30px] w-fit items-center rounded-lg border px-3 text-[12.5px] font-semibold disabled:opacity-60";

type Item = {
  id: string;
  name: string;
  source: File;
  problem: PhotoProblem | null;
  blob: Blob | null;
  url: string | null;
  square: boolean;
  category: PhotoCategory;
  state: "ready" | "uploading" | "added" | "failed";
  error?: string;
};

/** Upright (EXIF), optionally square, at most 3000 px, re-encoded as JPEG: no metadata survives. */
async function prepare(file: File, square: boolean): Promise<{ blob: Blob | null; problem: PhotoProblem | null }> {
  const first = photoProblem({ type: file.type, bytes: file.size, width: 1e9, height: 1e9 });
  if (first) return { blob: null, problem: first };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { blob: null, problem: "unreadable" };
  }
  const size = photoProblem({ type: file.type, bytes: file.size, width: bitmap.width, height: bitmap.height });
  if (size) return { blob: null, problem: size };
  const s = targetSize(bitmap.width, bitmap.height, square);
  const canvas = document.createElement("canvas");
  canvas.width = s.width;
  canvas.height = s.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { blob: null, problem: "unreadable" };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, s.width, s.height);
  ctx.drawImage(bitmap, s.sx, s.sy, s.sw, s.sh, 0, 0, s.width, s.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) return { blob: null, problem: "unreadable" };
  return { blob, problem: photoProblem({ type: "image/jpeg", bytes: blob.size, width: s.width, height: s.height }) };
}

/** Off the live list (or as a fallback): the Business Profile + 3 steps. */
export function PhotosOnGoogle() {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-1.5 text-[13px]" data-testid="photos-on-google">
      <p className="text-ink-soft">{t(locale, K("onGoogle.intro"))}</p>
      <ol className="list-decimal space-y-0.5 pl-5">
        <li>{t(locale, K("onGoogle.step1"))}</li>
        <li>{t(locale, K("onGoogle.step2"))}</li>
        <li>{t(locale, K("onGoogle.step3"))}</li>
      </ol>
      <a href={GOOGLE_BUSINESS_URL} target="_blank" rel="noopener noreferrer" className={cn(BTN, "border-ink bg-ink text-paper")}>
        {t(locale, K("onGoogle.button"))}
      </a>
    </div>
  );
}

export function PhotoUpload({ businessId, initial = null }: { businessId: string; initial?: OpenPhotoUploadResult | null }) {
  const locale = useLocale();
  const router = useRouter();
  const [view, setView] = useState<OpenPhotoUploadResult | null>(initial);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ key: string; tone: "ok" | "warn" | "bad"; params?: Record<string, string | number> } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initial) return;
    openPhotoUpload(businessId).then(setView, () => setView({ status: "error", error: "failed" }));
  }, [businessId, initial]);
  useEffect(() => () => items.forEach((i) => i.url && URL.revokeObjectURL(i.url)), [items]);
  if (!view) return <p className="text-[13px] text-ink-soft">{t(locale, K("loading"))}</p>;
  if (view.status !== "ok" || !view.canEdit) return <PhotosOnGoogle />;
  const suggested = suggestedCategories(ideaTypeOf(view.nicheId));

  async function add(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MAX_PHOTOS - items.length);
    const next: Item[] = [];
    for (const f of list) {
      const { blob, problem } = await prepare(f, false);
      next.push({ id: `${f.name}-${f.size}-${Math.random()}`, name: f.name, source: f, problem, blob, url: blob ? URL.createObjectURL(blob) : null, square: false, category: suggested[next.length % suggested.length] ?? "ADDITIONAL", state: "ready" });
    }
    setItems((cur) => [...cur, ...next].slice(0, MAX_PHOTOS));
    setMessage(Array.from(files).length + items.length > MAX_PHOTOS ? { key: "tooMany", tone: "warn", params: { count: MAX_PHOTOS } } : null);
  }
  async function toggleSquare(it: Item) {
    const { blob, problem } = await prepare(it.source, !it.square);
    if (it.url) URL.revokeObjectURL(it.url);
    setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, square: !x.square, blob, problem, url: blob ? URL.createObjectURL(blob) : null } : x)));
  }
  const ready = items.filter((i) => i.blob && !i.problem && i.state === "ready");

  async function approve() {
    setBusy(true);
    setMessage(null);
    const batchId = crypto.randomUUID();
    let added = 0;
    for (const it of ready) {
      setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: "uploading" } : x)));
      const form = new FormData();
      form.set("businessId", businessId);
      form.set("batchId", batchId);
      form.set("category", it.category);
      form.set("photo", it.blob!, "photo.jpg");
      const r = (await fetch("/api/gbp/photos", { method: "POST", body: form }).then((x) => x.json(), () => ({ status: "error", error: "failed" }))) as { status: string; error?: string; problem?: string };
      const ok = r.status === "added";
      if (ok) added++;
      setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, state: ok ? "added" : "failed", error: ok ? undefined : (r.problem ?? r.error ?? r.status) } : x)));
      // Stop at the first refusal that will refuse the rest too.
      if (!ok && (r.status === "editing_off" || r.error === "daily_cap" || r.error === "wait_minute" || r.error === "reconnect" || r.error === "not_enabled")) break;
    }
    const done = await finishPhotoBatch(businessId).catch(() => null);
    if (done?.status === "ok") setView({ ...view!, status: "ok", undo: done.undo } as OpenPhotoUploadResult);
    setBusy(false);
    setMessage(added > 0 ? { key: added === 1 ? "addedOne" : "added", tone: "ok", params: { count: added } } : { key: "failed", tone: "bad" });
    router.refresh();
  }
  async function undo() {
    if (view?.status !== "ok" || !view.undo) return;
    setBusy(true);
    const r = await undoPhotosAction(businessId, view.undo.batchId).catch(() => ({ status: "error", error: "failed" }) as const);
    setBusy(false);
    if (r.status === "undone") {
      setView({ ...view, undo: null });
      setMessage({ key: "undone", tone: "ok", params: { count: r.deleted } });
      router.refresh();
    } else setMessage({ key: "undoFailed", tone: "bad" });
  }

  return (
    <div className="flex flex-col gap-2.5" data-testid="photo-upload">
      {view.practice && <p className="text-[12px] text-amber">{t(locale, K("practice"))}</p>}
      <p className="text-[12.5px] text-ink-soft">{t(locale, K("tips"))}</p>
      <p className="text-[12px] text-ink-mute">{t(locale, K("suggested"), { list: suggested.map((c) => t(locale, K(`category.${c}`))).join(", ") })}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void add(e.dataTransfer.files);
        }}
        className={cn("flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-4 text-center text-[13px]", drag ? "border-brass bg-white" : "border-paper-deep")}
        data-testid="photo-drop"
      >
        <span className="text-ink-soft">{t(locale, K("drop"), { count: MAX_PHOTOS })}</span>
        <button type="button" onClick={() => input.current?.click()} disabled={busy || items.length >= MAX_PHOTOS} className={cn(BTN, "border-ink bg-white text-ink")}>
          {t(locale, K("pick"))}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => e.target.files && void add(e.target.files)} data-testid="photo-input" />
      </div>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-testid="photo-grid">
          {items.map((it) => (
            <li key={it.id} className="flex flex-col gap-1 rounded-lg border border-paper-deep bg-white p-1.5 text-[12px]" data-testid="photo-item">
              {it.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="" className={cn("w-full rounded object-cover", it.square ? "aspect-square" : "aspect-[4/3]")} />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded bg-paper px-1 text-center text-red">{it.name}</div>
              )}
              {it.problem ? (
                <p className="text-red" role="alert">
                  {t(locale, K(`problem.${it.problem}`))}
                </p>
              ) : (
                <>
                  <select value={it.category} disabled={it.state !== "ready"} onChange={(e) => setItems((cur) => cur.map((x) => (x.id === it.id ? { ...x, category: e.target.value as PhotoCategory } : x)))} className="rounded border border-paper-line bg-white px-1 py-0.5" aria-label={t(locale, K("type"))}>
                    {PHOTO_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(locale, K(`category.${c}`))}
                      </option>
                    ))}
                  </select>
                  {it.state === "ready" && (
                    <span className="flex justify-between gap-1">
                      <button type="button" onClick={() => void toggleSquare(it)} className="font-semibold underline underline-offset-2">
                        {t(locale, K(it.square ? "uncrop" : "crop"))}
                      </button>
                      <button type="button" onClick={() => setItems((cur) => cur.filter((x) => x.id !== it.id))} className="text-ink-mute underline underline-offset-2">
                        {t(locale, K("remove"))}
                      </button>
                    </span>
                  )}
                  {it.state === "uploading" && <span className="text-ink-mute">{t(locale, K("uploading"))}</span>}
                  {it.state === "added" && <span className="font-semibold text-green">{t(locale, K("reviewing"))}</span>}
                  {it.state === "failed" && <span className="text-red">{t(locale, K("notAdded"))}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {ready.length > 0 && (
        <button type="button" disabled={busy} onClick={approve} className={cn(BTN, "border-ink bg-ink text-paper")} data-testid="approve-photos">
          {busy ? t(locale, K("sending")) : t(locale, K(ready.length === 1 ? "approveOne" : "approve"), { count: ready.length })}
        </button>
      )}
      {message && (
        <p role="status" className={cn("text-[12.5px]", message.tone === "ok" ? "text-green" : message.tone === "warn" ? "text-amber" : "text-red")}>
          {t(locale, K(message.key), message.params)}
        </p>
      )}
      {view.undo && (
        <p className="text-[12.5px] text-ink-soft" data-testid="photo-undo">
          {t(locale, K(view.undo.count === 1 ? "undoLineOne" : "undoLine"), { count: view.undo.count, date: formatShortDate(view.undo.undoUntil, locale) })}{" "}
          <button type="button" disabled={busy} onClick={undo} className="font-semibold text-ink underline underline-offset-2">
            {t(locale, K("undo"))}
          </button>
        </p>
      )}
      <p className="text-[11.5px] text-ink-mute">{t(locale, K("privacy"))}</p>
    </div>
  );
}
