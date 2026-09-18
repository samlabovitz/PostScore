// Locale plumbing: the single source of truth for which locales this app
// supports. Adding a new locale is meant to be exactly one line in the
// Locale union below and one line in SUPPORTED_LOCALES — nothing else in
// this module (or in normalizeLocale) needs to change.

export type Locale = "en" | "es";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es"];

export const DEFAULT_LOCALE: Locale = "en";

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolves any input — a `businesses.language` column value, a header, a
 * query param, whatever — to a real, supported Locale. Never throws and
 * never returns a value outside SUPPORTED_LOCALES: a bad, unknown, or
 * missing value always safely falls back to DEFAULT_LOCALE instead of
 * crashing a render.
 */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (typeof value === "string" && isLocale(value)) {
    return value;
  }
  return DEFAULT_LOCALE;
}
