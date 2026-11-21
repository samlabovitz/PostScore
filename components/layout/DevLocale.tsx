"use client";

// Local development only: the language override from the dev cookie
// (lib/viewLocale.server.ts devLocaleOverride), handed to DashboardShell
// so scripts/devShot.ts --lang=es shows a page in Spanish without
// changing the business's saved language. Always null in production.

import { createContext, useContext, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n";

const DevLocaleContext = createContext<Locale | null>(null);

export function DevLocaleProvider({ value, children }: { value: Locale | null; children: ReactNode }) {
  return <DevLocaleContext.Provider value={value}>{children}</DevLocaleContext.Provider>;
}

export const useDevLocale = () => useContext(DevLocaleContext);
