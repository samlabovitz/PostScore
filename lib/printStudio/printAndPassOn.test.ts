import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { printModeFor } from "@/lib/signStudio/output";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { readSignFont } from "@/lib/signStudio/fonts.server";
import type { Measurer, PrintPage } from "@/lib/signStudio/elements";
import { renderPdf } from "@/lib/signStudio/pdf";
import { buildSignPdf } from "@/lib/signStudio/build.server";
import { defaultDesign } from "@/lib/signStudio/design";
import { PASS_ON_TEMPLATES, basicCardDesign, defaultBasicCard, defaultCardDesign, effectiveCardDesign, referralTemplate, sanitizeCardDesign, type CardBusiness, type CardDesign } from "@/lib/printStudio/design";
import { layoutCardSheets, layoutSingleCard } from "@/lib/printStudio/layout";
import { cardQrUrl, cardQrs } from "@/lib/printStudio/qr";
import { POSTAI_ASK_QUESTIONS, isPostaiAskId, postaiAskHref } from "@/lib/postaiAsk";
import { ASSISTANT_SYSTEM_RULES } from "@/lib/assistant";

const BUSINESS: CardBusiness = { businessName: "Modern Liquors", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4", googleMapsUri: "https://maps.google.com/?cid=1", website: null, address: "123 Main St", hours: null, icon: "bottle" };
const FILLED = { friendOffer: "$10 off your first visit", referrerReward: "$10 off your next visit", expiration: "2099-12-31", code: "EKPM-NRUG", offer: "20% off" };
const hasQr = (d: Parameters<typeof cardQrUrl>[0]) => cardQrUrl(d, BUSINESS) !== null;
let m: Measurer;
beforeAll(async () => {
  m = createMeasurer(await loadDesignFonts(defaultCardDesign("referral", "en", "x"), readSignFont));
}, 30_000);
const texts = (page: PrintPage) => page.panels.flatMap((p) => p.elements.flatMap((e) => (e.kind === "text" ? [e.text] : []))).join(" ");
const referral = (over: Partial<CardDesign>) => ({ ...defaultCardDesign("referral", "en", "Modern Liquors", "bottle"), ...FILLED, ...over });

describe("Print: the same PDF as Download, by the path that works in each browser", () => {
  const UA = {
    chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    safariIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    chromeIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
    firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  };
  it("Chromium prints the PDF from a hidden frame; Safari, Firefox and iOS open it in a new tab", () => {
    expect(printModeFor(UA.chromeMac)).toBe("frame");
    expect(printModeFor(UA.edge)).toBe("frame");
    expect(printModeFor(UA.safariMac)).toBe("tab");
    expect(printModeFor(UA.safariIos)).toBe("tab");
    expect(printModeFor(UA.chromeIos)).toBe("tab");
    expect(printModeFor(UA.firefox)).toBe("tab");
  });

  it("page counts match the design: tent card 1, 8-up sheet 1, double-sided 2", async () => {
    const sign = await buildSignPdf({ plan: "premium", requested: { ...defaultDesign("en"), size: "tent" }, logo: null, placeId: "x", content: { businessName: "M", verifiedSocials: [] }, locale: "en" });
    if (sign.status !== "ok") throw new Error(sign.status);
    expect((await PDFDocument.load(sign.bytes)).getPageCount()).toBe(1);
    for (const [doubleSided, pages] of [[false, 1], [true, 2]] as const) {
      const d = { ...defaultCardDesign("coupon", "en", "M", "bottle"), ...FILLED, size: "wallet" as const, doubleSided };
      const fonts = await loadDesignFonts(d, readSignFont);
      const sheets = layoutCardSheets({ design: d, business: BUSINESS, credit: false, logo: null, hasQr }, createMeasurer(fonts));
      const { bytes } = await renderPdf(sheets.pages, { qrs: cardQrs(d, BUSINESS, false), fontBytes: fonts, title: "t" });
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages);
      expect(sheets.cardsPerPage).toBe(8);
    }
  }, 30_000);

  it("printing the page by accident (Cmd+P) shows the design only — the app is hidden", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toContain("body:has([data-print-design]) *:not([data-print-design]):not([data-print-design] *):not(:has([data-print-design]))");
    expect(print).toMatch(/display: none !important/);
  });
});

describe("How customers pass a referral on", () => {
  it("Single card is the default; each choice picks layouts that fit it", () => {
    expect(defaultCardDesign("referral", "en", "M").passOn).toBe("single");
    expect(defaultBasicCard("referral", "en", "M").passOn).toBe("single");
    expect(referralTemplate("tear", "friendPass")).toBe("giveGet");
    expect(referralTemplate("single", "giveGet")).toBe("friendPass");
    expect(referralTemplate("single", "thankYou")).toBe("thankYou");
    expect(PASS_ON_TEMPLATES.digital).toEqual(["friendPass", "thankYou"]);
    // A request can't mix them up.
    expect(sanitizeCardDesign({ passOn: "tear", template: "thankYou" }, "referral", "en", "M").template).toBe("giveGet");
  });

  it("all three ways are on Grow (the server applies the choice); Premium keeps its extra templates", () => {
    for (const passOn of ["single", "tear", "digital"] as const) {
      const grow = effectiveCardDesign("grow", { ...referral({ passOn }), template: "thankYou" }, "referral", BUSINESS, "en")!;
      expect(grow.design.passOn).toBe(passOn);
      expect(grow.design.template).toBe(passOn === "tear" ? "giveGet" : "friendPass");
    }
    expect(effectiveCardDesign("premium", referral({ passOn: "single", template: "thankYou" }), "referral", BUSINESS, "en")!.design.template).toBe("thankYou");
  });

  it("single card: a 'Referred by' line the customer fills in, and its how-to", () => {
    const t = texts(layoutSingleCard({ design: referral({ passOn: "single", size: "card4x6" }), business: BUSINESS, credit: false, logo: null, hasQr }, m).front);
    expect(t).toContain("Referred by:");
    expect(t).toContain("Write your name on the line");
  });

  it("tear-in-half: the same code on both halves", () => {
    const t = texts(layoutSingleCard({ design: referral({ passOn: "tear", template: "giveGet", size: "card4x6" }), business: BUSINESS, credit: false, logo: null, hasQr }, m).front);
    expect(t.match(/Code EKPM-NRUG/g)).toHaveLength(2);
    expect(t).toContain("Give this half to a friend");
  });

  it("tear-in-half: two balanced halves split by a dashed tear line, the SAME code on each", () => {
    const front = layoutSingleCard({ design: referral({ passOn: "tear", template: "giveGet", size: "card4x6" }), business: BUSINESS, credit: false, logo: null, hasQr }, m).front;
    const els = front.panels.flatMap((p) => p.elements);
    const tear = els.find((e): e is Extract<typeof e, { kind: "line" }> => e.kind === "line" && e.dash && e.x1 === e.x2);
    expect(tear).toBeDefined();
    const split = tear!.x1;
    const textEls = els.filter((e): e is Extract<typeof e, { kind: "text" }> => e.kind === "text");
    const half = (left: boolean) => textEls.filter((e) => (e.x < split) === left);
    const words = (left: boolean) => half(left).map((e) => e.text).join(" ");

    const friend = words(true);
    expect(friend).toContain("FOR YOUR FRIEND");
    expect(friend).toContain("$10 off your first visit");
    expect(friend).toContain("Referred by:");
    const you = words(false);
    expect(you).toContain("FOR YOU");
    expect(you).toContain("$10 off your next visit");
    expect(you).toContain("Unlocks when your friend uses their half");

    // The same code, once on each half.
    const codes = (left: boolean) => half(left).filter((e) => e.text.includes("EKPM-NRUG")).map((e) => e.text);
    expect(codes(true)).toEqual(["Code EKPM-NRUG"]);
    expect(codes(false)).toEqual(["Code EKPM-NRUG"]);

    // A small QR on the friend half only.
    const qrs = els.filter((e): e is Extract<typeof e, { kind: "qr" }> => e.kind === "qr");
    expect(qrs).toHaveLength(1);
    expect(qrs[0].x + qrs[0].size).toBeLessThanOrEqual(split);

    // Equal weight: the two offers print at the same size, the tear line sits in the middle.
    const friendOffer = half(true).find((e) => e.text.startsWith("$10"))!;
    const yourReward = half(false).find((e) => e.text.startsWith("$10"))!;
    expect(friendOffer.size).toBeCloseTo(yourReward.size, 5);
    expect(split).toBeCloseTo(front.width / 2, 0);
  });

  it("digital: shown on the friend's phone — no write-in line", () => {
    const t = texts(layoutSingleCard({ design: referral({ passOn: "digital", size: "card4x6" }), business: BUSINESS, credit: false, logo: null, hasQr }, m).front);
    expect(t).toContain("Show this on your phone at the register");
    expect(t).not.toContain("Referred by:");
    expect(t).toContain("Forward this to a friend");
  });

  it("basic (Grow) single card keeps its write-in line too", () => {
    const d = basicCardDesign({ ...defaultBasicCard("referral", "en", "Modern Liquors"), ...FILLED }, "en");
    expect(texts(layoutSingleCard({ design: d, business: BUSINESS, credit: true, logo: null, hasQr }, m).front)).toContain("Referred by:");
  });
});

describe("Ask PostAI", () => {
  it("links to the Overview with an allowlisted question — never free text", () => {
    expect(postaiAskHref("b1", "referral_cards")).toBe("/business/b1?ask=referral_cards");
    expect(isPostaiAskId("coupon_cards")).toBe(true);
    expect(isPostaiAskId("<script>")).toBe(false);
    expect(Object.keys(POSTAI_ASK_QUESTIONS)).toEqual(["referral_cards", "coupon_cards", "review_sign"]);
  });

  it("PostAI knows these designers accurately: plans, the 3 referral options, and that the owner taps +1", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("exactly three ways");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Tear-in-half card");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Single card (the default)");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Share digitally");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never by the PostStudio add-on");
    expect(ASSISTANT_SYSTEM_RULES).toContain("PostScore never sees the register");
    expect(ASSISTANT_SYSTEM_RULES).toContain('manually taps "+1 Redeemed"');
    expect(ASSISTANT_SYSTEM_RULES).toContain("Download PDF and Print use the same PDF");
  });
});
