"use server";

// The hours-mismatch chooser's data (components/hours/HoursMismatchChooser.tsx):
// the website's week from the last scan, Google's week read live when the
// listing is connected (getGoogleUpdated: what searchers see), otherwise
// Google's own words from the last scan, the website builder, and whether
// "Update Google" can be done from PostScore. Reads only — nothing is
// written here; Google changes go through the hours editor's own safety flow.

import type { WeeklyHours } from "@/lib/gbpProfileEdits";
import type { WebsiteBuilderId } from "@/lib/websiteBuilder";

export type OpenHoursCompareResult =
  | {
      status: "ok";
      google: WeeklyHours | null;
      /** Google's own words per day, when the live read wasn't possible. */
      googleLines: string[] | null;
      live: boolean;
      site: WeeklyHours | null;
      builder: { id: WebsiteBuilderId; name: string } | null;
      siteUrl: string | null;
      /** Premium + connected + on the live list (or practice): the hours editor can send it. */
      canEdit: boolean;
      /** The Google Profile tab is available (Premium + connected, or practice). */
      tab: boolean;
      managedEmail: string | null;
    }
  | { status: "not_found" };

export async function openHoursCompare(businessId: string): Promise<OpenHoursCompareResult> {
  const { createClient } = await import("@/lib/supabase/server");
  const db = createClient();
  // RLS: only the owner's own business comes back.
  const { data } = await db.from("businesses").select("id, website_analysis_json, opening_hours, website, owner_website_url, verified_website_url").eq("id", businessId).maybeSingle();
  const row = data as { website_analysis_json: unknown; opening_hours: string[] | null; website: string | null; owner_website_url: string | null; verified_website_url: string | null } | null;
  if (!row) return { status: "not_found" };

  const [{ parseWebsiteAnalysis }, edits, { WEBSITE_BUILDER_NAMES }, { managedSiteContact }] = await Promise.all([import("@/lib/scoring"), import("@/lib/gbpProfileEdits"), import("@/lib/websiteBuilder"), import("@/lib/hoursChooser")]);
  const analysis = parseWebsiteAnalysis(row.website_analysis_json);
  const finding = analysis?.websiteTrust?.infoConflicts.find((f) => f.field === "hours");
  let site = edits.weekFromSite(finding?.siteWeek);
  const builderId = (analysis as { builder?: { id?: WebsiteBuilderId | null } } | null)?.builder?.id ?? null;
  const siteUrl = row.owner_website_url ?? row.verified_website_url ?? row.website ?? null;

  // Live: what Google shows now (its own edits included), when the listing is connected.
  let google: WeeklyHours | null = null;
  let canEdit = false;
  let tab = false;
  try {
    const { googleWriteContext } = await import("@/lib/gbpWriteContext.server");
    const c = await googleWriteContext(businessId);
    if (c.ok) {
      tab = true;
      canEdit = c.canEdit;
      if (c.practice) site = edits.weekFromSite((await import("@/lib/gbpProfilePractice.server")).PRACTICE_SITE_WEEK);
      const { call } = await import("@/lib/gbpAttributes.server");
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${c.target.locationName}:getGoogleUpdated`);
      url.searchParams.set("readMask", "regularHours");
      const res = await call<{ location?: { regularHours?: { periods?: import("@/lib/gbpProfileEdits").GooglePeriod[] } } }>(c.fetchImpl, c.target.accessToken, url.toString());
      if (res.ok) google = edits.weekFromGoogle(res.data.location?.regularHours?.periods) ?? edits.closedWeek();
      else if (res.error === "reconnect") await c.markReconnect();
    }
  } catch {
    // Not connected / not Premium: the last scan's words below.
  }

  return {
    status: "ok",
    google,
    googleLines: google ? null : (row.opening_hours ?? null),
    live: google !== null,
    site,
    builder: builderId ? { id: builderId, name: WEBSITE_BUILDER_NAMES[builderId] } : null,
    siteUrl,
    canEdit,
    tab,
    managedEmail: managedSiteContact(siteUrl, { MANAGED_SITE_HOSTS: process.env.MANAGED_SITE_HOSTS, MANAGED_SITE_CONTACT_EMAIL: process.env.MANAGED_SITE_CONTACT_EMAIL }),
  };
}
