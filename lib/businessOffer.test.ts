import { describe, expect, test } from "vitest";
import fs from "node:fs";
import { DIFFERENTIATOR_MAX, formatSpendRange, OFFER_KIND_BY_TYPE, offerKindFor, offerWording, ownerProvidedLines } from "@/lib/businessOffer";
import { getBizProfileOptions } from "@/config/bizProfiles";
import { factsBlockText } from "@/lib/postaiFacts";

describe("wording by business type", () => {
  test("salon → Services, price per service, its own example (EN + ES)", () => {
    const en = offerWording("salon", "en");
    expect(en).toMatchObject({ kind: "services", offerLabel: "Services", spendLabel: "Typical price per service", offerExample: "e.g. Balayage, keratin" });
    expect(en.offerPrompt).toBe("Add the services you offer so PostAI's ideas fit your business");
    expect(offerWording("salon", "es")).toMatchObject({ offerLabel: "Servicios", spendLabel: "Precio típico por servicio", offerExample: "p. ej. Balayage, keratina" });
  });

  test("specialty store (e.g. Switch Skate & Snow) → Products & brands, typical purchase", () => {
    const en = offerWording("specialty_store", "en");
    expect(en).toMatchObject({ kind: "products", offerLabel: "Products & brands", spendLabel: "Typical purchase", offerExample: "e.g. Snowboards, Burton, skate shoes" });
    expect(en.offerPrompt).toBe("Add what you sell so PostAI's ideas fit your shop");
    expect(offerWording("specialty_store", "es")).toMatchObject({ offerLabel: "Productos y marcas", spendLabel: "Compra típica" });
  });

  test("restaurant / bakery → Menu favorites, check per person", () => {
    expect(offerWording("restaurant", "en")).toMatchObject({ kind: "menu", offerLabel: "Menu favorites", spendLabel: "Typical check per person" });
    expect(offerWording("bakery", "en").offerExample).toBe("e.g. Cupcakes, custom cakes");
    expect(offerWording("restaurant", "es")).toMatchObject({ offerLabel: "Favoritos del menú", spendLabel: "Cuenta típica por persona" });
  });

  test("gyms, studios, schools, community centers → Programs & classes", () => {
    for (const id of ["gym_fitness", "tutor_education", "community_center"]) {
      expect(offerWording(id, "en")).toMatchObject({ kind: "programs", offerLabel: "Programs & classes", spendLabel: "Typical membership or class price" });
    }
  });

  test("fallback: neutral wording for default, nonprofit, place of worship, lodging — and any unknown type", () => {
    for (const id of ["default", "nonprofit", "place_of_worship", "lodging", "not_a_type", null, undefined]) {
      expect(offerWording(id, "en"), String(id)).toMatchObject({ kind: "neutral", offerLabel: "What you offer", spendLabel: "Typical sale", offerExample: "e.g. What you're known for" });
    }
    expect(offerWording(null, "es")).toMatchObject({ offerLabel: "Lo que ofrece", spendLabel: "Venta típica" });
  });

  test("every business type is covered: mapped, or deliberately neutral", () => {
    const neutral = new Set(["lodging", "nonprofit", "place_of_worship", "default"]);
    const ids = getBizProfileOptions("en").map((o) => o.id);
    for (const id of ids) expect(OFFER_KIND_BY_TYPE[id] !== undefined || neutral.has(id), id).toBe(true);
    for (const id of Object.keys(OFFER_KIND_BY_TYPE)) expect(ids, id).toContain(id);
    expect(offerKindFor("specialty_store")).toBe("products");
  });

  test("'What makes you different' is the same for every type (EN + ES)", () => {
    expect(offerWording("plumber", "en")).toMatchObject({ differentLabel: "What makes you different", differentExample: "e.g. Family-owned since 1998, free parking" });
    expect(offerWording("plumber", "es").differentLabel).toBe("Qué lo hace diferente");
    expect(DIFFERENTIATOR_MAX).toBe(160);
  });

  test("typical spend reads as a range", () => {
    expect(formatSpendRange(40, 120)).toBe("$40–$120");
    expect(formatSpendRange(12.5, 30)).toBe("$12.50–$30");
    expect(formatSpendRange(25, 25)).toBe("$25");
  });
});

describe("PostAI uses them, labeled owner-provided with the type's meaning", () => {
  test("worded for the type; missing entries say so — never invented", () => {
    expect(ownerProvidedLines({ businessTypeId: "specialty_store", services: ["Snowboards", "Burton"], avgJobValueLow: 40, avgJobValueHigh: 400, differentiator: "Free board waxing" })).toEqual([
      "Products & brands (owner-provided): Snowboards, Burton.",
      "Typical purchase (owner-provided): $40–$400.",
      "What makes you different (owner-provided): Free board waxing",
    ]);
    expect(ownerProvidedLines({ businessTypeId: "default", services: [], avgJobValueLow: null, avgJobValueHigh: null })).toEqual([
      'What you offer: not added yet — the owner hasn\'t listed them in "What PostAI knows about your business".',
      "Typical sale: not added yet.",
      "What makes you different: not added yet.",
    ]);
  });

  test("the FACTS block carries them under OWNER-PROVIDED (not verified by PostScore)", () => {
    const base = { total: 70, grade: "C", rating: 4.6, reviewCount: 40, ratingFullAtReviews: 40, reviewCountFullAt: 150, lowRatingBelow: 4.3, nearbyReviewAverage: null, hasWebsite: true, rank: null, rankCard: null, plan: "grow" as const, categories: [], projections: [], projectedScore: null, competitors: [], checks: [], replyCounts: null };
    const text = factsBlockText({ ...base, ownerProvided: ownerProvidedLines({ businessTypeId: "bakery", services: ["Cupcakes"], avgJobValueLow: 5, avgJobValueHigh: 60, differentiator: null }) });
    expect(text).toContain("- OWNER-PROVIDED (the owner's own words");
    expect(text).toContain("not verified by PostScore");
    expect(text).toContain("  - Menu favorites (owner-provided): Cupcakes.");
    expect(text).toContain("  - Typical check per person (owner-provided): $5–$60.");
    expect(factsBlockText({ ...base, ownerProvided: [] })).not.toContain("OWNER-PROVIDED");
    expect(fs.readFileSync("app/actions/assistant.ts", "utf8")).toContain("owner: businessProfile,");
  });
});

describe("saved data carries over", () => {
  test("no column is dropped or renamed: 'what you offer' is still businesses.services, the spend still avg_job_value_low/high", () => {
    const sql = fs.readFileSync("supabase/business-differentiator.sql", "utf8");
    expect(sql).toContain("alter table public.businesses add column if not exists differentiator text;");
    const statements = sql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/drop column|rename column|update public\.businesses/i);
    const save = fs.readFileSync("app/actions/businesses.ts", "utf8");
    expect(save).toContain(".update({ services, avg_job_value_low: avgJobValueLow, avg_job_value_high: avgJobValueHigh })");
    const load = fs.readFileSync("app/actions/assistant.ts", "utf8");
    expect(load).toContain("services: summaryResult.business.services ?? [],");
    expect(load).toContain("avgJobValueLow: summaryResult.business.avg_job_value_low ?? null,");
  });

  test("before the SQL is run, pages still load (the new field reads as empty) and saving it says so", () => {
    const load = fs.readFileSync("app/actions/assistant.ts", "utf8");
    expect(load).toContain('.select("differentiator")');
    expect(load).toContain("if (error || !data) return null;");
    const save = fs.readFileSync("app/actions/businesses.ts", "utf8");
    expect(save).toContain('if (error && (error.code === "PGRST204" || error.code === "42703")) return { status: "not_set_up" };');
    // The page summary never selects it (it would fail before the SQL is run).
    expect(save.slice(save.indexOf("async function getBusinessSummaryUncached"), save.indexOf("export type UpdateBusinessProfileResult"))).not.toContain("differentiator");
  });
});
