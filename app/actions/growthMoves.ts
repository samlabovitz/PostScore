"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildGrowthMoves,
  competitorPhotoCounts,
  median,
  type GrowthMove,
  type GrowthMoveSignals,
} from "@/lib/growthMoves";
import { getLatestCompetitorSnapshot } from "@/app/actions/competitors";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import type { ScoreBreakdown } from "@/lib/scoring";

/** Real, localized labels of any determinable-but-below-full website
 * quality checks — see GrowthMoveSignals.weakWebsiteIssueLabels. */
function weakWebsiteIssueLabels(breakdown: ScoreBreakdown): string[] {
  return breakdown.checks
    .filter(
      (c) =>
        (c.id === "website.performance_mobile" || c.id === "website.contact_conversion") &&
        c.earnedPoints !== null &&
        c.earnedPoints < c.maxPoints
    )
    .map((c) => c.label);
}

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
 */
export async function getGrowthMoveSignals(
  businessId: string,
  breakdown: ScoreBreakdown
): Promise<GetGrowthMoveSignalsResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const [businessResult, promoResult, referralResult, snapshot] = await Promise.all([
    supabase.from("businesses").select("photo_count, pricing_assessed_at, website").eq("id", businessId).single(),
    supabase.from("promos").select("id").eq("business_id", businessId).limit(1),
    supabase.from("referrals").select("id").eq("business_id", businessId).limit(1),
    getLatestCompetitorSnapshot(businessId),
  ]);

  if (businessResult.error || !businessResult.data) {
    return { status: "not_found" };
  }

  const photoCounts = snapshot ? competitorPhotoCounts(snapshot.entries) : [];
  const medianCompetitorPhotoCount = median(photoCounts);
  const hasWebsiteCheck = breakdown.checks.find((c) => c.id === "website.has_website");

  const signals: GrowthMoveSignals = {
    businessId,
    hasEverCreatedPromo: (promoResult.data?.length ?? 0) > 0,
    hasEverCreatedReferral: (referralResult.data?.length ?? 0) > 0,
    pricingAssessedAt: businessResult.data.pricing_assessed_at ?? null,
    photoCount: businessResult.data.photo_count ?? null,
    competitorPhotos: {
      scanAvailable: snapshot !== null,
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

/** Loads the real signals, then builds the real moves — the one call
 * site (the Growth page) actually needs. Takes the business's own
 * already-computed breakdown rather than re-scoring, since every
 * caller has already scored the business once. */
export async function getGrowthMoves(
  businessId: string,
  breakdown: ScoreBreakdown,
  locale: Locale = DEFAULT_LOCALE
): Promise<GetGrowthMovesResult> {
  const result = await getGrowthMoveSignals(businessId, breakdown);
  if (result.status !== "ok") return result;
  return { status: "ok", moves: buildGrowthMoves(result.signals, locale) };
}
