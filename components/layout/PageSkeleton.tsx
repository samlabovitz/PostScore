"use client";

// The instant loading screen for each dashboard page (its loading.tsx):
// the same shell and sidebar as the page being opened, with soft
// placeholder blocks where the content will appear — so a click feels
// immediate. Respects reduce-motion (no pulsing).

import { useParams } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { shellBusinessFor } from "@/components/layout/shellMemory";
import { t, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-paper-deep motion-reduce:animate-none", className)} />;
}

function Label() {
  const locale = useLocale();
  return <span className="sr-only">{t(locale, "dashboard.shell.loading")}</span>;
}

export type SkeletonVariant = "overview" | "page";

export function PageSkeleton({ variant = "page" }: { variant?: SkeletonVariant }) {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;
  const business = shellBusinessFor(id) ?? (id ? { id, name: "", address: "" } : null);
  return (
    <DashboardShell business={business}>
      <div role="status" aria-busy="true" className="flex flex-col gap-5 nav:gap-6">
        <Label />
        <div className="flex flex-col gap-2">
          <Block className="h-7 w-64 max-w-full" />
          <Block className="h-4 w-80 max-w-full" />
        </div>
        {variant === "overview" ? (
          <>
            <div className="h-[220px] animate-pulse rounded-2xl bg-ink motion-reduce:animate-none" />
            <Block className="h-16" />
            <Block className="h-40" />
            <div className="grid grid-cols-1 gap-4 nav:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <Block className="h-72" />
              <Block className="h-72" />
            </div>
          </>
        ) : (
          <>
            <Block className="h-40" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Block className="h-32" />
              <Block className="h-32" />
            </div>
            <Block className="h-64" />
          </>
        )}
      </div>
    </DashboardShell>
  );
}
