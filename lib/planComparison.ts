// What each plan includes — the one source for Settings → Plan & billing
// ("Compare plans" and the current-plan summary). Describes the plans
// PostScore is building toward (Day 5 decisions, docs/product-structure.md);
// actually gating features is step 5f. Anything not live yet says so
// ("Coming soon") — never claimed as working. Pure.

import type { MessageKey } from "./i18n";
import type { Plan } from "./plan";

export const COMPARE_PLANS: Plan[] = ["free", "grow", "premium", "multi"];

/** ✓, a real-data preview, not included, or a short value ("basic", "+$15/mo"). */
export type Cell = { kind: "yes" } | { kind: "preview" } | { kind: "no" } | { kind: "text"; key: MessageKey };

const yes: Cell = { kind: "yes" };
const preview: Cell = { kind: "preview" };
const no: Cell = { kind: "no" };
const text = (k: string): Cell => ({ kind: "text", key: `dashboard.settings.plans.value.${k}` as MessageKey });

export interface CompareRow {
  key: MessageKey;
  cells: Record<Plan, Cell>;
}

const row = (k: string, free: Cell, grow: Cell, premium: Cell, multi: Cell = premium): CompareRow => ({
  key: `dashboard.settings.plans.row.${k}` as MessageKey,
  cells: { free, grow, premium, multi },
});

export const COMPARE_ROWS: CompareRow[] = [
  row("score", yes, yes, yes),
  row("whatsWrong", yes, yes, yes),
  row("rank", yes, yes, yes),
  row("reviews", yes, yes, yes),
  row("fixGuides", preview, yes, yes),
  row("weeklyPlan", preview, yes, yes),
  row("recheck", preview, yes, yes),
  row("starterSite", preview, yes, yes),
  row("printDesigns", preview, text("basicDesigns"), text("everyDesign")),
  row("noBranding", no, no, yes),
  row("postai", preview, yes, yes),
  row("weeklyReports", preview, yes, yes),
  row("gbp", no, no, text("comingSoon")),
  row("postStudio", text("needsGrow"), text("plus15"), text("plus8"), text("included")),
  row("locations", text("one"), text("one"), text("one"), text("upTo5")),
];

/** Each plan's name line: price and the one-line promise. */
export const PLAN_HEADER: Record<Plan, { price: MessageKey; tagline: MessageKey }> = {
  free: { price: "dashboard.settings.plans.price.free", tagline: "dashboard.settings.plans.tagline.free" },
  grow: { price: "dashboard.settings.plans.price.grow", tagline: "dashboard.settings.plans.tagline.grow" },
  premium: { price: "dashboard.settings.plans.price.premium", tagline: "dashboard.settings.plans.tagline.premium" },
  multi: { price: "dashboard.settings.plans.price.multi", tagline: "dashboard.settings.plans.tagline.multi" },
};

/** The current plan's short summary (benefit-first). */
export const PLAN_SUMMARY: Record<Plan, MessageKey[]> = {
  free: ["dashboard.settings.plans.summary.freeScore", "dashboard.settings.plans.summary.freeWrong", "dashboard.settings.plans.summary.freeRank", "dashboard.settings.plans.summary.freeReviews", "dashboard.settings.plans.summary.freePreviews"],
  grow: ["dashboard.settings.plans.summary.growGuides", "dashboard.settings.plans.summary.growPlan", "dashboard.settings.plans.summary.growTools", "dashboard.settings.plans.summary.growPostai"],
  premium: ["dashboard.settings.plans.summary.premiumGrow", "dashboard.settings.plans.summary.premiumDesign", "dashboard.settings.plans.summary.premiumGbp", "dashboard.settings.plans.summary.premiumStudio"],
  multi: ["dashboard.settings.plans.summary.multiPremium", "dashboard.settings.plans.summary.multiStudio"],
};
