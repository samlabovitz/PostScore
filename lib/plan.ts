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
