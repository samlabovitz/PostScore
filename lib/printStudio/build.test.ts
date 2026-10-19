import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFPage } from "pdf-lib";
import type { Plan } from "@/lib/plan";

const state = vi.hoisted(() => ({ plan: "free" as Plan }));
vi.mock("@/lib/premium", () => ({ getPlan: () => state.plan }));
vi.mock("@/app/actions/printStudio", () => ({
  getPrintStudioData: async () => ({
    status: "ok",
    locale: "en",
    business: {
      businessName: "Modern Liquors",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      googleMapsUri: "https://maps.google.com/?cid=1",
      website: null,
      address: "123 Main St",
      hours: null,
      icon: "bottle",
    },
  }),
}));

import { POST } from "@/app/api/business/[id]/print-card/route";
import { basicCardDesign, defaultBasicCard, defaultCardDesign, type CardDesign } from "@/lib/printStudio/design";

const FILLED = { offer: "20% off your next visit", expiration: "2099-12-31" };
const PREMIUM: CardDesign = {
  ...defaultCardDesign("coupon", "en", "Modern Liquors", "bottle"),
  ...FILLED,
  template: "giftCard",
  size: "card5x7",
  theme: "bold",
  doubleSided: true,
  serial: { on: true, start: 1, count: 20 },
  qrCenter: "logo",
  showLogo: true,
};

function post(body: unknown) {
  const request = new Request("http://localhost/api/business/b1/print-card", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return POST(request as never, { params: { id: "b1" } });
}

beforeEach(() => {
  state.plan = "free";
});

describe("card PDF route — the plan is re-checked on every download, print and PNG", () => {
  it("Free gets nothing", async () => {
    expect((await post({ kind: "coupon", design: PREMIUM })).status).toBe(403);
    expect((await post({ kind: "coupon", design: PREMIUM, format: "design" })).status).toBe(403);
  });

  it("Grow sending a tampered Premium design gets only its basic card (8 wallet cards, one page, no logo spots)", async () => {
    state.plan = "grow";
    const res = await post({ kind: "coupon", design: PREMIUM, logo: { aspect: 1 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Sign-Access")).toBe("basic");
    expect(JSON.parse(res.headers.get("X-Sign-Logo-Slots")!)).toEqual([]);
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1); // no double-sided, no 20 numbered cards
  });

  it("the PNG's approved design for Grow is the basic card, whatever was sent", async () => {
    state.plan = "grow";
    const res = await post({ kind: "coupon", design: PREMIUM, format: "design" });
    const { design, credit } = (await res.json()) as { design: CardDesign; credit: boolean };
    expect(credit).toBe(true);
    expect(design).toEqual(basicCardDesign({ ...defaultBasicCard("coupon", "en", "Modern Liquors"), ...FILLED, serial: PREMIUM.serial }, "en"));
  });

  it("refuses until the owner has typed the offer and an expiration", async () => {
    state.plan = "premium";
    const res = await post({ kind: "coupon", design: { ...PREMIUM, offer: "___% off your next visit", expiration: "" } });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "missing", fields: ["offer", "expiration"] });
  });

  it("Premium gets its design: double-sided, numbered, with logo spots on the right pages", async () => {
    state.plan = "premium";
    const res = await post({ kind: "coupon", design: PREMIUM, logo: { aspect: 1 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Sign-Access")).toBe("studio");
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    // 20 cards, 2 per 5×7 sheet → 10 fronts + 10 backs.
    expect(doc.getPageCount()).toBe(20);
    const slots = JSON.parse(res.headers.get("X-Sign-Logo-Slots")!) as Array<{ page: number }>;
    expect(slots.length).toBeGreaterThan(0);
    // Fronts (even pages) carry the top logo and the QR-center logo;
    // backs the QR-center logo (the back's QR uses the same style).
    expect(slots.filter((s) => s.page % 2 === 0).length).toBeGreaterThan(slots.filter((s) => s.page % 2 === 1).length);
    expect(Math.max(...slots.map((s) => s.page))).toBe(19);
  }, 30_000);

  it("a website QR is dropped when the business has no real website", async () => {
    state.plan = "premium";
    const res = await post({ kind: "coupon", design: { ...PREMIUM, qr: "website" }, format: "design" });
    expect(((await res.json()) as { design: CardDesign }).design.qr).toBe("none");
  });
});

/** A page's drawing commands, decompressed. */
function contentOps(page: PDFPage): string {
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => page.doc.context.lookup(r)) : [contents];
  return streams
    .map((st) => (st instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(st).decode()).toString("latin1") : ""))
    .join("\n");
}

describe("double-sided PDF", () => {
  it("back pages only move the cards — nothing on them is mirrored (no flipping transform, text and images upright)", async () => {
    state.plan = "premium";
    const res = await post({ kind: "coupon", design: { ...PREMIUM, size: "wallet", serial: { on: false, start: 1, count: 1 } } });
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      const ops = contentOps(page);
      // Every transform keeps a positive horizontal scale and no rotation.
      const matrices = Array.from(ops.matchAll(/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (cm|Tm)/g));
      expect(matrices.length).toBeGreaterThan(0);
      for (const m of matrices) {
        expect(Number(m[1]), m[0]).toBeGreaterThan(0); // a: never flipped left↔right
        expect(Number(m[2]), m[0]).toBe(0); // b: never rotated
        // Text is never upside down. (Shapes use pdf-lib's own y-flip from
        // SVG coordinates, which isn't a mirror.)
        if (m[7] === "Tm") expect(Number(m[4]), m[0]).toBeGreaterThan(0);
      }
      expect(ops).toMatch(/Tj|TJ/); // the back really has text on it
    }
  });
});
