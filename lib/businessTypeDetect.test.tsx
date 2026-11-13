import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Business type detection when a business is added (and once for saved
// businesses with none): across every type, from the name, Google's type
// and the website's words. Confident → saved as PostScore's pick ("We
// picked … — Change"); not confident → the existing "Tell us what kind of
// business" prompt. Never over a type the owner chose. No Google call.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions/niches", () => ({ confirmBusinessNiche: vi.fn() }));

import { detectBusinessType } from "./businessTypeDetect";
import { detectAndSaveBusinessTypeWithClient } from "./businessTypeDetect.server";
import { nicheBannerKind, resolveBusinessNiche } from "./businessNiche";
import { afterBusinessAdded } from "./businessAdded.server";
import { LocaleProvider } from "./i18n";
import { NicheBanner } from "@/components/niche/NicheBanner";

const base = { category: null, primaryType: null, types: null, websiteText: null };

describe("detectBusinessType", () => {
  test("the name decides across types: “Clay Studio” → Art & pottery classes, “Barber” → barbershop", () => {
    expect(detectBusinessType({ ...base, name: "Centered Clay Studio", category: "Educational Institution", primaryType: "educational_institution", types: ["educational_institution", "point_of_interest"] })).toMatchObject({ nicheId: "art_classes", confident: true, evidence: ["name says “clay studio”"] });
    expect(detectBusinessType({ ...base, name: "US Male Modern Barber Shop", category: "Store", primaryType: "store" })).toMatchObject({ nicheId: "barbershop", confident: true });
  });

  test("Google's own specific type: a general pick takes its specific type (Finders Keepers → Women's clothing)", () => {
    expect(detectBusinessType({ ...base, name: "Finders Keepers Boutique", category: "Women's Clothing Store", primaryType: "womens_clothing_store", types: ["womens_clothing_store", "clothing_store", "store"] })).toMatchObject({ nicheId: "womens_clothing", confident: true });
  });

  test("a single name word against Google's type of another kind → ask the owner", () => {
    const lemonLaw = detectBusinessType({ ...base, name: "Kimmel & Silverman PC, Delaware Lemon Law Firm", category: "Consultant", primaryType: "consultant", types: ["consultant", "lawyer"] });
    expect(lemonLaw).toMatchObject({ nicheId: "lawyer", confident: false, runnerUp: "consultant" });
  });

  test("website words alone: confident only when they clearly say one kind", () => {
    const giftWords = "Rooted. Handmade candles, gift sets, gifts for everyone — a gift shop by the community.";
    expect(detectBusinessType({ ...base, name: "Rooted On Main", category: "Store", primaryType: "store", websiteText: giftWords })).toMatchObject({ nicheId: "gift_shop", confident: true });
    expect(detectBusinessType({ ...base, name: "You’ve Been Framed", category: "Store", primaryType: "store", websiteText: "Custom framing and a few gift ideas." })).toMatchObject({ confident: false });
  });

  test("nothing matched → nothing guessed", () => {
    expect(detectBusinessType({ ...base, name: "Acme LLC", category: "Store", primaryType: "store" })).toEqual({ nicheId: null, confident: false, evidence: [], runnerUp: null, score: 0 });
  });
});

/** A tiny fake of the Supabase calls detection makes. */
function fakeDb(row: Record<string, unknown> | null, updateError: { code?: string; message: string } | null = null) {
  const updates: Array<Record<string, unknown>> = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          is: async () => {
            updates.push(patch);
            return { error: updateError };
          },
        }),
      }),
    }),
  };
  return { db: db as never, updates };
}

const CLAY_ROW = { name: "Centered Clay Studio", category: "Educational Institution", primary_type: "educational_institution", categories: ["educational_institution"], website: "http://www.centeredclaystudio.com/", verified_website_url: null, niche_id: null, niche_source: null };
const noSite = async () => null;

describe("detectAndSaveBusinessTypeWithClient", () => {
  test("confident and no type set: saved as PostScore's pick, unconfirmed, the parent type following", async () => {
    const { db, updates } = fakeDb(CLAY_ROW);
    const r = await detectAndSaveBusinessTypeWithClient(db, "b1", { readWebsite: noSite });
    expect(r).toMatchObject({ status: "saved", nicheId: "art_classes" });
    expect(updates).toEqual([{ niche_id: "art_classes", niche_source: "auto", niche_confirmed_at: null, business_type_override: r.status === "saved" ? r.override : null, competitor_areas: null }]);
  });

  test("never over a type the owner chose (or any type already set)", async () => {
    for (const row of [{ ...CLAY_ROW, niche_id: "gift_shop", niche_source: "owner" }, { ...CLAY_ROW, niche_id: "art_classes", niche_source: "auto" }, { ...CLAY_ROW, niche_source: "owner" }]) {
      const { db, updates } = fakeDb(row);
      expect((await detectAndSaveBusinessTypeWithClient(db, "b1", { readWebsite: noSite })).status).toBe("already_set");
      expect(updates).toEqual([]);
    }
  });

  test("not confident: nothing saved (the Overview keeps asking)", async () => {
    const { db, updates } = fakeDb({ ...CLAY_ROW, name: "Acme LLC", category: "Store", primary_type: "store", categories: ["store"] });
    expect((await detectAndSaveBusinessTypeWithClient(db, "b1", { readWebsite: noSite })).status).toBe("unsure");
    expect(updates).toEqual([]);
  });

  test("dry run saves nothing; before supabase/niche-source-auto.sql the save is refused, not hidden", async () => {
    const dry = fakeDb(CLAY_ROW);
    expect(await detectAndSaveBusinessTypeWithClient(dry.db, "b1", { readWebsite: noSite, apply: false })).toMatchObject({ status: "would_save", nicheId: "art_classes" });
    expect(dry.updates).toEqual([]);
    const old = fakeDb(CLAY_ROW, { code: "23514", message: 'new row violates check constraint "businesses_niche_source_check"' });
    expect(await detectAndSaveBusinessTypeWithClient(old.db, "b1", { readWebsite: noSite })).toMatchObject({ status: "not_enabled", nicheId: "art_classes" });
  });

  test("reads the website's words (one plain fetch, never Google)", async () => {
    const { db } = fakeDb({ ...CLAY_ROW, name: "Rooted On Main", category: "Store", primary_type: "store", categories: ["store"], website: "https://rootedshop.com/" });
    const readWebsite = vi.fn(async () => "Candles, gift sets and gifts — your local gift shop.");
    expect(await detectAndSaveBusinessTypeWithClient(db, "b1", { readWebsite })).toMatchObject({ status: "saved", nicheId: "gift_shop" });
    expect(readWebsite).toHaveBeenCalledWith("https://rootedshop.com/", undefined);
  });
});

describe("after a business is added: type first, then the first score and competitor scan", () => {
  test("in that order, and a failed detection never stops the rest", async () => {
    const order: string[] = [];
    await afterBusinessAdded({} as never, "b1", {
      detectType: async () => {
        order.push("type");
        throw new Error("boom");
      },
      saveFirst: async () => (order.push("score"), { status: "saved" }),
      ensureCompetitors: async () => order.push("competitors"),
    });
    expect(order).toEqual(["type", "score", "competitors"]);
  });
});

describe("the Overview banner", () => {
  const row = { name: "Centered Clay Studio", category: "Educational Institution", primary_type: "educational_institution", categories: ["educational_institution"], business_type_override: "tutor_education", niche_id: "art_classes", niche_confirmed_at: null };

  test("PostScore's pick → “We picked … — Change” until confirmed; the owner's own choice → no banner", () => {
    const auto = resolveBusinessNiche({ ...row, niche_source: "auto" });
    expect(auto).toMatchObject({ nicheId: "art_classes", source: "auto", showBanner: true });
    expect(nicheBannerKind(auto)).toBe("picked");
    expect(nicheBannerKind(resolveBusinessNiche({ ...row, niche_source: "auto", niche_confirmed_at: "2026-11-14T00:00:00Z" }))).toBeNull();
    expect(nicheBannerKind(resolveBusinessNiche({ ...row, niche_source: "owner" }))).toBeNull();
  });

  test("EN + ES wording, with Looks right and Change", () => {
    const render = (locale: "en" | "es") =>
      renderToStaticMarkup(
        <LocaleProvider locale={locale} timeZone="America/New_York">
          <NicheBanner businessId="b1" kind="picked" nicheId="art_classes" suggestion={null} parentLabel="Tutoring" />
        </LocaleProvider>
      );
    const en = render("en");
    expect(en).toContain("We picked Art &amp; pottery classes for your business.");
    expect(en).toContain("Looks right");
    expect(en).toContain("Change");
    expect(render("es")).toContain("Elegimos Clases de arte para su negocio.");
  });
});
