// Browser only: printout outputs (review sign, coupon / referral cards).
// The PDF always comes from the server (which re-checks the plan); the
// owner's logo is then drawn into the spots the server left for it, here
// on the device — the logo is never uploaded. Also: print (the same
// PDF), a single card as PNG, and the plain QR PNG.

import { downloadDataUrl } from "@/lib/download";
import { qrPngDataUrl, reviewQrGeometry, DEFAULT_QR_STYLE } from "@/lib/reviewQr";
import type { StoredLogo } from "@/lib/signStudio/design";
import type { LogoSlot } from "@/lib/signStudio/pdf";

export class SignRequestError extends Error {
  constructor(readonly reason: string) {
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
  for (const s of slots) {
    const page = doc.getPage(s.page ?? 0);
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

/** A printout PDF from the server (`endpoint` re-checks the plan), with
 * the logo drawn in. Errors carry the server's reason. */
export async function fetchPrintPdf(endpoint: string, body: Record<string, unknown>, logo: StoredLogo | null): Promise<Uint8Array> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, logo: logo ? { aspect: logo.width / logo.height } : null }),
  });
  if (!res.ok) {
    const reason = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
    throw new SignRequestError(reason ?? "failed");
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

/** The review sign PDF for `design`, with the logo drawn in. */
export function fetchSignPdf(businessId: string, design: unknown, logo: StoredLogo | null): Promise<Uint8Array> {
  return fetchPrintPdf(`/api/business/${encodeURIComponent(businessId)}/review-sign`, { design }, logo);
}

/** Draws a standalone SVG (fonts and images embedded) into a PNG. */
export async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not draw the card."));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(s);
}

export { downloadDataUrl };

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

export type PrintMode = "frame" | "tab";

/** How to print a PDF in this browser. Chromium (Chrome, Edge, Brave,
 * Opera on desktop/Android) prints a PDF loaded in a hidden frame. Safari,
 * Firefox and every iOS browser print a frame's empty page instead (the
 * "2 blank pages" bug), so they get the PDF in a new tab to print from.
 * Pure — exported for tests. */
export function printModeFor(userAgent: string): PrintMode {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || /CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  const chromium = /(Chrome|Chromium|Edg|OPR)\//.test(userAgent) && !/Firefox\//.test(userAgent);
  return chromium && !ios ? "frame" : "tab";
}

export interface PrintJob {
  mode: PrintMode;
  /** The tab opened at the click (tab mode); null if a pop-up blocker refused it. */
  tab: Window | null;
}

/** Call synchronously in the click handler — BEFORE awaiting the PDF —
 * so the browser allows the new tab (tab mode). */
export function startPrint(preparingText: string): PrintJob {
  const mode = printModeFor(navigator.userAgent);
  if (mode === "frame") return { mode, tab: null };
  const tab = window.open("", "_blank");
  try {
    if (tab) {
      tab.document.title = preparingText;
      tab.document.body.style.cssText = "font:15px -apple-system,system-ui,sans-serif;color:#14243f;padding:24px";
      tab.document.body.textContent = preparingText;
    }
  } catch {
    // Writing into the blank tab isn't essential.
  }
  return { mode, tab };
}

/** Prints exactly the downloaded PDF. Returns what the owner should be
 * told: nothing (the print dialog opened), the new-tab note, or that a
 * pop-up blocker stopped it. */
export function finishPrint(job: PrintJob, bytes: Uint8Array): "printing" | "tab" | "blocked" {
  const url = pdfUrl(bytes);
  if (job.mode === "tab") {
    if (!job.tab || job.tab.closed) {
      URL.revokeObjectURL(url);
      return "blocked";
    }
    job.tab.location.href = url;
    // The tab keeps the PDF; free the URL much later.
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
    return "tab";
  }
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
  return "printing";
}

/** If printing fails after the tab opened, close the "Preparing…" tab. */
export function cancelPrint(job: PrintJob): void {
  try {
    job.tab?.close();
  } catch {
    // Already gone.
  }
}

/** The plain code (rounded navy dots, brass star) as a PNG. */
export async function downloadQrPng(reviewUrl: string): Promise<void> {
  downloadDataUrl(await qrPngDataUrl(reviewQrGeometry(reviewUrl, DEFAULT_QR_STYLE)), "google-review-qr.png");
}
