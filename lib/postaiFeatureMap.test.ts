import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { featureMapFor, featureMapText } from "./postaiFeatureMap";
import { FREE_OVERVIEW_SECTIONS, freeSectionOf } from "./freeOverviewSections";
import { planFacts, planFactsText } from "./planFacts";
import { COMPARE_ROWS, PLAN_COPY } from "./planComparison";
import { SHOWROOM_NAV, SHOWROOM_TABS, tabLocked } from "./freeTabs";
import { ASSISTANT_SYSTEM_RULES, buildAssistantLanguageDirective } from "./assistant";
import { PLANS, type Plan } from "./plan";
import { t } from "./i18n";

// PostAI's plan-aware map and plan facts — built from the app's own
// configs, so they can't drift from what the owner actually sees.

const ALL = { couponsOk: true, referralOk: true, pricingOk: true, hasWebsite: true };
const byId = (plan: Plan) => Object.fromEntries(featureMapFor(plan, ALL).map((e) => [e.id, e]));

describe("the feature map matches the sidebar and plan config, for every plan", () => {
  test("anything on a tab the sidebar locks is LOCKED (or a PREVIEW where the showroom has a working designer); on an open tab it's usable", () => {
    for (const plan of PLANS) {
      for (const entry of featureMapFor(plan, ALL)) {
        const tab = SHOWROOM_TABS.find((x) => entry.where.includes(`the ${t("en", SHOWROOM_NAV[x])} tab`));
        if (!tab || entry.status === "soon") continue;
        if (tabLocked(plan, tab)) expect(["locked", "preview"], `${plan} ${entry.id}`).toContain(entry.status);
        else expect(entry.status, `${plan} ${entry.id}`).toBe("usable");
      }
    }
  });

  test("every tab the map names is a real sidebar entry", () => {
    const sidebar = readFileSync("components/layout/Sidebar.tsx", "utf8");
    for (const key of ["dashboard.nav.overview", "dashboard.nav.growth", "dashboard.nav.campaigns", "dashboard.nav.reviews", "dashboard.nav.website", "dashboard.nav.competitors", "dashboard.nav.pricing", "dashboard.nav.reports"]) expect(sidebar).toContain(`"${key}"`);
  });

  test("the Free Overview sections config is the page's own (headings and order)", () => {
    const view = readFileSync("app/business/[id]/BusinessScoreView.tsx", "utf8");
    const at = FREE_OVERVIEW_SECTIONS.map((s) => view.indexOf(`<FreeSection id="${s.id}" title={t(locale, freeSection("${s.id}").titleKey)}`));
    expect(at.every((i) => i > 0)).toBe(true);
    // The page's order: score → behind → tools → earn.
    expect(FREE_OVERVIEW_SECTIONS.map((s) => s.id)).toEqual(["score", "behind", "tools", "earn"]);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  test("the business type's tools: no coupons, referrals or price check where they don't apply", () => {
    const ids = featureMapFor("grow", { couponsOk: false, referralOk: false, pricingOk: false, hasWebsite: false }).map((e) => e.id);
    for (const id of ["coupons", "referrals", "priceCheck", "fixGuides", "recheck"]) expect(ids).not.toContain(id);
  });
});

describe("Free: where things really are", () => {
  const free = byId("free");

  test("the review link and QR code are on the Overview, in “Free tools you can use now”, in the Reviews card — not the Reviews tab", () => {
    expect(free.reviewLinkQr.status).toBe("usable");
    expect(free.reviewLinkQr.where).toBe('the Overview tab, in the "Free tools you can use now" section (the "Reviews: your biggest lever" card)');
    expect(free.reviewLinkQr.where).not.toContain("Reviews tab");
    expect(freeSectionOf("reviewQr").id).toBe("tools");
    expect(free.replyDrafts.where).toContain("Free tools you can use now");
    expect(free.postai.where).toContain("Free tools you can use now");
  });

  test("Price check is locked and unlocked by Grow; the review sign, fix steps and tracking too; coupons and referrals are a preview", () => {
    expect(free.priceCheck).toMatchObject({ status: "locked", unlocks: "grow" });
    expect(free.reviewSign).toMatchObject({ status: "locked", unlocks: "grow" });
    expect(free.fixSteps).toMatchObject({ status: "locked", unlocks: "grow" });
    expect(free.campaignTracking).toMatchObject({ status: "locked", unlocks: "grow" });
    expect(free.coupons).toMatchObject({ status: "preview", unlocks: "grow" });
    expect(free.channels.status).toBe("soon");
    const text = featureMapText("free", featureMapFor("free", ALL));
    expect(text).toContain("Price check: LOCKED — on Grow");
    expect(text).not.toMatch(/Price check: LOCKED at/);
  });

  test("Grow and Premium: the review link and Price check are on their tabs", () => {
    for (const plan of ["grow", "premium"] as const) {
      const map = byId(plan);
      expect(map.reviewLinkQr.where).toContain("the Reviews tab");
      expect(map.priceCheck).toMatchObject({ status: "usable", where: "the Price check tab" });
    }
    expect(byId("grow").replyDrafts.note).toBe("10 a week; unlimited on Premium");
    expect(byId("premium").replyDrafts.note).toBe("unlimited");
  });
});

describe("plan facts come from Compare plans, with coming soon flagged", () => {
  test("every plan's price and every Compare plans row, read from the config", () => {
    const facts = planFacts("en");
    for (const p of facts) {
      expect(p.price).toBe(t("en", PLAN_COPY[p.plan].price));
      expect(p.features.map((f) => f.feature)).toEqual(COMPARE_ROWS.map((r) => t("en", r.key)));
    }
    const text = planFactsText();
    for (const price of ["$0", "$25/mo", "$50/mo", "$150/mo", "Up to 5 (+$25 each extra)", "$30/mo on its own", "+$15/mo", "+$8/mo"]) expect(text).toContain(price);
  });

  test("coming soon is never a current benefit: soon cells, coming-soon values and the PostStudio row", () => {
    const premium = planFacts("en").find((p) => p.plan === "premium")!;
    const feature = (name: string) => premium.features.find((f) => f.feature === name)!;
    for (const row of COMPARE_ROWS.filter((r) => r.cells.premium.kind === "soon")) expect(feature(t("en", row.key)).status).toBe("coming soon");
    expect(feature("AI review replies")).toMatchObject({ status: "available", value: "Unlimited", soonValue: "auto-post coming soon" });
    expect(feature(t("en", "dashboard.settings.plans.row.postStudio")).status).toBe("coming soon");
    const premiumLine = planFactsText().split("\n").find((l, i, all) => all[i - 1]?.startsWith("Premium —") && l.includes("AVAILABLE NOW"))!;
    expect(premiumLine).toContain("AI review replies (Unlimited)");
    expect(premiumLine).not.toMatch(/PostStudio|coming soon|Email, text/i);
  });
});

describe("PostAI's rules", () => {
  test("plan-aware guidance and upgrade answers; no “General guidance:” labels", () => {
    expect(ASSISTANT_SYSTEM_RULES).toContain("7f. GUIDE BY THE OWNER'S PLAN.");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never say you don't");
    expect(ASSISTANT_SYSTEM_RULES).toContain("Coming soon: one short line on its own");
    expect(ASSISTANT_SYSTEM_RULES).toContain("never the only options");
    expect(ASSISTANT_SYSTEM_RULES).not.toMatch(/MUST start a new paragraph beginning with the exact marker/);
    expect(buildAssistantLanguageDirective("es")).not.toContain("becomes exactly \"Consejo general:\"");
  });
});
