// Fix plan's open row (Day 25B polish): "What we found" · "What to do" · the footer. The do-it-yourself steps
// are at most 3 short numbered lines (dashboard.fixPlan.steps.<checkId>); a check without its own steps falls
// back to the first sentences of its "How" text. Pure.

import { t, type Locale, type MessageKey } from "@/lib/i18n";

const MAX_STEPS = 3;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Customer details' Google path ("Edit profile → Accessibility, Payments"), read back from the task's own "How" text. */
function customerDetailsPath(fix: string, locale: Locale): string | null {
  const pattern = escape(t(locale, "content.actionPlan.completeness.customer_details.fix", { path: "\u0001" })).replace("\u0001", "(.+?)");
  // The payment / parking notes follow the template; only the start has to match.
  return new RegExp(`^${pattern}`).exec(fix.trim())?.[1] ?? null;
}

/** Up to 3 numbered steps for a fix. */
export function fixRowSteps(task: { checkId: string; fix: string }, locale: Locale): string[] {
  const key = `dashboard.fixPlan.steps.${task.checkId}` as MessageKey;
  let path: string | null = null;
  if (task.checkId === "completeness.customer_details") {
    path = customerDetailsPath(task.fix, locale);
  }
  const own = t(locale, key, path ? { path } : {});
  if (own !== key && !(task.checkId === "completeness.customer_details" && !path)) return own.split("\n").filter(Boolean).slice(0, MAX_STEPS);
  return (task.fix.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [task.fix]).map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS);
}

/** Premium + connected + writes on: the one sentence over the one-click button. */
export function oneClickSentence(task: { checkId: string; mergedCheckIds?: string[] | null; mismatchFields?: string[] | null }, locale: Locale): string {
  const replies = task.checkId === "visibility.review_replies" || (task.mergedCheckIds ?? []).includes("visibility.review_replies");
  if (replies) return t(locale, "dashboard.fixPlan.row.oneClick.replies");
  if (task.checkId === "website.info_consistency" && (task.mismatchFields ?? []).includes("hours")) return t(locale, "dashboard.fixPlan.row.oneClick.hours");
  return t(locale, "dashboard.fixPlan.row.oneClick.listing");
}

/** "More help": the row's links minus any that go where its one button goes. */
export function moreHelpLinks<L extends { href: string }>(links: L[], buttonHref: string | null): L[] {
  const norm = (h: string) => h.split("#")[0].split("?")[0].replace(/\/+$/, "");
  const seen = new Set<string>();
  return links.filter((l) => {
    const k = norm(l.href);
    if ((buttonHref && k === norm(buttonHref)) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
