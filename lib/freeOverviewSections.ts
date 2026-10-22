// The Free Overview's sections, in order, with what each one holds — the
// one config both the page (app/business/[id]/BusinessScoreView.tsx) and
// PostAI's feature map (lib/postaiFeatureMap.ts) read, so PostAI always
// names the place the owner actually sees. Pure.

import type { MessageKey } from "@/lib/i18n";

export type FreeOverviewSectionId = "score" | "behind" | "tools" | "earn";

/** What a section holds (PostAI's feature map points owners here). */
export type FreeOverviewItem = "score" | "rescan" | "breakdown" | "rank" | "reviewLink" | "reviewQr" | "replyDrafts" | "postai" | "plans" | "moreCustomers" | "planExtras";

export interface FreeOverviewSection {
  id: FreeOverviewSectionId;
  titleKey: MessageKey;
  bodyKey: MessageKey;
  /** The card the items sit in, when it has its own name. */
  cardKey?: MessageKey;
  items: FreeOverviewItem[];
}

export const FREE_OVERVIEW_SECTIONS: FreeOverviewSection[] = [
  { id: "score", titleKey: "dashboard.free.section.score.title", bodyKey: "dashboard.free.section.score.body", items: ["score", "rescan"] },
  { id: "behind", titleKey: "dashboard.free.section.behind.title", bodyKey: "dashboard.free.section.behind.body", items: ["breakdown", "rank"] },
  { id: "tools", titleKey: "dashboard.free.section.tools.title", bodyKey: "dashboard.free.section.tools.body", items: ["reviewLink", "reviewQr", "replyDrafts", "postai"] },
  { id: "earn", titleKey: "dashboard.free.section.earn.title", bodyKey: "dashboard.free.section.earn.body", items: ["plans", "moreCustomers", "planExtras"] },
];

export function freeSection(id: FreeOverviewSectionId): FreeOverviewSection {
  return FREE_OVERVIEW_SECTIONS.find((s) => s.id === id)!;
}

/** The section an item is in on the Free Overview. */
export function freeSectionOf(item: FreeOverviewItem): FreeOverviewSection {
  return FREE_OVERVIEW_SECTIONS.find((s) => s.items.includes(item))!;
}
