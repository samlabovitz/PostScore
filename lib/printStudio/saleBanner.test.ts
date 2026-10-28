import { beforeAll, describe, expect, test } from "vitest";
import { CARD_SHEETS, CARD_SIZES, cardColors, defaultCardDesign, type CardBusiness, type CardDesign, type CardSize } from "@/lib/printStudio/design";
import { balancedWrap, layoutSingleCard, pillFill } from "@/lib/printStudio/layout";
import { contrastRatio, SIGN_THEMES, THEME_COLORS } from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import type { Measurer, SignElement } from "@/lib/signStudio/elements";

// "Bold sale banner" (Day 21): a full-width band with the offer on 1–2
// balanced lines, a two-column bottom, no icon — for short and long
// offers, the ___ placeholder, Spanish, every size and every theme.

const business: CardBusiness = { businessName: "Hair express on Broadway", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", googleMapsUri: "https://maps.google.com/?cid=1", website: null, address: "123 Broadway", hours: null, icon: "bag" };
const OFFERS: Array<[string, "en" | "es"]> = [
  ["10% off", "en"],
  ["$10 off a $50+ purchase or visit", "en"],
  ["___% off your next visit", "en"],
  ["20 % de descuento en su próxima visita", "es"],
];
// Every theme, plus custom combos that pass the export's contrast check.
const PALETTES: Array<Pick<CardDesign, "theme" | "customColors">> = [
  ...SIGN_THEMES.map((theme) => ({ theme, customColors: THEME_COLORS[theme] })),
  { theme: "custom", customColors: { background: "#fff4e6", text: "#7a2e0e", accent: "#c2410c" } },
  { theme: "custom", customColors: { background: "#0f3d2e", text: "#f0fdf4", accent: "#86efac" } },
  { theme: "custom", customColors: { background: "#ffffff", text: "#1d4ed8", accent: "#1d4ed8" } },
];

let m: Measurer;
beforeAll(async () => {
  m = createMeasurer(await loadDesignFonts(defaultCardDesign("coupon", "en", "x"), readSignFont));
});

function card(offer: string, locale: "en" | "es", size: CardSize, palette: Pick<CardDesign, "theme" | "customColors"> = PALETTES[0]) {
  const design: CardDesign = { ...defaultCardDesign("coupon", locale, business.businessName!, "bag"), template: "saleBanner", offer, size, expiration: "2026-12-31", code: "HAIR10", ...palette };
  const one = layoutSingleCard({ design, business, credit: false, logo: null, hasQr: () => true }, m);
  const els = one.front.panels[0].elements;
  const { w, h } = CARD_SHEETS[size];
  const band = els.find((e): e is Extract<SignElement, { kind: "rect" }> => e.kind === "rect" && e.x === 0 && e.y === 0 && e.w === w && e.h < h)!;
  const texts = els.filter((e): e is Extract<SignElement, { kind: "text" }> => e.kind === "text");
  const offerLines = texts.filter((e) => e.role === "headline" || e.role === "headlineRegular");
  const qr = els.find((e): e is Extract<SignElement, { kind: "qr" }> => e.kind === "qr");
  return { design, els, w, h, band, texts, offerLines, qr };
}

describe("the offer: large, centered, 1–2 balanced lines, never 3", () => {
  for (const size of CARD_SIZES) {
    for (const [offer, locale] of OFFERS) {
      test(`${size} · "${offer}"`, () => {
        const c = card(offer, locale, size);
        expect(c.offerLines.length).toBeGreaterThanOrEqual(1);
        expect(c.offerLines.length).toBeLessThanOrEqual(2);
        // Every word printed, none split.
        expect(c.offerLines.map((l) => l.text).join(" ")).toBe(offer);
        for (const l of c.offerLines) {
          const lw = m.width(l.text, l.role, l.size, l.letterSpacing ?? 0);
          // Centered, inside the band and the padding.
          expect(Math.abs(l.x + lw / 2 - c.w / 2)).toBeLessThan(1);
          expect(l.x).toBeGreaterThanOrEqual(9);
          expect(l.x + lw).toBeLessThanOrEqual(c.w - 9);
          expect(l.y).toBeLessThan(c.band.h);
        }
        if (c.offerLines.length === 2) expect(c.offerLines[1].text.startsWith("%")).toBe(false);
      });
    }
  }

  test("a short offer gets bigger type than a long one", () => {
    expect(card("10% off", "en", "card4x6").offerLines[0].size).toBeGreaterThan(card("$10 off a $50+ purchase or visit", "en", "card4x6").offerLines[0].size);
  });

  test("balanced breaks: no lone last word, no word split, no line starting with %, null instead of a third line", () => {
    const lines = balancedWrap("$10 off a $50+ purchase or visit", m, "headline", 30, 300, 2)!;
    expect(lines).toHaveLength(2);
    const [a, b] = lines.map((l) => m.width(l, "headline", 30));
    expect(Math.abs(a - b)).toBeLessThan(Math.max(a, b) * 0.5);
    expect(lines[1].split(" ").length).toBeGreaterThan(1);
    expect(balancedWrap("20 % off", m, "headline", 30, m.width("20 % off", "headline", 30) - 1, 2)).toEqual(["20 %", "off"]);
    expect(balancedWrap("Supercalifragilistic", m, "headline", 30, 60, 2)).toBeNull();
    expect(balancedWrap("one two three four five six seven eight", m, "headline", 30, 120, 2)).toBeNull();
  });
});

describe("layout: band edge to edge, two columns below, nothing touching the edges", () => {
  for (const size of CARD_SIZES) {
    test(size, () => {
      const c = card("$10 off a $50+ purchase or visit", "en", size);
      // The band spans the whole card, ~45% (never under a third).
      expect(c.band.w).toBe(c.w);
      expect(c.band.h / c.h).toBeGreaterThanOrEqual(0.34);
      expect(c.band.h / c.h).toBeLessThanOrEqual(0.451);
      // The QR is below the band, on the right, never over the left column.
      expect(c.qr!.y).toBeGreaterThan(c.band.h);
      expect(c.qr!.x + c.qr!.size).toBeLessThanOrEqual(c.w - 9);
      const bottomText = c.texts.filter((t) => t.y > c.band.h);
      for (const t of bottomText) {
        expect(t.x).toBeGreaterThanOrEqual(9);
        if (t.y < c.qr!.y + c.qr!.size) expect(t.x + m.width(t.text, t.role, t.size, t.letterSpacing ?? 0)).toBeLessThan(c.qr!.x);
      }
      // Name, then the code + expiry in its pill.
      expect(bottomText.some((t) => t.text === "HAIR EXPRESS ON BROADWAY")).toBe(true);
      const code = bottomText.find((t) => t.text.startsWith("Code HAIR10"))!;
      // One line, or broken only at " · " — never inside the date.
      expect(bottomText.some((t) => t.text.endsWith("Valid until Dec 31, 2026"))).toBe(true);
      const pill = c.els.find((e) => e.kind === "rect" && e.y > c.band.h && e.x <= code.x && e.y <= code.y && e.y + (e as { h: number }).h >= code.y);
      expect(pill).toBeDefined();
      // No icon (no filled icon path in the accent color).
      expect(c.els.some((e) => e.kind === "path" && e.fill === cardColors(c.design).accent && !e.d.includes("a"))).toBe(false);
    });
  }

  test("the QR keeps its print size; the caption shows where it fits (dropped only on wallet cards)", () => {
    expect(card("10% off", "en", "wallet").qr!.size).toBeGreaterThanOrEqual(57.6);
    for (const size of ["card4x6", "card5x7", "halfPage", "fullPage"] as const) {
      expect(card("10% off", "en", size).texts.some((t) => t.text.startsWith("Scan for"))).toBe(true);
    }
  });
});

describe("every color combo stays readable", () => {
  for (const palette of PALETTES) {
    test(`${palette.theme} ${JSON.stringify(palette.customColors)}`, () => {
      const c = card("$10 off a $50+ purchase or visit", "en", "card4x6", palette);
      // The band is the darker color, its text the lighter: same pair the
      // export's contrast check already requires (4.5:1).
      for (const l of c.offerLines) expect(contrastRatio(l.color, c.band.fill!)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c.band.fill!, "#ffffff")).toBeGreaterThanOrEqual(contrastRatio(c.offerLines[0].color, "#ffffff"));
      // Below the band: dark text on the light color; the code pill too.
      const light = c.offerLines[0].color;
      for (const t of c.texts.filter((t) => t.y > c.band.h)) expect(contrastRatio(t.color, light)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(c.band.fill!, pillFill({ background: light, text: c.band.fill!, accent: cardColors(c.design).accent }))).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("Spanish and the ___ placeholder print as written", () => {
    expect(card("20 % de descuento en su próxima visita", "es", "wallet").texts.some((t) => t.text === "POR TIEMPO LIMITADO")).toBe(true);
    expect(card("___% off your next visit", "en", "wallet").offerLines.map((l) => l.text).join(" ")).toContain("___%");
  });
});
