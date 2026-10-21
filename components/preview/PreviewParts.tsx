// Shared pieces for tabs whose features aren't built yet (Campaigns,
// Google Profile, PostStudio): a page header, and a row for a feature
// that's coming, with an honest status pill ("Coming soon", "Needs
// Premium"). Purely presentational — every string is passed in already
// translated, and nothing here claims a feature exists.

import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";

export function PreviewPageHeader({
  backHref,
  backLabel,
  title,
  pill,
  subtitle,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  pill?: string | null;
  subtitle: string;
}) {
  return (
    <div>
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-soft hover:text-ink">
        <IconArrowLeft size={15} />
        {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h1 className="font-serif text-2xl font-semibold text-ink nav:text-[27px]">{title}</h1>
        {pill && <span className="rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-semibold text-paper">{pill}</span>}
      </div>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">{subtitle}</p>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-mute">{children}</h2>;
}

/** One upcoming feature: its name, what it does, and its real status. */
export function SoonRow({ title, body, status, href, linkLabel }: { title: string; body?: string; status: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {body && <p className="mt-0.5 text-[13px] text-ink-soft">{body}</p>}
        {href && linkLabel && (
          <Link href={href} className="mt-1 inline-block text-[13px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
            {linkLabel}
          </Link>
        )}
      </div>
      <span className="w-fit shrink-0 rounded-full border border-paper-deep bg-paper px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">{status}</span>
    </li>
  );
}

export function SoonList({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <ul className="flex flex-col divide-y divide-paper-line">{children}</ul>
    </Card>
  );
}
