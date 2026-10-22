"use client";

// "Design your review sign". Premium/Multi: the full Sign Studio. Grow:
// the basic sign (Style + Size), with every Premium option still visible
// behind a lock — choosing one previews it with a "Premium" watermark,
// while Download and Print stay on the Grow sign. The PDF always comes
// from the server, which re-checks the plan (app/api/.../review-sign).
// Live preview on top on phones, options in collapsible sections.

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  IconDimensions,
  IconDownload,
  IconLayoutGrid,
  IconPalette,
  IconPhoto,
  IconPrinter,
  IconQrcode,
  IconSparkles,
  IconTypography,
} from "@tabler/icons-react";
import { reviewQrGeometry, type QrCenter, type QrCorners, type QrDots } from "@/lib/reviewQr";
import {
  BASIC_SIZES,
  BASIC_THEMES,
  CUSTOM_HEADLINE_MAX,
  FONTS,
  FONT_IDS,
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
  designFontFiles,
  headlineText,
  qrStyleOf,
  signFileName,
  type BasicChoices,
  type SignContent,
  type SignDesign,
  type SignSize,
  type SignThemeId,
  type StoredLogo,
} from "@/lib/signStudio/design";
import { layoutSign, PAGE_POINTS } from "@/lib/signStudio/layout";
import { signSvg } from "@/lib/signStudio/svg";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { cancelPrint, finishPrint, startPrint, type PrintJob } from "@/lib/signStudio/output";
import { BRASS_BUTTON, OUTLINE_BUTTON } from "./buttonStyles";
import { PlanMarksContext,
  CHOICE,
  CHOICE_OFF,
  CHOICE_ON,
  Choices,
  ContrastAlert,
  INPUT,
  Label,
  PremiumPreviewBanner,
  SELECT,
  StudioDialog,
  Toggle,
  usePrintFonts,
} from "@/components/studio/StudioControls";
import { CustomizeDesign, type DesignTab } from "@/components/studio/CustomizeDesign";
import { AskPostAI } from "@/components/studio/AskPostAI";

const K = "dashboard.websiteReviews.studio.";
const tk = (locale: Locale, key: string, vars?: Record<string, string | number>) => t(locale, `${K}${key}` as MessageKey, vars);

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

function useSignTabContents({
  value,
  update,
  locked,
  content,
  logo,
  onLogo,
  logoNote,
}: {
  value: SignDesign;
  update: (patch: Partial<SignDesign>, locked: boolean) => void;
  locked: boolean;
  content: SignContent;
  logo: StoredLogo | null;
  onLogo: (file: File | null) => void;
  logoNote: string | null;
}): Record<"layout" | "size" | "colors" | "font" | "text" | "logo" | "qr" | "extras", ReactNode> {
  const locale = useLocale();
  const L = () => locked;
  const pick =
    <F extends keyof SignDesign>(field: F) =>
    (o: SignDesign[F], isLocked: boolean) =>
      update({ [field]: o } as Partial<SignDesign>, isLocked);
  const signLang = value.language === "es" ? "es" : "en";
  const fileRef = useRef<HTMLInputElement>(null);

  return {
    layout: (
      <>
        <Choices
          name="layout"
          value={value.template}
          options={SIGN_TEMPLATES}
          label={(o) => tk(locale, `template.${o}`)}
          isLocked={L}
          onPick={pick("template")}
        />
      </>
    ),

    size: (
      <>
        <Choices
          name="size"
          value={value.size}
          options={SIGN_SIZES}
          label={(o) => tk(locale, `size.${o}`)}
          desc={(o) => sizeDesc(o, locale)}
          isLocked={L}
          onPick={pick("size")}
        />
      </>
    ),
    colors: (
      <>
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
      </>
    ),
    font: (
      <>
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
          <Choices
            name="textSize"
            cols={3}
            value={value.textSize}
            options={SIGN_TEXT_SIZES}
            label={(o) => tk(locale, `textSize.${o}`)}
            isLocked={L}
            onPick={pick("textSize")}
          />
        </div>
      </>
    ),

    text: (
      <>
        <div>
          <Label>{tk(locale, "headline")}</Label>
          <div className="flex flex-col gap-1.5">
            {[...SIGN_HEADLINES, "custom" as const].map((h) => (
              <label key={h} className={cn(CHOICE, value.headline === h ? CHOICE_ON : CHOICE_OFF)}>
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
          <Choices
            name="language"
            cols={3}
            value={value.language}
            options={SIGN_LANGUAGES}
            label={(o) => tk(locale, `language.${o}`)}
            isLocked={L}
            onPick={pick("language")}
          />
        </div>
      </>
    ),

    logo: (
      <>
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
      </>
    ),

    qr: (
      <>
        <div>
          <Label>{tk(locale, "qr.dots")}</Label>
          <Choices<QrDots>
            name="qrDots"
            cols={3}
            value={value.qrDots}
            options={QR_DOTS}
            label={(o) => tk(locale, `qr.dots.${o}`)}
            isLocked={L}
            onPick={pick("qrDots")}
          />
        </div>
        <div>
          <Label>{tk(locale, "qr.corners")}</Label>
          <Choices<QrCorners>
            name="qrCorners"
            value={value.qrCorners}
            options={QR_CORNERS}
            label={(o) => tk(locale, `qr.corners.${o}`)}
            isLocked={L}
            onPick={pick("qrCorners")}
          />
        </div>
        <div>
          <Label>{tk(locale, "qr.center")}</Label>
          <Choices<QrCenter>
            name="qrCenter"
            cols={3}
            value={value.qrCenter}
            options={QR_CENTERS}
            label={(o) => tk(locale, `qr.center.${o}`)}
            isLocked={L}
            onPick={pick("qrCenter")}
          />
          {value.qrCenter === "logo" && !logo && !locked && <p className="mt-1 text-[12px] text-amber">{tk(locale, "qr.centerNeedsLogo")}</p>}
        </div>
      </>
    ),

    extras: (
      <>
        <div>
          <Label>{tk(locale, "border")}</Label>
          <Choices name="border" value={value.border} options={SIGN_BORDERS} label={(o) => tk(locale, `border.${o}`)} isLocked={L} onPick={pick("border")} />
        </div>
        <div>
          <Label>{tk(locale, "background")}</Label>
          <Choices
            name="background"
            value={value.background}
            options={SIGN_BACKGROUNDS}
            label={(o) => tk(locale, `background.${o}`)}
            isLocked={L}
            onPick={pick("background")}
          />
        </div>
        <div>
          <Label>{tk(locale, "radius")}</Label>
          <Choices
            name="radius"
            cols={3}
            value={value.radius}
            options={SIGN_RADII}
            label={(o) => tk(locale, `radius.${o}`)}
            isLocked={L}
            onPick={pick("radius")}
          />
        </div>
      </>
    ),
  };
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
  /** The options tab shown first (tests; otherwise the remembered one). */
  initialTab?: string;
  /** The Free showroom: shown in place, not as a dialog. */
  inline?: boolean;
}

export function SignStudio(props: SignStudioProps) {
  const { access, businessId, reviewUrl, content, basic, design, logo } = props;
  const locale = useLocale();
  const studio = access === "studio";

  // Grow: a Premium option picked only for a look, never downloaded.
  const [premiumPreview, setPremiumPreview] = useState<SignDesign | null>(null);
  const growDesign = useMemo(() => basicDesign(basic, locale), [basic, locale]);
  const shown: SignDesign = studio ? design : (premiumPreview ?? growDesign);
  const showLogo = studio || premiumPreview !== null ? logo : null;

  const updateStudio = (patch: Partial<SignDesign>) => props.onDesignChange({ ...design, ...patch });
  const previewLocked = (patch: Partial<SignDesign>) => setPremiumPreview((prev) => ({ ...(prev ?? growDesign), ...patch }));

  // Fonts for the preview (the same files the PDF embeds).
  const fonts = usePrintFonts(designFontFiles(shown));

  const problems = contrastProblems(designColors(shown));
  const credit = !studio && premiumPreview === null;
  const measurer = fonts.measurer;
  const preview = useMemo(() => {
    if (!measurer) return null;
    try {
      const logoShape = showLogo ? { aspect: showLogo.width / showLogo.height } : null;
      const layout = layoutSign({ design: shown, content, credit, logo: logoShape }, measurer);
      const qr = reviewQrGeometry(reviewUrl, qrStyleOf(shown, logoShape !== null));
      return signSvg(layout, qr, shown, { logoHref: showLogo?.dataUrl ?? null, watermark: premiumPreview ? tk(locale, "premiumChip") : null });
    } catch {
      return null;
    }
  }, [measurer, shown, content, credit, showLogo, reviewUrl, premiumPreview, locale]);
  const [w, h] = PAGE_POINTS[shown.size];

  // What Download / Print send: never the Premium preview.
  const downloadDesign = studio ? design : basic;
  const downloadBlocked = studio && contrastProblems(designColors(design)).length > 0;
  const [busy, setBusy] = useState<"pdf" | "print" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  async function run(kind: "pdf" | "print" | "png") {
    // Print: open the new tab (Safari etc.) now, inside the click.
    const job: PrintJob | null = kind === "print" ? startPrint(t(locale, "dashboard.print.preparing")) : null;
    setBusy(kind);
    setError(null);
    setPrintNote(null);
    try {
      const out = await import("@/lib/signStudio/output");
      if (kind === "png") await out.downloadQrPng(reviewUrl);
      else {
        const bytes = await out.fetchSignPdf(businessId, downloadDesign, studio ? logo : null);
        if (kind === "pdf") out.downloadPdf(bytes, signFileName(studio ? design.size : basic.size));
        else {
          // The very same PDF as Download.
          const result = finishPrint(job!, bytes);
          if (result === "tab") setPrintNote(t(locale, "dashboard.print.newTabNote"));
          if (result === "blocked") setError(t(locale, "dashboard.print.popupBlocked"));
        }
      }
    } catch (e) {
      if (job) cancelPrint(job);
      const reason = (e as { reason?: string }).reason;
      setError(reason === "plan_required" ? tk(locale, "error.plan") : reason === "low_contrast" ? tk(locale, "contrast.blocked") : tk(locale, "error.failed"));
    } finally {
      setBusy(null);
    }
  }

  const { onClose } = props;

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

  const contents = useSignTabContents({
    value: studio ? design : (premiumPreview ?? growDesign),
    update: (patch) => (studio ? updateStudio(patch) : previewLocked(patch)),
    locked: !studio,
    content,
    logo: studio ? logo : null,
    onLogo: props.onLogoFile,
    logoNote: props.logoNote,
  });
  const growLook = premiumPreview ?? growDesign;
  const tabLabel = (id: string) => t(locale, `dashboard.growth.print.tab.${id}` as MessageKey);
  const tabs: DesignTab[] = [
    { id: "template", label: tabLabel("template"), icon: IconLayoutGrid, locked: !studio, content: contents.layout },
    {
      id: "size",
      label: tabLabel("size"),
      icon: IconDimensions,
      content: studio ? (
        contents.size
      ) : (
        <Choices
          name="grow-size"
          value={growLook.size}
          options={SIGN_SIZES}
          label={(o) => tk(locale, `size.${o}`)}
          desc={(o) => sizeDesc(o, locale)}
          {...growChoice("size", BASIC_SIZES)}
        />
      ),
    },
    {
      id: "text",
      label: tabLabel("text"),
      icon: IconTypography,
      locked: !studio,
      content: (
        <>
          {contents.font}
          {contents.text}
        </>
      ),
    },
    {
      id: "colors",
      label: tabLabel("colors"),
      icon: IconPalette,
      content: studio ? (
        contents.colors
      ) : (
        <Choices
          name="grow-theme"
          value={growLook.theme}
          options={[...SIGN_THEMES, "custom"] as SignThemeId[]}
          label={(o) => tk(locale, `theme.${o}`)}
          desc={(o) => tk(locale, `theme.${o}Desc`)}
          swatch={(o) => <ThemeSwatch theme={o} design={growLook} />}
          {...growChoice("theme", BASIC_THEMES)}
        />
      ),
    },
    { id: "qr", label: tabLabel("qr"), icon: IconQrcode, locked: !studio, content: contents.qr },
    {
      id: "extras",
      label: tabLabel("extras"),
      icon: IconSparkles,
      locked: !studio,
      content: (
        <>
          {contents.logo}
          {contents.extras}
        </>
      ),
    },
  ];

  return (
    <StudioDialog
      inline={props.inline}
      title={t(locale, "dashboard.websiteReviews.hero.design")}
      subtitle={studio ? tk(locale, "subtitle") : tk(locale, "basicSubtitle")}
      headerExtra={
        <div className="mt-1">
          <AskPostAI businessId={businessId} question="review_sign" />
        </div>
      }
      onClose={onClose}
      preview={
        <>
          <span className="self-start text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{tk(locale, "preview")}</span>
          {premiumPreview && <PremiumPreviewBanner businessId={businessId} onBack={() => setPremiumPreview(null)} />}
          <div
            data-testid="sign-preview"
            data-print-design={props.inline ? undefined : ""}
            className="relative w-full max-w-[22rem] bg-white shadow-card md:max-w-[26rem] [&>svg]:block"
            style={{ aspectRatio: `${w} / ${h}` }}
            dangerouslySetInnerHTML={{ __html: preview ?? "" }}
          />
          {!preview && <p className="text-[12px] text-ink-soft">{fonts.failed ? tk(locale, "error.failed") : tk(locale, "loadingFonts")}</p>}
          {shown.size === "tent" && <p className="max-w-[26rem] text-center text-[12px] text-ink-soft">{tk(locale, "tentNote")}</p>}
          {shown.size === "cards4" && <p className="max-w-[26rem] text-center text-[12px] text-ink-soft">{tk(locale, "cardsNote")}</p>}
        </>
      }
      options={
        <>
          <PlanMarksContext.Provider value={!studio}>
          <CustomizeDesign
            alwaysOpen
            legend={studio ? null : t(locale, "dashboard.studio.planLegend")}
            initialTab={props.initialTab}
            summary=""
            tabs={tabs}
            storageKey="postscore.designTab.sign.v1"
            onReset={studio ? () => props.onDesignChange(defaultDesign(locale)) : null}
            onOpenLockedTab={(id) =>
              previewLocked(
                id === "template"
                  ? { template: "banner" }
                  : id === "text"
                    ? { headlineFont: "dmSerif", bodyFont: "poppins" }
                    : id === "extras"
                      ? { border: "double", background: "pattern" }
                      : { qrDots: "dots" },
              )
            }
          />
          </PlanMarksContext.Provider>
          {studio && <ContrastAlert problems={problems} />}
        </>
      }
      footer={
        <>
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
          {printNote && (
            <span role="status" className="text-[12px] font-medium text-ink">
              {printNote}
            </span>
          )}
        </>
      }
    />
  );
}

export { readLogoFile } from "@/components/studio/StudioControls";
