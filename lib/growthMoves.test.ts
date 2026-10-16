import { describe, expect, test } from "vitest";
import {
  buildGrowthMoves,
  buildPriceCheckMove,
  competitorPhotoCounts,
  withoutWebsiteGrowthMoves,
  type GrowthMoveSignals,
} from "./growthMoves";
import { getBizProfileOptions, bizProfileById } from "@/config/bizProfiles";

// A business with every growth-move signal turned "off" — nothing
// should fire. Used as the base for flipping exactly one signal on at
// a time, so each test below proves a move fires (and ONLY fires) on
// its own real signal, never as a side effect of another.
const NOTHING_TO_DO: GrowthMoveSignals = {
  businessId: "biz-1",
  hasEverCreatedPromo: true,
  hasEverCreatedReferral: true,
  pricingAssessedAt: "2026-09-20T00:00:00Z",
  photoCount: 20,
  competitorPhotos: { scanAvailable: false, medianCompetitorPhotoCount: null },
  hasWebsite: true,
  hasWebsiteTaskOpen: false,
  weakWebsiteIssueLabels: [],
};

function ids(signals: GrowthMoveSignals) {
  return buildGrowthMoves(signals, "en").map((m) => m.id);
}

describe("buildGrowthMoves", () => {
  test("run_price_check is the only move that fires when every other signal is already satisfied", () => {
    // Price check always shows (see item 7) — never truly "nothing to do".
    expect(ids(NOTHING_TO_DO)).toEqual(["run_price_check"]);
  });

  test("start_coupon fires only when no promo has ever been created, and disappears once one exists", () => {
    expect(ids({ ...NOTHING_TO_DO, hasEverCreatedPromo: false })).toContain("start_coupon");
    expect(ids(NOTHING_TO_DO)).not.toContain("start_coupon");
  });

  test("start_referral fires only when no referral has ever been created, and disappears once one exists", () => {
    expect(ids({ ...NOTHING_TO_DO, hasEverCreatedReferral: false })).toContain("start_referral");
    expect(ids(NOTHING_TO_DO)).not.toContain("start_referral");
  });

  test("start_referral never fires when referralOk is false, even with no referral ever created — e.g. lawyer, where referral-fee arrangements are professionally restricted", () => {
    expect(
      ids({ ...NOTHING_TO_DO, hasEverCreatedReferral: false, referralOk: false })
    ).not.toContain("start_referral");
  });

  test("start_referral still fires when referralOk is left unset — defaults to true for fixtures/callers that predate this field", () => {
    // NOTHING_TO_DO never sets referralOk at all, proving the omitted-field default.
    expect(ids({ ...NOTHING_TO_DO, hasEverCreatedReferral: false })).toContain("start_referral");
  });

  test("run_price_check always shows — never-run and already-run variants", () => {
    const neverRun = buildGrowthMoves({ ...NOTHING_TO_DO, pricingAssessedAt: null }, "en");
    const neverRunMove = neverRun.find((m) => m.id === "run_price_check");
    expect(neverRunMove?.title).toBe("Compare your prices to nearby competitors");
    expect(neverRunMove?.meta).toBeNull();

    const alreadyRun = buildGrowthMoves({ ...NOTHING_TO_DO, pricingAssessedAt: "2026-09-01T00:00:00Z" }, "en");
    const alreadyRunMove = alreadyRun.find((m) => m.id === "run_price_check");
    expect(alreadyRunMove?.title).toBe("Re-check your prices against competitors");
    expect(alreadyRunMove?.meta).toContain("Last checked");
  });

  test("run_price_check is never removed from the list, however long ago it was last checked", () => {
    const veryStale = new Date("2020-01-01T00:00:00Z").toISOString();
    expect(ids({ ...NOTHING_TO_DO, pricingAssessedAt: veryStale })).toContain("run_price_check");
  });

  test("add_photos_vs_competitors fires when under the cap and behind the competitor median", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 4,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 9 },
    };
    const move = buildGrowthMoves(signals, "en").find((m) => m.id === "add_photos_vs_competitors");
    expect(move).toBeDefined();
    // The real numbers must appear honestly in the copy, not a vague claim.
    expect(move!.why).toContain("9");
    expect(move!.why).toContain("4");
  });

  test("add_photos_vs_competitors says the competitor median is '10 or more', never an exact number, once it's at Google's photo-count cap", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 3,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 10 },
    };
    const move = buildGrowthMoves(signals, "en").find((m) => m.id === "add_photos_vs_competitors");
    expect(move).toBeDefined();
    expect(move!.why).toContain("10 or more");
    expect(move!.why).toContain("3");
  });

  test("add_photos_vs_competitors states the exact competitor median below Google's photo-count cap", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 3,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 9 },
    };
    const move = buildGrowthMoves(signals, "en").find((m) => m.id === "add_photos_vs_competitors");
    expect(move!.why).not.toContain("or more");
    expect(move!.why).toContain("9");
  });

  test("add_photos_vs_competitors never fires with no competitor scan on file", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 2,
      competitorPhotos: { scanAvailable: false, medianCompetitorPhotoCount: null },
    };
    expect(ids(signals)).not.toContain("add_photos_vs_competitors");
  });

  test("add_photos_vs_competitors never fires once the business itself has 10 or more photos", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 10,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 40 },
    };
    expect(ids(signals)).not.toContain("add_photos_vs_competitors");
  });

  test("add_photos_vs_competitors never fires when the business is already ahead of (or tied with) the median", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      photoCount: 8,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 8 },
    };
    expect(ids(signals)).not.toContain("add_photos_vs_competitors");
  });

  test("build_starter_site fires on no website, only when has_website isn't already an open score task", () => {
    expect(
      ids({ ...NOTHING_TO_DO, hasWebsite: false, hasWebsiteTaskOpen: false })
    ).toContain("build_starter_site");
  });

  test("build_starter_site's no-website variant is suppressed while has_website is still an open score task", () => {
    // In practice website.has_website is ALWAYS an open task whenever
    // there's no website, so this is the common real-world shape — the
    // score plan's own website task now carries this exact ask (with a
    // real points range — see lib/actionPlan.ts), so the growth move
    // would just duplicate it.
    expect(
      ids({ ...NOTHING_TO_DO, hasWebsite: false, hasWebsiteTaskOpen: true })
    ).not.toContain("build_starter_site");
  });

  test("build_starter_site never fires for a business that has a website", () => {
    expect(
      ids({ ...NOTHING_TO_DO, hasWebsite: true, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: ["Performance & mobile"] })
    ).not.toContain("build_starter_site");
  });

  test("improve_website fires only for a business with a website that's losing real points, with the real issue name(s) in its copy", () => {
    const signals: GrowthMoveSignals = {
      ...NOTHING_TO_DO,
      hasWebsite: true,
      hasWebsiteTaskOpen: false,
      weakWebsiteIssueLabels: ["Performance & mobile"],
    };
    const move = buildGrowthMoves(signals, "en").find((m) => m.id === "improve_website");
    expect(move).toBeDefined();
    expect(move!.why).toContain("Performance & mobile");
  });

  test("improve_website never fires for a business with no website (build_starter_site's job instead)", () => {
    expect(
      ids({ ...NOTHING_TO_DO, hasWebsite: false, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: ["Performance & mobile"] })
    ).not.toContain("improve_website");
  });

  test("improve_website never fires for a business with a website and no weak-website issues", () => {
    expect(
      ids({ ...NOTHING_TO_DO, hasWebsite: true, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: [] })
    ).not.toContain("improve_website");
  });

  test("build_starter_site and improve_website never both fire — mutually exclusive by hasWebsite", () => {
    for (const signals of [
      { ...NOTHING_TO_DO, hasWebsite: false, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: ["x"] },
      { ...NOTHING_TO_DO, hasWebsite: true, hasWebsiteTaskOpen: false, weakWebsiteIssueLabels: ["x"] },
    ]) {
      const found = ids(signals);
      expect(found.includes("build_starter_site") && found.includes("improve_website")).toBe(false);
    }
  });

  test("connect_gbp is no longer a growth move — it moved to the weekly plan (see lib/actionPlan.ts)", () => {
    const allOff: GrowthMoveSignals = {
      businessId: "biz-1",
      hasEverCreatedPromo: false,
      hasEverCreatedReferral: false,
      pricingAssessedAt: null,
      photoCount: 1,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 5 },
      hasWebsite: false,
      hasWebsiteTaskOpen: false,
      weakWebsiteIssueLabels: [],
    };
    expect(ids(allOff)).not.toContain("connect_gbp");
  });

  test("post_to_google no longer appears as a growth move — the weekly checklist replaces it", () => {
    const allOff: GrowthMoveSignals = {
      businessId: "biz-1",
      hasEverCreatedPromo: false,
      hasEverCreatedReferral: false,
      pricingAssessedAt: null,
      photoCount: 1,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 5 },
      hasWebsite: false,
      hasWebsiteTaskOpen: false,
      weakWebsiteIssueLabels: [],
    };
    expect(ids(allOff)).not.toContain("post_to_google");
  });

  test("every move that fires is traceable to its own named real signal", () => {
    const allOff: GrowthMoveSignals = {
      businessId: "biz-1",
      hasEverCreatedPromo: false,
      hasEverCreatedReferral: false,
      pricingAssessedAt: null,
      photoCount: 1,
      competitorPhotos: { scanAvailable: true, medianCompetitorPhotoCount: 5 },
      hasWebsite: false,
      hasWebsiteTaskOpen: false,
      weakWebsiteIssueLabels: [],
    };
    const moves = buildGrowthMoves(allOff, "en");
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.signal.length).toBeGreaterThan(0);
    }
  });
});

describe("competitorPhotoCounts", () => {
  test("excludes the subject entry and entries with no real photo count", () => {
    const counts = competitorPhotoCounts([
      { isSubject: true, photoCount: 99 },
      { isSubject: false, photoCount: 3 },
      { isSubject: false, photoCount: null },
      { isSubject: false, photoCount: 7 },
    ]);
    expect(counts.sort((a, b) => a - b)).toEqual([3, 7]);
  });
});

describe("Day 4 Step 2f", () => {
  test("build_starter_site never fires for a business whose real site was verified elsewhere (the real Bánh Mì Boy bug)", () => {
    const noListingSite = { ...NOTHING_TO_DO, hasWebsite: false, hasWebsiteTaskOpen: false };
    expect(ids(noListingSite)).toContain("build_starter_site");
    expect(ids({ ...noListingSite, hasVerifiedWebsite: true })).not.toContain("build_starter_site");
    // ...and is treated as the website it is: improve_website can fire for it.
    expect(
      ids({ ...noListingSite, hasVerifiedWebsite: true, weakWebsiteIssueLabels: ["Contact & conversion"] })
    ).toContain("improve_website");
  });

  test("withoutWebsiteGrowthMoves drops only improve_website and build_starter_site", () => {
    const all = buildGrowthMoves(
      {
        ...NOTHING_TO_DO,
        hasEverCreatedPromo: false,
        pricingAssessedAt: null,
        weakWebsiteIssueLabels: ["Performance & mobile"],
      },
      "en"
    );
    expect(all.map((m) => m.id)).toContain("improve_website");
    expect(withoutWebsiteGrowthMoves(all).map((m) => m.id)).toEqual(["start_coupon", "run_price_check"]);
  });

  test("the price check shows for every business type that has one (all but place_of_worship), under every condition", () => {
    const options = getBizProfileOptions("en");
    expect(options.length).toBe(44);
    for (const option of options) {
      const profile = bizProfileById(option.id, "en")!;
      for (const hasWebsite of [true, false]) {
        for (const pricingAssessedAt of [null, "2026-09-01T00:00:00Z"]) {
          for (const hasEverCreatedPromo of [true, false]) {
            const moves = withoutWebsiteGrowthMoves(
              buildGrowthMoves(
                {
                  ...NOTHING_TO_DO,
                  referralOk: profile.referralOk,
                  couponsOk: profile.couponsOk,
                  pricingOk: profile.pricingOk,
                  hasWebsite,
                  hasWebsiteTaskOpen: !hasWebsite,
                  pricingAssessedAt,
                  hasEverCreatedPromo,
                  photoCount: null,
                },
                "en"
              )
            );
            if (profile.pricingOk) expect(moves.map((m) => m.id), option.id).toContain("run_price_check");
            else expect(moves.map((m) => m.id), option.id).not.toContain("run_price_check");
            if (!profile.couponsOk) expect(moves.map((m) => m.id), option.id).not.toContain("start_coupon");
          }
        }
      }
    }
  });

  test("buildPriceCheckMove: the never-run card is exactly 'Compare your prices to nearby competitors' (EN + ES)", () => {
    expect(buildPriceCheckMove("biz-1", null, "en").title).toBe("Compare your prices to nearby competitors");
    expect(buildPriceCheckMove("biz-1", null, "es").title).toBe("Compare sus precios con la competencia cercana");
    expect(buildPriceCheckMove("biz-1", null, "en").href).toBe("/business/biz-1/pricing");
  });
});
