// Who may download the starter website, and what's accepted. Pure.

import type { Plan } from "./plan";

/** The largest page accepted (photos are already scaled down by the builder). */
export const STARTER_SITE_MAX_BYTES = 12 * 1024 * 1024;

export type StarterSiteDownloadResult = { status: "ok"; html: string } | { status: "plan_required" } | { status: "bad_request" };

/** Free never downloads (it previews); every other plan does. */
export function starterSiteDownload(plan: Plan, html: unknown): StarterSiteDownloadResult {
  if (plan === "free") return { status: "plan_required" };
  if (typeof html !== "string" || !html.trim().toLowerCase().startsWith("<!doctype html") || html.length > STARTER_SITE_MAX_BYTES) return { status: "bad_request" };
  return { status: "ok", html };
}
