// Day 23E: "Answer your customers' common questions". Google retired its
// Q&A API on Nov 3, 2025 — PostScore never posts to or promises a Google
// Q&A or FAQ. Google now answers many customers' questions from the
// listing's own details, so this fills in what's missing there: a
// description of 250+ characters, services with prices, and customer
// details (parking, accessibility, payments). Plus an optional "Good to
// know" Google post and a copy-paste FAQ for the owner's own website (with
// schema.org FAQPage markup). Pure.

import { DESCRIPTION_TARGET } from "@/lib/googleRecommendations";
import { WEEK_ORDER, formatTime, type WeeklyHours } from "@/lib/gbpProfileEdits";

/** The week's hours in the business's language, Monday first, for the website FAQ:
 * "Monday: Closed" / "Lunes: cerrado", "Tuesday: 9:30 AM – 5:00 PM" / "Martes: 9:30 – 17:00". */
export function hoursLines(week: WeeklyHours, locale: "en" | "es"): string[] {
  const dayName = (d: number) => {
    const n = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + d, 12)));
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  return WEEK_ORDER.map((d) => {
    const day = week[d];
    const value =
      day.mode === "closed"
        ? locale === "es" ? "cerrado" : "Closed"
        : day.mode === "open24"
          ? locale === "es" ? "abierto las 24 horas" : "Open 24 hours"
          : day.ranges.map((r) => `${formatTime(r.open, locale)} – ${formatTime(r.close, locale)}`).join(", ");
    return `${dayName(d)}: ${value}`;
  });
}

export type AnswerPart = "description" | "services" | "details";
export type DetailPart = "parking" | "accessibility" | "payment";
export const DETAIL_PARTS: readonly DetailPart[] = ["parking", "accessibility", "payment"];

export interface AnswersPlan {
  missing: AnswerPart[];
  /** details: which of the three groups have nothing set. */
  details: DetailPart[];
  /** services: none listed, or none has a price. */
  services: "none" | "no_prices" | null;
  minutes: number;
}

const MINUTES: Record<AnswerPart, number> = { description: 5, services: 3, details: 1 };

/** What's missing from the listing for Google to answer customers'
 * questions. Unread parts (undefined / null) are skipped, never guessed.
 * null: nothing missing. */
export function answersPlan(input: {
  description?: string | null;
  services?: string[] | null;
  /** How many of the listing's services have a price; undefined: not read. */
  pricedServices?: number | null;
  details?: { payment: boolean; parking: boolean; accessibility: boolean } | null;
}): AnswersPlan | null {
  const missing: AnswerPart[] = [];
  if (input.description !== undefined && (input.description ?? "").trim().length < DESCRIPTION_TARGET) missing.push("description");
  let services: AnswersPlan["services"] = null;
  if (input.services) {
    if (input.services.length === 0) services = "none";
    else if (typeof input.pricedServices === "number" && input.pricedServices === 0) services = "no_prices";
    if (services) missing.push("services");
  }
  const details = input.details ? DETAIL_PARTS.filter((p) => !input.details![p]) : [];
  if (details.length > 0) missing.push("details");
  if (missing.length === 0) return null;
  const minutes = missing.reduce((s, p) => s + (p === "details" ? details.length * MINUTES.details : MINUTES[p]), 0);
  return { missing, details, services, minutes };
}

// ---------------------------------------------------------------------------
// Services with prices
// ---------------------------------------------------------------------------

/** "$45", "45", "45.50" → 45.5; null when it isn't a plain amount. */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw < 100_000 ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== "string") return null;
  const m = raw.trim().replace(/,/g, "").match(/^\$?\s?(\d{1,5}(?:\.\d{1,2})?)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Google's Money for a price in US dollars. */
export function usdMoney(amount: number): { currencyCode: "USD"; units: string; nanos?: number } {
  const units = Math.floor(amount);
  const nanos = Math.round((amount - units) * 100) * 10_000_000;
  return nanos ? { currencyCode: "USD", units: String(units), nanos } : { currencyCode: "USD", units: String(units) };
}

/** The owner's PostScore price for a service ("Women's cut" ↔ "womens cut"). */
const norm = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9áéíóúñü]+/g, " ").trim();
export function ownerPriceFor(service: string, prices: Array<{ service: string; price: number | null }>): number | null {
  const n = norm(service);
  const hit = prices.find((p) => p.price !== null && norm(p.service) === n);
  return hit?.price ?? null;
}

export const priceText = (amount: number) => `$${amount % 1 === 0 ? amount : amount.toFixed(2)}`;

// ---------------------------------------------------------------------------
// Customer details in natural words — never Google's raw attribute ids
// ---------------------------------------------------------------------------

type Words = { label: string; phrase: string };
/** Each detail's choice label and the words generated text uses (EN / ES). */
export const DETAIL_WORDS: Record<string, { en: Words; es: Words }> = {
  has_parking_street_free: { en: { label: "Free street parking", phrase: "free street parking" }, es: { label: "Estacionamiento gratis en la calle", phrase: "estacionamiento gratis en la calle" } },
  has_parking_street_paid: { en: { label: "Paid street parking", phrase: "paid street parking" }, es: { label: "Estacionamiento de pago en la calle", phrase: "estacionamiento de pago en la calle" } },
  has_parking_lot_free: { en: { label: "Free parking lot", phrase: "a free parking lot" }, es: { label: "Estacionamiento gratis", phrase: "estacionamiento gratis" } },
  has_parking_lot_paid: { en: { label: "Paid parking lot", phrase: "a paid parking lot" }, es: { label: "Estacionamiento de pago", phrase: "estacionamiento de pago" } },
  has_parking_garage_free: { en: { label: "Free parking garage", phrase: "a free parking garage" }, es: { label: "Garaje gratis", phrase: "garaje gratis" } },
  has_parking_garage_paid: { en: { label: "Paid parking garage", phrase: "a paid parking garage" }, es: { label: "Garaje de pago", phrase: "garaje de pago" } },
  has_valet_parking: { en: { label: "Valet parking", phrase: "valet parking" }, es: { label: "Servicio de valet", phrase: "servicio de valet" } },
  pay_credit_card: { en: { label: "Credit cards", phrase: "credit cards" }, es: { label: "Tarjetas de crédito", phrase: "tarjetas de crédito" } },
  pay_debit_card: { en: { label: "Debit cards", phrase: "debit cards" }, es: { label: "Tarjetas de débito", phrase: "tarjetas de débito" } },
  pay_mobile_nfc: { en: { label: "Mobile payments (Apple Pay / Google Pay)", phrase: "mobile payments (Apple Pay / Google Pay)" }, es: { label: "Pagos con el teléfono (Apple Pay / Google Pay)", phrase: "pagos con el teléfono (Apple Pay / Google Pay)" } },
  requires_cash_only: { en: { label: "Cash only", phrase: "cash only" }, es: { label: "Solo efectivo", phrase: "solo efectivo" } },
  pay_check: { en: { label: "Checks", phrase: "checks" }, es: { label: "Cheques", phrase: "cheques" } },
  has_wheelchair_accessible_entrance: { en: { label: "Wheelchair-accessible entrance", phrase: "a wheelchair-accessible entrance" }, es: { label: "Entrada accesible en silla de ruedas", phrase: "entrada accesible en silla de ruedas" } },
  has_wheelchair_accessible_restroom: { en: { label: "Wheelchair-accessible restroom", phrase: "a wheelchair-accessible restroom" }, es: { label: "Baño accesible en silla de ruedas", phrase: "baño accesible en silla de ruedas" } },
  has_wheelchair_accessible_seating: { en: { label: "Wheelchair-accessible seating", phrase: "wheelchair-accessible seating" }, es: { label: "Asientos accesibles en silla de ruedas", phrase: "asientos accesibles en silla de ruedas" } },
  has_wheelchair_accessible_parking: { en: { label: "Wheelchair-accessible parking", phrase: "wheelchair-accessible parking" }, es: { label: "Estacionamiento accesible en silla de ruedas", phrase: "estacionamiento accesible en silla de ruedas" } },
};

/** A raw Google attribute id or its machine label ("attributes/pay_mobile_nfc", "has parking street free"). */
export const RAW_ATTRIBUTE = /\b(?:attributes\/)?(?:has|pay|requires|is|welcomes|serves|offers)_[a-z_]+\b|\b(?:has (?:parking|wheelchair|valet|restroom|onsite|changing)|pay (?:credit|debit|mobile|check)|requires cash)\b/i;

const bare = (id: string) => id.replace(/^attributes\//, "");

/** The choice's label: PostScore's words for the detail, else Google's own
 * label when it isn't a raw id, else the id made readable. */
export function detailLabel(id: string, googleLabel: string | null | undefined, locale: "en" | "es"): string {
  const w = DETAIL_WORDS[bare(id)];
  if (w) return w[locale].label;
  if (googleLabel && !RAW_ATTRIBUTE.test(googleLabel) && !googleLabel.includes("_")) return googleLabel;
  const words = bare(id).replace(/^(has|pay|requires|is|welcomes|serves|offers)_/, "").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The words generated text uses (lowercase, natural). */
export function detailPhrase(id: string, googleLabel: string | null | undefined, locale: "en" | "es"): string {
  const w = DETAIL_WORDS[bare(id)];
  if (w) return w[locale].phrase;
  const label = detailLabel(id, googleLabel, locale);
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
}

// ---------------------------------------------------------------------------
// The FAQ for the owner's website, and the "Good to know" lines
// ---------------------------------------------------------------------------

export interface AnswerFacts {
  name: string;
  city: string | null;
  /** "Monday: 9:00 AM – 7:00 PM", as Google shows them. */
  hours: string[] | null;
  /** What's set to yes, in natural words (detailPhrase) — never raw ids. */
  parking: string[];
  accessibility: string[];
  payments: string[];
  services: Array<{ name: string; price: number | null }>;
  bookingUrl: string | null;
}

const list = (items: string[], locale: "en" | "es") => {
  const xs = items;
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} ${locale === "es" ? "y" : "and"} ${xs[xs.length - 1]}`;
};

/** The short answers for a "Good to know" post. */
export function goodToKnowAnswers(f: AnswerFacts, locale: "en" | "es"): string[] {
  const out: string[] = [];
  if (f.parking.length) out.push((locale === "es" ? "hay " : "there's ") + list(f.parking, locale));
  if (f.payments.length) out.push(locale === "es" ? `aceptamos ${list(f.payments, locale)}` : `we accept ${list(f.payments, locale)}`);
  if (f.accessibility.length) out.push((locale === "es" ? "hay " : "there's ") + list(f.accessibility, locale));
  const priced = f.services.filter((s) => s.price !== null).slice(0, 3);
  if (priced.length) out.push(priced.map((s) => `${s.name} ${locale === "es" ? "desde" : "from"} ${priceText(s.price!)}`).join(", "));
  if (f.bookingUrl) out.push(locale === "es" ? "puede reservar en línea" : "you can book online");
  return out;
}

export interface FaqEntry {
  q: string;
  a: string;
}

/** Questions customers ask, answered ONLY from the listing's confirmed facts. */
export function faqEntries(f: AnswerFacts, locale: "en" | "es"): FaqEntry[] {
  const es = locale === "es";
  const out: FaqEntry[] = [];
  if (f.hours && f.hours.length) out.push({ q: es ? `¿Cuál es el horario de ${f.name}?` : `What are ${f.name}'s hours?`, a: f.hours.join("; ").replace(/\.?$/, ".") });
  if (f.parking.length) out.push({ q: es ? "¿Hay estacionamiento?" : "Is there parking?", a: (es ? "Sí, hay " : "Yes, there's ") + list(f.parking, locale) + "." });
  if (f.payments.length) out.push({ q: es ? "¿Qué formas de pago aceptan?" : "What payment methods do you accept?", a: (es ? "Aceptamos " : "We accept ") + list(f.payments, locale) + "." });
  if (f.accessibility.length) out.push({ q: es ? "¿Es accesible para sillas de ruedas?" : "Is it wheelchair accessible?", a: (es ? "Sí, hay " : "Yes, there's ") + list(f.accessibility, locale) + "." });
  const priced = f.services.filter((s) => s.price !== null);
  if (priced.length) out.push({ q: es ? "¿Cuánto cuestan sus servicios?" : "How much do your services cost?", a: priced.slice(0, 8).map((s) => `${s.name}: ${es ? "desde" : "from"} ${priceText(s.price!)}`).join("; ") + "." });
  else if (f.services.length) out.push({ q: es ? "¿Qué servicios ofrecen?" : "What services do you offer?", a: f.services.slice(0, 10).map((s) => s.name).join(", ") + "." });
  if (f.bookingUrl) out.push({ q: es ? "¿Puedo reservar en línea?" : "Can I book online?", a: (es ? "Sí, puede reservar en línea aquí: " : "Yes, you can book online here: ") + f.bookingUrl });
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The FAQ block for the owner's website: the questions in plain HTML plus
 * schema.org FAQPage JSON-LD with the same text. Copy only. */
export function faqHtml(entries: FaqEntry[], locale: "en" | "es"): string {
  if (entries.length === 0) return "";
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((e) => ({ "@type": "Question", name: e.q, acceptedAnswer: { "@type": "Answer", text: e.a } })),
  };
  const json = JSON.stringify(ld, null, 2).replace(/</g, "\\u003c");
  return [
    `<section class="faq">`,
    `  <h2>${locale === "es" ? "Preguntas frecuentes" : "Frequently asked questions"}</h2>`,
    ...entries.flatMap((e) => [`  <h3>${esc(e.q)}</h3>`, `  <p>${esc(e.a)}</p>`]),
    `</section>`,
    `<script type="application/ld+json">`,
    json,
    `</script>`,
  ].join("\n");
}
