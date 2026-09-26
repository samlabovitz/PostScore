// Pure types and logic for the Pricing page's "Price check" tool.
// Persistence lives in app/actions/pricing.ts (server actions) and
// supabase/schema.sql (the `prices` table); the AI call itself lives in
// lib/anthropicClient.ts. This module is prompt-building, response
// parsing, and display logic only — no network, no lib/scoring.ts.

import { priceLevelToSymbol } from "@/lib/priceLevel";
import type { RankedCompetitor } from "@/lib/competitors";
import { DEFAULT_LOCALE, t, type Locale } from "@/lib/i18n";

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

/**
 * The three-way honesty distinction the AI must make for every service
 * (see the system prompt in app/actions/pricing.ts): whether its tier
 * came from real local data, a general-knowledge estimate, or neither.
 * Kept separate from PriceTierId — a tier is WHAT the AI concluded,
 * basis is HOW it knows — so the UI can label the two independently.
 */
export const ASSESSMENT_BASES = [
  {
    id: "verified_local",
    label: "Based on local price levels",
    description: "Grounded in real Google price-level data for nearby competitors.",
  },
  {
    id: "general_estimate",
    label: "General estimate",
    description: "A typical-price estimate from general knowledge — not verified against local competitors.",
  },
  {
    id: "no_data",
    label: "No market data",
    description: "Neither real local data nor a reliable typical price was available.",
  },
] as const;

export type AssessmentBasis = (typeof ASSESSMENT_BASES)[number]["id"];

const ASSESSMENT_BASIS_IDS = new Set<string>(ASSESSMENT_BASES.map((b) => b.id));

export function isAssessmentBasis(value: unknown): value is AssessmentBasis {
  return typeof value === "string" && ASSESSMENT_BASIS_IDS.has(value);
}

export function assessmentBasisLabel(id: AssessmentBasis): string {
  return ASSESSMENT_BASES.find((b) => b.id === id)?.label ?? id;
}

/**
 * Keeps tier and basis internally coherent no matter what a caller
 * passes in: "no_data" in either field forces both to "no_data" (a
 * ranking with no real or estimated basis isn't a ranking), and an
 * invalid/missing basis on a real tier degrades to "general_estimate"
 * — the more conservative of the two real bases — rather than ever
 * silently upgrading an unlabeled result to "verified_local".
 */
function normalizeTierAndBasis(
  rawTier: unknown,
  rawBasis: unknown
): { tier: PriceTierId; basis: AssessmentBasis } {
  const tier = isPriceTierId(rawTier) ? rawTier : "no_data";
  if (tier === "no_data") return { tier: "no_data", basis: "no_data" };
  const basis = isAssessmentBasis(rawBasis) ? rawBasis : "general_estimate";
  if (basis === "no_data") return { tier: "no_data", basis: "no_data" };
  return { tier, basis };
}

/** One AI-assessed result for a single entered service. */
export interface PriceAssessment {
  service: string;
  price: number;
  tier: PriceTierId;
  /** See AssessmentBasis — how the tier/guidance were actually derived. */
  basis: AssessmentBasis;
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
  /** The locale the AI actually wrote this assessment's guidance in.
   * null means an older assessment saved before this field existed —
   * always treated as English, never assumed to secretly be Spanish. */
  locale: Locale | null;
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
    const { tier, basis } = normalizeTierAndBasis(e.tier, e.basis);
    assessments.push({
      service: e.service,
      price: e.price,
      tier,
      basis,
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

  const locale = obj.locale === "en" || obj.locale === "es" ? (obj.locale as Locale) : null;

  return { assessments, priceLevelContext, locale };
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

/** The pricing-assessment system prompt, English-only — the JSON keys,
 * tier values, and basis values it specifies are parsed by
 * parsePricingAssessmentResponse below and must never be translated. */
const PRICING_SYSTEM_BASE = [
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

/**
 * Builds the pricing-assessment system prompt for the given locale.
 * English (the default) is returned completely unchanged from
 * PRICING_SYSTEM_BASE. For Spanish, a directive is appended — never
 * prepended or interleaved — so the base instructions above are never
 * touched, and it explicitly tells the model to translate only the
 * "guidance" sentence: the JSON field names, every "tier" value, and
 * every "basis" value must stay in English exactly as specified, since
 * parsePricingAssessmentResponse only recognizes those exact English
 * strings.
 */
export function buildPricingSystemPrompt(locale: Locale = DEFAULT_LOCALE): string {
  if (locale !== "es") return PRICING_SYSTEM_BASE;

  const languageName = t(DEFAULT_LOCALE, "language.es");
  const directive = `\n\nIMPORTANT: Write every "guidance" sentence in natural ${languageName}, using the formal "usted" register throughout — never "tú" or its conjugations. The JSON itself must otherwise stay exactly as specified above, in English: the field names ("service", "tier", "basis", "guidance"), and every "tier" and "basis" value, must remain the exact English strings listed — never translate those. The "service" field must echo the exact service name as given, unchanged. When "basis" is "general_estimate", the ${languageName} guidance must still clearly state that it is a general estimate, not verified local data (for example: "es una estimación general, no verificada con competidores locales").`;
  return PRICING_SYSTEM_BASE + directive;
}

/**
 * The Anthropic maxTokens cap for a pricing assessment. Spanish replies
 * tend to run longer than their English equivalents for the same
 * content, so Spanish gets a ~1.3x allowance on top of the same base
 * English uses — English itself is completely unchanged.
 */
export function pricingMaxTokens(serviceCount: number, locale: Locale = DEFAULT_LOCALE): number {
  const base = Math.min(800, Math.max(260, 180 + serviceCount * 70));
  return locale === "es" ? Math.round(base * 1.3) : base;
}

/**
 * Whether a stored assessment's language note should show above the
 * results — true only when the assessment was actually written in a
 * different language than the business is currently displayed in.
 * `storedLocale` of null means an assessment saved before this field
 * existed, which is always treated as English (never assumed to
 * secretly be Spanish) — never auto-translated either way, just flagged.
 */
export function isPricingLanguageMismatch(storedLocale: Locale | null, currentLocale: Locale): boolean {
  return (storedLocale ?? DEFAULT_LOCALE) !== currentLocale;
}

/** Raw shape we ask Claude to reply with — validated field by field
 * before anything reaches an owner, since a malformed or missing tier
 * or basis must degrade to "no_data" rather than ever showing a wrong
 * ranking or a general estimate mislabeled as verified local data. */
interface RawAssessment {
  service?: unknown;
  tier?: unknown;
  basis?: unknown;
  guidance?: unknown;
}

/**
 * Parses and validates Claude's JSON reply against the real services we
 * asked about. Never trusts the model's output blindly: a missing,
 * unparseable, or out-of-range response for a given service falls back
 * to an honest "no_data" tier/basis with an explanatory note, rather
 * than showing a guessed or stale ranking — and normalizeTierAndBasis
 * ensures a real tier can never end up paired with an invalid or
 * missing basis (it degrades to the more conservative
 * "general_estimate" rather than ever defaulting to "verified_local").
 */
export function parsePricingAssessmentResponse(
  raw: string,
  services: Array<{ service: string; price: number }>
): PriceAssessment[] {
  const fallback = (service: string, price: number, note: string): PriceAssessment => ({
    service,
    price,
    tier: "no_data",
    basis: "no_data",
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
    const { tier, basis } = normalizeTierAndBasis(entry.tier, entry.basis);
    const guidance =
      typeof entry.guidance === "string" && entry.guidance.trim().length > 0
        ? entry.guidance.trim()
        : fallbackNote;
    return { service: s.service, price: s.price, tier, basis, guidance };
  });
}
