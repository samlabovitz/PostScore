// The sign layout as SVG — the Sign Studio's live preview. Fonts come
// from the same files the PDF embeds (@font-face on /sign-fonts).

import { qrSvgMarkup, type ReviewQrGeometry } from "@/lib/reviewQr";
import { designColors, designFontFiles, qrInk, type SignDesign } from "@/lib/signStudio/design";
import type { FontRole, SignElement, SignLayout } from "@/lib/signStudio/layout";

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

export function signFontFaces(files: string[]): string {
  return Array.from(new Set(files))
    .map((f) => `@font-face{font-family:"${signFontFamily(f)}";src:url("/sign-fonts/${f}") format("truetype");font-display:block}`)
    .join("");
}

export interface SvgOptions {
  logoHref?: string | null;
  /** A diagonal "Premium" watermark (Grow previewing a Premium option). */
  watermark?: string | null;
}

export function signSvg(layout: SignLayout, qr: ReviewQrGeometry, design: SignDesign, opts: SvgOptions = {}): string {
  const files = designFontFiles(design);
  const family: Record<FontRole, string> = {
    headline: signFontFamily(files.headline),
    body: signFontFamily(files.body),
    bodyBold: signFontFamily(files.bodyBold),
  };
  const colors = designColors(design);
  const ink = qrInk(colors);
  const star = design.theme === "clean" ? ink : "#b8862f";

  const element = (el: SignElement): string => {
    switch (el.kind) {
      case "rect":
        return `<rect x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" rx="${n(el.r)}" fill="${el.fill ?? "none"}"${
          el.stroke ? ` stroke="${el.stroke}" stroke-width="${n(el.strokeWidth)}"` : ""
        }/>`;
      case "text":
        return `<text x="${n(el.x)}" y="${n(el.y)}" font-size="${n(el.size)}" font-family="${family[el.role]}" fill="${el.color}" xml:space="preserve">${esc(el.text)}</text>`;
      case "path":
        return `<path d="${el.d}" fill="${el.fill}"/>`;
      case "qr":
        return qrSvgMarkup(qr, { x: el.x, y: el.y, px: el.size, dark: ink, star, logoHref: opts.logoHref });
      case "logo":
        return opts.logoHref
          ? `<image href="${opts.logoHref}" x="${n(el.x)}" y="${n(el.y)}" width="${n(el.w)}" height="${n(el.h)}" preserveAspectRatio="xMidYMid meet"/>`
          : "";
      case "line":
        return `<line x1="${n(el.x1)}" y1="${n(el.y1)}" x2="${n(el.x2)}" y2="${n(el.y2)}" stroke="${el.color}" stroke-width="${n(el.width)}"${el.dash ? ` stroke-dasharray="6 4"` : ""}/>`;
    }
  };

  const panels = layout.panels
    .map((p) => {
      const transform = p.rotate === 180 ? `translate(${n(p.x + p.w)} ${n(p.y + p.h)}) rotate(180)` : `translate(${n(p.x)} ${n(p.y)})`;
      return `<g transform="${transform}">${p.elements.map(element).join("")}</g>`;
    })
    .join("");
  const marks = layout.marks.map(element).join("");
  const watermark = opts.watermark
    ? `<text x="${n(layout.width / 2)}" y="${n(layout.height / 2)}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="${n(layout.width * 0.16)}" fill="#b8862f" fill-opacity="0.28" transform="rotate(-30 ${n(layout.width / 2)} ${n(layout.height / 2)})">${esc(opts.watermark)}</text>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.width} ${layout.height}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">` +
    `<style>${signFontFaces([files.headline, files.body, files.bodyBold])}</style>` +
    `<rect width="${layout.width}" height="${layout.height}" fill="#ffffff"/>${panels}${marks}${watermark}</svg>`
  );
}
