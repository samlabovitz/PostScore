// The review sign's layout, in PDF points (72 per inch, y down). One
// layout feeds the live preview (SVG), and the PDF the server builds, so
// they match. Pure: text is measured through a Measurer backed by the
// same font files the PDF embeds.

import { starPath } from "@/lib/reviewQr";
import { mixColor, printable, wrap, type FontRole, type Measurer, type PrintPage, type SignElement } from "@/lib/signStudio/elements";
import { qrInk } from "@/lib/signStudio/design";

export type { FontRole, Measurer, SignElement, SignPanel, PrintPage } from "@/lib/signStudio/elements";
export { printable, wrap } from "@/lib/signStudio/elements";
import {
  CUSTOM_HEADLINE_MAX,
  FOLLOW_US,
  FOOTER,
  HEADLINES,
  MADE_WITH,
  MIN_QR_POINTS,
  ON_GOOGLE,
  SUBLINE_MAX,
  contrastRatio,
  designColors,
  ratingAllowed,
  type SignColors,
  type SignContent,
  type SignDesign,
  type SignSize,
} from "@/lib/signStudio/design";

export interface SignLayout extends PrintPage {
  /** The QR's printed width in points (the same on every panel). */
  qrPoints: number;
}

export interface LayoutInput {
  design: SignDesign;
  content: SignContent;
  /** Grow signs: a tiny "Made with PostScore". */
  credit: boolean;
  /** The owner's logo (aspect = width / height), when one is added. */
  logo: { aspect: number } | null;
}

export const PAGE_POINTS: Record<SignSize, [number, number]> = {
  tent: [612, 792],
  card4x6: [288, 432],
  card5x7: [360, 504],
  letter: [612, 792],
  cards4: [612, 792],
};

const TEXT_SCALE = { small: 0.88, medium: 1, large: 1.14 } as const;
const TILE = 1.14; // tile width / QR width

// ---- Text helpers ----

interface Block {
  lines: string[];
  role: FontRole;
  size: number;
  lineHeight: number;
  gapAfter: number;
  /** "band" text sits on the banner in reversed colors. */
  band: boolean;
}

interface RatingLine {
  number: string;
  rest: string;
  size: number;
}

interface TextSet {
  top: Block[];
  rating: RatingLine | null;
  bottom: Block[];
  footer: Block;
}

function languages(design: SignDesign): Array<"en" | "es"> {
  return design.language === "both" ? ["en", "es"] : [design.language];
}

function blockHeight(b: Block): number {
  return b.lines.length * b.lineHeight;
}

function setHeight(blocks: Block[]): number {
  return blocks.reduce((s, b) => s + blockHeight(b) + b.gapAfter, 0);
}

/** The sign's text at scale f, wrapped to `width`; null if it won't fit. */
function buildText(input: LayoutInput, m: Measurer, width: number, base: number, f: number): TextSet | null {
  const { design, content } = input;
  const langs = languages(design);
  const banner = design.template === "banner";
  const top: Block[] = [];
  const bottom: Block[] = [];
  const push = (list: Block[], text: string, role: FontRole, size: number, maxLines: number, band = false, gap = 0.6) => {
    const clean = printable(text, m, role);
    if (!clean) return true;
    const lines = wrap(clean, m, role, size, width, maxLines);
    if (!lines) return false;
    list.push({ lines, role, size, lineHeight: size * 1.18, gapAfter: size * gap, band });
    return true;
  };

  const headScale = design.template === "minimal" ? 0.8 : 1;
  if (design.showName && content.businessName && !push(top, content.businessName.toUpperCase(), "bodyBold", base * 0.42 * f, 2, banner, 0.8)) return null;
  const headlines =
    design.headline === "custom"
      ? [design.customHeadline.slice(0, CUSTOM_HEADLINE_MAX).trim() || HEADLINES.loved[langs[0]]]
      : langs.map((l) => HEADLINES[design.headline as keyof typeof HEADLINES][l]);
  for (let i = 0; i < headlines.length; i++) {
    const primary = i === 0;
    if (!push(top, headlines[i], primary ? "headline" : "body", base * (primary ? 1 : 0.5) * headScale * f, primary ? 3 : 2, banner, primary ? 0.45 : 0.6)) return null;
  }
  if (design.subline.trim() && !push(bottom, design.subline.slice(0, SUBLINE_MAX), "body", base * 0.42 * f, 2)) return null;

  let rating: RatingLine | null = null;
  if (design.showRating && ratingAllowed(content.rating, content.reviewCount)) {
    const n = content.rating.toFixed(1);
    rating = { number: langs[0] === "es" ? n.replace(".", ",") : n, rest: langs.map((l) => ON_GOOGLE[l]).join(" · "), size: base * 0.45 * f };
  }

  const follow = design.follow ? content.verifiedSocials.find((s) => s.url === design.follow) : null;
  if (follow && !push(bottom, `${langs.map((l) => FOLLOW_US[l]).join(" / ")} · ${follow.url}`, "body", base * 0.36 * f, 2)) return null;

  const footerSize = Math.max(7.5, base * 0.32 * Math.max(f, 0.85));
  const footerLines = langs.map((l) => FOOTER[l]);
  const fs = footerLines.some((l) => m.width(l, "body", footerSize) > width) ? footerSize * 0.85 : footerSize;
  const footer: Block = { lines: footerLines, role: "body", size: fs, lineHeight: fs * 1.35, gapAfter: 0, band: false };
  return { top, rating, bottom, footer };
}

// ---- Drawing helpers ----

interface Ctx {
  els: SignElement[];
  m: Measurer;
  colors: SignColors;
  align: "middle" | "start";
}

function emitBlock(ctx: Ctx, b: Block, colX: number, colW: number, top: number, color: string): number {
  let y = top;
  for (const line of b.lines) {
    y += b.lineHeight;
    const w = ctx.m.width(line, b.role, b.size);
    const x = ctx.align === "middle" ? colX + (colW - w) / 2 : colX;
    ctx.els.push({ kind: "text", x, y: y - b.lineHeight * 0.24, text: line, size: b.size, role: b.role, color });
  }
  return y + b.gapAfter;
}

function blockColor(ctx: Ctx, b: Block): string {
  if (b.band) return ctx.colors.background;
  return b.role === "bodyBold" ? ctx.colors.accent : ctx.colors.text;
}

function emitRating(ctx: Ctx, r: RatingLine, colX: number, colW: number, top: number): number {
  const starW = r.size * 0.95;
  const wNum = ctx.m.width(r.number, "bodyBold", r.size);
  const rest = ` ${r.rest}`;
  const wRest = ctx.m.width(rest, "body", r.size);
  const total = wNum + r.size * 0.12 + starW + wRest;
  let x = ctx.align === "middle" ? colX + (colW - total) / 2 : colX;
  const baseline = top + r.size;
  ctx.els.push({ kind: "text", x, y: baseline, text: r.number, size: r.size, role: "bodyBold", color: ctx.colors.text });
  x += wNum + r.size * 0.12;
  ctx.els.push({ kind: "path", d: starPath(x + starW / 2, baseline - r.size * 0.36, starW / 2, starW * 0.21), fill: ctx.colors.accent });
  x += starW;
  ctx.els.push({ kind: "text", x, y: baseline, text: rest, size: r.size, role: "body", color: ctx.colors.text });
  return top + r.size * 1.45;
}

function ratingHeight(r: RatingLine | null): number {
  return r ? r.size * 1.45 : 0;
}

function cornerRadius(design: SignDesign, w: number, h: number): number {
  const d = Math.min(w, h);
  return design.radius === "large" ? d * 0.05 : design.radius === "small" ? d * 0.02 : 0;
}

/** Background, pattern, border and (Framed) frame; returns the inset the
 * content should keep. */
function decorate(ctx: Ctx, design: SignDesign, w: number, h: number, pad: number): number {
  const { colors } = ctx;
  ctx.els.push({ kind: "rect", x: 0, y: 0, w, h, r: 0, fill: colors.background, stroke: null, strokeWidth: 0 });
  if (design.background === "pattern") {
    const step = Math.min(w, h) * 0.045;
    const r = step * 0.09;
    let d = "";
    for (let y = step / 2; y < h; y += step)
      for (let x = (Math.round(y / step) % 2 ? step : step / 2); x < w; x += step)
        d += `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(-2 * r).toFixed(2)} 0Z`;
    ctx.els.push({ kind: "path", d, fill: mixColor(colors.background, colors.accent, 0.2) });
  }
  const radius = cornerRadius(design, w, h);
  let inset = pad;
  if (design.template === "framed") {
    const fw = Math.min(w, h) * 0.022;
    const fi = pad * 0.32;
    ctx.els.push({ kind: "rect", x: fi + fw / 2, y: fi + fw / 2, w: w - 2 * fi - fw, h: h - 2 * fi - fw, r: radius, fill: null, stroke: colors.accent, strokeWidth: fw });
    inset = pad * 1.2;
  }
  const bi = design.template === "framed" ? pad * 0.32 + Math.min(w, h) * 0.022 + 4 : pad * 0.42;
  if (design.border === "thin") ctx.els.push({ kind: "rect", x: bi, y: bi, w: w - 2 * bi, h: h - 2 * bi, r: radius, fill: null, stroke: colors.text, strokeWidth: 0.9 });
  if (design.border === "double") {
    ctx.els.push({ kind: "rect", x: bi, y: bi, w: w - 2 * bi, h: h - 2 * bi, r: radius, fill: null, stroke: colors.text, strokeWidth: 1.6 });
    ctx.els.push({ kind: "rect", x: bi + 4, y: bi + 4, w: w - 2 * bi - 8, h: h - 2 * bi - 8, r: Math.max(0, radius - 4), fill: null, stroke: colors.text, strokeWidth: 0.6 });
  }
  if (design.border === "rounded") {
    ctx.els.push({ kind: "rect", x: bi, y: bi, w: w - 2 * bi, h: h - 2 * bi, r: Math.max(radius, Math.min(w, h) * 0.05), fill: null, stroke: colors.text, strokeWidth: 1.4 });
  }
  return inset;
}

function emitQrTile(ctx: Ctx, design: SignDesign, x: number, y: number, qr: number, panelMin: number): void {
  const pad = qr * 0.07;
  // On a white sign the tile gets a hairline so it still reads as a tile.
  const stroke = contrastRatio(ctx.colors.background, "#ffffff") < 1.15 ? ctx.colors.text : null;
  const r = Math.max(cornerRadius(design, panelMin, panelMin) * 0.8, design.radius === "none" ? 0 : pad * 0.8);
  ctx.els.push({ kind: "rect", x, y, w: qr + 2 * pad, h: qr + 2 * pad, r, fill: "#ffffff", stroke, strokeWidth: 0.8 });
  const ink = qrInk(ctx.colors);
  ctx.els.push({ kind: "qr", x: x + pad, y: y + pad, size: qr, qr: "main", ink, star: design.theme === "clean" ? ink : "#b8862f" });
}

function logoBox(input: LayoutInput, colW: number, base: number): { w: number; h: number } | null {
  if (!input.logo || !input.design.logoTop) return null;
  let h = base * 1.5;
  let w = h * input.logo.aspect;
  if (w > colW * 0.6) {
    w = colW * 0.6;
    h = w / input.logo.aspect;
  }
  return { w, h };
}

function emitCredit(ctx: Ctx, w: number, h: number, inset: number): void {
  const size = 5.5;
  const tw = ctx.m.width(MADE_WITH, "body", size);
  ctx.els.push({ kind: "text", x: (w - tw) / 2, y: h - Math.max(6, inset * 0.18), text: MADE_WITH, size, role: "body", color: ctx.colors.text });
}

// ---- Panels ----

interface PanelResult {
  elements: SignElement[];
  qr: number;
}

/** Text above, QR below, footer at the bottom (portrait panels). */
function stackPanel(input: LayoutInput, m: Measurer, w: number, h: number): PanelResult | null {
  const { design } = input;
  const pad = w * 0.09;
  const base = Math.min(Math.max(w * 0.08, 18), 46) * TEXT_SCALE[design.textSize];
  const align = design.template === "split" ? "start" : "middle";
  for (let f = 1; f >= 0.35; f -= 0.05) {
    const ctx: Ctx = { els: [], m, colors: designColors(design), align };
    const inset = decorate(ctx, design, w, h, pad);
    const colX = inset;
    const colW = w - 2 * inset;
    const text = buildText(input, m, colW - (design.template === "banner" ? pad * 0.5 : 0), base, f);
    if (!text) continue;
    const logo = logoBox(input, colW, base * f);
    const bandPad = design.template === "banner" ? base * 0.45 * f : 0;
    const topH = (logo ? logo.h + base * 0.35 * f : 0) + setHeight(text.top) + 2 * bandPad;
    const midH = setHeight(text.bottom) + ratingHeight(text.rating);
    const footerH = blockHeight(text.footer) + (input.credit ? 8 : 0);
    const gap = base * 0.45;
    const room = h - 2 * inset - topH - midH - footerH - 2 * gap;
    const qrCap = design.template === "minimal" ? 0.62 : 0.55;
    const qr = Math.min(room / TILE, (colW * 0.86) / TILE, w * qrCap);
    if (qr < MIN_QR_POINTS) continue;

    const used = topH + midH + gap + qr * TILE;
    let y = inset + Math.max(0, (h - 2 * inset - footerH - gap - used) / 2);
    if (design.template === "banner") {
      // The banner runs edge to edge across the top in the text color.
      y = inset * 0.6;
      ctx.els.push({ kind: "rect", x: inset * 0.6, y, w: w - inset * 1.2, h: topH, r: cornerRadius(design, w, h), fill: ctx.colors.text, stroke: null, strokeWidth: 0 });
      y += bandPad;
    }
    if (logo) {
      const lx = align === "middle" ? colX + (colW - logo.w) / 2 : colX;
      ctx.els.push({ kind: "logo", x: lx, y, w: logo.w, h: logo.h });
      y += logo.h + base * 0.35 * f;
    }
    for (const b of text.top) y = emitBlock(ctx, b, colX, colW, y, blockColor(ctx, b));
    y += bandPad;
    if (design.template === "banner") y += gap;
    for (const b of text.bottom) y = emitBlock(ctx, b, colX, colW, y, blockColor(ctx, b));
    if (text.rating) y = emitRating(ctx, text.rating, colX, colW, y);
    y += gap * (design.template === "banner" ? 0 : 1);
    const qrX = align === "middle" ? (w - qr * TILE) / 2 : colX;
    const remaining = h - inset - footerH - gap - y;
    emitQrTile(ctx, design, qrX, y + Math.max(0, (remaining - qr * TILE) / 2), qr, Math.min(w, h));
    emitBlock(ctx, text.footer, colX, colW, h - inset - footerH, ctx.colors.text);
    if (input.credit) emitCredit(ctx, w, h, inset);
    return { elements: ctx.els, qr };
  }
  return null;
}

/** Text in a column, QR beside it (landscape panels; Split when wide). */
function sidePanel(input: LayoutInput, m: Measurer, w: number, h: number): PanelResult | null {
  const { design } = input;
  const pad = h * 0.1;
  const base = Math.min(Math.max(h * 0.085, 18), 36) * TEXT_SCALE[design.textSize];
  const align = design.template === "split" ? "start" : "middle";
  const bandOn = design.template === "banner";
  for (let shrink = 1; shrink >= 0.4; shrink -= 0.12) {
    for (let f = 1; f >= 0.45; f -= 0.06) {
      const ctx: Ctx = { els: [], m, colors: designColors(design), align };
      const inset = decorate(ctx, design, w, h, pad);
      const fullW = w - 2 * inset;
      // Banner: the name + headline run across the top; the rest below.
      const text = buildText(input, m, fullW * (bandOn ? 0.92 : 1), base, f);
      if (!text) continue;
      const bandPad = bandOn ? base * 0.35 * f : 0;
      const bandH = bandOn ? setHeight(text.top) + 2 * bandPad : 0;
      const areaTop = inset + (bandOn ? bandH + pad * 0.3 : 0);
      const areaH = h - inset - areaTop - (input.credit ? 6 : 0);
      const maxQr = Math.min(areaH / TILE, (fullW * 0.42) / TILE) * shrink;
      const qr = Math.max(maxQr, 0);
      if (qr < MIN_QR_POINTS) continue; // a tall banner: try smaller text
      const tile = qr * TILE;
      const colW = fullW - tile - pad;
      if (colW < fullW * 0.3) continue;
      const colText = buildText(input, m, colW, base, f);
      if (!colText) continue;
      const logo = logoBox(input, colW, base * f);
      const colBlocks = bandOn ? colText.bottom : [...colText.top, ...colText.bottom];
      const colH =
        (logo ? logo.h + base * 0.35 * f : 0) + setHeight(colBlocks) + ratingHeight(colText.rating) + base * 0.4 + blockHeight(colText.footer);
      if (colH > areaH) continue;
      if (bandOn) {
        ctx.els.push({ kind: "rect", x: inset * 0.6, y: inset * 0.6, w: w - inset * 1.2, h: bandH + inset * 0.4, r: cornerRadius(design, w, h), fill: ctx.colors.text, stroke: null, strokeWidth: 0 });
        let by = inset + bandPad;
        const bandCtx: Ctx = { ...ctx, align: "middle" };
        for (const b of text.top) by = emitBlock(bandCtx, b, inset, fullW, by, blockColor(ctx, b));
      }
      let y = areaTop + (areaH - colH) / 2;
      if (logo) {
        const lx = align === "middle" ? inset + (colW - logo.w) / 2 : inset;
        ctx.els.push({ kind: "logo", x: lx, y, w: logo.w, h: logo.h });
        y += logo.h + base * 0.35 * f;
      }
      for (const b of colBlocks) y = emitBlock(ctx, b, inset, colW, y, blockColor(ctx, b));
      if (colText.rating) y = emitRating(ctx, colText.rating, inset, colW, y);
      emitBlock(ctx, colText.footer, inset, colW, y + base * 0.4, ctx.colors.text);
      emitQrTile(ctx, design, w - inset - tile, areaTop + (areaH - tile) / 2, qr, Math.min(w, h));
      if (input.credit) emitCredit(ctx, w, h, inset);
      return { elements: ctx.els, qr };
    }
  }
  return null;
}

function panelLayout(input: LayoutInput, m: Measurer, w: number, h: number): PanelResult {
  const landscape = w > h;
  const result =
    landscape || input.design.template === "split"
      ? sidePanel(input, m, w, h) ?? (landscape ? null : stackPanel(input, m, w, h))
      : stackPanel(input, m, w, h);
  if (!result) throw new Error("The sign layout could not fit a 1.5-inch QR code.");
  return result;
}

export function layoutSign(input: LayoutInput, m: Measurer): SignLayout {
  const [width, height] = PAGE_POINTS[input.design.size];
  const cut = (x1: number, y1: number, x2: number, y2: number): SignElement => ({ kind: "line", x1, y1, x2, y2, color: "#8a8f99", width: 0.6, dash: true });
  if (input.design.size === "tent") {
    // One letter page folded across the middle. Both halves have their
    // top at the fold; the upper half prints upside down so each side of
    // the standing tent reads the right way up.
    const half = height / 2;
    const panel = panelLayout(input, m, width, half);
    return {
      width,
      height,
      qrPoints: panel.qr,
      panels: [
        { x: 0, y: 0, w: width, h: half, rotate: 180, elements: panel.elements },
        { x: 0, y: half, w: width, h: half, rotate: 0, elements: panel.elements },
      ],
      marks: [cut(0, half, width, half)],
    };
  }
  if (input.design.size === "cards4") {
    // Four 4.25 × 5.5 in cards on one letter page, with cut lines.
    const cw = width / 2;
    const ch = height / 2;
    const panel = panelLayout(input, m, cw, ch);
    return {
      width,
      height,
      qrPoints: panel.qr,
      panels: [0, 1, 2, 3].map((i) => ({ x: (i % 2) * cw, y: Math.floor(i / 2) * ch, w: cw, h: ch, rotate: 0 as const, elements: panel.elements })),
      marks: [cut(cw, 0, cw, height), cut(0, ch, width, ch)],
    };
  }
  const panel = panelLayout(input, m, width, height);
  return { width, height, qrPoints: panel.qr, panels: [{ x: 0, y: 0, w: width, h: height, rotate: 0, elements: panel.elements }], marks: [] };
}
