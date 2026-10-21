// PostScore plans: Free, Grow, Premium and Multi. No checkout exists yet,
// so every real account is on Free and every Premium-only control stays
// locked until this reads a real subscription.
//
// Plan switching for testing (the dev plan pill → /api/dev/plan, which sets
// a cookie):
// - local development: always on (the cookie, then POSTSCORE_DEV_PLAN);
// - production: ONLY for a signed-in user whose email is listed in
//   PLAN_SWITCHER_EMAILS (comma-separated). It is checked here on the
//   server on every request — the cookie alone does nothing — so nobody
//   else can switch by calling the URL. Empty or missing = fully off.

import { requestCache } from "@/lib/requestCache";
import { cookies } from "next/headers";
import { isPlan, isPremiumPlan, type Addon, type Plan } from "@/lib/plan";

export { PLANS, isPremiumPlan, type Addon, type Plan } from "@/lib/plan";
export const DEV_PLAN_COOKIE = "ps_dev_plan";

type PlanEnv = { NODE_ENV?: string; POSTSCORE_DEV_PLAN?: string; PLAN_SWITCHER_EMAILS?: string };

/** The emails allowed to switch plans in production (lower-cased). */
export function switcherEmails(env: PlanEnv = process.env): string[] {
  return (env.PLAN_SWITCHER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** Pure: may this user switch plans? Development: yes. Production: only a
 * listed email; an empty list (or no signed-in user) means no. */
export function switcherAllowed(env: PlanEnv, email: string | null | undefined): boolean {
  if (env.NODE_ENV === "development") return true;
  const list = switcherEmails(env);
  return !!email && list.length > 0 && list.includes(email.trim().toLowerCase());
}

/** Pure: the plan for this request. Until checkout exists that's Free,
 * except for someone allowed to switch (see above), where the switch
 * cookie (then, in development, the env var) picks one for testing. */
export function resolvePlan(env: PlanEnv = process.env, devCookie: string | null = null, allowed: boolean = env.NODE_ENV === "development"): Plan {
  if (!allowed) return "free";
  if (isPlan(devCookie)) return devCookie;
  if (env.NODE_ENV === "development" && isPlan(env.POSTSCORE_DEV_PLAN)) return env.POSTSCORE_DEV_PLAN;
  return "free";
}

/** The signed-in user's email (once per request). */
const signedInEmail = requestCache(async (): Promise<string | null> => {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const {
      data: { user },
    } = await createClient().auth.getUser();
    return user?.email ?? null;
  } catch {
    return null;
  }
});

/** Server: may the current user switch plans (the pill and /api/dev/plan)? */
export async function canSwitchPlan(env: PlanEnv = process.env): Promise<boolean> {
  if (env.NODE_ENV === "development") return true;
  if (switcherEmails(env).length === 0) return false;
  return switcherAllowed(env, await signedInEmail());
}

/** The current account's plan. Server only. In production a user without
 * the switch cookie is answered at once (Free) — no extra lookups. */
export async function getPlan(env: PlanEnv = process.env): Promise<Plan> {
  let devCookie: string | null = null;
  try {
    devCookie = cookies().get(DEV_PLAN_COOKIE)?.value ?? null;
  } catch {
    // Not inside a request (scripts, tests).
  }
  if (env.NODE_ENV !== "development" && (!devCookie || switcherEmails(env).length === 0)) return "free";
  return resolvePlan(env, devCookie, await canSwitchPlan(env));
}

/** The current account's add-ons. Server only. No checkout exists yet, so
 * no account has one; when it ships this reads the subscription's add-ons
 * (e.g. "PostStudio only" = getPlan() "free" + ["poststudio"]) and
 * hasPostStudio(plan, addons) is already right. */
export async function getAddons(): Promise<Addon[]> {
  return [];
}

export function hasPremium(plan: Plan): boolean {
  return isPremiumPlan(plan);
}

/**
 * The real Google Business Profile connect (OAuth) works only when
 * GBP_CONNECT_PUBLIC=true AND the account has Premium. A local dev
 * server (NODE_ENV=development) with GBP_CONNECT_PUBLIC=true also lets
 * it through, so the flow can still be tested before checkout exists;
 * a production build never does.
 */
export function canConnectGbp(premium: boolean, env: { GBP_CONNECT_PUBLIC?: string; NODE_ENV?: string } = process.env): boolean {
  if (env.GBP_CONNECT_PUBLIC !== "true") return false;
  return premium || env.NODE_ENV === "development";
}
