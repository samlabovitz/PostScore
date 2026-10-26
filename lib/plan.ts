// The plan names and pure plan rules, safe to import from client code.
// Which plan an account has is decided on the server: lib/premium.ts.

export type Plan = "free" | "grow" | "premium" | "multi";
export const PLANS: Plan[] = ["free", "grow", "premium", "multi"];

export function isPlan(value: unknown): value is Plan {
  return typeof value === "string" && (PLANS as string[]).includes(value);
}

/** Premium and Multi include every Premium feature. */
export function isPremiumPlan(plan: Plan): boolean {
  return plan === "premium" || plan === "multi";
}

/** Add-ons bought on top of a plan. PostStudio is the only one: on its own
 * ("PostStudio only" = plan "free" + addon "poststudio", $30/mo) or added to
 * Grow (+$15) or Premium (+$8); Multi includes it. */
export type Addon = "poststudio";
export const ADDONS: Addon[] = ["poststudio"];

export function isAddon(value: unknown): value is Addon {
  return typeof value === "string" && (ADDONS as string[]).includes(value);
}

/** The plan for work that runs outside a request — the monthly report
 * cron and scripts/rescan-all.ts. No checkout exists yet, so no account
 * has a stored paid plan: it's Free (in development, POSTSCORE_DEV_PLAN
 * when set — the same answer lib/premium.ts getPlan gives outside a
 * request). When subscriptions ship, read the owner's subscription here.
 *
 * LAUNCH CHECKLIST — before Stripe ships, this must read the owner's real
 * subscription: until it does, every business counts as Free here, so the
 * monthly report cron emails NO ONE (Free gets no report emails —
 * planIncludesMonthlyReports below), even with MONTHLY_REPORTS_LIVE=true. */
export function backgroundPlan(_ownerId?: string | null, env: { NODE_ENV?: string; POSTSCORE_DEV_PLAN?: string } = process.env): Plan {
  return env.NODE_ENV === "development" && isPlan(env.POSTSCORE_DEV_PLAN) ? env.POSTSCORE_DEV_PLAN : "free";
}

/** Monthly report emails: Grow, Premium and Multi. Free gets none (the
 * scheduled send skips it server-side: lib/reportSendPolicy.ts). Account
 * emails (sign-up, password reset) aren't plan-gated. */
export function planIncludesMonthlyReports(plan: Plan): boolean {
  return plan !== "free";
}

/** Locations (businesses) an account's plan includes — Settings → Compare
 * plans: 1 on Free, Grow and Premium; up to 5 on Multi (+$25/mo each extra
 * — not purchasable yet, so 5 is the limit for now). */
export function locationLimit(plan: Plan): number {
  return plan === "multi" ? 5 : 1;
}
