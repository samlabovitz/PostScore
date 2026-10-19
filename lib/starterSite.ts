// Pure builder for the Website page's starter-site generator: takes
// real, already-saved Google data plus a few owner customizations
// (tagline — with its own font/color/size/placement, which sections to
// show, a color theme with an optional accent override, a font
// pairing) and returns a complete, self-contained HTML document as a
// string. No DOM, no network, no randomness — the exact same input
// always produces the exact same file, so the live preview (an iframe
// srcDoc) and the downloaded file are always identical.
//
// Nothing here is fabricated: every fact on the page is either a real
// field from the saved business or text the owner typed themselves
// (the tagline). A field the owner chooses to hide, or that was never
// on file, is simply omitted — never replaced with a placeholder that
// could be mistaken for real information. Color/font/tagline styling
// are pure presentation choices with no bearing on what's shown.
//
// The generated site's own fixed text (CTAs, section headings, footer,
// <html lang>) follows `locale` on StarterSiteInput — the site's own
// "Site language" choice (StarterSiteBuilder.tsx), independent of the
// dashboard's own UI locale. Hours specifically prefer the real
// structured openingHoursPeriods, formatted via lib/hours.ts, when the
// site language is Spanish; the plain openingHours weekday-description
// lines (always English, from Google) are the fallback whenever the
// structured data can't honestly produce a Spanish line.

import { t, tPlural, type Locale } from "./i18n";
import { formatOpeningHours } from "./hours";
import type { OpeningHoursPeriod } from "./google/places";
import { appointmentOnlyLabel, hoursRows, openingHoursSpecification, ownerHoursFromGoogle, type OwnerHours } from "./ownerHours";
import { starRowCss, starRowHtml } from "./starRating";
import { contrastRatio, mix, readableOn, readableOnAll, textOn } from "./color";
import { priceLevelToSymbol } from "./priceLevel";
import { businessIcon, dividerSvg, headingShapeCss, iconSvg, patternCss, safeAccentStyle, type AccentStyle, type IconName } from "./starterSiteArt";
import { hoursScript, hoursSummary } from "./starterSiteHours";

export type { AccentStyle } from "./starterSiteArt";

/**
 * A curated color theme: a hero background and its text color, an accent
 * used for buttons/links/decorations, and a page background with matching
 * card/text tones. A closed set rather than a free-form picker for the
 * base palette — the accent alone can be fine-tuned (customAccent on
 * StarterSiteInput). Readability never depends on the pick: every text
 * color the page uses is checked against the background it sits on and
 * nudged until it reads at WCAG AA (lib/color.ts), so a light theme or a
 * bright custom accent can't produce unreadable text.
 */
export type StarterSiteThemeGroup = "classic" | "bold" | "light" | "earthy";

export const STARTER_SITE_THEME_GROUPS: StarterSiteThemeGroup[] = ["classic", "bold", "light", "earthy"];

export interface StarterSiteTheme {
  id: string;
  label: string;
  group: StarterSiteThemeGroup;
  heroBg: string;
  /** Text on the hero (white on the dark themes). */
  heroText: string;
  accent: string;
  pageBg: string;
  cardBorder: string;
  /** Headings and strong text on the page. */
  ink: string;
  textSoft: string;
  textMute: string;
}

const dark = (t: Omit<StarterSiteTheme, "heroText" | "ink">): StarterSiteTheme => ({ ...t, heroText: "#ffffff", ink: t.heroBg });

export const STARTER_SITE_THEMES: StarterSiteTheme[] = [
  dark({ id: "ink", label: "Ink & Brass", group: "classic", heroBg: "#14243f", accent: "#b8862f", pageBg: "#f5f1e8", cardBorder: "#eae4d5", textSoft: "#3a4a66", textMute: "#6b7890" }),
  dark({ id: "terracotta", label: "Terracotta & Clay", group: "earthy", heroBg: "#5c3a2e", accent: "#c17a3f", pageBg: "#f7efe6", cardBorder: "#ecdfd0", textSoft: "#6b4a3a", textMute: "#8a6f5f" }),
  dark({ id: "forest", label: "Forest & Gold", group: "earthy", heroBg: "#24352a", accent: "#b98f3e", pageBg: "#f4f3ea", cardBorder: "#e2e0d0", textSoft: "#3f5142", textMute: "#6b7a6a" }),
  dark({ id: "slate", label: "Slate & Coral", group: "classic", heroBg: "#2b3440", accent: "#d97a56", pageBg: "#f2f4f6", cardBorder: "#dde3e8", textSoft: "#445162", textMute: "#6f7c8c" }),
  dark({ id: "plum", label: "Plum & Rose Gold", group: "bold", heroBg: "#3a2440", accent: "#c98a5e", pageBg: "#f7f0ee", cardBorder: "#ecdfdc", textSoft: "#5c4258", textMute: "#83717f" }),
  dark({ id: "teal", label: "Midnight Teal", group: "bold", heroBg: "#0e2b2c", accent: "#2f9c8f", pageBg: "#eff5f4", cardBorder: "#d9e6e4", textSoft: "#2d4644", textMute: "#5c7371" }),
  dark({ id: "crimson", label: "Crimson & Charcoal", group: "bold", heroBg: "#1f1b1b", accent: "#b8382f", pageBg: "#f3f1ef", cardBorder: "#e3ded9", textSoft: "#4a413d", textMute: "#7a716c" }),
  dark({ id: "ocean", label: "Ocean & Sand", group: "classic", heroBg: "#1a3b4a", accent: "#d4a24c", pageBg: "#f6f2e8", cardBorder: "#e8ddc8", textSoft: "#35525f", textMute: "#62808c" }),
  dark({ id: "berry", label: "Berry & Cream", group: "bold", heroBg: "#45213a", accent: "#cf9a56", pageBg: "#f8f1ec", cardBorder: "#ecdfd5", textSoft: "#5e3a52", textMute: "#85677c" }),
  dark({ id: "graphite", label: "Graphite & Lime", group: "classic", heroBg: "#1c1f1a", accent: "#7a9c3f", pageBg: "#f4f5f0", cardBorder: "#e0e3d8", textSoft: "#3c4636", textMute: "#6a7462" }),
  dark({ id: "cobalt", label: "Cobalt & Citrus", group: "bold", heroBg: "#162a6b", accent: "#e8b931", pageBg: "#f3f5fb", cardBorder: "#dde3f2", textSoft: "#36467a", textMute: "#5f6b91" }),
  dark({ id: "emerald", label: "Emerald & Blush", group: "bold", heroBg: "#0f3d2e", accent: "#e59a8c", pageBg: "#f3f6f2", cardBorder: "#dce6df", textSoft: "#2f5546", textMute: "#5a7468" }),
  dark({ id: "olive", label: "Olive & Rust", group: "earthy", heroBg: "#3b3d23", accent: "#b5562b", pageBg: "#f5f3e9", cardBorder: "#e5e1cf", textSoft: "#4d4f35", textMute: "#6f705a" }),
  dark({ id: "espresso", label: "Espresso & Cream", group: "earthy", heroBg: "#2e2019", accent: "#c99a62", pageBg: "#f7f1e8", cardBorder: "#eadfce", textSoft: "#55433a", textMute: "#7a685d" }),
  { id: "sage", label: "Sage & Cream", group: "light", heroBg: "#dfe8d9", heroText: "#1f3326", accent: "#4f7a55", pageBg: "#f8f6ee", cardBorder: "#e3e5d8", ink: "#1f3326", textSoft: "#3d5244", textMute: "#5e6e60" },
  { id: "blush", label: "Blush & Charcoal", group: "light", heroBg: "#f4e1dd", heroText: "#2a2526", accent: "#b0505f", pageBg: "#fcf7f5", cardBorder: "#efe1dd", ink: "#2a2526", textSoft: "#4d4446", textMute: "#6e6466" },
  { id: "sky", label: "Sky & Navy", group: "light", heroBg: "#dcebf7", heroText: "#15294a", accent: "#1f5fa8", pageBg: "#f5f9fd", cardBorder: "#dbe6f0", ink: "#15294a", textSoft: "#34486a", textMute: "#5a6b85" },
  { id: "sand", label: "Sand & Terracotta", group: "light", heroBg: "#f0e3cd", heroText: "#3b2a1e", accent: "#b4532e", pageBg: "#fbf6ed", cardBorder: "#ece0cb", ink: "#3b2a1e", textSoft: "#5b4636", textMute: "#7a6553" },
];

const DEFAULT_THEME = STARTER_SITE_THEMES[0];

export function getStarterSiteTheme(id: string): StarterSiteTheme {
  return STARTER_SITE_THEMES.find((t) => t.id === id) ?? DEFAULT_THEME;
}

/** A real Google Font family plus the specific weights this site
 * requests and the full CSS font-family value (with realistic
 * fallbacks) to render it. Never a free-text font name — every choice
 * here is guaranteed to actually exist on Google Fonts and load. */
export interface GoogleFontSpec {
  /** Google Fonts family name, e.g. "Fraunces". */
  family: string;
  /** The wght@ axis value(s) this site needs, e.g. "600;700". */
  weights: string;
  /** Full CSS font-family value with fallbacks, e.g. "'Fraunces', Georgia, serif". */
  cssFamily: string;
}

/** A curated heading/body font pairing spanning clean sans, warm
 * serif, modern/geometric, and characterful display styles. */
export interface StarterSiteFont {
  id: string;
  label: string;
  heading: GoogleFontSpec;
  body: GoogleFontSpec;
}

export const STARTER_SITE_FONTS: StarterSiteFont[] = [
  {
    id: "classic",
    label: "Classic — warm serif + clean sans",
    heading: { family: "Fraunces", weights: "600;700", cssFamily: "'Fraunces', Georgia, 'Times New Roman', serif" },
    body: { family: "Inter", weights: "400;500;600", cssFamily: "'Inter', Arial, Helvetica, sans-serif" },
  },
  {
    id: "modern",
    label: "Modern — bold sans pairing",
    heading: { family: "Manrope", weights: "700;800", cssFamily: "'Manrope', Arial, Helvetica, sans-serif" },
    body: { family: "Inter", weights: "400;500;600", cssFamily: "'Inter', Arial, Helvetica, sans-serif" },
  },
  {
    id: "elegant",
    label: "Elegant — upscale serif",
    heading: {
      family: "Playfair Display",
      weights: "700;800",
      cssFamily: "'Playfair Display', Georgia, 'Times New Roman', serif",
    },
    body: { family: "Lora", weights: "400;500;600", cssFamily: "'Lora', Georgia, serif" },
  },
  {
    id: "friendly",
    label: "Friendly — rounded, warm",
    heading: { family: "Quicksand", weights: "600;700", cssFamily: "'Quicksand', Arial, Helvetica, sans-serif" },
    body: { family: "Nunito", weights: "400;600;700", cssFamily: "'Nunito', Arial, Helvetica, sans-serif" },
  },
  {
    id: "minimal",
    label: "Minimal — single clean sans",
    heading: { family: "Work Sans", weights: "600;700", cssFamily: "'Work Sans', Arial, Helvetica, sans-serif" },
    body: { family: "Work Sans", weights: "400;500", cssFamily: "'Work Sans', Arial, Helvetica, sans-serif" },
  },
  {
    id: "editorial",
    label: "Editorial — literary serif",
    heading: { family: "Crimson Pro", weights: "600;700", cssFamily: "'Crimson Pro', Georgia, serif" },
    body: {
      family: "Source Sans 3",
      weights: "400;500;600",
      cssFamily: "'Source Sans 3', Arial, Helvetica, sans-serif",
    },
  },
  {
    id: "geometric",
    label: "Geometric — modern display",
    heading: {
      family: "Space Grotesk",
      weights: "500;700",
      cssFamily: "'Space Grotesk', Arial, Helvetica, sans-serif",
    },
    body: { family: "Inter", weights: "400;500;600", cssFamily: "'Inter', Arial, Helvetica, sans-serif" },
  },
  {
    id: "grotesk",
    label: "Grotesk — bold Swiss sans",
    heading: { family: "Archivo", weights: "900", cssFamily: "'Archivo', Arial, Helvetica, sans-serif" },
    body: { family: "Archivo", weights: "400;500", cssFamily: "'Archivo', Arial, Helvetica, sans-serif" },
  },
  {
    id: "statement",
    label: "Statement — bold condensed display",
    heading: { family: "Bebas Neue", weights: "400", cssFamily: "'Bebas Neue', Arial, Helvetica, sans-serif" },
    body: { family: "Inter", weights: "400;500;600", cssFamily: "'Inter', Arial, Helvetica, sans-serif" },
  },
  {
    id: "vintage",
    label: "Vintage — high-contrast display",
    heading: { family: "Abril Fatface", weights: "400", cssFamily: "'Abril Fatface', Georgia, serif" },
    body: {
      family: "Nunito Sans",
      weights: "400;600;700",
      cssFamily: "'Nunito Sans', Arial, Helvetica, sans-serif",
    },
  },
];

const DEFAULT_FONT = STARTER_SITE_FONTS[0];

export function getStarterSiteFont(id: string): StarterSiteFont {
  return STARTER_SITE_FONTS.find((f) => f.id === id) ?? DEFAULT_FONT;
}

/** Builds one combined Google Fonts stylesheet URL for exactly the
 * families actually in use (deduplicated by family name) — never more
 * than what this specific document needs, and never less. */
function buildGoogleFontsHref(specs: GoogleFontSpec[]): string {
  const seen = new Map<string, string>();
  for (const spec of specs) {
    if (!seen.has(spec.family)) seen.set(spec.family, spec.weights);
  }
  const familyParams = Array.from(seen.entries())
    .map(([family, weights]) => `family=${family.replace(/ /g, "+")}:wght@${weights}`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${familyParams}&display=swap`;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** Only ever trusts a real 6-digit hex color; anything else (an empty
 * string, a stray value) falls back honestly instead of producing
 * broken CSS. */
function safeHexColor(value: string | null, fallback: string): string {
  return value && HEX_COLOR_RE.test(value) ? value : fallback;
}

export type TaglineSize = "small" | "medium" | "large";
export type TaglinePlacement = "above" | "below";

const TAGLINE_SIZE_PX: Record<TaglineSize, number> = {
  small: 15,
  medium: 17,
  large: 22,
};

/** Which action a customer would actually take, phrased for how this
 * kind of business really gets used — an appointment business gets
 * "booked," a restaurant gets "ordered," a legal practice gets a
 * "consultation." Always a real phone call; never a fabricated online
 * booking link this app doesn't actually have. */
/** Grouped by which of config/bizProfiles.ts's five content profiles each
 * business type id resolves to (see BUSINESS_TYPE_OPTIONS there) — a
 * narrow type like "barbershop" reuses the salon content profile's whole
 * approach to running the business, so it gets the same "Call to book"
 * verb a plain "salon" would. Anything not listed (retail, trades, and
 * other types that reuse the general default content) falls through to
 * "Call us," same as an unrecognized id. */
const BOOK_VERB_IDS = new Set([
  "salon",
  "barbershop",
  "spa",
  "nail_salon",
  "practitioner",
  "gym_fitness",
  "accountant",
  "real_estate",
  "consultant",
  "coach",
  "tutor_education",
  "photographer",
  // Day 2 new types: each is a booked-date/reservation business (a
  // time slot, an event date, a tour, a stay) in the same sense as the
  // appointment-based types above — home_services/repair_dropoff/
  // car_wash_detailing stay off this list on purpose, matching how
  // "trades"/"auto_repair" already fall through to the "Call us"
  // default rather than "Call to book" for a walk-in-style service.
  "recreation",
  "events",
  "childcare",
  "lodging",
]);
const ORDER_VERB_IDS = new Set(["restaurant", "cafe", "bar", "bakery", "liquor_store", "grocery_market"]);
const CONSULTATION_VERB_IDS = new Set(["lawyer", "dentist", "medical_clinic", "tattoo_body_art"]);

function ctaVerb(profileId: string, locale: Locale): string {
  if (BOOK_VERB_IDS.has(profileId)) return t(locale, "starterSite.ctaBook");
  if (ORDER_VERB_IDS.has(profileId)) return t(locale, "starterSite.ctaOrder");
  if (CONSULTATION_VERB_IDS.has(profileId)) return t(locale, "starterSite.ctaConsultation");
  return t(locale, "starterSite.ctaCallUs");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** tel: hrefs need a bare digit/plus string — the visible label keeps
 * the original formatted number. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export interface StarterSiteInput {
  /** The generated site's own language — independent of the dashboard's
   * UI locale. Controls every fixed string in the output (CTAs, section
   * headings, footer, <html lang>) and which of openingHours /
   * openingHoursPeriods is preferred for the Hours section. */
  locale: Locale;
  businessName: string;
  /** The business's real Google category display name, e.g. "Hair Salon". */
  category: string | null;
  /** Owner-written, optional — never invented on their behalf. */
  tagline: string;
  /** One of STARTER_SITE_FONTS' ids — the tagline uses that pairing's
   * heading font, independent of the main fontId below. */
  taglineFontId: string;
  /** A real 6-digit hex, or null to use a theme-appropriate default. */
  taglineColor: string | null;
  taglineSize: TaglineSize;
  taglinePlacement: TaglinePlacement;
  phone: string | null;
  address: string | null;
  openingHours: string[] | null;
  /** Google's structured regularOpeningHours.periods (see
   * lib/google/places.ts) — preferred over the plain openingHours lines
   * above whenever `locale` is "es" and lib/hours.ts's
   * formatOpeningHours() can honestly produce Spanish lines from it;
   * null falls back to openingHours exactly as before. */
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  /** Hours the owner entered for the website (lib/ownerHours.ts) — used
   * instead of Google's when set. Website only: never scored. */
  ownerHours?: OwnerHours | null;
  /** The business's time zone (IANA) — "open now" and today's row use it. */
  timeZone?: string;
  rating: number | null;
  reviewCount: number | null;
  /** Real link to the business's own Google listing, when on file —
   * used for "read our reviews" and "open in Google Maps". */
  googleMapsUri: string | null;
  /** Google's own price level enum (lib/priceLevel.ts), when it has one. */
  priceLevel?: string | null;
  /** Social profiles verified to open the real profile (lib/socialLinkCheck.ts). */
  socialLinks?: Array<{ platform: string; url: string }>;
  /** The copyright year (passed in so the output stays deterministic). */
  year?: number;
  /** Resolved BizProfile id (e.g. "salon") — changes CTA wording and the
   * business-type icon, never which real facts appear. */
  profileId: string;
  /** One of STARTER_SITE_THEMES' ids — purely visual. */
  themeId: string;
  /** A real 6-digit hex overriding just the theme's accent color, or
   * null to use the theme's own accent as-is. */
  customAccent: string | null;
  /** One of STARTER_SITE_FONTS' ids — purely visual. */
  fontId: string;
  /** Patterns, divider, heading shapes and icons (lib/starterSiteArt.ts). */
  accentStyle?: AccentStyle;
  /** Which real sections the owner chose to include — a field can only
   * be shown if it's also actually present in the data above. */
  show: {
    address: boolean;
    phone: boolean;
    hours: boolean;
    rating: boolean;
  };
  /** An owner-uploaded photo for the hero background, as a data: URI —
   * see StarterSiteBuilder.tsx for how it's captured/resized client-side.
   * null = no hero photo, the theme's flat heroBg is used instead. */
  heroImage: { dataUri: string; alt: string } | null;
  /** Owner-uploaded photos for a "Photos" section, as data: URIs — same
   * capture path as heroImage. Embedded directly in the generated HTML
   * so the downloaded file is still one self-contained document. */
  contentImages: Array<{ dataUri: string; alt: string }>;
}

/** JSON for a <script> tag: "<" escaped so text can't close the tag. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** "Irvington, NY" from a US-style Google address ("20 W Main St #1,
 * Irvington, NY 10533, USA"); null when the shape isn't recognizable —
 * then the page just leaves the area out rather than guessing. */
export function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim());
  const stateZip = parts.findIndex((p, i) => i >= 2 && /^[A-Z]{2}\s+\d{5}(-\d{4})?$/.test(p));
  if (stateZip < 2) return null;
  const city = parts[stateZip - 1];
  return city && !/\d/.test(city) ? `${city}, ${parts[stateZip].slice(0, 2)}` : null;
}

/** Only https:// links leave the page (an http:// one would break "HTTPS-ready"). */
function safeHttpsUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const full = /^https:\/\//i.test(url) ? url : /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(url) ? `https://${url}` : null;
  return full && !/["<>\s]/.test(full) ? full : null;
}

/** schema.org LocalBusiness: only the facts the site itself shows. Hours
 * are the owner's (or Google's) for this website — never a rating, since
 * Google doesn't allow a business to mark up its own reviews. */
function jsonLd(
  input: StarterSiteInput,
  name: string,
  facts: { address: boolean; phone: boolean; schedule: OwnerHours | null; price: string | null; mapsUrl: string | null; social: string[]; description: string | null }
): string {
  const data: Record<string, unknown> = { "@context": "https://schema.org", "@type": "LocalBusiness", name };
  if (facts.description) data.description = facts.description;
  if (facts.phone && input.phone) data.telephone = input.phone;
  if (facts.address && input.address) data.address = input.address;
  if (facts.schedule) {
    const spec = openingHoursSpecification(facts.schedule);
    if (spec.length > 0) data.openingHoursSpecification = spec;
  }
  if (facts.price) data.priceRange = facts.price;
  if (facts.mapsUrl) data.hasMap = facts.mapsUrl;
  if (facts.social.length > 0) data.sameAs = facts.social;
  return scriptJson(data);
}

/** Every color the page uses, each text color checked against what it
 * sits on (WCAG AA 4.5:1) — exported so tests can verify every theme. */
export function starterSitePalette(theme: StarterSiteTheme, accent: string, hasHeroPhoto: boolean) {
  const surface = "#ffffff";
  const pageBg = theme.pageBg;
  const altBg = mix(pageBg, accent, 0.07);
  const lightBgs = [surface, pageBg, altBg];
  // A hero photo always gets a dark overlay, so its text is white.
  const heroBg = theme.heroBg;
  const heroSurface = hasHeroPhoto ? "#262626" : heroBg;
  const heroText = hasHeroPhoto ? "#ffffff" : theme.heroText;
  const footerBg = contrastRatio("#ffffff", theme.heroBg) >= 7 ? theme.heroBg : theme.ink;
  return {
    surface,
    pageBg,
    altBg,
    border: theme.cardBorder,
    ink: readableOnAll(theme.ink, lightBgs),
    soft: readableOnAll(theme.textSoft, lightBgs),
    mute: readableOnAll(theme.textMute, lightBgs),
    link: readableOnAll(accent, lightBgs),
    heroBg,
    heroSurface,
    heroText: readableOn(heroText, heroSurface),
    heroSoft: readableOn(mix(heroText, heroSurface, 0.22), heroSurface),
    heroAccent: readableOn(accent, heroSurface),
    accent,
    onAccent: readableOn(textOn(accent, theme.ink), accent),
    footerBg,
    footerText: readableOn("#ffffff", footerBg),
    footerMute: readableOn(mix("#ffffff", footerBg, 0.3), footerBg),
    footerLink: readableOn(accent, footerBg),
  };
}

export function buildStarterSiteHtml(input: StarterSiteInput): string {
  const locale = input.locale;
  const theme = getStarterSiteTheme(input.themeId);
  const font = getStarterSiteFont(input.fontId);
  const taglineFont = getStarterSiteFont(input.taglineFontId);
  const accent = safeHexColor(input.customAccent, theme.accent);
  const style = safeAccentStyle(input.accentStyle ?? "dots");
  const decorated = style !== "none";
  const c = starterSitePalette(theme, accent, !!input.heroImage);
  const taglineColor = safeHexColor(input.taglineColor, c.heroSoft);
  const ico = (name: IconName, size = 20) => (decorated ? iconSvg(name, size) : "");
  const secIcon = (name: IconName) => (decorated ? `<span class="sec-ico">${iconSvg(name, 18)}</span>` : "");

  const name = input.businessName.trim() || t(locale, "starterSite.defaultBusinessName");
  const showAddress = input.show.address && !!input.address;
  const showPhone = input.show.phone && !!input.phone;
  // Spanish prefers the real structured hours, formatted honestly by
  // lib/hours.ts; when that can't produce a result (no structured data,
  // or it doesn't parse), this falls back to the plain English lines —
  // never a guessed Spanish schedule.
  const hoursLines =
    (locale === "es" ? formatOpeningHours(input.openingHoursPeriods, locale) : null) ?? input.openingHours;
  // A real weekly schedule (the owner's, else Google's structured hours)
  // renders as a table with today highlighted; otherwise Google's plain
  // lines as before.
  const schedule = input.ownerHours ?? ownerHoursFromGoogle(input.openingHoursPeriods);
  const showHours = input.show.hours && (!!schedule || (!!hoursLines && hoursLines.length > 0));
  const weekly = showHours && schedule && schedule.mode === "weekly" ? schedule : null;
  const showRating = input.show.rating && input.rating !== null;
  const rating = input.rating as number;
  const tagline = input.tagline.trim();
  const city = showAddress ? cityFromAddress(input.address) : null;
  const priceSymbol = priceLevelToSymbol(input.priceLevel ?? null);
  const price = priceSymbol === "Free" ? t(locale, "starterSite.priceFree") : priceSymbol;
  const mapsUrl = safeHttpsUrl(input.googleMapsUri);
  const social = (input.socialLinks ?? []).flatMap((s) => {
    const url = safeHttpsUrl(s.url);
    return url ? [{ platform: s.platform, url }] : [];
  });
  const directionsUrl = showAddress ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.address as string)}` : null;
  const placeUrl = showAddress ? mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(input.address as string)}` : null;
  const verb = ctaVerb(input.profileId, locale);

  const categoryCity = input.category && city ? t(locale, "starterSite.inCity", { category: input.category, city }) : input.category;
  const title = categoryCity ? `${name} | ${categoryCity}` : name;
  const description = [tagline || null, categoryCity, showAddress ? input.address : null].filter(Boolean).join(" · ") || name;

  const fontsHref = buildGoogleFontsHref(tagline ? [font.heading, font.body, taglineFont.heading] : [font.heading, font.body]);

  // ---- Hero
  const heroCtas: string[] = [];
  if (showPhone) {
    heroCtas.push(`<a class="btn btn-primary" href="${telHref(input.phone as string)}">${ico("phone", 18)}${escapeHtml(t(locale, "starterSite.callNow"))}</a>`);
  }
  if (directionsUrl) {
    heroCtas.push(
      `<a class="btn ${showPhone ? "btn-secondary" : "btn-primary"}" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">${ico("pin", 18)}${escapeHtml(t(locale, "starterSite.getDirections"))}</a>`
    );
  }
  const ratingLabel = showRating
    ? input.reviewCount !== null
      ? tPlural(locale, "starterSite.ratingBadge", input.reviewCount, { rating: rating.toFixed(1) })
      : t(locale, "starterSite.ratingBadgeOnGoogle", { rating: rating.toFixed(1) })
    : "";
  const ratingBadge =
    showRating && rating >= 4
      ? mapsUrl
        ? `<a class="rating-badge" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer"><span class="badge-star">★</span>${escapeHtml(ratingLabel)}</a>`
        : `<span class="rating-badge"><span class="badge-star">★</span>${escapeHtml(ratingLabel)}</span>`
      : "";
  const taglineHtml = tagline ? `<p class="tagline tagline--${input.taglinePlacement}">${escapeHtml(tagline)}</p>` : "";
  const nameHtml = `<h1>${escapeHtml(name)}</h1>`;
  const categoryHtml = categoryCity ? `<div class="category">${escapeHtml(categoryCity)}</div>` : "";
  const heroBody = input.taglinePlacement === "above" ? [taglineHtml, nameHtml, categoryHtml] : [nameHtml, categoryHtml, taglineHtml];
  const typeBadge = decorated ? `<div class="type-badge">${iconSvg(businessIcon(input.profileId), 26)}</div>` : "";

  // ---- At a glance
  const tiles: string[] = [];
  if (weekly) {
    tiles.push(`<div class="tile" id="today-tile" hidden><span class="tile-ico">${iconSvg("clock", 20)}</span><div><div class="tile-label">${escapeHtml(t(locale, "starterSite.glanceToday"))}</div><div class="tile-value"><span class="now-dot"></span><span class="now-state"></span> <span class="now-detail"></span></div><div class="tile-sub now-hours"></div></div></div>`);
  } else if (showHours && schedule && schedule.mode === "appointment") {
    tiles.push(`<div class="tile"><span class="tile-ico">${iconSvg("clock", 20)}</span><div><div class="tile-label">${escapeHtml(t(locale, "starterSite.hoursHeading"))}</div><div class="tile-value">${escapeHtml(appointmentOnlyLabel(locale))}</div></div></div>`);
  }
  if (showPhone) {
    tiles.push(`<a class="tile" href="${telHref(input.phone as string)}"><span class="tile-ico">${iconSvg("phone", 20)}</span><div><div class="tile-label">${escapeHtml(verb)}</div><div class="tile-value">${escapeHtml(input.phone as string)}</div></div></a>`);
  }
  if (city) {
    tiles.push(`<div class="tile"><span class="tile-ico">${iconSvg("pin", 20)}</span><div><div class="tile-label">${escapeHtml(t(locale, "starterSite.glanceArea"))}</div><div class="tile-value">${escapeHtml(city)}</div></div></div>`);
  }
  if (price) {
    tiles.push(`<div class="tile"><span class="tile-ico">${iconSvg("tag", 20)}</span><div><div class="tile-label">${escapeHtml(t(locale, "starterSite.glancePrice"))}</div><div class="tile-value">${escapeHtml(price)}</div></div></div>`);
  }

  // ---- Content bands (alternate ones get the pattern)
  const bands: string[] = [];

  const n = input.contentImages.length;
  if (n > 0) {
    bands.push(`<div class="wrap">
        <h2 class="sec-title">${secIcon("camera")}${escapeHtml(t(locale, "starterSite.photosHeading"))}</h2>
        <div class="gallery n${Math.min(n, 4)}">
          ${input.contentImages
            .map((img) => `<img src="${img.dataUri}" alt="${escapeHtml(img.alt)}" loading="lazy">`)
            .join("\n          ")}
        </div>
      </div>`);
  }

  const cards: string[] = [];
  if (showHours && schedule) {
    const note = schedule.note.trim() ? `<p class="hours-note">${escapeHtml(schedule.note.trim())}</p>` : "";
    const body =
      schedule.mode === "appointment"
        ? `<p class="hours-appointment">${escapeHtml(appointmentOnlyLabel(locale))}</p>`
        : `<table class="hours">
          <tbody>
          ${hoursRows(schedule, locale)
            .map((row) => `<tr data-day="${row.index}"><th scope="row">${escapeHtml(row.day)}</th><td>${escapeHtml(row.text)}</td></tr>`)
            .join("\n          ")}
          </tbody>
        </table>`;
    cards.push(`<div class="card" id="hours">
          <h2 class="sec-title">${secIcon("clock")}${escapeHtml(t(locale, "starterSite.hoursHeading"))}</h2>
          ${body}
          ${note}
        </div>`);
  } else if (showHours) {
    cards.push(`<div class="card" id="hours">
          <h2 class="sec-title">${secIcon("clock")}${escapeHtml(t(locale, "starterSite.hoursHeading"))}</h2>
          <ul class="hours-lines">
            ${(hoursLines as string[]).map((line) => `<li>${escapeHtml(line)}</li>`).join("\n            ")}
          </ul>
        </div>`);
  }
  if (showRating) {
    const stars = starRowHtml(rating, t(locale, "starterSite.starsAria", { rating: rating.toFixed(1) }));
    const reviewsLine =
      input.reviewCount !== null
        ? tPlural(locale, "starterSite.reviewsAverageFromCount", input.reviewCount, { rating: rating.toFixed(1) })
        : t(locale, "starterSite.reviewsAverageOnGoogle", { rating: rating.toFixed(1) });
    const reviewsLink = mapsUrl
      ? `<a class="btn btn-outline" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(locale, "starterSite.seeReviewsOnGoogle"))}</a>`
      : "";
    cards.push(`<div class="card card--reviews" id="reviews">
          <h2 class="sec-title">${secIcon("star")}${escapeHtml(t(locale, "starterSite.reviewsHeading"))}</h2>
          <div class="score-row"><span class="score">${rating.toFixed(1)}</span>${stars}</div>
          <p>${escapeHtml(reviewsLine)}</p>
          ${reviewsLink}
        </div>`);
  }
  if (cards.length > 0) bands.push(`<div class="wrap split split--${cards.length}">\n        ${cards.join("\n        ")}\n      </div>`);

  const visit: string[] = [];
  if (showAddress) {
    visit.push(`<div class="card" id="location">
          <h2 class="sec-title">${secIcon("map")}${escapeHtml(t(locale, "starterSite.locationHeading"))}</h2>
          <p class="big">${escapeHtml(input.address as string)}</p>
          <p class="links"><a class="link" href="${escapeHtml(placeUrl as string)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(locale, "starterSite.openInMaps"))}</a>
          <a class="link" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(locale, "starterSite.getDirectionsArrow"))}</a></p>
        </div>`);
  }
  if (showPhone) {
    visit.push(`<div class="card" id="contact">
          <h2 class="sec-title">${secIcon("phone")}${escapeHtml(t(locale, "starterSite.contactHeading"))}</h2>
          <p>${escapeHtml(verb)}</p>
          <p class="big"><a class="link" href="${telHref(input.phone as string)}">${escapeHtml(input.phone as string)}</a></p>
        </div>`);
  }
  if (visit.length > 0) bands.push(`<div class="wrap split split--${visit.length}">\n        ${visit.join("\n        ")}\n      </div>`);

  const sectionsHtml = bands.map((b, i) => `<section class="band${i % 2 === 0 ? " alt" : ""}">\n      ${b}\n    </section>`).join("\n    ");
  const firstBg = tiles.length > 0 ? c.pageBg : bands.length > 0 ? c.altBg : c.footerBg;

  // ---- Footer
  const summary = weekly ? hoursSummary(weekly, locale) : showHours && schedule?.mode === "appointment" ? [appointmentOnlyLabel(locale)] : [];
  const footCols: string[] = [];
  footCols.push(`<div>
        <div class="foot-name">${decorated ? iconSvg(businessIcon(input.profileId), 20) : ""}${escapeHtml(name)}</div>
        ${showAddress ? `<p>${escapeHtml(input.address as string)}</p>` : ""}
        ${showPhone ? `<p><a href="${telHref(input.phone as string)}">${escapeHtml(input.phone as string)}</a></p>` : ""}
      </div>`);
  if (summary.length > 0) {
    footCols.push(`<div>
        <div class="foot-h">${escapeHtml(t(locale, "starterSite.hoursHeading"))}</div>
        <ul>${summary.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      </div>`);
  }
  if (social.length > 0) {
    footCols.push(`<div>
        <div class="foot-h">${escapeHtml(t(locale, "starterSite.followUs"))}</div>
        <ul>${social.map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.platform)}</a></li>`).join("")}</ul>
      </div>`);
  }
  const copyright = input.year ? t(locale, "starterSite.copyright", { year: String(input.year), name }) : null;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="${c.heroBg}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsHref}" rel="stylesheet">
<script type="application/ld+json">${jsonLd(input, name, {
    address: showAddress,
    phone: showPhone,
    schedule: showHours ? schedule : null,
    price: priceSymbol,
    mapsUrl,
    social: social.map((s) => s.url),
    description: tagline || categoryCity || null,
  })}</script>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    font-family: ${font.body.cssFamily};
    background: ${c.pageBg};
    color: ${c.ink};
    line-height: 1.5;
  }
  h1, h2 { font-family: ${font.heading.cssFamily}; margin: 0; }
  a { color: inherit; }
  .ico { display: inline-block; vertical-align: middle; flex-shrink: 0; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 0 20px; }

  .hero {
    position: relative;
    background: ${
      input.heroImage
        ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("${input.heroImage.dataUri}") center/cover no-repeat, ${c.heroBg}`
        : c.heroBg
    };
    color: ${c.heroText};
    padding: 64px 20px ${decorated ? "92px" : "64px"};
    text-align: center;
    overflow: hidden;
  }
  .hero-inner { position: relative; max-width: 720px; margin: 0 auto; }
  .type-badge {
    display: inline-flex; align-items: center; justify-content: center;
    width: 56px; height: 56px; margin-bottom: 18px; border-radius: 50%;
    color: ${c.heroAccent};
    border: 1.5px solid ${c.heroAccent};
  }
  .hero h1 { font-size: clamp(32px, 7vw, 54px); font-weight: 700; line-height: 1.1; }
  .hero .category {
    margin-top: 12px;
    color: ${c.heroAccent};
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  ${
    tagline
      ? `.hero .tagline {
    font-family: ${taglineFont.heading.cssFamily};
    font-size: ${TAGLINE_SIZE_PX[input.taglineSize]}px;
    color: ${taglineColor};
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
  .hero .tagline--below { margin-top: 14px; margin-bottom: 0; }
  .hero .tagline--above { margin-top: 0; margin-bottom: 12px; }`
      : ""
  }
  .rating-badge {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 18px; padding: 6px 14px; border-radius: 999px;
    border: 1px solid ${c.heroSoft}66;
    color: ${c.heroText}; font-size: 14px; font-weight: 600; text-decoration: none;
  }
  .badge-star { color: ${c.heroAccent}; font-size: 16px; line-height: 1; }
  .hero .ctas { margin-top: 28px; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 13px 26px; border-radius: 10px;
    font-weight: 700; font-size: 16px; text-decoration: none;
  }
  .btn-primary { background: ${c.accent}; color: ${c.onAccent}; }
  .btn-secondary { background: transparent; color: ${c.heroText}; border: 1.5px solid ${c.heroText}88; }
  .btn-outline { margin-top: 6px; min-height: 44px; padding: 10px 18px; font-size: 15px; color: ${c.link}; border: 1.5px solid ${c.link}; }
  .divider { position: absolute; left: 0; bottom: -1px; width: 100%; height: 48px; display: block; }

  .glance-wrap { background: ${c.pageBg}; padding: 28px 0 8px; }
  .glance { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .tile {
    display: flex; align-items: flex-start; gap: 12px;
    background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 14px;
    padding: 14px 16px; text-decoration: none; color: ${c.ink};
  }
  .tile[hidden] { display: none; }
  .tile-ico {
    display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: ${c.accent}1f; color: ${c.link};
  }
  .tile-label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: ${c.mute}; }
  .tile-value { font-size: 16px; font-weight: 700; color: ${c.ink}; }
  .tile-sub { font-size: 13px; color: ${c.soft}; }
  .now-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: ${c.mute}; }
  .is-open .now-dot { background: #1f8a4c; }
  .now-detail { font-weight: 500; color: ${c.soft}; }

  .band { padding: 44px 0; background: ${c.pageBg}; }
  .band.alt { background-color: ${c.altBg}; ${decorated ? patternCss(style, c.accent) : ""} }
  .sec-title { position: relative; z-index: 0; font-size: 24px; margin-bottom: 18px; color: ${c.ink}; }
  .sec-ico {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; margin-right: 10px; border-radius: 50%;
    background: ${c.accent}24; color: ${c.link}; vertical-align: -6px;
  }
  ${decorated ? headingShapeCss(style, c.accent) : ""}
  .split { display: grid; grid-template-columns: 1fr; gap: 18px; }
  @media (min-width: 760px) { .split--2 { grid-template-columns: 1fr 1fr; } }
  .card { background: ${c.surface}; border: 1px solid ${c.border}; border-radius: 16px; padding: 24px; }
  .card .sec-title { font-size: 21px; }
  .card p { margin: 0 0 8px; color: ${c.soft}; }
  .card p.big { font-size: 17px; color: ${c.ink}; font-weight: 600; }
  .links { display: flex; flex-wrap: wrap; gap: 6px 18px; }
  .link { color: ${c.link}; font-weight: 700; text-decoration: none; font-size: 15px; }

  .gallery { display: grid; gap: 10px; }
  .gallery img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
  .gallery.n1 img { aspect-ratio: 16 / 9; }
  .gallery.n2 { grid-template-columns: 1fr 1fr; }
  .gallery.n2 img { aspect-ratio: 4 / 5; }
  .gallery.n3 { grid-template-columns: 1fr 1fr; }
  .gallery.n3 img { aspect-ratio: 1 / 1; }
  .gallery.n3 img:first-child { grid-column: 1 / -1; aspect-ratio: 16 / 9; }
  .gallery.n4 { grid-template-columns: 1fr 1fr; }
  .gallery.n4 img { aspect-ratio: 4 / 3; }
  @media (min-width: 760px) {
    .gallery.n3 { grid-template-columns: 2fr 1fr; grid-template-rows: 1fr 1fr; }
    .gallery.n3 img:first-child { grid-column: 1; grid-row: 1 / span 2; aspect-ratio: auto; }
    .gallery.n3 img { aspect-ratio: 4 / 3; }
  }

  .hours-lines { list-style: none; margin: 0; padding: 0; color: ${c.soft}; }
  .hours-lines li { padding: 7px 0; border-top: 1px solid ${c.border}; font-size: 15px; }
  .hours-lines li:first-child { border-top: none; }
  .hours { width: 100%; border-collapse: collapse; color: ${c.soft}; font-size: 15px; }
  .hours th, .hours td { padding: 8px 10px; border-top: 1px solid ${c.border}; text-align: left; vertical-align: top; }
  .hours th { font-weight: 600; white-space: nowrap; }
  .hours td { text-align: right; }
  .hours tr:first-child th, .hours tr:first-child td { border-top: none; }
  .hours tr.today th, .hours tr.today td { background: ${c.accent}1f; color: ${c.ink}; font-weight: 700; }
  .hours tr.today th::after { content: " · ${t(locale, "starterSite.today")}"; color: ${c.link}; font-size: 12px; }
  .hours-note, .hours-appointment { margin-top: 10px !important; }
  .hours-appointment { font-weight: 600; color: ${c.ink} !important; }

  .score-row { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .score { font-family: ${font.heading.cssFamily}; font-size: 46px; font-weight: 700; line-height: 1; color: ${c.ink}; }
  ${starRowCss(c.accent, c.border)}

  .site-footer { background: ${c.footerBg}; color: ${c.footerText}; padding: 40px 0 24px; font-size: 14px; }
  .foot-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
  .foot-name { display: flex; align-items: center; gap: 8px; font-family: ${font.heading.cssFamily}; font-size: 20px; font-weight: 700; margin-bottom: 8px; color: ${c.footerText}; }
  .foot-name .ico { color: ${c.footerLink}; }
  .site-footer p { margin: 0 0 6px; color: ${c.footerMute}; }
  .site-footer a { color: ${c.footerLink}; text-decoration: none; font-weight: 600; }
  .foot-h { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; color: ${c.footerText}; }
  .site-footer ul { list-style: none; margin: 0; padding: 0; color: ${c.footerMute}; }
  .site-footer li { padding: 2px 0; }
  .foot-bottom { margin-top: 28px; padding-top: 16px; border-top: 1px solid ${c.footerMute}44; color: ${c.footerMute}; font-size: 12px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }

  @media (max-width: 480px) {
    .hero { padding-top: 48px; }
    .btn { width: 100%; }
    .band { padding: 36px 0; }
    .card { padding: 20px; }
  }
</style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
    ${typeBadge}
    ${heroBody.join("\n    ")}
    ${ratingBadge}
    ${heroCtas.length > 0 ? `<div class="ctas">${heroCtas.join("\n      ")}</div>` : ""}
    </div>
    ${decorated ? dividerSvg(style, firstBg) : ""}
  </header>
  <main>
    ${tiles.length > 0 ? `<div class="glance-wrap"><div class="wrap glance">\n      ${tiles.join("\n      ")}\n    </div></div>` : ""}
    ${sectionsHtml}
  </main>
  <footer class="site-footer">
    <div class="wrap foot-grid">
      ${footCols.join("\n      ")}
    </div>
    <div class="wrap foot-bottom"><span>${copyright ? escapeHtml(copyright) : ""}</span><span>${escapeHtml(t(locale, "starterSite.footerBuiltWith"))}</span></div>
  </footer>
${weekly ? hoursScript(weekly, locale, input.timeZone ?? "America/New_York") : ""}
</body>
</html>
`;
}
