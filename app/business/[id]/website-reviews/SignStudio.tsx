"use client";

// "Design your review sign". Premium/Multi: the full Sign Studio. Grow:
// the basic sign (Style + Size), with every Premium option still visible
// behind a lock — choosing one previews it with a "Premium" watermark,
// while Download and Print stay on the Grow sign. The PDF always comes
// from the server, which re-checks the plan (app/api/.../review-sign).
// Live preview on top on phones, options in collapsible sections.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { IconDownload, IconLock, IconPhoto, IconPrinter, IconQrcode, IconRefresh, IconX } from "@tabler/icons-react";
import { reviewQrGeometry, type QrCenter, type QrCorners, type QrDots } from "@/lib/reviewQr";
import {
  BASIC_SIZES,
  BASIC_THEMES,
  CUSTOM_HEADLINE_MAX,
  FONTS,
  FONT_IDS,
  LOGO_MAX_BYTES,
  LOGO_TYPES,
  QR_CENTERS,
  QR_CORNERS,
  QR_DOTS,
  SIGN_BACKGROUNDS,
  SIGN_BORDERS,
  SIGN_HEADLINES,
  SIGN_LANGUAGES,
  SIGN_RADII,
  SIGN_SIZES,
  SIGN_TEMPLATES,
  SIGN_TEXT_SIZES,
  SIGN_THEMES,
  SUBLINE_MAX,
  THEME_COLORS,
  basicDesign,
  contrastProblems,
  defaultDesign,
  designColors,
  headlineText,
  qrStyleOf,
  ratingAllowed,
  signFileName,
  type BasicChoices,
  type SignContent,
  type SignDesign,
  type SignSize,
  type SignThemeId,
  type StoredLogo,
} from "@/lib/signStudio/design";
import { createMeasurer, loadDesignFonts } from "@/lib/signStudio/fonts";
import { layoutSign, PAGE_POINTS, type Measurer } from "@/lib/signStudio/layout";
import { signSvg } from "@/lib/signStudio/svg";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BRASS_BUTTON, OUTLINE_BUTTON } from "./buttonStyles";

const K = "dashboard.websiteReviews.studio.";
const tk = (locale: Locale, key: string, vars?: Record<string, string | number>) => t(locale, `${K}${key}` as MessageKey, vars);

const fontFiles = new Map<string, Promise<Uint8Array>>();
function fetchFont(file: string): Promise<Uint8Array> {
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

/** Whether the rating may print, as the studio explains it. */
export function ratingOption(content: SignContent, locale: Locale): { allowed: boolean; hint: string } {
  return ratingAllowed(content.rating, content.reviewCount)
    ? { allowed: true, hint: tk(locale, "ratingHint", { rating: content.rating.toFixed(1) }) }
    : { allowed: false, hint: tk(locale, "ratingUnavailable") };
}

// ---- Small controls ----

function PremiumChip() {
  const locale = useLocale();
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-1.5 py-px text-[10px] font-semibold text-ink">
      <IconLock size={10} aria-hidden />
      {tk(locale, "premiumChip")}
    </span>
  );
}

function Section({ title, locked, open, children }: { title: string; locked?: boolean; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group border-b border-paper-line py-2.5 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-[13.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {title}
          {locked && <PremiumChip />}
        </span>
        <span aria-hidden className="text-ink-mute transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="flex flex-col gap-3 pb-1 pt-2">{children}</div>
    </details>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{children}</div>;
}

const CHOICE =
  "flex cursor-pointer flex-col gap-0.5 rounded-lg border bg-white px-2.5 py-1.5 text-left transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass";

function Choices<T extends string>({
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
  cols?: 2 | 3;
  swatch?: (o: T) => ReactNode;
}) {
  return (
    <div role="radiogroup" className={cn("grid gap-1.5", cols === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((o) => {
        const locked = isLocked(o);
        const checked = value === o;
        return (
          <label
            key={o}
            className={cn(
              CHOICE,
              checked ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "border-paper-deep hover:border-ink-mute",
              locked && "bg-paper"
            )}
          >
            <input type="radio" name={name} checked={checked} onChange={() => onPick(o, locked)} className="sr-only" data-locked={locked ? "true" : undefined} />
            <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-ink">
              {swatch?.(o)}
              <span className="min-w-0">{label(o)}</span>
              {locked && <PremiumChip />}
            </span>
            {desc?.(o) && <span className="text-[11px] leading-snug text-ink-mute">{desc(o)}</span>}
          </label>
        );
      })}
    </div>
  );
}

function Toggle({ checked, disabled, onChange, label, hint }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; hint?: string | null }) {
  return (
    <label className={cn("flex items-start gap-2.5", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#b8862f]" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="break-words text-[11.5px] text-ink-mute">{hint}</span>}
      </span>
    </label>
  );
}

const SELECT = "w-full rounded-lg border border-paper-deep bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brass";
const INPUT = "w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-brass";

function sizeDesc(size: SignSize, locale: Locale): string | null {
  if (size === "tent") return tk(locale, "size.tentDesc");
  if (size === "letter") return tk(locale, "size.letterDesc");
  if (size === "cards4") return tk(locale, "size.cards4Desc");
  return null;
}

function ThemeSwatch({ theme, design }: { theme: SignThemeId; design: SignDesign }) {
  const c = theme === "custom" ? design.customColors : THEME_COLORS[theme];
  return (
    <span
      aria-hidden
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] font-bold"
      style={{ background: c.background, color: c.text, borderColor: c.accent }}
    >
      A
    </span>
  );
}

// ---- The Premium controls (locked = Grow: picks only preview) ----

function StudioControls({
  value,
  update,
  locked,
  content,
  logo,
  onLogo,
  logoNote,
  includeStyleAndSize,
}: {
  value: SignDesign;
  update: (patch: Partial<SignDesign>, locked: boolean) => void;
  locked: boolean;
  content: SignContent;
  logo: StoredLogo | null;
  onLogo: (file: File | null) => void;
  logoNote: string | null;
  includeStyleAndSize: boolean;
}) {
  const locale = useLocale();
  const L = () => locked;
  const pick = <F extends keyof SignDesign>(field: F) => (o: SignDesign[F], isLocked: boolean) => update({ [field]: o } as Partial<SignDesign>, isLocked);
  const rating = ratingOption(content, locale);
  const signLang = value.language === "es" ? "es" : "en";
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Section title={tk(locale, "section.layout")} locked={locked} open={!locked}>
        <Choices name="layout" value={value.template} options={SIGN_TEMPLATES} label={(o) => tk(locale, `template.${o}`)} isLocked={L} onPick={pick("template")} />
      </Section>

      {includeStyleAndSize && (
        <>
          <Section title={tk(locale, "section.size")} locked={locked}>
            <Choices name="size" value={value.size} options={SIGN_SIZES} label={(o) => tk(locale, `size.${o}`)} desc={(o) => sizeDesc(o, locale)} isLocked={L} onPick={pick("size")} />
          </Section>
          <Section title={tk(locale, "section.colors")} locked={locked}>
            <Choices
              name="theme"
              value={value.theme}
              options={[...SIGN_THEMES, "custom"] as SignThemeId[]}
              label={(o) => tk(locale, `theme.${o}`)}
              desc={(o) => tk(locale, `theme.${o}Desc`)}
              isLocked={L}
              onPick={pick("theme")}
              swatch={(o) => <ThemeSwatch theme={o} design={value} />}
            />
            {value.theme === "custom" && (
              <div className="grid grid-cols-3 gap-2">
                {(["background", "text", "accent"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-1 text-[12px] text-ink-soft">
                    {tk(locale, `colors.${k}`)}
                    <input
                      type="color"
                      value={value.customColors[k]}
                      disabled={locked}
                      onChange={(e) => update({ customColors: { ...value.customColors, [k]: e.target.value } }, locked)}
                      className="h-9 w-full cursor-pointer rounded-lg border border-paper-deep bg-white p-1"
                    />
                  </label>
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      <Section title={tk(locale, "section.font")} locked={locked}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(["headlineFont", "bodyFont"] as const).map((field) => (
            <label key={field} className="flex flex-col gap-1">
              <Label>{tk(locale, field)}</Label>
              <select value={value[field]} onChange={(e) => update({ [field]: e.target.value } as Partial<SignDesign>, locked)} className={SELECT}>
                {FONT_IDS.map((f) => (
                  <option key={f} value={f}>
                    {FONTS[f].family}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div>
          <Label>{tk(locale, "textSize")}</Label>
          <Choices name="textSize" cols={3} value={value.textSize} options={SIGN_TEXT_SIZES} label={(o) => tk(locale, `textSize.${o}`)} isLocked={L} onPick={pick("textSize")} />
        </div>
      </Section>

      <Section title={tk(locale, "section.text")} locked={locked}>
        <div>
          <Label>{tk(locale, "headline")}</Label>
          <div className="flex flex-col gap-1.5">
            {[...SIGN_HEADLINES, "custom" as const].map((h) => (
              <label
                key={h}
                className={cn(CHOICE, value.headline === h ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "border-paper-deep hover:border-ink-mute")}
              >
                <input type="radio" name="headline" checked={value.headline === h} onChange={() => update({ headline: h }, locked)} className="sr-only" />
                <span className="text-[12.5px] font-semibold text-ink">{h === "custom" ? tk(locale, "headlineCustom") : headlineText(h, signLang)}</span>
              </label>
            ))}
          </div>
          {value.headline === "custom" && (
            <div className="mt-1.5 flex flex-col gap-1">
              <input
                type="text"
                value={value.customHeadline}
                maxLength={CUSTOM_HEADLINE_MAX}
                onChange={(e) => update({ customHeadline: e.target.value.slice(0, CUSTOM_HEADLINE_MAX) }, locked)}
                placeholder={tk(locale, "headlinePlaceholder")}
                aria-label={tk(locale, "headlineCustom")}
                className={INPUT}
              />
              <span className="flex justify-between gap-2 text-[11.5px] text-ink-mute">
                <span>{value.language === "both" ? tk(locale, "headlineCustomBilingual") : ""}</span>
                <span className="tabular-nums">{tk(locale, "count", { count: value.customHeadline.length, max: CUSTOM_HEADLINE_MAX })}</span>
              </span>
            </div>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <Label>{tk(locale, "subline")}</Label>
          <input
            type="text"
            value={value.subline}
            maxLength={SUBLINE_MAX}
            onChange={(e) => update({ subline: e.target.value.slice(0, SUBLINE_MAX) }, locked)}
            placeholder={tk(locale, "sublinePlaceholder")}
            className={INPUT}
          />
          <span className="text-right text-[11.5px] tabular-nums text-ink-mute">{tk(locale, "count", { count: value.subline.length, max: SUBLINE_MAX })}</span>
        </label>
        <Toggle checked={value.showName} onChange={(v) => update({ showName: v }, locked)} label={tk(locale, "showName")} hint={content.businessName} />
        <Toggle
          checked={value.showRating && rating.allowed}
          disabled={!rating.allowed}
          onChange={(v) => update({ showRating: v }, locked)}
          label={tk(locale, "showRating")}
          hint={rating.hint}
        />
        <label className="flex flex-col gap-1">
          <Label>{tk(locale, "follow")}</Label>
          {content.verifiedSocials.length === 0 ? (
            <span className="text-[12px] text-ink-mute">{tk(locale, "followNoneVerified")}</span>
          ) : (
            // Only profiles we've verified — there is no free-text box.
            <select value={value.follow ?? ""} onChange={(e) => update({ follow: e.target.value || null }, locked)} className={SELECT}>
              <option value="">{tk(locale, "followNone")}</option>
              {content.verifiedSocials.map((s) => (
                <option key={s.url} value={s.url}>
                  {s.platform}: {s.url}
                </option>
              ))}
            </select>
          )}
        </label>
        <div>
          <Label>{tk(locale, "language")}</Label>
          <Choices name="language" cols={3} value={value.language} options={SIGN_LANGUAGES} label={(o) => tk(locale, `language.${o}`)} isLocked={L} onPick={pick("language")} />
        </div>
      </Section>

      <Section title={tk(locale, "section.logo")} locked={locked}>
        {locked ? (
          <p className="text-[12px] text-ink-mute">{tk(locale, "logo.hint")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.dataUrl} alt="" className="h-10 max-w-[6rem] rounded border border-paper-deep bg-white object-contain p-1" />
              )}
              <button type="button" onClick={() => fileRef.current?.click()} className={OUTLINE_BUTTON}>
                <IconPhoto size={15} aria-hidden />
                {logo ? tk(locale, "logo.replace") : tk(locale, "logo.add")}
              </button>
              {logo && (
                <button type="button" onClick={() => onLogo(null)} className="text-[12.5px] font-medium text-ink-soft underline hover:text-ink">
                  {tk(locale, "logo.remove")}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept={LOGO_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  onLogo(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="text-[11.5px] text-ink-mute">{tk(locale, "logo.hint")}</p>
            {logoNote && <p className="text-[12px] text-amber">{logoNote}</p>}
            <Toggle checked={value.logoTop} disabled={!logo} onChange={(v) => update({ logoTop: v }, false)} label={tk(locale, "logo.top")} />
          </>
        )}
      </Section>

      <Section title={tk(locale, "section.qr")} locked={locked}>
        <div>
          <Label>{tk(locale, "qr.dots")}</Label>
          <Choices<QrDots> name="qrDots" cols={3} value={value.qrDots} options={QR_DOTS} label={(o) => tk(locale, `qr.dots.${o}`)} isLocked={L} onPick={pick("qrDots")} />
        </div>
        <div>
          <Label>{tk(locale, "qr.corners")}</Label>
          <Choices<QrCorners> name="qrCorners" value={value.qrCorners} options={QR_CORNERS} label={(o) => tk(locale, `qr.corners.${o}`)} isLocked={L} onPick={pick("qrCorners")} />
        </div>
        <div>
          <Label>{tk(locale, "qr.center")}</Label>
          <Choices<QrCenter> name="qrCenter" cols={3} value={value.qrCenter} options={QR_CENTERS} label={(o) => tk(locale, `qr.center.${o}`)} isLocked={L} onPick={pick("qrCenter")} />
          {value.qrCenter === "logo" && !logo && !locked && <p className="mt-1 text-[12px] text-amber">{tk(locale, "qr.centerNeedsLogo")}</p>}
        </div>
      </Section>

      <Section title={tk(locale, "section.extras")} locked={locked}>
        <div>
          <Label>{tk(locale, "border")}</Label>
          <Choices name="border" value={value.border} options={SIGN_BORDERS} label={(o) => tk(locale, `border.${o}`)} isLocked={L} onPick={pick("border")} />
        </div>
        <div>
          <Label>{tk(locale, "background")}</Label>
          <Choices name="background" value={value.background} options={SIGN_BACKGROUNDS} label={(o) => tk(locale, `background.${o}`)} isLocked={L} onPick={pick("background")} />
        </div>
        <div>
          <Label>{tk(locale, "radius")}</Label>
          <Choices name="radius" cols={3} value={value.radius} options={SIGN_RADII} label={(o) => tk(locale, `radius.${o}`)} isLocked={L} onPick={pick("radius")} />
        </div>
      </Section>
    </>
  );
}

// ---- The panel ----

export interface SignStudioProps {
  access: "basic" | "studio";
  businessId: string;
  reviewUrl: string;
  content: SignContent;
  basic: BasicChoices;
  onBasicChange: (next: BasicChoices) => void;
  design: SignDesign;
  onDesignChange: (next: SignDesign) => void;
  logo: StoredLogo | null;
  onLogoFile: (file: File | null) => void;
  logoNote: string | null;
  onClose: () => void;
}

export function SignStudio(props: SignStudioProps) {
  const { access, businessId, reviewUrl, content, basic, design, logo } = props;
  const locale = useLocale();
  const studio = access === "studio";

  // Grow: a Premium option picked only for a look, never downloaded.
  const [premiumPreview, setPremiumPreview] = useState<SignDesign | null>(null);
  const growDesign = useMemo(() => basicDesign(basic, locale), [basic, locale]);
  const shown: SignDesign = studio ? design : premiumPreview ?? growDesign;
  const showLogo = studio || premiumPreview !== null ? logo : null;

  const updateStudio = (patch: Partial<SignDesign>) => props.onDesignChange({ ...design, ...patch });
  const previewLocked = (patch: Partial<SignDesign>) => setPremiumPreview((prev) => ({ ...(prev ?? growDesign), ...patch }));

  // Fonts for the preview (the same files the PDF embeds).
  const fontKey = `${FONTS[shown.headlineFont].bold}|${FONTS[shown.bodyFont].regular}|${FONTS[shown.bodyFont].bold}`;
  const [measurer, setMeasurer] = useState<{ key: string; m: Measurer } | null>(null);
  const [fontError, setFontError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadDesignFonts(shown, fetchFont)
      .then((bytes) => !cancelled && setMeasurer({ key: fontKey, m: createMeasurer(bytes) }))
      .catch(() => !cancelled && setFontError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontKey]);

  const problems = contrastProblems(designColors(shown));
  const credit = !studio && premiumPreview === null;
  const preview = useMemo(() => {
    if (!measurer || measurer.key !== fontKey) return null;
    try {
      const logoShape = showLogo ? { aspect: showLogo.width / showLogo.height } : null;
      const layout = layoutSign({ design: shown, content, credit, logo: logoShape }, measurer.m);
      const qr = reviewQrGeometry(reviewUrl, qrStyleOf(shown, logoShape !== null));
      return signSvg(layout, qr, shown, { logoHref: showLogo?.dataUrl ?? null, watermark: premiumPreview ? tk(locale, "premiumChip") : null });
    } catch {
      return null;
    }
  }, [measurer, fontKey, shown, content, credit, showLogo, reviewUrl, premiumPreview, locale]);
  const [w, h] = PAGE_POINTS[shown.size];

  // What Download / Print send: never the Premium preview.
  const downloadDesign = studio ? design : basic;
  const downloadBlocked = studio && contrastProblems(designColors(design)).length > 0;
  const [busy, setBusy] = useState<"pdf" | "print" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(kind: "pdf" | "print" | "png") {
    setBusy(kind);
    setError(null);
    try {
      const out = await import("@/lib/signStudio/output");
      if (kind === "png") await out.downloadQrPng(reviewUrl);
      else {
        const bytes = await out.fetchSignPdf(businessId, downloadDesign, studio ? logo : null);
        if (kind === "pdf") out.downloadPdf(bytes, signFileName(studio ? design.size : basic.size));
        else out.printPdf(bytes);
      }
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      setError(reason === "plan_required" ? tk(locale, "error.plan") : reason === "low_contrast" ? tk(locale, "contrast.blocked") : tk(locale, "error.failed"));
    } finally {
      setBusy(null);
    }
  }

  // Escape closes; the page behind doesn't scroll; focus starts inside.
  const dialogRef = useRef<HTMLDivElement>(null);
  const { onClose } = props;
  useEffect(() => {
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
  }, [onClose]);

  const growChoice = <F extends "theme" | "size">(field: F, options: readonly string[]) => ({
    isLocked: (o: string) => !options.includes(o),
    onPick: (o: string, isLocked: boolean) => {
      if (isLocked) previewLocked({ [field]: o } as Partial<SignDesign>);
      else {
        setPremiumPreview(null);
        props.onBasicChange({ ...basic, [field]: o });
      }
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color:color-mix(in_srgb,var(--color-ink)_45%,transparent)] sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sign-studio-title"
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-card outline-none sm:max-h-[92vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-paper-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="sign-studio-title" className="font-serif text-lg font-semibold text-ink">
              {t(locale, "dashboard.websiteReviews.hero.design")}
            </h2>
            <p className="text-[12.5px] text-ink-soft">{studio ? tk(locale, "subtitle") : tk(locale, "basicSubtitle")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tk(locale, "close")} className="rounded-lg p-1.5 text-ink-mute hover:bg-paper hover:text-ink">
            <IconX size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:overflow-hidden">
          {/* Preview — first on phones. */}
          <div className="flex flex-col items-center gap-2 bg-paper-deep p-4 md:overflow-y-auto">
            <span className="self-start text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{tk(locale, "preview")}</span>
            {premiumPreview && (
              <div className="flex w-full max-w-[26rem] flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-white px-3 py-2 text-[12px] text-ink">
                <span>{tk(locale, "premiumPreview")}</span>
                <span className="flex items-center gap-3">
                  <Link href={`/business/${businessId}/connect-gbp`} className="font-semibold text-ink underline decoration-brass underline-offset-2">
                    {tk(locale, "upgrade")}
                  </Link>
                  <button type="button" onClick={() => setPremiumPreview(null)} className="font-medium text-ink-soft underline">
                    {tk(locale, "backToMine")}
                  </button>
                </span>
              </div>
            )}
            <div
              data-testid="sign-preview"
              className="relative w-full max-w-[22rem] bg-white shadow-card md:max-w-[26rem] [&>svg]:block"
              style={{ aspectRatio: `${w} / ${h}` }}
              dangerouslySetInnerHTML={{ __html: preview ?? "" }}
            />
            {!preview && <p className="text-[12px] text-ink-soft">{fontError ? tk(locale, "error.failed") : tk(locale, "loadingFonts")}</p>}
            {shown.size === "tent" && <p className="max-w-[26rem] text-center text-[12px] text-ink-soft">{tk(locale, "tentNote")}</p>}
            {shown.size === "cards4" && <p className="max-w-[26rem] text-center text-[12px] text-ink-soft">{tk(locale, "cardsNote")}</p>}
          </div>

          {/* Options */}
          <div className="flex flex-col px-4 pb-3 sm:px-5 md:overflow-y-auto">
            {studio ? (
              <>
                <StudioControls
                  value={design}
                  update={(patch) => updateStudio(patch)}
                  locked={false}
                  content={content}
                  logo={logo}
                  onLogo={props.onLogoFile}
                  logoNote={props.logoNote}
                  includeStyleAndSize
                />
                {problems.length > 0 && (
                  <div role="alert" className="mt-2 rounded-lg border border-[color:color-mix(in_srgb,var(--color-amber)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-amber)_8%,white)] p-3 text-[12.5px] text-ink">
                    {problems.map((p) => (
                      <p key={p}>{tk(locale, `contrast.${p}`)}</p>
                    ))}
                    <p className="mt-1 font-semibold">{tk(locale, "contrast.blocked")}</p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => props.onDesignChange(defaultDesign(locale))}
                  className="mt-3 inline-flex w-fit items-center gap-1.5 text-[12.5px] font-medium text-ink-soft underline hover:text-ink"
                >
                  <IconRefresh size={14} aria-hidden />
                  {tk(locale, "reset")}
                </button>
              </>
            ) : (
              <>
                <Section title={tk(locale, "section.style")} open>
                  <Choices
                    name="grow-theme"
                    value={(premiumPreview ?? growDesign).theme}
                    options={[...SIGN_THEMES, "custom"] as SignThemeId[]}
                    label={(o) => tk(locale, `theme.${o}`)}
                    desc={(o) => tk(locale, `theme.${o}Desc`)}
                    swatch={(o) => <ThemeSwatch theme={o} design={premiumPreview ?? growDesign} />}
                    {...growChoice("theme", BASIC_THEMES)}
                  />
                </Section>
                <Section title={tk(locale, "section.size")} open>
                  <Choices
                    name="grow-size"
                    value={(premiumPreview ?? growDesign).size}
                    options={SIGN_SIZES}
                    label={(o) => tk(locale, `size.${o}`)}
                    desc={(o) => sizeDesc(o, locale)}
                    {...growChoice("size", BASIC_SIZES)}
                  />
                </Section>
                <StudioControls
                  value={premiumPreview ?? growDesign}
                  update={(patch) => previewLocked(patch)}
                  locked
                  content={content}
                  logo={null}
                  onLogo={() => {}}
                  logoNote={null}
                  includeStyleAndSize={false}
                />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-paper-line px-4 py-3 sm:px-5">
          <button type="button" onClick={() => run("pdf")} disabled={busy !== null || downloadBlocked} className={BRASS_BUTTON}>
            <IconDownload size={15} aria-hidden />
            {busy === "pdf" ? t(locale, "dashboard.websiteReviews.hero.working") : tk(locale, "downloadPdf")}
          </button>
          <button type="button" onClick={() => run("print")} disabled={busy !== null || downloadBlocked} className={OUTLINE_BUTTON}>
            <IconPrinter size={15} aria-hidden />
            {tk(locale, "print")}
          </button>
          <button type="button" onClick={() => run("png")} disabled={busy !== null} className={OUTLINE_BUTTON}>
            <IconQrcode size={15} aria-hidden />
            {t(locale, "dashboard.websiteReviews.hero.downloadQr")}
          </button>
          {error && (
            <span role="alert" className="text-[12px] text-red">
              {error}
            </span>
          )}
        </div>
      </div>
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
