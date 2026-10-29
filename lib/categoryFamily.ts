// Google place types that are the same kind of business even when the
// slug differs (a "beauty_salon" salon is a hair salon's competitor), and
// the types that rule a family match out (a nail spa tagged "hair_salon").
// Pure and client-safe: the competitor search (lib/competitors.ts) and the
// Competitors page's niche groups (lib/competitorScope.ts) use the same rule.

/**
 * Curated groups of Google place-type slugs that are genuinely
 * comparable even when they're not the exact same type — e.g. a real
 * "beauty_salon" that does hair is a true competitor to a "hair_salon"
 * the way a customer (or Google Maps itself) would see it, and a
 * "burrito_restaurant" is a real competitor to a "mexican_restaurant"
 * even though Google filed them under different specific type slugs.
 * This is a disciplined allowlist, not a fuzzy match: a candidate only
 * counts as comparable if it shares a type with the subject directly, OR
 * both the subject's and the candidate's types fall in the SAME curated
 * group here — and every member of every group here is itself a SPECIFIC
 * type, never one of GENERIC_TYPES. Anything not in one of these groups
 * still requires an exact type match — a barbershop (a distinct, more
 * male-grooming-focused business model) or an unrelated type like a gym
 * stays excluded, on purpose.
 */
export const CATEGORY_FAMILIES: string[][] = [
  ["hair_salon", "beauty_salon", "hair_care"],
  [
    "mexican_restaurant",
    "tex_mex_restaurant",
    "burrito_restaurant",
    "taco_restaurant",
    // Real, live Google data (see DEBUG_COMPETITORS): a genuine burrito
    // place — El Diablo Burritos, Newark DE — comes back with
    // primaryType "southwestern_us_restaurant" and "burrito_restaurant"
    // only as a secondary type. Since categorizeMatch() requires the
    // family match on primaryType (a secondary tag isn't enough — see
    // its doc comment), that business never matched "mexican_restaurant"
    // subjects (e.g. Chipotle) in either direction until this was added.
    "southwestern_us_restaurant",
  ],
];

export function categoryFamilyFor(type: string): string[] | null {
  return CATEGORY_FAMILIES.find((family) => family.includes(type)) ?? null;
}

/**
 * The full set of type slugs that should count as "comparable" to the
 * subject's reference type — just the type itself if it's not part of
 * any curated family, or every member of its family when it is. Used
 * both to ask Nearby Search for the right types server-side and to
 * double-check comparability once results come back.
 */
export function comparableTypesFor(referenceType: string): string[] {
  return categoryFamilyFor(referenceType) ?? [referenceType];
}

/**
 * Google tags many nail salons, day spas, and massage studios with
 * "beauty_salon" alongside their own more specific type — that's real
 * Google data, not a mistake on Google's part, but it means the
 * hair/salon family match above would otherwise wave through a nail spa
 * as if it were a hair salon. A candidate carrying ANY of these clearly
 * different personal-care service types is excluded from a family match
 * even when it also carries a family type — e.g. a place tagged
 * [beauty_salon, nail_salon] is a nail place, not a hair-salon
 * competitor. This only applies to family matches (see isSameCategory);
 * it never touches an exact-type match outside the family. Add to this
 * list as more false positives turn up.
 */
export const NON_HAIR_SERVICE_EXCLUSIONS = [
  "nail_salon",
  "spa",
  "day_spa",
  "massage",
  "massage_spa",
  "barber_shop",
  "tanning_studio",
];


/** Same kind by Google types alone: the main type is the reference type,
 * or (for a family) a family member with no excluded type anywhere. */
export function sameKindByTypes(primaryType: string | null | undefined, types: readonly string[] | null | undefined, referenceType: string): boolean {
  if (!primaryType) return false;
  const family = categoryFamilyFor(referenceType);
  if (!family) return primaryType === referenceType;
  if (!family.includes(primaryType)) return false;
  return ![primaryType, ...(types ?? [])].some((t) => NON_HAIR_SERVICE_EXCLUSIONS.includes(t));
}
