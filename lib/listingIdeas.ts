// Section 5 "Show up for more searches": the top listing improvements from
// the business's real data, ranked by impact — missing services people
// search for, a thin description, an upcoming holiday without hours, no
// recent posts or photos, missing customer details, messaging off, a
// second category, Google booking not counted. Never a sample when real
// data exists; "nothing to add" only when every check passes. Pure.

import type { Keyword } from "@/lib/gbpInsights";
import { looseMatch, specialFor, upcomingHolidays, type HolidayId, type SpecialHourPeriod } from "@/lib/gbpListingFields";
import { isFresh, monthsAgo } from "@/lib/gbpMediaPosts";

/** The business types with their own search-term → service maps. */
export type IdeaType = "hair" | "barber" | "nails" | "restaurant" | "art" | "home";
export const COVERED_TYPES: readonly IdeaType[] = ["hair", "barber", "nails", "restaurant", "art", "home"];

const RESTAURANT_NICHES = new Set([
  "restaurant", "pizza", "burgers", "chicken_wings", "sandwiches", "deli", "mexican", "latin_american", "caribbean", "chinese", "japanese_sushi", "korean", "thai", "vietnamese", "indian", "noodles_ramen", "italian", "mediterranean", "greek", "american_diner", "breakfast_brunch", "bbq", "seafood", "steakhouse", "vegan", "salad_bowls", "fast_food", "food_truck", "food_hall", "catering", "cafe", "bar", "sports_bar", "wine_bar", "brewery",
]);
const HOME_NICHES = new Set(["plumber", "electrician", "hvac", "roofing", "handyman", "painting_contractor", "general_contractor", "pest_control", "movers", "junk_removal", "garage_door", "pool_service", "lawn_care", "landscaping", "snow_removal", "cleaning_service", "commercial_cleaning", "carpet_cleaning", "locksmith"]);

/** The business's idea type from its niche (or its Google category). */
export function ideaTypeOf(nicheId: string | null | undefined, categories: string[] = []): IdeaType | null {
  const n = nicheId ?? "";
  if (n === "hair_salon" || n === "blowout_bar" || n === "braiding") return "hair";
  if (n === "barbershop") return "barber";
  if (n === "nail_salon") return "nails";
  if (n === "art_classes") return "art";
  if (RESTAURANT_NICHES.has(n)) return "restaurant";
  if (HOME_NICHES.has(n)) return "home";
  const c = categories.join(" ").toLowerCase();
  if (/barber/.test(c)) return "barber";
  if (/hair/.test(c)) return "hair";
  if (/nail/.test(c)) return "nails";
  if (/pottery|ceramic|art school|art studio/.test(c)) return "art";
  if (/restaurant|cafe|bar\b|pizz|diner/.test(c)) return "restaurant";
  if (/plumb|electric|hvac|roof|contractor|clean|landscap|handyman|locksmith/.test(c)) return "home";
  return null;
}

/** Words in a search → the service it means. */
const SERVICE_MAP: Record<IdeaType, Array<[string[], string]>> = {
  hair: [
    [["balayage"], "Balayage"],
    [["highlight"], "Highlights"],
    [["color", "colour", "dye"], "Hair coloring"],
    [["keratin"], "Keratin treatment"],
    [["blowout", "blow dry"], "Blowout"],
    [["extension"], "Hair extensions"],
    [["silk press"], "Silk press"],
    [["braid"], "Braids"],
    [["perm"], "Perm"],
    [["bridal", "wedding", "updo"], "Bridal hair"],
    [["men's haircut", "mens haircut", "men haircut"], "Men's haircut"],
    [["kids haircut", "children haircut"], "Kids' haircut"],
  ],
  barber: [
    [["fade"], "Fade"],
    [["beard"], "Beard trim"],
    [["shave"], "Hot towel shave"],
    [["line up", "lineup"], "Line up"],
    [["kids haircut", "kid haircut"], "Kids' haircut"],
  ],
  nails: [
    [["gel"], "Gel manicure"],
    [["acrylic"], "Acrylic nails"],
    [["dip"], "Dip powder nails"],
    [["pedicure"], "Pedicure"],
    [["manicure"], "Manicure"],
    [["nail art"], "Nail art"],
    [["wax"], "Waxing"],
  ],
  restaurant: [
    [["catering"], "Catering"],
    [["delivery"], "Delivery"],
    [["takeout", "take out"], "Takeout"],
    [["brunch"], "Brunch"],
    [["private event", "private party", "party room"], "Private events"],
    [["happy hour"], "Happy hour"],
    [["gluten free", "gluten-free"], "Gluten-free options"],
    [["vegan", "vegetarian"], "Vegan options"],
  ],
  art: [
    [["pottery class", "ceramics class", "pottery classes"], "Pottery classes"],
    [["wheel"], "Wheel throwing class"],
    [["paint your own", "paint-your-own"], "Paint your own pottery"],
    [["kids", "children"], "Kids' classes"],
    [["birthday"], "Birthday parties"],
    [["date night"], "Date night class"],
    [["team building", "corporate"], "Team building events"],
    [["open studio"], "Open studio"],
  ],
  home: [
    [["emergency"], "Emergency service"],
    [["24 hour", "24/7", "24 hr"], "24/7 service"],
    [["repair"], "Repairs"],
    [["install"], "Installation"],
    [["inspection"], "Inspection"],
    [["maintenance", "tune up", "tune-up"], "Maintenance"],
    [["estimate", "quote"], "Free estimates"],
  ],
};

/** Words in a search → a related Google category (only offered with exactly one). */
const CATEGORY_MAP: Record<IdeaType, Array<[string[], string]>> = {
  hair: [
    [["barber"], "Barber shop"],
    [["nail"], "Nail salon"],
    [["lash", "brow"], "Eyelash salon"],
    [["wax"], "Waxing hair removal service"],
    [["blowout", "blow dry"], "Blow dry bar"],
  ],
  barber: [[["hair salon"], "Hair salon"]],
  nails: [
    [["spa"], "Day spa"],
    [["lash", "brow"], "Eyelash salon"],
  ],
  restaurant: [
    [["pizza"], "Pizza restaurant"],
    [["bar"], "Bar"],
    [["catering", "caterer"], "Caterer"],
    [["brunch"], "Brunch restaurant"],
  ],
  art: [
    [["pottery"], "Pottery classes"],
    [["art class", "painting class"], "Art school"],
  ],
  home: [],
};

const has = (term: string, word: string) => new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`, "i").test(term);

/** Search terms summed over the stored months, as a monthly average. */
export function monthlyTerms(months: Array<{ topKeywords?: Keyword[] | null }>): Keyword[] {
  const withTerms = months.filter((m) => (m.topKeywords ?? []).length > 0);
  if (withTerms.length === 0) return [];
  const sum = new Map<string, number>();
  for (const m of withTerms) for (const k of m.topKeywords ?? []) sum.set(k.term.toLowerCase(), (sum.get(k.term.toLowerCase()) ?? 0) + k.count);
  return Array.from(sum, ([term, total]) => ({ term, count: Math.round(total / withTerms.length) })).sort((a, b) => b.count - a.count);
}

export interface MissingService {
  service: string;
  terms: string[];
  searches: number;
}

/** Services people search for that aren't on the listing (loose match). */
export function missingServices(type: IdeaType | null, terms: Keyword[], services: string[]): MissingService[] {
  if (!type) return [];
  const out = new Map<string, MissingService>();
  for (const k of terms) {
    for (const [words, service] of SERVICE_MAP[type]) {
      if (!words.some((w) => has(k.term, w))) continue;
      if (services.some((s) => looseMatch(service, s) || looseMatch(s, service) || words.some((w) => looseMatch(w, s)))) continue;
      const m = out.get(service) ?? { service, terms: [], searches: 0 };
      if (!m.terms.includes(k.term)) m.terms.push(k.term);
      m.searches += k.count;
      out.set(service, m);
      break;
    }
  }
  return Array.from(out.values()).sort((a, b) => b.searches - a.searches);
}

export function relatedCategory(type: IdeaType | null, terms: Keyword[], categories: string[]): { category: string; terms: string[]; searches: number } | null {
  if (!type || categories.length !== 1) return null;
  let best: { category: string; terms: string[]; searches: number } | null = null;
  for (const [words, category] of CATEGORY_MAP[type]) {
    if (looseMatch(category, categories[0])) continue;
    const hits = terms.filter((k) => words.some((w) => has(k.term, w)));
    const searches = hits.reduce((s, k) => s + k.count, 0);
    if (searches > 0 && (!best || searches > best.searches)) best = { category, terms: hits.map((k) => k.term), searches };
  }
  return best;
}

/** What to post about, by type (a real topic, not "post something"). */
export const POST_TOPIC: Record<IdeaType | "default", string> = { hair: "hair", barber: "barber", nails: "nails", restaurant: "restaurant", art: "art", home: "home", default: "default" };

export type IdeaAction = { kind: "editor"; hash: string } | { kind: "link"; href: string; external?: boolean };

export type Idea =
  | { id: "services"; missing: MissingService[]; searches: number; action: IdeaAction }
  | { id: "description"; length: number; text: string; action: IdeaAction }
  | { id: "holiday"; holiday: HolidayId; date: string; daysAway: number; action: IdeaAction }
  | { id: "posts"; topic: string; action: IdeaAction }
  | { id: "photos"; monthsOld: number | null; action: IdeaAction }
  | { id: "details"; missing: Array<"parking" | "accessibility">; action: IdeaAction }
  | { id: "messaging"; action: IdeaAction }
  | { id: "extras"; names: string[]; action: IdeaAction }
  | { id: "category"; category: string; terms: string[]; searches: number; action: IdeaAction }
  | { id: "booking"; provider: string; action: IdeaAction };

export interface IdeaInputs {
  businessId: string;
  now: number;
  type: IdeaType | null;
  /** Stored months (search terms). */
  months: Array<{ topKeywords?: Keyword[] | null }>;
  /** The real listing (null: the read failed — those checks are skipped, never guessed). */
  listing: { services: string[]; categories: string[]; description: string | null; specialPeriods: SpecialHourPeriod[]; attributeIds: string[] | null; details?: { payment: boolean; parking: boolean; accessibility: boolean; suggest: Array<{ id: string; label: string }> } | null } | null;
  photos: { count: number; newestAt: string | null } | null;
  posts: { last30: number } | null;
  messagingOn: boolean | null;
  /** Case B: a partner booking link Google doesn't count. */
  bookingTurnOn: { provider: string } | null;
}

export const THIN_DESCRIPTION = 250;
export const MAX_IDEAS = 5;
const DAY = 86_400_000;

/** Known impact, for ideas without a search count (higher first). */
const IMPACT: Record<Idea["id"], number> = { booking: 60, photos: 50, description: 45, holiday: 40, details: 35, posts: 30, extras: 25, messaging: 20, services: 0, category: 0 };

function score(i: Idea): number {
  if (i.id === "holiday" && i.daysAway <= 14) return 1e6;
  if (i.id === "services" || i.id === "category") return 100 + i.searches;
  return IMPACT[i.id];
}

/** Every idea the data supports, best first. */
export function listingIdeas(input: IdeaInputs): Idea[] {
  const terms = monthlyTerms(input.months);
  const ideas: Idea[] = [];
  const l = input.listing;
  if (l) {
    const missing = missingServices(input.type, terms, l.services);
    if (missing.length > 0) ideas.push({ id: "services", missing: missing.slice(0, 3), searches: missing.reduce((s, m) => s + m.searches, 0), action: { kind: "editor", hash: `#edit-services?add=${missing.slice(0, 3).map((m) => encodeURIComponent(m.service)).join(",")}` } });
    const text = (l.description ?? "").trim();
    if (text.length < THIN_DESCRIPTION) ideas.push({ id: "description", length: text.length, text, action: { kind: "editor", hash: "#edit-description" } });
    const today = Date.UTC(new Date(input.now).getUTCFullYear(), new Date(input.now).getUTCMonth(), new Date(input.now).getUTCDate());
    const unset = upcomingHolidays(new Date(input.now)).find((h) => !specialFor(l.specialPeriods, h.date));
    if (unset) {
      const at = Date.UTC(unset.date.year, unset.date.month - 1, unset.date.day);
      ideas.push({ id: "holiday", holiday: unset.id, date: `${unset.date.year}-${String(unset.date.month).padStart(2, "0")}-${String(unset.date.day).padStart(2, "0")}`, daysAway: Math.round((at - today) / DAY), action: { kind: "editor", hash: "#edit-holiday" } });
    }
    if (l.attributeIds && input.type && input.type !== "home") {
      const ids = l.attributeIds.join(" ").toLowerCase();
      const miss: Array<"parking" | "accessibility"> = [];
      if (!/parking/.test(ids)) miss.push("parking");
      if (!/wheelchair/.test(ids)) miss.push("accessibility");
      if (miss.length > 0) ideas.push({ id: "details", missing: miss, action: { kind: "editor", hash: "#edit-customer-details" } });
    }
    // The scored groups are complete: the extras customers ask about (suggestions, no points; never owner identity).
    const d = l.details;
    if (d && d.payment && d.parking && d.accessibility && d.suggest.length > 0) ideas.push({ id: "extras", names: d.suggest.slice(0, 3).map((s) => s.label), action: { kind: "editor", hash: "#edit-customer-details" } });
    const cat = relatedCategory(input.type, terms, l.categories);
    if (cat) ideas.push({ id: "category", ...cat, action: { kind: "link", href: "https://business.google.com/", external: true } });
  }
  if (input.posts && input.posts.last30 === 0) ideas.push({ id: "posts", topic: POST_TOPIC[input.type ?? "default"], action: { kind: "editor", hash: "#google-tab-this-week" } });
  if (input.photos && (input.photos.count === 0 || !input.photos.newestAt || !isFresh(input.photos.newestAt, input.now)))
    ideas.push({ id: "photos", monthsOld: input.photos.newestAt ? monthsAgo(input.photos.newestAt, input.now) : null, action: { kind: "editor", hash: "#edit-photos" } });
  if (input.messagingOn === false) ideas.push({ id: "messaging", action: { kind: "editor", hash: "#edit-messaging" } });
  if (input.bookingTurnOn) ideas.push({ id: "booking", provider: input.bookingTurnOn.provider, action: { kind: "editor", hash: "#edit-booking-steps" } });
  return ideas.map((i, k) => ({ i, k, s: score(i) })).sort((a, b) => b.s - a.s || a.k - b.k).map((x) => x.i);
}

/** Ideas the owner finished from PostScore since the last scan: "Done ✓"
 * until the next scan reads the listing again. */
export function doneSinceScan(made: Array<{ kind: string; status: string; at: string }>, lastScanAt: string | null): Array<Idea["id"]> {
  const map: Record<string, Idea["id"]> = { services: "services", holiday_hours: "holiday", description: "description", customer_details: "details" };
  const out: Array<Idea["id"]> = [];
  for (const m of made) {
    const id = map[m.kind];
    if (!id || m.status === "failed" || m.status === "undone" || (lastScanAt && m.at <= lastScanAt) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** The services the "Add services" editor starts with, from "#edit-services?add=A,B". */
export function prefillFromHash(hash: string): string[] {
  const q = hash.split("?")[1] ?? "";
  const add = new URLSearchParams(q).get("add");
  return add ? add.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
}
