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
  /** Day 4b: optional size ("750 ml", "family size", "12 oz") — null when
   * not given, or before the prices.size column exists. */
  size?: string | null;
  created_at: string;
}

/** One entered item as the price check sees it. */
export interface PricedItem {
  service: string;
  price: number;
  size?: string | null;
}

/** Where a price sits in a typical range — Day 4b: the model only
 * estimates the range ("General estimate"); the tier is computed here,
 * so the label always matches the numbers shown. Under the low end →
 * under market; the lower 60% of the range → competitive; the top 40% →
 * upper-mid; over the high end → premium. */
export const UPPER_MID_FROM = 0.6;

export function tierFromRange(price: number, low: number, high: number): PriceTierId {
  if (price < low) return "under_market";
  if (price > high) return "premium";
  if (high === low) return "competitive";
  // A tiny tolerance so float error (4.2 in $3–$5 is 0.6000000000000001)
  // never tips a price sitting exactly on the line.
  return (price - low) / (high - low) <= UPPER_MID_FROM + 1e-9 ? "competitive" : "upper_mid";
}

/** A usable typical range: two finite, non-negative numbers, low ≤ high,
 * and not absurdly wide (high more than 20× low isn't an estimate). */
export function validRange(low: unknown, high: unknown): { low: number; high: number } | null {
  if (typeof low !== "number" || typeof high !== "number") return null;
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high <= 0 || low > high) return null;
  if (low > 0 && high / low > 20) return null;
  return { low, high };
}

/**
 * Allocated / collectible bottles: their real shelf prices vary wildly
 * (and far above suggested retail), so we never rank them. A safety net
 * next to the model's own "collectible" flag.
 */
const COLLECTIBLE_PATTERNS: RegExp[] = [
  /pappy\b|van winkle/i,
  /\bweller\b/i,
  /blanton'?s/i,
  /e\.?\s?h\.?\s?taylor/i,
  /\bstagg\b/i,
  /eagle rare 1[0-9]/i,
  /thomas h\.? handy/i,
  /sazerac 18/i,
  /antique collection/i,
  /old fitzgerald/i,
  /michter'?s (?:10|20|25)/i,
  /yamazaki (?:18|25)|hibiki (?:21|30)|macallan (?:25|30)/i,
  /\ballocated\b|limited (?:release|edition)|\bcollectible\b|rare bourbon/i,
];

export function isCollectibleItem(name: string): boolean {
  return COLLECTIBLE_PATTERNS.some((re) => re.test(name));
}

/** A size written in the item's name ("Tito's Vodka 750 ml" → "750 ml"),
 * for filling the size field. null when there isn't one. */
export function detectSize(name: string): string | null {
  const m = name.match(/(\d+(?:[.,]\d+)?)\s?(ml|mL|ML|l|L|oz|fl\.? ?oz|lb|lbs|g|kg|ct|pk|pack)\b/);
  if (!m) return null;
  const unit = m[2].toLowerCase().replace(/fl\.? ?oz/, "fl oz");
  return `${m[1]} ${unit === "l" ? "L" : unit}`;
}

export function formatMoney(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

/** "~$3–$5" / "~$12.50–$18" — whole dollars stay whole. */
export function formatTypicalRange(low: number, high: number): string {
  const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
  return low === high ? `~${money(low)}` : `~${money(low)}–${money(high)}`;
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
    description: "Below the typical price for this item — there may be room to raise this price.",
  },
  {
    id: "competitive",
    label: "Competitive",
    description: "Within the typical price range for this item or service.",
  },
  {
    id: "upper_mid",
    label: "Upper-mid",
    description: "Toward the top of the typical price range.",
  },
  {
    id: "premium",
    label: "Premium",
    description: "Above the typical price range — fine if your reviews back it up.",
  },
  {
    id: "no_data",
    label: "No market data",
    description: "We couldn't judge this price reliably — often because the brand or size is missing — so we won't guess.",
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
  /** Day 4b: the size given with the item, if any. */
  size?: string | null;
  tier: PriceTierId;
  /** See AssessmentBasis — how the tier/guidance were actually derived. */
  basis: AssessmentBasis;
  guidance: string;
  /** Day 4b: the model's typical range (a general estimate) the tier was
   * computed from. Absent on older assessments and on no_data. */
  typicalLow?: number;
  typicalHigh?: number;
  /** Why an item has no ranking: it needs its brand and size, or it's an
   * allocated/collectible bottle (never ranked against suggested retail). */
  reason?: "needs_brand_and_size" | "collectible";
  /** Collectibles: the suggested retail the note mentions, if known. */
  suggestedRetail?: number;
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

/** The fields buildPriceLevelComparison reads — satisfied by a live
 * RankedCompetitor or a saved competitor_scans row. */
export type PriceLevelSource = Pick<RankedCompetitor, "isSubject" | "priceLevel" | "distanceMeters"> & { name: string | null };

export function buildPriceLevelComparison(
  ranked: PriceLevelSource[]
): PriceLevelComparison {
  const subject = ranked.find((r) => r.isSubject) ?? null;
  const competitors = ranked
    .filter((r) => !r.isSubject)
    .map((r) => ({
      name: r.name ?? "Nearby business",
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
    const range = tier === "no_data" ? null : validRange(e.typicalLow, e.typicalHigh);
    assessments.push({
      service: e.service,
      price: e.price,
      ...(typeof e.size === "string" && e.size.trim() ? { size: e.size } : {}),
      ...(range ? { typicalLow: range.low, typicalHigh: range.high } : {}),
      tier,
      // Day 4b: an assessment saved before the store-wide $ level stopped
      // counting as item-level local data is shown as a general estimate
      // (the saved row itself is left untouched).
      basis: basis === "verified_local" ? "general_estimate" : basis,
      guidance: typeof e.guidance === "string" ? e.guidance : "",
      ...(tier === "no_data" && (e.reason === "needs_brand_and_size" || e.reason === "collectible") ? { reason: e.reason } : {}),
      ...(typeof e.suggestedRetail === "number" && e.suggestedRetail > 0 ? { suggestedRetail: e.suggestedRetail } : {}),
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
  services: PricedItem[];
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
    lines.push("Store-wide context only (Google rates whole businesses, never single items — do not base any item's tier on this):");
    lines.push(`Your Google price level: ${input.priceLevelContext.subjectSymbol ?? "not on file"}`);
    lines.push(`Nearby competitors' Google price levels: ${summarizeCompetitorPriceLevels(input.priceLevelContext)}`);
  } else {
    lines.push("No nearby competitor price-level data available — use general knowledge of typical rates for this business type instead.");
  }
  lines.push("Services and prices this owner actually charges:");
  for (const s of input.services) {
    const size = s.size?.trim();
    lines.push(`- ${s.service}${size ? ` (size: ${size})` : ""}: $${s.price.toFixed(2)}`);
  }
  return lines.join("\n");
}

/** The pricing-assessment system prompt, English-only — the JSON keys,
 * tier values, and basis values it specifies are parsed by
 * parsePricingAssessmentResponse below and must never be translated. */
const PRICING_SYSTEM_BASE = [
  "You are a pricing analyst for small local businesses. You assess whether the prices a business owner charges look low, competitive, high, or premium relative to their real market.",
  "You will be given: the business's type, real Google price-level data ($/$$/$$$) for this business and nearby same-category competitors where available, and the real prices the owner charges for each service.",
  "Google's price level describes a WHOLE business compared with others nearby — never the price of any single item or service. Treat it as background context only: never base an item's tier on it, and never say an item's price was checked against local or competitor data.",
  "Frame your guidance in language natural for this business type — e.g. salons/restaurants think in per-service or per-dish menu prices, law firms think in flat-fee vs. hourly, a general/trades business thinks in per-job or per-service-call pricing.",
  "You do NOT decide whether a price is low or high. For each service you estimate its TYPICAL price range (\"typical_low\" and \"typical_high\", in US dollars, as plain numbers); the app compares the owner's price to that range itself.",
  "For EACH service, decide independently which of two bases applies, and set \"basis\" to exactly one of these:",
  '- "general_estimate": it is a specific, widely known item with a genuinely knowable typical market price — e.g. a well-known branded product (a specific packaged snack, drink, etc.) or a standard, common menu item (a bacon-egg-and-cheese, a cup of coffee, a scoop of ice cream). Give an honest typical range from general knowledge (typical_low, typical_high), and the guidance MUST explicitly say this is a general/typical estimate, not verified local data. Ordinary retailer/regional price variation is EXPECTED and does not disqualify a general estimate — that is exactly why you give a RANGE instead of one exact number. Example: for "Cheez-Its (size: family size, 21 oz)" priced at $7 with no local data, a correct response is {"basis":"general_estimate","typical_low":3,"typical_high":5,"guidance":"Typical retail for a family-size box is about $3-5 — a general estimate, not verified against local competitors; check what nearby stores charge before changing it."}. Reach for "general_estimate" whenever you can name even an approximate typical range — reserve "no_data" for services you genuinely cannot estimate at all.',
  '- "no_data": no reasonably knowable typical price/range exists for this item — it is too custom, unique, or variable to estimate at all (e.g. a fully bespoke package, a highly variable custom job). This should be rare for well-known consumer products or standard menu items. Omit typical_low/typical_high — never guess a range without a real basis.',
  'SPECIFIC ENOUGH TO JUDGE: for a bottled, canned or packaged product (wine, spirits, beer, or any packaged good) the typical price depends mainly on its brand and size. The size may be in the name or given separately as "(size: …)" — either counts. If such an item is missing the brand or the size — e.g. "Bottle of Wine", "Whiskey", "Six-Pack of Beer", "Vodka 750 ml" with no brand — do NOT guess: set "basis" to "no_data", omit the range, and add "reason":"needs_brand_and_size". Services and made-to-order menu items (a haircut, a latte, an entrée) are not affected by this rule.',
  'ALLOCATED / COLLECTIBLE BOTTLES: an allocated, collectible or limited-release bottle (e.g. Pappy Van Winkle, the Buffalo Trace Antique Collection, Weller, Blanton\'s, rare or aged limited releases) sells far above suggested retail and varies wildly by store — never rank it. Set "basis" to "no_data", add "reason":"collectible", and give its suggested retail price as "suggested_retail" (a plain number in US dollars) if you know it; omit the range.',
  "CRITICAL HONESTY RULES:",
  "- Never invent a specific competitor's exact price or a fake 'local average' — you only ever have competitors' coarse $/$$/$$$ price LEVEL, never a real dollar figure for any of them.",
  "- A \"general_estimate\" must NEVER be presented as if it were verified local competitor data. Its guidance sentence must make clear it's a general/typical estimate.",
  "- Prefer a general_estimate with an honest range over a lazy no_data — only use \"no_data\" when you truly have no reasonable sense of typical pricing, not merely because prices vary somewhat. The one exception is the brand-and-size rule above: a vague bottled/packaged item is always no_data.",
  "- The range must be for THIS item at the given size, in US dollars — never a range for a different size or pack.",
  "- Guidance must be one short, concrete sentence — no filler, no fabricated statistics. Do not call the price low, fair, high or premium yourself (the app decides that from the range); say what the owner could check or do.",
  "Reply with ONLY valid JSON, no markdown fence, no commentary, in exactly this shape:",
  '{"assessments":[{"service":"<same service name as given>","basis":"general_estimate"|"no_data","typical_low":<number, only with general_estimate>,"typical_high":<number, only with general_estimate>,"guidance":"<1 sentence>","reason":"needs_brand_and_size"|"collectible" (only when that rule applies; otherwise omit),"suggested_retail":<number, only with "collectible">}]}',
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
  const directive = `\n\nIMPORTANT: Write every "guidance" sentence in natural ${languageName}, using the formal "usted" register throughout — never "tú" or its conjugations. The JSON itself must otherwise stay exactly as specified above, in English: the field names ("service", "basis", "typical_low", "typical_high", "guidance"), and every "basis" value, must remain the exact English strings listed — never translate those, and neither are the "reason" values "needs_brand_and_size" and "collectible". typical_low and typical_high stay plain numbers in US dollars. The "service" field must echo the exact service name as given, unchanged. When "basis" is "general_estimate", the ${languageName} guidance must still clearly state that it is a general estimate, not verified local data (for example: "es una estimación general, no verificada con competidores locales").`;
  return PRICING_SYSTEM_BASE + directive;
}

/**
 * The Anthropic maxTokens cap for a pricing assessment. Spanish replies
 * tend to run longer than their English equivalents for the same
 * content, so Spanish gets a ~1.3x allowance on top of the same base
 * English uses — English itself is completely unchanged.
 */
export function pricingMaxTokens(serviceCount: number, locale: Locale = DEFAULT_LOCALE): number {
  // Day 4b: 85 per item (was 70) — each now also carries a typical_low/high.
  const base = Math.min(900, Math.max(260, 180 + serviceCount * 85));
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
  basis?: unknown;
  typical_low?: unknown;
  typical_high?: unknown;
  guidance?: unknown;
  reason?: unknown;
  suggested_retail?: unknown;
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
 *
 * Day 4b: a fresh reply's "verified_local" is always downgraded to
 * "general_estimate" — the only local data we have is Google's
 * store-wide $ level, which can't verify any single item's price. And
 * an item the model flags "needs_brand_and_size" is always no_data with
 * our own localized add-the-brand-and-size note, never a guessed tier.
 */
export function parsePricingAssessmentResponse(
  raw: string,
  services: PricedItem[],
  locale: Locale = DEFAULT_LOCALE
): PriceAssessment[] {
  const sizeOf = (s: PricedItem) => (s.size && s.size.trim() ? { size: s.size.trim() } : {});
  const fallbackFor = (s: PricedItem, note: string): PriceAssessment => ({
    service: s.service,
    price: s.price,
    ...sizeOf(s),
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
    return services.map((s) => fallbackFor(s, fallbackNote));
  }

  const assessments =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { assessments?: unknown }).assessments)
      ? ((parsed as { assessments: RawAssessment[] }).assessments)
      : null;

  if (!assessments) {
    return services.map((s) => fallbackFor(s, fallbackNote));
  }

  const collectible = (s: PricedItem, suggested: unknown, range: { low: number; high: number } | null): PriceAssessment => {
    const retail = typeof suggested === "number" && Number.isFinite(suggested) && suggested > 0 ? suggested : range ? Math.round((range.low + range.high) / 2) : null;
    return {
      ...fallbackFor(s, retail !== null ? t(locale, "dashboard.pricing.collectibleNote", { price: formatMoney(retail) }) : t(locale, "dashboard.pricing.collectibleNoteNoPrice")),
      reason: "collectible",
      ...(retail !== null ? { suggestedRetail: retail } : {}),
    };
  };

  return services.map((s, i) => {
    const entry = assessments[i];
    // Allocated/collectible bottles are never ranked against suggested
    // retail — whether the model flagged it or our own list did.
    if (entry?.reason === "collectible" || isCollectibleItem(s.service)) {
      return collectible(s, entry?.suggested_retail, entry ? validRange(entry.typical_low, entry.typical_high) : null);
    }
    if (!entry) return fallbackFor(s, fallbackNote);
    if (entry.reason === "needs_brand_and_size") {
      return { ...fallbackFor(s, t(locale, "dashboard.pricing.needsBrandAndSize")), reason: "needs_brand_and_size" };
    }
    // Day 4b: the tier is OURS — computed from the price and the model's
    // typical range. No usable range (or a no_data basis) → no tier.
    const range = entry.basis === "no_data" ? null : validRange(entry.typical_low, entry.typical_high);
    if (!range) {
      // A real "can't estimate this" keeps the model's own explanation.
      const ownNote = entry.basis === "no_data" && typeof entry.guidance === "string" ? entry.guidance.trim() : "";
      return fallbackFor(s, ownNote || fallbackNote);
    }
    const guidance =
      typeof entry.guidance === "string" && entry.guidance.trim().length > 0
        ? entry.guidance.trim()
        : fallbackNote;
    return {
      service: s.service,
      price: s.price,
      ...sizeOf(s),
      tier: tierFromRange(s.price, range.low, range.high),
      // Only ever a general estimate: the store-wide $ level can't verify
      // an item's price (Day 4b).
      basis: "general_estimate",
      guidance,
      typicalLow: range.low,
      typicalHigh: range.high,
    };
  });
}

/** A saved competitor_scans row, as much as the price check needs. */
export interface SavedPriceLevelRow {
  scan_id: string;
  created_at: string;
  is_subject: boolean;
  name: string | null;
  distance_meters: number | string | null;
  price_level: string | null;
}

/**
 * Part B: the price check reuses the latest SAVED competitor scan instead
 * of a fresh paid scan on every "Assess my pricing". `rows` may span
 * several scans in any order; only the newest scan is used. null when
 * nothing is saved (the assessment then runs without local context, as
 * it always has when no competitors are known).
 */
export function priceLevelContextFromSavedRows(rows: SavedPriceLevelRow[]): PriceLevelComparison | null {
  if (rows.length === 0) return null;
  const newest = rows.reduce((a, b) => (Date.parse(b.created_at) > Date.parse(a.created_at) ? b : a));
  const latest = rows.filter((r) => r.scan_id === newest.scan_id);
  return buildPriceLevelComparison(
    latest.map((r) => ({
      isSubject: r.is_subject,
      name: r.name,
      priceLevel: r.price_level,
      distanceMeters: r.distance_meters === null ? null : Number(r.distance_meters),
    }))
  );
}


// ---- Price map ----

export interface PriceMapSummary {
  items: number;
  underMarket: number;
  competitive: number;
  upperMid: number;
  premium: number;
  needsDetails: number;
  collectible: number;
}

/** "3 items · 2 competitive · 0 under market · 1 needs details". */
export function priceMapSummary(assessments: PriceAssessment[]): PriceMapSummary {
  const count = (tier: PriceTierId) => assessments.filter((a) => a.tier === tier).length;
  return {
    items: assessments.length,
    underMarket: count("under_market"),
    competitive: count("competitive"),
    upperMid: count("upper_mid"),
    premium: count("premium"),
    needsDetails: assessments.filter((a) => a.reason === "needs_brand_and_size").length,
    collectible: assessments.filter((a) => a.reason === "collectible").length,
  };
}

/** Where things sit on a price-map bar (0–1 along the bar). The bar spans
 * a little past the typical range so under-market and premium prices have
 * room; the marker is clamped to the ends. */
export function priceMapGeometry(price: number, low: number, high: number): { lowAt: number; upperMidAt: number; highAt: number; markerAt: number; clamped: boolean } {
  const span = Math.max(high - low, high * 0.2, 1);
  const min = Math.max(0, low - span * 0.5);
  const max = high + span * 0.5;
  const at = (v: number) => (v - min) / (max - min);
  const raw = at(price);
  return {
    lowAt: at(low),
    upperMidAt: at(low + (high - low) * UPPER_MID_FROM),
    highAt: at(high),
    markerAt: Math.min(1, Math.max(0, raw)),
    clamped: raw < 0 || raw > 1,
  };
}
