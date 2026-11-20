// Day 23E: service names spelled right before anything is published. A
// word in a post, a service name or the owner's own price list that looks
// like a typo of a common service name ("baylage" → "balayage") or of one
// the listing already has gets "Did you mean 'balayage'?" with a one-click
// fix — never changed silently, and never published until the owner fixes
// it or says to keep it. Pure.

/** Common service names (EN + ES), lowercase, the words that get misspelled. */
export const SERVICE_DICTIONARY: readonly string[] = [
  // Hair
  "balayage", "highlights", "lowlights", "ombre", "babylights", "keratin", "brazilian", "blowout", "blowouts", "blowdry", "haircut", "haircuts", "coloring", "colouring", "gloss", "glaze", "glazing", "glossing",
  "straightening", "extensions", "updo", "updos", "perm", "perms", "relaxer", "toner", "bleach", "trim", "bangs", "braids", "braiding", "cornrows", "twists", "locs", "dreadlocks", "weave", "silk press", "hydration", "treatment", "treatments", "styling", "hairstyling",
  // Barber
  "fade", "fades", "taper", "lineup", "shave", "beard", "pompadour", "undercut", "buzzcut",
  // Nails, beauty, spa
  "manicure", "manicures", "pedicure", "pedicures", "acrylic", "acrylics", "shellac", "gel", "dip powder", "nail art", "eyebrow", "eyebrows", "threading", "waxing", "brazilian wax", "facial", "facials", "microblading", "microneedling", "lash", "lashes", "eyelash", "lamination", "tinting", "massage", "massages", "aromatherapy", "exfoliation", "dermaplaning", "microdermabrasion", "makeup",
  // ES
  "peinado", "peinados", "tinte", "mechas", "alisado", "uñas", "manicura", "pedicura", "depilación", "pestañas", "cejas", "masaje", "corte", "cortes", "tratamiento", "tratamientos", "coloración", "extensiones", "trenzas", "maquillaje",
  // Food, home and other trades
  "appetizers", "entrees", "dessert", "desserts", "brunch", "catering", "espresso", "cappuccino", "croissant", "remodeling", "plumbing", "roofing", "landscaping", "painting", "drywall", "flooring", "installation", "inspection", "detailing", "upholstery", "tutoring", "workshop", "pottery", "ceramics",
];

/** Edit distance with adjacent swaps (Damerau–Levenshtein, optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

/** Everyday words that sit close to a service name and must never be flagged. */
const COMMON = new Set(["message", "messages", "massive", "passage", "village", "average", "package", "storage", "manager", "perfect", "permit", "person", "result", "results", "special", "beautiful", "balance", "balanced", "colors", "colored", "colorful", "glazed", "braided", "shaved", "faded", "styles", "styled", "stylist", "stylists", "treat", "treats", "treated", "facility", "family", "lasting", "lashed", "trimmed", "highlight", "highlighted"]);

const WORD = /[A-Za-zÁÉÍÓÚÑÜáéíóúñü]{5,}/g;

/** Words the business itself uses for its services (6+ letters, lowercase). */
export function vocabularyOf(names: string[]): string[] {
  return Array.from(new Set(names.flatMap((n) => n.toLowerCase().match(/[a-záéíóúñü]{5,}/g) ?? [])));
}

/** How far a word may be from a service name: 1 edit for short words, 2 from 7 letters, 3 from 7 when the first two letters match. */
function close(w: string, v: string): boolean {
  if (w === v || w[0] !== v[0] || Math.abs(w.length - v.length) > 2) return false;
  // A plural or another ending of the same word is fine ("highlight" / "highlights", "glaze" / "glazed").
  const ending = (long: string, short: string) => long.startsWith(short) && /^(s|es|d|ed|ing|r|er)$/.test(long.slice(short.length));
  if (ending(w, v) || ending(v, w) || ending(w, v.replace(/e$/, "")) || ending(v, w.replace(/e$/, ""))) return false;
  const dist = editDistance(w, v);
  if (w.length < 7) return dist <= 1;
  return dist <= 2 || (dist === 3 && w.slice(0, 2) === v.slice(0, 2));
}

export interface SpellingFlag {
  /** The word as written. */
  word: string;
  /** The suggested spelling, in the same case style. */
  suggestion: string;
}

/** Likely typos of service names: "baylage" → "balayage". Only service
 * NAMES are checked — a list of names (the services being added, the price
 * list), or, in running text (`prose`: a post or description), only the
 * words the business's own service names / price list misspell. The
 * listing's own spellings and the words the owner chose to keep are never flagged. */
export function spellingFlags(text: string, opts: { services?: string[]; keep?: string[]; prose?: boolean; ownerTerms?: string[] } = {}): SpellingFlag[] {
  const own = vocabularyOf(opts.services ?? []);
  // Running text: words the owner's own price list misspells are checked like service names (they're where "baylage" comes from).
  const ownerTypos = new Set(opts.prose ? spellingFlags((opts.ownerTerms ?? []).join(" · "), { services: opts.services, keep: opts.keep }).map((f) => f.word.toLowerCase()) : []);
  const vocab = Array.from(new Set([...SERVICE_DICTIONARY.filter((w) => !w.includes(" ")), ...own]));
  const known = new Set([...vocab, ...(opts.keep ?? []).map((k) => k.toLowerCase())]);
  const out: SpellingFlag[] = [];
  for (const word of text.match(WORD) ?? []) {
    const w = word.toLowerCase();
    if (known.has(w) || COMMON.has(w) || out.some((f) => f.word.toLowerCase() === w)) continue;
    // Running text: only the business's own misspelled service names ("baylage" from its price list) —
    // never ordinary words ("tones" isn't a typo of "toner").
    if (opts.prose && !ownerTypos.has(w)) continue;
    const hit = vocab.find((v) => close(w, v));
    if (hit) out.push({ word, suggestion: word[0] === word[0].toUpperCase() ? hit[0].toUpperCase() + hit.slice(1) : hit });
  }
  return out;
}

/** The one-click fix: every whole-word `word` → `suggestion`. */
export function applySpellingFix(text: string, flag: SpellingFlag): string {
  const esc = flag.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![\\p{L}])${esc}(?![\\p{L}])`, "giu"), (m) => (m[0] === m[0].toUpperCase() ? flag.suggestion[0].toUpperCase() + flag.suggestion.slice(1) : flag.suggestion.toLowerCase()));
}
