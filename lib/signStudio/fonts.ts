// Text measuring for the sign layout, from the same TTF files the PDF
// embeds (public/sign-fonts), so the preview wraps exactly like the PDF.

import * as fontkitModule from "@pdf-lib/fontkit";
import type { Font as FontkitFont } from "@pdf-lib/fontkit";
import { designFontFiles, type SignDesign } from "@/lib/signStudio/design";
import type { FontRole, Measurer } from "@/lib/signStudio/layout";

/** @pdf-lib/fontkit is UMD: Node sees named exports, bundlers (its ES
 * build) only a default export. This is the same object either way. */
export const fontkit = ((fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule) as typeof fontkitModule;

export type FontBytes = Record<FontRole, Uint8Array>;

export function createMeasurer(bytes: FontBytes): Measurer {
  const fonts = {} as Record<FontRole, FontkitFont>;
  for (const role of ["headline", "body", "bodyBold"] as FontRole[]) fonts[role] = fontkit.create(bytes[role]);
  return {
    width(text, role, size) {
      const font = fonts[role];
      const run = font.layout(text);
      let units = 0;
      for (const g of run.glyphs) units += g.advanceWidth;
      return (units / font.unitsPerEm) * size;
    },
    supports(ch, role) {
      return fonts[role].hasGlyphForCodePoint(ch.codePointAt(0)!);
    },
  };
}

/** Loads a design's three font files with `read(file)` (fs on the
 * server, fetch in the browser), deduplicated. */
export async function loadDesignFonts(design: Pick<SignDesign, "headlineFont" | "bodyFont">, read: (file: string) => Promise<Uint8Array>): Promise<FontBytes> {
  const files = designFontFiles(design);
  const cache = new Map<string, Promise<Uint8Array>>();
  const get = (file: string) => {
    if (!cache.has(file)) cache.set(file, read(file));
    return cache.get(file)!;
  };
  const [headline, body, bodyBold] = await Promise.all([get(files.headline), get(files.body), get(files.bodyBold)]);
  return { headline, body, bodyBold };
}
