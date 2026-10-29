// Competitor selection v2: the Text Search query a customer would type —
// "{niche plural} in {town}, {state}" ("hair salons in Tarrytown, NY").
// English query words only (Google matches them in any market); the
// niche's own label first, else the Google primary type. Pure.

const GENERIC = new Set(["store", "point_of_interest", "establishment", "service", "food", "food_store", "health"]);
const BROAD_FOOD = new Set(["restaurant", "meal_takeaway", "meal_delivery"]);

/** Last words that already name a kind of place ("… shop", "… salon"). */
const PLACE_NOUN =
  /^(salon|shop|store|restaurant|bar|bakery|cafe|café|deli|gym|studio|spa|market|boutique|florist|barbershop|clinic|office|dentist|lawyer|attorney|accountant|agency|center|centre|school|gallery|pharmacy|parlor|parlour|lounge|house|pub|brewery|winery|grill|diner|pizzeria|cleaner|cleaners|garage|dealer|dealership|hotel|inn|motel|theater|theatre|cinema|church|library|museum|club|academy|tutor|photographer|plumber|electrician|landscaper|mechanic|veterinarian|vet|groomer|trainer|coach|consultant|therapist|chiropractor|optometrist|realtor|agent|truck|kitchen|eatery|bistro|tavern|steakhouse|creamery|outfitter|outfitters|bookstore|nursery|stand|shoppe|emporium|warehouse|showroom|rink|park|arcade|alley|range|course|kennel|daycare)$/i;

/** The profession, plural, after a practice niche's label. */
const PRACTICE_NOUN: Record<string, string> = {
  lawyer: "lawyers",
  accountant: "accountants",
  real_estate: "real estate agents",
  consultant: "consultants",
  coach: "coaches",
  dentist: "dentists",
  medical_clinic: "doctors",
  practitioner: "practitioners",
};

function pluralWord(word: string): string {
  if (/s$/i.test(word)) return word;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

/** "hair salon" → "hair salons"; "skate & snow shop" → "skate & snow shops". */
export function pluralPhrase(phrase: string): string {
  const words = phrase.trim().toLowerCase().split(/\s+/);
  words[words.length - 1] = pluralWord(words[words.length - 1]);
  return words.join(" ");
}

/** The kind of place, plural, for the query — or null when there's nothing
 * specific (only generic Google types and no usable niche). */
export function competitorQueryNoun(subject: { nicheLabelEn?: string | null; nicheParent?: string | null; primaryType?: string | null }): string | null {
  // "Café / Coffee Shop" → "coffee shop" (the last of the alternatives).
  const label = subject.nicheLabelEn?.split("/").pop()?.trim().toLowerCase().replace(/\s+/g, " ");
  if (label) {
    const last = label.split(" ").pop() ?? "";
    if (PLACE_NOUN.test(last)) return pluralPhrase(label);
    // Food niches are named by cuisine ("Japanese & sushi", "Italian").
    if (subject.nicheParent === "restaurant") return `${label} restaurants`;
    // Practices are named by what they do ("Criminal defense", "Personal
    // injury law") — the profession says who: "criminal defense lawyers".
    const who = subject.nicheParent ? PRACTICE_NOUN[subject.nicheParent] : undefined;
    if (who) return `${label.replace(/\s+law$/, "")} ${who}`;
  }
  const type = subject.primaryType ?? null;
  if (!type || GENERIC.has(type)) return null;
  if (BROAD_FOOD.has(type)) return "restaurants";
  return pluralPhrase(type.replace(/_/g, " "));
}

/** "9 S Broadway, Tarrytown, NY 10591, USA" → { town: "Tarrytown", state: "NY" }.
 * The town is the part before "ST 12345"; null when it can't be told. */
export function townStateFromAddress(address: string | null | undefined): { town: string; state: string | null } | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(p));
  if (i > 0) return { town: parts[i - 1], state: parts[i].slice(0, 2) };
  // No US state: "street, town, country" — the part before the country,
  // without a postal code.
  if (parts.length < 3) return null;
  const town = parts[parts.length - 2].replace(/^\s*\d[\d-]*\s*|\s*\d[\d-]*\s*$/g, "").trim();
  return town ? { town, state: null } : null;
}

/** "hair salons in Tarrytown, NY", or null when the noun or town is unknown
 * (the scan then uses Nearby Search, as before). */
export function competitorTextQuery(subject: { nicheLabelEn?: string | null; nicheParent?: string | null; primaryType?: string | null; address?: string | null }): string | null {
  const noun = competitorQueryNoun(subject);
  const place = townStateFromAddress(subject.address);
  if (!noun || !place) return null;
  return `${noun} in ${place.town}${place.state ? `, ${place.state}` : ""}`;
}

/** Whether a niche should name the query: the owner chose it, or it was
 * recognized specifically — never a "general" guess (the real Main Street
 * Sweets case: guessed "Café / Coffee Shop", Google says ice cream shop). */
export function nicheNamesQuery(resolved: { source: string; confidence: string }): boolean {
  return resolved.source === "owner" || resolved.confidence !== "general";
}
