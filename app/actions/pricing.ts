"use server";

import { createClient } from "@/lib/supabase/server";
import { bizProfile } from "@/config/bizProfiles";
import {
  findAndScoreCompetitors,
  type CompetitorSourceBusiness,
} from "@/lib/competitors";
import {
  buildPriceLevelComparison,
  buildPricingPrompt,
  parsePricingAssessmentPayload,
  parsePricingAssessmentResponse,
  type PriceAssessment,
  type PriceLevelComparison,
  type PriceRow,
  type PricingAssessmentPayload,
} from "@/lib/pricing";
import { callAnthropicMessage } from "@/lib/anthropicClient";

const PRICE_COLUMNS = "id, business_id, service, price, created_at";

export type GetPricesResult =
  | { status: "ok"; prices: PriceRow[] }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** RLS-scoped list of the owner's entered services & prices, oldest first. */
export async function getPrices(businessId: string): Promise<GetPricesResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("prices")
    .select(PRICE_COLUMNS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", prices: (data as PriceRow[]) ?? [] };
}

export type SavePriceRowResult =
  | { status: "ok"; row: PriceRow }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Adds a new service/price row. */
export async function addPriceRow(
  businessId: string,
  input: { service: string; price: number }
): Promise<SavePriceRowResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("prices")
    .insert({ business_id: businessId, service: input.service, price: input.price })
    .select(PRICE_COLUMNS)
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this row." };
  }

  return { status: "ok", row: data as PriceRow };
}

/** Edits an existing service/price row in place. */
export async function updatePriceRow(
  priceId: string,
  input: { service: string; price: number }
): Promise<SavePriceRowResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("prices")
    .update({ service: input.service, price: input.price })
    .eq("id", priceId)
    .select(PRICE_COLUMNS)
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this row." };
  }

  return { status: "ok", row: data as PriceRow };
}

export type DeletePriceRowResult =
  | { status: "ok" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

export async function deletePriceRow(priceId: string): Promise<DeletePriceRowResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { error } = await supabase.from("prices").delete().eq("id", priceId);

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok" };
}

export type StoredPricingAssessment = PricingAssessmentPayload & { assessedAt: string };

export type GetPricingAssessmentResult =
  | { status: "ok"; assessment: StoredPricingAssessment | null }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * The owner's last "Assess my pricing" result, if any — cached directly
 * on the business row (see pricing_assessment/pricing_assessed_at in
 * supabase/schema.sql) so it survives navigating away and coming back,
 * without ever re-calling the (paid) Anthropic API just to view the
 * page. Returns assessment: null both when nothing has been assessed
 * yet and when the stored JSON doesn't parse as a real assessment
 * (never shows a guessed or corrupted result).
 */
export async function getPricingAssessment(businessId: string): Promise<GetPricingAssessmentResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("pricing_assessment, pricing_assessed_at")
    .eq("id", businessId)
    .single();

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not load the saved assessment." };
  }

  const row = data as { pricing_assessment: unknown; pricing_assessed_at: string | null };
  if (!row.pricing_assessment || !row.pricing_assessed_at) {
    return { status: "ok", assessment: null };
  }

  const payload = parsePricingAssessmentPayload(row.pricing_assessment);
  if (!payload) {
    return { status: "ok", assessment: null };
  }

  return { status: "ok", assessment: { ...payload, assessedAt: row.pricing_assessed_at } };
}

interface PricingBusinessRow {
  place_id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  review_count: number | null;
  category: string | null;
  categories: string[] | null;
  opening_hours: string[] | null;
  photo_count: number | null;
  business_status: string | null;
  https_status: string | null;
  primary_type: string | null;
  price_level: string | null;
  lat: number | null;
  lng: number | null;
}

export type AssessPricingResult =
  | {
      status: "ok";
      assessments: PriceAssessment[];
      priceLevelContext: PriceLevelComparison | null;
      assessedAt: string;
    }
  | { status: "no_prices" }
  | { status: "not_found" }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * The "Assess my pricing" action. Loads the owner's real entered
 * services/prices, runs the same real nearby-competitor scan the
 * Competitors page uses (see lib/competitors.ts) to get honest Google
 * price-level context, then asks the Anthropic API for a tier
 * assessment per service. Only ever runs on an explicit click (see
 * PricingView.tsx) — never on page load. The result is cached onto the
 * business row (pricing_assessment/pricing_assessed_at) so a returning
 * owner sees it without paying for another API call; re-running this
 * overwrites that cache rather than accumulating history.
 */
export async function assessPricing(businessId: string): Promise<AssessPricingResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const [{ data: business, error: businessError }, pricesResult] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, primary_type, price_level, lat, lng"
      )
      .eq("id", businessId)
      .single(),
    getPrices(businessId),
  ]);

  if (businessError || !business) {
    return { status: "not_found" };
  }
  if (pricesResult.status !== "ok") {
    return pricesResult.status === "unauthenticated"
      ? { status: "unauthenticated" }
      : { status: "error", message: pricesResult.message };
  }
  if (pricesResult.prices.length === 0) {
    return { status: "no_prices" };
  }

  const row = business as PricingBusinessRow;
  const services = pricesResult.prices.map((p) => ({ service: p.service, price: p.price }));

  // Real competitor price-level context, same matching logic as the
  // Competitors page — genuinely comparable nearby businesses, not a
  // guess. Honest to degrade to no context (null) if the scan can't run
  // (e.g. no coordinates) rather than failing the whole assessment.
  let priceLevelContext: PriceLevelComparison | null = null;
  try {
    const subject: CompetitorSourceBusiness = {
      placeId: row.place_id,
      name: row.name,
      address: row.address,
      lat: row.lat,
      lng: row.lng,
      primaryType: row.primary_type,
      priceLevel: row.price_level,
      rating: row.rating,
      review_count: row.review_count,
      phone: row.phone,
      opening_hours: row.opening_hours,
      website: row.website,
      categories: row.categories,
      category: row.category,
      photo_count: row.photo_count,
      business_status: row.business_status,
      https_status: row.https_status,
    };
    const scan = await findAndScoreCompetitors(subject);
    if (scan.status === "ok" && scan.ranked.length > 0) {
      priceLevelContext = buildPriceLevelComparison(scan.ranked);
    }
  } catch {
    priceLevelContext = null;
  }

  const businessTypeLabel = bizProfile(row.category, row.primary_type).label;
  const prompt = buildPricingPrompt({
    businessTypeLabel,
    services,
    priceLevelContext,
  });

  const system = [
    "You are a pricing analyst for small local businesses. You assess whether the prices a business owner charges look low, competitive, high, or premium relative to their real market.",
    "You will be given: the business's type, real Google price-level data ($/$$/$$$) for nearby same-category competitors where available, and the real prices the owner charges for each service.",
    "Frame your guidance in language natural for this business type — e.g. salons/restaurants think in per-service or per-dish menu prices, law firms think in flat-fee vs. hourly, a general/trades business thinks in per-job or per-service-call pricing.",
    "For EACH service, decide independently which of three bases applies, and set \"basis\" to exactly one of these:",
    '- "verified_local": you have real Google price-level data for nearby competitors that is genuinely relevant to this specific service. Base the tier and guidance on that real local signal.',
    '- "general_estimate": there is no relevant local price-level data for this service, BUT it is a specific, widely known item with a genuinely knowable typical market price — e.g. a well-known branded product (a specific packaged snack, drink, etc.) or a standard, common menu item (a bacon-egg-and-cheese, a cup of coffee, a scoop of ice cream). Give an honest estimate of the typical price or range from general knowledge, and the guidance MUST explicitly say this is a general/typical estimate, not verified local data. Ordinary retailer/regional price variation is EXPECTED and does not disqualify a general estimate — that is exactly why you give a RANGE (e.g. "roughly $3-5") instead of one exact number. Example: for "Cheez-Its (family size)" priced at $7 with no local data, a correct response is {"tier":"premium","basis":"general_estimate","guidance":"Typical retail for a family-size box is roughly $3-5, so $7 reads high — this is a general estimate, not verified against local competitors."}. Reach for "general_estimate" whenever you can name even an approximate typical range — reserve "no_data" for services you genuinely cannot estimate at all.',
    '- "no_data": neither real local data nor ANY reasonably knowable typical price/range exists for this item — it is too custom, unique, or variable to estimate at all (e.g. a fully bespoke package, a highly variable custom job). This should be rare for well-known consumer products or standard menu items. Set tier to "no_data" too — never guess a tier without a real basis.',
    "CRITICAL HONESTY RULES:",
    "- Never invent a specific competitor's exact price or a fake 'local average' — you only ever have competitors' coarse $/$$/$$$ price LEVEL, never a real dollar figure for any of them.",
    "- A \"general_estimate\" must NEVER be presented as if it were verified local competitor data. Its guidance sentence must make clear it's a general/typical estimate.",
    "- Prefer a general_estimate with an honest range over a lazy no_data — only use \"no_data\" when you truly have no reasonable sense of typical pricing, not merely because prices vary somewhat.",
    "- Guidance must be one short, concrete sentence — no filler, no fabricated statistics.",
    "Reply with ONLY valid JSON, no markdown fence, no commentary, in exactly this shape:",
    '{"assessments":[{"service":"<same service name as given>","tier":"under_market"|"competitive"|"upper_mid"|"premium"|"no_data","basis":"verified_local"|"general_estimate"|"no_data","guidance":"<1 sentence>"}]}',
    "Return exactly one assessment per service given, in the same order they were given.",
  ].join("\n");

  // Capped low to keep this cheap: a fixed base for the JSON scaffolding
  // plus a small per-service allowance for a one-sentence guidance each
  // (now also carrying a short "basis" field), bounded so a large
  // service list still can't run away in cost.
  const maxTokens = Math.min(800, Math.max(260, 180 + services.length * 70));

  let assessments: PriceAssessment[];
  try {
    const reply = await callAnthropicMessage({ system, userMessage: prompt, maxTokens });
    assessments = parsePricingAssessmentResponse(reply, services);
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach the assessment service.",
    };
  }

  const assessedAt = new Date().toISOString();
  const payload: PricingAssessmentPayload = { assessments, priceLevelContext };

  // Best-effort cache write: the assessment we just paid for is already
  // valid and worth returning even if this update fails for some reason
  // (e.g. a transient DB error) — we don't want to throw away a real
  // result over a caching hiccup. It just means "last assessed" won't
  // have updated next time the owner loads the page.
  await supabase
    .from("businesses")
    .update({ pricing_assessment: payload, pricing_assessed_at: assessedAt })
    .eq("id", businessId);

  return { status: "ok", assessments, priceLevelContext, assessedAt };
}
