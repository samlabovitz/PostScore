"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";
import { DEFAULT_BUSINESS_TIMEZONE } from "./format";

// The active dashboard locale, made available to any client component
// without prop-drilling it through every intermediate layer. Defaults to
// DEFAULT_LOCALE so a component that (incorrectly) reads this outside a
// <LocaleProvider> still gets a real, safe Locale rather than undefined —
// the same never-throws discipline as normalizeLocale() itself.
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);
// The business's own IANA time zone (from its Google location — see
// lib/businessTimeZone.ts), for every date shown under the shell.
const TimeZoneContext = createContext<string>(DEFAULT_BUSINESS_TIMEZONE);

/**
 * Mounted once, in DashboardShell — the one client component every
 * dashboard page already wraps its content in — with the locale
 * DashboardShell already computed via normalizeLocale(business?.language).
 * Nothing else in the app should need to construct this directly.
 */
export function LocaleProvider({
  locale,
  timeZone,
  children,
}: {
  locale: Locale;
  /** The business's time zone; omitted/null falls back to New York. */
  timeZone?: string | null;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={locale}>
      <TimeZoneContext.Provider value={timeZone || DEFAULT_BUSINESS_TIMEZONE}>{children}</TimeZoneContext.Provider>
    </LocaleContext.Provider>
  );
}

/** The active locale for whatever client component calls this — always a
 * real Locale, never undefined. Server components can't call this (no
 * hooks) — they should keep reading locale as a plain value from the
 * business they already fetch, run through normalizeLocale() themselves. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The business's time zone for dates — pass it to formatShortDate &
 * co. Falls back to DEFAULT_BUSINESS_TIMEZONE (New York) when unknown. */
export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
