// The sign as a vector PDF at the exact chosen size, with the chosen
// fonts embedded (whole: pdf-lib's subsetting drops letters from some
// fonts, e.g. Inter). Built on the server, after the plan check.
// The owner's logo never comes here: the PDF leaves its spots empty and
// says where they are (logoSlots), and the browser draws the logo in.

import { PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { qrLayers, type ReviewQrGeometry } from "@/lib/reviewQr";
import { designColors, qrInk, type SignDesign } from "@/lib/signStudio/design";
import { fontkit, type FontBytes } from "@/lib/signStudio/fonts";
import type { FontRole, SignElement, SignLayout } from "@/lib/signStudio/layout";

/** Where a logo goes, in PDF points (origin bottom-left). rotate 180 =
 * the upside-down half of the tent card. */
export interface LogoSlot {
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

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `M${x} ${y}h${w}v${h}h${-w}Z`;
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
}

export async function signPdf(
  layout: SignLayout,
  qr: ReviewQrGeometry,
  design: SignDesign,
  fontBytes: FontBytes,
  title: string
): Promise<{ bytes: Uint8Array; logoSlots: LogoSlot[] }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(title);
  doc.setCreator("");
  doc.setProducer("");
  const embedded = new Map<Uint8Array, Promise<PDFFont>>();
  const embed = (b: Uint8Array) => {
    if (!embedded.has(b)) embedded.set(b, doc.embedFont(b, { subset: false }));
    return embedded.get(b)!;
  };
  const fonts: Record<FontRole, PDFFont> = {
    headline: await embed(fontBytes.headline),
    body: await embed(fontBytes.body),
    bodyBold: await embed(fontBytes.bodyBold),
  };
  const colors = designColors(design);
  const ink = qrInk(colors);
  const star = design.theme === "clean" ? ink : "#b8862f";
  const page = doc.addPage([layout.width, layout.height]);
  const logoSlots: LogoSlot[] = [];

  const slot = (p: { x: number; y: number; w: number; h: number; rotate: 0 | 180 } | null, x: number, y: number, w: number, h: number) => {
    // (x, y) top-left in panel coordinates (y down) → page, y up.
    if (!p) return logoSlots.push({ x, y: layout.height - y - h, w, h, rotate: 0 });
    if (p.rotate === 180) return logoSlots.push({ x: p.x + p.w - x - w, y: layout.height - (p.y + p.h - y), w, h, rotate: 180 });
    return logoSlots.push({ x: p.x + x, y: layout.height - (p.y + y) - h, w, h, rotate: 0 });
  };

  const draw = (pg: PDFPage, el: SignElement, panel: { x: number; y: number; w: number; h: number; rotate: 0 | 180 } | null, panelH: number) => {
    const top = { x: 0, y: panelH };
    switch (el.kind) {
      case "rect":
        pg.drawSvgPath(roundedRect(el.x, el.y, el.w, el.h, el.r), {
          ...top,
          color: el.fill ? color(el.fill) : undefined,
          borderColor: el.stroke ? color(el.stroke) : undefined,
          borderWidth: el.stroke ? el.strokeWidth : 0,
        });
        return;
      case "text":
        pg.drawText(el.text, { x: el.x, y: panelH - el.y, size: el.size, font: fonts[el.role], color: color(el.color) });
        return;
      case "path":
        pg.drawSvgPath(el.d, { ...top, color: color(el.fill) });
        return;
      case "qr": {
        const scale = el.size / qr.size;
        pg.drawRectangle({ x: el.x, y: panelH - el.y - el.size, width: el.size, height: el.size, color: rgb(1, 1, 1) });
        for (const layer of qrLayers(qr, ink, star)) pg.drawSvgPath(layer.d, { x: el.x, y: panelH - el.y, scale, color: color(layer.fill) });
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
          dashArray: el.dash ? [6, 4] : undefined,
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
    for (const el of p.elements) draw(page, el, p, p.h);
    page.pushOperators(popGraphicsState());
  }
  for (const el of layout.marks) draw(page, el, null, layout.height);
  return { bytes: await doc.save(), logoSlots };
}
