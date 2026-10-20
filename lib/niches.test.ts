import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { allNiches, articleFor, classifyCompetitor, detectNiche, isGeneralNiche, nicheById, nicheLabel, nichesOfParent, suggestNiche } from "./niches";
import { resolveBusinessNiche, nicheBannerKind } from "./businessNiche";
import { getBizProfileOptions, resolveBizProfile } from "@/config/bizProfiles";
import { SAVED_BUSINESSES } from "./niches.fixture";
import { tradeLabel } from "./tradeSearch";
import { APPROVED_CORRECTIONS } from "@/scripts/apply-niche-corrections";

describe("the niche list", () => {
  const niches = allNiches();

  test("every id is unique; every niche has EN + ES labels and a real parent type", () => {
    const ids = niches.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const parents = new Set(getBizProfileOptions("en").map((o) => o.id));
    for (const n of niches) {
      expect(parents.has(n.parent), n.id).toBe(true);
      expect(n.label.en.trim(), n.id).not.toBe("");
      expect(n.label.es.trim(), n.id).not.toBe("");
    }
    expect(niches.length).toBeGreaterThanOrEqual(230);
  });

  test("every 'also competes with' entry is a real niche id (and never the niche itself)", () => {
    const ids = new Set(niches.map((n) => n.id));
    const broken = niches.flatMap((n) => n.areas.filter((a) => !ids.has(a) || a === n.id).map((a) => `${n.id} → ${a}`));
    expect(broken).toEqual([]);
  });

  test("every parent type is also a niche (the general fallback)", () => {
    for (const o of getBizProfileOptions("en")) {
      expect(nicheById(o.id)?.parent).toBe(o.id);
      expect(isGeneralNiche(o.id)).toBe(true);
    }
  });

  test("the 10 added niches exist (EN + ES)", () => {
    const added: Array<[string, string]> = [
      ["laundromat", "Laundromat"],
      ["eyewear", "Eyewear & optical store"],
      ["auto_parts", "Auto parts store"],
      ["funeral_home", "Funeral home"],
      ["self_storage", "Self storage"],
      ["print_sign", "Print & sign shop"],
      ["shipping_mailbox", "Shipping & mailbox store"],
      ["travel_agency", "Travel agency"],
      ["cannabis_dispensary", "Cannabis dispensary"],
      ["gas_station", "Gas station"],
    ];
    for (const [id, en] of added) {
      expect(nicheLabel(id, "en"), id).toBe(en);
      expect(nicheLabel(id, "es"), id).not.toBe(en === "Laundromat" ? "Laundromat" : "");
    }
  });

  test("the removed vague areas are gone", () => {
    const ids = new Set(niches.map((n) => n.id));
    for (const gone of ["laundromats", "fine_dining", "animal_hospitals", "debt_relief", "title_companies", "mediators", "workers_comp", "feed_stores", "health_coaches", "kids_activities", "pediatric_therapy", "other_dealers", "asian_other"]) expect(ids.has(gone)).toBe(false);
  });
});

describe("detecting the saved businesses (the approved mapping)", () => {
  const EXPECTED: Record<string, string> = {
    "BAB’s Nashville Hot Chicken": "chicken_wings",
    "Bánh Mì Boy - Vietnamese Sandwiches": "vietnamese",
    "Bing's Bakery": "bakery",
    "Blue Bottle Coffee": "cafe",
    "Brew HaHa!": "cafe",
    "Chipotle Mexican Grill": "mexican",
    "Claymont Steak Shop": "sandwiches",
    "Coffee Labs Roasters Inc.": "coffee_roaster",
    "Colorful Yun Nan": "chinese",
    "CTown Supermarkets": "grocery_market",
    "Drip Cafe": "cafe",
    "Drybar - Midtown East": "blowout_bar",
    "El Diablo Burritos": "mexican",
    "El Taco Loco": "mexican",
    "Elmsford Wine & Liquors": "liquor_store",
    "Endless Nails": "nail_salon",
    "Goldberg Hardware": "hardware_store",
    "Great Clips": "hair_salon",
    "Hair express on Broadway": "hair_salon",
    honeygrow: "salad_bowls",
    "Hudson Shears": "salon",
    "Ilda's Salon": "salon",
    "J & G Italian Deli": "deli",
    "Kimmel & Silverman PC, Delaware Lemon Law Firm": "consumer_law",
    "Kung Fu Tea": "bubble_tea",
    "Law Office of Dana Stricker, PLLC": "lawyer",
    "Law Offices of Gregg L. Smith": "lawyer",
    "LocalLuv Salon": "hair_salon",
    "Main Street Cleaners": "dry_cleaner",
    "Main Street Sweets": "cafe",
    "Miami Watersports": "water_sports",
    "Mini Shop in Delaware": "default",
    "Mochinut Delaware": "donut_shop",
    "Modern Liquors": "liquor_store",
    "New Karma Salon": "salon",
    "Pardalis and Nohavicka Lawyers": "lawyer",
    "Qamaria Yemeni Coffee Co.": "cafe",
    "QDOBA Mexican Eats": "mexican",
    "Red Bowl‎": "chinese",
    "Roots Natural Kitchen": "salad_bowls",
    "Santa Fe Mexican Grill - Newark": "mexican",
    "Shames JCC on the Hudson": "ymca_jcc",
    "Shoe Tech Shoe Repair": "shoe_repair",
    "Stadium Liquors": "liquor_store",
    "Switch Skate & Snow": "skate_snow",
    "Tastea Newark": "bubble_tea",
    "The Bagel Emporium of Tarrytown": "bagel_shop",
    "The Original Hot Bagels": "bagel_shop",
    "The Taco Project": "mexican",
    "Umami Express LLC Sushi to Go": "japanese_sushi",
    "Westchester Wine Warehouse": "wine_shop",
    "Wonder The Grove Newark": "food_hall",
    "Yoga Box": "yoga",
    "Yoga Love NY": "yoga",
    "YogaSix White Plains": "yoga",
  };

  const detect = (name: string) => {
    const b = SAVED_BUSINESSES.find((x) => x.name === name)!;
    return resolveBusinessNiche({ name: b.name, category: b.category, primary_type: b.primaryType, categories: b.types, business_type_override: b.override, trade_id: b.tradeId });
  };

  test("every business without an approved correction is detected as approved, within its own type", () => {
    const corrected = new Set(APPROVED_CORRECTIONS.map((c) => c.name));
    const wrong: string[] = [];
    for (const b of SAVED_BUSINESSES) {
      if (corrected.has(b.name)) continue;
      const r = detect(b.name);
      if (EXPECTED[b.name] !== r.nicheId) wrong.push(`${b.name}: ${r.nicheId} (expected ${EXPECTED[b.name]})`);
      expect(nicheById(r.nicheId)?.parent).toBe(r.parent);
    }
    expect(wrong).toEqual([]);
    expect(SAVED_BUSINESSES.length - corrected.size).toBe(Object.keys(EXPECTED).length);
  });

  test("the approved corrections are real niches; Switch Skate & Snow is a Skate & snow shop", () => {
    for (const c of APPROVED_CORRECTIONS) expect(nicheById(c.nicheId), c.nicheId).not.toBeNull();
    expect(detect("Switch Skate & Snow").nicheId).toBe("skate_snow");
    expect(nicheLabel("skate_snow", "es")).toBe("Tienda de skate y snowboard");
  });

  test("Main Street Sweets keeps the owner's café type; the banner suggests Ice cream", () => {
    const r = detect("Main Street Sweets");
    expect(r.parent).toBe("cafe");
    expect(r.suggestion).toBe("ice_cream");
    expect(nicheBannerKind(r)).toBe("suggest");
    expect(articleFor(nicheLabel("ice_cream", "en"))).toBe("an");
  });

  test("law firms with no practice area in their name: we ask the owner instead of guessing", () => {
    for (const name of ["Law Office of Dana Stricker, PLLC", "Law Offices of Gregg L. Smith", "Pardalis and Nohavicka Lawyers"]) {
      const r = detect(name);
      expect(r.needsOwner, name).toBe(true);
      expect(nicheBannerKind(r)).toBe("needsOwner");
    }
  });

  test("a saved niche is honored only when it belongs to the business's type; a confirmed one shows no banner", () => {
    const base = { name: "Switch Skate & Snow", category: "Sporting Goods Store", primary_type: "sporting_goods_store", categories: ["sporting_goods_store", "clothing_store"], business_type_override: null };
    const owner = resolveBusinessNiche({ ...base, niche_id: "bike_shop", niche_source: "owner", niche_confirmed_at: "2026-10-20T00:00:00Z" });
    expect(owner.nicheId).toBe("bike_shop");
    expect(nicheBannerKind(owner)).toBeNull();
    const mismatch = resolveBusinessNiche({ ...base, niche_id: "yoga", niche_source: "owner" });
    expect(mismatch.nicheId).toBe("skate_snow");
    const approved = resolveBusinessNiche({ ...base, niche_id: "sporting_goods", niche_source: "approved" });
    expect(approved.source).toBe("approved");
    expect(nicheBannerKind(approved)).toBe("weThink");
  });

  test("the intake trade counts as a signal", () => {
    expect(tradeLabel("bicycle_shop", "en")).toBeTruthy();
    expect(detectNiche({ name: "Spokes & Co", category: "Store", primaryType: "store", types: ["store"], tradeName: tradeLabel("bicycle_shop", "en") }, "specialty_store").nicheId).toBe("bike_shop");
  });

  test("suggestions come only from Google's primary type, under another type", () => {
    expect(suggestNiche({ name: "X", category: "Ice Cream Shop", primaryType: "ice_cream_shop", types: [] }, "cafe")).toBe("ice_cream");
    expect(suggestNiche({ name: "X", category: "Ice Cream Shop", primaryType: "ice_cream_shop", types: [] }, "dessert_shop")).toBeNull();
    expect(suggestNiche({ name: "Ice cream place", category: null, primaryType: "store", types: [] }, "cafe")).toBeNull();
  });
});

describe("sorting saved competitors by name", () => {
  const ctx = { nicheId: "skate_snow", areas: ["sporting_goods", "sneakers_streetwear", "retail_boutique", "shoe_store", "specialty_store"], parent: "specialty_store" };
  test.each([
    ["Zumiez Skate Shop", "skate_snow"],
    ["R&M Hockey Supply Hollydell", "hockey_team"],
    ["American Sports", "sporting_goods"],
    ["The Ski Bum", "outdoor"],
    ["Dancer′s Dressing Room", "dance_supply"],
    ["X-Ring Supply", null],
  ])("%s → %s", (name, expected) => {
    expect(classifyCompetitor(name, ctx)).toBe(expected);
  });

  test("every parent with niches has at least one", () => {
    expect(nichesOfParent("specialty_store").length).toBeGreaterThan(10);
    expect(resolveBizProfile("Sporting Goods Store", "sporting_goods_store", null, "en", [], "Switch Skate & Snow").id).toBe("specialty_store");
  });
});

describe("no Google calls", () => {
  test("the niche, scope and choice code never imports the Places client or fetches", () => {
    for (const file of ["lib/niches.ts", "config/niches.ts", "lib/competitorScope.ts", "lib/businessNiche.ts", "lib/businessNiche.server.ts", "app/business/[id]/competitors/CompetitorGroups.tsx", "components/niche/NicheBanner.tsx", "components/niche/NichePicker.tsx", "scripts/apply-niche-corrections.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/google\/places|searchNearby|searchText|fetch\(|competitorScoringJob|refreshCompetitors|runAndSaveCompetitorScan/);
    }
    // Choosing a niche starts at most ONE scan, only from the dedicated action.
    const actions = readFileSync("app/actions/niches.ts", "utf8");
    expect(actions.match(/runAndSaveCompetitorScanWithClient\(/g)).toHaveLength(1);
    expect(actions).toMatch(/export async function updateCompetitorsForNiche[\s\S]*enforceCooldown: true/);
  });
});
