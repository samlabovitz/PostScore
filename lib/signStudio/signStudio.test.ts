import { beforeAll, describe, expect, it } from "vitest";
import { qrLayers, reviewQrGeometry, type QrCenter, type QrCorners, type QrDots } from "@/lib/reviewQr";
import { buildGoogleReviewUrl } from "@/lib/reviews";
import { Raster, scanRaster } from "@/lib/qrRaster.testUtil";
import {
  FONT_IDS,
  MADE_WITH,
  MIN_QR_POINTS,
  QR_CENTERS,
  QR_CORNERS,
  QR_DOTS,
  SIGN_LANGUAGES,
  SIGN_SIZES,
  SIGN_TEMPLATES,
  SIGN_THEMES,
  basicDesign,
  contrastProblems,
  defaultDesign,
  designColors,
  effectiveDesign,
  parseStoredLogo,
  qrInk,
  qrStyleOf,
  sanitizeDesign,
  signAccess,
  type SignContent,
  type SignDesign,
  type SignThemeId,
} from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import { layoutSign, PAGE_POINTS, type Measurer, type SignLayout } from "@/lib/signStudio/layout";

const URL = buildGoogleReviewUrl("ChIJN1t_tDeuEmsRUsoyG83frY4");
const CONTENT: SignContent = {
  businessName: "Modern Liquors",
  rating: 4.5,
  reviewCount: 15,
  verifiedSocials: [{ platform: "Instagram", url: "instagram.com/modernliquors" }],
};
const CUSTOM = { background: "#fdf6ec", text: "#3b1d0e", accent: "#a0461c" };

const measurers = new Map<string, Measurer>();
async function measurer(d: Pick<SignDesign, "headlineFont" | "bodyFont">): Promise<Measurer> {
  const key = `${d.headlineFont}|${d.bodyFont}`;
  if (!measurers.has(key)) measurers.set(key, createMeasurer(await loadDesignFonts(d, readSignFont)));
  return measurers.get(key)!;
}

const design = (over: Partial<SignDesign> = {}): SignDesign => ({ ...defaultDesign("en"), customColors: CUSTOM, ...over });

function texts(layout: SignLayout): string[] {
  return layout.panels.flatMap((p) => p.elements.flatMap((el) => (el.kind === "text" ? [el.text] : [])));
}

/**
 * Paints the first panel's QR exactly as the PDF draws it — on the sign's
 * background, on its white tile, in the sign's QR ink, with a stand-in
 * logo where the owner's logo goes — and reads it back with jsQR.
 */
function scanSign(layout: SignLayout, d: SignDesign, hasLogo: boolean, pxPerModule = 6): string | null {
  const panel = layout.panels[layout.panels.length - 1];
  const geo = reviewQrGeometry(URL, qrStyleOf(d, hasLogo));
  const qrIndex = panel.elements.findIndex((el) => el.kind === "qr");
  const qrEl = panel.elements[qrIndex];
  if (!qrEl || qrEl.kind !== "qr") return null;
  const scale = (pxPerModule * geo.size) / qrEl.size; // px per point
  const margin = 24;
  const tile = panel.elements[qrIndex - 1]; // the white tile is drawn right before the code
  const side = Math.ceil(qrEl.size * scale + 2 * margin + 30);
  const raster = new Raster(side, side, designColors(d).background);
  const ox = margin + 15;
  if (tile && tile.kind === "rect") raster.fillRect(ox - (qrEl.x - tile.x) * scale, ox - (qrEl.y - tile.y) * scale, tile.w * scale, tile.h * scale, "#ffffff");
  raster.fillRect(ox, ox, qrEl.size * scale, qrEl.size * scale, "#ffffff");
  const star = d.theme === "clean" ? qrInk(designColors(d)) : "#b8862f";
  for (const layer of qrLayers(geo, qrInk(designColors(d)), star)) raster.fillPath(layer.d, layer.fill, pxPerModule, ox, ox);
  const box = geo.badge?.logoBox;
  if (box) {
    // A busy two-color stand-in logo, filling its whole box.
    raster.fillRect(ox + box.x * pxPerModule, ox + box.y * pxPerModule, box.size * pxPerModule, box.size * pxPerModule, "#c0392b");
    raster.fillRect(ox + box.x * pxPerModule, ox + (box.y + box.size / 2) * pxPerModule, box.size * pxPerModule, (box.size / 4) * pxPerModule, "#111111");
  }
  return scanRaster(raster);
}

beforeAll(async () => {
  for (const f of FONT_IDS) await measurer({ headlineFont: f, bodyFont: f });
  await measurer({ headlineFont: "playfair", bodyFont: "inter" });
}, 30_000);

describe("every template, theme and QR style scans back to exactly the review link", () => {
  const THEMES: SignThemeId[] = [...SIGN_THEMES, "custom"];
  it.each(SIGN_TEMPLATES)("%s", async (template) => {
    const failures: string[] = [];
    for (const theme of THEMES)
      for (const qrDots of QR_DOTS)
        for (const qrCorners of QR_CORNERS)
          for (const qrCenter of QR_CENTERS) {
            const d = design({ template, theme, qrDots, qrCorners, qrCenter, size: "card4x6", logoTop: qrCenter === "logo" });
            const hasLogo = qrCenter === "logo";
            const layout = layoutSign({ design: d, content: CONTENT, credit: false, logo: hasLogo ? { aspect: 1.6 } : null }, await measurer(d));
            if (scanSign(layout, d, hasLogo) !== URL) failures.push(`${theme}/${qrDots}/${qrCorners}/${qrCenter}`);
          }
    expect(failures).toEqual([]);
  }, 60_000);

  it.each(SIGN_SIZES)("on the %s size too", async (size) => {
    const d = design({ size, qrCenter: "logo" });
    const layout = layoutSign({ design: d, content: CONTENT, credit: false, logo: { aspect: 1 } }, await measurer(d));
    expect(scanSign(layout, d, true)).toBe(URL);
  });

  it("uses the highest error correction whenever the center is covered (star or logo)", () => {
    const plain = reviewQrGeometry(URL, { dots: "rounded", corners: "rounded", center: "none" });
    for (const center of ["star", "logo"] as QrCenter[]) {
      const covered = reviewQrGeometry(URL, { dots: "rounded" as QrDots, corners: "rounded" as QrCorners, center });
      expect(covered.size).toBeGreaterThan(plain.size); // level H needs a bigger symbol
      // The logo stays small: under a quarter of the code's width.
      if (covered.badge?.logoBox) expect(covered.badge.logoBox.size / covered.size).toBeLessThan(0.25);
    }
  });
});

describe("layout", () => {
  it("prints the QR at least 1.5 inches wide for every template, size, language and font — even with long text", async () => {
    for (const template of SIGN_TEMPLATES)
      for (const size of SIGN_SIZES)
        for (const language of SIGN_LANGUAGES)
          for (const font of ["oswald", "playfair", "poppins"] as const) {
            const d = design({
              template,
              size,
              language,
              headlineFont: font,
              bodyFont: font,
              textSize: "large",
              headline: "custom",
              customHeadline: "W".repeat(50),
              subline: "Thank you so much for shopping local with our family business this year!!",
              showRating: true,
              follow: CONTENT.verifiedSocials[0].url,
              logoTop: true,
            });
            let layout: SignLayout;
            try {
              layout = layoutSign({ design: d, content: { ...CONTENT, businessName: "The Very Long Name Wine & Spirits Warehouse" }, credit: true, logo: { aspect: 3 } }, await measurer(d));
            } catch {
              throw new Error(`no fit: ${template}/${size}/${language}/${font}`);
            }
            expect(layout.qrPoints, `${template}/${size}/${language}/${font}`).toBeGreaterThanOrEqual(MIN_QR_POINTS);
            expect([layout.width, layout.height]).toEqual(PAGE_POINTS[size]);
          }
  }, 60_000);

  it("tent card: one letter page, top half upside down, dashed fold line; 4-up: four cards with cut lines", async () => {
    const m = await measurer(design());
    const tent = layoutSign({ design: design({ size: "tent" }), content: CONTENT, credit: false, logo: null }, m);
    expect(tent.panels.map((p) => p.rotate)).toEqual([180, 0]);
    expect(tent.marks).toEqual([expect.objectContaining({ kind: "line", y1: 396, dash: true })]);
    const four = layoutSign({ design: design({ size: "cards4" }), content: CONTENT, credit: false, logo: null }, m);
    expect(four.panels).toHaveLength(4);
    expect(four.marks).toHaveLength(2);
  });

  it("rating only from a real 4.0★+ Google rating; Follow us only from a verified profile; no PostScore on Premium signs", async () => {
    const m = await measurer(design());
    const t = (d: SignDesign, c: SignContent = CONTENT, credit = false) => texts(layoutSign({ design: d, content: c, credit, logo: null }, m)).join(" ");
    expect(t(design({ showRating: true }))).toContain("4.5");
    expect(t(design({ showRating: true }), { ...CONTENT, rating: 3.9 })).not.toMatch(/3\.9|on Google/);
    expect(t(design({ follow: "instagram.com/modernliquors" }))).toContain("Follow us · instagram.com/modernliquors");
    expect(t(design({ follow: "instagram.com/someone-else" }))).not.toContain("Follow us");
    expect(t(design({ language: "both" }))).toContain("Toma 30 segundos");
    expect(t(design())).not.toMatch(/postscore/i);
    expect(t(basicDesign({ theme: "classic", size: "tent" }, "en"), CONTENT, true)).toContain(MADE_WITH);
  });
});

describe("plans", () => {
  it("Free: no sign; Grow: basic; Premium and Multi: the Sign Studio", () => {
    expect(signAccess("free")).toBe("none");
    expect(signAccess("grow")).toBe("basic");
    expect(signAccess("premium")).toBe("studio");
    expect(signAccess("multi")).toBe("studio");
    expect(effectiveDesign("free", design(), CONTENT, "en")).toBeNull();
  });

  it("Grow only ever gets its 2 options, whatever is sent", () => {
    const tampered = design({ template: "banner", theme: "bold", size: "cards4", headlineFont: "oswald", qrDots: "dots", subline: "x", follow: "instagram.com/modernliquors", headline: "custom", customHeadline: "Hacked" });
    const grow = effectiveDesign("grow", tampered, CONTENT, "en")!;
    expect(grow.credit).toBe(true);
    expect(grow.design).toEqual(basicDesign({ theme: "classic", size: "tent" }, "en"));
    expect(effectiveDesign("grow", { theme: "clean", size: "letter", template: "banner" }, CONTENT, "es")!.design).toEqual(basicDesign({ theme: "clean", size: "letter" }, "es"));
  });

  it("Premium keeps its design, but never an unverified Follow us or a sub-4.0 rating", () => {
    const premium = effectiveDesign("premium", design({ template: "banner", follow: "instagram.com/fake", showRating: true }), { ...CONTENT, rating: 3.8 }, "en")!;
    expect(premium.credit).toBe(false);
    expect(premium.design.template).toBe("banner");
    expect(premium.design.follow).toBeNull();
    expect(premium.design.showRating).toBe(false);
  });
});

describe("colors", () => {
  it("flags hard-to-read pairs and always keeps the QR dark on its white tile", () => {
    expect(contrastProblems({ background: "#ffffff", text: "#dddddd", accent: "#000000" })).toEqual(["text"]);
    expect(contrastProblems({ background: "#14243f", text: "#ffffff", accent: "#1d2f52" })).toEqual(["accent"]);
    for (const theme of SIGN_THEMES) expect(contrastProblems(designColors(design({ theme })))).toEqual([]);
    expect(qrInk({ background: "#14243f", text: "#ffffff", accent: "#e2b961" })).toBe("#14243f");
    expect(qrInk({ background: "#ffffff", text: "#000000", accent: "#000000" })).toBe("#000000");
  });

  it("sanitizes anything stored or sent", () => {
    const d = sanitizeDesign({ template: "poster", customColors: { text: "red" }, customHeadline: "x".repeat(90), subline: 7 }, "en");
    expect(d.template).toBe("centered");
    expect(d.customColors.text).toBe(defaultDesign("en").customColors.text);
    expect(d.customHeadline).toHaveLength(50);
    expect(d.subline).toBe("");
    expect(parseStoredLogo(JSON.stringify({ dataUrl: "javascript:alert(1)", type: "image/png", width: 1, height: 1 }))).toBeNull();
    expect(parseStoredLogo("{broken")).toBeNull();
  });
});
