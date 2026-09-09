// Renders the Reports page's monthly recap card to a downloadable PNG,
// via the same plain-<canvas> approach as lib/couponImage.ts /
// lib/referralImage.ts — browser-only (uses document/Image/canvas), so
// this must only ever be called from a "use client" component, never
// during SSR. Colors are the app's real theme tokens (app/globals.css)
// hard-coded as hex, since a canvas 2D context can't read CSS variables.
// Every value drawn is exactly what the on-screen recap card shows —
// the real score delta and the real listing changes from
// diffProfileSnapshots, nothing invented for the image alone.

const COLOR_INK = "#14243f";
const COLOR_INK_SOFT = "#3a4a66";
const COLOR_INK_MUTE = "#6b7890";
const COLOR_BRASS = "#b8862f";
const COLOR_GREEN = "#2e6b45";
const COLOR_RED = "#b23a2f";
const COLOR_PAPER_DEEP = "#eae4d5";

const WIDTH = 700;
const HEIGHT = 420;
const HEADER_HEIGHT = 64;
const LEFT_PAD = 32;

/** Wraps `text` onto multiple lines no wider than `maxWidth`, returning
 * how many lines it drew (so callers can add space after it). Mirrors
 * the same helper in lib/couponImage.ts / lib/referralImage.ts. */
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

export interface RecapPngOptions {
  businessName: string;
  /** e.g. "Aug 12 – Sep 8, 2026 (27 days)" — the real gap between the two
   * scans this recap compares, never rounded up to "a month." */
  dateRangeLabel: string;
  fromScore: number;
  toScore: number;
  /** Up to a handful of real, plain-language listing changes from
   * diffProfileSnapshots — or an empty array, drawn as an honest "no
   * changes detected" line rather than left blank. */
  changes: string[];
}

/** Draws the recap (business name, real date range, real score delta,
 * real listing changes) onto a canvas and returns a PNG data URL — a
 * literal pixel export of the same data the on-screen card shows. */
export async function renderRecapPng(opts: RecapPngOptions): Promise<string> {
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

  // Dark header band: business name + "SCORE RECAP" eyebrow.
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(0, 0, WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.fillText(opts.businessName, LEFT_PAD, 34);
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillText("SCORE RECAP", LEFT_PAD, 52);

  let y = HEADER_HEIGHT + 34;

  // Real date range this recap compares.
  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "400 13px Arial, sans-serif";
  ctx.fillText(opts.dateRangeLabel, LEFT_PAD, y);
  y += 40;

  // Score delta headline: "73 → 77 (+4)".
  const delta = opts.toScore - opts.fromScore;
  const deltaLabel = delta > 0 ? `+${delta}` : delta === 0 ? "no change" : `${delta}`;
  const headlineText = `${opts.fromScore} → ${opts.toScore}`;
  ctx.fillStyle = COLOR_INK;
  ctx.font = "700 42px Georgia, 'Times New Roman', serif";
  ctx.fillText(headlineText, LEFT_PAD, y);
  const headlineWidth = ctx.measureText(headlineText).width;
  ctx.fillStyle = delta > 0 ? COLOR_GREEN : delta < 0 ? COLOR_RED : COLOR_INK_MUTE;
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillText(`(${deltaLabel})`, LEFT_PAD + headlineWidth + 16, y);
  y += 44;

  // Divider.
  ctx.strokeStyle = COLOR_PAPER_DEEP;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(LEFT_PAD, y);
  ctx.lineTo(WIDTH - LEFT_PAD, y);
  ctx.stroke();
  y += 30;

  // Real listing changes, or an honest "none detected" line.
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "600 11px Arial, sans-serif";
  ctx.fillText("WHAT CHANGED", LEFT_PAD, y);
  y += 24;

  const maxWidth = WIDTH - LEFT_PAD * 2;
  if (opts.changes.length === 0) {
    ctx.fillStyle = COLOR_INK_MUTE;
    ctx.font = "italic 400 14px Arial, sans-serif";
    ctx.fillText("No real-listing changes were detected in this period.", LEFT_PAD, y);
    y += 22;
  } else {
    ctx.fillStyle = COLOR_INK_SOFT;
    ctx.font = "400 14px Arial, sans-serif";
    for (const change of opts.changes.slice(0, 4)) {
      const lines = wrapText(ctx, `• ${change}`, LEFT_PAD, y, maxWidth, 19, 2);
      y += lines * 19 + 6;
    }
  }

  // Footer.
  ctx.fillStyle = COLOR_BRASS;
  ctx.font = "700 10px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("POSTSCORE", LEFT_PAD, HEIGHT - 22);
  ctx.fillStyle = COLOR_INK_MUTE;
  ctx.font = "400 10px Arial, sans-serif";
  ctx.fillText(
    `Generated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    LEFT_PAD,
    HEIGHT - 10
  );

  return canvas.toDataURL("image/png");
}
