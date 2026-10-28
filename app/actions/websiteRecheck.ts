"use server";

// "Re-check my website" server actions — see lib/websiteRecheck.server.ts.
// The implementation (site read, PageSpeed, Safe Browsing) is loaded only
// when an action runs, so client components can import these actions
// without pulling the website-analysis code into their module graph.

import { createClient } from "@/lib/supabase/server";
import type { WebsiteRecheckResult, WebsiteRecheckStatus } from "@/lib/websiteRecheck.server";
import { getPlan } from "@/lib/premium";
import { normalizeLocale, t } from "@/lib/i18n";

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
  if ((await getPlan()) === "free") {
    const { data } = await supabase.from("businesses").select("language").eq("id", businessId).maybeSingle();
    return { status: "error", message: t(normalizeLocale(data?.language), "dashboard.free.recheckLocked") };
  }
  const { isBusinessArchived } = await import("@/lib/businessArchive.server");
  if (await isBusinessArchived(supabase, businessId)) {
    const { data } = await supabase.from("businesses").select("language").eq("id", businessId).maybeSingle();
    return { status: "error", message: t(normalizeLocale(data?.language), "dashboard.closed.archived.blocked") };
  }
  const { recheckWebsiteWithClient } = await import("@/lib/websiteRecheck.server");
  return recheckWebsiteWithClient(supabase, businessId);
}
