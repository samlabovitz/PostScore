// Server-only. The language a business's pages (and the drafts PostScore
// writes on them) are shown in: the business's saved language — or, in
// local development only, the dev override cookie that scripts/devShot.ts
// sets (/api/dev/locale), so a Spanish self-check never changes a real
// business's saved language. Never in production; outside a request (a
// cron, a script) it's always the saved language.
import "server-only";
import { cookies } from "next/headers";
import { normalizeLocale, type Locale } from "@/lib/i18n";

export const DEV_LOCALE_COOKIE = "ps_dev_locale";

/** "en" / "es" from the dev cookie; null outside local development or without it. */
export function devLocaleOverride(env: { NODE_ENV?: string } = process.env): Locale | null {
  if (env.NODE_ENV !== "development") return null;
  try {
    const v = cookies().get(DEV_LOCALE_COOKIE)?.value;
    return v === "en" || v === "es" ? v : null;
  } catch {
    return null;
  }
}

/** The language the page is viewed in (drop-in for normalizeLocale on a business's language). */
export function viewLocale(language: string | null | undefined): Locale {
  return devLocaleOverride() ?? normalizeLocale(language);
}
