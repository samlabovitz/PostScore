"use client";

// The coupon designer and referral card designer, built into the coupon
// and referral pages: the page keeps its own fields (offer, quick picks,
// code, instructions, terms, expiry, Share, Save) and passes the text
// in; this adds one "Customize design" row (a compact tabbed panel), the
// live card / sheet preview, and the outputs. A base-plan feature gated
// only by getPlan(): Free can preview (panel read-only), Grow prints the
// basic card (2 styles, 2 sizes, QR destination), Premium / Multi get
// every option. Every output is re-checked by the server
// (app/api/business/[id]/print-card).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  IconBookmark,
  IconDimensions,
  IconDownload,
  IconLayoutGrid,
  IconLock,
  IconPalette,
  IconPhoto,
  IconPhotoDown,
  IconPrinter,
  IconQrcode,
  IconSparkles,
  IconTrash,
  IconCopy,
  IconPencil,
  IconTypography,
} from "@tabler/icons-react";
import { PlanMarksContext, CHOICE, CHOICE_OFF, CHOICE_ON, Choices, ContrastAlert, INPUT, Label, PremiumPreviewBanner, SELECT, Toggle, fetchSignFont, readLogoFile, usePrintFonts } from "@/components/studio/StudioControls";
import { CustomizeDesign, type DesignTab } from "@/components/studio/CustomizeDesign";
import type { Plan } from "@/lib/plan";
import {
  FONTS,
  FONT_IDS,
  LOGO_REMEMBER_MAX_BYTES,
  LOGO_STORAGE_KEY,
  LOGO_TYPES,
  QR_CENTERS,
  QR_CORNERS,
  QR_DOTS,
  SIGN_LANGUAGES,
  SIGN_TEXT_SIZES,
  SIGN_THEMES,
  THEME_COLORS,
  designFontFiles,
  parseStoredLogo,
  readStorage,
  signAccess,
  writeStorage,
  type SignThemeId,
  type StoredLogo,
} from "@/lib/signStudio/design";
import { createMeasurer, loadFontFiles } from "@/lib/signStudio/fonts";
import { renderPageSvg } from "@/lib/signStudio/svg";
import {
  BASIC_CARD_SIZES,
  BASIC_CARD_THEMES,
  CARD_BORDERS,
  CARD_CORNERS,
  CARD_PATTERNS,
  CARD_SHEETS,
  CARD_SIZES,
  COUPON_TEMPLATES,
  GRADIENT_ANGLES,
  LETTER,
  LETTER_SPACINGS,
  NOTE_MAX,
  PUNCHES_MAX,
  PUNCHES_MIN,
  PASS_ON_TEMPLATES,
  BASIC_REFERRAL_TEMPLATES,
  REFERRAL_TEMPLATES,
  passOnForTemplate,
  SERIAL_MAX_COUNT,
  availableDestinations,
  basicCardDesign,
  cardContrastProblems,
  defaultBasicCard,
  defaultCardDesign,
  missingFields,
  todayIso,
  type BasicCard,
  type CardBusiness,
  type CardDesign,
  type CardKind,
  type CardSize,
  type CardTemplate,
  type CardText,
  type PassOn,
  type QrDestination,
  referralTemplate,
} from "@/lib/printStudio/design";
import { CARD_ICONS, CARD_ICON_IDS, type CardIconId } from "@/lib/printStudio/icons";
import { layoutCardSheets, layoutSingleCard, serialLabel } from "@/lib/printStudio/layout";
import { cardQrUrl, cardQrs } from "@/lib/printStudio/qr";
import { formatShortDate, t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { designColors } from "@/lib/signStudio/design";
import {
  addSaved,
  applySaved,
  canSaveMore,
  deleteSaved,
  duplicateSaved,
  loadCardStore,
  renameSaved,
  saveCardStore,
  savedOfKind,
  NAME_MAX,
  type CardStore,
  type SavedCardText,
  type SavedDesign,
} from "@/lib/printStudio/savedDesigns";
import { cn } from "@/lib/utils";
import { UpgradeButton, UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { cancelPrint, finishPrint, startPrint, type PrintJob } from "@/lib/signStudio/output";
import { BRASS_BUTTON, OUTLINE_BUTTON } from "../website-reviews/buttonStyles";

const P = "dashboard.growth.print.";
const tp = (locale: Locale, key: string, vars?: Record<string, string | number>) => t(locale, `${P}${key}` as MessageKey, vars);
const ts = (locale: Locale, key: string, vars?: Record<string, string | number>) => t(locale, `dashboard.websiteReviews.studio.${key}` as MessageKey, vars);

/** The page's own fields, as the card prints them. */
export type CardPageText = Pick<CardText, "offer" | "friendOffer" | "referrerReward" | "expiration" | "code" | "subline" | "finePrint"> & {
  /** Referral: how customers pass it on (chosen at the top of the page). */
  passOn?: PassOn;
};

/** PNG export resolution: print (300 DPI at the real card size) or 2×. */
export const PNG_DPI = { print: 300, hiRes: 600 } as const;

/** A PNG's pixel size for a card, e.g. 3.5×2 in at 300 DPI = 1050×600. */
export function pngPixels(size: CardSize, dpi: number): { width: number; height: number } {
  const sheet = CARD_SHEETS[size];
  return { width: Math.round((sheet.w / 72) * dpi), height: Math.round((sheet.h / 72) * dpi) };
}

// ---- Plan strip: which plan gets what, current one highlighted ----

export function PlanStrip({ plan }: { plan: Plan }) {
  const locale = useLocale();
  const current = plan === "multi" ? "premium" : plan;
  const tiers = ["free", "grow", "premium"] as const;
  return (
    <div data-testid="plan-strip" className="grid grid-cols-1 gap-1.5 rounded-xl border border-paper-deep bg-white p-1.5 sm:grid-cols-3">
      {tiers.map((tier) => (
        <div
          key={tier}
          aria-current={tier === current ? "true" : undefined}
          className={cn("flex flex-col gap-0.5 rounded-lg px-3 py-2", tier === current ? "border border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)]" : "border border-transparent")}
        >
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
            {tp(locale, `plan.${tier}`)}
            {tier === current && <span className="rounded-full bg-ink px-1.5 py-px text-[10px] font-semibold text-white">{plan === "multi" ? tp(locale, "plan.multiCurrent") : tp(locale, "plan.current")}</span>}
          </span>
          <span className="text-[11.5px] leading-snug text-ink-soft">{tp(locale, `plan.${tier}Gets`)}</span>
        </div>
      ))}
    </div>
  );
}

function ThemeSwatch({ theme, colors }: { theme: SignThemeId; colors: CardDesign["customColors"] }) {
  const c = theme === "custom" ? colors : THEME_COLORS[theme];
  return (
    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-bold" style={{ background: c.background, color: c.text, borderColor: c.accent }}>
      A
    </span>
  );
}

/** A little proportional card outline for the size choices. */
function SizeThumb({ size }: { size: CardSize }) {
  const { w, h } = CARD_SHEETS[size];
  const scale = 22 / Math.max(w, h);
  return <span aria-hidden className="shrink-0 rounded-[2px] border border-ink-mute bg-white" style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} />;
}

function IconGlyph({ id, size = 18 }: { id: CardIconId; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d={CARD_ICONS[id]} fill="currentColor" />
    </svg>
  );
}

/** What a locked tab shows when a Grow user opens it. */
function lockedSample(tab: string, d: CardDesign, business: CardBusiness): Partial<CardDesign> {
  const templates = d.kind === "coupon" ? COUPON_TEMPLATES : PASS_ON_TEMPLATES[d.passOn];
  switch (tab) {
    case "template":
      return { template: templates.find((x) => x !== d.template) ?? templates[0] };
    case "text":
      return { headlineFont: "dmSerif", bodyFont: "poppins", letterSpacing: "wide" };
    case "extras":
      return { icon: business.icon, corners: "notch", border: "decorative" };
    default:
      return {};
  }
}

// ---- The tabs ----

export function cardTabs(p: {
  locale: Locale;
  value: CardDesign;
  /** locked = a Premium option: it previews, it doesn't change the card. */
  update: (patch: Partial<CardDesign>, locked: boolean) => void;
  premium: boolean;
  onBasic: (patch: Partial<BasicCard>) => void;
  qrDest: QrDestination;
  onQrDest: (d: QrDestination) => void;
  business: CardBusiness;
  logo: StoredLogo | null;
  onLogo: (file: File | null) => void;
  logoNote: string | null;
  fileRef: React.RefObject<HTMLInputElement>;
  saved: ReactNode;
  /** Referral: picking a template that needs another pass-on choice
   * switches it (Give & Get = tear-in-half). */
  onPassOn?: (passOn: PassOn) => void;
}): DesignTab[] {
  const { locale, value, update, premium, business, logo } = p;
  const locked = !premium;
  const L = () => locked;
  const pick = <F extends keyof CardDesign>(field: F) => (o: CardDesign[F]) => update({ [field]: o } as Partial<CardDesign>, locked);
  // Referral: every template shows. On Grow, Give & Get and Friend pass
  // are open (each is a pass-on choice's card); Thank-you carries the
  // Premium lock instead of disappearing.
  const referral = value.kind === "referral";
  const templates = referral ? REFERRAL_TEMPLATES : COUPON_TEMPLATES;
  const templateLocked = (o: CardTemplate) => (referral ? !premium && !BASIC_REFERRAL_TEMPLATES.includes(o) : locked);
  const pickTemplate = (o: CardTemplate, isLocked: boolean) => {
    if (!referral || isLocked) return update({ template: o }, isLocked);
    const passOn = passOnForTemplate(o, value.passOn);
    if (passOn !== value.passOn) p.onPassOn?.(passOn);
    // The basic card's template follows the pass-on choice.
    if (premium) update({ template: o }, false);
    else p.onBasic({});
  };
  const destinations = availableDestinations(business);
  const sheet = CARD_SHEETS[value.size];
  const pages = Math.ceil(value.serial.count / (sheet.cols * sheet.rows));

  return [
    {
      id: "template",
      label: tp(locale, "tab.template"),
      icon: IconLayoutGrid,
      locked: referral ? false : locked,
      content: (
        <>
          <Choices
            name="template"
            cols={referral ? 1 : 2}
            value={value.template}
            options={templates}
            label={(o) => tp(locale, `template.${o}`)}
            desc={referral ? (o) => tp(locale, `templateFor.${o}`) : undefined}
            isLocked={templateLocked}
            onPick={pickTemplate}
          />
          {value.template === "loyalty" && (
            <label className="flex flex-col gap-1">
              <Label>{tp(locale, "field.punches", { count: value.punches })}</Label>
              <input type="range" min={PUNCHES_MIN} max={PUNCHES_MAX} value={value.punches} onChange={(e) => update({ punches: Number(e.target.value) }, locked)} className="accent-[#b8862f]" />
            </label>
          )}
        </>
      ),
    },
    {
      id: "size",
      label: tp(locale, "tab.size"),
      icon: IconDimensions,
      content: (
        <Choices
          name="size"
          value={value.size}
          options={CARD_SIZES}
          label={(o) => tp(locale, `size.${o}`)}
          desc={(o) => tp(locale, `size.${o}Desc`)}
          swatch={(o) => <SizeThumb size={o} />}
          isLocked={(o) => !premium && !(BASIC_CARD_SIZES as readonly string[]).includes(o)}
          onPick={(o, isLocked) => (!premium && !isLocked ? p.onBasic({ size: o as BasicCard["size"] }) : update({ size: o }, isLocked))}
        />
      ),
    },
    {
      id: "text",
      label: tp(locale, "tab.text"),
      icon: IconTypography,
      locked,
      content: (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["headlineFont", "bodyFont"] as const).map((f) => (
              <label key={f} className="flex min-w-0 flex-col gap-1">
                <Label>{ts(locale, f)}</Label>
                <select value={value[f]} onChange={(e) => update({ [f]: e.target.value } as Partial<CardDesign>, locked)} className={SELECT}>
                  {FONT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {FONTS[id].family}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{ts(locale, "textSize")}</Label>
              <Choices name="textSize" cols={3} value={value.textSize} options={SIGN_TEXT_SIZES} label={(o) => ts(locale, `textSize.${o}`).slice(0, 1)} isLocked={L} onPick={pick("textSize")} />
            </div>
            <div>
              <Label>{tp(locale, "letterSpacing")}</Label>
              <Choices name="letterSpacing" cols={3} value={value.letterSpacing} options={LETTER_SPACINGS} label={(o) => tp(locale, `spacing.${o}`)} isLocked={L} onPick={pick("letterSpacing")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <Toggle locked={locked} checked={value.headlineBold} onChange={(v) => update({ headlineBold: v }, locked)} label={tp(locale, "headlineBold")} />
            <Toggle locked={locked} checked={value.headlineItalic} onChange={(v) => update({ headlineItalic: v }, locked)} label={tp(locale, "headlineItalic")} />
            <Toggle locked={locked} checked={value.bodyItalic} onChange={(v) => update({ bodyItalic: v }, locked)} label={tp(locale, "bodyItalic")} />
          </div>
          <div>
            <Label>{tp(locale, "section.language")}</Label>
            <Choices name="language" cols={3} value={value.language} options={SIGN_LANGUAGES} label={(o) => ts(locale, `language.${o}`)} isLocked={L} onPick={pick("language")} />
          </div>
          <div>
            <Label>{tp(locale, "show")}</Label>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {(Object.keys(value.show) as Array<keyof CardDesign["show"]>)
                .filter((k) => k !== "howTo" || value.kind === "referral")
                .map((k) => (
                  <Toggle key={k} locked={locked} checked={value.show[k]} onChange={(v) => update({ show: { ...value.show, [k]: v } }, locked)} label={tp(locale, `show.${k}`)} />
                ))}
            </div>
          </div>
        </>
      ),
    },
    {
      id: "colors",
      label: tp(locale, "tab.colors"),
      icon: IconPalette,
      content: (
        <>
          <Choices
            name="theme"
            value={value.theme}
            options={[...SIGN_THEMES, "custom"] as SignThemeId[]}
            label={(o) => ts(locale, `theme.${o}`)}
            swatch={(o) => <ThemeSwatch theme={o} colors={value.customColors} />}
            isLocked={(o) => !premium && !(BASIC_CARD_THEMES as readonly string[]).includes(o)}
            onPick={(o, isLocked) => (!premium && !isLocked ? p.onBasic({ theme: o as BasicCard["theme"] }) : update({ theme: o }, isLocked))}
          />
          {value.theme === "custom" && (
            <div className="grid grid-cols-3 gap-2">
              {(["background", "text", "accent"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-1 text-[12px] text-ink-soft">
                  {ts(locale, `colors.${k}`)}
                  <input type="color" value={value.customColors[k]} onChange={(e) => update({ customColors: { ...value.customColors, [k]: e.target.value } }, locked)} className="h-9 w-full cursor-pointer rounded-lg border border-paper-deep bg-white p-1" />
                </label>
              ))}
            </div>
          )}
          <Toggle locked={locked} checked={value.gradient.on} onChange={(v) => update({ gradient: { ...value.gradient, on: v } }, locked)} label={tp(locale, "gradient")} />
          {value.gradient.on && (
            <div className="grid grid-cols-[auto_1fr] items-end gap-2">
              <label className="flex flex-col gap-1 text-[12px] text-ink-soft">
                {tp(locale, "gradientTo")}
                <input type="color" value={value.gradient.to} onChange={(e) => update({ gradient: { ...value.gradient, to: e.target.value } }, locked)} className="h-9 w-14 cursor-pointer rounded-lg border border-paper-deep bg-white p-1" />
              </label>
              <Choices name="gradientAngle" cols={3} value={value.gradient.angle} options={GRADIENT_ANGLES} label={(o) => tp(locale, `angle.${o}`)} isLocked={L} onPick={(o) => update({ gradient: { ...value.gradient, angle: o } }, locked)} />
            </div>
          )}
          <div>
            <Label>{tp(locale, "pattern")}</Label>
            <Choices name="pattern" cols={3} value={value.pattern} options={CARD_PATTERNS} label={(o) => tp(locale, `pattern.${o}`)} isLocked={L} onPick={pick("pattern")} />
          </div>
        </>
      ),
    },
    {
      id: "qr",
      label: tp(locale, "tab.qr"),
      icon: IconQrcode,
      content: (
        <>
          <label className="flex flex-col gap-1">
            <Label>{tp(locale, "field.qr")}</Label>
            <select value={p.qrDest} onChange={(e) => p.onQrDest(e.target.value as QrDestination)} className={SELECT}>
              {destinations.map((d) => (
                <option key={d} value={d}>
                  {tp(locale, `dest.${d}`)}
                </option>
              ))}
            </select>
            {!business.website && <span className="text-[11.5px] text-ink-mute">{tp(locale, "dest.websiteMissing")}</span>}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{ts(locale, "qr.dots")}</Label>
              <Choices name="qrDots" cols={3} value={value.qrDots} options={QR_DOTS} label={(o) => ts(locale, `qr.dots.${o}`)} isLocked={L} onPick={pick("qrDots")} />
            </div>
            <div>
              <Label>{ts(locale, "qr.corners")}</Label>
              <Choices name="qrCorners" value={value.qrCorners} options={QR_CORNERS} label={(o) => ts(locale, `qr.corners.${o}`)} isLocked={L} onPick={pick("qrCorners")} />
            </div>
          </div>
          <div>
            <Label>{ts(locale, "qr.center")}</Label>
            <Choices name="qrCenter" cols={3} value={value.qrCenter} options={QR_CENTERS} label={(o) => ts(locale, `qr.center.${o}`)} isLocked={L} onPick={pick("qrCenter")} />
            {value.qrCenter === "logo" && !logo && premium && <p className="mt-1 text-[12px] text-amber">{ts(locale, "qr.centerNeedsLogo")}</p>}
          </div>
        </>
      ),
    },
    {
      id: "extras",
      label: tp(locale, "tab.extras"),
      icon: IconSparkles,
      locked,
      content: (
        <>
          <div>
            <Label>{tp(locale, "icon")}</Label>
            <div role="radiogroup" className="grid grid-cols-7 gap-1.5">
              {(["none", ...CARD_ICON_IDS] as const).map((id) => (
                <label key={id} title={tp(locale, `icon.${id}`)} className={cn(CHOICE, "items-center justify-center p-1.5", value.icon === id ? CHOICE_ON : CHOICE_OFF, id === business.icon && "ring-1 ring-brass")}>
                  <input type="radio" name="icon" checked={value.icon === id} onChange={() => update({ icon: id }, locked)} className="sr-only" aria-label={tp(locale, `icon.${id}`)} data-locked={locked ? "true" : undefined} />
                  {id === "none" ? <span className="text-[11px] text-ink-mute">—</span> : <span className="text-ink"><IconGlyph id={id} /></span>}
                </label>
              ))}
            </div>
            <span className="mt-1 block text-[11.5px] text-ink-mute">
              {tp(locale, "icon.suggested")}: {tp(locale, `icon.${business.icon}`)}
            </span>
          </div>
          {premium ? (
            <div className="flex flex-wrap items-center gap-2">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo.dataUrl} alt="" className="h-9 max-w-[5rem] rounded border border-paper-deep bg-white object-contain p-1" />
              )}
              <button type="button" onClick={() => p.fileRef.current?.click()} className={OUTLINE_BUTTON}>
                <IconPhoto size={15} aria-hidden />
                {logo ? ts(locale, "logo.replace") : ts(locale, "logo.add")}
              </button>
              {logo && (
                <button type="button" onClick={() => p.onLogo(null)} className="text-[12.5px] font-medium text-ink-soft underline hover:text-ink">
                  {ts(locale, "logo.remove")}
                </button>
              )}
              <input
                ref={p.fileRef}
                type="file"
                accept={LOGO_TYPES.join(",")}
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  p.onLogo(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <Toggle checked={value.showLogo} disabled={!logo} onChange={(v) => update({ showLogo: v }, false)} label={tp(locale, "showLogo")} />
              <p className="w-full text-[11.5px] text-ink-mute">{ts(locale, "logo.hint")}</p>
              {p.logoNote && <p className="w-full text-[12px] text-amber">{p.logoNote}</p>}
            </div>
          ) : (
            <p className="text-[12px] text-ink-mute">{ts(locale, "logo.hint")}</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{tp(locale, "corners")}</Label>
              <Choices name="corners" cols={3} value={value.corners} options={CARD_CORNERS} label={(o) => tp(locale, `corners.${o}`)} isLocked={L} onPick={pick("corners")} />
            </div>
            <div>
              <Label>{tp(locale, "align")}</Label>
              <Choices name="align" value={value.align} options={["left", "center"] as const} label={(o) => tp(locale, `align.${o}`)} isLocked={L} onPick={pick("align")} />
            </div>
          </div>
          <div>
            <Label>{tp(locale, "border")}</Label>
            <Choices name="border" cols={3} value={value.border} options={CARD_BORDERS} label={(o) => tp(locale, `border.${o}`)} isLocked={L} onPick={pick("border")} />
          </div>
          <div className="flex flex-col gap-2 border-t border-paper-line pt-3">
            <Toggle locked={locked} checked={value.doubleSided} onChange={(v) => update({ doubleSided: v }, locked)} label={tp(locale, "doubleSided")} hint={tp(locale, "doubleTip")} />
            {value.doubleSided && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Toggle locked={locked} checked={value.back.finePrint} onChange={(v) => update({ back: { ...value.back, finePrint: v } }, locked)} label={tp(locale, "back.finePrint")} />
                <Toggle locked={locked} checked={value.back.address} disabled={!business.address} onChange={(v) => update({ back: { ...value.back, address: v } }, locked)} label={tp(locale, "back.address")} />
                <Toggle locked={locked} checked={value.back.hours} disabled={!business.hours} onChange={(v) => update({ back: { ...value.back, hours: v } }, locked)} label={tp(locale, "back.hours")} />
                <label className="col-span-2 flex flex-col gap-1">
                  <Label>{tp(locale, "back.qr")}</Label>
                  <select value={value.back.qr} onChange={(e) => update({ back: { ...value.back, qr: e.target.value as QrDestination } }, locked)} className={SELECT}>
                    {destinations.map((d) => (
                      <option key={d} value={d}>
                        {tp(locale, `dest.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <Label>{tp(locale, "back.note")}</Label>
                  <input type="text" value={value.back.note} maxLength={NOTE_MAX} onChange={(e) => update({ back: { ...value.back, note: e.target.value } }, locked)} className={INPUT} />
                </label>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-paper-line pt-3">
            <Toggle locked={locked} checked={value.serial.on} onChange={(v) => update({ serial: { ...value.serial, on: v } }, locked)} label={tp(locale, "serial")} />
            {value.serial.on && (
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <Label>{tp(locale, "serialStart")}</Label>
                  <input type="number" min={1} max={99999} value={value.serial.start} onChange={(e) => update({ serial: { ...value.serial, start: Math.max(1, Number(e.target.value) || 1) } }, locked)} className={INPUT} />
                </label>
                <label className="flex flex-col gap-1">
                  <Label>{tp(locale, "serialCount")}</Label>
                  <input type="number" min={1} max={SERIAL_MAX_COUNT} value={value.serial.count} onChange={(e) => update({ serial: { ...value.serial, count: Math.min(SERIAL_MAX_COUNT, Math.max(1, Number(e.target.value) || 1)) } }, locked)} className={INPUT} />
                </label>
                <span className="col-span-2 text-[12px] text-ink-mute">
                  {tp(locale, "serialRange", { from: serialLabel(value.serial.start), to: serialLabel(value.serial.start + value.serial.count - 1), pages: pages * (value.doubleSided ? 2 : 1) })}
                </span>
              </div>
            )}
            <p className="text-[11.5px] text-ink-mute">{tp(locale, "codeFromAbove")}</p>
          </div>
        </>
      ),
    },
    { id: "saved", label: tp(locale, "tab.saved"), icon: IconBookmark, locked, content: p.saved },
  ];
}

// ---- The designer ----

export interface CardDesignerProps {
  kind: CardKind;
  plan: Plan;
  businessId: string;
  business: CardBusiness;
  /** The page's own fields. */
  text: CardPageText;
  /** The page's fields (offer, quick picks, code, instructions…). */
  fields: ReactNode;
  /** The page's own actions under the outputs (Share, Save…). */
  actions: ReactNode;
  /** Referral: a template pick that needs another pass-on choice. */
  onPassOnChange?: (passOn: PassOn) => void;
  /** Selecting a saved design: put its text back into the page's form. */
  onApplySaved?: (text: SavedCardText) => void;
  /** A Free showroom: the Customize panel shown open, on Template. */
  showroom?: boolean;
}

export function CardDesigner({ kind, plan, businessId, business, text, fields, actions, onPassOnChange, onApplySaved, showroom = false }: CardDesignerProps) {
  const locale = useLocale();
  const lang: "en" | "es" = locale === "es" ? "es" : "en";
  const access = signAccess(plan);
  const studio = access === "studio";
  const canPrint = access !== "none";
  const name = business.businessName ?? "";
  const destinations = availableDestinations(business);
  const defaultDest: QrDestination = destinations.includes("listing") ? "listing" : destinations.includes("review") ? "review" : "none";
  const fileRef = useRef<HTMLInputElement>(null);

  // Remembered on this device: read after mount (no hydration mismatch).
  const [store, setStore] = useState<CardStore>({ current: {}, basic: {}, saved: [] });
  const [logo, setLogo] = useState<StoredLogo | null>(null);
  useEffect(() => {
    setStore(loadCardStore(businessId, lang, name));
    setLogo(parseStoredLogo(readStorage(LOGO_STORAGE_KEY)));
  }, [businessId, lang, name]);
  const [logoNote, setLogoNote] = useState<string | null>(null);
  const [view, setView] = useState<"card" | "sheet">("card");
  const [face, setFace] = useState<"front" | "back">("front");
  const [premiumPreview, setPremiumPreview] = useState<Partial<CardDesign> | null>(null);
  const [saveName, setSaveName] = useState("");
  const [hiRes, setHiRes] = useState(false);

  // The page's text always wins; the design is only the look.
  const pageText: Partial<CardDesign> = { ...text, loyaltyReward: text.offer, businessName: name };
  const storedDesign = store.current[kind] ?? { ...defaultCardDesign(kind, lang, name, business.icon), qr: defaultDest };
  const merged: CardDesign = { ...storedDesign, ...pageText };
  // The pass-on choice decides which referral templates fit.
  const design: CardDesign = kind === "referral" ? { ...merged, template: referralTemplate(merged.passOn, merged.template) } : merged;
  const storedBasic = store.basic[kind] ?? { ...defaultBasicCard(kind, lang, name), qr: defaultDest };
  const basic: BasicCard = { ...storedBasic, ...(pageText as Partial<BasicCard>) };
  const basicLook = useMemo(() => basicCardDesign(basic, lang), [JSON.stringify(basic), lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown: CardDesign = studio ? design : premiumPreview ? { ...basicLook, ...premiumPreview, ...pageText } : basicLook;

  // The screen updates at once; the (synchronous) storage write waits a
  // moment so typing and clicking never wait on it.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = (next: CardStore) => {
    setStore(next);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => saveCardStore(businessId, next), 250);
  };
  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    },
    []
  );
  const setDesign = (patch: Partial<CardDesign>) => persist({ ...store, current: { ...store.current, [kind]: { ...storedDesign, ...patch } } });
  const setBasic = (patch: Partial<BasicCard>) => {
    setPremiumPreview(null);
    persist({ ...store, basic: { ...store.basic, [kind]: { ...storedBasic, ...patch } } });
  };
  const update = (patch: Partial<CardDesign>, locked: boolean) => (studio && !locked ? setDesign(patch) : setPremiumPreview((prev) => ({ ...(prev ?? {}), ...patch })));
  const setQr = (dest: QrDestination) => (studio ? setDesign({ qr: dest }) : setBasic({ qr: dest }));
  const resetDesign = () => {
    setPremiumPreview(null);
    if (studio) persist({ ...store, current: { ...store.current, [kind]: { ...defaultCardDesign(kind, lang, name, business.icon), qr: defaultDest } } });
    else persist({ ...store, basic: { ...store.basic, [kind]: { ...defaultBasicCard(kind, lang, name), qr: defaultDest } } });
  };
  useEffect(() => {
    if (!shown.doubleSided) setFace("front");
  }, [shown.doubleSided]);

  async function onLogo(file: File | null) {
    setLogoNote(null);
    if (!file) {
      setLogo(null);
      writeStorage(LOGO_STORAGE_KEY, null);
      return;
    }
    const result = await readLogoFile(file);
    if ("error" in result) {
      setLogoNote(ts(locale, `logo.${result.error}`));
      return;
    }
    setLogo(result.logo);
    if (result.logo.bytes <= LOGO_REMEMBER_MAX_BYTES) writeStorage(LOGO_STORAGE_KEY, JSON.stringify(result.logo));
    else {
      writeStorage(LOGO_STORAGE_KEY, null);
      setLogoNote(ts(locale, "logo.notRemembered"));
    }
  }

  // Preview: the card (front/back) or the whole printed sheet — the
  // same layout the PDF uses.
  const fonts = usePrintFonts(designFontFiles(shown));
  const showLogo = studio || premiumPreview ? logo : null;
  const logoShape = showLogo ? { aspect: showLogo.width / showLogo.height } : null;
  const credit = !studio && premiumPreview === null;
  const liveKey = JSON.stringify(shown);
  // Typing updates the preview after a 150 ms pause (rebuilding the card is
  // the slow part); picking a design or an option shows at once.
  const [shownKey, setShownKey] = useState(liveKey);
  const flushPreview = useRef(true);
  useEffect(() => {
    if (flushPreview.current) {
      flushPreview.current = false;
      setShownKey(liveKey);
      return;
    }
    const id = setTimeout(() => setShownKey(liveKey), 150);
    return () => clearTimeout(id);
  }, [liveKey]);
  const previewDesign = useMemo(() => JSON.parse(shownKey) as CardDesign, [shownKey]);
  // The QR only changes with its destination and style — not with text.
  const qrKey = JSON.stringify([previewDesign.qr, previewDesign.back.qr, previewDesign.qrDots, previewDesign.qrCorners, previewDesign.qrCenter, logoShape !== null, business.placeId, business.googleMapsUri, business.website]);
  const qrs = useMemo(() => cardQrs(previewDesign, business, logoShape !== null), [qrKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastPreview = useRef<string | null>(null);
  const preview = useMemo(() => {
    // New fonts still loading: keep showing the last card, never a blank.
    if (!fonts.measurer) return lastPreview.current;
    const shown = previewDesign;
    try {
      const input = { design: shown, business, credit, logo: logoShape, hasQr: (d: QrDestination) => cardQrUrl(d, business) !== null };
      let page;
      if (view === "sheet") {
        const perPage = CARD_SHEETS[shown.size].cols * CARD_SHEETS[shown.size].rows;
        // One sheet is enough to preview (numbered runs can be long).
        const sheets = layoutCardSheets({ ...input, design: { ...shown, serial: { ...shown.serial, count: Math.min(shown.serial.count, perPage) } } }, fonts.measurer);
        page = sheets.pages[face === "back" && sheets.doubleSided ? 1 : 0];
      } else {
        const single = layoutSingleCard(input, fonts.measurer);
        page = face === "back" && single.back ? single.back : single.front;
      }
      const svg = renderPageSvg(page, {
        qrs,
        fontFiles: designFontFiles(shown),
        logoHref: showLogo?.dataUrl ?? null,
        watermark: premiumPreview ? ts(locale, "premiumChip") : null,
        transparent: view === "card",
      });
      lastPreview.current = svg;
      return svg;
    } catch {
      return lastPreview.current;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts.measurer, shownKey, qrs, business, credit, showLogo, view, face, premiumPreview !== null, locale]);
  const sheet = CARD_SHEETS[shown.size];
  const [aw, ah] = view === "sheet" ? LETTER : [sheet.w, sheet.h];

  // Outputs: the real (unlocked) card only, never a Premium preview.
  const downloadDesign = studio ? design : basicLook;
  const missing = missingFields(downloadDesign, todayIso());
  const contrast = studio ? cardContrastProblems(design) : [];
  const blocked = !canPrint || missing.length > 0 || contrast.length > 0;
  const [busy, setBusy] = useState<"pdf" | "print" | "png" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printNote, setPrintNote] = useState<string | null>(null);
  const endpoint = `/api/business/${encodeURIComponent(businessId)}/print-card`;
  async function run(what: "pdf" | "print" | "png") {
    // Print: open the new tab (Safari etc.) now, inside the click.
    const job: PrintJob | null = what === "print" ? startPrint(t(locale, "dashboard.print.preparing")) : null;
    setBusy(what);
    setError(null);
    setPrintNote(null);
    try {
      const out = await import("@/lib/signStudio/output");
      const body = { kind, design: studio ? design : basic };
      if (what === "png") {
        // The server approves the design first (same plan check).
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, format: "design" }) });
        if (!res.ok) throw new out.SignRequestError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "failed");
        const approved = (await res.json()) as { design: CardDesign; credit: boolean };
        const files = designFontFiles(approved.design);
        const bytes = await loadFontFiles(files, fetchSignFont);
        const pngLogo = studio ? logo : null;
        const shape = pngLogo ? { aspect: pngLogo.width / pngLogo.height } : null;
        const single = layoutSingleCard({ design: approved.design, business, credit: approved.credit, logo: shape, hasQr: (d) => cardQrUrl(d, business) !== null }, createMeasurer(bytes));
        const embedded = Object.fromEntries(Object.entries(files).map(([role, file]) => [file, out.bytesToBase64(bytes[role as keyof typeof bytes])]));
        // Drawn at its exact pixel size (crisp text and QR), corners
        // outside the card left transparent.
        const px = pngPixels(approved.design.size, hiRes ? PNG_DPI.hiRes : PNG_DPI.print);
        const svg = renderPageSvg(single.front, { qrs: cardQrs(approved.design, business, shape !== null), fontFiles: files, logoHref: pngLogo?.dataUrl ?? null, embeddedFonts: embedded, transparent: true }).replace(
          'width="100%" height="100%"',
          `width="${px.width}" height="${px.height}"`
        );
        out.downloadDataUrl(await out.svgToPng(svg, px.width, px.height), `${kind}-card${hiRes ? "@2x" : ""}.png`);
      } else {
        const pdf = await out.fetchPrintPdf(endpoint, body, studio ? logo : null);
        if (what === "pdf") out.downloadPdf(pdf, `${kind}-cards.pdf`);
        else {
          // The very same PDF as Download.
          const result = finishPrint(job!, pdf);
          if (result === "tab") setPrintNote(t(locale, "dashboard.print.newTabNote"));
          if (result === "blocked") setError(t(locale, "dashboard.print.popupBlocked"));
        }
      }
    } catch (e) {
      if (job) cancelPrint(job);
      const reason = (e as { reason?: string }).reason;
      setError(reason === "plan_required" ? tp(locale, "lockedOutputs") : reason === "missing" ? tp(locale, "error.missing") : reason === "low_contrast" ? ts(locale, "contrast.blocked") : ts(locale, "error.failed"));
    } finally {
      setBusy(null);
    }
  }

  // Saved designs: this card type's own list. Saving keeps the look AND the
  // page's text; selecting brings both back in one update.
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageTextNow: SavedCardText = {
    offer: text.offer,
    friendOffer: text.friendOffer,
    referrerReward: text.referrerReward,
    expiration: text.expiration,
    code: text.code,
    subline: text.subline,
    finePrint: text.finePrint,
    ...(kind === "referral" && text.passOn ? { passOn: text.passOn } : {}),
  };
  const saveCurrent = () => {
    const next = addSaved(store, { name: saveName, kind, design: storedDesign, text: pageTextNow, now: new Date() });
    if (next === store) return;
    persist(next);
    setSaveName("");
    setSavedFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
  };
  const applySavedDesign = (id: string) => {
    const applied = applySaved(store, id);
    if (!applied) return;
    flushPreview.current = true;
    setPremiumPreview(null);
    persist(applied.store);
    if (applied.text) onApplySaved?.(applied.text);
    if (kind === "referral" && applied.text?.passOn) onPassOnChange?.(applied.text.passOn);
  };
  const saved = studio ? (
    <SavedDesignsList
      items={savedOfKind(store, kind)}
      locale={locale}
      locked={signAccess(plan) === "none"}
      inUseKey={JSON.stringify(storedDesign)}
      canSave={canSaveMore(store, kind)}
      saveName={saveName}
      onSaveName={setSaveName}
      onSave={saveCurrent}
      savedFlash={savedFlash}
      onUse={applySavedDesign}
      onRename={(id, nextName) => persist(renameSaved(store, id, nextName))}
      onDuplicate={(id) => persist(duplicateSaved(store, id, (n) => tp(locale, "saved.copyOf", { name: n }), new Date()))}
      onDelete={(id) => persist(deleteSaved(store, id))}
    />
  ) : (
    <p className="text-[12px] text-ink-mute">{tp(locale, "saved.premiumOnly")}</p>
  );

  const panelValue = studio ? design : premiumPreview ? shown : basicLook;
  const qrDest = studio ? design.qr : basic.qr;
  const summary = [
    ts(locale, `theme.${panelValue.theme}`),
    `${tp(locale, `size.${panelValue.size}`)}`,
    FONTS[panelValue.headlineFont].family,
    `QR → ${tp(locale, `dest.${qrDest}`)}`,
  ].join(" · ");

  return (
    <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
      {/* Left: the page's fields, then one "Customize design" row. */}
      <div className="flex min-w-0 flex-col gap-4 rounded-2xl border border-paper-deep bg-white p-5 shadow-card">
        {fields}
        <PlanMarksContext.Provider value={!studio}>
        <CustomizeDesign
          summary={summary}
          alwaysOpen={showroom}
          initialTab={showroom ? "template" : undefined}
          legend={studio ? null : t(locale, "dashboard.studio.planLegend")}
          storageKey={`postscore.designTab.${kind}.v1`}
          readOnlyNote={canPrint ? null : tp(locale, "lockedOutputs")}
          onReset={resetDesign}
          onOpenLockedTab={(id) => setPremiumPreview((prev) => ({ ...(prev ?? {}), ...lockedSample(id, basicLook, business) }))}
          tabs={cardTabs({ locale, value: panelValue, update, premium: studio, onBasic: setBasic, qrDest, onQrDest: setQr, business, logo, onLogo, logoNote, fileRef, saved, onPassOn: onPassOnChange })}
        />
        </PlanMarksContext.Provider>
        {studio && <ContrastAlert problems={contrast} />}
      </div>

      {/* Right: live preview (on top on phones), outputs, the page's actions. */}
      <div className="order-first flex min-w-0 flex-col gap-3 nav:order-none nav:sticky nav:top-4 nav:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">{ts(locale, "preview")}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex rounded-lg border border-paper-deep bg-white p-0.5" role="group" aria-label={tp(locale, "preview.sheet")}>
              {(["card", "sheet"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn("rounded-md px-2.5 py-0.5 text-[12px] font-semibold", view === v ? "bg-ink text-white" : "text-ink-soft")}>
                  {tp(locale, `preview.${v}`)}
                </button>
              ))}
            </span>
            {shown.doubleSided && (
              <span className="inline-flex rounded-lg border border-paper-deep bg-white p-0.5" role="group">
                {(["front", "back"] as const).map((f) => (
                  <button key={f} type="button" onClick={() => setFace(f)} aria-pressed={face === f} className={cn("rounded-md px-2.5 py-0.5 text-[12px] font-semibold", face === f ? "bg-ink text-white" : "text-ink-soft")}>
                    {tp(locale, `face.${f}`)}
                  </button>
                ))}
              </span>
            )}
          </span>
        </div>
        {premiumPreview && <PremiumPreviewBanner businessId={businessId} onBack={() => setPremiumPreview(null)} />}
        <div
          data-testid="card-preview"
          data-print-design
          className={cn("mx-auto w-full [&>svg]:block", view === "sheet" && "bg-white shadow-card")}
          style={{ aspectRatio: `${aw} / ${ah}`, maxWidth: view === "sheet" ? "24rem" : "32rem" }}
          dangerouslySetInnerHTML={{ __html: preview ?? "" }}
        />
        {!preview && <p className="text-[12px] text-ink-soft">{fonts.failed ? ts(locale, "error.failed") : ts(locale, "loadingFonts")}</p>}
        {shown.doubleSided && <p className="text-center text-[12px] font-medium text-ink-soft">{tp(locale, "doubleTip")}</p>}

        {/* Free: a showroom — the buttons are there, and open the promo box. */}
        {!canPrint ? (
          <div className="flex flex-wrap items-center gap-2" data-testid="outputs-showroom">
            <UpgradeButton feature="print" className={BRASS_BUTTON}>
              <IconLock size={15} aria-hidden />
              {ts(locale, "downloadPdf")}
            </UpgradeButton>
            <UpgradeButton feature="print" className={OUTLINE_BUTTON}>
              <IconLock size={15} aria-hidden />
              {ts(locale, "print")}
            </UpgradeButton>
            <UpgradeButton feature="print" className={OUTLINE_BUTTON}>
              <IconLock size={15} aria-hidden />
              {tp(locale, "png")}
            </UpgradeButton>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => run("pdf")} disabled={busy !== null || blocked} className={BRASS_BUTTON}>
              {canPrint ? <IconDownload size={15} aria-hidden /> : <IconLock size={15} aria-hidden />}
              {busy === "pdf" ? t(locale, "dashboard.websiteReviews.hero.working") : ts(locale, "downloadPdf")}
            </button>
            <button type="button" onClick={() => run("print")} disabled={busy !== null || blocked} className={OUTLINE_BUTTON}>
              {canPrint ? <IconPrinter size={15} aria-hidden /> : <IconLock size={15} aria-hidden />}
              {ts(locale, "print")}
            </button>
            <button type="button" onClick={() => run("png")} disabled={busy !== null || blocked} className={OUTLINE_BUTTON}>
              {canPrint ? <IconPhotoDown size={15} aria-hidden /> : <IconLock size={15} aria-hidden />}
              {tp(locale, "png")}
            </button>
            <label className={cn("flex items-center gap-1.5 text-[12px] text-ink-soft", !canPrint && "opacity-60")}>
              <input type="checkbox" checked={hiRes} disabled={!canPrint} onChange={(e) => setHiRes(e.target.checked)} className="h-3.5 w-3.5 accent-[#b8862f]" />
              {tp(locale, "pngHiRes")}
            </label>
          </div>
        )}
        {!canPrint ? (
          <p data-testid="outputs-locked" className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
            <IconLock size={14} className="text-brass" aria-hidden />
            {tp(locale, "lockedOutputs")}
          </p>
        ) : null}
        {!canPrint ? (
          <UpgradeTrigger feature="print" />
        ) : missing.length > 0 ? (
          <ul className="text-[12px] text-amber">
            {missing.map((m) => (
              <li key={m}>{tp(locale, `missing.${m}`)}</li>
            ))}
          </ul>
        ) : null}
        {error && (
          <p role="alert" className="text-[12px] text-red">
            {error}
          </p>
        )}
        {printNote && (
          <p role="status" className="text-[12px] font-medium text-ink">
            {printNote}
          </p>
        )}
        {actions}
        {/* The one honesty line (printing, sharing, counting). */}
        <p data-testid="redemptions" className="text-[12px] text-ink-mute">
          {tp(locale, "redemptions")}
        </p>
      </div>
    </div>
  );
}

/** A saved design's thumbnail: its colors and headline font, in miniature. */
function SavedThumb({ design }: { design: CardDesign }) {
  const colors = designColors(design);
  return (
    <span aria-hidden className="flex h-9 w-14 shrink-0 flex-col justify-between overflow-hidden rounded border border-paper-deep p-1" style={{ background: colors.background }}>
      <span className="h-1 w-6 rounded-sm" style={{ background: colors.accent }} />
      <span className="truncate text-[8px] font-bold leading-none" style={{ color: colors.text }}>
        {design.offer || design.friendOffer || "Aa"}
      </span>
    </span>
  );
}

function SavedDesignsList({
  items,
  locale,
  locked = false,
  inUseKey,
  canSave,
  saveName,
  onSaveName,
  onSave,
  savedFlash,
  onUse,
  onRename,
  onDuplicate,
  onDelete,
}: {
  items: SavedDesign[];
  locale: Locale;
  /** Free: saving opens the promo box (a showroom, 5f). */
  locked?: boolean;
  inUseKey: string;
  canSave: boolean;
  saveName: string;
  onSaveName: (v: string) => void;
  onSave: () => void;
  savedFlash: boolean;
  onUse: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2" data-testid="saved-designs">
      {items.length === 0 ? (
        <p className="text-[12px] text-ink-mute">{tp(locale, "saved.none")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((s) => {
            const inUse = JSON.stringify({ ...s.design }) === inUseKey;
            return (
              <li key={s.id} className="flex flex-col gap-1.5 rounded-lg border border-paper-deep bg-white px-2.5 py-2 text-[13px]">
                <div className="flex items-center gap-2.5">
                  <SavedThumb design={s.design} />
                  <div className="min-w-0 flex-1">
                    {renaming?.id === s.id ? (
                      <form
                        className="flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          onRename(s.id, renaming.value);
                          setRenaming(null);
                        }}
                      >
                        <input autoFocus value={renaming.value} maxLength={NAME_MAX} onChange={(e) => setRenaming({ id: s.id, value: e.target.value })} aria-label={tp(locale, "saved.rename")} className={INPUT} />
                        <button type="submit" className="shrink-0 text-[12px] font-semibold text-ink underline">
                          {tp(locale, "saved.renameSave")}
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="truncate font-medium text-ink">{s.name}</div>
                        <div className="text-[11.5px] text-ink-mute">
                          {s.savedAt ? tp(locale, "saved.savedOn", { date: formatShortDate(s.savedAt, locale) }) : tp(locale, "saved.savedEarlier")}
                          {inUse && <span className="ml-1.5 font-semibold text-ink-soft">· {tp(locale, "saved.inUse")}</span>}
                        </div>
                      </>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-[12px]">
                    <button type="button" onClick={() => onUse(s.id)} className="font-semibold text-ink underline">
                      {tp(locale, "saved.use")}
                    </button>
                    <button type="button" onClick={() => setRenaming({ id: s.id, value: s.name })} aria-label={tp(locale, "saved.rename")} title={tp(locale, "saved.rename")} className="text-ink-soft hover:text-ink">
                      <IconPencil size={15} />
                    </button>
                    <button type="button" disabled={!canSave} onClick={() => onDuplicate(s.id)} aria-label={tp(locale, "saved.duplicate")} title={tp(locale, "saved.duplicate")} className="text-ink-soft hover:text-ink disabled:opacity-40">
                      <IconCopy size={15} />
                    </button>
                    <button type="button" onClick={() => setConfirming(s.id)} aria-label={tp(locale, "saved.delete")} title={tp(locale, "saved.delete")} className="text-ink-soft hover:text-red">
                      <IconTrash size={15} />
                    </button>
                  </span>
                </div>
                {confirming === s.id && (
                  <div className="flex flex-wrap items-center gap-2 text-[12px]" role="alert">
                    <span className="text-ink">{tp(locale, "saved.deleteConfirm", { name: s.name })}</span>
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(s.id);
                        setConfirming(null);
                      }}
                      className="font-semibold text-red underline"
                    >
                      {tp(locale, "saved.deleteYes")}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="text-ink-soft underline">
                      {tp(locale, "saved.cancel")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canSave ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={saveName}
            maxLength={NAME_MAX}
            onChange={(e) => onSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
            }}
            placeholder={tp(locale, "saved.name")}
            aria-label={tp(locale, "saved.name")}
            className={INPUT}
          />
          {locked ? (
            <UpgradeButton feature="print" className={OUTLINE_BUTTON}>
              <IconLock size={14} aria-hidden />
              {tp(locale, "saved.save")}
            </UpgradeButton>
          ) : (
            <button type="button" onClick={onSave} disabled={!saveName.trim()} className={OUTLINE_BUTTON}>
              {savedFlash ? tp(locale, "saved.savedOk") : tp(locale, "saved.save")}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-ink-mute">{tp(locale, "saved.full")}</p>
      )}
      {savedFlash && (
        <p className="text-[12px] font-semibold text-green" role="status">
          {tp(locale, "saved.savedOk")}
        </p>
      )}
      <p className="text-[11.5px] text-ink-mute">{tp(locale, "saved.deviceNote")}</p>
    </div>
  );
}
