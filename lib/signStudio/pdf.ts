// Printouts as vector PDFs at the exact page size, with the chosen fonts
// embedded (whole: pdf-lib's subsetting drops letters from some fonts,
// e.g. Inter). Built on the server, after the plan check. The owner's
// logo never comes here: the PDF leaves its spots empty and says where
// they are (logoSlots), and the browser draws the logo in.

import {
  PDFDocument,
  appendBezierCurve,
  clip,
  closePath,
  concatTransformationMatrix,
  endPath,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { qrLayers, type ReviewQrGeometry } from "@/lib/reviewQr";
import { designFontFiles, type SignDesign } from "@/lib/signStudio/design";
import { FONT_ROLES, ITALIC_SKEW, mixColor, roundedRectPath, shapeCommands, type CardShape, type FontRole, type PrintPage, type SignElement, type SignPanel } from "@/lib/signStudio/elements";
import { NO_LIGATURES, fontkit, type FontBytes } from "@/lib/signStudio/fonts";
import type { SignLayout } from "@/lib/signStudio/layout";

/** Where a logo goes: page index, PDF points (origin bottom-left).
 * rotate 180 = an upside-down panel (the tent card's back). */
export interface LogoSlot {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: 0 | 180;
}

function color(hex: string) {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

/** Sutherland–Hodgman: a convex polygon clipped to [0,w]×[0,h]. */
function clipToRect(poly: Array<[number, number]>, w: number, h: number): Array<[number, number]> {
  const edges: Array<[(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]]> = [
    [(p) => p[0] >= 0, (a, b) => [0, a[1] + ((b[1] - a[1]) * (0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= 0, (a, b) => [a[0] + ((b[0] - a[0]) * (0 - a[1])) / (b[1] - a[1]), 0]],
    [(p) => p[1] <= h, (a, b) => [a[0] + ((b[0] - a[0]) * (h - a[1])) / (b[1] - a[1]), h]],
  ];
  let out = poly;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (out.length === 0) break;
  }
  return out;
}

/** The card shape as a PDF clipping path (panel coordinates, y up). */
function clipOperators(shape: CardShape, panelH: number) {
  const Y = (y: number) => panelH - y;
  const ops = shapeCommands(shape).map((c) => {
    if (c[0] === "M") return moveTo(c[1], Y(c[2]));
    if (c[0] === "L") return lineTo(c[1], Y(c[2]));
    if (c[0] === "C") return appendBezierCurve(c[1], Y(c[2]), c[3], Y(c[4]), c[5], Y(c[6]));
    return closePath();
  });
  return [...ops, clip(), endPath()];
}

export interface RenderPdfOptions {
  qrs: Record<string, ReviewQrGeometry>;
  fontBytes: FontBytes;
  title: string;
}

export async function renderPdf(pages: PrintPage[], opts: RenderPdfOptions): Promise<{ bytes: Uint8Array; logoSlots: LogoSlot[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(opts.title);
  doc.setCreator("");
  doc.setProducer("");
  const embedded = new Map<Uint8Array, Promise<PDFFont>>();
  const embed = (b: Uint8Array) => {
    if (!embedded.has(b)) embedded.set(b, doc.embedFont(b, { subset: false, features: { ...NO_LIGATURES } }));
    return embedded.get(b)!;
  };
  const fonts = {} as Record<FontRole, PDFFont>;
  for (const role of FONT_ROLES) fonts[role] = await embed(opts.fontBytes[role]);
  const logoSlots: LogoSlot[] = [];

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const layout = pages[pageIndex];
    const page = doc.addPage([layout.width, layout.height]);
    const slot = (p: SignPanel | null, x: number, y: number, w: number, h: number) => {
      // (x, y) top-left in panel coordinates (y down) → page, y up.
      if (!p) return logoSlots.push({ page: pageIndex, x, y: layout.height - y - h, w, h, rotate: 0 });
      if (p.rotate === 180) return logoSlots.push({ page: pageIndex, x: p.x + p.w - x - w, y: layout.height - (p.y + p.h - y), w, h, rotate: 180 });
      return logoSlots.push({ page: pageIndex, x: p.x + x, y: layout.height - (p.y + y) - h, w, h, rotate: 0 });
    };

    const draw = (pg: PDFPage, el: SignElement, panel: SignPanel | null, panelH: number) => {
      const top = { x: 0, y: panelH };
      switch (el.kind) {
        case "rect": {
          const d = roundedRectPath(el.x, el.y, el.w, el.h, el.r);
          if (el.gradient) {
            // A vector gradient as fine bands (no images). Gradient
            // rectangles are always square-cornered (the card layout
            // covers rounded corners itself), the same in the preview.
            const steps = 48;
            const g = el.gradient;
            for (let i = 0; i < steps; i++) {
              const c = color(mixColor(g.from, g.to, i / (steps - 1)));
              if (g.angle === 0) pg.drawRectangle({ x: el.x + (el.w * i) / steps, y: panelH - el.y - el.h, width: el.w / steps + 0.5, height: el.h, color: c });
              else if (g.angle === 90) pg.drawRectangle({ x: el.x, y: panelH - el.y - (el.h * (i + 1)) / steps, width: el.w, height: el.h / steps + 0.5, color: c });
              else {
                // Diagonal bands (along x + y), clipped to the rectangle.
                const span = el.w + el.h;
                const a = (span * i) / steps;
                const b = (span * (i + 1)) / steps + 0.5;
                const band: Array<[number, number]> = [
                  [a, 0],
                  [b, 0],
                  [b - el.h, el.h],
                  [a - el.h, el.h],
                ];
                const clipped = clipToRect(band, el.w, el.h);
                if (clipped.length >= 3) pg.drawSvgPath(`M${clipped.map(([px, py]) => `${el.x + px} ${el.y + py}`).join("L")}Z`, { ...top, color: c });
              }
            }
            if (el.stroke) pg.drawSvgPath(d, { ...top, borderColor: color(el.stroke), borderWidth: el.strokeWidth, borderDashArray: el.dash ? [4, 3] : undefined });
            return;
          }
          pg.drawSvgPath(d, {
            ...top,
            color: el.fill ? color(el.fill) : undefined,
            borderColor: el.stroke ? color(el.stroke) : undefined,
            borderWidth: el.stroke ? el.strokeWidth : 0,
            borderDashArray: el.stroke && el.dash ? [4, 3] : undefined,
          });
          return;
        }
        case "text": {
          const y = panelH - el.y;
          if (el.letterSpacing) pg.pushOperators(setCharacterSpacing(el.letterSpacing));
          if (el.italic) {
            pg.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, ITALIC_SKEW, 1, el.x - ITALIC_SKEW * y, 0));
            pg.drawText(el.text, { x: 0, y, size: el.size, font: fonts[el.role], color: color(el.color) });
            pg.pushOperators(popGraphicsState());
          } else {
            pg.drawText(el.text, { x: el.x, y, size: el.size, font: fonts[el.role], color: color(el.color) });
          }
          if (el.letterSpacing) pg.pushOperators(setCharacterSpacing(0));
          return;
        }
        case "path":
          if (el.stroke) {
            pg.drawSvgPath(el.d, {
              ...top,
              color: el.fill && el.fill !== "none" ? color(el.fill) : undefined,
              borderColor: color(el.stroke),
              borderWidth: el.strokeWidth ?? 1,
              borderDashArray: el.dash ? [4, 3] : undefined,
            });
          } else pg.drawSvgPath(el.d, { ...top, color: color(el.fill) });
          return;
        case "qr": {
          const qr = opts.qrs[el.qr];
          if (!qr) return;
          const scale = el.size / qr.size;
          pg.drawRectangle({ x: el.x, y: panelH - el.y - el.size, width: el.size, height: el.size, color: rgb(1, 1, 1) });
          for (const layer of qrLayers(qr, el.ink, el.star)) pg.drawSvgPath(layer.d, { x: el.x, y: panelH - el.y, scale, color: color(layer.fill) });
          const box = qr.badge?.logoBox;
          if (box) slot(panel, el.x + box.x * scale, el.y + box.y * scale, box.size * scale, box.size * scale);
          return;
        }
        case "logo":
          slot(panel, el.x, el.y, el.w, el.h);
          return;
        case "line":
          pg.drawLine({
            start: { x: el.x1, y: panelH - el.y1 },
            end: { x: el.x2, y: panelH - el.y2 },
            thickness: el.width,
            color: color(el.color),
            dashArray: el.dots ? [0.1, el.width * 3] : el.dash ? [6, 4] : undefined,
            lineCap: el.dots ? 1 : undefined,
          });
          return;
      }
    };

    for (const p of layout.panels) {
      const x0 = p.x;
      const y0 = layout.height - p.y - p.h;
      page.pushOperators(
        pushGraphicsState(),
        p.rotate === 180 ? concatTransformationMatrix(-1, 0, 0, -1, x0 + p.w, y0 + p.h) : concatTransformationMatrix(1, 0, 0, 1, x0, y0)
      );
      if (p.clip) page.pushOperators(...clipOperators(p.clip, p.h));
      for (const el of p.elements) draw(page, el, p, p.h);
      page.pushOperators(popGraphicsState());
    }
    for (const el of layout.marks) draw(page, el, null, layout.height);
  }
  return { bytes: await doc.save(), logoSlots };
}

/** The review sign as a one-page PDF. */
export async function signPdf(
  layout: SignLayout,
  qr: ReviewQrGeometry,
  _design: SignDesign,
  fontBytes: FontBytes,
  title: string
): Promise<{ bytes: Uint8Array; logoSlots: LogoSlot[] }> {
  return renderPdf([layout], { qrs: { main: qr }, fontBytes, title });
}

export { designFontFiles };
