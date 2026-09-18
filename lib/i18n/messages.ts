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
  | "report.monthHeadingSuffix"
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
  | "report.footer.unsubscribeLinkText";

/** The five report messages that vary by count — see tPlural below. Each
 * has a ".one" and ".other" MessageKey (the only two categories English
 * or Spanish ever produce — see tPlural's own doc comment for how a
 * future locale with more categories, e.g. "few"/"many", would still get
 * a safe result even before every category is seeded for it). */
export type PluralKeyBase =
  | "report.fragment.scoreRose"
  | "report.fragment.scoreDropped"
  | "report.fragment.reviewsGained"
  | "report.fragment.reviewsLost"
  | "report.fragment.listingChanges";

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
    "report.monthHeadingSuffix": " report",

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
  },
  es: {
    "language.en": "Inglés",
    "language.es": "Español",
    "common.save": "Guardar",
    // "common.cancel" intentionally left untranslated for now — t()
    // below falls back to the English string ("Cancel") until this is
    // filled in, so leaving it out is safe rather than a bug.
    //
    // No report.* key has a Spanish value yet — this step only moves the
    // English report copy into the dictionary, so every report.* lookup
    // for "es" falls back to English via t()/tPlural until real Spanish
    // copy is written in a later step.
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
 * Resolves one of the five report messages that vary by count. Asks
 * Intl.PluralRules for `locale`'s REAL plural category for `count` —
 * never hardcoded to just "one"/"other" — so a future locale with more
 * categories (e.g. Arabic's "zero"/"one"/"two"/"few"/"many"/"other", or
 * Polish's "few"/"many") resolves correctly once seeded.
 *
 * Fallback order when `locale` doesn't have that exact category seeded
 * (e.g. "es" today, which has no report.* translations at all yet):
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
export function tPlural(locale: Locale, keyBase: PluralKeyBase, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);
  const dictLocale = messages[locale] as Partial<Record<string, string>>;
  const dictDefault = messages[DEFAULT_LOCALE] as Partial<Record<string, string>>;
  const template =
    dictLocale[`${keyBase}.${category}`] ??
    dictDefault[`${keyBase}.${category}`] ??
    dictLocale[`${keyBase}.other`] ??
    dictDefault[`${keyBase}.other`] ??
    `${keyBase}.other`;
  return interpolate(template, { count });
}
