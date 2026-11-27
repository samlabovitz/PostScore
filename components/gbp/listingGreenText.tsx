// "Still to do: Phone +2 pts · Holiday hours (helps customers)": the all-green goal's list in words — the same on
// Fix plan, the Overview and the Google listing page (lib/listingGreen.ts).

import { t, type Locale } from "@/lib/i18n";
import { displayPoints } from "@/lib/pointRange";
import type { ListingGreen } from "@/lib/listingGreen";

export const listingRowLabel = (rowId: string, locale: Locale) => t(locale, `dashboard.googleTab.row.${rowId}.label` as Parameters<typeof t>[1]);

export function greenTodoText(green: ListingGreen, locale: Locale): string | null {
  if (green.todo.length === 0) return null;
  const items = green.todo.map((x) => (x.scored ? t(locale, "dashboard.fixPlan.green.itemPts", { label: listingRowLabel(x.rowId, locale), points: displayPoints(x.points) }) : t(locale, "dashboard.fixPlan.green.itemHelps", { label: listingRowLabel(x.rowId, locale) })));
  return t(locale, "dashboard.fixPlan.green.todo", { list: items.join(" · ") });
}

const DOT: Record<"ok" | "improve" | "fix" | "reviewing", string> = { ok: "text-green", improve: "text-amber", fix: "text-red", reviewing: "text-ink-mute" };

/** "9 of 12 green · ● 9 OK · ● 2 to improve · ● 1 to fix · ● 1 Google reviewing" — the dots the colors of the rows'
 * icons. The one count on the Google listing page, Fix plan, the Overview's recommendation and its listing row. */
export function GreenCount({ green, locale, className }: { green: ListingGreen; locale: Locale; className?: string }) {
  // Each part kept whole; a line can break before any "·".
  const part = (kind: keyof typeof DOT, text: string) => (
    <>
      {" "}
      <span className="whitespace-nowrap font-medium text-ink-soft" data-count={kind}>
        · <span aria-hidden className={DOT[kind]}>●</span> {text}
      </span>
    </>
  );
  // No row could be read: no count (never "all green").
  if (green.total === 0 && green.reviewing.length === 0) return null;
  return (
    <span className={className} data-testid="listing-green-count" data-green={green.green} data-total={green.total}>
      <b className={green.allGreen ? "whitespace-nowrap text-green" : "whitespace-nowrap text-ink"}>
        {green.allGreen && green.reviewing.length === 0 ? t(locale, "dashboard.googlePages.listing.allGreen") : t(locale, "dashboard.googlePages.listing.goal", { green: green.green, total: green.total })}
      </b>
      {part("ok", t(locale, "dashboard.googleTab.count.ok", { count: green.ok }))}
      {part("improve", t(locale, "dashboard.googleTab.count.improve", { count: green.improve }))}
      {part("fix", t(locale, "dashboard.googleTab.count.fix", { count: green.fix }))}
      {green.reviewing.length > 0 && part("reviewing", t(locale, "dashboard.googlePages.listing.reviewingCount", { count: green.reviewing.length }))}
    </span>
  );
}
