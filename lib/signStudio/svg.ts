// Printouts as SVG — the live previews (review sign, coupon and referral
// cards) and the single-card PNG. Fonts come from the same files the PDF
// embeds: @font-face on /sign-fonts, or embedded data for a PNG.

import { GOOGLE_MAPS_LOGO_RATIO } from "@/lib/google/mapsLogoPng";
import { qrSvgMarkup, type ReviewQrGeometry } from "@/lib/reviewQr";
import { designFontFiles, type SignDesign } from "@/lib/signStudio/design";
import { FONT_ROLES, ITALIC_SKEW, shapePath, type FontRole, type PrintPage, type SignElement } from "@/lib/signStudio/elements";
import type { SignLayout } from "@/lib/signStudio/layout";

function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function n(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** One CSS font-family per font file, e.g. "ps-sign-Inter-Bold". */
export function signFontFamily(file: string): string {
  return `ps-sign-${file.replace(/\.ttf$/, "")}`;
}

/** @font-face rules; `embedded` (file → base64) makes the SVG standalone
 * (needed to draw it into a PNG). */
export function signFontFaces(files: string[], embedded?: Record<string, string>): string {
  return Array.from(new Set(files))
    .map((f) => {
      const src = embedded?.[f] ? `data:font/ttf;base64,${embedded[f]}` : `/sign-fonts/${f}`;
      return `@font-face{font-family:"${signFontFamily(f)}";src:url("${src}") format("truetype");font-display:block}`;
    })
    .join("");
}

export interface RenderSvgOptions {
  /** QR geometry by name (the `qr` field of each qr element). */
  qrs: Record<string, ReviewQrGeometry>;
  fontFiles: Record<FontRole, string>;
  logoHref?: string | null;
  /** A diagonal "Premium" watermark (Grow previewing a Premium option). */
  watermark?: string | null;
  embeddedFonts?: Record<string, string>;
  /** Draw only this panel, at the origin (a single card for a PNG). */
  panelIndex?: number;
  /** No white page behind the card (a PNG's corners stay see-through). */
  transparent?: boolean;
}

let gradientId = 0;

export function renderPageSvg(page: PrintPage, opts: RenderSvgOptions): string {
  const defs: string[] = [];
  const element = (el: SignElement): string => {
    switch (el.kind) {
      case "rect": {
        let fill = el.fill ?? "none";
        if (el.gradient) {
          const id = `g${++gradientId}`;
          const [x2, y2] = el.gradient.angle === 0 ? [1, 0] : el.gradient.angle === 90 ? [0, 1] : [1, 1];
          defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${el.gradient.from}"/><stop offset="1" stop-color="${el.gradient.to}"/></linearGradient>`);
          fill = `url(#${id})`;
        }
        return `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="${n(el.gradient ? 0 : el.r)}" fill="${fill}"${
          el.stroke ? ` stroke="${el.stroke}" stroke-width="${n(el.strokeWidth)}"${el.dash ? ` stroke-dasharray="4 3"` : ""}` : ""
        }/>`;
      }
      case "text": {
        const spacing = el.letterSpacing ? ` letter-spacing="${n(el.letterSpacing)}"` : "";
        const body = `<text x="${n(el.x)}" y="${n(el.y)}" font-size="${n(el.size)}" font-family="${signFontFamily(opts.fontFiles[el.role])}" fill="${el.color}"${spacing} xml:space="preserve">${esc(el.text)}</text>`;
        // Oblique: skew around the baseline start, as the PDF does.
        return el.italic ? `<g transform="translate(${n(el.x)} ${n(el.y)}) skewX(${n((-Math.atan(ITALIC_SKEW) * 180) / Math.PI)}) translate(${n(-el.x)} ${n(-el.y)})">${body}</g>` : body;
      }
      case "path":
        return `<path d="${el.d}" fill="${el.fill}"${
          el.stroke ? ` stroke="${el.stroke}" stroke-width="${n(el.strokeWidth ?? 1)}"${el.dash ? ` stroke-dasharray="4 3"` : ""}` : ""
        }/>`;
      case "qr":
        return opts.qrs[el.qr] ? qrSvgMarkup(opts.qrs[el.qr], { x: el.x, y: el.y, px: el.size, dark: el.ink, star: el.star, logoHref: opts.logoHref }) : "";
      case "logo":
        return opts.logoHref
          ? `<image href="${opts.logoHref}" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" preserveAspectRatio="xMidYMid meet"/>`
          : "";
      case "googleMapsLogo":
        return `<image href="/google/GoogleMaps_Logo_Gray.svg" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.h * GOOGLE_MAPS_LOGO_RATIO)}" height="${n(el.h)}" aria-label="Google Maps"/>`;
      case "line":
        return `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" stroke="${el.color}" stroke-width="${n(el.width)}"${
          el.dots ? ` stroke-dasharray="0.1 ${n(el.width * 3)}" stroke-linecap="round"` : el.dash ? ` stroke-dasharray="6 4"` : ""
        }/>`;
    }
  };

  const single = opts.panelIndex !== undefined ? page.panels[opts.panelIndex] : null;
  const width = single ? single.w : page.width;
  const height = single ? single.h : page.height;
  const panels = (single ? [{ ...single, x: 0, y: 0, rotate: 0 as const }] : page.panels)
    .map((p) => {
      const transform = p.rotate === 180 ? `translate(${n(p.x + p.w)} ${n(p.y + p.h)}) rotate(180)` : `translate(${n(p.x)} ${n(p.y)})`;
      let clip = "";
      if (p.clip) {
        const id = `c${++gradientId}`;
        defs.push(`<clipPath id="${id}"><path d="${shapePath(p.clip)}"/></clipPath>`);
        clip = ` clip-path="url(#${id})"`;
      }
      return `<g transform="${transform}"><g${clip}>${p.elements.map(element).join("")}</g></g>`;
    })
    .join("");
  const marks = single ? "" : page.marks.map(element).join("");
  const watermark = opts.watermark
    ? `<text x="${n(width / 2)}" y="${n(height / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${n(width * 0.16)}" fill="#b8862f" fill-opacity="0.28" transform="rotate(-30 ${n(width / 2)} ${n(height / 2)})">${esc(opts.watermark)}</text>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<style>text{font-variant-ligatures:none;font-kerning:none}${signFontFaces(FONT_ROLES.map((r) => opts.fontFiles[r]), opts.embeddedFonts)}</style>` +
    (opts.transparent ? "" : `<rect width="${n(width)}" height="${n(height)}" fill="#ffffff"/>`) +
    `${panels}${marks}${watermark}` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    `</svg>`
  );
}

export interface SvgOptions {
  logoHref?: string | null;
  watermark?: string | null;
}

/** The review sign's preview. */
export function signSvg(layout: SignLayout, qr: ReviewQrGeometry, design: SignDesign, opts: SvgOptions = {}): string {
  return renderPageSvg(layout, { qrs: { main: qr }, fontFiles: designFontFiles(design), logoHref: opts.logoHref, watermark: opts.watermark });
}
