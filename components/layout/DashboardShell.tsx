"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { IconMenu2 } from "@tabler/icons-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";
import type { BusinessSummary } from "@/app/actions/businesses";
import { LocaleProvider, normalizeLocale, t } from "@/lib/i18n";

export function DashboardShell({
  business = null,
  children,
}: {
  /** The business the current page is scoped to, if any — threaded down
   * to the sidebar so nav links route to the right business and the
   * header shows its real name/address instead of a placeholder, and to
   * LocaleProvider below so every client component under this shell can
   * read the business's own real locale via useLocale(). */
  business?: BusinessSummary | null;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  // No business (the home list, the intake page, a not-yet-loaded error
  // state) safely normalizes to DEFAULT_LOCALE — same never-throws
  // guarantee normalizeLocale() always gives.
  const locale = normalizeLocale(business?.language);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <LocaleProvider locale={locale}>
      <div className="min-h-screen bg-paper" data-locale={locale}>
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-ink px-4 nav:hidden">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label={t(locale, "dashboard.shell.openMenuAriaLabel")}
            className="rounded-md p-1.5 text-white hover:bg-white/[.07]"
          >
            <IconMenu2 size={22} />
          </button>
          <Link href="/" className="font-serif text-lg font-semibold">
            <span className="text-white">Post</span>
            <span className="text-brass">Score</span>
          </Link>
          <span className="w-[34px]" aria-hidden="true" />
        </div>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-ink/50 backdrop-blur-[1px] transition-opacity nav:hidden",
            navOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />

        <Sidebar
          business={business}
          className={cn(
            "fixed inset-y-0 left-0 z-50 -translate-x-full transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] nav:translate-x-0",
            navOpen && "translate-x-0"
          )}
          onNavigate={() => setNavOpen(false)}
          onClose={() => setNavOpen(false)}
        />

        <main className="min-w-0 p-4 sm:p-8 nav:ml-[250px] nav:p-10">{children}</main>

        {/* Dev-only proof-of-wiring — never rendered in production. The
            data-locale attribute above on the root div is the real,
            always-present readout (inspectable in tests/devtools); this
            badge is just a visible convenience while developing. */}
        {process.env.NODE_ENV !== "production" && (
          <div
            aria-hidden="true"
            className="fixed bottom-3 right-3 z-50 rounded-md bg-ink px-2 py-1 font-mono text-[11px] text-white/80 shadow-lg"
          >
            locale: {locale}
          </div>
        )}
      </div>
    </LocaleProvider>
  );
}
