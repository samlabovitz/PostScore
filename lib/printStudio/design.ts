// Coupon / referral / loyalty card printouts: every choice the Print
// Studio offers, the honest required fields, what each plan may print
// (effectiveCardDesign — the server runs it before building any PDF),
// and saved designs on this device. Built on the Sign Studio's shared
// pieces: plans (signAccess), fonts, themes, contrast check, storage.
// Pure and light; safe on server and client.

import type { QrCenter, QrCorners, QrDots } from "@/lib/reviewQr";
import type { Plan } from "@/lib/plan";
import {
  CUSTOM_HEADLINE_MAX,
  FONT_IDS,
  QR_CENTERS,
  QR_CORNERS,
  QR_DOTS,
  SIGN_LANGUAGES,
  SIGN_TEXT_SIZES,
  SIGN_THEMES,
  THEME_COLORS,
  contrastProblems,
  readStorage,
  signAccess,
  writeStorage,
  type ContrastProblem,
  type FontId,
  type SignColors,
  type SignLanguage,
  type SignTextSize,
  type SignThemeId,
} from "@/lib/signStudio/design";
import { CARD_ICON_IDS, type CardIconId } from "@/lib/printStudio/icons";

export type CardKind = "coupon" | "referral";
export type CardTemplate = "ticket" | "voucher" | "saleBanner" | "minimal" | "giftCard" | "loyalty" | "giveGet" | "friendPass" | "thankYou";
export type CardSize = "wallet" | "card4x6" | "card5x7" | "halfPage" | "fullPage";
export type QrDestination = "review" | "listing" | "website" | "none";
export type CardCorners = "square" | "rounded" | "notch";
export type CardBorder = "none" | "thin" | "double" | "dashed" | "decorative";
export type CardPattern = "none" | "dots" | "lines" | "confetti" | "waves";
export type CardAlign = "left" | "center";
export type LetterSpacing = "tight" | "normal" | "wide";
export type GradientAngle = 0 | 45 | 90;
/** How customers pass a referral on. */
export type PassOn = "tear" | "single" | "digital";
export const PASS_ON: PassOn[] = ["single", "tear", "digital"];

export const COUPON_TEMPLATES: CardTemplate[] = ["ticket", "voucher", "saleBanner", "minimal", "giftCard", "loyalty"];
export const REFERRAL_TEMPLATES: CardTemplate[] = ["giveGet", "friendPass", "thankYou"];
/** The referral templates each way of passing it on can use. */
export const PASS_ON_TEMPLATES: Record<PassOn, CardTemplate[]> = {
  tear: ["giveGet"],
  single: ["friendPass", "thankYou"],
  digital: ["friendPass", "thankYou"],
};

/** Referral templates on the basic (Grow) card: each pass-on choice's
 * first template (Give & Get, Friend pass). The rest are Premium. */
export const BASIC_REFERRAL_TEMPLATES: CardTemplate[] = Array.from(new Set(PASS_ON.map((p) => PASS_ON_TEMPLATES[p][0])));

/** The pass-on choice a referral template needs: Give & Get is the
 * tear-in-half card; the others keep a non-tear choice (Single card by
 * default). */
export function passOnForTemplate(template: CardTemplate, current: PassOn): PassOn {
  if (PASS_ON_TEMPLATES[current].includes(template)) return current;
  return (PASS_ON.find((p) => PASS_ON_TEMPLATES[p].includes(template)) ?? current);
}

/** A referral card's template for its pass-on choice (keeping the
 * owner's pick when it fits). */
export function referralTemplate(passOn: PassOn, requested: CardTemplate | null): CardTemplate {
  const allowed = PASS_ON_TEMPLATES[passOn];
  return requested && allowed.includes(requested) ? requested : allowed[0];
}

export const CARD_SIZES: CardSize[] = ["wallet", "card4x6", "card5x7", "halfPage", "fullPage"];
/** Where a coupon or referral card's QR can lead. Never the review link:
 * a discount or reward card that asks for a review reads as "a reward for
 * a review", which Google's review policy forbids — the review QR lives on
 * the review sign only. A saved "review" falls back to the listing. */
export const QR_DESTINATIONS: QrDestination[] = ["listing", "website", "none"];
export const CARD_CORNERS: CardCorners[] = ["square", "rounded", "notch"];
export const CARD_BORDERS: CardBorder[] = ["none", "thin", "double", "dashed", "decorative"];
export const CARD_PATTERNS: CardPattern[] = ["none", "dots", "lines", "confetti", "waves"];
export const LETTER_SPACINGS: LetterSpacing[] = ["tight", "normal", "wide"];
export const GRADIENT_ANGLES: GradientAngle[] = [0, 45, 90];

/** Card size (landscape, except Full page) and how many fit on a US
 * Letter sheet. 4×6 is 2 per sheet — four 4×6 cards don't fit on 8.5×11. */
export const CARD_SHEETS: Record<CardSize, { w: number; h: number; cols: number; rows: number }> = {
  wallet: { w: 252, h: 144, cols: 2, rows: 4 },
  card4x6: { w: 432, h: 288, cols: 1, rows: 2 },
  card5x7: { w: 504, h: 360, cols: 1, rows: 2 },
  halfPage: { w: 612, h: 396, cols: 1, rows: 2 },
  fullPage: { w: 612, h: 792, cols: 1, rows: 1 },
};
export const LETTER: [number, number] = [612, 792];

/** The smallest printed QR: 0.8 in on wallet cards, 1.2 in on the rest. */
export function minQrPoints(size: CardSize): number {
  return size === "wallet" ? 57.6 : 86.4;
}

export const OFFER_MAX = 60;
export const FINE_PRINT_MAX = 160;
export const NOTE_MAX = 120;
export const CODE_MAX = 12;
export const SERIAL_MAX_COUNT = 500;
export const SAVED_DESIGNS_MAX = 5;
export const PUNCHES_MIN = 5;
export const PUNCHES_MAX = 12;
/** The blank an example offer carries until the owner fills it in. */
export const BLANK = "___";

export interface CardText {
  offer: string;
  /** Referral: what the friend gets / what the referrer gets. */
  friendOffer: string;
  referrerReward: string;
  /** Loyalty: what the last punch earns. */
  loyaltyReward: string;
  punches: number;
  subline: string;
  businessName: string;
  /** YYYY-MM-DD (the owner's own date). */
  expiration: string;
  finePrint: string;
  code: string;
  serial: { on: boolean; start: number; count: number };
}

export interface CardBack {
  finePrint: boolean;
  address: boolean;
  hours: boolean;
  qr: QrDestination;
  note: string;
}

export interface CardDesign extends CardText {
  kind: CardKind;
  /** Referral cards: how customers pass it on (decides the layout). */
  passOn: PassOn;
  template: CardTemplate;
  size: CardSize;
  qr: QrDestination;
  language: SignLanguage;
  headlineFont: FontId;
  bodyFont: FontId;
  textSize: SignTextSize;
  letterSpacing: LetterSpacing;
  headlineBold: boolean;
  headlineItalic: boolean;
  bodyItalic: boolean;
  theme: SignThemeId;
  customColors: SignColors;
  gradient: { on: boolean; to: string; angle: GradientAngle };
  pattern: CardPattern;
  icon: CardIconId | "none";
  showLogo: boolean;
  corners: CardCorners;
  border: CardBorder;
  align: CardAlign;
  show: { headline: boolean; subline: boolean; businessName: boolean; expiration: boolean; finePrint: boolean; code: boolean; qr: boolean; howTo: boolean };
  qrDots: QrDots;
  qrCorners: QrCorners;
  qrCenter: QrCenter;
  doubleSided: boolean;
  back: CardBack;
}

// ---- Wording printed on cards (the card's own language) ----

export const CARD_WORDS = {
  coupon: { en: "Coupon", es: "Cupón" },
  validUntil: { en: "Valid until", es: "Válido hasta" },
  code: { en: "Code", es: "Código" },
  forFriend: { en: "For your friend", es: "Para su amigo" },
  forYou: { en: "For you", es: "Para usted" },
  friendPass: { en: "Friend pass", es: "Pase de amigo" },
  thankYou: { en: "Thank you!", es: "¡Gracias!" },
  passItOn: { en: "Pass this to a friend", es: "Compártalo con un amigo" },
  from: { en: "From", es: "De parte de" },
  loyalty: { en: "Loyalty card", es: "Tarjeta de lealtad" },
  gift: { en: "Gift card", es: "Tarjeta de regalo" },
  hours: { en: "Hours", es: "Horario" },
  scan: { en: "Scan me", es: "Escanéeme" },
  // Under the QR: where it really goes (never "scan to redeem").
  scanReview: { en: "Scan to review us", es: "Escanee para dejar una reseña" },
  scanListing: { en: "Scan for directions & hours", es: "Escanee para ver cómo llegar y el horario" },
  scanWebsite: { en: "Scan to visit our website", es: "Escanee para visitar nuestro sitio web" },
  referredBy: { en: "Referred by", es: "Referido por" },
  showOnPhone: { en: "Show this on your phone at the register", es: "Muestre esto en su teléfono en la caja" },
  howToSingle: {
    en: "Write your name on the line · Give this card to a friend · You get your reward when they use it",
    es: "Escriba su nombre en la línea · Dé esta tarjeta a un amigo · Usted recibe su recompensa cuando la use",
  },
  howToDigital: {
    en: "Forward this to a friend · They show it at the register · You get your reward when they use it",
    es: "Reenvíe esto a un amigo · Lo muestra en la caja · Usted recibe su recompensa cuando lo use",
  },
  unlocks: { en: "Unlocks when your friend uses their half", es: "Se activa cuando su amigo use su mitad" },
  howToHalves: {
    en: "Give this half to a friend · They show it at the register · You get your reward when they do",
    es: "Dé esta mitad a un amigo · La muestra en la caja · Usted recibe su recompensa cuando lo haga",
  },
  howToCard: {
    en: "Give this card to a friend · They show it at the register · You get your reward when they do",
    es: "Dé esta tarjeta a un amigo · La muestra en la caja · Usted recibe su recompensa cuando lo haga",
  },
} as const;

export const EXAMPLES = {
  offer: { en: `${BLANK}% off your next visit`, es: `${BLANK}% de descuento en su próxima visita` },
  friendOffer: { en: `${BLANK} off your first visit`, es: `${BLANK} de descuento en su primera visita` },
  referrerReward: { en: `${BLANK} off your next visit`, es: `${BLANK} de descuento en su próxima visita` },
  loyaltyReward: { en: `${BLANK} free`, es: `${BLANK} gratis` },
  finePrint: {
    en: "One per customer. Can't be combined with other offers. No cash value.",
    es: "Uno por cliente. No se puede combinar con otras ofertas. Sin valor en efectivo.",
  },
} as const;

/** Offer text still holds the example blank (or is empty). */
export function needsFilling(text: string): boolean {
  return text.trim() === "" || text.includes(BLANK) || /_{2,}/.test(text);
}

export type MissingField = "offer" | "friendOffer" | "referrerReward" | "loyaltyReward" | "expiration" | "businessName";

/** What the owner still has to fill in before Download is allowed: the
 * offer(s) in their own words — PostScore never invents one — and, for
 * coupons, an expiration date that isn't already past. */
export function missingFields(d: CardText & { kind: CardKind; template: CardTemplate }, today: string): MissingField[] {
  const missing: MissingField[] = [];
  if (d.kind === "coupon") {
    if (d.template === "loyalty") {
      if (needsFilling(d.loyaltyReward)) missing.push("loyaltyReward");
    } else {
      if (needsFilling(d.offer)) missing.push("offer");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.expiration) || Number.isNaN(Date.parse(d.expiration)) || d.expiration < today) missing.push("expiration");
    }
  } else {
    if (needsFilling(d.friendOffer)) missing.push("friendOffer");
    if (d.template === "giveGet" && needsFilling(d.referrerReward)) missing.push("referrerReward");
  }
  if (!d.businessName.trim()) missing.push("businessName");
  return missing;
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// ---- Defaults ----

export function defaultCardText(locale: "en" | "es", businessName: string): CardText {
  return {
    offer: EXAMPLES.offer[locale],
    friendOffer: EXAMPLES.friendOffer[locale],
    referrerReward: EXAMPLES.referrerReward[locale],
    loyaltyReward: EXAMPLES.loyaltyReward[locale],
    punches: 10,
    subline: "",
    businessName,
    expiration: "",
    finePrint: EXAMPLES.finePrint[locale],
    code: "",
    serial: { on: false, start: 1, count: 100 },
  };
}

export function defaultCardDesign(kind: CardKind, locale: "en" | "es", businessName: string, icon: CardIconId | "none" = "star"): CardDesign {
  return {
    ...defaultCardText(locale, businessName),
    kind,
    // Referral: the simplest way first — a single card.
    passOn: "single",
    template: kind === "coupon" ? "ticket" : "friendPass",
    size: "wallet",
    qr: "listing",
    language: locale,
    headlineFont: "playfair",
    bodyFont: "inter",
    textSize: "medium",
    letterSpacing: "normal",
    headlineBold: true,
    headlineItalic: false,
    bodyItalic: false,
    theme: "classic",
    customColors: { ...THEME_COLORS.classic },
    gradient: { on: false, to: "#e8dcc0", angle: 90 },
    pattern: "none",
    icon,
    showLogo: false,
    corners: "rounded",
    border: "thin",
    align: "center",
    // The tiny "how it works" line is on by default for referral cards.
    show: { headline: true, subline: true, businessName: true, expiration: true, finePrint: true, code: true, qr: true, howTo: kind === "referral" },
    qrDots: "rounded",
    qrCorners: "rounded",
    qrCenter: "none",
    doubleSided: false,
    back: { finePrint: true, address: true, hours: true, qr: "listing", note: "" },
  };
}

/** Grow's basic card: two choices (Style, Size) plus the owner's own
 * text and QR destination. */
export const BASIC_CARD_THEMES = ["classic", "clean"] as const;
export const BASIC_CARD_SIZES = ["wallet", "card4x6"] as const;
export interface BasicCard extends CardText {
  kind: CardKind;
  /** Referral: all three ways are on Grow too. */
  passOn: PassOn;
  theme: (typeof BASIC_CARD_THEMES)[number];
  size: (typeof BASIC_CARD_SIZES)[number];
  qr: QrDestination;
}

export function defaultBasicCard(kind: CardKind, locale: "en" | "es", businessName: string): BasicCard {
  return { ...defaultCardText(locale, businessName), kind, passOn: "single", theme: "classic", size: "wallet", qr: "listing" };
}

/** The one fixed Grow layout, as a full design. */
export function basicCardDesign(basic: BasicCard, locale: "en" | "es"): CardDesign {
  const base = defaultCardDesign(basic.kind, locale, basic.businessName, "none");
  return {
    ...base,
    ...pickText(basic as unknown as Record<string, unknown>),
    passOn: basic.passOn,
    template: basic.kind === "coupon" ? "voucher" : referralTemplate(basic.passOn, null),
    theme: basic.theme,
    size: basic.size,
    qr: basic.qr,
    headlineFont: basic.theme === "clean" ? "inter" : "playfair",
    corners: "square",
    border: "thin",
    // The page's code prints on every plan; numbering is Premium.
    serial: { on: false, start: 1, count: 1 },
  };
}

// ---- Sanitizing (requests and stored designs are untrusted) ----

function pick<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
const HEX = /^#[0-9a-f]{6}$/i;
function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() : fallback;
}
function str(value: unknown, max: number, fallback = ""): string {
  return typeof value === "string" ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, max).join("") : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function int(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function pickText(v: Record<string, unknown>, d?: CardText): CardText {
  const serial = obj(v.serial);
  return {
    offer: str(v.offer, OFFER_MAX, d?.offer),
    friendOffer: str(v.friendOffer, OFFER_MAX, d?.friendOffer),
    referrerReward: str(v.referrerReward, OFFER_MAX, d?.referrerReward),
    loyaltyReward: str(v.loyaltyReward, OFFER_MAX, d?.loyaltyReward),
    punches: int(v.punches, PUNCHES_MIN, PUNCHES_MAX, d?.punches ?? 10),
    subline: str(v.subline, OFFER_MAX * 2, d?.subline),
    businessName: str(v.businessName, 60, d?.businessName),
    expiration: typeof v.expiration === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.expiration) ? v.expiration : "",
    finePrint: str(v.finePrint, FINE_PRINT_MAX, d?.finePrint),
    code: str(v.code, CODE_MAX).toUpperCase().replace(/[^A-Z0-9-]/g, ""),
    serial: {
      on: bool(serial.on, false),
      start: int(serial.start, 1, 99999, 1),
      count: int(serial.count, 1, SERIAL_MAX_COUNT, d?.serial.count ?? 100),
    },
  };
}

export function sanitizeCardDesign(input: unknown, kind: CardKind, locale: "en" | "es", businessName: string): CardDesign {
  const d = defaultCardDesign(kind, locale, businessName);
  const v = obj(input);
  const cc = obj(v.customColors);
  const g = obj(v.gradient);
  const show = obj(v.show);
  const back = obj(v.back);
  const templates = kind === "coupon" ? COUPON_TEMPLATES : REFERRAL_TEMPLATES;
  const passOn = pick(v.passOn, PASS_ON, d.passOn);
  const template = pick(v.template, templates, d.template);
  return {
    ...pickText(v, d),
    kind,
    passOn,
    template: kind === "referral" ? referralTemplate(passOn, template) : template,
    size: pick(v.size, CARD_SIZES, d.size),
    qr: pick(v.qr, QR_DESTINATIONS, d.qr),
    language: pick(v.language, SIGN_LANGUAGES, d.language),
    headlineFont: pick(v.headlineFont, FONT_IDS, d.headlineFont),
    bodyFont: pick(v.bodyFont, FONT_IDS, d.bodyFont),
    textSize: pick(v.textSize, SIGN_TEXT_SIZES, d.textSize),
    letterSpacing: pick(v.letterSpacing, LETTER_SPACINGS, d.letterSpacing),
    headlineBold: bool(v.headlineBold, d.headlineBold),
    headlineItalic: bool(v.headlineItalic, d.headlineItalic),
    bodyItalic: bool(v.bodyItalic, d.bodyItalic),
    theme: pick(v.theme, [...SIGN_THEMES, "custom"] as const, d.theme),
    customColors: {
      background: color(cc.background, d.customColors.background),
      text: color(cc.text, d.customColors.text),
      accent: color(cc.accent, d.customColors.accent),
    },
    gradient: { on: bool(g.on, false), to: color(g.to, d.gradient.to), angle: pick(g.angle, GRADIENT_ANGLES, d.gradient.angle) },
    pattern: pick(v.pattern, CARD_PATTERNS, d.pattern),
    icon: pick(v.icon, [...CARD_ICON_IDS, "none"] as const, d.icon),
    showLogo: bool(v.showLogo, d.showLogo),
    corners: pick(v.corners, CARD_CORNERS, d.corners),
    border: pick(v.border, CARD_BORDERS, d.border),
    align: pick(v.align, ["left", "center"] as const, d.align),
    show: {
      headline: bool(show.headline, true),
      subline: bool(show.subline, true),
      businessName: bool(show.businessName, true),
      expiration: bool(show.expiration, true),
      finePrint: bool(show.finePrint, true),
      code: bool(show.code, true),
      qr: bool(show.qr, true),
      howTo: bool(show.howTo, kind === "referral"),
    },
    qrDots: pick(v.qrDots, QR_DOTS, d.qrDots),
    qrCorners: pick(v.qrCorners, QR_CORNERS, d.qrCorners),
    qrCenter: pick(v.qrCenter, QR_CENTERS, d.qrCenter),
    doubleSided: bool(v.doubleSided, d.doubleSided),
    back: {
      finePrint: bool(back.finePrint, d.back.finePrint),
      address: bool(back.address, d.back.address),
      hours: bool(back.hours, d.back.hours),
      qr: pick(back.qr, QR_DESTINATIONS, d.back.qr),
      note: str(back.note, NOTE_MAX),
    },
  };
}

export function sanitizeBasicCard(input: unknown, kind: CardKind, locale: "en" | "es", businessName: string): BasicCard {
  const d = defaultBasicCard(kind, locale, businessName);
  const v = obj(input);
  return {
    ...pickText(v, d),
    kind,
    passOn: pick(v.passOn, PASS_ON, d.passOn),
    theme: pick(v.theme, BASIC_CARD_THEMES, d.theme),
    size: pick(v.size, BASIC_CARD_SIZES, d.size),
    qr: pick(v.qr, QR_DESTINATIONS, d.qr),
  };
}

// ---- Colors ----

export function cardColors(d: Pick<CardDesign, "theme" | "customColors">): SignColors {
  return d.theme === "custom" ? d.customColors : THEME_COLORS[d.theme];
}

/** The Sign Studio contrast check, also against the gradient's far end. */
export function cardContrastProblems(d: Pick<CardDesign, "theme" | "customColors" | "gradient">): ContrastProblem[] {
  const c = cardColors(d);
  const problems = new Set(contrastProblems(c));
  if (d.gradient.on) for (const p of contrastProblems({ ...c, background: d.gradient.to })) problems.add(p);
  return Array.from(problems);
}

// ---- The QR's destination: only real links ----

export interface CardBusiness {
  businessName: string | null;
  placeId: string | null;
  googleMapsUri: string | null;
  /** The business's own website — never a Facebook/Instagram page. */
  website: string | null;
  address: string | null;
  hours: string[] | null;
  icon: CardIconId;
}

export function qrDestinationUrl(dest: QrDestination, b: Pick<CardBusiness, "placeId" | "googleMapsUri" | "website">, reviewUrl: (placeId: string) => string): string | null {
  if (dest === "review") return b.placeId ? reviewUrl(b.placeId) : null;
  if (dest === "listing") return b.googleMapsUri;
  if (dest === "website") return b.website;
  return null;
}

export function availableDestinations(b: Pick<CardBusiness, "placeId" | "googleMapsUri" | "website">): QrDestination[] {
  return QR_DESTINATIONS.filter((d) => d === "none" || qrDestinationUrl(d, b, () => "x") !== null);
}

// ---- Plans ----

export interface EffectiveCard {
  design: CardDesign;
  /** Grow cards carry a tiny "Made with PostScore"; Premium none. */
  credit: boolean;
}

/**
 * What a plan actually prints for a request — the rule the card PDF
 * route enforces, whatever the browser sent. Free: nothing. Grow: its
 * two choices (Style, Size) and its own text; everything else is the one
 * fixed basic layout. Premium/Multi: the full design. A QR destination
 * the business doesn't really have falls back to none.
 */
export function effectiveCardDesign(plan: Plan, requested: unknown, kind: CardKind, business: CardBusiness, locale: "en" | "es"): EffectiveCard | null {
  const access = signAccess(plan);
  if (access === "none") return null;
  const name = business.businessName ?? "";
  const design =
    access === "basic" ? basicCardDesign(sanitizeBasicCard(requested, kind, locale, name), locale) : sanitizeCardDesign(requested, kind, locale, name);
  const available = availableDestinations(business);
  if (!available.includes(design.qr)) design.qr = "none";
  if (!available.includes(design.back.qr)) design.back.qr = "none";
  return { design, credit: access === "basic" };
}

// ---- Saved on this device (per business) ----

export interface SavedCardDesign {
  id: string;
  name: string;
  design: CardDesign;
}

export interface PrintStudioStore {
  current: Partial<Record<CardKind, CardDesign>>;
  basic: Partial<Record<CardKind, BasicCard>>;
  saved: SavedCardDesign[];
}

export function printStudioStorageKey(businessId: string): string {
  return `postscore.printStudio.${businessId}.v1`;
}

export function loadPrintStudio(businessId: string, locale: "en" | "es", businessName: string): PrintStudioStore {
  const empty: PrintStudioStore = { current: {}, basic: {}, saved: [] };
  const raw = readStorage(printStudioStorageKey(businessId));
  if (!raw) return empty;
  try {
    const v = obj(JSON.parse(raw));
    const current = obj(v.current);
    const basic = obj(v.basic);
    const out: PrintStudioStore = { current: {}, basic: {}, saved: [] };
    for (const kind of ["coupon", "referral"] as CardKind[]) {
      if (current[kind]) out.current[kind] = sanitizeCardDesign(current[kind], kind, locale, businessName);
      if (basic[kind]) out.basic[kind] = sanitizeBasicCard(basic[kind], kind, locale, businessName);
    }
    const saved = Array.isArray(v.saved) ? v.saved : [];
    out.saved = saved.slice(0, SAVED_DESIGNS_MAX).flatMap((s: unknown) => {
      const o = obj(s);
      const design = obj(o.design);
      const kind = design.kind === "referral" ? "referral" : "coupon";
      return typeof o.id === "string" && typeof o.name === "string"
        ? [{ id: o.id, name: str(o.name, 40), design: sanitizeCardDesign(design, kind, locale, businessName) }]
        : [];
    });
    return out;
  } catch {
    return empty;
  }
}

export function savePrintStudio(businessId: string, store: PrintStudioStore): void {
  writeStorage(printStudioStorageKey(businessId), JSON.stringify(store));
}

export const HEADLINE_MAX = CUSTOM_HEADLINE_MAX;
