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
