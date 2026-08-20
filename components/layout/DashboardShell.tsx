"use client";

import { ReactNode, useEffect, useState } from "react";
import { IconMenu2 } from "@tabler/icons-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = navOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-paper nav:grid nav:grid-cols-[250px_minmax(0,1fr)]">
      <div className="flex items-center justify-between bg-ink px-4 py-3 nav:hidden">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-white hover:bg-white/[.07]"
        >
          <IconMenu2 size={22} />
        </button>
        <div className="font-serif text-lg font-semibold">
          <span className="text-white">Post</span>
          <span className="text-brass">Score</span>
        </div>
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
        className={cn(
          "fixed inset-y-0 left-0 z-50 -translate-x-full transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] nav:static nav:translate-x-0",
          navOpen && "translate-x-0"
        )}
        onNavigate={() => setNavOpen(false)}
        onClose={() => setNavOpen(false)}
      />

      <main className="min-w-0 p-4 sm:p-8 nav:p-10">{children}</main>
    </div>
  );
}
