import { beforeAll, describe, expect, it } from "vitest";
import { qrLayers } from "@/lib/reviewQr";
import { Raster, scanRaster } from "@/lib/qrRaster.testUtil";
import { FONT_IDS, QR_CENTERS, QR_CORNERS, QR_DOTS } from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import type { Measurer, PrintPage } from "@/lib/signStudio/elements";
import {
  BLANK,
  CARD_SHEETS,
  CARD_SIZES,
  COUPON_TEMPLATES,
  QR_DESTINATIONS,
  REFERRAL_TEMPLATES,
  availableDestinations,
  basicCardDesign,
  cardContrastProblems,
  defaultBasicCard,
  defaultCardDesign,
  effectiveCardDesign,
  minQrPoints,
  missingFields,
  type CardBusiness,
  type CardDesign,
  type QrDestination,
} from "@/lib/printStudio/design";
import { iconForBusiness } from "@/lib/printStudio/icons";
import { MADE_WITH, layoutCardSheets, layoutSingleCard } from "@/lib/printStudio/layout";
import { cardQrUrl, cardQrs } from "@/lib/printStudio/qr";

const BUSINESS: CardBusiness = {
  businessName: "Modern Liquors",
  placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
  googleMapsUri: "https://maps.google.com/?cid=12345678901234567890",
  website: "https://modernliquors.example.com/",
  address: "123 Main St, Newark, NJ 07102",
  hours: ["Monday: 9 AM – 9 PM", "Tuesday: 9 AM – 9 PM", "Wednesday: 9 AM – 9 PM", "Thursday: 9 AM – 9 PM", "Friday: 9 AM – 10 PM", "Saturday: 9 AM – 10 PM", "Sunday: 11 AM – 6 PM"],
  icon: "bottle",
};
const FILLED = { offer: "20% off your next visit", friendOffer: "$10 off your first visit", referrerReward: "$10 off your next visit", loyaltyReward: "10th bottle free", expiration: "2099-12-31", code: "FRIEND10" };
const TODAY = "2026-10-18";
const hasQr = (d: QrDestination) => cardQrUrl(d, BUSINESS) !== null;

const measurers = new Map<string, Measurer>();
async function measurer(d: Pick<CardDesign, "headlineFont" | "bodyFont">): Promise<Measurer> {
  const key = `${d.headlineFont}|${d.bodyFont}`;
  if (!measurers.has(key)) measurers.set(key, createMeasurer(await loadDesignFonts(d, readSignFont)));
  return measurers.get(key)!;
}
beforeAll(async () => {
  for (const f of FONT_IDS) await measurer({ headlineFont: f, bodyFont: f });
  await measurer({ headlineFont: "playfair", bodyFont: "inter" });
}, 30_000);

const card = (over: Partial<CardDesign> = {}, kind: "coupon" | "referral" = "coupon"): CardDesign => ({ ...defaultCardDesign(kind, "en", "Modern Liquors", "bottle"), ...FILLED, ...over });

function texts(page: PrintPage): string {
  return page.panels.flatMap((p) => p.elements.flatMap((el) => (el.kind === "text" ? [el.text] : []))).join(" ");
}

/** Paints a card face's QR exactly as the PDF draws it (white tile, the
 * card's ink, a stand-in logo in the logo spot) and reads it back. */
function scanFace(page: PrintPage, d: CardDesign, qrName: "front" | "back", hasLogo: boolean, px = 6): string | null {
  const els = page.panels[0].elements;
  const i = els.findIndex((el) => el.kind === "qr" && el.qr === qrName);
  const qrEl = els[i];
  if (!qrEl || qrEl.kind !== "qr") return null;
  const geo = cardQrs(d, BUSINESS, hasLogo)[qrName];
  const side = Math.ceil(geo.size * px + 60);
  const raster = new Raster(side, side, d.theme === "bold" ? "#14243f" : "#f7f1e3");
  const o = 30;
  raster.fillRect(o - 6, o - 6, geo.size * px + 12, geo.size * px + 12, "#ffffff");
  for (const layer of qrLayers(geo, qrEl.ink, qrEl.star)) raster.fillPath(layer.d, layer.fill, px, o, o);
  const box = geo.badge?.logoBox;
  if (box) {
    raster.fillRect(o + box.x * px, o + box.y * px, box.size * px, box.size * px, "#c0392b");
    raster.fillRect(o + box.x * px, o + (box.y + box.size / 2) * px, box.size * px, (box.size / 4) * px, "#111111");
  }
  return scanRaster(raster);
}

describe("every template and QR style scans back to exactly its link", () => {
  const ALL = [...COUPON_TEMPLATES.map((t) => ["coupon", t] as const), ...REFERRAL_TEMPLATES.map((t) => ["referral", t] as const)];
  it.each(ALL)("%s / %s", async (kind, template) => {
    const failures: string[] = [];
    for (const qrDots of QR_DOTS)
      for (const qrCorners of QR_CORNERS)
        for (const qrCenter of QR_CENTERS) {
          const hasLogo = qrCenter === "logo";
          const d = card({ template, qrDots, qrCorners, qrCenter, qr: "listing", showLogo: hasLogo }, kind);
          const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: hasLogo ? { aspect: 1.5 } : null, hasQr }, await measurer(d));
          if (scanFace(single.front, d, "front", hasLogo) !== cardQrUrl("listing", BUSINESS)) failures.push(`${qrDots}/${qrCorners}/${qrCenter}`);
        }
    expect(failures).toEqual([]);
  }, 60_000);

  it("a coupon or referral card's QR never leads to the review link (Google forbids rewards for reviews); a saved one falls back to the listing", () => {
    expect(QR_DESTINATIONS).not.toContain("review");
    expect(availableDestinations(BUSINESS)).not.toContain("review");
    for (const kind of ["coupon", "referral"] as const) {
      const d = effectiveCardDesign("premium", card({ qr: "review", doubleSided: true, back: { finePrint: true, address: true, hours: true, qr: "review", note: "" } }), kind, BUSINESS, "en")!.design;
      expect(d.qr).toBe("listing");
      expect(d.back.qr).toBe("listing");
    }
  });

  it.each(["listing", "website"] as QrDestination[])("each destination: the %s QR opens exactly that link, front and back", async (dest) => {
    const d = card({ qr: dest, doubleSided: true, back: { finePrint: true, address: true, hours: true, qr: dest, note: "" } });
    const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
    const expected = cardQrUrl(dest, BUSINESS);
    expect(scanFace(single.front, d, "front", false)).toBe(expected);
    expect(scanFace(single.back!, d, "back", false)).toBe(expected);
  });

  it("no QR when the destination is none or the business has no real website", async () => {
    const none = layoutSingleCard({ design: card({ qr: "none" }), business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(card()));
    expect(none.front.panels[0].elements.some((el) => el.kind === "qr")).toBe(false);
    const noSite = { ...BUSINESS, website: null };
    expect(cardQrUrl("website", noSite)).toBeNull();
    expect(effectiveCardDesign("premium", card({ qr: "website" }), "coupon", noSite, "en")!.design.qr).toBe("none");
  });
});

describe("sizes", () => {
  it("every template fits on every size with the QR at least 0.8 in (wallet) / 1.2 in (larger) — even bilingual with long text", async () => {
    for (const [kind, templates] of [["coupon", COUPON_TEMPLATES], ["referral", REFERRAL_TEMPLATES]] as const)
      for (const template of templates)
        for (const size of CARD_SIZES)
          for (const font of ["playfair", "oswald"] as const) {
            const d = card(
              { template, size, language: "both", headlineFont: font, bodyFont: font, textSize: "large", letterSpacing: "wide", subline: "Thank you for shopping local with our family business!", icon: "bottle", showLogo: true, doubleSided: true, serial: { on: true, start: 1, count: 3 } },
              kind
            );
            const sheets = layoutCardSheets({ design: d, business: BUSINESS, credit: true, logo: { aspect: 2 }, hasQr }, await measurer(d));
            expect(sheets.qrPoints, `${kind}/${template}/${size}/${font}`).toBeGreaterThanOrEqual(minQrPoints(size) - 0.01);
            for (const page of sheets.pages) {
              expect([page.width, page.height]).toEqual([612, 792]);
              for (const p of page.panels) {
                expect(p.x).toBeGreaterThanOrEqual(0);
                expect(p.x + p.w).toBeLessThanOrEqual(612.01);
                expect(p.y + p.h).toBeLessThanOrEqual(792.01);
              }
            }
          }
  }, 120_000);

  it("sheets: 8 wallet cards per page; 4×6 is 2 per page (4 don't fit on letter)", () => {
    expect(CARD_SHEETS.wallet.cols * CARD_SHEETS.wallet.rows).toBe(8);
    expect(CARD_SHEETS.card4x6.cols * CARD_SHEETS.card4x6.rows).toBe(2);
    expect(4 * 4 * 6).toBeGreaterThan(8.5 * 11 - 0); // 96 sq in of cards vs 93.5 sq in of paper
  });
});

describe("double-sided", () => {
  it("each back page follows its front page, with every card mirrored for a long-edge flip", async () => {
    for (const size of CARD_SIZES) {
      const d = card({ size, doubleSided: true, serial: { on: true, start: 1, count: 11 } });
      const sheets = layoutCardSheets({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
      expect(sheets.pages.length % 2).toBe(0);
      for (let i = 0; i < sheets.pages.length; i += 2) {
        const front = sheets.pages[i];
        const back = sheets.pages[i + 1];
        expect(back.panels).toHaveLength(front.panels.length);
        front.panels.forEach((p, k) => {
          const b = back.panels[k];
          // Same row, mirrored column, same size: lines up when flipped.
          expect(b.y).toBeCloseTo(p.y);
          expect(b.x).toBeCloseTo(612 - p.x - p.w);
          expect([b.w, b.h]).toEqual([p.w, p.h]);
        });
      }
    }
  });

  it("only the card positions swap — the back of each card is drawn the right way round, never mirrored", async () => {
    for (const size of ["wallet", "card4x6", "fullPage"] as const) {
      const d = card({ size, doubleSided: true });
      const m = await measurer(d);
      const sheets = layoutCardSheets({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, m);
      const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, m);
      const back = sheets.pages[1];
      for (const p of back.panels) {
        // No flip: the same back face, unrotated, element for element.
        expect(p.rotate).toBe(0);
        expect(p.elements).toEqual(single.back!.panels[0].elements);
      }
      // Text reads left to right inside each card: x grows along a line.
      const texts = back.panels[0].elements.filter((el) => el.kind === "text");
      expect(texts.length).toBeGreaterThan(0);
      for (const el of texts) if (el.kind === "text") expect(el.x).toBeGreaterThanOrEqual(0);
      if (size === "wallet") {
        // Left column front → right column back (same row), and vice versa.
        expect(sheets.pages[0].panels[0].x).toBeLessThan(306);
        expect(back.panels[0].x).toBeGreaterThanOrEqual(306);
        expect(back.panels[1].x).toBeLessThan(306);
      }
    }
  });

  it("serial numbers run across the sheets (#0001…#0011)", async () => {
    const d = card({ serial: { on: true, start: 1, count: 11 } });
    const sheets = layoutCardSheets({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
    const all = sheets.pages.map(texts).join(" ");
    expect(all).toContain("#0001");
    expect(all).toContain("#0011");
    expect(all).not.toContain("#0012");
    expect(sheets.pages).toHaveLength(2);
  });
});

describe("honesty", () => {
  it("Download waits for the owner's own offer (the ___ must be replaced) and, on coupons, an expiration that hasn't passed", () => {
    const fresh = defaultCardDesign("coupon", "en", "Modern Liquors");
    expect(fresh.offer).toContain(BLANK);
    expect(missingFields(fresh, TODAY)).toEqual(["offer", "expiration"]);
    expect(missingFields({ ...fresh, offer: "20% off" }, TODAY)).toEqual(["expiration"]);
    expect(missingFields({ ...fresh, offer: "20% off", expiration: "2026-01-01" }, TODAY)).toEqual(["expiration"]);
    expect(missingFields({ ...fresh, offer: "20% off", expiration: "2026-12-31" }, TODAY)).toEqual([]);
    expect(missingFields({ ...fresh, template: "loyalty" }, TODAY)).toEqual(["loyaltyReward"]);
    const referral = defaultCardDesign("referral", "es", "Modern Liquors");
    // Single card (default) prints the friend's offer; the tear-in-half
    // card prints both rewards.
    expect(missingFields(referral, TODAY)).toEqual(["friendOffer"]);
    expect(missingFields({ ...referral, template: "giveGet" }, TODAY)).toEqual(["friendOffer", "referrerReward"]);
    expect(missingFields({ ...referral, friendOffer: "$10", referrerReward: "$10" }, TODAY)).toEqual([]);
    expect(fresh.finePrint).toBe("One per customer. Can't be combined with other offers. No cash value.");
  });

  it("Grow cards say 'Made with PostScore'; Premium cards carry no PostScore branding", async () => {
    const m = await measurer(card());
    const grow = layoutSingleCard({ design: basicCardDesign({ ...defaultBasicCard("coupon", "en", "Modern Liquors"), ...FILLED }, "en"), business: BUSINESS, credit: true, logo: null, hasQr }, m);
    expect(texts(grow.front)).toContain(MADE_WITH);
    for (const template of COUPON_TEMPLATES) {
      const premium = layoutSingleCard({ design: card({ template, doubleSided: true }), business: BUSINESS, credit: false, logo: null, hasQr }, m);
      expect(texts(premium.front) + texts(premium.back!)).not.toMatch(/postscore/i);
    }
  });
});

describe("plans", () => {
  it("Free gets nothing; Grow only its 2 options (Style, Size) plus its own text; Premium the full design", () => {
    expect(effectiveCardDesign("free", card(), "coupon", BUSINESS, "en")).toBeNull();
    const tampered = card({ template: "giftCard", size: "fullPage", theme: "bold", headlineFont: "oswald", pattern: "confetti", doubleSided: true, serial: { on: true, start: 1, count: 500 }, code: "HACK", qrCenter: "star", icon: "gift" });
    const grow = effectiveCardDesign("grow", tampered, "coupon", BUSINESS, "en")!;
    expect(grow.credit).toBe(true);
    // Only the basic layout, its first style/size (bold & full page aren't Grow choices), and the owner's text.
    expect(grow.design).toEqual(basicCardDesign({ ...defaultBasicCard("coupon", "en", "Modern Liquors"), ...FILLED, code: "HACK", serial: tampered.serial, qr: "listing" }, "en"));
    expect(grow.design.template).toBe("voucher");
    expect(grow.design.serial.on).toBe(false);
    expect(grow.design.doubleSided).toBe(false);
    expect(effectiveCardDesign("grow", { ...tampered, theme: "clean", size: "card4x6" }, "coupon", BUSINESS, "en")!.design).toMatchObject({ theme: "clean", size: "card4x6", template: "voucher" });
    const premium = effectiveCardDesign("multi", tampered, "coupon", BUSINESS, "en")!;
    expect(premium.credit).toBe(false);
    expect(premium.design).toMatchObject({ template: "giftCard", size: "fullPage", theme: "bold", doubleSided: true });
  });

  it("the contrast check also covers the gradient's far end", () => {
    expect(cardContrastProblems(card({ theme: "classic" }))).toEqual([]);
    expect(cardContrastProblems(card({ theme: "classic", gradient: { on: true, to: "#1a2a40", angle: 90 } }))).toContain("text");
  });

  it("suggests an icon from the business type", () => {
    expect(iconForBusiness("liquor_store")).toBe("bottle");
    expect(iconForBusiness("hair_salon")).toBe("scissors");
    expect(iconForBusiness("cafe", "Coffee Labs")).toBe("cup");
    expect(iconForBusiness(null, "Something")).toBe("star");
  });
});

describe("print quality", () => {
  const els = (page: PrintPage) => page.panels[0].elements;
  const textEls = (page: PrintPage) => els(page).filter((e): e is Extract<typeof e, { kind: "text" }> => e.kind === "text");

  it("PNG pixel sizes: 300 DPI at the real card size, 2× for high-res", async () => {
    const { pngPixels, PNG_DPI } = await import("@/app/business/[id]/campaigns/CardDesigner");
    expect(pngPixels("wallet", PNG_DPI.print)).toEqual({ width: 1050, height: 600 });
    expect(pngPixels("card4x6", PNG_DPI.print)).toEqual({ width: 1800, height: 1200 });
    expect(pngPixels("wallet", PNG_DPI.hiRes)).toEqual({ width: 2100, height: 1200 });
  });

  it("the card is clipped to its own shape (rounded corners / notches), and a PNG's corners stay transparent", async () => {
    const { renderPageSvg } = await import("@/lib/signStudio/svg");
    const { designFontFiles } = await import("@/lib/signStudio/design");
    for (const corners of ["rounded", "notch", "square"] as const) {
      const d = card({ corners });
      const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
      const panel = single.front.panels[0];
      expect(panel.clip).toBeTruthy();
      expect(panel.clip!.r > 0).toBe(corners !== "square");
      expect(panel.clip!.notch > 0).toBe(corners === "notch");
      const svg = renderPageSvg(single.front, { qrs: cardQrs(d, BUSINESS, false), fontFiles: designFontFiles(d), transparent: true });
      expect(svg).toContain("clip-path=");
      // Nothing behind the card: the card group comes right after the fonts.
      expect(svg.split("</style>")[1].startsWith("<g")).toBe(true);
    }
  });

  it("no text under 6 pt (fine print 5.5 pt) on any card — only the tiny Grow credit", async () => {
    for (const [kind, templates] of [["coupon", COUPON_TEMPLATES], ["referral", REFERRAL_TEMPLATES]] as const)
      for (const template of templates) {
        const d = card({ template, size: "wallet", subline: "Show this at the register." }, kind);
        const single = layoutSingleCard({ design: d, business: BUSINESS, credit: true, logo: null, hasQr }, await measurer(d));
        for (const t of textEls(single.front)) expect(t.size, `${template}: ${t.text}`).toBeGreaterThanOrEqual(t.text === MADE_WITH ? 4.5 : 5.5);
      }
  });

  it("coupons: business name → offer → how to redeem → code + expiry → fine print, and the QR is never bigger than the offer", async () => {
    for (const template of ["ticket", "voucher", "minimal", "giftCard"] as const)
      for (const size of ["wallet", "card4x6", "fullPage"] as const) {
        const d = card({ template, size, subline: "Show this at the register.", icon: "none" });
        const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
        const ts = textEls(single.front);
        const y = (match: (s: string) => boolean) => ts.find((t) => match(t.text))!.y;
        const order = [y((s) => s === "MODERN LIQUORS"), y((s) => s.startsWith("20%")), y((s) => s.startsWith("Show this")), y((s) => s.startsWith("Code")), y((s) => s.startsWith("One per"))];
        expect(order, `${template}/${size}`).toEqual([...order].sort((a, b) => a - b));
        const offerLines = ts.filter((t) => FILLED.offer.includes(t.text));
        const offerH = offerLines.length * offerLines[0].size * 1.2;
        const qr = els(single.front).find((e) => e.kind === "qr")!;
        if (qr.kind === "qr") expect(qr.size <= Math.max(minQrPoints(size) + 0.5, offerH * 1.25), `${template}/${size}`).toBe(true);
      }
  });

  it("referral cards: equal halves, the same code on both, 'Referred by' and 'Unlocks…' — and the how-to line on by default", async () => {
    const d = card({ template: "giveGet", size: "card4x6" }, "referral");
    expect(d.show.howTo).toBe(true);
    expect(card({}, "coupon").show.howTo).toBe(false);
    const single = layoutSingleCard({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, await measurer(d));
    const ts = textEls(single.front);
    const half = single.front.width / 2;
    const left = ts.filter((t) => t.x < half).map((t) => t.text).join(" ");
    const right = ts.filter((t) => t.x >= half).map((t) => t.text).join(" ");
    expect(left).toContain("FOR YOUR FRIEND");
    expect(left).toContain("Referred by:");
    expect(left).toContain("Code FRIEND10");
    expect(left).toContain("Valid until");
    expect(right).toContain("FOR YOU");
    expect(right).toContain("Unlocks when your friend uses their half");
    expect(right).toContain("Code FRIEND10");
    expect(right).toContain("Valid until");
    expect(right).toContain("Give this half to a friend");
    // The friend's QR is small: its minimum size.
    const qr = els(single.front).find((e) => e.kind === "qr")!;
    if (qr.kind === "qr") expect(qr.size).toBeCloseTo(minQrPoints("card4x6"));
  });
});
