import { describe, expect, it, vi, beforeEach } from "vitest";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import type { Plan } from "@/lib/plan";

// The route's two outside inputs: who's asking (the Reviews page data,
// RLS-scoped) and their plan.
const state = vi.hoisted(() => ({ plan: "free" as Plan }));
vi.mock("@/lib/premium", () => ({ getPlan: () => state.plan }));
vi.mock("@/app/actions/reviews", () => ({
  getReviewsPageData: async () => ({
    status: "ok",
    data: {
      businessName: "Modern Liquors",
      placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
      rating: 4.5,
      reviewCount: 15,
      language: "en",
      verifiedSocials: [{ platform: "Instagram", url: "instagram.com/modernliquors" }],
    },
  }),
}));

import { POST } from "@/app/api/business/[id]/review-sign/route";
import { buildSignPdf } from "@/lib/signStudio/build.server";
import { basicDesign, defaultDesign, type SignDesign } from "@/lib/signStudio/design";

const CONTENT = { businessName: "Modern Liquors", rating: 4.5, reviewCount: 15, verifiedSocials: [] };
const PREMIUM_DESIGN: SignDesign = { ...defaultDesign("en"), template: "banner", size: "cards4", theme: "bold", headlineFont: "oswald", qrCenter: "logo", logoTop: true };

function post(body: unknown) {
  const request = new Request("http://localhost/api/business/b1/review-sign", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return POST(request as never, { params: { id: "b1" } });
}

beforeEach(() => {
  state.plan = "free";
});

describe("review sign PDF route — the plan is re-checked on every download and print", () => {
  it("Free can't get a sign PDF at all", async () => {
    const res = await post({ design: PREMIUM_DESIGN });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "plan_required" });
  });

  it("Grow sending a tampered Premium design still gets only its basic sign (and no logo spots)", async () => {
    state.plan = "grow";
    const res = await post({ design: PREMIUM_DESIGN, logo: { aspect: 1 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Sign-Access")).toBe("basic");
    expect(JSON.parse(res.headers.get("X-Sign-Logo-Slots")!)).toEqual([]);
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    // Basic default: the tent card (one letter page), not the 4-up sheet.
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it("Premium gets its design, with the logo spots for the browser to fill", async () => {
    state.plan = "premium";
    const res = await post({ design: { ...PREMIUM_DESIGN, size: "tent" }, logo: { aspect: 2 } });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Sign-Access")).toBe("studio");
    // Two tent faces × (top logo + QR-center logo); the upper face upside down.
    const slots = JSON.parse(res.headers.get("X-Sign-Logo-Slots")!) as Array<{ rotate: number }>;
    expect(slots).toHaveLength(4);
    expect(slots.filter((s) => s.rotate === 180)).toHaveLength(2);
  });

  it("Premium with an unreadable color pair is refused until it's fixed", async () => {
    state.plan = "multi";
    const res = await post({ design: { ...PREMIUM_DESIGN, theme: "custom", customColors: { background: "#ffffff", text: "#eeeeee", accent: "#000000" } } });
    expect(res.status).toBe(422);
  });
});

describe("buildSignPdf", () => {
  it("Grow's PDF is exactly the basic sign, whatever the request said", async () => {
    const result = await buildSignPdf({ plan: "grow", requested: { ...PREMIUM_DESIGN, theme: "clean", size: "letter" }, logo: null, placeId: "x", content: CONTENT, locale: "es" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.design).toEqual(basicDesign({ theme: "clean", size: "letter" }, "es"));
    expect(result.credit).toBe(true);
  });

  it("is a vector PDF at the exact size with the chosen fonts embedded", async () => {
    for (const [size, dims] of [
      ["card4x6", [288, 432]],
      ["card5x7", [360, 504]],
      ["letter", [612, 792]],
    ] as const) {
      const result = await buildSignPdf({ plan: "premium", requested: { ...defaultDesign("en"), size, headlineFont: "lora", bodyFont: "nunito" }, logo: null, placeId: "x", content: CONTENT, locale: "en" });
      if (result.status !== "ok") throw new Error(result.status);
      const doc = await PDFDocument.load(result.bytes);
      expect(doc.getPage(0).getSize()).toEqual({ width: dims[0], height: dims[1] });
      const dicts = doc.context.enumerateIndirectObjects().map(([, obj]) => obj).filter((obj): obj is PDFDict => obj instanceof PDFDict);
      const descriptors = dicts.filter((d) => d.get(PDFName.of("Type")) === PDFName.of("FontDescriptor"));
      // Every font carries its own font file (embedded, not referenced).
      expect(descriptors.length).toBeGreaterThanOrEqual(2);
      for (const d of descriptors) expect(d.get(PDFName.of("FontFile2"))).toBeDefined();
      const names = descriptors.map((d) => String(d.get(PDFName.of("FontName"))));
      expect(names.some((n) => n.includes("Lora-Bold"))).toBe(true);
      expect(names.some((n) => n.includes("Nunito-Regular"))).toBe(true);
      // Nothing rasterized: no images in a server-built sign.
      expect(dicts.some((d) => d.get(PDFName.of("Subtype")) === PDFName.of("Image"))).toBe(false);
    }
  }, 30_000);
});
