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

/**
 * A curated color theme: a dark hero background (paired with white
 * hero text), an accent used for buttons/links/the category label, and
 * a light page background with matching card/text tones. Deliberately
 * a closed set rather than a free-form color picker for the base
 * palette — every combination here is hand-picked to stay legible
 * (white-on-dark hero, an accent dark/saturated enough to read against
 * both the dark hero and white cards) — but the accent itself can be
 * fine-tuned with a real color picker (see customAccent on
 * StarterSiteInput) for owners who want to nudge just the pop color.
 */
export interface StarterSiteTheme {
  id: string;
  label: string;
  heroBg: string;
  accent: string;
  pageBg: string;
  cardBorder: string;
  textSoft: string;
  textMute: string;
}

export const STARTER_SITE_THEMES: StarterSiteTheme[] = [
  {
    id: "ink",
    label: "Ink & Brass",
    heroBg: "#14243f",
    accent: "#b8862f",
    pageBg: "#f5f1e8",
    cardBorder: "#eae4d5",
    textSoft: "#3a4a66",
    textMute: "#6b7890",
  },
  {
    id: "terracotta",
    label: "Terracotta & Clay",
    heroBg: "#5c3a2e",
    accent: "#c17a3f",
    pageBg: "#f7efe6",
    cardBorder: "#ecdfd0",
    textSoft: "#6b4a3a",
    textMute: "#8a6f5f",
  },
  {
    id: "forest",
    label: "Forest & Gold",
    heroBg: "#24352a",
    accent: "#b98f3e",
    pageBg: "#f4f3ea",
    cardBorder: "#e2e0d0",
    textSoft: "#3f5142",
    textMute: "#6b7a6a",
  },
  {
    id: "slate",
    label: "Slate & Coral",
    heroBg: "#2b3440",
    accent: "#d97a56",
    pageBg: "#f2f4f6",
    cardBorder: "#dde3e8",
    textSoft: "#445162",
    textMute: "#6f7c8c",
  },
  {
    id: "plum",
    label: "Plum & Rose Gold",
    heroBg: "#3a2440",
    accent: "#c98a5e",
    pageBg: "#f7f0ee",
    cardBorder: "#ecdfdc",
    textSoft: "#5c4258",
    textMute: "#83717f",
  },
  {
    id: "teal",
    label: "Midnight Teal",
    heroBg: "#0e2b2c",
    accent: "#2f9c8f",
    pageBg: "#eff5f4",
    cardBorder: "#d9e6e4",
    textSoft: "#2d4644",
    textMute: "#5c7371",
  },
  {
    id: "crimson",
    label: "Crimson & Charcoal",
    heroBg: "#1f1b1b",
    accent: "#b8382f",
    pageBg: "#f3f1ef",
    cardBorder: "#e3ded9",
    textSoft: "#4a413d",
    textMute: "#7a716c",
  },
  {
    id: "ocean",
    label: "Ocean & Sand",
    heroBg: "#1a3b4a",
    accent: "#d4a24c",
    pageBg: "#f6f2e8",
    cardBorder: "#e8ddc8",
    textSoft: "#35525f",
    textMute: "#62808c",
  },
  {
    id: "berry",
    label: "Berry & Cream",
    heroBg: "#45213a",
    accent: "#cf9a56",
    pageBg: "#f8f1ec",
    cardBorder: "#ecdfd5",
    textSoft: "#5e3a52",
    textMute: "#85677c",
  },
  {
    id: "graphite",
    label: "Graphite & Lime",
    heroBg: "#1c1f1a",
    accent: "#7a9c3f",
    pageBg: "#f4f5f0",
    cardBorder: "#e0e3d8",
    textSoft: "#3c4636",
    textMute: "#6a7462",
  },
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
function ctaVerb(profileId: string): string {
  switch (profileId) {
    case "salon":
    case "practitioner":
      return "Call to book";
    case "restaurant":
      return "Call to order";
    case "lawyer":
      return "Call for a consultation";
    default:
      return "Call us";
  }
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
  rating: number | null;
  reviewCount: number | null;
  /** Real link to the business's own Google listing, when on file —
   * used for "see our reviews," never a fabricated review count link. */
  googleMapsUri: string | null;
  /** Resolved BizProfile id (e.g. "salon") — only ever changes CTA
   * wording, never which real facts appear. */
  profileId: string;
  /** One of STARTER_SITE_THEMES' ids — purely visual. */
  themeId: string;
  /** A real 6-digit hex overriding just the theme's accent color, or
   * null to use the theme's own accent as-is. */
  customAccent: string | null;
  /** One of STARTER_SITE_FONTS' ids — purely visual. */
  fontId: string;
  /** Which real sections the owner chose to include — a field can only
   * be shown if it's also actually present in the data above. */
  show: {
    address: boolean;
    phone: boolean;
    hours: boolean;
    rating: boolean;
  };
}

export function buildStarterSiteHtml(input: StarterSiteInput): string {
  const theme = getStarterSiteTheme(input.themeId);
  const font = getStarterSiteFont(input.fontId);
  const taglineFont = getStarterSiteFont(input.taglineFontId);
  const accent = safeHexColor(input.customAccent, theme.accent);
  const taglineColor = safeHexColor(input.taglineColor, "#cbd5e6");

  const name = input.businessName.trim() || "Your Business";
  const showAddress = input.show.address && !!input.address;
  const showPhone = input.show.phone && !!input.phone;
  const showHours = input.show.hours && !!input.openingHours && input.openingHours.length > 0;
  const showRating = input.show.rating && input.rating !== null;
  const tagline = input.tagline.trim();

  const description = escapeHtml(tagline || input.category || name);

  const fontsHref = buildGoogleFontsHref(
    tagline ? [font.heading, font.body, taglineFont.heading] : [font.heading, font.body]
  );

  const heroCtas: string[] = [];
  if (showPhone) {
    heroCtas.push(
      `<a class="btn btn-primary" href="${telHref(input.phone as string)}">${escapeHtml(ctaVerb(input.profileId))}: ${escapeHtml(input.phone as string)}</a>`
    );
  }
  if (showAddress) {
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.address as string)}`;
    heroCtas.push(
      `<a class="btn ${showPhone ? "btn-secondary" : "btn-primary"}" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">Get directions</a>`
    );
  }

  const sections: string[] = [];

  if (showHours) {
    sections.push(`
      <section class="card">
        <h2>Hours</h2>
        <ul class="hours">
          ${(input.openingHours as string[]).map((line) => `<li>${escapeHtml(line)}</li>`).join("\n          ")}
        </ul>
      </section>`);
  }

  if (showAddress) {
    const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(input.address as string)}&output=embed`;
    const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.address as string)}`;
    sections.push(`
      <section class="card">
        <h2>Location</h2>
        <p>${escapeHtml(input.address as string)}</p>
        <a class="link" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">Get directions →</a>
        <iframe class="map" src="${mapSrc}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Map to ${escapeHtml(name)}"></iframe>
      </section>`);
  }

  if (showPhone) {
    sections.push(`
      <section class="card">
        <h2>Contact</h2>
        <p><a class="link" href="${telHref(input.phone as string)}">${escapeHtml(input.phone as string)}</a></p>
      </section>`);
  }

  if (showRating) {
    const stars = "★".repeat(Math.max(0, Math.min(5, Math.round(input.rating as number))));
    const reviewsLine =
      input.reviewCount !== null
        ? `${(input.rating as number).toFixed(1)} average from ${input.reviewCount.toLocaleString()} Google review${input.reviewCount === 1 ? "" : "s"}`
        : `${(input.rating as number).toFixed(1)} average on Google`;
    const reviewsLink = input.googleMapsUri
      ? `<p><a class="link" href="${escapeHtml(input.googleMapsUri)}" target="_blank" rel="noopener noreferrer">See our reviews on Google →</a></p>`
      : "";
    sections.push(`
      <section class="card">
        <h2>Reviews</h2>
        <p class="stars" aria-hidden="true">${stars}</p>
        <p>${escapeHtml(reviewsLine)}</p>
        ${reviewsLink}
      </section>`);
  }

  const taglineHtml = tagline
    ? `<p class="tagline tagline--${input.taglinePlacement}">${escapeHtml(tagline)}</p>`
    : "";
  const nameHtml = `<h1>${escapeHtml(name)}</h1>`;
  const categoryHtml = input.category ? `<div class="category">${escapeHtml(input.category)}</div>` : "";

  const heroBody =
    input.taglinePlacement === "above"
      ? [taglineHtml, nameHtml, categoryHtml]
      : [nameHtml, categoryHtml, taglineHtml];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<meta name="description" content="${description}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${fontsHref}" rel="stylesheet">
<style>
  :root {
    color-scheme: light;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${font.body.cssFamily};
    background: ${theme.pageBg};
    color: ${theme.heroBg};
  }
  h1, h2 {
    font-family: ${font.heading.cssFamily};
    margin: 0;
  }
  .hero {
    background: ${theme.heroBg};
    color: #fff;
    padding: 56px 24px;
    text-align: center;
  }
  .hero h1 {
    font-size: clamp(28px, 6vw, 44px);
    font-weight: 700;
  }
  .hero .category {
    margin-top: 10px;
    color: ${accent};
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
    max-width: 520px;
    margin-left: auto;
    margin-right: auto;
  }
  .hero .tagline--below { margin-top: 14px; }
  .hero .tagline--above { margin-bottom: 10px; }`
      : ""
  }
  .hero .ctas {
    margin-top: 26px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
  .btn {
    display: inline-block;
    padding: 13px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 15px;
    text-decoration: none;
  }
  .btn-primary {
    background: ${accent};
    color: #fff;
  }
  .btn-secondary {
    background: transparent;
    color: #fff;
    border: 1px solid rgba(255,255,255,0.5);
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 32px 20px 56px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .card {
    background: #fff;
    border: 1px solid ${theme.cardBorder};
    border-radius: 12px;
    padding: 22px;
  }
  .card h2 {
    font-size: 19px;
    margin-bottom: 12px;
  }
  .card p {
    margin: 0 0 8px;
    color: ${theme.textSoft};
    line-height: 1.5;
  }
  .hours {
    list-style: none;
    margin: 0;
    padding: 0;
    color: ${theme.textSoft};
  }
  .hours li {
    padding: 6px 0;
    border-top: 1px solid ${theme.cardBorder};
    font-size: 14.5px;
  }
  .hours li:first-child { border-top: none; }
  .link {
    color: ${accent};
    font-weight: 600;
    text-decoration: none;
    font-size: 14.5px;
  }
  .map {
    width: 100%;
    height: 220px;
    border: 0;
    border-radius: 8px;
    margin-top: 14px;
  }
  .stars {
    color: ${accent};
    font-size: 20px;
    letter-spacing: 2px;
  }
  footer {
    text-align: center;
    padding: 20px;
    color: ${theme.textMute};
    font-size: 12px;
  }
</style>
</head>
<body>
  <div class="hero">
    ${heroBody.join("\n    ")}
    ${heroCtas.length > 0 ? `<div class="ctas">${heroCtas.join("\n      ")}</div>` : ""}
  </div>
  <main>
    ${sections.join("\n    ")}
  </main>
  <footer>Site built with PostScore</footer>
</body>
</html>
`;
}
