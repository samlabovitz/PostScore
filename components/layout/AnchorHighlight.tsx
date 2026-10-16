"use client";

// When a page opens at #some-row (a PostAI link, the hacked-site banner),
// scroll that row into view and highlight it briefly so the owner sees
// exactly where to look. Rows can render a moment after navigation, so
// it retries for up to ~2s. Same-page links fire ANCHOR_HIGHLIGHT_EVENT
// (Next's client navigation doesn't emit "hashchange").

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const ANCHOR_HIGHLIGHT_EVENT = "postscore:anchor-highlight";
const HIGHLIGHT_CLASSES = ["bg-brass/10", "ring-2", "ring-brass/50"];
const HIGHLIGHT_MS = 2400;

export function AnchorHighlight() {
  const pathname = usePathname();
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    function highlight() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!/^[A-Za-z0-9_-]+$/.test(id)) return;
      let tries = 0;
      const attempt = () => {
        const el = document.getElementById(id);
        if (!el) {
          if (tries++ < 20) timers.push(setTimeout(attempt, 100));
          return;
        }
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add(...HIGHLIGHT_CLASSES);
        timers.push(setTimeout(() => el.classList.remove(...HIGHLIGHT_CLASSES), HIGHLIGHT_MS));
      };
      attempt();
    }
    highlight();
    window.addEventListener("hashchange", highlight);
    window.addEventListener(ANCHOR_HIGHLIGHT_EVENT, highlight);
    return () => {
      window.removeEventListener("hashchange", highlight);
      window.removeEventListener(ANCHOR_HIGHLIGHT_EVENT, highlight);
      timers.forEach(clearTimeout);
    };
  }, [pathname]);
  return null;
}
