// Renders a downloadable front-desk sign PNG — business name, a plain
// call-to-action, and the real review-link QR code — via a plain
// <canvas>. Browser-only (uses document/Image/canvas), so this must
// only ever be called from a "use client" component, never during SSR.
// Same real theme-token colors and card dimensions as
// lib/couponImage.ts / lib/referralImage.ts, so all three feel like
// one system.

const COLOR_INK = "#14243f";
const COLOR_INK_SOFT = "#3a4a66";
const COLOR_INK_MUTE = "#6b7890";
const COLOR_BRASS = "#b8862f";
const COLOR_PAPER = "#f5f1e8";
const COLOR_PAPER_DEEP = "#eae4d5";

const WIDTH = 700;
const HEIGHT = 500;
const HEADER_HEIGHT = 64;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the QR code image."));
    img.src = src;
  });
}

export interface ReviewSignPngOptions {
  businessName: string;
  qrDataUrl: string;
}

/** Draws the front-desk review sign (business name, a plain
 * call-to-action, and the real QR code linking to the business's
 * actual Google "write a review" screen) onto a canvas and returns a
 * PNG data URL. Nothing on this image is invented — no star rating, no
 * example review, no claim this app collects or posts anything. */
export async function renderReviewSignPng(opts: ReviewSignPngOptions): Promise<string> {
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

  // Dark header band: business name + eyebrow.
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText(opts.businessName, 32, 34);
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillText("REVIEW US ON GOOGLE", 32, 52);

  ctx.textAlign = "center";
  const centerX = WIDTH / 2;

  // Headline.
  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 30px Georgia, 'Times New Roman', serif";
  ctx.fillText("Leave us a review", centerX, HEADER_HEIGHT + 56);

  ctx.fillStyle = COLOR_INK_SOFT;
  ctx.font = "400 15px Arial, sans-serif";
  ctx.fillText("Scan the code below — it takes about 30 seconds.", centerX, HEADER_HEIGHT + 86);

  // QR panel.
  const qrSize = 260;
  const qrPanelY = HEADER_HEIGHT + 108;
  const qrPanelHeight = qrSize + 48;
  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(0, qrPanelY, WIDTH, qrPanelHeight);

  const qrImg = await loadImage(opts.qrDataUrl);
  ctx.drawImage(qrImg, centerX - qrSize / 2, qrPanelY + 24, qrSize, qrSize);

  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "400 12px Arial, sans-serif";
  ctx.fillText("Thank you for helping others find us!", centerX, qrPanelY + qrPanelHeight - 8);

  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "700 10px Arial, sans-serif";
  ctx.fillText("POSTSCORE", centerX, HEIGHT - 20);

  return canvas.toDataURL("image/png");
}
