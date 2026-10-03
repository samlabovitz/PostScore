"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildGrowthMoves,
  competitorPhotoCounts,
  median,
  weakWebsiteIssueLabels,
  type GrowthMove,
  type GrowthMoveSignals,
} from "@/lib/growthMoves";
import { getLatestCompetitorSnapshot, type CompetitorSnapshot } from "@/app/actions/competitors";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { ScoreBreakdown } from "@/lib/scoring";

export type GetGrowthMoveSignalsResult =
  | { status: "ok"; signals: GrowthMoveSignals }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/**
 * The real, current-as-of-right-now facts buildGrowthMoves() decides
 * from — one RLS-scoped read per real signal, never inferred or
 * cached stale. Each read only ever asks "does at least one row exist"
 * or "what's the latest real value," so this stays cheap even though
 * it touches several different tables.
 *
 * `referralOk` must be the caller's own already-resolved
 * BizProfile.referralOk (config/bizProfiles.ts) — never re-derived
 * here, since every real caller has already computed it from the
 * business's category/type for its own purposes (e.g. deciding
 * whether to show the Growth page's "Refer a friend" tab).
 *
 * `snapshot` is optional: omit it to fetch the latest competitor scan
 * here (the Growth page's own usage), or pass one a caller has already
 * fetched for its own purposes (e.g. the PostAI assistant, which also
 * needs the full snapshot for its "Competitors" context section) to
 * avoid a second identical query. `undefined` means "fetch it here";
 * `null` is a real, valid value meaning "no scan has ever been saved."
 */
export async function getGrowthMoveSignals(
  businessId: string,
  breakdown: ScoreBreakdown,
  referralOk: boolean,
  snapshot?: CompetitorSnapshot | null
): Promise<GetGrowthMoveSignalsResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const [businessResult, promoResult, referralResult, resolvedSnapshot] = await Promise.all([
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website").eq("id", businessId).single(),
    supabase.from("promos").select("id").eq("business_id", businessId).limit(1),
    supabase.from("referrals").select("id").eq("business_id", businessId).limit(1),
    snapshot !== undefined ? Promise.resolve(snapshot) : getLatestCompetitorSnapshot(businessId),
  ]);

  if (businessResult.error || !businessResult.data) {
    return { status: "not_found" };
  }

  const photoCounts = resolvedSnapshot ? competitorPhotoCounts(resolvedSnapshot.entries) : [];
  const medianCompetitorPhotoCount = median(photoCounts);
  const hasWebsiteCheck = breakdown.checks.find((c) => c.id === "website.has_website");

  const signals: GrowthMoveSignals = {
    businessId,
    referralOk,
    hasEverCreatedPromo: (promoResult.data?.length ?? 0) > 0,
    hasEverCreatedReferral: (referralResult.data?.length ?? 0) > 0,
    pricingAssessedAt: businessResult.data.pricing_assessed_at ?? null,
    photoCount: businessResult.data.photo_count ?? null,
    competitorPhotos: {
      scanAvailable: resolvedSnapshot !== null,
      medianCompetitorPhotoCount,
    },
    hasWebsite: businessResult.data.website !== null,
    hasWebsiteTaskOpen: hasWebsiteCheck ? (hasWebsiteCheck.earnedPoints ?? 0) < hasWebsiteCheck.maxPoints : false,
    weakWebsiteIssueLabels: weakWebsiteIssueLabels(breakdown),
  };

  return { status: "ok", signals };
}

export type GetGrowthMovesResult =
  | { status: "ok"; moves: GrowthMove[] }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error"; message: string };

/** Loads the real signals, then builds the real moves — the two call
 * sites (the Growth page, and PostAI's own context — see
 * app/actions/assistant.ts) both just need this. Takes the business's
 * own already-computed breakdown rather than re-scoring, since every
 * caller has already scored the business once. See
 * getGrowthMoveSignals's own doc for `referralOk` and `snapshot`. */
export async function getGrowthMoves(
  businessId: string,
  breakdown: ScoreBreakdown,
  referralOk: boolean,
  locale: Locale = DEFAULT_LOCALE,
  snapshot?: CompetitorSnapshot | null
): Promise<GetGrowthMovesResult> {
  const result = await getGrowthMoveSignals(businessId, breakdown, referralOk, snapshot);
  if (result.status !== "ok") return result;
  return { status: "ok", moves: buildGrowthMoves(result.signals, locale) };
}
