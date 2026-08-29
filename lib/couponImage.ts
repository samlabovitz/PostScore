// Renders the live coupon preview to a downloadable PNG via a plain
// <canvas> — browser-only (uses document/Image/canvas), so this must
// only ever be called from a "use client" component, never during SSR.
// Colors are the app's real theme tokens (app/globals.css) hard-coded
// as hex, since a canvas 2D context can't read CSS variables. Layout
// mirrors the live CouponPreview component exactly — same fields, same
// order — so the downloaded image never shows anything the on-screen
// preview didn't.

const COLOR_INK = "#14243f";
const COLOR_INK_SOFT = "#3a4a66";
const COLOR_INK_MUTE = "#6b7890";
const COLOR_BRASS = "#b8862f";
const COLOR_RED = "#b23a2f";
const COLOR_PAPER = "#f5f1e8";
const COLOR_PAPER_DEEP = "#eae4d5";

const WIDTH = 700;
const HEIGHT = 400;
const HEADER_HEIGHT = 64;
const QR_PANEL_WIDTH = 200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the QR code image."));
    img.src = src;
  });
}

/** Wraps `text` onto multiple lines no wider than `maxWidth`, returning
 * how many lines it drew (so callers can add space after it). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.split(/\s+/);
  let line = "";
  let lineCount = 0;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      lineCount++;
      if (lineCount >= maxLines) return lineCount;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ctx.fillText(line, x, y + lineCount * lineHeight);
    lineCount++;
  }
  return lineCount;
}

export interface CouponPngOptions {
  businessName: string;
  offer: string;
  instructions: string;
  code: string;
  expiryLabel: string;
  qrDataUrl: string;
  terms?: string;
}

/** Draws the coupon (business name, offer, instructions, code, expiry,
 * terms, and the real QR code) onto a canvas and returns a PNG data
 * URL — a literal pixel export of the same data shown in the live
 * preview, nothing invented for the image that isn't in the form. */
export async function renderCouponPng(opts: CouponPngOptions): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  // Card background + border.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = COLOR_PAPER_DEEP;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);

  // Dark header band: business name + "EXCLUSIVE OFFER" eyebrow.
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText(opts.businessName, 32, 34);
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillText("EXCLUSIVE OFFER", 32, 52);

  const leftPad = 32;
  const leftWidth = WIDTH - QR_PANEL_WIDTH - leftPad - 24;
  let y = HEADER_HEIGHT + 40;

  // Offer headline.
  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 28px Georgia, 'Times New Roman', serif";
  const offerLines = wrapText(ctx, opts.offer, leftPad, y, leftWidth, 34, 2);
  y += offerLines * 34 + 12;

  // Instructions.
  if (opts.instructions) {
    ctx.fillStyle = COLOR_INK_SOFT;
    ctx.font = "400 13px Arial, sans-serif";
    const instLines = wrapText(ctx, opts.instructions, leftPad, y, leftWidth, 17, 2);
    y += instLines * 17 + 14;
  }

  // Code chip.
  const chipWidth = 150;
  const chipHeight = 44;
  ctx.fillStyle = "#faf6ec";
  ctx.strokeStyle = COLOR_BRASS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(leftPad, y, chipWidth, chipHeight, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 9px Arial, sans-serif";
  ctx.fillText("CODE", leftPad + 10, y + 16);
  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 15px 'Courier New', monospace";
  ctx.fillText(opts.code, leftPad + 10, y + 34);
  y += chipHeight + 20;

  // Expiry, in red for urgency (matches the live preview).
  ctx.fillStyle = COLOR_RED;
  ctx.font = "700 13px Arial, sans-serif";
  ctx.fillText(opts.expiryLabel, leftPad, y);
  y += 20;

  // Terms, if any.
  if (opts.terms) {
    ctx.fillStyle = COLOR_INK_MUTE;
    ctx.font = "400 11px Arial, sans-serif";
    wrapText(ctx, opts.terms, leftPad, y, leftWidth, 15, 2);
  }

  // Perforation line between offer and QR panel.
  const dividerX = WIDTH - QR_PANEL_WIDTH;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = COLOR_PAPER_DEEP;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dividerX, HEADER_HEIGHT);
  ctx.lineTo(dividerX, HEIGHT);
  ctx.stroke();
  ctx.setLineDash([]);

  // QR panel background.
  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(dividerX, HEADER_HEIGHT, QR_PANEL_WIDTH, HEIGHT - HEADER_HEIGHT);

  // QR code.
  const qrImg = await loadImage(opts.qrDataUrl);
  const qrSize = 140;
  const qrX = dividerX + QR_PANEL_WIDTH / 2 - qrSize / 2;
  const qrY = HEADER_HEIGHT + 36;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.textAlign = "center";
  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "400 11px Arial, sans-serif";
  ctx.fillText("Scan to redeem", dividerX + QR_PANEL_WIDTH / 2, qrY + qrSize + 24);

  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "700 10px Arial, sans-serif";
  ctx.fillText("POSTSCORE", dividerX + QR_PANEL_WIDTH / 2, qrY + qrSize + 46);

  return canvas.toDataURL("image/png");
}

/** Triggers a real browser download of a data URL — a plain temporary
 * `<a download>` click, no server round-trip. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
