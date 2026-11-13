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

/** What customers type for business types whose label doesn't name a kind
 * of place ("Art & pottery classes", "HVAC", "Massage") — without one, the
 * query fell back to Google's own category (the real Centered Clay Studio
 * case: "educational institutions in Kennett Square, PA", which found music
 * schools). Already plural. */
export const NICHE_QUERY_NOUN: Record<string, string> = {
  braiding: "hair braiding salons",
  makeup_artist: "makeup artists",
  massage: "massage therapists",
  sauna_wellness: "saunas and wellness spas",
  coffee_roaster: "coffee roasters",
  bubble_tea: "bubble tea shops",
  brewery: "breweries",
  nightclub: "nightclubs",
  panaderia: "latin bakeries",
  butcher: "butcher shops",
  specialty_food: "specialty food stores",
  gas_station: "gas stations",
  home_improvement: "home improvement stores",
  womens_clothing: "women's clothing stores",
  mens_clothing: "men's clothing stores",
  kids_clothing: "kids' clothing stores",
  sneakers_streetwear: "sneaker stores",
  thrift_vintage: "thrift and vintage stores",
  bridal_formal: "bridal shops",
  furniture_decor: "furniture stores",
  sporting_goods: "sporting goods stores",
  hockey_team: "hockey shops",
  outdoor: "outdoor stores",
  dance_supply: "dance supply stores",
  comics_collectibles: "comic book stores",
  craft_fabric: "craft stores",
  party_costume: "party supply stores",
  beauty_supply: "beauty supply stores",
  cannabis_dispensary: "cannabis dispensaries",
  ymca_jcc: "community centers",
  crossfit: "crossfit gyms",
  boxing: "boxing gyms",
  martial_arts: "martial arts schools",
  pet_grooming: "pet groomers",
  dog_training: "dog trainers",
  pet_sitting: "pet sitters",
  test_prep: "test prep centers",
  music_lessons: "music lessons",
  art_classes: "pottery studios",
  coding_stem: "coding classes for kids",
  videographer: "videographers",
  auto_body: "auto body shops",
  oil_change: "oil change shops",
  auto_glass: "auto glass repair shops",
  drain_sewer: "drain cleaning services",
  hvac: "hvac contractors",
  roofing: "roofing contractors",
  handyman: "handyman services",
  painting_contractor: "painting contractors",
  general_contractor: "general contractors",
  pest_control: "pest control services",
  movers: "moving companies",
  junk_removal: "junk removal services",
  garage_door: "garage door repair services",
  pool_service: "pool services",
  solar: "solar installers",
  lawn_care: "lawn care services",
  tree_service: "tree services",
  snow_removal: "snow removal services",
  commercial_cleaning: "commercial cleaning services",
  carpet_cleaning: "carpet cleaning services",
  pressure_washing: "pressure washing services",
  laundromat: "laundromats",
  shoe_repair: "shoe repair shops",
  tailor: "tailors",
  phone_repair: "phone repair shops",
  watch_repair: "watch repair shops",
  appliance_repair: "appliance repair services",
  locksmith: "locksmiths",
  detailing: "auto detailing shops",
  bowling: "bowling alleys",
  escape_room: "escape rooms",
  axe_paintball: "axe throwing venues",
  golf: "golf courses",
  water_sports: "boat tours",
  tour_operator: "tour companies",
  wedding_venue: "wedding venues",
  party_rentals: "party rental companies",
  dj: "djs",
  event_planner: "event planners",
  funeral_home: "funeral homes",
  preschool: "preschools",
  after_school: "after school programs",
  summer_camp: "summer camps",
  vacation_rental: "vacation rentals",
  permanent_makeup: "permanent makeup studios",
  self_storage: "self storage facilities",
};

/** Business types searched with several phrases, each near the business,
 * results merged — and a strict same-kind rule instead of Google's types,
 * which don't tell a pottery studio from a music school (both
 * "educational_institution"). `fallback` phrases run only when the main
 * ones find too few; their results pass `fallbackMatch` instead. `never`
 * keeps out what a match word can also mean ("Clay Music Academy"). */
export interface NichePhrases {
  phrases: string[];
  fallback: string[];
  /** The words a kept place's name, Google types or website must say. */
  match: PhraseWord[];
  fallbackMatch: PhraseWord[];
  never: PhraseWord[];
  fallbackNever: PhraseWord[];
}

/** `re` reads names and Google types (whole words); `host` reads a website
 * address, where words run together ("centeredclaystudio.com"). */
interface PhraseWord {
  word: string;
  re: RegExp;
  host: RegExp;
}

const words = (list: Array<[string, string, string?]>): PhraseWord[] =>
  list.map(([word, re, host]) => ({ word, re: new RegExp(`(?:^|[^a-z])(?:${re})`, "i"), host: new RegExp(host ?? re, "i") }));

export const NICHE_SEARCH_PHRASES: Record<string, NichePhrases> = {
  art_classes: {
    phrases: ["pottery studio", "ceramics studio", "pottery classes", "clay studio"],
    fallback: ["art studio classes"],
    match: words([
      ["pottery", "pottery|potter'?s"],
      ["ceramics", "ceramic"],
      // Never "Clayton" or "Claymont" (Delaware towns).
      ["clay", "clay(?![a-z])", "clay(?!ton|mont)"],
      ["wheel throwing", "wheel[-_ ]?throw"],
    ]),
    fallbackMatch: words([
      ["painting", "painting|paint (?:and|&|n) sip|paint ?night"],
      ["art classes", "art[-_ ]?class|art[-_ ]?lesson|art[-_ ]?workshop"],
      ["art studio", "art[-_ ]?studio"],
    ]),
    never: words([
      ["music", "music|piano|guitar|drum|percussion|violin|vocal|voice lesson"],
      ["dance", "danc(?:e|ing)|ballet"],
      ["tutoring", "tutor"],
    ]),
    fallbackNever: words([
      ["music", "music|piano|guitar|drum|percussion|violin|vocal|voice lesson"],
      ["dance", "danc(?:e|ing)|ballet"],
      ["tutoring", "tutor"],
      ["school", "school|academy|universit|college|institute"],
      ["store", "supply|supplies|store|shop\\b|gallery"],
    ]),
  },
};

/** "pottery studios" for each phrase (and fallback), searched around the
 * business itself (a location bias) — never "… in {town}", which kept
 * Google to one small town (the first Centered Clay Studio test found 1
 * pottery studio that way). null when this business type has no phrases. */
export function competitorPhraseQueries(nicheId: string | null | undefined): { queries: string[]; fallbackQueries: string[] } | null {
  const rule = nicheId ? NICHE_SEARCH_PHRASES[nicheId] : undefined;
  if (!rule) return null;
  return { queries: rule.phrases.map(pluralPhrase), fallbackQueries: rule.fallback.map(pluralPhrase) };
}

export type PhraseVerdict = { ok: true; reason: string } | { ok: false; reason: string };

/** The strict same-kind rule (NICHE_SEARCH_PHRASES): kept only when the
 * place's name, Google types or website address say a match word, and
 * its name never says a `never` word. The reason is shown to the owner
 * and in the scan's own report. */
export function phraseMatch(nicheId: string, place: { name: string | null; types: string[] | null; website: string | null }, fallback = false): PhraseVerdict {
  const rule = NICHE_SEARCH_PHRASES[nicheId];
  if (!rule) return { ok: false, reason: "no phrase rule for this business type" };
  const name = place.name ?? "";
  const never = (fallback ? rule.fallbackNever : rule.never).find((w) => w.re.test(name));
  if (never) return { ok: false, reason: `name says “${never.word}”` };
  const types = (place.types ?? []).join(" ");
  let host = "";
  try {
    host = place.website ? new URL(/^https?:\/\//i.test(place.website) ? place.website : `https://${place.website}`).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  const list = fallback ? rule.fallbackMatch : rule.match;
  for (const w of list) if (w.re.test(name)) return { ok: true, reason: `name says “${w.word}”` };
  for (const w of list) if (w.re.test(types)) return { ok: true, reason: `Google type says “${w.word}”` };
  for (const w of list) if (w.host.test(host)) return { ok: true, reason: `website ${host} says “${w.word}”` };
  return { ok: false, reason: `no ${list.map((w) => w.word).join(", ")} in its name, Google types or website` };
}

/** The kind of place, plural, for the query — or null when there's nothing
 * specific (only generic Google types and no usable niche). */
export function competitorQueryNoun(subject: { nicheId?: string | null; nicheLabelEn?: string | null; nicheParent?: string | null; primaryType?: string | null }): string | null {
  const own = subject.nicheId ? NICHE_QUERY_NOUN[subject.nicheId] : undefined;
  if (own) return own;
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
export function competitorTextQuery(subject: { nicheId?: string | null; nicheLabelEn?: string | null; nicheParent?: string | null; primaryType?: string | null; address?: string | null }): string | null {
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
