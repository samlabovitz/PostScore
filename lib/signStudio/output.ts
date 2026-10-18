// Browser only: the sign's outputs. The PDF always comes from the server
// (which re-checks the plan); the owner's logo is then drawn into the
// spots the server left for it, here on the device — the logo is never
// uploaded. Also: print (the same PDF) and the plain QR PNG.

import { downloadDataUrl } from "@/lib/couponImage";
import { qrPngDataUrl, reviewQrGeometry, DEFAULT_QR_STYLE } from "@/lib/reviewQr";
import type { StoredLogo } from "@/lib/signStudio/design";
import type { LogoSlot } from "@/lib/signStudio/pdf";

export class SignRequestError extends Error {
  constructor(readonly reason: "plan_required" | "low_contrast" | "no_place_id" | "failed") {
    super(reason);
  }
}

/** A PNG/JPG/SVG logo as bytes pdf-lib can embed (SVG is drawn to PNG). */
async function logoImage(logo: StoredLogo): Promise<{ bytes: Uint8Array; png: boolean }> {
  if (logo.type !== "image/svg+xml") {
    const res = await fetch(logo.dataUrl);
    return { bytes: new Uint8Array(await res.arrayBuffer()), png: logo.type === "image/png" };
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read the logo."));
    img.src = logo.dataUrl;
  });
  const scale = 1200 / Math.max(logo.width, logo.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(logo.width * scale));
  canvas.height = Math.max(1, Math.round(logo.height * scale));
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const res = await fetch(canvas.toDataURL("image/png"));
  return { bytes: new Uint8Array(await res.arrayBuffer()), png: true };
}

async function stampLogo(pdf: Uint8Array, slots: LogoSlot[], logo: StoredLogo): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdf);
  const { bytes, png } = await logoImage(logo);
  const image = png ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  const page = doc.getPage(0);
  for (const s of slots) {
    // Fit inside the slot, keeping the logo's shape.
    const scale = Math.min(s.w / image.width, s.h / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const x = s.x + (s.w - w) / 2;
    const y = s.y + (s.h - h) / 2;
    if (s.rotate === 180) page.drawImage(image, { x: x + w, y: y + h, width: w, height: h, rotate: degrees(180) });
    else page.drawImage(image, { x, y, width: w, height: h });
  }
  return doc.save();
}

/** The sign PDF for `design` from the server, with the logo drawn in. */
export async function fetchSignPdf(businessId: string, design: unknown, logo: StoredLogo | null): Promise<Uint8Array> {
  const res = await fetch(`/api/business/${encodeURIComponent(businessId)}/review-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ design, logo: logo ? { aspect: logo.width / logo.height } : null }),
  });
  if (!res.ok) {
    const reason = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new SignRequestError(reason === "plan_required" || reason === "low_contrast" || reason === "no_place_id" ? reason : "failed");
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  let slots: LogoSlot[] = [];
  try {
    slots = JSON.parse(res.headers.get("X-Sign-Logo-Slots") ?? "[]") as LogoSlot[];
  } catch {
    slots = [];
  }
  return logo && slots.length > 0 ? stampLogo(bytes, slots, logo) : bytes;
}

function pdfUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = pdfUrl(bytes);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the print dialog with exactly that PDF (a hidden frame; a new
 * tab where the browser won't print from a frame). */
export function printPdf(bytes: Uint8Array): void {
  const url = pdfUrl(bytes);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(url, "_blank", "noopener");
    }
  };
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}

/** The plain code (rounded navy dots, brass star) as a PNG. */
export async function downloadQrPng(reviewUrl: string): Promise<void> {
  downloadDataUrl(await qrPngDataUrl(reviewQrGeometry(reviewUrl, DEFAULT_QR_STYLE)), "google-review-qr.png");
}
