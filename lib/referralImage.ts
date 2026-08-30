// Renders the live referral card preview to a downloadable PNG via a
// plain <canvas> — browser-only (uses document/Image/canvas), so this
// must only ever be called from a "use client" component, never during
// SSR. Mirrors lib/couponImage.ts: same real theme-token colors
// hard-coded as hex (a canvas 2D context can't read CSS variables),
// same card dimensions, and the same rule that the downloaded image
// never shows anything the on-screen preview didn't.

const COLOR_INK = "#14243f";
const COLOR_INK_MUTE = "#6b7890";
const COLOR_BRASS = "#b8862f";
const COLOR_PAPER = "#f5f1e8";
const COLOR_PAPER_DEEP = "#eae4d5";

const WIDTH = 700;
const HEIGHT = 400;
const HEADER_HEIGHT = 64;

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

function drawRewardBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  reward: string
) {
  ctx.fillStyle = COLOR_PAPER;
  ctx.strokeStyle = COLOR_PAPER_DEEP;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  const pad = 16;
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "600 10px Arial, sans-serif";
  ctx.fillText(label, x + pad, y + 22);

  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 19px Georgia, 'Times New Roman', serif";
  wrapText(ctx, reward || "Reward not set", x + pad, y + 48, width - pad * 2, 24, 3);
}

export interface ReferralPngOptions {
  businessName: string;
  referrerReward: string;
  friendReward: string;
  code: string;
}

/** Draws the referral card (business name, both rewards, and the
 * referral code) onto a canvas and returns a PNG data URL — a literal
 * pixel export of the same data shown in the live preview. */
export async function renderReferralPng(opts: ReferralPngOptions): Promise<string> {
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

  // Dark header band: business name + "REFER A FRIEND" eyebrow.
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText(opts.businessName, 32, 34);
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillText("REFER A FRIEND", 32, 52);

  // Two reward boxes, side by side.
  const pad = 32;
  const gap = 20;
  const boxWidth = (WIDTH - pad * 2 - gap) / 2;
  const boxY = HEADER_HEIGHT + 32;
  const boxHeight = 140;
  drawRewardBox(ctx, pad, boxY, boxWidth, boxHeight, "FOR YOU", opts.referrerReward);
  drawRewardBox(ctx, pad + boxWidth + gap, boxY, boxWidth, boxHeight, "FOR YOUR FRIEND", opts.friendReward);

  // Code chip.
  const chipY = boxY + boxHeight + 24;
  const chipWidth = 220;
  const chipHeight = 48;
  ctx.fillStyle = "#faf6ec";
  ctx.strokeStyle = COLOR_BRASS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(pad, chipY, chipWidth, chipHeight, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 9px Arial, sans-serif";
  ctx.fillText("REFERRAL CODE", pad + 12, chipY + 18);
  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 17px 'Courier New', monospace";
  ctx.fillText(opts.code, pad + 12, chipY + 38);

  // Tagline + brand mark.
  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "400 12px Arial, sans-serif";
  ctx.fillText("Give this code to a friend — they mention it on their first visit.", pad, chipY + chipHeight + 26);

  ctx.textAlign = "right";
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "700 10px Arial, sans-serif";
  ctx.fillText("POSTSCORE", WIDTH - pad, chipY + chipHeight + 26);

  return canvas.toDataURL("image/png");
}
