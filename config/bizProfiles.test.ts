import { describe, expect, test } from "vitest";
import { bizProfile, bizProfileById, getBizProfileOptions, resolveBizProfile } from "./bizProfiles";

const NEW_TYPE_IDS = [
  "home_services",
  "repair_dropoff",
  "recreation",
  "events",
  "car_wash_detailing",
  "childcare",
  "lodging",
  "tattoo_body_art",
] as const;

describe("Day 2 new business types — content completeness", () => {
  test("there are exactly 44 business type options", () => {
    expect(getBizProfileOptions("en").length).toBe(44);
  });

  test("all 8 new ids are present among the options", () => {
    const ids = new Set(getBizProfileOptions("en").map((o) => o.id));
    for (const id of NEW_TYPE_IDS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  for (const id of NEW_TYPE_IDS) {
    test(`${id} has complete English and Spanish content`, () => {
      for (const locale of ["en", "es"] as const) {
        const profile = bizProfileById(id, locale);
        expect(profile).not.toBeNull();
        const p = profile!;

        expect(p.label.length).toBeGreaterThan(0);
        expect(p.competitorNoun.length).toBeGreaterThan(0);

        expect(p.couponPresets.length).toBe(3);
        for (const cp of p.couponPresets) {
          expect(cp.label.length).toBeGreaterThan(0);
          expect(cp.description.length).toBeGreaterThan(0);
        }

        expect(p.offerTemplates.length).toBe(2);
        for (const ot of p.offerTemplates) {
          expect(ot.label.length).toBeGreaterThan(0);
          expect(ot.description.length).toBeGreaterThan(0);
        }

        expect(p.couponAngles.firstTime.length).toBeGreaterThan(0);
        expect(p.couponAngles.seasonal.length).toBeGreaterThan(0);
        expect(p.couponAngles.slowDay.length).toBeGreaterThan(0);

        expect(p.faq.length).toBe(2);
        for (const f of p.faq) {
          expect(f.question.length).toBeGreaterThan(0);
          expect(f.answer.length).toBeGreaterThan(0);
        }

        expect(p.referralOk).toBe(true);
        expect(p.referralPresets.length).toBe(2);
        for (const rp of p.referralPresets) {
          expect(rp.referrerReward.length).toBeGreaterThan(0);
          expect(rp.friendReward.length).toBeGreaterThan(0);
          expect(rp.description.length).toBeGreaterThan(0);
        }

        expect(p.pricingExamples.length).toBe(3);
        for (const pe of p.pricingExamples) {
          expect(pe.length).toBeGreaterThan(0);
        }

        expect(p.pricingTips.length).toBe(4);
        for (const pt of p.pricingTips) {
          expect(pt.label.length).toBeGreaterThan(0);
          expect(pt.description.length).toBeGreaterThan(0);
        }
      }
    });
  }

  test("FAQ answers never mention a website, contact form, or a specific page", () => {
    const banned = /\b(website|web site|contact form|home ?page)\b/i;
    for (const id of NEW_TYPE_IDS) {
      const p = bizProfileById(id, "en")!;
      for (const f of p.faq) {
        expect(f.answer).not.toMatch(banned);
      }
    }
  });
});

describe("Day 2 new business types — auto-detect safety", () => {
  test('"Roofer" detects as home_services', () => {
    expect(bizProfile("Roofer", null).id).toBe("home_services");
  });

  test('"Dry Cleaner" detects as repair_dropoff', () => {
    expect(bizProfile("Dry Cleaner", null).id).toBe("repair_dropoff");
  });

  test('"Golf Driving Range" detects as recreation', () => {
    expect(bizProfile("Golf Driving Range", null).id).toBe("recreation");
  });

  test('"Car Wash" detects as car_wash_detailing', () => {
    expect(bizProfile("Car Wash", null).id).toBe("car_wash_detailing");
  });

  test('"Hotel" detects as lodging', () => {
    expect(bizProfile("Hotel", null).id).toBe("lodging");
  });

  test('"Tattoo Parlor" detects as tattoo_body_art', () => {
    expect(bizProfile("Tattoo Parlor", null).id).toBe("tattoo_body_art");
  });

  test('"Wedding Venue" detects as events, "Preschool" detects as childcare', () => {
    expect(bizProfile("Wedding Venue", null).id).toBe("events");
    expect(bizProfile("Preschool", null).id).toBe("childcare");
  });

  // The collisions explicitly checked and avoided — see the "Auto-detect
  // safety" section of ~/Desktop/new-types-review.md.
  test('an "Electrical Contractor" still detects as electrician, not home_services (the "contractor" collision)', () => {
    expect(bizProfile("Electrical Contractor", "electrician").id).toBe("electrician");
  });

  test('a "Martial Arts Studio" does not get pulled into tattoo_body_art (the "art" collision)', () => {
    expect(bizProfile("Martial Arts Studio", null).id).not.toBe("tattoo_body_art");
  });

  test("existing types still detect exactly as before for representative Google categories", () => {
    expect(bizProfile("Restaurant", "restaurant").id).toBe("restaurant");
    expect(bizProfile("Barber Shop", "barber_shop").id).toBe("barbershop");
    expect(bizProfile("Auto Repair Shop", "car_repair").id).toBe("auto_repair");
    expect(bizProfile("Bar", "bar").id).toBe("bar");
  });
});

describe("Day 2 step 2b — short-keyword word-boundary matching", () => {
  // A short keyword (5 chars or fewer) must only match as a whole word,
  // never as a substring inside an unrelated word — see keywordMatches()
  // in bizProfiles.ts. Every category below still resolves exactly as
  // it did before this step; none of these is a new behavior.
  const REGRESSION_CASES: Array<[string, string]> = [
    ["Restaurant", "restaurant"],
    ["Deli", "restaurant"],
    ["Day spa", "spa"],
    ["Spa", "spa"],
    ["Sports bar", "bar"],
    ["Bar", "bar"],
    ["Pub", "bar"],
    ["Nail salon", "nail_salon"],
    ["Lash studio", "nail_salon"],
    ["Hair salon", "salon"],
    ["Gym", "gym_fitness"],
    ["Cafe", "cafe"],
    ["Coffee shop", "cafe"],
    ["Barbershop", "barbershop"],
    ["Landscaper", "landscaper"],
    ["Orthodontist", "dentist"],
    ["Auto repair shop", "auto_repair"],
    ["Electrical contractor", "electrician"],
    ["Plumber", "plumber"],
    ["House cleaning service", "cleaning_service"],
  ];

  for (const [category, expected] of REGRESSION_CASES) {
    test(`"${category}" still resolves to ${expected}`, () => {
      expect(bizProfile(category, null).id).toBe(expected);
    });
  }

  // The specific false positives/negatives this step fixes.
  const FIX_CASES: Array<[string, string]> = [
    ["Remodeling contractor", "home_services"],
    ["Event space", "events"],
    ["Dry cleaning service", "repair_dropoff"],
    ["Day care center", "childcare"],
    ["Child care agency", "childcare"],
    ["Amusement center", "recreation"],
    ["Amusement park", "recreation"],
    ["Golf course", "recreation"],
    ["Brewpub", "bar"],
    ["Gastropub", "bar"],
    ["Cafeteria", "restaurant"],
  ];

  for (const [category, expected] of FIX_CASES) {
    test(`"${category}" now resolves to ${expected}`, () => {
      expect(bizProfile(category, null).id).toBe(expected);
    });
  }

  test('"Remodeling contractor" is not restaurant (the "deli" inside "remodeling" false match)', () => {
    expect(bizProfile("Remodeling contractor", null).id).not.toBe("restaurant");
  });

  test('"Delivery service" is not restaurant (the "deli" inside "delivery" false match)', () => {
    expect(bizProfile("Delivery service", null).id).not.toBe("restaurant");
  });

  test('"Splash pad" is not nail_salon (the "lash" inside "splash" false match)', () => {
    expect(bizProfile("Splash pad", null).id).not.toBe("nail_salon");
  });
});

describe("Fix D — conservative law-firm auto-detection beyond the primary category", () => {
  test("a legal Google type in SECONDARY types alone (never the primary) resolves to lawyer — the real Kimmel & Silverman shape: category/primaryType both say Consultant", () => {
    const profile = bizProfile("Consultant", "consultant", "en", ["consultant", "lawyer"], null);
    expect(profile.id).toBe("lawyer");
  });

  test("a legal Google type (legal_services) anywhere in secondary types resolves to lawyer", () => {
    const profile = bizProfile("Consultant", "consultant", "en", ["consultant", "legal_services"], null);
    expect(profile.id).toBe("lawyer");
  });

  test('name "Law Offices of X" with a non-legal (consultant) Google type still resolves to lawyer', () => {
    const profile = bizProfile("Consultant", "consultant", "en", null, "Law Offices of Jane Smith");
    expect(profile.id).toBe("lawyer");
  });

  test('name "Kimmel & Silverman PC, Delaware Lemon Law Firm" with a Consultant Google type resolves to lawyer — the real audit case', () => {
    const profile = bizProfile(
      "Consultant",
      "consultant",
      "en",
      null,
      "Kimmel & Silverman PC, Delaware Lemon Law Firm"
    );
    expect(profile.id).toBe("lawyer");
  });

  test('name matches "attorney(s)" / "lawyer(s)" / "Esq." too, each a whole word, not just "law firm"/"law office(s)"', () => {
    expect(bizProfile(null, null, "en", null, "Smith & Jones Attorneys at Law").id).toBe("lawyer");
    expect(bizProfile(null, null, "en", null, "Jane Smith, Attorney").id).toBe("lawyer");
    expect(bizProfile(null, null, "en", null, "City Lawyers Group").id).toBe("lawyer");
    expect(bizProfile(null, null, "en", null, "John Smith, Esq.").id).toBe("lawyer");
  });

  test('"Lawn Care Pros" is NOT detected as a law firm — "law" is only a prefix of "Lawn", never the word "law"', () => {
    const profile = bizProfile("Landscaper", "landscaper", "en", null, "Lawn Care Pros");
    expect(profile.id).not.toBe("lawyer");
  });

  test('"Lawson\'s Bakery" is NOT detected as a law firm — "law" is only a prefix of "Lawson\'s"', () => {
    const profile = bizProfile("Bakery", "bakery", "en", null, "Lawson's Bakery");
    expect(profile.id).not.toBe("lawyer");
  });

  test("an unrelated secondary type list with no real legal type never triggers lawyer detection", () => {
    const profile = bizProfile("Consultant", "consultant", "en", ["consultant", "tutoring_service"], null);
    expect(profile.id).not.toBe("lawyer");
  });

  test("resolveBizProfile: a manual override to some OTHER type still wins even when the name/secondary types say lawyer", () => {
    const profile = resolveBizProfile(
      "Consultant",
      "consultant",
      "consultant",
      "en",
      ["lawyer"],
      "Law Offices of Jane Smith"
    );
    expect(profile.id).toBe("consultant");
  });

  test("resolveBizProfile: a manual override TO lawyer still wins even with no secondary-type or name signal at all", () => {
    const profile = resolveBizProfile("Restaurant", "restaurant", "lawyer", "en", null, "Joe's Diner");
    expect(profile.id).toBe("lawyer");
  });
});

import { GOOGLE_TABLE_A_TYPES } from "@/lib/google/placeTypesTableA";

describe("Day 2b — every Google search type is a real one", () => {
  test("every placesType on every business type is in Google's Table A (Nearby Search rejects anything else)", () => {
    for (const option of getBizProfileOptions("en")) {
      for (const type of bizProfileById(option.id, "en")!.placesType) {
        expect(GOOGLE_TABLE_A_TYPES.has(type), `${option.id}: ${type}`).toBe(true);
      }
    }
  });
});

describe("Day 2b — the listing's other Google types are tried before General Business", () => {
  const detect = (category: string, primary: string, categories: string[], name = "Test Business") =>
    bizProfile(category, primary, "en", categories, name).id;

  test("the 8 saved businesses that used to be General Business", () => {
    expect(detect("Donut Shop", "donut_shop", ["donut_shop", "hot_dog_restaurant", "tea_house", "bakery", "food_store", "store", "restaurant"])).toBe("dessert_shop");
    expect(detect("Store", "store", ["clothing_store", "store", "point_of_interest", "establishment"])).toBe("retail_boutique");
    expect(detect("Sporting Goods Store", "sporting_goods_store", ["womens_clothing_store", "sporting_goods_store", "store"])).toBe("specialty_store");
    expect(detect("Department Store", "department_store", ["department_store", "garden_center", "tire_shop", "car_repair"])).toBe("specialty_store");
    expect(detect("Tea House", "tea_house", ["tea_house", "point_of_interest", "establishment"])).toBe("cafe");
    expect(detect("Services", "service", ["tour_agency", "travel_agency", "point_of_interest", "service", "establishment"])).toBe("recreation");
    // Google only says "store" — still honestly General Business.
    expect(detect("Store", "store", ["point_of_interest", "store", "establishment"])).toBe("default");
  });

  test("generic secondary types (store, food_store, service…) never decide the type", () => {
    expect(detect("Store", "store", ["food_store", "food", "store", "service", "health"])).toBe("default");
  });

  test("the primary type still wins over a secondary one", () => {
    expect(detect("Hardware Store", "hardware_store", ["clothing_store"])).toBe("hardware_store");
  });
});

describe("Day 2b — common Google types that used to fall into General Business", () => {
  const cases: Array<[string, string, string]> = [
    ["Night Club", "night_club", "bar"],
    ["Meal Takeaway", "meal_takeaway", "restaurant"],
    ["Lodging", "lodging", "lodging"],
    ["Inn", "inn", "lodging"],
    ["Bagel Shop", "bagel_shop", "bakery"],
    ["Ice Cream Shop", "ice_cream_shop", "dessert_shop"],
    ["Donut Shop", "donut_shop", "dessert_shop"],
    ["Juice Shop", "juice_shop", "dessert_shop"],
    ["Tea House", "tea_house", "cafe"],
    ["Pet Care", "pet_care", "pet_services"],
    ["Pet Boarding Service", "pet_boarding_service", "pet_services"],
    ["Book Store", "book_store", "specialty_store"],
    ["Jewelry Store", "jewelry_store", "specialty_store"],
    ["Butcher Shop", "butcher_shop", "grocery_market"],
    ["Steak House", "steak_house", "restaurant"],
    ["Wellness Center", "wellness_center", "spa"],
  ];
  for (const [category, type, expected] of cases) {
    test(`"${category}" (${type}) → ${expected}`, () => {
      expect(bizProfile(category, type, "en").id).toBe(expected);
    });
  }

  test('"Marketing Consultant" is still consulting (no bare "market" keyword)', () => {
    expect(bizProfile("Marketing Consultant", "marketing_consultant", "en").id).toBe("consultant");
  });
});

describe("Day 2b — Community Center", () => {
  test("Google's community_center type → community_center", () => {
    expect(bizProfile("Community Center", "community_center", "en").id).toBe("community_center");
  });
  test("a YMCA Google calls a gym is a community center by its name; a plain gym stays a gym", () => {
    expect(bizProfile("Gym", "gym", "en", ["gym"], "YMCA of Greater Westchester").id).toBe("community_center");
    expect(bizProfile("Gym", "gym", "en", ["gym"], "Minnesota Jewish Community Center - Capp Center").id).toBe("community_center");
    expect(bizProfile("Gym", "gym", "en", ["gym"], "Planet Fitness").id).toBe("gym_fitness");
  });
  test("its own noun and price examples in EN and ES, gym membership content underneath", () => {
    const en = bizProfileById("community_center", "en")!;
    const es = bizProfileById("community_center", "es")!;
    expect(en.label).toBe("Community Center");
    expect(es.label).toBe("Centro comunitario");
    expect(en.competitorNoun).toBe("community centers");
    expect(en.pricingExamples).toEqual(["Adult monthly membership", "Family membership", "Summer day camp (per week)"]);
    expect(es.pricingExamples[0]).toBe("Membresía mensual para adultos");
    expect(en.couponPresets).toEqual(bizProfileById("gym_fitness", "en")!.couponPresets);
  });
});

describe("Day 2b — nonprofit and place of worship", () => {
  test("detection", () => {
    expect(bizProfile("Non-Profit Organization", "non_profit_organization", "en").id).toBe("nonprofit");
    expect(bizProfile("Church", "church", "en").id).toBe("place_of_worship");
    expect(bizProfile("Mosque", "mosque", "en").id).toBe("place_of_worship");
    expect(bizProfile("Synagogue", "synagogue", "en").id).toBe("place_of_worship");
  });

  test("nonprofit: complete EN + ES content, no referral rewards", () => {
    for (const locale of ["en", "es"] as const) {
      const p = bizProfileById("nonprofit", locale)!;
      expect(p.couponPresets).toHaveLength(3);
      expect(p.offerTemplates).toHaveLength(2);
      expect(p.faq).toHaveLength(2);
      expect(p.pricingExamples).toHaveLength(3);
      expect(p.pricingTips).toHaveLength(4);
      expect(p.referralOk).toBe(false);
      expect(p.couponsOk).toBe(true);
      expect(p.pricingOk).toBe(true);
      for (const text of [p.label, p.competitorNoun, ...p.pricingExamples, ...p.faq.flatMap((f) => [f.question, f.answer])]) {
        expect(text).not.toMatch(/^bizProfiles\./);
      }
    }
    expect(bizProfileById("nonprofit", "es")!.label).not.toBe(bizProfileById("nonprofit", "en")!.label);
  });

  test("place of worship: no coupons, referrals or price check — but a real FAQ in EN + ES", () => {
    for (const locale of ["en", "es"] as const) {
      const p = bizProfileById("place_of_worship", locale)!;
      expect([p.couponsOk, p.referralOk, p.pricingOk]).toEqual([false, false, false]);
      expect(p.couponPresets).toEqual([]);
      expect(p.pricingTips).toEqual([]);
      expect(p.faq).toHaveLength(2);
      for (const f of p.faq) expect(f.answer).not.toMatch(/\b(website|web site|contact form|home ?page)\b/i);
    }
  });

  test("every other type keeps coupons and the price check", () => {
    for (const option of getBizProfileOptions("en")) {
      if (option.id === "place_of_worship") continue;
      const p = bizProfileById(option.id, "en")!;
      expect(p.couponsOk, option.id).toBe(true);
      expect(p.pricingOk, option.id).toBe(true);
    }
  });
});

describe("Day 2b — new option-level types have their own words", () => {
  for (const id of ["dessert_shop", "specialty_store"]) {
    test(`${id}: label, noun and 3 price examples in EN and ES`, () => {
      const en = bizProfileById(id, "en")!;
      const es = bizProfileById(id, "es")!;
      expect(en.label).not.toBe(es.label);
      expect(en.competitorNoun).not.toBe(es.competitorNoun);
      expect(en.pricingExamples).toHaveLength(3);
      expect(es.pricingExamples).toHaveLength(3);
      expect(es.pricingExamples).not.toEqual(en.pricingExamples);
    });
  }
});

import { placeTypeList } from "@/lib/placeTypeLabels";

describe("Day 2b — every search type has a plain name for the Competitors note", () => {
  test("EN and ES name for every placesType", () => {
    for (const option of getBizProfileOptions("en")) {
      for (const type of bizProfileById(option.id, "en")!.placesType) {
        expect(placeTypeList([type], "en"), `${option.id}: ${type}`).not.toBe("");
        expect(placeTypeList([type], "es"), `${option.id}: ${type}`).not.toBe("");
      }
    }
  });
});
