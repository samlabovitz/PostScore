"use client";

import { useEffect } from "react";

/**
 * Scrolls to the element matching the current URL's #hash, once, right
 * after this component mounts. Next.js's App Router doesn't reliably do
 * this on its own: its own scroll-restoration logic can run before a
 * Client Component has actually rendered the section the hash points
 * to (e.g. a page built from several client components, or one gated
 * behind its own data fetch), so the browser's native "jump to #id on
 * load" never finds a real target and silently does nothing. Running
 * this after mount, once the real DOM exists, is what actually fixes
 * that — never an error, never a guess: a missing/unmatched hash (or no
 * hash at all) is a silent no-op.
 */
export function useScrollToHash(): void {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    target?.scrollIntoView();
  }, []);
}
