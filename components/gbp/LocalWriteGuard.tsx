"use client";

// Localhost only (`next dev`: app/business/[id]/layout.tsx provides the name): before a bulk send goes to the REAL Google
// listing (practice mode off, the business on GOOGLE_WRITES_LIVE_PLACES), the owner types the business name. Never
// in production, never in practice mode.

import { createContext, useContext, useState, type ReactNode } from "react";
import { t, useLocale } from "@/lib/i18n";

/** The business name to type; null everywhere but `next dev`. */
const LocalWriteNameContext = createContext<string | null>(null);
export function LocalWriteNameProvider({ name, children }: { name: string | null; children: ReactNode }) {
  return <LocalWriteNameContext.Provider value={name}>{children}</LocalWriteNameContext.Provider>;
}

/** Whether the typed name matches (case and spacing aside). */
export function nameMatches(typed: string, name: string): boolean {
  const tidy = (v: string) => v.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return tidy(typed) === tidy(name) && tidy(name).length > 0;
}

export function useLocalWriteGuard(practice: boolean): { ok: boolean; field: React.ReactNode } {
  const locale = useLocale();
  const name = useContext(LocalWriteNameContext);
  const [typed, setTyped] = useState("");
  if (!name || practice) return { ok: true, field: null };
  return {
    ok: nameMatches(typed, name),
    field: (
      <label className="flex flex-col gap-1 text-[12.5px] text-red" data-testid="local-write-guard">
        <span>{t(locale, "dashboard.approveConfirm.typeName", { name })}</span>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="h-9 rounded-lg border border-paper-deep bg-white px-2.5 text-[13px] text-ink" data-testid="local-write-guard-input" />
      </label>
    ),
  };
}
