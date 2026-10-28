// Review sign design: every choice the Sign Studio offers, the presets,
// what each plan may print (effectiveDesign — the server runs this before
// building any PDF), color-contrast checks, and remembering the design on
// this device. Pure and light (no font data); safe on server and client.

import type { QrCenter, QrCorners, QrDots, QrStyle } from "@/lib/reviewQr";
import { isPremiumPlan, type Plan } from "@/lib/plan";

export type SignTemplate = "centered" | "split" | "minimal" | "banner" | "framed";
export type SignSize = "tent" | "card4x6" | "card5x7" | "letter" | "cards4";
export type SignThemeId = "classic" | "clean" | "bold" | "fresh" | "custom";
export type SignLanguage = "en" | "es" | "both";
export type SignHeadline = "loved" | "scan" | "smallBusiness" | "howWeDid" | "custom";
export type SignTextSize = "small" | "medium" | "large";
export type SignBorder = "none" | "thin" | "double" | "rounded";
export type SignBackground = "solid" | "pattern";
export type SignRadius = "none" | "small" | "large";
export type FontId = "playfair" | "inter" | "poppins" | "lora" | "montserrat" | "dmSerif" | "nunito" | "oswald";

export interface SignColors {
  background: string;
  text: string;
  accent: string;
}

export interface SignDesign {
  template: SignTemplate;
  size: SignSize;
  headlineFont: FontId;
  bodyFont: FontId;
  textSize: SignTextSize;
  theme: SignThemeId;
  /** Used when theme is "custom". */
  customColors: SignColors;
  headline: SignHeadline;
  customHeadline: string;
  subline: string;
  showName: boolean;
  /** The verified social profile to print as "Follow us", by its address
   * — only ever one of the profiles we've verified (the server checks). */
  follow: string | null;
  language: SignLanguage;
  /** Show the owner's logo (kept on this device) at the top. */
  logoTop: boolean;
  qrDots: QrDots;
  qrCorners: QrCorners;
  qrCenter: QrCenter;
  border: SignBorder;
  background: SignBackground;
  radius: SignRadius;
}

export const SIGN_TEMPLATES: SignTemplate[] = ["centered", "split", "minimal", "banner", "framed"];
export const SIGN_SIZES: SignSize[] = ["tent", "card4x6", "card5x7", "letter", "cards4"];
export const SIGN_THEMES: Exclude<SignThemeId, "custom">[] = ["classic", "clean", "bold", "fresh"];
export const SIGN_HEADLINES: Exclude<SignHeadline, "custom">[] = ["loved", "scan", "smallBusiness", "howWeDid"];
export const SIGN_TEXT_SIZES: SignTextSize[] = ["small", "medium", "large"];
export const SIGN_BORDERS: SignBorder[] = ["none", "thin", "double", "rounded"];
export const SIGN_BACKGROUNDS: SignBackground[] = ["solid", "pattern"];
export const SIGN_RADII: SignRadius[] = ["none", "small", "large"];
export const QR_DOTS: QrDots[] = ["square", "rounded", "dots"];
export const QR_CORNERS: QrCorners[] = ["square", "rounded"];
export const QR_CENTERS: QrCenter[] = ["none", "star", "logo"];
export const SIGN_LANGUAGES: SignLanguage[] = ["en", "es", "both"];

export const CUSTOM_HEADLINE_MAX = 50;
export const SUBLINE_MAX = 80;
/** 1.5 inches — the smallest QR any size or option combination prints. */
export const MIN_QR_POINTS = 108;
/** Logos: what may be added, and what's remembered on this device. */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_REMEMBER_MAX_BYTES = 500 * 1024;
export const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml"];

/** Grow's basic sign: two choices only. */
export const BASIC_THEMES = ["classic", "clean"] as const;
export const BASIC_SIZES = ["tent", "letter"] as const;
export type BasicTheme = (typeof BASIC_THEMES)[number];
export type BasicSize = (typeof BASIC_SIZES)[number];
export interface BasicChoices {
  theme: BasicTheme;
  size: BasicSize;
}

// ---- Fonts ----

export const FONTS: Record<FontId, { family: string; regular: string; bold: string; serif: boolean }> = {
  playfair: { family: "Playfair Display", regular: "PlayfairDisplay-Regular.ttf", bold: "PlayfairDisplay-Bold.ttf", serif: true },
  inter: { family: "Inter", regular: "Inter-Regular.ttf", bold: "Inter-Bold.ttf", serif: false },
  poppins: { family: "Poppins", regular: "Poppins-Regular.ttf", bold: "Poppins-Bold.ttf", serif: false },
  lora: { family: "Lora", regular: "Lora-Regular.ttf", bold: "Lora-Bold.ttf", serif: true },
  montserrat: { family: "Montserrat", regular: "Montserrat-Regular.ttf", bold: "Montserrat-Bold.ttf", serif: false },
  // A display face with one (already heavy) weight.
  dmSerif: { family: "DM Serif Display", regular: "DMSerifDisplay-Regular.ttf", bold: "DMSerifDisplay-Regular.ttf", serif: true },
  nunito: { family: "Nunito", regular: "Nunito-Regular.ttf", bold: "Nunito-Bold.ttf", serif: false },
  oswald: { family: "Oswald", regular: "Oswald-Regular.ttf", bold: "Oswald-Bold.ttf", serif: false },
};
export const FONT_IDS = Object.keys(FONTS) as FontId[];

/** The font file for each text role of a design. */
export function designFontFiles(design: { headlineFont: FontId; bodyFont: FontId }): Record<"headline" | "headlineRegular" | "body" | "bodyBold", string> {
  return {
    headline: FONTS[design.headlineFont].bold,
    headlineRegular: FONTS[design.headlineFont].regular,
    body: FONTS[design.bodyFont].regular,
    bodyBold: FONTS[design.bodyFont].bold,
  };
}

// ---- Colors ----

export const THEME_COLORS: Record<Exclude<SignThemeId, "custom">, SignColors> = {
  classic: { background: "#f7f1e3", text: "#14243f", accent: "#8a6420" },
  clean: { background: "#ffffff", text: "#000000", accent: "#000000" },
  bold: { background: "#14243f", text: "#ffffff", accent: "#e2b961" },
  fresh: { background: "#eef5ef", text: "#1f4d33", accent: "#2e6b45" },
};

export function designColors(design: Pick<SignDesign, "theme" | "customColors">): SignColors {
  return design.theme === "custom" ? design.customColors : THEME_COLORS[design.theme];
}

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio of two #rrggbb colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastProblem = "text" | "accent";

/** Color pairs too faint to read: text on background needs 4.5:1 (it's
 * also the banner's pair, reversed), accent on background 3:1. The QR is
 * never affected — it always prints dark on its own white tile. */
export function contrastProblems(colors: SignColors): ContrastProblem[] {
  const problems: ContrastProblem[] = [];
  if (contrastRatio(colors.text, colors.background) < 4.5) problems.push("text");
  if (contrastRatio(colors.accent, colors.background) < 3) problems.push("accent");
  return problems;
}

/** The "hard to read" hint for a color field, or null: the text color
 * should go darker on a light background, lighter on a dark one; a faint
 * accent should go stronger. */
export function colorHint(field: "background" | "text" | "accent", colors: SignColors): "darker" | "lighter" | "accent" | null {
  const problems = contrastProblems(colors);
  if ((field === "text" || field === "background") && problems.includes("text")) {
    return contrastRatio(colors.background, "#000000") >= contrastRatio(colors.background, "#ffffff") ? "darker" : "lighter";
  }
  if (field === "accent" && problems.includes("accent")) return "accent";
  return null;
}

/** The QR's ink: the darkest of the sign's colors that's strong on white
 * (7:1+), else navy — the code is always dark on light. */
export function qrInk(colors: SignColors): string {
  const candidates = [colors.text, colors.accent].filter((c) => contrastRatio(c, "#ffffff") >= 7);
  return candidates.sort((a, b) => luminance(a) - luminance(b))[0] ?? "#14243f";
}

// ---- Wording (the sign's own language, not the dashboard's) ----

export const HEADLINES: Record<Exclude<SignHeadline, "custom">, { en: string; es: string }> = {
  loved: { en: "Loved your visit? Leave us a review!", es: "¿Le gustó su visita? ¡Déjenos una reseña!" },
  scan: { en: "Scan to review us on Google", es: "Escanee para dejarnos una reseña en Google" },
  smallBusiness: { en: "Your review helps our small business", es: "Su reseña ayuda a nuestro pequeño negocio" },
  howWeDid: { en: "Tell us how we did", es: "Cuéntenos cómo lo hicimos" },
};
export const FOOTER = { en: "Takes 30 seconds · Opens Google reviews", es: "Toma 30 segundos · Abre las reseñas de Google" };
export const FOLLOW_US = { en: "Follow us", es: "Síganos" };
export const MADE_WITH = "Made with PostScore";

export function headlineText(headline: Exclude<SignHeadline, "custom">, language: "en" | "es"): string {
  return HEADLINES[headline][language];
}

// ---- Defaults and plans ----

export function defaultDesign(locale: "en" | "es"): SignDesign {
  return {
    template: "centered",
    size: "tent",
    headlineFont: "playfair",
    bodyFont: "inter",
    textSize: "medium",
    theme: "classic",
    customColors: { ...THEME_COLORS.classic },
    headline: "loved",
    customHeadline: "",
    subline: "",
    showName: true,
    follow: null,
    language: locale,
    logoTop: false,
    qrDots: "rounded",
    qrCorners: "rounded",
    qrCenter: "star",
    border: "thin",
    background: "solid",
    radius: "small",
  };
}

/** Grow's basic sign: the default design with only its two choices
 * applied. The fixed headline prints in the dashboard's language. */
export function basicDesign(choices: BasicChoices, locale: "en" | "es"): SignDesign {
  const base = defaultDesign(locale);
  return {
    ...base,
    theme: choices.theme,
    size: choices.size,
    headlineFont: choices.theme === "clean" ? "inter" : "playfair",
    bodyFont: "inter",
  };
}

export function defaultBasicChoices(): BasicChoices {
  return { theme: "classic", size: "tent" };
}

export type SignAccess = "none" | "basic" | "studio";

/** What the plan may print: Free nothing (link + QR PNG only), Grow the
 * basic sign, Premium and Multi the full Sign Studio. */
export function signAccess(plan: Plan): SignAccess {
  if (isPremiumPlan(plan)) return "studio";
  return plan === "grow" ? "basic" : "none";
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : "";
}

/** Any input (a request body, stored JSON) → a valid design; unknown
 * fields fall back to the defaults. */
export function sanitizeDesign(input: unknown, locale: "en" | "es"): SignDesign {
  const d = defaultDesign(locale);
  const v = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof SignDesign, unknown>>;
  const cc = (v.customColors && typeof v.customColors === "object" ? v.customColors : {}) as Partial<Record<keyof SignColors, unknown>>;
  return {
    template: pick(v.template, SIGN_TEMPLATES, d.template),
    size: pick(v.size, SIGN_SIZES, d.size),
    headlineFont: pick(v.headlineFont, FONT_IDS, d.headlineFont),
    bodyFont: pick(v.bodyFont, FONT_IDS, d.bodyFont),
    textSize: pick(v.textSize, SIGN_TEXT_SIZES, d.textSize),
    theme: pick(v.theme, [...SIGN_THEMES, "custom"] as const, d.theme),
    customColors: {
      background: color(cc.background, d.customColors.background),
      text: color(cc.text, d.customColors.text),
      accent: color(cc.accent, d.customColors.accent),
    },
    headline: pick(v.headline, [...SIGN_HEADLINES, "custom"] as const, d.headline),
    customHeadline: text(v.customHeadline, CUSTOM_HEADLINE_MAX),
    subline: text(v.subline, SUBLINE_MAX),
    showName: typeof v.showName === "boolean" ? v.showName : d.showName,
    follow: typeof v.follow === "string" && v.follow.length <= 300 ? v.follow : null,
    language: pick(v.language, SIGN_LANGUAGES, d.language),
    logoTop: typeof v.logoTop === "boolean" ? v.logoTop : d.logoTop,
    qrDots: pick(v.qrDots, QR_DOTS, d.qrDots),
    qrCorners: pick(v.qrCorners, QR_CORNERS, d.qrCorners),
    qrCenter: pick(v.qrCenter, QR_CENTERS, d.qrCenter),
    border: pick(v.border, SIGN_BORDERS, d.border),
    background: pick(v.background, SIGN_BACKGROUNDS, d.background),
    radius: pick(v.radius, SIGN_RADII, d.radius),
  };
}

export function sanitizeBasicChoices(input: unknown): BasicChoices {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return { theme: pick(v.theme, BASIC_THEMES, "classic"), size: pick(v.size, BASIC_SIZES, "tent") };
}

export interface SignContent {
  businessName: string | null;
  /** Social profiles verified as real (their link check found a profile). */
  verifiedSocials: Array<{ platform: string; url: string }>;
}

export interface EffectiveDesign {
  design: SignDesign;
  /** Grow signs carry a tiny "Made with PostScore"; Premium none. */
  credit: boolean;
}

/**
 * What a plan actually prints for a requested design — the one rule the
 * PDF route enforces, whatever the browser sent. Free: nothing. Grow:
 * only its two choices (Style, Size) are read; everything else is the
 * fixed basic sign. Premium/Multi: the full design, with "Follow us" kept
 * honest against the real data. No sign ever prints the Google rating:
 * printing Google Maps content off-platform isn't allowed (see the
 * compliance section of docs/product-structure.md).
 */
export function effectiveDesign(plan: Plan, requested: unknown, content: SignContent, locale: "en" | "es"): EffectiveDesign | null {
  const access = signAccess(plan);
  if (access === "none") return null;
  if (access === "basic") return { design: basicDesign(sanitizeBasicChoices(requested), locale), credit: true };
  const design = sanitizeDesign(requested, locale);
  if (design.follow && !content.verifiedSocials.some((s) => s.url === design.follow)) design.follow = null;
  return { design, credit: false };
}

export function qrStyleOf(design: SignDesign, hasLogo: boolean): QrStyle {
  return { dots: design.qrDots, corners: design.qrCorners, center: design.qrCenter === "logo" && !hasLogo ? "none" : design.qrCenter };
}

// ---- Remembered on this device ----

export const DESIGN_STORAGE_KEY = "postscore.signStudio.v1";
export const BASIC_STORAGE_KEY = "postscore.signBasic.v1";
export const LOGO_STORAGE_KEY = "postscore.signLogo.v1";

export interface StoredLogo {
  dataUrl: string;
  type: string;
  width: number;
  height: number;
  bytes: number;
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode / full / blocked storage: just not remembered.
  }
}

export function parseStoredJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseStoredLogo(raw: string | null): StoredLogo | null {
  const v = parseStoredJson(raw) as Partial<StoredLogo> | null;
  if (!v || typeof v.dataUrl !== "string" || !v.dataUrl.startsWith("data:image/")) return null;
  if (typeof v.type !== "string" || !LOGO_TYPES.includes(v.type)) return null;
  if (typeof v.width !== "number" || typeof v.height !== "number" || v.width <= 0 || v.height <= 0) return null;
  return { dataUrl: v.dataUrl, type: v.type, width: v.width, height: v.height, bytes: typeof v.bytes === "number" ? v.bytes : 0 };
}

export function signFileName(size: SignSize): string {
  const names: Record<SignSize, string> = { tent: "tent-card", card4x6: "4x6", card5x7: "5x7", letter: "full-page", cards4: "4-cards" };
  return `review-sign-${names[size]}.pdf`;
}
