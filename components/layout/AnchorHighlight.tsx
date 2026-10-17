"use client";

// When a page opens at #some-row (a PostAI link, the hacked-site banner),
// scroll that row into view and highlight it briefly so the owner sees
// exactly where to look. Rows can render a moment after navigation, so
// it retries for up to ~2s. Same-page links fire ANCHOR_HIGHLIGHT_EVENT
// (Next's client navigation doesn't emit "hashchange").

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const ANCHOR_HIGHLIGHT_EVENT = "postscore:anchor-highlight";
// color-mix(), not "bg-brass/10": Tailwind's opacity shorthand emits no
// CSS for this project's var()-based colors.
const HIGHLIGHT_CLASSES = [
  "bg-[color:color-mix(in_srgb,var(--color-brass)_10%,transparent)]",
  "ring-2",
  "ring-[color:color-mix(in_srgb,var(--color-brass)_50%,transparent)]",
];

/** Smooth scrolling, or an instant jump for reduce-motion users. */
export function anchorScrollBehavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Same-page jump to #id with the brief highlight (PostAI links use the
 * same path): set the hash without a navigation, then let
 * AnchorHighlight and any panel that opens for that id react. */
export function jumpToAnchor(id: string) {
  window.history.replaceState(window.history.state, "", `#${id}`);
  window.dispatchEvent(new Event(ANCHOR_HIGHLIGHT_EVENT));
}
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
        el.scrollIntoView({ behavior: anchorScrollBehavior(), block: "start" });
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
