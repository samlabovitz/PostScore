"use client";

// A locked section. Only three things are readable: the section title (with
// a small lock and, optionally, a real count such as "3 fixes · 13 pts"),
// and the one unlock line. Everything in between is decorative, heavily
// blurred placeholder SHAPES — the hidden content itself (suggestions,
// steps, tips, designs) is never rendered into the page at all, so it
// can't be read by zooming, screenshotting or inspecting. Nothing inside
// is selectable or clickable; the lock control opens the promo box
// (components/upgrade). Callers pass only real numbers — never fake data.

import { IconLock, type Icon } from "@tabler/icons-react";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { featurePlan, type PromoFeature } from "@/lib/upgradePromos";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";

export type PreviewShape = "list" | "form" | "card";

/** Placeholder shapes only — no text, no data. List rows carry the
 * section's real icon (unblurred) so they read as real content. */
function Shapes({ shape, rows, icon: RowIcon }: { shape: PreviewShape; rows: number; icon?: Icon }) {
  if (shape === "form")
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          {Array.from({ length: Math.max(3, rows) }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="h-2.5 w-1/3 rounded bg-ink-mute/40" />
              <span className="h-8 w-full rounded-lg border border-paper-deep bg-paper" />
            </div>
          ))}
        </div>
        <div className="flex aspect-[7/4] w-full flex-col justify-between rounded-xl bg-[color:color-mix(in_srgb,var(--color-brass)_35%,white)] p-4">
          <span className="h-4 w-2/3 rounded bg-white/70" />
          <span className="h-3 w-1/2 rounded bg-white/60" />
          <span className="h-10 w-10 self-end rounded bg-white/70" />
        </div>
      </div>
    );
  if (shape === "card")
    return (
      <div className="flex flex-col gap-2.5 rounded-xl bg-paper p-4">
        <span className="h-4 w-1/2 rounded bg-ink-mute/40" />
        <span className="h-3 w-11/12 rounded bg-ink-mute/30" />
        <span className="h-3 w-3/4 rounded bg-ink-mute/30" />
      </div>
    );
  return (
    <ul className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3">
          {RowIcon ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
              <RowIcon size={15} />
            </span>
          ) : (
            <span className="h-8 w-8 shrink-0 rounded-lg bg-[color:color-mix(in_srgb,var(--color-brass)_30%,white)]" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1.5 blur-[6px]">
            <span className="h-3 rounded bg-ink-mute/45" style={{ width: `${70 - (i % 3) * 12}%` }} />
            <span className="h-2.5 rounded bg-ink-mute/30" style={{ width: `${48 - (i % 2) * 10}%` }} />
          </span>
          <span className="h-5 w-12 shrink-0 rounded-full bg-ink blur-[3px]" />
        </li>
      ))}
    </ul>
  );
}

/** Every locked footer: the unlock line on the left (wraps, max 2 lines)
 * and "See plans →" on the right, never wrapping, vertically centered, at
 * least 16px apart; on a phone the link drops below the line, left-aligned.
 * `bordered` adds the top rule and padding (a block's footer); `inset` is
 * the same layout inside a card that has its own padding. */
export function LockFooter({
  line,
  feature,
  plain = false,
  inset = false,
  className,
  testId = "locked-footer",
}: {
  line: string | null;
  feature: PromoFeature;
  plain?: boolean;
  inset?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-start gap-2 border-t border-paper-line sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        inset ? "pt-3" : "mt-auto p-4",
        className
      )}
    >
      {line && <p data-testid="unlock-line" className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-ink">{line}</p>}
      <UpgradeTrigger feature={feature} plain={plain} className="shrink-0" />
    </div>
  );
}

export function LockedPreview({
  title,
  summary = null,
  unlock,
  feature = "grow",
  shape = "list",
  rows = 3,
  labels,
  compact = false,
  className,
  id,
  icon,
  planLabel,
  soon = false,
}: {
  /** The section title — readable. */
  title: string;
  /** A real count ("3 fixes · 13 pts") — readable; null hides it. */
  summary?: string | null;
  /** The section's one unlock line (real data only); null hides it. */
  unlock: string | null;
  feature?: PromoFeature;
  shape?: PreviewShape;
  rows?: number;
  /** Short headings that may stay readable (e.g. the review guide's). */
  labels?: string[];
  /** One row: title, lock, unlock line and button — no shapes. */
  compact?: boolean;
  className?: string;
  id?: string;
  /** The section's icon for the skeleton rows. */
  icon?: Icon;
  /** The plan chip (default: the feature's plan name). */
  planLabel?: string;
  /** Not built yet: a "Coming soon" chip. */
  soon?: boolean;
}) {
  const locale = useLocale();
  const plan = featurePlan(feature);
  const button = <UpgradeTrigger feature={feature} plain className="shrink-0" />;
  const heading = (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <IconLock size={15} aria-hidden className="shrink-0 text-brass" />
      <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
      <span className="sr-only">{t(locale, "dashboard.free.lockedLabel")}</span>
      <span data-testid="plan-chip" className="rounded-full border border-paper-deep bg-white px-2 py-0.5 text-[11px] font-semibold text-ink">
        {planLabel ?? t(locale, `dashboard.settings.plan.name.${plan}` as MessageKey)}
      </span>
      {summary && <span className="rounded-full bg-paper px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">{summary}</span>}
      {soon && <span className="rounded-full bg-paper px-2 py-0.5 text-[11px] font-semibold text-ink-soft">{t(locale, "dashboard.common.comingSoon")}</span>}
    </div>
  );

  if (compact)
    return (
      <section id={id} data-testid="locked-preview" data-compact="true" className={cn("flex scroll-mt-20 flex-col items-start gap-2 rounded-xl border border-paper-deep bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {heading}
          {unlock && <p className="line-clamp-2 text-[13px] leading-snug text-ink-soft">{unlock}</p>}
        </div>
        {button}
      </section>
    );

  return (
    <section id={id} data-testid="locked-preview" className={cn("flex h-full scroll-mt-20 flex-col overflow-hidden rounded-xl border border-paper-deep bg-white", className)}>
      <div className="border-b border-paper-line px-4 py-3">{heading}</div>
      <div className="relative flex-1 select-none px-4 py-4" aria-hidden="true" data-testid="locked-preview-content">
        {labels && labels.length > 0 ? (
          <div className="flex flex-col gap-4">
            {labels.map((label) => (
              <div key={label} className="flex flex-col gap-1.5">
                <span className="text-[13px] font-semibold text-ink">{label}</span>
                <div className="pointer-events-none flex flex-col gap-1.5 blur-[7px]">
                  <span className="h-2.5 w-11/12 rounded bg-ink-mute/40" />
                  <span className="h-2.5 w-2/3 rounded bg-ink-mute/30" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={cn("pointer-events-none", shape !== "list" && "blur-[7px]")}>
            <Shapes shape={shape} rows={rows} icon={icon} />
          </div>
        )}
      </div>
      {/* Pinned to the bottom, so tiles in one grid row line up. */}
      <LockFooter line={unlock} feature={feature} plain />
    </section>
  );
}
