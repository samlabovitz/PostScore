"use server";

// "Re-check my website" server actions — see lib/websiteRecheck.server.ts.
// The implementation (site read, PageSpeed, Safe Browsing) is loaded only
// when an action runs, so client components can import these actions
// without pulling the website-analysis code into their module graph.

import { createClient } from "@/lib/supabase/server";
import type { WebsiteRecheckResult, WebsiteRecheckStatus } from "@/lib/websiteRecheck.server";

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
  const { recheckWebsiteWithClient } = await import("@/lib/websiteRecheck.server");
  return recheckWebsiteWithClient(supabase, businessId);
}
