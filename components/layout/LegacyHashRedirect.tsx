"use client";

// Old links whose destination depends on the #hash (e.g. /growth#weekly-plan
// → Fix plan): the hash never reaches the server, so the browser sends
// them on (lib/routes.ts legacyRedirect). Does nothing until
// NEW_PAGES_LIVE; renders nothing.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { legacyRedirectIfLive } from "@/lib/routes";

export function LegacyHashRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const to = legacyRedirectIfLive({ pathname, search: window.location.search, hash: window.location.hash });
    if (to) router.replace(to);
  }, [pathname, router]);
  return null;
}
