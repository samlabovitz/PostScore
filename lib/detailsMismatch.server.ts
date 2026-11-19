// Server-only. Day 23B: the details-mismatch tasks for a page (lib/detailsMismatch.ts),
// from the owner's confirmed details, the visit's live listing and the last scan's website read.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detailsMismatches, type DetailsMismatch } from "@/lib/detailsMismatch";
import { loadOwnerDetails } from "@/lib/ownerDetails.server";
import { parseWebsiteAnalysis } from "@/lib/scoring";
import type { OwnerDetails } from "@/lib/ownerDetails";

export interface DetailsMismatchState {
  mismatches: DetailsMismatch[];
  /** The confirmed details (for "PostScore can do this for you" to fill in the owner's hours). */
  owner: OwnerDetails | null;
}

export async function loadDetailsMismatches(
  db: SupabaseClient,
  businessId: string,
  business: { phone?: string | null; address?: string | null; opening_hours_periods?: unknown; website_analysis_json?: unknown; live_unavailable?: boolean }
): Promise<DetailsMismatchState> {
  const owner = (await loadOwnerDetails(db, businessId).catch(() => null))?.details ?? null;
  if (!owner) return { mismatches: [], owner: null };
  const analysis = parseWebsiteAnalysis(business.website_analysis_json);
  const site = (analysis?.websiteTrust?.infoConflicts ?? []).map((f) => ({ field: f.field, siteValue: f.siteValue, siteWeek: f.siteWeek }));
  const google = business.live_unavailable
    ? null
    : { phone: business.phone ?? null, address: business.address ?? null, openingHoursPeriods: (business.opening_hours_periods as import("@/lib/google/places").OpeningHoursPeriod[] | null) ?? null };
  return { mismatches: detailsMismatches({ owner, google, site }), owner };
}

/** One "now match" question per field PostScore changed (lib/detailsMismatch.ts nowMatchPrompt). */
export type NowMatchPrompts = Partial<Record<"phone" | "hours", { state: "ask" | "waiting"; key: string }>>;

/** The promo_dismissals key that marks one change's question as answered (≤ 40 characters). */
export const nowMatchKey = (field: "phone" | "hours", at: string) => `match-${field}-${at.slice(0, 19)}`;

export async function loadNowMatchPrompts(
  db: SupabaseClient,
  businessId: string,
  opts: { made: Array<{ kind: string; status: string; at: string; practice?: boolean }>; google: { phone?: string | null; address?: string | null; opening_hours_periods?: unknown } | null }
): Promise<NowMatchPrompts> {
  const { nowMatchPrompt } = await import("@/lib/detailsMismatch");
  const owner = (await loadOwnerDetails(db, businessId).catch(() => null))?.details ?? null;
  const latest = (kind: "phone" | "hours") =>
    opts.made
      .filter((c) => c.kind === kind && !c.practice)
      .sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
  const out: NowMatchPrompts = {};
  const keys = (["phone", "hours"] as const).map((f) => ({ f, c: latest(f) })).filter((x) => x.c);
  if (keys.length === 0) return out;
  const { data } = await db.from("promo_dismissals").select("promo_key").eq("business_id", businessId).in("promo_key", keys.map((x) => nowMatchKey(x.f, x.c!.at)));
  const asked = new Set(((data ?? []) as Array<{ promo_key: string }>).map((r) => r.promo_key));
  const google = opts.google ? { phone: opts.google.phone ?? null, address: opts.google.address ?? null, openingHoursPeriods: (opts.google.opening_hours_periods as import("@/lib/google/places").OpeningHoursPeriod[] | null) ?? null } : null;
  for (const { f, c } of keys) {
    const key = nowMatchKey(f, c!.at);
    const state = nowMatchPrompt({ field: f, change: { status: c!.status, at: c!.at, key }, owner, google, asked: asked.has(key) });
    if (state) out[f] = { state, key };
  }
  return out;
}
