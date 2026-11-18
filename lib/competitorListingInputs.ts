// Day 23 2d-4b: the scan's listings as they arrive in the competitor-scoring
// step's request body (in memory only). Anything not shaped like one is
// dropped, so that competitor is read live instead. Pure.
import type { CompetitorListingInput } from "@/lib/competitorFullScoring";
import type { CompetitorListingInputs } from "@/lib/competitorScoringJob";

const numOrNull = (v: unknown): v is number | null => v === null || (typeof v === "number" && Number.isFinite(v));
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const strListOrNull = (v: unknown): v is string[] | null => v === null || (Array.isArray(v) && v.every((x) => typeof x === "string"));

function isListingInput(v: unknown): v is CompetitorListingInput {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  const hours = r.opening_hours;
  return (
    strOrNull(r.address) &&
    numOrNull(r.rating) &&
    numOrNull(r.review_count) &&
    numOrNull(r.photo_count) &&
    (r.has_website === null || typeof r.has_website === "boolean") &&
    strOrNull(r.website_url) &&
    strOrNull(r.phone ?? null) &&
    strListOrNull(r.categories ?? null) &&
    strOrNull(r.business_status ?? null) &&
    (hours === null || hours === undefined || (typeof hours === "object" && strListOrNull((hours as Record<string, unknown>).weekday ?? null) && ((hours as Record<string, unknown>).periods == null || Array.isArray((hours as Record<string, unknown>).periods))))
  );
}

export function listingInputsFromBody(value: unknown): CompetitorListingInputs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: CompetitorListingInputs = {};
  for (const [placeId, input] of Object.entries(value as Record<string, unknown>)) {
    if (placeId.length > 0 && placeId.length <= 300 && isListingInput(input)) out[placeId] = input;
  }
  return out;
}
