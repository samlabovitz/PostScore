"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locale";

// The active dashboard locale, made available to any client component
// without prop-drilling it through every intermediate layer. Defaults to
// DEFAULT_LOCALE so a component that (incorrectly) reads this outside a
// <LocaleProvider> still gets a real, safe Locale rather than undefined —
// the same never-throws discipline as normalizeLocale() itself.
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Mounted once, in DashboardShell — the one client component every
 * dashboard page already wraps its content in — with the locale
 * DashboardShell already computed via normalizeLocale(business?.language).
 * Nothing else in the app should need to construct this directly.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** The active locale for whatever client component calls this — always a
 * real Locale, never undefined. Server components can't call this (no
 * hooks) — they should keep reading locale as a plain value from the
 * business they already fetch, run through normalizeLocale() themselves. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}
