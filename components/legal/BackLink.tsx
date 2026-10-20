"use client";

// "← Back" for public info pages (terms, refund policy, unsubscribe):
// returns to the page they came from; with nothing to go back to (opened
// from an email link or in a new tab) it goes to `fallback` — "/", which
// is the dashboard when logged in and the login page when logged out.
// A real link, so it still works without JavaScript.

import { useRouter } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { canGoBack } from "@/lib/backLink";

export function BackLink({ label, fallback = "/" }: { label: string; fallback?: string }) {
  const router = useRouter();
  return (
    <a
      href={fallback}
      onClick={(e) => {
        if (typeof window !== "undefined" && canGoBack(window.history.length)) {
          e.preventDefault();
          router.back();
        }
      }}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink"
      data-testid="back-link"
    >
      <IconArrowLeft size={15} aria-hidden />
      {label}
    </a>
  );
}
