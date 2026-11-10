"use server";

// "Re-check my website" server actions — see lib/websiteRecheck.server.ts.
// The implementation (site read, PageSpeed, Safe Browsing) is loaded only
// when an action runs, so client components can import these actions
// without pulling the website-analysis code into their module graph.

import { createClient } from "@/lib/supabase/server";
import type { WebsiteRecheckResult, WebsiteRecheckStatus } from "@/lib/websiteRecheck.server";
import { getPlan } from "@/lib/premium";

export type { WebsiteRecheckResult, WebsiteRecheckStatus } from "@/lib/websiteRecheck.server";

export async function getWebsiteRecheckStatus(businessId: string): Promise<WebsiteRecheckStatus> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { getWebsiteRecheckStatusWithClient } = await import("@/lib/websiteRecheck.server");
  return getWebsiteRecheckStatusWithClient(supabase, businessId);
}

export async function recheckWebsite(businessId: string): Promise<WebsiteRecheckResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  // Free is an audit: a Re-check (PageSpeed and site checks) never runs
  // for a Free account — Growth and the Website page show it locked.
  if ((await getPlan()) === "free") return { status: "plan_locked" };
  const { isBusinessArchived } = await import("@/lib/businessArchive.server");
  if (await isBusinessArchived(supabase, businessId)) return { status: "archived" };
  const { recheckWebsiteWithClient } = await import("@/lib/websiteRecheck.server");
  // A thrown error comes back as its real message — a server action's
  // thrown error reaches the browser without one.
  try {
    return await recheckWebsiteWithClient(supabase, businessId);
  } catch (e) {
    console.error(`[websiteRecheck] ${businessId}:`, e);
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
