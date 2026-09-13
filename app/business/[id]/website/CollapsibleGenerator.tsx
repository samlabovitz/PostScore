"use client";

import { ReactNode, useState } from "react";
import { IconChevronDown, IconWand } from "@tabler/icons-react";

/**
 * A thin visibility wrapper around the starter-site generator
 * (StarterSiteBuilder) — never touches what it wraps. When a business
 * already has a real website, the generator is still fully there (backup
 * / fresh-start use case) but starts collapsed behind a one-line header
 * so it doesn't compete with the business's actual site for attention;
 * a business with no website renders the generator directly instead (see
 * app/business/[id]/website/page.tsx), skipping this wrapper entirely
 * since it's the most relevant thing on the page in that case.
 */
export function CollapsibleGenerator({
  defaultExpanded,
  children,
}: {
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-paper-deep bg-white px-5 py-4 text-left hover:border-ink-soft"
      >
        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink">
          <IconWand size={15} className="text-brass" />
          Starter website generator
          <span className="font-normal text-ink-mute">
            — build a backup or fresh starting point from your real listing data
          </span>
        </span>
        <IconChevronDown size={15} className="shrink-0 text-ink-mute" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-ink-soft hover:text-ink"
      >
        <IconChevronDown size={13} className="rotate-180" />
        Hide starter website generator
      </button>
      {children}
    </div>
  );
}
