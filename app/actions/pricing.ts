"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveBizProfile } from "@/config/bizProfiles";
import {
  priceLevelContextFromSavedRows,
  type SavedPriceLevelRow,
  buildPricingPrompt,
  buildPricingSystemPrompt,
  parsePricingAssessmentPayload,
  parsePricingAssessmentResponse,
  pricingMaxTokens,
  type PriceAssessment,
  type PriceLevelComparison,
  type PriceRow,
  type PricingAssessmentPayload,
} from "@/lib/pricing";
import { callAnthropicMessage } from "@/lib/anthropicClient";
import { normalizeLocale, t, type Locale } from "@/lib/i18n";
import { getPlan } from "@/lib/premium";
import { priceLevelToSymbol } from "@/lib/priceLevel";

const PRICE_COLUMNS_BASE = "id, business_id, service, price, created_at";
// Day 4b: the optional size (prices.size — ~/Desktop/pricing-size.sql).
const PRICE_COLUMNS = `${PRICE_COLUMNS_BASE}, size`;

/** Postgres "column does not exist" — prices.size isn't added yet. Every
 * read/write then retries without it, so the page keeps working. */
function isMissingSizeColumn(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === "42703" || (/\bsize\b/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "")))
  );
}

/** An owner-typed size: trimmed, at most 40 characters, empty → null. */
function cleanSize(size: string | null | undefined): string | null {
  const trimmed = (size ?? "").trim().slice(0, 40);
  return trimmed.length > 0 ? trimmed : null;
}

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

  const read = (columns: string) =>
    supabase.from("prices").select(columns).eq("business_id", businessId).order("created_at", { ascending: true });
  let { data, error } = await read(PRICE_COLUMNS);
  if (isMissingSizeColumn(error)) ({ data, error } = await read(PRICE_COLUMNS_BASE));

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", prices: ((data ?? []) as unknown as PriceRow[]).map((p) => ({ ...p, size: p.size ?? null })) };
}

export type SavePriceRowResult =
  | { status: "ok"; row: PriceRow }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Adds a new service/price row. */
export async function addPriceRow(
  businessId: string,
  input: { service: string; price: number; size?: string | null }
): Promise<SavePriceRowResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const size = cleanSize(input.size);
  const insert = (withSize: boolean) =>
    supabase
      .from("prices")
      .insert({ business_id: businessId, service: input.service, price: input.price, ...(withSize ? { size } : {}) })
      .select(withSize ? PRICE_COLUMNS : PRICE_COLUMNS_BASE)
      .single();
  let { data, error } = await insert(true);
  if (isMissingSizeColumn(error)) ({ data, error } = await insert(false));

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this row." };
  }

  return { status: "ok", row: { ...(data as unknown as PriceRow), size: (data as unknown as PriceRow).size ?? null } };
}

/** Edits an existing service/price row in place. */
export async function updatePriceRow(
  priceId: string,
  input: { service: string; price: number; size?: string | null }
): Promise<SavePriceRowResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const size = cleanSize(input.size);
  const update = (withSize: boolean) =>
    supabase
      .from("prices")
      .update({ service: input.service, price: input.price, ...(withSize ? { size } : {}) })
      .eq("id", priceId)
      .select(withSize ? PRICE_COLUMNS : PRICE_COLUMNS_BASE)
      .single();
  let { data, error } = await update(true);
  if (isMissingSizeColumn(error)) ({ data, error } = await update(false));

  if (error || !data) {
    return { status: "error", message: error?.message ?? "Could not save this row." };
  }

  return { status: "ok", row: { ...(data as unknown as PriceRow), size: (data as unknown as PriceRow).size ?? null } };
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
  website_analysis_json: unknown;
  primary_type: string | null;
  business_type_override: string | null;
  price_level: string | null;
  lat: number | null;
  lng: number | null;
  language: string | null;
  verified_website_url: string | null;
  website_trust_overrides_json: unknown;
}

export type AssessPricingResult =
  | {
      status: "ok";
      assessments: PriceAssessment[];
      priceLevelContext: PriceLevelComparison | null;
      assessedAt: string;
      locale: Locale;
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
  // Free: the AI price check (Anthropic + Places) never runs.
  if (getPlan() === "free") {
    const { data: row } = await supabase.from("businesses").select("language").eq("id", businessId).maybeSingle();
    return { status: "error", message: t(normalizeLocale(row?.language), "dashboard.free.priceCheckLocked") };
  }

  const [{ data: business, error: businessError }, pricesResult] = await Promise.all([
    supabase
      .from("businesses")
      .select(
        "place_id, name, address, phone, website, rating, review_count, category, categories, opening_hours, photo_count, business_status, https_status, website_analysis_json, verified_website_url, website_trust_overrides_json, primary_type, business_type_override, price_level, lat, lng, language"
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
  const locale = normalizeLocale(row.language);
  const services = pricesResult.prices.map((p) => ({ service: p.service, price: p.price, size: p.size ?? null }));

  // Part B: real competitor price-level context from the latest SAVED
  // competitor scan — never a fresh paid scan per "Assess". The owner's
  // own level comes from the business row (always current). No saved
  // scan → honestly no local context, same as a scan finding nothing.
  let priceLevelContext: PriceLevelComparison | null = null;
  const { data: savedRows } = await supabase
    .from("competitor_scans")
    .select("scan_id, created_at, is_subject, name, distance_meters, price_level")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(60);
  const saved = priceLevelContextFromSavedRows((savedRows ?? []) as SavedPriceLevelRow[]);
  if (saved && saved.competitors.length > 0) {
    priceLevelContext = { ...saved, subjectSymbol: priceLevelToSymbol(row.price_level) };
  }

  const pricingProfile = resolveBizProfile(
    row.category,
    row.primary_type,
    row.business_type_override,
    locale,
    row.categories,
    row.name
  );
  // No price check for a type it doesn't fit (a place of worship) —
  // refused before the paid AI call, matching the Pricing page.
  if (!pricingProfile.pricingOk) {
    return { status: "error", message: t(locale, "dashboard.pricing.notApplicable") };
  }
  const businessTypeLabel = pricingProfile.label;
  const prompt = buildPricingPrompt({
    businessTypeLabel,
    services,
    priceLevelContext,
  });

  const system = buildPricingSystemPrompt(locale);

  // Capped low to keep this cheap: a fixed base for the JSON scaffolding
  // plus a small per-service allowance for a one-sentence guidance each
  // (now also carrying a short "basis" field), bounded so a large
  // service list still can't run away in cost. Spanish gets a ~1.3x
  // allowance on top (see pricingMaxTokens) since its replies tend to
  // run longer for the same content.
  const maxTokens = pricingMaxTokens(services.length, locale);

  let assessments: PriceAssessment[];
  try {
    const reply = await callAnthropicMessage({ system, userMessage: prompt, maxTokens });
    assessments = parsePricingAssessmentResponse(reply, services, locale);
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Could not reach the assessment service.",
    };
  }

  const assessedAt = new Date().toISOString();
  const payload: PricingAssessmentPayload = { assessments, priceLevelContext, locale };

  // Best-effort cache write: the assessment we just paid for is already
  // valid and worth returning even if this update fails for some reason
  // (e.g. a transient DB error) — we don't want to throw away a real
  // result over a caching hiccup. It just means "last assessed" won't
  // have updated next time the owner loads the page.
  await supabase
    .from("businesses")
    .update({ pricing_assessment: payload, pricing_assessed_at: assessedAt })
    .eq("id", businessId);

  return { status: "ok", assessments, priceLevelContext, assessedAt, locale };
}
