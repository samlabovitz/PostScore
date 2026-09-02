// Pure types and logic for the Pricing page's "Price check" tool.
// Persistence lives in app/actions/pricing.ts (server actions) and
// supabase/schema.sql (the `prices` table); the AI call itself lives in
// lib/anthropicClient.ts. This module is prompt-building, response
// parsing, and display logic only — no network, no lib/scoring.ts.

import { priceLevelToSymbol } from "@/lib/priceLevel";
import type { RankedCompetitor } from "@/lib/competitors";

/** Mirrors the `prices` table's columns exactly (see supabase/schema.sql). */
export interface PriceRow {
  id: string;
  business_id: string;
  service: string;
  price: number;
  created_at: string;
}

/**
 * The fixed set of tiers a price can be assessed into — the single
 * source of truth for both the "What the rankings mean" legend and the
 * AI response validation below, so the two can never drift apart. Order
 * matters: this is display order in the legend, from cheapest-relative
 * to most-expensive-relative, with "no_data" always last.
 */
export const PRICE_TIERS = [
  {
    id: "under_market",
    label: "Under market",
    description: "Below the local range — there may be room to raise this price.",
  },
  {
    id: "competitive",
    label: "Competitive",
    description: "Within the typical local range for this service.",
  },
  {
    id: "upper_mid",
    label: "Upper-mid",
    description: "Toward the top of the local range.",
  },
  {
    id: "premium",
    label: "Premium",
    description: "Above the local range — fine if your reviews back it up.",
  },
  {
    id: "no_data",
    label: "No market data",
    description: "We couldn't find reliable local prices, so we won't guess.",
  },
] as const;

export type PriceTierId = (typeof PRICE_TIERS)[number]["id"];

const PRICE_TIER_IDS = new Set<string>(PRICE_TIERS.map((t) => t.id));

export function isPriceTierId(value: unknown): value is PriceTierId {
  return typeof value === "string" && PRICE_TIER_IDS.has(value);
}

export function priceTierLabel(id: PriceTierId): string {
  return PRICE_TIERS.find((t) => t.id === id)?.label ?? id;
}

/** One AI-assessed result for a single entered service. */
export interface PriceAssessment {
  service: string;
  price: number;
  tier: PriceTierId;
  guidance: string;
}

/** Real, honest context: the business's own Google price level next to
 * nearby competitors' — never a fabricated number, just Google's own
 * $/$$/$$$ signal where it exists. */
export interface PriceLevelComparison {
  subjectSymbol: string | null;
  competitors: Array<{
    name: string;
    symbol: string | null;
    distanceMeters: number | null;
  }>;
}

export function buildPriceLevelComparison(
  ranked: RankedCompetitor[]
): PriceLevelComparison {
  const subject = ranked.find((r) => r.isSubject) ?? null;
  const competitors = ranked
    .filter((r) => !r.isSubject)
    .map((r) => ({
      name: r.name,
      symbol: priceLevelToSymbol(r.priceLevel),
      distanceMeters: r.distanceMeters,
    }));
  return {
    subjectSymbol: subject ? priceLevelToSymbol(subject.priceLevel) : null,
    competitors,
  };
}

/** The exact shape persisted to `businesses.pricing_assessment` (see
 * supabase/schema.sql) and returned by assessPricing — the AI's per-
 * service tiers/guidance plus the real Google price-level context they
 * were assessed against, so a returning owner sees the same honest
 * picture that was actually used, not just the bare tiers. */
export interface PricingAssessmentPayload {
  assessments: PriceAssessment[];
  priceLevelContext: PriceLevelComparison | null;
}

/**
 * Narrows a value read back from the `pricing_assessment` jsonb column
 * into a real PricingAssessmentPayload, the same way parseHttpsStatus
 * narrows a stored https_status string — never trusts stored JSON
 * blindly. Returns null (never a guessed/partial result) if the shape
 * doesn't hold up, e.g. after a manual DB edit or a future format
 * change; a corrupted individual tier degrades to "no_data" rather than
 * discarding the whole entry, mirroring parsePricingAssessmentResponse.
 */
export function parsePricingAssessmentPayload(raw: unknown): PricingAssessmentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.assessments)) return null;

  const assessments: PriceAssessment[] = [];
  for (const entry of obj.assessments) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.service !== "string" || typeof e.price !== "number") continue;
    assessments.push({
      service: e.service,
      price: e.price,
      tier: isPriceTierId(e.tier) ? e.tier : "no_data",
      guidance: typeof e.guidance === "string" ? e.guidance : "",
    });
  }
  if (assessments.length === 0) return null;

  let priceLevelContext: PriceLevelComparison | null = null;
  if (obj.priceLevelContext && typeof obj.priceLevelContext === "object") {
    const ctx = obj.priceLevelContext as Record<string, unknown>;
    const competitors = Array.isArray(ctx.competitors)
      ? ctx.competitors
          .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
          .map((c) => ({
            name: typeof c.name === "string" ? c.name : "Nearby business",
            symbol: typeof c.symbol === "string" ? c.symbol : null,
            distanceMeters: typeof c.distanceMeters === "number" ? c.distanceMeters : null,
          }))
      : [];
    priceLevelContext = {
      subjectSymbol: typeof ctx.subjectSymbol === "string" ? ctx.subjectSymbol : null,
      competitors,
    };
  }

  return { assessments, priceLevelContext };
}

export interface PricingPromptInput {
  /** Drives type-appropriate framing (see the system prompt in
   * app/actions/pricing.ts) — e.g. "Salon & Personal Care" or
   * "Restaurant & Food Service" (see config/bizProfiles.ts). */
  businessTypeLabel: string;
  services: Array<{ service: string; price: number }>;
  priceLevelContext: PriceLevelComparison | null;
}

/** Real Google price levels ($/$$/$$$) collapsed to counts (e.g. "$$
 * x2") rather than naming each competitor — the model only needs the
 * real distribution, not their identities, and this keeps the prompt
 * short. */
function summarizeCompetitorPriceLevels(context: PriceLevelComparison): string {
  const counts = new Map<string, number>();
  for (const c of context.competitors) {
    const key = c.symbol ?? "no data";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([symbol, count]) => `${symbol} x${count}`)
    .join(", ");
}

/**
 * Builds the user-message content sent to Claude for a pricing
 * assessment. Deliberately minimal — only the business type, the real
 * services/prices the owner entered, and real Google price-level
 * context — to keep the (cheap, Haiku) call's input tokens low. Kept as
 * a pure string builder (no network) so it's testable and so the
 * honesty constraints are visible and reviewable in one place rather
 * than buried in a server action.
 */
export function buildPricingPrompt(input: PricingPromptInput): string {
  const lines: string[] = [];
  lines.push(`Business type: ${input.businessTypeLabel}`);
  if (input.priceLevelContext && input.priceLevelContext.competitors.length > 0) {
    lines.push(`Your Google price level: ${input.priceLevelContext.subjectSymbol ?? "not on file"}`);
    lines.push(`Nearby competitors' Google price levels: ${summarizeCompetitorPriceLevels(input.priceLevelContext)}`);
  } else {
    lines.push("No nearby competitor price-level data available — use general knowledge of typical rates for this business type instead.");
  }
  lines.push("Services and prices this owner actually charges:");
  for (const s of input.services) {
    lines.push(`- ${s.service}: $${s.price.toFixed(2)}`);
  }
  return lines.join("\n");
}

/** Raw shape we ask Claude to reply with — validated field by field
 * before anything reaches an owner, since a malformed or missing tier
 * must degrade to "no_data" rather than ever showing a wrong ranking. */
interface RawAssessment {
  service?: unknown;
  tier?: unknown;
  guidance?: unknown;
}

/**
 * Parses and validates Claude's JSON reply against the real services we
 * asked about. Never trusts the model's output blindly: a missing,
 * unparseable, or out-of-range response for a given service falls back
 * to an honest "no_data" tier with an explanatory note, rather than
 * showing a guessed or stale ranking.
 */
export function parsePricingAssessmentResponse(
  raw: string,
  services: Array<{ service: string; price: number }>
): PriceAssessment[] {
  const fallback = (service: string, price: number, note: string): PriceAssessment => ({
    service,
    price,
    tier: "no_data",
    guidance: note,
  });

  const fallbackNote = "We couldn't get a reliable assessment for this service — try again.";

  let parsed: unknown;
  try {
    // Claude sometimes wraps JSON in a ```json fence despite instructions
    // not to — strip that defensively before parsing.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    return services.map((s) => fallback(s.service, s.price, fallbackNote));
  }

  const assessments =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { assessments?: unknown }).assessments)
      ? ((parsed as { assessments: RawAssessment[] }).assessments)
      : null;

  if (!assessments) {
    return services.map((s) => fallback(s.service, s.price, fallbackNote));
  }

  return services.map((s, i) => {
    const entry = assessments[i];
    if (!entry) return fallback(s.service, s.price, fallbackNote);
    const tier = isPriceTierId(entry.tier) ? entry.tier : "no_data";
    const guidance =
      typeof entry.guidance === "string" && entry.guidance.trim().length > 0
        ? entry.guidance.trim()
        : fallbackNote;
    return { service: s.service, price: s.price, tier, guidance };
  });
}
