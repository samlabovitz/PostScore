// PostScore plans: Free, Grow, Premium and Multi. No checkout exists yet,
// so every real account is on Free and every Premium-only control stays
// locked until this reads a real subscription.
//
// Local development only: the plan can be switched for testing with the
// POSTSCORE_DEV_PLAN env var or the dev-only cookie set by
// /api/dev/plan?plan=grow (see app/api/dev/plan/route.ts). A production
// build ignores both and always answers "free".

import { cookies } from "next/headers";
import { isPlan, isPremiumPlan, type Plan } from "@/lib/plan";

export { PLANS, isPremiumPlan, type Plan } from "@/lib/plan";
export const DEV_PLAN_COOKIE = "ps_dev_plan";

/** Pure: the plan for this request. Until checkout exists that's Free,
 * except in local development, where the dev cookie (then the env var)
 * can pick one for testing. */
export function resolvePlan(
  env: { NODE_ENV?: string; POSTSCORE_DEV_PLAN?: string } = process.env,
  devCookie: string | null = null
): Plan {
  if (env.NODE_ENV !== "development") return "free";
  if (isPlan(devCookie)) return devCookie;
  if (isPlan(env.POSTSCORE_DEV_PLAN)) return env.POSTSCORE_DEV_PLAN;
  return "free";
}

/** The current account's plan. Server only (reads the request's cookies
 * when there is a request; outside one, the env decides). */
export function getPlan(env: { NODE_ENV?: string; POSTSCORE_DEV_PLAN?: string } = process.env): Plan {
  let devCookie: string | null = null;
  if (env.NODE_ENV === "development") {
    try {
      devCookie = cookies().get(DEV_PLAN_COOKIE)?.value ?? null;
    } catch {
      // Not inside a request (scripts, tests).
    }
  }
  return resolvePlan(env, devCookie);
}

export function hasPremium(plan: Plan = getPlan()): boolean {
  return isPremiumPlan(plan);
}

/**
 * The real Google Business Profile connect (OAuth) works only when
 * GBP_CONNECT_PUBLIC=true AND the account has Premium. A local dev
 * server (NODE_ENV=development) with GBP_CONNECT_PUBLIC=true also lets
 * it through, so the flow can still be tested before checkout exists;
 * a production build never does.
 */
export function canConnectGbp(
  premium: boolean = hasPremium(),
  env: { GBP_CONNECT_PUBLIC?: string; NODE_ENV?: string } = process.env
): boolean {
  if (env.GBP_CONNECT_PUBLIC !== "true") return false;
  return premium || env.NODE_ENV === "development";
}
