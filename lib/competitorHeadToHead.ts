// Words for the head-to-head shown instead of a rank when only 1–2
// competitors were found (lib/competitorComparison.ts headToHead). Pure.

import type { HeadToHead } from "@/lib/competitorComparison";
import { MAX_COMPETITOR_DISTANCE_MILES } from "@/lib/competitorQuality";
import { t, tPlural, type Locale } from "@/lib/i18n";

function joinNames(names: string[], locale: Locale): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")}${locale === "es" ? " y " : " and "}${names[names.length - 1]}`;
}

export function rivalNames(h: HeadToHead, locale: Locale): string {
  return joinNames(
    h.rivals.map((r) => r.name ?? t(locale, "dashboard.competitors.unnamedListing")),
    locale
  );
}

/** "Only 2 salons like yours within 15 miles — here's how you compare with A and B". */
export function headToHeadIntro(h: HeadToHead, noun: string, locale: Locale): string {
  return tPlural(locale, "dashboard.competitors.headToHead.intro", h.rivals.length, {
    count: h.rivals.length,
    noun,
    miles: MAX_COMPETITOR_DISTANCE_MILES,
    names: rivalNames(h, locale),
  });
}

/** One plain line for text-only places (PDF, PostAI fallback): "You 72 · A 65 · B 58". */
export function headToHeadScores(h: HeadToHead, locale: Locale): string {
  const score = (s: number | null) => (s === null ? "—" : String(Math.round(s)));
  return [
    `${t(locale, "dashboard.competitors.headToHead.you")} ${score(h.owner.score)}`,
    ...h.rivals.map((r) => `${r.name ?? t(locale, "dashboard.competitors.unnamedListing")} ${score(r.score)}`),
  ].join(" · ");
}
