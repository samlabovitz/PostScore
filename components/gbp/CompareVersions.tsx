"use client";

// One clear "two versions" choice: a one-line question, Google's version
// (left) and the owner's / the website's (right) side by side (stacked on
// phones), hours day by day with the differing days marked in BOTH cards,
// one full-width button under each card with a small line saying exactly
// what happens. After a choice it collapses to "✓ You kept … · date"
// (with "Change"), and whatever comes next (steps, the editor link) shows
// under it. Used by section 6's Google edits and the hours-mismatch chooser.

import type { ReactNode } from "react";
import { IconBrandGoogle, IconWorld } from "@tabler/icons-react";
import type { Versions } from "@/lib/compareVersions";
import { formatShortDate, t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const K = (key: string) => `dashboard.compareVersions.${key}` as MessageKey;

export interface VersionButton {
  label: string;
  /** Exactly what happens ("Nothing changes on Google."). */
  note: string;
  onClick: () => void;
  testId: string;
  primary?: boolean;
  disabled?: boolean;
}

export interface Chosen {
  /** "You kept Google's version" */
  text: string;
  at: string;
  onChange?: () => void;
}

function Card({ side, label, versions, button, icon, footer }: { side: "google" | "mine"; label: string; versions: Versions; button: VersionButton; icon?: "globe"; footer?: ReactNode }) {
  const locale = useLocale();
  const none = t(locale, K("none"));
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-paper-deep bg-white p-3" data-testid={`version-${side}`}>
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.1em] text-ink-mute">
        {side === "google" && <IconBrandGoogle size={13} aria-hidden />}
        {icon === "globe" && <IconWorld size={13} aria-hidden />}
        {label}
      </p>
      {versions.kind === "text" ? (
        (side === "google" ? versions.google : versions.mine) ? (
          <p className="break-words text-[16px] font-semibold leading-snug text-ink">{side === "google" ? versions.google : versions.mine}</p>
        ) : (
          <p className="text-[16px] text-ink-mute">{none}</p>
        )
      ) : (
        <ul className="flex flex-col text-[12.5px]">
          {versions.days.map((d) => (
            <li key={d.label} data-differs={d.differs ? "true" : "false"} className={cn("flex justify-between gap-2 rounded px-1.5 py-0.5", d.differs ? "bg-[color:color-mix(in_srgb,var(--color-amber)_16%,white)] font-bold text-ink" : "text-ink-mute")}>
              <span>{d.label}</span>
              <span className="text-right">{side === "google" ? d.google : d.mine}</span>
            </li>
          ))}
        </ul>
      )}
      {footer}
      <div className="mt-auto flex flex-col gap-1 pt-1">
        <button
          type="button"
          onClick={button.onClick}
          disabled={button.disabled}
          data-testid={button.testId}
          className={cn("h-[34px] w-full rounded-lg border text-[13px] font-semibold disabled:opacity-60", button.primary ? "border-ink bg-ink text-paper" : "border-ink bg-white text-ink")}
        >
          {button.label}
        </button>
        <p className="text-[11.5px] leading-snug text-ink-mute">{button.note}</p>
      </div>
    </div>
  );
}

export function CompareVersions({
  question,
  versions,
  googleLabel,
  mineLabel,
  mineIcon,
  mineFooter,
  googleButton,
  mineButton,
  chosen = null,
  extra,
  children,
  testId,
}: {
  question: string;
  versions: Versions;
  googleLabel?: string;
  mineLabel: string;
  /** "globe": the website's version. */
  mineIcon?: "globe";
  /** A small line under the right card's value ("You entered on Google: …"). */
  mineFooter?: ReactNode;
  googleButton: VersionButton;
  mineButton: VersionButton;
  chosen?: Chosen | null;
  /** A small link under both cards ("Neither is right? …"). */
  extra?: ReactNode;
  /** What comes after a choice (steps, the editor link). */
  children?: ReactNode;
  testId?: string;
}) {
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2.5" data-testid={testId ?? "compare-versions"}>
      {chosen ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[13px]" data-testid="version-chosen">
          <b className="text-green">✓ {chosen.text}</b>
          <span className="text-ink-mute">{` · ${formatShortDate(chosen.at, locale).replace(/,? \d{4}$/, "")}`}</span>
          {chosen.onChange && (
            <button type="button" onClick={chosen.onChange} className="font-semibold text-ink underline underline-offset-2" data-testid="version-change">
              {t(locale, K("change"))}
            </button>
          )}
        </p>
      ) : (
        <>
          <p className="text-[14px] font-semibold text-ink">{question}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Card side="google" label={googleLabel ?? t(locale, K("google"))} versions={versions} button={googleButton} />
            <Card side="mine" label={mineLabel} versions={versions} button={mineButton} icon={mineIcon} footer={mineFooter} />
          </div>
          {extra}
        </>
      )}
      {children}
    </div>
  );
}
