import { DEFAULT_LOCALE, type Locale } from "./locale";

// Every UI string this app knows how to show in more than one language.
// Adding a new string is one new MessageKey plus one entry per locale
// below; adding a new locale (see locale.ts) doesn't require touching the
// key list, only a new entry in `messages`.
export type MessageKey =
  | "language.en"
  | "language.es"
  | "common.save"
  | "common.cancel"
  | "common.and"
  // --- Monthly report email (emails/MonthlyReportEmail.tsx) ---
  | "report.subject"
  | "report.monthHeading"
  | "report.headline.baseline"
  | "report.headline.steady"
  | "report.tone.positive"
  | "report.tone.negative"
  | "report.fragment.scoreRose.one"
  | "report.fragment.scoreRose.other"
  | "report.fragment.scoreDropped.one"
  | "report.fragment.scoreDropped.other"
  | "report.fragment.gradeChanged"
  | "report.fragment.reviewsGained.one"
  | "report.fragment.reviewsGained.other"
  | "report.fragment.reviewsLost.one"
  | "report.fragment.reviewsLost.other"
  | "report.fragment.ratingRose"
  | "report.fragment.ratingDropped"
  | "report.fragment.competitorUp"
  | "report.fragment.competitorDown"
  | "report.fragment.listingChanges.one"
  | "report.fragment.listingChanges.other"
  | "report.label.rating"
  | "report.label.reviewCount"
  | "report.unmeasured.rating"
  | "report.unmeasured.reviewCount"
  | "report.metric.notMeasuredPrefix"
  | "report.metric.noPrior"
  | "report.metric.unchanged"
  | "report.metric.delta"
  | "report.score.summary"
  | "report.score.sinceLastReport"
  | "report.focus.label"
  | "report.focus.nothingNotable"
  | "report.competitorSection.label"
  | "report.competitorSection.unavailable"
  | "report.competitorSection.rank"
  | "report.competitorSection.same"
  | "report.competitorSection.movedUp"
  | "report.competitorSection.movedDown"
  | "report.listingSection.label"
  | "report.listingSection.unavailable"
  | "report.listingSection.none"
  | "report.baselineNote"
  | "report.footer.enabledForPrefix"
  | "report.footer.unsubscribeLinkText"
  // --- Dashboard: Competitors page (app/business/[id]/competitors/CompetitorsView.tsx) ---
  // Naming convention for the whole dashboard rollout: dashboard.<section>.<key>.
  | "dashboard.competitors.title"
  | "dashboard.competitors.subtitle"
  | "dashboard.competitors.categoryClause"
  | "dashboard.competitors.backTo"
  | "dashboard.competitors.businessFallback"
  | "dashboard.competitors.rankedHeading"
  | "dashboard.competitors.rankSuffix"
  | "dashboard.competitors.unscoredHeading"
  | "dashboard.competitors.nothingToCompare"
  | "dashboard.competitors.noRating"
  | "dashboard.competitors.reviewCount.one"
  | "dashboard.competitors.reviewCount.other"
  | "dashboard.competitors.noReviewCount"
  | "dashboard.competitors.hasWebsite"
  | "dashboard.competitors.noWebsite"
  | "dashboard.competitors.milesSuffix"
  | "dashboard.competitors.yourBusiness"
  | "dashboard.competitors.noAddress"
  | "dashboard.competitors.postscoreOutOf100"
  | "dashboard.competitors.savingScan"
  | "dashboard.competitors.saveScan"
  | "dashboard.competitors.saved"
  | "dashboard.competitors.noComparableCompetitors"
  | "dashboard.competitors.saveError";

/** The report/dashboard messages that vary by count — see tPlural below.
 * Each has a ".one" and ".other" MessageKey (the only two categories
 * English or Spanish ever produce — see tPlural's own doc comment for
 * how a future locale with more categories, e.g. "few"/"many", would
 * still get a safe result even before every category is seeded for it). */
export type PluralKeyBase =
  | "report.fragment.scoreRose"
  | "report.fragment.scoreDropped"
  | "report.fragment.reviewsGained"
  | "report.fragment.reviewsLost"
  | "report.fragment.listingChanges"
  | "dashboard.competitors.reviewCount";

// English is the dictionary every other locale falls back to via t()
// below, so it's kept fully seeded. Other locales are deliberately
// allowed to lag behind it — a real translation effort fills in the rest
// over time — so this is Partial rather than a full Record<MessageKey,
// string> per locale: a locale missing a key is a normal, safe state that
// t() handles below, never a compile-time or runtime error.
//
// Every report.* value below reproduces the exact English text
// MonthlyReportEmail.tsx used to hardcode — this dictionary is a pure
// extraction, not a rewrite, so nothing about the rendered report
// changes yet. es intentionally has none of the report.* keys yet: no
// Spanish report copy has been written, so every one of them currently
// falls back to English via t()/tPlural.
type LocaleMessages = Partial<Record<MessageKey, string>>;

export const messages: Record<Locale, LocaleMessages> = {
  en: {
    "language.en": "English",
    "language.es": "Spanish",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.and": "and",

    "report.subject": "{businessName} — your {month} PostScore report",
    "report.monthHeading": "{month} report",

    "report.headline.baseline": "Your baseline is set — welcome to PostScore. Here's where you stand today.",
    "report.headline.steady": "A steady month — your presence held its ground.",

    "report.tone.positive": "Great progress this month.",
    "report.tone.negative": "It happens — here's what to focus on to turn it around.",

    "report.fragment.scoreRose.one": "your score rose {count} point",
    "report.fragment.scoreRose.other": "your score rose {count} points",
    "report.fragment.scoreDropped.one": "your score dropped {count} point",
    "report.fragment.scoreDropped.other": "your score dropped {count} points",
    "report.fragment.gradeChanged": "your grade changed to {grade}",
    "report.fragment.reviewsGained.one": "you gained {count} review",
    "report.fragment.reviewsGained.other": "you gained {count} reviews",
    "report.fragment.reviewsLost.one": "you lost {count} review",
    "report.fragment.reviewsLost.other": "you lost {count} reviews",
    "report.fragment.ratingRose": "your rating rose to {value}★",
    "report.fragment.ratingDropped": "your rating dropped to {value}★",
    "report.fragment.competitorUp": "you moved up to #{rank} of {total}",
    "report.fragment.competitorDown": "you moved down to #{rank} of {total}",
    "report.fragment.listingChanges.one": "there was {count} listing change",
    "report.fragment.listingChanges.other": "there were {count} listing changes",

    "report.label.rating": "Rating",
    "report.label.reviewCount": "Review count",
    "report.unmeasured.rating": "this scan didn't include a real rating value.",
    "report.unmeasured.reviewCount": "this scan didn't include a real review count.",
    "report.metric.notMeasuredPrefix": "Not measured this period — ",
    "report.metric.noPrior": "{value} (no prior report to compare against)",
    "report.metric.unchanged": "{value} — unchanged",
    "report.metric.delta": "{value} ({delta} vs. last report)",

    "report.score.summary": "{total}/100 · {grade}",
    "report.score.sinceLastReport": "{delta} since last report",

    "report.focus.label": "This month & what to focus on",
    "report.focus.nothingNotable":
      "Nothing notable to flag this month — your listing and site are in strong shape across the board.",

    "report.competitorSection.label": "Competitor standing",
    "report.competitorSection.unavailable": "Not tracked this period — no competitor scan is available to compare.",
    "report.competitorSection.rank": "#{rank} of {total} nearby",
    "report.competitorSection.same": "Same as your last report.",
    "report.competitorSection.movedUp": "Moved up from #{rank} last report.",
    "report.competitorSection.movedDown": "Moved down from #{rank} last report.",

    "report.listingSection.label": "Listing changes",
    "report.listingSection.unavailable":
      "Not available for this comparison — one of the two scans predates listing-change tracking, or this is your first report.",
    "report.listingSection.none": "No other listing changes detected this month.",

    "report.baselineNote":
      "This is your first PostScore report — a real baseline, not a trend. Next month's report will show real month-over-month change.",

    "report.footer.enabledForPrefix": "You're receiving this because monthly email reports are on for ",
    "report.footer.unsubscribeLinkText": "Unsubscribe from these reports",

    "dashboard.competitors.title": "Competitors",
    "dashboard.competitors.subtitle":
      "Real nearby {competitorNoun}{categoryClause}, scored with the same PostScore engine and ranked strictly by that score.",
    "dashboard.competitors.categoryClause": " in the same category ({categoryLabel})",
    "dashboard.competitors.backTo": "Back to {name}",
    "dashboard.competitors.businessFallback": "business",
    "dashboard.competitors.rankedHeading": "Ranked by PostScore{rankSuffix}",
    "dashboard.competitors.rankSuffix": " — you're #{rank} of {total}",
    "dashboard.competitors.unscoredHeading": "Found nearby, but couldn't be scored",
    "dashboard.competitors.nothingToCompare":
      "Your PostScore ({total}) is shown above with nothing to compare it to yet — widen your search area or check back later as more listings appear nearby.",
    "dashboard.competitors.noRating": "No rating",
    "dashboard.competitors.reviewCount.one": "{count} review",
    "dashboard.competitors.reviewCount.other": "{count} reviews",
    "dashboard.competitors.noReviewCount": "No review count",
    "dashboard.competitors.hasWebsite": "Has website",
    "dashboard.competitors.noWebsite": "No website",
    "dashboard.competitors.milesSuffix": " mi",
    "dashboard.competitors.yourBusiness": "Your business",
    "dashboard.competitors.noAddress": "No address on file",
    "dashboard.competitors.postscoreOutOf100": "PostScore / 100",
    "dashboard.competitors.savingScan": "Saving scan...",
    "dashboard.competitors.saveScan": "Save this scan to history",
    "dashboard.competitors.saved": "Saved.",
    "dashboard.competitors.noComparableCompetitors":
      "Nothing to save — no comparable competitors were found.",
    "dashboard.competitors.saveError": "Could not save this scan.",
  },
  es: {
    "language.en": "Inglés",
    "language.es": "Español",
    "common.save": "Guardar",
    // "common.cancel" intentionally left untranslated for now — t()
    // below falls back to the English string ("Cancel") until this is
    // filled in, so leaving it out is safe rather than a bug.
    "common.and": "y",

    "report.subject": "{businessName} — su informe PostScore de {month}",
    "report.monthHeading": "Informe de {month}",

    "report.headline.baseline":
      "Su punto de partida está definido — le damos la bienvenida a PostScore. Aquí es donde se encuentra hoy.",
    "report.headline.steady": "Un mes estable — su presencia se mantuvo firme.",

    "report.tone.positive": "Excelente progreso este mes.",
    "report.tone.negative": "Son cosas que pasan — esto es en lo que conviene concentrarse para darle la vuelta.",

    "report.fragment.scoreRose.one": "su puntuación subió {count} punto",
    "report.fragment.scoreRose.other": "su puntuación subió {count} puntos",
    "report.fragment.scoreDropped.one": "su puntuación bajó {count} punto",
    "report.fragment.scoreDropped.other": "su puntuación bajó {count} puntos",
    "report.fragment.gradeChanged": "su nota cambió a {grade}",
    "report.fragment.reviewsGained.one": "sumó {count} reseña",
    "report.fragment.reviewsGained.other": "sumó {count} reseñas",
    "report.fragment.reviewsLost.one": "perdió {count} reseña",
    "report.fragment.reviewsLost.other": "perdió {count} reseñas",
    "report.fragment.ratingRose": "su calificación subió a {value}★",
    "report.fragment.ratingDropped": "su calificación bajó a {value}★",
    "report.fragment.competitorUp": "subió al puesto #{rank} de {total}",
    "report.fragment.competitorDown": "bajó al puesto #{rank} de {total}",
    "report.fragment.listingChanges.one": "hubo {count} cambio en su ficha",
    "report.fragment.listingChanges.other": "hubo {count} cambios en su ficha",

    "report.label.rating": "Calificación",
    "report.label.reviewCount": "Número de reseñas",
    "report.unmeasured.rating": "este análisis no incluyó un valor de calificación real.",
    "report.unmeasured.reviewCount": "este análisis no incluyó un número de reseñas real.",
    "report.metric.notMeasuredPrefix": "No se midió en este período — ",
    "report.metric.noPrior": "{value} (no hay informe anterior con el que comparar)",
    "report.metric.unchanged": "{value} — sin cambios",
    "report.metric.delta": "{value} ({delta} frente al informe anterior)",

    // report.score.summary intentionally has no Spanish value — it's pure
    // placeholders ("{total}/100 · {grade}"), so it stays on the English
    // fallback rather than a translation with nothing to actually
    // translate.
    "report.score.sinceLastReport": "{delta} desde el último informe",

    "report.focus.label": "Este mes y en qué concentrarse",
    "report.focus.nothingNotable":
      "Nada notable que señalar este mes — su ficha y su sitio web están en muy buena forma en todos los aspectos.",

    "report.competitorSection.label": "Posición frente a la competencia",
    "report.competitorSection.unavailable":
      "Sin seguimiento en este período — no hay ningún análisis de la competencia disponible para comparar.",
    "report.competitorSection.rank": "#{rank} de {total} en la zona",
    "report.competitorSection.same": "Igual que en su último informe.",
    "report.competitorSection.movedUp": "Subió desde el puesto #{rank} del informe anterior.",
    "report.competitorSection.movedDown": "Bajó desde el puesto #{rank} del informe anterior.",

    "report.listingSection.label": "Cambios en la ficha",
    "report.listingSection.unavailable":
      "No disponible para esta comparación — uno de los dos análisis es anterior al seguimiento de cambios en la ficha, o este es su primer informe.",
    "report.listingSection.none": "No se detectaron otros cambios en la ficha este mes.",

    "report.baselineNote":
      "Este es su primer informe de PostScore — un verdadero punto de partida, no una tendencia. El informe del próximo mes mostrará el cambio real de un mes a otro.",

    "report.footer.enabledForPrefix": "Está recibiendo esto porque los informes mensuales por correo están activados para ",
    "report.footer.unsubscribeLinkText": "Darse de baja de estos informes",

    "dashboard.competitors.title": "Competencia",
    "dashboard.competitors.subtitle":
      "{competitorNoun} reales cercanos{categoryClause}, evaluados con el mismo motor de PostScore y ordenados estrictamente por esa puntuación.",
    "dashboard.competitors.categoryClause": " en la misma categoría ({categoryLabel})",
    "dashboard.competitors.backTo": "Volver a {name}",
    "dashboard.competitors.businessFallback": "negocio",
    "dashboard.competitors.rankedHeading": "Ordenados por PostScore{rankSuffix}",
    "dashboard.competitors.rankSuffix": " — usted es el #{rank} de {total}",
    "dashboard.competitors.unscoredHeading": "Encontrados cerca, pero no se pudieron evaluar",
    "dashboard.competitors.nothingToCompare":
      "Su PostScore ({total}) se muestra arriba, pero aún no hay nada con qué compararlo — amplíe su área de búsqueda o vuelva más tarde a medida que aparezcan más negocios cerca.",
    "dashboard.competitors.noRating": "Sin calificación",
    "dashboard.competitors.reviewCount.one": "{count} reseña",
    "dashboard.competitors.reviewCount.other": "{count} reseñas",
    "dashboard.competitors.noReviewCount": "Sin número de reseñas",
    "dashboard.competitors.hasWebsite": "Tiene sitio web",
    "dashboard.competitors.noWebsite": "Sin sitio web",
    "dashboard.competitors.milesSuffix": " mi",
    "dashboard.competitors.yourBusiness": "Su negocio",
    "dashboard.competitors.noAddress": "Sin dirección registrada",
    "dashboard.competitors.postscoreOutOf100": "PostScore / 100",
    // savingScan, saveScan, saved, noComparableCompetitors, and
    // saveError have no Spanish value yet — not part of the reviewed
    // list this was translated from. Each falls back to English via
    // t()/tPlural until reviewed Spanish copy is provided for them.
  },
};

/** Substitutes every {name} placeholder in `template` with String(params[name]),
 * leaving any placeholder with no matching param untouched rather than
 * guessing or throwing. */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

/**
 * Looks up `key` in `locale`'s dictionary, falls back to the English
 * string if that locale hasn't translated this key yet (and to the raw
 * key itself if even English is somehow missing it — never blank/
 * undefined), then substitutes any `params` into the resolved template.
 */
export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
  return interpolate(template, params);
}

/**
 * Resolves one of the report/dashboard messages that vary by count. Asks
 * Intl.PluralRules for `locale`'s REAL plural category for `count` —
 * never hardcoded to just "one"/"other" — so a future locale with more
 * categories (e.g. Arabic's "zero"/"one"/"two"/"few"/"many"/"other", or
 * Polish's "few"/"many") resolves correctly once seeded.
 *
 * `count` always drives the REAL plural-category selection, but the
 * value actually interpolated for `{count}` in the template defaults to
 * `count` itself and can be overridden via `params.count` — e.g. passing
 * the locale-formatted `entry.reviewCount.toLocaleString()` ("1,234") as
 * `params.count` while still passing the raw number as `count` so
 * Intl.PluralRules sees the real number, not a formatted string. Any
 * other `{name}` placeholder in the template comes from `params` the
 * same way t() handles it.
 *
 * Fallback order when `locale` doesn't have that exact category seeded
 * (e.g. "es" today, which has no report.* or dashboard.* translations
 * at all yet):
 *   1. `locale`'s own text for this exact category
 *   2. English's text for this SAME exact category — this is the common
 *      case for an untranslated locale, and matters: it keeps the right
 *      grammatical number (singular vs. plural) even while only English
 *      copy exists, rather than jumping straight to English's "other"
 *      and showing a plural where the real count is 1.
 *   3. `locale`'s own "other" text (covers a locale that has translated
 *      some categories but not this one)
 *   4. English's "other" text
 *   5. the raw key, as an absolute last resort
 * Never blank/undefined at any step.
 */
export function tPlural(
  locale: Locale,
  keyBase: PluralKeyBase,
  count: number,
  params: Record<string, string | number> = {}
): string {
  const category = new Intl.PluralRules(locale).select(count);
  const dictLocale = messages[locale] as Partial<Record<string, string>>;
  const dictDefault = messages[DEFAULT_LOCALE] as Partial<Record<string, string>>;
  const template =
    dictLocale[`${keyBase}.${category}`] ??
    dictDefault[`${keyBase}.${category}`] ??
    dictLocale[`${keyBase}.other`] ??
    dictDefault[`${keyBase}.other`] ??
    `${keyBase}.other`;
  return interpolate(template, { count, ...params });
}
