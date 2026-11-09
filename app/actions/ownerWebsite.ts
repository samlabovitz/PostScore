"use server";

// "Wrong site?" — the owner tells PostScore which website is theirs. Never
// trusts the browser: the server reads the business through the owner's
// own session (RLS), checks the address itself (it loads, isn't a parked
// page, and whether it mentions the business), and writes only
// owner_website_url and its history (supabase/owner-website.sql) with the
// service role. verified_website_url and every score input stay
// server-only. After a change: the website check runs again (up to
// SITE_CHANGE_RECHECKS_PER_DAY a day beyond the usual limit) and one fresh
// screenshot is taken even inside the 30-day window, within the month's
// ScreenshotOne cap. Nothing here writes to Google.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { gradedWebsite, listingLinkBroken, type WebsiteSource } from "@/lib/businessWebsite";
import { websiteLinkInput, sameWebsiteLink } from "@/lib/gbpWebsiteLink";
import { pageMentionsBusiness, type BusinessMention } from "@/lib/ownerWebsite";

export interface WebsiteChoice {
  /** The site PostScore grades and shows now, and where it came from. */
  current: { url: string; source: WebsiteSource } | null;
  /** The Google listing's own link (null = none), and whether it's parked or broken. */
  listing: string | null;
  listingBroken: boolean;
  /** The site PostScore verified, when there is one. */
  verified: string | null;
  /** What "Undo" would put back: a URL, "default" (no owner choice), or null (nothing to undo). */
  undoTo: string | "default" | null;
  /** supabase/owner-website.sql has been run. */
  enabled: boolean;
}

export type WebsiteChoiceResult = { status: "ok"; choice: WebsiteChoice } | { status: "unauthenticated" | "not_found" };

export type CheckSiteResult =
  /** Loads and isn't parked; `mentions`: what of the business the page shows. */
  | { status: "ok"; url: string; mentions: BusinessMention[] }
  | { status: "invalid" | "down" | "parked" | "unauthenticated" | "not_found" };

export type SaveSiteResult =
  | ({ status: "saved"; url: string; mentions: BusinessMention[] } & AfterChange)
  /** Loads, but nothing on it says it's this business — save only with `anyway`. */
  | { status: "unconfirmed"; url: string }
  | { status: "invalid" | "down" | "parked" | "not_enabled" | "unauthenticated" | "not_found" | "error" };

/** After a site change: the website check, and the one fresh screenshot —
 * "limit" when the business's own monthly allowance is used (the next one
 * from `screenshotNextAt`), "capped" when the account-wide cap is. */
export interface AfterChange {
  recheck: "done" | "later";
  screenshot: "taken" | "later" | "capped" | "limit";
  screenshotNextAt?: string;
}

export type UndoSiteResult = ({ status: "saved" } & AfterChange) | { status: "nothing" | "not_enabled" | "unauthenticated" | "not_found" | "error" };

type OwnedBusiness = { id: string; name: string | null; phone: string | null; address: string | null; website: string | null; verified_website_url: string | null; website_analysis_json: unknown };

async function owned(businessId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, business: null, status: "unauthenticated" as const };
  const { data } = await supabase
    .from("businesses")
    .select("id, name, phone, address, website, verified_website_url, website_analysis_json")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();
  return { supabase, business: (data as OwnedBusiness | null) ?? null, status: data ? ("ok" as const) : ("not_found" as const) };
}

/** The popover's choices. Reads only. */
export async function getWebsiteChoice(businessId: string): Promise<WebsiteChoiceResult> {
  const { supabase, business, status } = await owned(businessId);
  if (!business) return { status: status === "unauthenticated" ? "unauthenticated" : "not_found" };
  const { readOwnerWebsite } = await import("@/lib/ownerWebsite.server");
  const owner = await readOwnerWebsite(supabase, businessId);
  const enabled = owner !== null;
  const row = { ...business, owner_website_url: owner?.url ?? null };
  return {
    status: "ok",
    choice: {
      current: gradedWebsite(row),
      listing: business.website?.trim() || null,
      listingBroken: listingLinkBroken(row),
      verified: business.verified_website_url?.trim() || null,
      undoTo: owner?.url ? (owner.previousUrl ?? "default") : owner?.previousUrl ? owner.previousUrl : null,
      enabled,
    },
  };
}

/** The server's own check of an address: loads, isn't parked, and what of the business it shows. */
async function checkSite(business: OwnedBusiness, raw: unknown): Promise<CheckSiteResult> {
  const url = websiteLinkInput(raw);
  if (!url) return { status: "invalid" };
  const [{ fetchWebsiteHtml }, { detectParkedDomain }] = await Promise.all([import("@/lib/websiteAnalysis"), import("@/lib/websiteContentAnalysis")]);
  const fetched = await fetchWebsiteHtml(url);
  if (!fetched.html) return { status: "down" };
  if (detectParkedDomain(fetched.html)) return { status: "parked" };
  return { status: "ok", url, mentions: pageMentionsBusiness(fetched.html, business) };
}

/** "Check": the result the popover shows before saving. No Google call. */
export async function checkOwnerWebsite(businessId: string, url: string): Promise<CheckSiteResult> {
  const { business, status } = await owned(businessId);
  if (!business) return { status: status === "unauthenticated" ? "unauthenticated" : "not_found" };
  return checkSite(business, url);
}

/** Re-runs the website check and takes the one fresh screenshot. */
async function afterChange(supabase: ReturnType<typeof createClient>, businessId: string): Promise<AfterChange> {
  const [{ recheckWebsiteWithClient }, { captureScreenshotsWithClient }] = await Promise.all([import("@/lib/websiteRecheck.server"), import("@/lib/websiteScreenshotRefresh.server")]);
  let recheck: "done" | "later" = "later";
  try {
    const r = await recheckWebsiteWithClient(supabase, businessId, { siteChange: true });
    recheck = r.status === "ok" ? "done" : "later";
  } catch (err) {
    console.error(`[owner-website] re-check failed for ${businessId}:`, err instanceof Error ? err.message : err);
  }
  let screenshot: AfterChange["screenshot"] = "later";
  let screenshotNextAt: string | undefined;
  try {
    const s = await captureScreenshotsWithClient(supabase, businessId, "site_change");
    screenshot = s.status === "ok" ? "taken" : s.status === "capped" ? "capped" : s.status === "business_limit" ? "limit" : "later";
    if (s.status === "business_limit") screenshotNextAt = s.nextAvailableAt;
  } catch (err) {
    console.error(`[owner-website] screenshot failed for ${businessId}:`, err instanceof Error ? err.message : err);
  }
  revalidatePath(`/business/${businessId}`, "layout");
  return { recheck, screenshot, ...(screenshotNextAt ? { screenshotNextAt } : {}) };
}

async function writeOwnerWebsite(businessId: string, url: string | null, previous: { url: string | null; at: string | null }): Promise<"ok" | "not_enabled" | "error"> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from("businesses")
    .update({ owner_website_url: url, owner_website_confirmed_at: url ? now : null, owner_website_previous_url: previous.url, owner_website_previous_at: previous.at ?? (previous.url ? now : null) })
    .eq("id", businessId);
  if (!error) return "ok";
  return error.code === "PGRST204" || error.code === "42703" ? "not_enabled" : "error";
}

/** "Use this site": checked again here (never the browser's result). */
export async function saveOwnerWebsite(businessId: string, url: string, anyway = false): Promise<SaveSiteResult> {
  const { supabase, business, status } = await owned(businessId);
  if (!business) return { status: status === "unauthenticated" ? "unauthenticated" : "not_found" };
  const { readOwnerWebsite } = await import("@/lib/ownerWebsite.server");
  const owner = await readOwnerWebsite(supabase, businessId);
  if (!owner) return { status: "not_enabled" };
  const checked = await checkSite(business, url);
  if (checked.status !== "ok") return checked;
  if (checked.mentions.length === 0 && !anyway) return { status: "unconfirmed", url: checked.url };
  if (owner.url && sameWebsiteLink(owner.url, checked.url)) return { status: "saved", url: checked.url, mentions: checked.mentions, recheck: "later", screenshot: "later" };
  // Undo puts back the owner's previous choice (null = PostScore's own order).
  const written = await writeOwnerWebsite(businessId, checked.url, { url: owner.url, at: owner.confirmedAt });
  if (written !== "ok") return { status: written };
  return { status: "saved", url: checked.url, mentions: checked.mentions, ...(await afterChange(supabase, businessId)) };
}

/** "Undo": back to the previous site (or to PostScore's own choice). */
export async function undoOwnerWebsite(businessId: string): Promise<UndoSiteResult> {
  const { supabase, business, status } = await owned(businessId);
  if (!business) return { status: status === "unauthenticated" ? "unauthenticated" : "not_found" };
  const { readOwnerWebsite } = await import("@/lib/ownerWebsite.server");
  const owner = await readOwnerWebsite(supabase, businessId);
  if (!owner) return { status: "not_enabled" };
  if (!owner.url && !owner.previousUrl) return { status: "nothing" };
  // Swap: what's set now becomes the one "Undo" would bring back.
  const written = await writeOwnerWebsite(businessId, owner.previousUrl, { url: owner.url, at: owner.confirmedAt });
  if (written !== "ok") return { status: written };
  return { status: "saved", ...(await afterChange(supabase, businessId)) };
}
