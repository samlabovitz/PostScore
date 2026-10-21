// What each plan includes — the one source for Settings → Plan & billing
// (the plan cards and "Compare plans"), the promo box and the showcase
// strip. Describes the plans PostScore is building toward
// (docs/product-structure.md); actually gating features is step 5f.
// Anything not live yet says so ("Coming soon") — never claimed as
// working. Pure.

import type { MessageKey } from "./i18n";
import type { Plan } from "./plan";

export const COMPARE_PLANS: Plan[] = ["free", "grow", "premium", "multi"];

/** The plan the comparison highlights ("Best value"). */
export const HIGHLIGHT_PLAN: Plan = "premium";

/** ✓, a real-data preview, not included, ✓ but not built yet, or a short
 * value (with a ✓ in front when `check`). */
export type Cell = { kind: "yes" } | { kind: "preview" } | { kind: "no" } | { kind: "soon" } | { kind: "text"; key: MessageKey; check?: boolean };

const yes: Cell = { kind: "yes" };
const preview: Cell = { kind: "preview" };
const no: Cell = { kind: "no" };
const soon: Cell = { kind: "soon" };
const text = (k: string, check = false): Cell => ({ kind: "text", key: `dashboard.settings.plans.value.${k}` as MessageKey, ...(check ? { check } : {}) });

export interface CompareRow {
  key: MessageKey;
  cells: Record<Plan, Cell>;
}

const row = (k: string, free: Cell, grow: Cell, premium: Cell, multi: Cell = premium): CompareRow => ({
  key: `dashboard.settings.plans.row.${k}` as MessageKey,
  cells: { free, grow, premium, multi },
});

export const COMPARE_ROWS: CompareRow[] = [
  row("whatsWrong", yes, yes, yes),
  row("rank", yes, yes, yes),
  row("fixes", preview, yes, yes),
  row("recheck", no, yes, yes),
  row("designs", preview, text("basic"), text("fullNoBranding")),
  // "All campaigns" — every running coupon and referral card with its +1
  // tally — is Grow and up. Email, text and social campaigns are Premium
  // and not built yet.
  row("hub", preview, yes, yes),
  row("channels", no, no, soon),
  row("website", preview, text("starterSite"), text("starterDiscount"), text("starterIncluded")),
  row("postai", no, text("monthlyLimit"), text("unlimited")),
  row("doneForYou", no, no, soon),
  row("reports", text("monthlyEmail"), text("weeklyRecap"), text("weeklyPdf")),
  // PostStudio (coming soon): $30/mo on its own (the free audit +
  // PostStudio), +$15 on Grow, +$8 on Premium, included in Multi.
  row("postStudio", text("alone30"), text("plus15"), text("plus8"), text("included", true)),
  row("locations", text("one"), text("one"), text("one"), text("upTo5")),
];

export interface PlanCopy {
  price: MessageKey;
  tagline: MessageKey;
  /** The one-line promise (Multi has none). */
  promise: MessageKey | null;
  bullets: MessageKey[];
}

const k = (s: string) => `dashboard.settings.plans.${s}` as MessageKey;
const bullets = (plan: Plan, ids: string[]) => ids.map((id) => k(`bullet.${plan}.${id}`));

/** Each plan's card: price, tagline, promise and what it includes. */
export const PLAN_COPY: Record<Plan, PlanCopy> = {
  free: { price: k("price.free"), tagline: k("tagline.free"), promise: k("promise.free"), bullets: bullets("free", ["score", "problems", "rank", "reviewGap"]) },
  grow: { price: k("price.grow"), tagline: k("tagline.grow"), promise: k("promise.grow"), bullets: bullets("grow", ["guides", "plan", "recheck", "tools", "tracking", "postai"]) },
  premium: {
    price: k("price.premium"),
    tagline: k("tagline.premium"),
    promise: k("promise.premium"),
    bullets: bullets("premium", ["fixes", "replies", "insights", "channels", "designs", "postai"]),
  },
  multi: { price: k("price.multi"), tagline: k("tagline.multi"), promise: null, bullets: bullets("multi", ["everything", "studio", "dashboard"]) },
};

/** On a phone the plans stack, the current plan first. */
export function phoneOrder(current: Plan): Plan[] {
  return [current, ...COMPARE_PLANS.filter((p) => p !== current)];
}
