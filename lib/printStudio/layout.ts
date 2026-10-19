// Coupon / referral / loyalty card layout, in PDF points (y down), on US
// Letter sheets with cut lines — and, double-sided, a back page after
// each front page with every card mirrored left↔right, so a sheet
// printed "flip on long edge" lines up. Built from the shared print
// elements; the same pages feed the preview, the PNG and the PDF.
//
// Print quality rules:
// - one card shape (rounded corners / ticket notches) clips the
//   background, so nothing sticks out past the border;
// - the same padding on every side, and no text under 6 pt (fine print
//   5.5 pt) — optional lines drop before anything gets cramped;
// - coupons read business name → offer → how to redeem → code + expiry
//   → fine print, and the QR is never bigger than the offer;
// - the referral card's two halves carry equal weight and the same code.

import { qrInk } from "@/lib/signStudio/design";
import {
  insetShape,
  mixColor,
  printable,
  shapePath,
  wrap,
  type CardShape,
  type FontRole,
  type Measurer,
  type PrintPage,
  type SignElement,
  type SignPanel,
} from "@/lib/signStudio/elements";
import { starPath } from "@/lib/reviewQr";
import {
  CARD_SHEETS,
  CARD_WORDS,
  LETTER,
  cardColors,
  minQrPoints,
  type CardBusiness,
  type CardDesign,
  type QrDestination,
} from "@/lib/printStudio/design";
import { placeIcon } from "@/lib/printStudio/icons";

export const MADE_WITH = "Made with PostScore";
/** The smallest text printed on any card, in points. */
export const MIN_TEXT = 6;
export const MIN_FINE_TEXT = 5.5;
const TILE = 1.14;
const TEXT_SCALE = { small: 0.88, medium: 1, large: 1.14 } as const;
const SPACING = { tight: -0.02, normal: 0, wide: 0.08 } as const;

export interface CardLayoutInput {
  design: CardDesign;
  business: CardBusiness;
  credit: boolean;
  logo: { aspect: number } | null;
  /** Whether each QR destination resolves to a real link (no link → no code). */
  hasQr: (dest: QrDestination) => boolean;
}

export interface CardSheets {
  pages: PrintPage[];
  /** Front pages are even indexes; with double-sided, odd ones are backs. */
  doubleSided: boolean;
  /** The smallest printed QR on any card, in points (null: no QR). */
  qrPoints: number | null;
  cardsPerPage: number;
  cardCount: number;
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Optional blocks drop in this order when space is short. */
const DROP_HOWTO = 1;
const DROP_FINE = 2;
const DROP_EXTRA = 3;
/** Last resort (e.g. bilingual wallet referral cards): the friend half's
 * expiry — it still prints on the "For you" half. */
const DROP_LAST = 4;

type Block = { gap?: number; optional?: number } & (
  | { kind: "text"; text: string; role: FontRole; rel: number; color: "text" | "accent"; maxLines: number; upper?: boolean; italic?: boolean; spacing?: number; fine?: boolean; offer?: boolean }
  | { kind: "rule" }
  | { kind: "writeIn"; label: string }
  | { kind: "punches"; count: number }
  | { kind: "qr"; name: string; size: number }
);

function lang(d: CardDesign): Array<"en" | "es"> {
  return d.language === "both" ? ["en", "es"] : [d.language];
}

function word(d: CardDesign, key: keyof typeof CARD_WORDS): string {
  return lang(d)
    .map((l) => CARD_WORDS[key][l])
    .join(" / ");
}

export function formatExpiration(iso: string, d: CardDesign): string {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return "";
  const date = new Intl.DateTimeFormat(d.language === "es" ? "es-US" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
  return `${word(d, "validUntil")} ${date}`;
}

export function serialLabel(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

// ---- Card shape and frame ----

export function cardShape(d: CardDesign, w: number, h: number): CardShape {
  const unit = Math.min(w, h);
  const e = Math.max(1.5, unit * 0.025);
  return {
    x: e,
    y: e,
    w: w - 2 * e,
    h: h - 2 * e,
    r: d.corners === "rounded" ? unit * 0.06 : d.corners === "notch" ? unit * 0.02 : 0,
    notch: d.corners === "notch" ? unit * 0.075 : 0,
  };
}

/** The same padding on every side: inside the shape and its border. */
function padding(d: CardDesign, w: number, h: number): number {
  const unit = Math.min(w, h);
  return Math.max(9, cardShape(d, w, h).x + unit * (d.border === "none" ? 0.055 : 0.07));
}

function seeded(n: number): () => number {
  let s = n;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function dot(x: number, y: number, r: number): string {
  return `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 1 ${(-2 * r).toFixed(2)} 0Z`;
}

/** Background (clipped to the card shape by the panel), pattern, border. */
function frame(d: CardDesign, w: number, h: number, shape: CardShape): SignElement[] {
  const colors = cardColors(d);
  const els: SignElement[] = [];
  els.push({
    kind: "rect",
    x: 0,
    y: 0,
    w,
    h,
    r: 0,
    fill: colors.background,
    stroke: null,
    strokeWidth: 0,
    gradient: d.gradient.on ? { from: colors.background, to: d.gradient.to, angle: d.gradient.angle } : null,
  });
  const tint = mixColor(colors.background, colors.accent, 0.22);
  const unit = Math.min(w, h);
  if (d.pattern === "dots") {
    const step = unit * 0.07;
    let p = "";
    for (let y = step / 2; y < h; y += step) for (let x = step / 2 + ((Math.round(y / step) % 2) * step) / 2; x < w; x += step) p += dot(x, y, step * 0.1);
    els.push({ kind: "path", d: p, fill: tint });
  } else if (d.pattern === "lines") {
    const step = unit * 0.06;
    const t = Math.max(0.5, unit * 0.006);
    let p = "";
    for (let x = -h; x < w; x += step) {
      const x1 = Math.max(x, 0);
      const y1 = x1 - x;
      const x2 = Math.min(x + h, w);
      const y2 = x2 - x;
      if (x2 <= x1) continue;
      p += `M${x1.toFixed(2)} ${y1.toFixed(2)}L${(x1 + t).toFixed(2)} ${y1.toFixed(2)}L${Math.min(x2 + t, w).toFixed(2)} ${y2.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}Z`;
    }
    els.push({ kind: "path", d: p, fill: tint });
  } else if (d.pattern === "confetti") {
    const rnd = seeded(7);
    const count = Math.round((w * h) / (unit * unit * 0.03));
    let p = "";
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const s = unit * (0.012 + rnd() * 0.012);
      p += rnd() > 0.5 ? `M${x.toFixed(2)} ${y.toFixed(2)}h${(s * 2).toFixed(2)}v${s.toFixed(2)}h${(-s * 2).toFixed(2)}Z` : dot(x, y, s);
    }
    els.push({ kind: "path", d: p, fill: tint });
  } else if (d.pattern === "waves") {
    const step = unit * 0.11;
    const amp = step * 0.22;
    const t = Math.max(0.6, unit * 0.007);
    let p = "";
    for (let y = step; y < h; y += step) {
      let top = `M0 ${y.toFixed(2)}`;
      let bottom = "";
      const seg = step * 0.8;
      for (let x = 0; x <= w; x += seg / 4) {
        const yy = y + Math.sin((x / seg) * Math.PI * 2) * amp;
        top += `L${x.toFixed(2)} ${yy.toFixed(2)}`;
        bottom = `L${x.toFixed(2)} ${(yy + t).toFixed(2)}` + bottom;
      }
      p += top + bottom + "Z";
    }
    els.push({ kind: "path", d: p, fill: tint });
  }

  // Borders follow the card shape itself, so the background never shows
  // past them.
  const outline = (inset: number, width: number, dash = false) =>
    els.push({ kind: "path", d: shapePath(insetShape(shape, inset)), fill: "none", stroke: colors.text, strokeWidth: width, dash });
  if (d.border === "thin") outline(0.5, 1);
  if (d.border === "dashed") outline(0.6, 1.1, true);
  if (d.border === "double") {
    outline(0.8, 1.6);
    outline(unit * 0.03 + 1.6, 0.6);
  }
  if (d.border === "decorative") {
    const b = shape.x + unit * 0.03;
    const step = unit * 0.035;
    const r = step * 0.24;
    let p = "";
    const nx = Math.round((w - 2 * b) / step);
    const ny = Math.round((h - 2 * b) / step);
    for (let i = 0; i <= nx; i++) {
      const x = b + ((w - 2 * b) * i) / nx;
      p += dot(x, b, r) + dot(x, h - b, r);
    }
    for (let i = 1; i < ny; i++) {
      const y = b + ((h - 2 * b) * i) / ny;
      // Skip the ticket notches.
      if (shape.notch && Math.abs(y - h / 2) < shape.notch + step) continue;
      p += dot(b, y, r) + dot(w - b, y, r);
    }
    els.push({ kind: "path", d: p, fill: colors.accent });
  }
  return els;
}

// ---- QR ----

function qrTile(d: CardDesign, qrName: string, x: number, y: number, qr: number): SignElement[] {
  const pad = qr * 0.07;
  const colors = cardColors(d);
  const ink = qrInk(colors);
  const onWhite = colors.background.toLowerCase() === "#ffffff" && !d.gradient.on;
  return [
    { kind: "rect", x, y, w: qr + 2 * pad, h: qr + 2 * pad, r: d.corners === "square" ? 0 : pad * 0.9, fill: "#ffffff", stroke: onWhite ? colors.text : null, strokeWidth: 0.6 },
    { kind: "qr", x: x + pad, y: y + pad, size: qr, qr: qrName, ink, star: d.theme === "clean" ? ink : "#b8862f" },
  ];
}

const CAPTION_WORD: Record<Exclude<QrDestination, "none">, keyof typeof CARD_WORDS> = { review: "scanReview", listing: "scanListing", website: "scanWebsite" };

/** A small line under the QR saying where it goes — only when it fits. */
function qrCaption(d: CardDesign, m: Measurer, dest: QrDestination, x: number, tileBottom: number, tileW: number, limitY: number): SignElement[] {
  if (dest === "none") return [];
  const text = word(d, CAPTION_WORD[dest]);
  const role: FontRole = "body";
  const size = Math.max(MIN_TEXT, tileW * 0.075);
  const lines = wrap(printable(text, m, role), m, role, size, tileW, 2);
  if (!lines) return [];
  const needed = lines.length * size * 1.2 + size * 0.5;
  if (tileBottom + needed > limitY) return [];
  return lines.map((line, i) => ({
    kind: "text" as const,
    x: x + (tileW - m.width(line, role, size)) / 2,
    y: tileBottom + size * 0.5 + size * 1.2 * (i + 1) - size * 0.25,
    text: line,
    size,
    role,
    color: cardColors(d).text,
  }));
}

// ---- Text fitting ----

interface Fitted {
  els: SignElement[];
  height: number;
  /** Height of the offer block (to keep the QR from outgrowing it). */
  offerH: number;
}

function roleFor(d: CardDesign, role: FontRole): FontRole {
  return role === "headline" && !d.headlineBold ? "headlineRegular" : role;
}

/** Fits blocks into a region, vertically centered; null if they don't
 * fit (text never shrinks below MIN_TEXT / MIN_FINE_TEXT). */
function fitBlocks(d: CardDesign, m: Measurer, blocks: Block[], region: Region, base: number, f: number, align: "left" | "center", inkOver?: string): Fitted | null {
  const els: SignElement[] = [];
  const laid: Array<(at: Region) => void> = [];
  const colors = cardColors(d);
  let y = 0;
  let offerH = 0;
  for (const b of blocks) {
    if (b.kind === "text") {
      const role = roleFor(d, b.role);
      const size = Math.max(base * b.rel * f, b.fine ? MIN_FINE_TEXT : MIN_TEXT);
      const spacing = (b.spacing ?? SPACING[d.letterSpacing]) * size;
      const clean = printable(b.upper ? b.text.toUpperCase() : b.text, m, role);
      if (!clean) continue;
      const lines = wrap(clean, m, role, size, region.w, b.maxLines, spacing);
      if (!lines) return null;
      const lineH = size * 1.2;
      const top = y;
      const italic = b.italic ?? (b.role === "headline" ? d.headlineItalic : d.bodyItalic);
      const color = inkOver ?? (b.color === "accent" ? colors.accent : colors.text);
      laid.push((at) =>
        lines.forEach((line, i) => {
          const w = m.width(line, role, size, spacing);
          const x = align === "center" ? at.x + (at.w - w) / 2 : at.x;
          els.push({ kind: "text", x, y: at.y + top + lineH * (i + 1) - lineH * 0.24, text: line, size, role, color, italic, letterSpacing: spacing || undefined });
        })
      );
      if (b.offer) offerH = lines.length * lineH;
      y += lines.length * lineH + (b.gap ?? 0.4) * size;
    } else if (b.kind === "rule") {
      const top = y;
      laid.push((at) => {
        const w = Math.min(at.w * 0.3, base * 2.2);
        els.push({ kind: "rect", x: align === "center" ? at.x + (at.w - w) / 2 : at.x, y: at.y + top, w, h: Math.max(1, base * 0.08), r: 0, fill: inkOver ?? colors.accent, stroke: null, strokeWidth: 0 });
      });
      y += base * 0.08 + (b.gap ?? 0.4) * base;
    } else if (b.kind === "writeIn") {
      const size = Math.max(base * 0.34 * f, MIN_TEXT);
      const role = roleFor(d, "body");
      const label = printable(`${b.label}:`, m, role);
      const top = y;
      laid.push((at) => {
        const lw = m.width(label, role, size);
        const lineW = Math.max(20, Math.min(at.w - lw - 4, at.w * 0.6));
        const total = lw + 4 + lineW;
        const x = align === "center" ? at.x + (at.w - total) / 2 : at.x;
        const baseline = at.y + top + size;
        els.push({ kind: "text", x, y: baseline, text: label, size, role, color: inkOver ?? colors.text });
        els.push({ kind: "line", x1: x + lw + 4, y1: baseline + 1, x2: x + lw + 4 + lineW, y2: baseline + 1, color: inkOver ?? colors.text, width: 0.6, dash: false });
      });
      y += size * 1.5 + (b.gap ?? 0.35) * size;
    } else if (b.kind === "qr") {
      const tile = b.size * TILE;
      if (tile > region.w + 0.5) return null;
      const top = y;
      laid.push((at) => els.push(...qrTile(d, b.name, align === "center" ? at.x + (at.w - tile) / 2 : at.x, at.y + top, b.size)));
      y += tile + (b.gap ?? 0.35) * base * f;
    } else {
      // Punch circles: up to 6 per row, the last one a filled star.
      const perRow = Math.min(b.count, b.count > 6 ? Math.ceil(b.count / 2) : b.count);
      const rows = Math.ceil(b.count / perRow);
      const cell = Math.min(region.w / perRow, base * 1.3 * f);
      const rad = cell * 0.36;
      const top = y;
      laid.push((at) => {
        const x0 = align === "center" ? at.x + (at.w - perRow * cell) / 2 : at.x;
        for (let i = 0; i < b.count; i++) {
          const cx = x0 + (i % perRow) * cell + cell / 2;
          const cy = at.y + top + Math.floor(i / perRow) * cell + cell / 2;
          const last = i === b.count - 1;
          const ring = dot(cx, cy, rad);
          const inner = rad - Math.max(0.8, rad * 0.14);
          const hole = `M${cx - inner} ${cy}a${inner} ${inner} 0 1 0 ${2 * inner} 0a${inner} ${inner} 0 1 0 ${-2 * inner} 0Z`;
          els.push({ kind: "path", d: last ? ring : ring + hole, fill: colors.accent });
          if (last) els.push({ kind: "path", d: starPath(cx, cy + rad * 0.05, rad * 0.62), fill: inkOver ? colors.background : "#ffffff" });
        }
      });
      y += rows * cell + (b.gap ?? 0.3) * base;
    }
  }
  if (y > region.h + 0.5) return null;
  const placed = { ...region, y: region.y + Math.max(0, (region.h - y) / 2) };
  for (const lay of laid) lay(placed);
  return { els, height: y, offerH };
}

function dropOptional(blocks: Block[], level: number): Block[] {
  return blocks.filter((b) => !b.optional || b.optional > level);
}

// ---- Faces ----

interface Face {
  els: SignElement[];
  qr: number | null;
  shape: CardShape;
}

/** "Code EKPM-NRUG · Valid until Dec 31, 2026" (+ serial number). */
function codeLine(d: CardDesign, serial: string | null): string {
  return [d.show.code && d.code ? `${word(d, "code")} ${d.code}` : "", d.show.expiration && d.expiration ? formatExpiration(d.expiration, d) : "", serial ?? ""]
    .filter(Boolean)
    .join(" · ");
}

/** The tiny "how it works" line for the referral's pass-on choice. */
function howToWord(d: CardDesign): keyof typeof CARD_WORDS {
  if (d.template === "giveGet") return "howToHalves";
  return d.passOn === "digital" ? "howToDigital" : "howToSingle";
}

function text(t: string, role: FontRole, rel: number, color: "text" | "accent", maxLines: number, extra: Partial<Extract<Block, { kind: "text" }>> = {}): Block[] {
  return t.trim() ? [{ kind: "text", text: t.trim(), role, rel, color, maxLines, ...extra }] : [];
}

function frontBlocks(d: CardDesign, serial: string | null, finePrintOnFront: boolean): { main: Block[]; side: Block[] } {
  const name = d.show.businessName ? d.businessName : "";
  const fine = finePrintOnFront && d.show.finePrint ? d.finePrint : "";
  const sub = d.show.subline ? d.subline : "";
  const code = codeLine(d, serial);
  const label = (key: keyof typeof CARD_WORDS): Block[] => (d.show.headline ? text(word(d, key), "bodyBold", 0.32, "accent", 2, { upper: true, spacing: 0.12 }) : []);
  const nameBlock = text(name, "bodyBold", 0.36, "accent", 2, { upper: true, spacing: 0.06, gap: 0.5 });
  const offer = (t: string, rel = 1) => text(t, "headline", rel, "text", 3, { offer: true, gap: 0.45 });
  // How to redeem → code + expiry → fine print.
  const tail = [...text(sub, "body", 0.4, "text", 2, { optional: DROP_EXTRA }), ...text(code, "bodyBold", 0.32, "text", 2), ...text(fine, "body", 0.26, "text", 3, { fine: true, optional: DROP_FINE })];
  const howTo = d.show.howTo && !(d.doubleSided && d.back.finePrint) ? text(word(d, howToWord(d)), "body", 0.24, "text", 3, { fine: true, optional: DROP_HOWTO }) : [];
  const digital = d.kind === "referral" && d.passOn === "digital";
  // Single card: the customer writes their name; digital: the friend
  // shows it on their phone (the sender is the referrer).
  const referrerLine: Block[] = digital
    ? text(word(d, "showOnPhone"), "body", 0.34, "accent", 2)
    : [{ kind: "writeIn", label: word(d, "referredBy") }];

  switch (d.template) {
    case "ticket":
    case "voucher":
    case "minimal":
      return { main: [...nameBlock, ...offer(d.offer), ...(d.template === "minimal" ? [{ kind: "rule" } as Block] : []), ...tail], side: [] };
    case "saleBanner":
      return { main: [...nameBlock, ...tail], side: [] };
    case "giftCard":
      return { main: [...nameBlock, ...label("gift"), ...offer(d.offer), ...tail], side: [] };
    case "loyalty":
      return {
        main: [...nameBlock, ...label("loyalty"), ...offer(d.loyaltyReward, 0.8), { kind: "punches", count: d.punches }, ...text(sub, "body", 0.38, "text", 2, { optional: DROP_EXTRA }), ...text(code, "bodyBold", 0.3, "text", 2), ...text(fine, "body", 0.24, "text", 2, { fine: true, optional: DROP_FINE })],
        side: [],
      };
    case "giveGet": {
      // Two halves of equal weight, the same code on both.
      const halfLabel = (key: "forFriend" | "forYou") => text(word(d, key), "bodyBold", 0.3, "accent", 2, { upper: true, spacing: 0.1 });
      // Code and expiry on their own lines, identical on both halves.
      const codeAndExpiry = (expiryOptional?: number) => [
        ...text([d.show.code && d.code ? `${word(d, "code")} ${d.code}` : "", serial ?? ""].filter(Boolean).join(" · "), "bodyBold", 0.28, "text", 2, { gap: 0.2 }),
        ...(d.show.expiration && d.expiration ? text(formatExpiration(d.expiration, d), "body", 0.26, "text", 2, { optional: expiryOptional }) : []),
      ];
      return {
        main: [...halfLabel("forFriend"), ...offer(d.friendOffer, 0.72), { kind: "writeIn", label: word(d, "referredBy"), optional: DROP_EXTRA }, ...codeAndExpiry(DROP_LAST)],
        side: [
          ...halfLabel("forYou"),
          ...offer(d.referrerReward, 0.72),
          ...text(word(d, "unlocks"), "body", 0.28, "text", 2, { optional: DROP_EXTRA }),
          ...codeAndExpiry(),
          ...text(fine, "body", 0.22, "text", 2, { fine: true, optional: DROP_FINE }),
          ...howTo,
        ],
      };
    }
    case "friendPass":
      return { main: [...label("friendPass"), ...offer(d.friendOffer), ...referrerLine, ...nameBlock, ...tail, ...howTo], side: [] };
    case "thankYou":
    default:
      return {
        main: [...(d.show.headline ? text(word(d, "thankYou"), "headline", 0.85, "text", 2) : []), ...text(word(d, "passItOn"), "body", 0.34, "accent", 2), ...offer(d.friendOffer, 0.75), ...referrerLine, ...nameBlock, ...tail, ...howTo],
        side: [],
      };
  }
}

const COUPON_TEMPLATES_WITH_OFFER = new Set(["ticket", "voucher", "saleBanner", "minimal", "giftCard"]);

function frontFace(input: CardLayoutInput, m: Measurer, w: number, h: number, serial: string | null): Face | null {
  const d = input.design;
  const landscape = w >= h;
  const unit = Math.min(w, h);
  const shape = cardShape(d, w, h);
  const pad = padding(d, w, h);
  const base = unit * (landscape ? 0.15 : 0.085) * TEXT_SCALE[d.textSize];
  const minQr = minQrPoints(d.size);
  const wantQr = d.show.qr && d.qr !== "none" && input.hasQr(d.qr);
  const finePrintOnFront = !(d.doubleSided && d.back.finePrint);
  const all = frontBlocks(d, serial, finePrintOnFront);
  const colors = cardColors(d);
  const align = d.align === "center" ? "center" : "left";
  const couponOffer = d.kind === "coupon" && COUPON_TEMPLATES_WITH_OFFER.has(d.template);

  // The referral friend half carries a small code (its minimum size).
  const maxQr = !wantQr
    ? 0
    : d.template === "giveGet"
      ? minQr
      : Math.max(minQr, landscape ? Math.min((h - 2 * pad) / TILE, (w * 0.34) / TILE) : Math.min((w * 0.45) / TILE, (h * 0.28) / TILE));
  for (let drop = 0; drop <= DROP_LAST; drop++) {
    const main = dropOptional(all.main, drop);
    const side = dropOptional(all.side, drop);
    for (let qr = maxQr; ; qr = Math.max(minQr, qr * 0.88)) {
      for (let f = 1; f >= 0.3; f -= 0.05) {
        const els = frame(d, w, h, shape);
        const tile = wantQr ? qr * TILE : 0;
        let mainR: Region;
        let sideR: Region | null = null;
        let qrPos: { x: number; y: number } | null = null;
        let qrBelowLimit = h - pad * 0.6;
        let bandEls: SignElement[] = [];
        let top = pad;
        let mainBlocks = main;
        let offerH = 0;

        if (d.template === "saleBanner") {
          // The offer runs across a band in reversed colors; on landscape
          // cards the band stops at the QR column.
          const qrColW = landscape && wantQr ? tile + pad * 0.8 : 0;
          const bandBlocks: Block[] = [...text(d.offer, "headline", 0.95, "text", 2, { offer: true })];
          const bandR: Region = { x: pad, y: pad * 0.75, w: w - 2 * pad - qrColW, h: landscape ? h * 0.4 : h * 0.24 };
          const fitted = fitBlocks(d, m, bandBlocks, bandR, base, f, "center", colors.background);
          if (!fitted) continue;
          bandEls = [{ kind: "rect", x: 0, y: 0, w: w - qrColW - pad * 0.4, h: bandR.y + bandR.h + pad * 0.4, r: 0, fill: colors.text, stroke: null, strokeWidth: 0 }, ...fitted.els];
          top = bandR.y + bandR.h + pad * 0.9;
          offerH = fitted.offerH;
        }
        if (d.template === "giftCard") els.push({ kind: "rect", x: 0, y: 0, w: unit * 0.07 + shape.x, h, r: 0, fill: colors.accent, stroke: null, strokeWidth: 0 });
        const left = d.template === "giftCard" ? shape.x + unit * 0.07 + pad * 0.7 : pad;

        if (d.template === "giveGet") {
          // Two equal halves with a perforation between them; the friend
          // half carries a small QR in its flow.
          if (landscape) {
            const half = w / 2;
            els.push({ kind: "line", x1: half, y1: pad * 0.6, x2: half, y2: h - pad * 0.6, color: colors.text, width: 1, dash: false, dots: true });
            mainR = { x: pad, y: pad, w: half - 1.5 * pad, h: h - 2 * pad };
            sideR = { x: half + pad * 0.5, y: pad, w: half - 1.5 * pad, h: h - 2 * pad };
          } else {
            const half = h / 2;
            els.push({ kind: "line", x1: pad * 0.6, y1: half, x2: w - pad * 0.6, y2: half, color: colors.text, width: 1, dash: false, dots: true });
            mainR = { x: pad, y: pad, w: w - 2 * pad, h: half - 1.5 * pad };
            sideR = { x: pad, y: half + pad * 0.5, w: w - 2 * pad, h: half - 1.5 * pad };
          }
          if (wantQr) {
            // [label, offer, QR, referred by, code].
            const i = mainBlocks.findIndex((b) => b.kind === "text" && b.offer);
            mainBlocks = [...mainBlocks.slice(0, i + 1), { kind: "qr", name: "front", size: qr, gap: 0.25 }, ...mainBlocks.slice(i + 1)];
          }
        } else if (d.template === "ticket") {
          // The stub holds the QR behind a perforated tear line.
          if (landscape) {
            const stubW = (wantQr ? tile : w * 0.18) + pad * 1.6;
            const sx = w - stubW;
            els.push({ kind: "line", x1: sx, y1: pad * 0.5, x2: sx, y2: h - pad * 0.5, color: colors.text, width: 1, dash: false, dots: true });
            mainR = { x: left, y: top, w: sx - left - pad * 0.8, h: h - top - pad };
            if (wantQr) qrPos = { x: sx + (stubW - tile) / 2, y: (h - tile) / 2 };
          } else {
            const stubH = (wantQr ? tile : h * 0.18) + pad * 1.6;
            const sy = h - stubH;
            els.push({ kind: "line", x1: pad * 0.5, y1: sy, x2: w - pad * 0.5, y2: sy, color: colors.text, width: 1, dash: false, dots: true });
            mainR = { x: left, y: top, w: w - left - pad, h: sy - top - pad * 0.6 };
            if (wantQr) qrPos = { x: (w - tile) / 2, y: sy + (stubH - tile) / 2 };
          }
        } else if (landscape) {
          const qrColW = wantQr ? tile + pad * 0.8 : 0;
          mainR = { x: left, y: top, w: w - left - pad - qrColW, h: h - top - pad };
          if (wantQr) qrPos = { x: w - pad - tile, y: (h - tile) / 2 };
        } else {
          mainR = { x: left, y: top, w: w - left - pad, h: h - top - pad - (wantQr ? tile + pad * 0.6 : 0) };
          if (wantQr) qrPos = { x: align === "center" ? (w - tile) / 2 : left, y: h - pad - tile };
          qrBelowLimit = h - pad * 0.4;
        }

        // Icon and logo head the main text column (the referral halves
        // have no room for them).
        const header: SignElement[] = [];
        const iconOn = d.icon !== "none" && d.template !== "giveGet";
        const logoOn = !!(input.logo && d.showLogo) && d.template !== "giveGet";
        if (iconOn || logoOn) {
          const hh = Math.min(unit * 0.14, mainR.h * 0.28) * f;
          const iconW = iconOn ? hh : 0;
          const logoW = logoOn ? Math.min(hh * input.logo!.aspect, mainR.w * 0.5) : 0;
          const logoH = logoOn ? logoW / input.logo!.aspect : 0;
          const total = iconW + logoW + (iconOn && logoOn ? hh * 0.3 : 0);
          let x = align === "center" ? mainR.x + (mainR.w - total) / 2 : mainR.x;
          if (iconOn) {
            header.push({ kind: "path", d: placeIcon(d.icon as Exclude<typeof d.icon, "none">, x, mainR.y, hh), fill: colors.accent });
            x += iconW + hh * 0.3;
          }
          if (logoOn) header.push({ kind: "logo", x, y: mainR.y + (hh - logoH) / 2, w: logoW, h: logoH });
          mainR = { ...mainR, y: mainR.y + hh * 1.25, h: mainR.h - hh * 1.25 };
        }
        if (mainR.w <= 0 || mainR.h <= 0) continue;
        const fittedMain = fitBlocks(d, m, mainBlocks, mainR, base, f, d.template === "giveGet" ? "center" : align);
        if (!fittedMain) continue;
        // Coupons: the QR is never bigger than the offer (shrink the code,
        // which leaves more room for a bigger offer).
        if (d.template !== "saleBanner") offerH = fittedMain.offerH;
        if (couponOffer && wantQr && qr > minQr + 0.5 && qr > offerH * 1.25) break;
        const fittedSide = sideR && side.length ? fitBlocks(d, m, side, sideR, base, f, "center") : { els: [], height: 0, offerH: 0 };
        if (!fittedSide) continue;

        els.push(...bandEls, ...header, ...fittedMain.els, ...fittedSide.els);
        if (wantQr && qrPos) {
          els.push(...qrTile(d, "front", qrPos.x, qrPos.y, qr));
          els.push(...qrCaption(d, m, d.qr, qrPos.x, qrPos.y + tile, tile, qrBelowLimit));
        }
        if (input.credit) creditMark(els, m, w, h, shape, colors.text);
        return { els, qr: wantQr ? qr : null, shape };
      }
      if (!wantQr || qr <= minQr) break;
    }
  }
  return null;
}

function backFace(input: CardLayoutInput, m: Measurer, w: number, h: number): Face | null {
  const d = input.design;
  const b = input.business;
  const landscape = w >= h;
  const unit = Math.min(w, h);
  const shape = cardShape(d, w, h);
  const pad = padding(d, w, h);
  const base = unit * (landscape ? 0.15 : 0.085) * TEXT_SCALE[d.textSize];
  const wantQr = d.back.qr !== "none" && input.hasQr(d.back.qr);
  const minQr = minQrPoints(d.size);
  const blocks: Block[] = [
    ...text(d.businessName, "bodyBold", 0.38, "accent", 2, { upper: true, spacing: 0.06 }),
    ...(d.back.address ? text(b.address ?? "", "body", 0.3, "text", 2) : []),
    ...(d.back.hours && b.hours?.length ? [...text(word(d, "hours"), "bodyBold", 0.28, "text", 1), ...b.hours.slice(0, 7).flatMap((l) => text(l, "body", 0.24, "text", 1, { fine: true, gap: 0.15 }))] : []),
    ...text(d.back.note, "body", 0.32, "text", 3),
    ...(d.back.finePrint ? text(d.finePrint, "body", 0.24, "text", 4, { fine: true }) : []),
    ...(d.show.howTo && d.kind === "referral" ? text(word(d, howToWord(d)), "body", 0.24, "text", 3, { fine: true, optional: DROP_HOWTO }) : []),
  ];
  const maxQr = wantQr ? Math.max(minQr, landscape ? Math.min((h - 2 * pad) / TILE, (w * 0.34) / TILE) : Math.min((w * 0.45) / TILE, (h * 0.28) / TILE)) : 0;
  for (let drop = 0; drop <= DROP_EXTRA; drop++) {
    const list = dropOptional(blocks, drop);
    for (let qr = maxQr; ; qr = Math.max(minQr, qr * 0.88)) {
      for (let f = 1; f >= 0.3; f -= 0.05) {
        const els = frame(d, w, h, shape);
        const tile = wantQr ? qr * TILE : 0;
        const region: Region = landscape
          ? { x: pad, y: pad, w: w - 2 * pad - (wantQr ? tile + pad * 0.8 : 0), h: h - 2 * pad }
          : { x: pad, y: pad, w: w - 2 * pad, h: h - 2 * pad - (wantQr ? tile + pad * 0.6 : 0) };
        const fitted = fitBlocks(d, m, list, region, base, f, d.align === "center" ? "center" : "left");
        if (!fitted) continue;
        els.push(...fitted.els);
        if (wantQr) {
          const bx = landscape ? w - pad - tile : (w - tile) / 2;
          const by = landscape ? (h - tile) / 2 : h - pad - tile;
          els.push(...qrTile(d, "back", bx, by, qr));
          els.push(...qrCaption(d, m, d.back.qr, bx, by + tile, tile, h - pad * 0.4));
        }
        if (input.credit) creditMark(els, m, w, h, shape, cardColors(d).text);
        return { els, qr: wantQr ? qr : null, shape };
      }
      if (!wantQr || qr <= minQr) break;
    }
  }
  return null;
}

function creditMark(els: SignElement[], m: Measurer, w: number, h: number, shape: CardShape, color: string): void {
  const size = 4.5;
  const tw = m.width(MADE_WITH, "body", size);
  const inset = shape.x + Math.min(w, h) * 0.03;
  els.push({ kind: "text", x: w - tw - inset - 2, y: h - inset - 1, text: MADE_WITH, size, role: "body", color });
}

// ---- Sheets ----

export function layoutCardSheets(input: CardLayoutInput, m: Measurer): CardSheets {
  const d = input.design;
  const sheet = CARD_SHEETS[d.size];
  const perPage = sheet.cols * sheet.rows;
  const count = d.serial.on ? d.serial.count : perPage;
  const [pw, ph] = LETTER;
  const gx = (pw - sheet.cols * sheet.w) / 2;
  const gy = (ph - sheet.rows * sheet.h) / 2;

  let qrPoints: number | null = null;
  const track = (q: number | null) => {
    if (q !== null) qrPoints = qrPoints === null ? q : Math.min(qrPoints, q);
  };
  const plainFront = d.serial.on ? null : frontFace(input, m, sheet.w, sheet.h, null);
  if (!d.serial.on && !plainFront) throw new Error("The card layout could not fit the QR code.");
  track(plainFront?.qr ?? null);
  const back = d.doubleSided ? backFace(input, m, sheet.w, sheet.h) : null;
  if (d.doubleSided && !back) throw new Error("The card back could not fit.");
  track(back?.qr ?? null);

  const cutMarks = (): SignElement[] => {
    const marks: SignElement[] = [];
    const line = (x1: number, y1: number, x2: number, y2: number): SignElement => ({ kind: "line", x1, y1, x2, y2, color: "#8a8f99", width: 0.5, dash: true });
    if (perPage === 1) return marks;
    for (let c = 0; c <= sheet.cols; c++) marks.push(line(gx + c * sheet.w, Math.max(0, gy - 18), gx + c * sheet.w, Math.min(ph, gy + sheet.rows * sheet.h + 18)));
    for (let r = 0; r <= sheet.rows; r++) marks.push(line(Math.max(0, gx - 18), gy + r * sheet.h, Math.min(pw, gx + sheet.cols * sheet.w + 18), gy + r * sheet.h));
    return marks;
  };

  const pages: PrintPage[] = [];
  const pageCount = Math.ceil(count / perPage);
  for (let p = 0; p < pageCount; p++) {
    const fronts: SignPanel[] = [];
    const backs: SignPanel[] = [];
    for (let i = 0; i < perPage; i++) {
      const index = p * perPage + i;
      if (index >= count) break;
      const col = i % sheet.cols;
      const row = Math.floor(i / sheet.cols);
      let face = plainFront;
      if (d.serial.on) {
        face = frontFace(input, m, sheet.w, sheet.h, serialLabel(d.serial.start + index));
        if (!face) throw new Error("The card layout could not fit the QR code.");
        track(face.qr);
      }
      const x = gx + col * sheet.w;
      const y = gy + row * sheet.h;
      fronts.push({ x, y, w: sheet.w, h: sheet.h, rotate: 0, elements: face!.els, clip: face!.shape });
      // Flip on the long edge: the back of the card at x sits at the
      // mirrored x on the next page (drawn the right way round).
      if (back) backs.push({ x: pw - x - sheet.w, y, w: sheet.w, h: sheet.h, rotate: 0, elements: back.els, clip: back.shape });
    }
    pages.push({ width: pw, height: ph, panels: fronts, marks: cutMarks() });
    if (back) pages.push({ width: pw, height: ph, panels: backs, marks: cutMarks().map((mk) => (mk.kind === "line" ? { ...mk, x1: pw - mk.x1, x2: pw - mk.x2 } : mk)) });
  }
  return { pages, doubleSided: !!back, qrPoints, cardsPerPage: perPage, cardCount: count };
}

/** One card's front (and back), at the origin — the preview and the PNG. */
export function layoutSingleCard(input: CardLayoutInput, m: Measurer): { front: PrintPage; back: PrintPage | null; qrPoints: number | null } {
  const d = input.design;
  const sheet = CARD_SHEETS[d.size];
  const front = frontFace(input, m, sheet.w, sheet.h, d.serial.on ? serialLabel(d.serial.start) : null);
  if (!front) throw new Error("The card layout could not fit the QR code.");
  const back = d.doubleSided ? backFace(input, m, sheet.w, sheet.h) : null;
  const page = (face: Face): PrintPage => ({ width: sheet.w, height: sheet.h, panels: [{ x: 0, y: 0, w: sheet.w, h: sheet.h, rotate: 0, elements: face.els, clip: face.shape }], marks: [] });
  return { front: page(front), back: back ? page(back) : null, qrPoints: front.qr };
}
