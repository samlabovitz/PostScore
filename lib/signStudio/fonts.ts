// Text measuring for every printout, from the same TTF files the PDF
// embeds (public/sign-fonts), so the preview wraps exactly like the PDF.

import * as fontkitModule from "@pdf-lib/fontkit";
import type { Font as FontkitFont } from "@pdf-lib/fontkit";
import { designFontFiles, type FontId } from "@/lib/signStudio/design";
import { FONT_ROLES, type FontRole, type Measurer } from "@/lib/signStudio/elements";

/** @pdf-lib/fontkit is UMD: Node sees named exports, bundlers (its ES
 * build) only a default export. This is the same object either way. */
export const fontkit = ((fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule) as typeof fontkitModule;

export type FontBytes = Record<FontRole, Uint8Array>;

/** Ligatures off everywhere (measuring, PDF, preview): pdf-lib draws
 * "ff" as two letters, so measuring it as one glyph left a gap. */
export const NO_LIGATURES = { liga: false, dlig: false, clig: false, calt: false } as const;

export function createMeasurer(bytes: FontBytes): Measurer {
  const fonts = new Map<Uint8Array, FontkitFont>();
  const font = (role: FontRole) => {
    const b = bytes[role];
    if (!fonts.has(b)) fonts.set(b, fontkit.create(b));
    return fonts.get(b)!;
  };
  return {
    width(text, role, size, letterSpacing = 0) {
      const f = font(role);
      const run = f.layout(text, { ...NO_LIGATURES });
      let units = 0;
      for (const g of run.glyphs) units += g.advanceWidth;
      return (units / f.unitsPerEm) * size + letterSpacing * Array.from(text).length;
    },
    supports(ch, role) {
      return font(role).hasGlyphForCodePoint(ch.codePointAt(0)!);
    },
  };
}

/** Loads the font files for each role with `read(file)` (fs on the
 * server, fetch in the browser), deduplicated. */
export async function loadFontFiles(files: Record<FontRole, string>, read: (file: string) => Promise<Uint8Array>): Promise<FontBytes> {
  const cache = new Map<string, Promise<Uint8Array>>();
  const get = (file: string) => {
    if (!cache.has(file)) cache.set(file, read(file));
    return cache.get(file)!;
  };
  const loaded = await Promise.all(FONT_ROLES.map((r) => get(files[r])));
  return Object.fromEntries(FONT_ROLES.map((r, i) => [r, loaded[i]])) as FontBytes;
}

export function loadDesignFonts(design: { headlineFont: FontId; bodyFont: FontId }, read: (file: string) => Promise<Uint8Array>): Promise<FontBytes> {
  return loadFontFiles(designFontFiles(design), read);
}
