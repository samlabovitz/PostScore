// The Reports page's square social image — offered only when there's
// real good news (see shareHeadline in lib/reports/reportPdf.ts): the
// score rose between two comparable scans, or the local rank improved.
// Plain <canvas>, browser-only ("use client" callers). Colors are the
// app's theme tokens (app/globals.css) as hex, since a canvas can't read
// CSS variables.

const INK = "#14243f";
const INK_MUTE = "#6b7890";
const BRASS = "#b8862f";
const PAPER = "#f5f1e8";
const PAPER_DEEP = "#eae4d5";

export const SHARE_SIZE = 1080;

export interface ShareImageOptions {
  /** e.g. "Modern Liquors' PostScore rose 66 → 71 this month". */
  headline: string;
  score: number;
  grade: string;
  gradeLabel: string;
  footer: string;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderShareImagePng(opts: ShareImageOptions): Promise<Blob> {
  const S = SHARE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  await document.fonts?.ready;
  const serif = "'Playfair Display', Georgia, 'Times New Roman', serif";
  const sans = "Inter, 'Helvetica Neue', Arial, sans-serif";

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = BRASS;
  ctx.fillRect(0, 0, S, 18);

  // Score ring.
  const cx = S / 2;
  const cy = 400;
  const r = 190;
  ctx.lineWidth = 34;
  ctx.lineCap = "round";
  ctx.strokeStyle = PAPER_DEEP;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = BRASS;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, opts.score))) / 100);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `700 150px ${serif}`;
  ctx.fillText(String(opts.score), cx, cy + 52);
  ctx.font = `600 34px ${sans}`;
  ctx.fillStyle = INK_MUTE;
  ctx.fillText(opts.gradeLabel, cx, cy + 108);

  // Headline.
  ctx.fillStyle = INK;
  ctx.font = `700 58px ${serif}`;
  const lines = wrapLines(ctx, opts.headline, S - 160).slice(0, 3);
  lines.forEach((line, i) => ctx.fillText(line, cx, 720 + i * 72));

  // Footer.
  ctx.fillStyle = BRASS;
  ctx.font = `700 30px ${sans}`;
  ctx.fillText("PostScore", cx, S - 96);
  ctx.fillStyle = INK_MUTE;
  ctx.font = `400 26px ${sans}`;
  ctx.fillText(opts.footer, cx, S - 56);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
