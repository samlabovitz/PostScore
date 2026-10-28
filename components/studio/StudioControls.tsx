"use client";

// The pieces every PostScore print studio shares (the review Sign Studio
// and the coupon / referral Print Studio): the dialog shell (preview on
// top on phones, collapsible option groups), option grids with Premium
// locks, toggles, and the print fonts for the live preview.

import { useEffect, useRef, useState, type ReactNode, createContext, useContext } from "react";
import { IconCrown, IconLock, IconX } from "@tabler/icons-react";
import { createMeasurer, loadFontFiles } from "@/lib/signStudio/fonts";
import { LOGO_MAX_BYTES, LOGO_TYPES, type StoredLogo } from "@/lib/signStudio/design";
import type { FontRole, Measurer } from "@/lib/signStudio/elements";
import { t, useLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";

const fontFiles = new Map<string, Promise<Uint8Array>>();

/** A print font's bytes, fetched once per page load. */
export function fetchSignFont(file: string): Promise<Uint8Array> {
  if (!fontFiles.has(file)) {
    fontFiles.set(
      file,
      fetch(`/sign-fonts/${file}`).then(async (r) => {
        if (!r.ok) throw new Error(`Font ${file} failed to load`);
        return new Uint8Array(await r.arrayBuffer());
      })
    );
  }
  return fontFiles.get(file)!;
}

/** A Measurer for these font files (null while they load). */
export function usePrintFonts(files: Record<FontRole, string>): { measurer: Measurer | null; bytes: Record<FontRole, Uint8Array> | null; failed: boolean } {
  const key = `${files.headline}|${files.headlineRegular}|${files.body}|${files.bodyBold}`;
  const [state, setState] = useState<{ key: string; measurer: Measurer; bytes: Record<FontRole, Uint8Array> } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadFontFiles(files, fetchSignFont)
      .then((bytes) => !cancelled && setState({ key, measurer: createMeasurer(bytes), bytes }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const ready = state && state.key === key ? state : null;
  return { measurer: ready?.measurer ?? null, bytes: ready?.bytes ?? null, failed };
}

/** On Free and Grow every designer option says which plan it's in: a
 * "Grow" chip on the basic ones, the crown "Premium" chip on the rest. */
export const PlanMarksContext = createContext(false);

export function PremiumChip() {
  const locale = useLocale();
  return (
    <span data-testid="premium-chip" className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-1.5 py-px text-[10px] font-semibold text-ink">
      <IconCrown size={10} aria-hidden className="text-brass" />
      <IconLock size={9} aria-hidden />
      {t(locale, "dashboard.websiteReviews.studio.premiumChip")}
    </span>
  );
}

export function GrowChip() {
  const locale = useLocale();
  return (
    <span data-testid="grow-chip" className="inline-flex shrink-0 items-center rounded-full border border-paper-deep bg-white px-1.5 py-px text-[10px] font-semibold text-ink-soft">
      {t(locale, "dashboard.studio.growChip")}
    </span>
  );
}

/** The chip for one option: Premium when locked; Grow when plans are marked. */
function PlanChip({ locked }: { locked?: boolean }) {
  const marks = useContext(PlanMarksContext);
  if (locked) return <PremiumChip />;
  return marks ? <GrowChip /> : null;
}

export function Section({ title, locked, open, onOpen, children }: { title: string; locked?: boolean; open?: boolean; onOpen?: () => void; children: ReactNode }) {
  return (
    <details
      open={open}
      onToggle={onOpen ? (e) => (e.currentTarget as HTMLDetailsElement).open && onOpen() : undefined}
      data-locked={locked ? "true" : undefined}
      className="group border-b border-paper-line py-2.5 last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {title}
          <PlanChip locked={locked} />
        </span>
        <span aria-hidden className="text-ink-mute transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-1 pt-2">{children}</div>
    </details>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{children}</div>;
}

export const CHOICE =
  "flex cursor-pointer flex-col gap-0.5 rounded-lg border bg-white px-2.5 py-1.5 text-left transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass";
export const CHOICE_ON = "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]";
export const CHOICE_OFF = "border-paper-deep hover:border-ink-mute";
export const SELECT = "w-full rounded-lg border border-paper-deep bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brass";
export const INPUT = "w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-brass";

export function Choices<T extends string | number>({
  name,
  value,
  options,
  label,
  desc,
  isLocked,
  onPick,
  cols = 2,
  swatch,
}: {
  name: string;
  value: T;
  options: readonly T[];
  label: (o: T) => string;
  desc?: (o: T) => string | null;
  isLocked: (o: T) => boolean;
  onPick: (o: T, locked: boolean) => void;
  cols?: 1 | 2 | 3 | 4;
  swatch?: (o: T) => ReactNode;
}) {
  return (
    <div role="radiogroup" className={cn("grid gap-1.5", cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : cols === 1 ? "grid-cols-1" : "grid-cols-2")}>
      {options.map((o) => {
        const locked = isLocked(o);
        const checked = value === o;
        return (
          <label key={String(o)} className={cn(CHOICE, checked ? CHOICE_ON : CHOICE_OFF, locked && "bg-paper")}>
            <input type="radio" name={name} checked={checked} onChange={() => onPick(o, locked)} className="sr-only" data-locked={locked ? "true" : undefined} />
            <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              {swatch?.(o)}
              <span className="min-w-0">{label(o)}</span>
              <PlanChip locked={locked} />
            </span>
            {desc?.(o) && <span className="text-[11px] leading-snug text-ink-mute">{desc(o)}</span>}
          </label>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, disabled, onChange, label, hint, locked }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; hint?: string | null; locked?: boolean }) {
  return (
    <label className={cn("flex items-start gap-2.5", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-locked={locked ? "true" : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#b8862f]"
      />
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-ink">
          {label}
          <PlanChip locked={locked} />
        </span>
        {hint && <span className="break-words text-[11.5px] text-ink-mute">{hint}</span>}
      </span>
    </label>
  );
}

/** The studio dialog: header, a preview pane (first on phones), an
 * options pane, and a footer of actions. Escape closes; the page behind
 * doesn't scroll; focus starts inside and returns on close. */
export function StudioDialog({
  title,
  subtitle,
  onClose,
  preview,
  options,
  footer,
  headerExtra,
  inline = false,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  preview: ReactNode;
  options: ReactNode;
  footer: ReactNode;
  headerExtra?: ReactNode;
  /** Shown in place (a showroom), not as a modal: no backdrop, no close. */
  inline?: boolean;
}) {
  const locale = useLocale();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose, inline]);

  if (inline)
    return (
      <div data-testid="studio-inline" className="flex w-full flex-col overflow-hidden rounded-2xl border border-paper-deep bg-white shadow-card">
        <div className="border-b border-paper-line px-4 py-3 sm:px-5">
          <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>
          <p className="text-[12.5px] text-ink-soft">{subtitle}</p>
          {headerExtra}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2 bg-paper-deep p-4">{preview}</div>
          <div className="flex flex-col px-4 pb-3 sm:px-5">{options}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3 sm:px-5">{footer}</div>
      </div>
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--color-ink)_45%,transparent)] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="studio-title"
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-card outline-none sm:max-h-[92vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-paper-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="studio-title" className="font-serif text-lg font-semibold text-ink">
              {title}
            </h2>
            <p className="text-[12.5px] text-ink-soft">{subtitle}</p>
            {headerExtra}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, "dashboard.websiteReviews.studio.close")}
            className="rounded-lg p-1.5 text-ink-mute hover:bg-paper hover:text-ink"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:overflow-hidden">
          <div className="flex flex-col items-center gap-2 bg-paper-deep p-4 md:overflow-y-auto">{preview}</div>
          <div className="flex flex-col px-4 pb-3 sm:px-5 md:overflow-y-auto">{options}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3 sm:px-5">{footer}</div>
      </div>
    </div>
  );
}

/** Above a Grow user's watermarked preview of a Premium option. "Unlock
 * with Premium" opens the promo box (components/upgrade) — no checkout. */
export function PremiumPreviewBanner({ onBack }: { businessId?: string; onBack: () => void }) {
  const locale = useLocale();
  return (
    <div className="flex w-full max-w-[26rem] flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-white px-3 py-2 text-[12px] text-ink">
      <span>{t(locale, "dashboard.websiteReviews.studio.premiumPreview")}</span>
      <span className="flex items-center gap-3">
        <UpgradeTrigger feature="designs" variant="button" label={t(locale, "dashboard.upgrade.trigger.unlockPremium")} />
        <button type="button" onClick={onBack} className="font-medium text-ink-soft underline">
          {t(locale, "dashboard.websiteReviews.studio.backToMine")}
        </button>
      </span>
    </div>
  );
}

/** The contrast check's warning; downloads stay blocked while it shows. */
export function ContrastAlert({ problems }: { problems: Array<"text" | "accent"> }) {
  const locale = useLocale();
  if (problems.length === 0) return null;
  return (
    <div role="alert" className="mt-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] p-3 text-[12.5px] text-ink">
      {problems.map((p) => (
        <p key={p}>{t(locale, `dashboard.websiteReviews.studio.contrast.${p}`)}</p>
      ))}
      <p className="mt-1 font-semibold">{t(locale, "dashboard.websiteReviews.studio.contrast.blocked")}</p>
    </div>
  );
}

/** Reads an added logo: type and size checked, kept on this device. */
export async function readLogoFile(file: File): Promise<{ logo: StoredLogo } | { error: "tooBig" | "badType" | "readError" }> {
  if (!LOGO_TYPES.includes(file.type)) return { error: "badType" };
  if (file.size > LOGO_MAX_BYTES) return { error: "tooBig" };
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 300, height: img.naturalHeight || 300 });
      img.onerror = () => reject(new Error("bad image"));
      img.src = dataUrl;
    });
    return { logo: { dataUrl, type: file.type, width, height, bytes: file.size } };
  } catch {
    return { error: "readError" };
  }
}

/** The quick colors under every color field — the sign themes' own
 * colors plus a few strong basics. */
export const COLOR_SWATCHES = ["#14243f", "#000000", "#ffffff", "#f7f1e3", "#b8862f", "#2e6b45", "#1d4ed8", "#b42318"] as const;

/**
 * One color field (Text, Background, Accent…): a row of tap-sized
 * swatches, a labeled "Custom color" swatch that opens the full picker,
 * the selected color ringed with a check and its hex code, and an
 * optional "hard to read" hint. `locked` (Grow on a Premium option) keeps
 * the Premium chip on the label; picks still go through `onChange`, which
 * the studios turn into the Premium preview — never a dead click.
 */
export function ColorField({
  label,
  value,
  onChange,
  locked = false,
  hint = null,
  testId,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  locked?: boolean;
  hint?: string | null;
  testId?: string;
}) {
  const locale = useLocale();
  const current = value.toLowerCase();
  const custom = !COLOR_SWATCHES.some((c) => c === current);
  return (
    <div data-testid={testId} className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-ink-soft">
        {label}
        <PlanChip locked={locked} />
        <span className="ml-auto font-mono text-[11.5px] uppercase text-ink-mute" data-testid="color-hex">
          {value}
        </span>
      </span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {COLOR_SWATCHES.map((hex) => {
          const on = hex === current;
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t(locale, "dashboard.studio.color.swatch", { hex })}
              data-locked={locked ? "true" : undefined}
              onClick={() => onChange(hex)}
              className={cn(
                "relative flex h-9 w-9 items-center justify-center rounded-full border border-paper-deep sm:h-8 sm:w-8",
                on && "ring-2 ring-brass ring-offset-2"
              )}
              style={{ background: hex }}
            >
              {on && <SwatchCheck hex={hex} />}
            </button>
          );
        })}
        <label
          className={cn(
            "relative flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-paper-deep bg-white pl-1 pr-2.5 text-[11.5px] font-semibold text-ink sm:h-8",
            custom && "ring-2 ring-brass ring-offset-2"
          )}
        >
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full text-[14px] font-bold text-white sm:h-6 sm:w-6" style={{ background: custom ? value : "conic-gradient(#e53935, #fdd835, #43a047, #1e88e5, #8e24aa, #e53935)" }}>
            {custom ? <SwatchCheck hex={value} /> : "+"}
          </span>
          {t(locale, "dashboard.studio.color.custom")}
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} data-locked={locked ? "true" : undefined} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
        </label>
      </div>
      {hint && (
        <p role="status" data-testid="color-hint" className="text-[11.5px] font-medium text-[color:var(--color-amber)]">
          {hint}
        </p>
      )}
    </div>
  );
}

/** A check that stays visible on any swatch color. */
function SwatchCheck({ hex }: { hex: string }) {
  const light = (() => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 160;
  })();
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={light ? "#14243f" : "#ffffff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/** The words for a colorHint (lib/signStudio/design.ts). */
export function colorHintText(hint: "darker" | "lighter" | "accent" | null, locale: Locale): string | null {
  if (hint === "darker") return t(locale, "dashboard.studio.color.hardToReadDarker");
  if (hint === "lighter") return t(locale, "dashboard.studio.color.hardToReadLighter");
  if (hint === "accent") return t(locale, "dashboard.studio.color.hardToSeeAccent");
  return null;
}
