// The review-link QR code as plain geometry. One shape list feeds every
// output — the on-screen tile (SVG), the PNG download (canvas), the sign
// preview (SVG) and the sign PDF (vector paths) — so they all encode
// exactly the same link. Pure; safe on the server and client.
//
// Styles: dot shape (square / rounded / dots), finder-corner shape
// (square / rounded), and a center (none / star / logo). Any center
// covers the middle of the code, so it switches to the highest
// error-correction level (H) and stays small (about a fifth of the
// code's width).

import QRCode from "qrcode";

export const QR_NAVY = "#14243f";
export const QR_BRASS = "#b8862f";

/** Quiet margin around the code, in modules. Each output also sits on a
 * white tile, so this plus the tile padding clears the standard 4. */
export const QR_MARGIN = 2;

export type QrDots = "square" | "rounded" | "dots";
export type QrCorners = "square" | "rounded";
export type QrCenter = "none" | "star" | "logo";

export interface QrStyle {
  dots: QrDots;
  corners: QrCorners;
  center: QrCenter;
}

/** Rounded navy dots with the brass star: the on-screen code. */
export const DEFAULT_QR_STYLE: QrStyle = { dots: "rounded", corners: "rounded", center: "star" };

export interface ReviewQrGeometry {
  /** Side length in modules, margin included. */
  size: number;
  /** One SVG path (module units, y down) per fill. */
  darkPath: string;
  lightPath: string;
  /** The finders' 3×3 centers, painted over the light rings. */
  finderCenterPath: string;
  /** The covered middle: a white disc, with a star (center "star") or
   * room for the owner's logo (center "logo"; the logo is drawn by the
   * browser into `logoBox`). */
  badge: { cx: number; cy: number; r: number; starPath: string | null; logoBox: { x: number; y: number; size: number } | null } | null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Every shape winds clockwise so overlapping pieces of one layer merge
// (nonzero fill) instead of cutting holes.
function dotPath(cx: number, cy: number, r: number): string {
  return `M${round(cx - r)} ${round(cy)}a${r} ${r} 0 1 1 ${round(2 * r)} 0a${r} ${r} 0 1 1 ${round(-2 * r)} 0Z`;
}

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${round(x)} ${round(y)}h${round(w)}v${round(h)}h${round(-w)}Z`;
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return rectPath(x, y, w, h);
  return (
    `M${round(x + r)} ${round(y)}h${round(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${round(h - 2 * r)}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}h${round(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${round(-(h - 2 * r))}` +
    `a${r} ${r} 0 0 1 ${r} ${-r}Z`
  );
}

/** A five-point star centered on (cx, cy), point up. */
export function starPath(cx: number, cy: number, outer: number, inner = outer * 0.45): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`);
  }
  return `M${points.join("L")}Z`;
}

/** The QR for `url` in a given style. `{ badge: true }` is shorthand for
 * the default style (rounded, star); `{ badge: false }` the same with no
 * center. */
export function reviewQrGeometry(url: string, styleOrBadge: QrStyle | { badge: boolean }): ReviewQrGeometry {
  const style: QrStyle = "badge" in styleOrBadge ? { ...DEFAULT_QR_STYLE, center: styleOrBadge.badge ? "star" : "none" } : styleOrBadge;
  const covered = style.center !== "none";
  const qr = QRCode.create(url, { errorCorrectionLevel: covered ? "H" : "M" });
  const n = qr.modules.size;
  const m = QR_MARGIN;
  const size = n + 2 * m;

  // The center disc is about a fifth of the code wide; modules under it
  // are left out so no half-covered module confuses a scanner.
  const badgeR = covered ? Math.max(2.5, n * 0.1) : 0;
  const center = size / 2;
  const underBadge = (r: number, c: number) =>
    covered && Math.hypot(c + m + 0.5 - center, r + m + 0.5 - center) < badgeR + 0.75;
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const isDot = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < n && c < n && qr.modules.get(r, c) && !inFinder(r, c) && !underBadge(r, c);

  const dark: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!isDot(r, c)) continue;
      const x = c + m;
      const y = r + m;
      if (style.dots === "square") {
        dark.push(rectPath(x, y, 1, 1));
      } else if (style.dots === "dots") {
        // Separate round dots, touching their neighbors.
        dark.push(dotPath(x + 0.5, y + 0.5, 0.5));
      } else {
        // Rounded: a lone module is a dot; neighbors join into rounded
        // bars, so rows and columns keep the solid runs scanners measure.
        dark.push(dotPath(x + 0.5, y + 0.5, 0.5));
        if (isDot(r, c + 1)) dark.push(rectPath(x + 0.5, y, 1, 1));
        if (isDot(r + 1, c)) dark.push(rectPath(x, y + 0.5, 1, 1));
      }
    }
  }

  const rounded = style.corners === "rounded";
  const light: string[] = [];
  const centers: string[] = [];
  for (const [fr, fc] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]) {
    const x = fc + m;
    const y = fr + m;
    dark.push(roundedRectPath(x, y, 7, 7, rounded ? 2 : 0));
    light.push(roundedRectPath(x + 1, y + 1, 5, 5, rounded ? 1.4 : 0));
    centers.push(roundedRectPath(x + 2, y + 2, 3, 3, rounded ? 0.9 : 0));
  }

  let badge: ReviewQrGeometry["badge"] = null;
  if (covered) {
    // The logo fits inside the disc with a little white around it.
    const logoSide = badgeR * 1.3;
    badge = {
      cx: center,
      cy: center,
      r: badgeR,
      starPath: style.center === "star" ? starPath(center, center, badgeR * 0.68) : null,
      logoBox: style.center === "logo" ? { x: center - logoSide / 2, y: center - logoSide / 2, size: logoSide } : null,
    };
  }

  return { size, darkPath: dark.join(""), lightPath: light.join(""), finderCenterPath: centers.join(""), badge };
}

/** The fill layers in paint order: modules + finder frames (dark), finder
 * gaps (light), finder centers (dark), then the center disc and star. */
export function qrLayers(geo: ReviewQrGeometry, dark: string, star = QR_BRASS): Array<{ d: string; fill: string }> {
  const layers = [
    { d: geo.darkPath, fill: dark },
    { d: geo.lightPath, fill: "#ffffff" },
    { d: geo.finderCenterPath, fill: dark },
  ];
  if (geo.badge) {
    const { cx, cy, r } = geo.badge;
    layers.push({ d: dotPath(cx, cy, r), fill: "#ffffff" });
    if (geo.badge.starPath) layers.push({ d: geo.badge.starPath, fill: star });
  }
  return layers;
}

/** The code as SVG markup (no outer <svg>), scaled to `px` wide at (x, y),
 * on a white square. Deterministic, so server and browser match. A logo
 * (data URL) is drawn into the logo box when given. */
export function qrSvgMarkup(
  geo: ReviewQrGeometry,
  opts: { x?: number; y?: number; px: number; dark?: string; star?: string; logoHref?: string | null }
): string {
  const s = opts.px / geo.size;
  const layers = qrLayers(geo, opts.dark ?? QR_NAVY, opts.star)
    .map((l) => `<path d="${l.d}" fill="${l.fill}"/>`)
    .join("");
  const box = geo.badge?.logoBox;
  const logo =
    box && opts.logoHref
      ? `<image href="${opts.logoHref}" x="${round(box.x)}" y="${round(box.y)}" width="${round(box.size)}" height="${round(box.size)}" preserveAspectRatio="xMidYMid meet"/>`
      : "";
  return (
    `<g transform="translate(${round(opts.x ?? 0)} ${round(opts.y ?? 0)}) scale(${round(s)})">` +
    `<rect width="${geo.size}" height="${geo.size}" fill="#ffffff"/>${layers}${logo}</g>`
  );
}

/** A standalone SVG document of the code. */
export function qrSvg(geo: ReviewQrGeometry, px: number, dark = QR_NAVY): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}">${qrSvgMarkup(geo, { px, dark })}</svg>`;
}

/** The code as a PNG data URL (browser only), `px` square. */
export async function qrPngDataUrl(geo: ReviewQrGeometry, px = 1200): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.scale(px / geo.size, px / geo.size);
  for (const layer of qrLayers(geo, QR_NAVY)) {
    ctx.fillStyle = layer.fill;
    ctx.fill(new Path2D(layer.d));
  }
  return canvas.toDataURL("image/png");
}
