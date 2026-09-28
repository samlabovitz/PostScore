import { describe, expect, test } from "vitest";
import { bizProfile, bizProfileById, getBizProfileOptions } from "./bizProfiles";

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
  test("there are exactly 39 business type options", () => {
    expect(getBizProfileOptions("en").length).toBe(39);
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
