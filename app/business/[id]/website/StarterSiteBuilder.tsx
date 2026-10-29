"use client";

import { platformPage } from "@/lib/socialLinkCheck";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconCheck,
  IconClock,
  IconDownload,
  IconMapPin,
  IconPhone,
  IconPhoto,
  IconRocket,
  IconWand,
  IconX,
  IconExternalLink,
  IconLock,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button, buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  STARTER_SITE_FONTS,
  STARTER_SITE_THEMES,
  STARTER_SITE_THEME_GROUPS,
  buildStarterSiteHtml,
  getStarterSiteTheme,
  type StarterSiteThemeGroup,
  type TaglinePlacement,
  type TaglineSize,
} from "@/lib/starterSite";
import type { OpeningHoursPeriod } from "@/lib/google/places";
import { ACCENT_STYLES, patternCss, type AccentStyle } from "@/lib/starterSiteArt";
import { defaultOwnerHours, ownerHoursFromGoogle, sameSchedule, type OwnerHours } from "@/lib/ownerHours";
import { HoursDifferNote, HoursGoogleTip, StarterHoursEditor } from "./StarterHoursEditor";
import { StarterSiteDetailsForm } from "./StarterSiteDetailsForm";
import { DESIGNER_COLOR_INPUT, DESIGNER_HELP, DESIGNER_INPUT, DESIGNER_LABEL, DesignerSection, designerChip } from "./DesignerSection";
import { sameDetails, type StarterSiteDetailFields, type StarterSiteDetails } from "@/lib/starterSiteDetails";
import { downloadTextFile } from "@/lib/downloadFile";
import { UpgradeButton } from "@/components/upgrade/UpgradeTrigger";
import { PREVIEW_HTML, PREVIEW_READY } from "./preview/StarterPreviewFrame";
import { resizeImageForEmbedding } from "@/lib/resizeImageForEmbedding";
import { markTaskDone } from "@/app/actions/actionPlan";
import { normalizeLocale, t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";

/**
 * lib/starterSite.ts's own STARTER_SITE_THEMES/STARTER_SITE_FONTS hold
 * the canonical English `.label` text as data — that file stays
 * untouched/English-only, so this view resolves each id's DASHBOARD-
 * locale display text through these keys instead of reading `.label`
 * directly. Never read those arrays' `.label` values as display text.
 */
const THEME_LABEL_KEY: Record<string, MessageKey> = {
  ink: "starterSite.theme.ink",
  terracotta: "starterSite.theme.terracotta",
  forest: "starterSite.theme.forest",
  slate: "starterSite.theme.slate",
  plum: "starterSite.theme.plum",
  teal: "starterSite.theme.teal",
  crimson: "starterSite.theme.crimson",
  ocean: "starterSite.theme.ocean",
  berry: "starterSite.theme.berry",
  graphite: "starterSite.theme.graphite",
  cobalt: "starterSite.theme.cobalt",
  emerald: "starterSite.theme.emerald",
  olive: "starterSite.theme.olive",
  espresso: "starterSite.theme.espresso",
  sage: "starterSite.theme.sage",
  blush: "starterSite.theme.blush",
  sky: "starterSite.theme.sky",
  sand: "starterSite.theme.sand",
};

const THEME_GROUP_KEY: Record<StarterSiteThemeGroup, MessageKey> = {
  classic: "dashboard.website.starter.themeGroup.classic",
  bold: "dashboard.website.starter.themeGroup.bold",
  light: "dashboard.website.starter.themeGroup.light",
  earthy: "dashboard.website.starter.themeGroup.earthy",
};

const ACCENT_LABEL_KEY: Record<AccentStyle, MessageKey> = {
  none: "dashboard.website.starter.accent.none",
  dots: "dashboard.website.starter.accent.dots",
  lines: "dashboard.website.starter.accent.lines",
  waves: "dashboard.website.starter.accent.waves",
  shapes: "dashboard.website.starter.accent.shapes",
};

/** The pattern itself as a small swatch (same CSS the site uses). */
function patternStyle(style: AccentStyle, color: string): React.CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of patternCss(style, color).split(/;\s*(?=[a-z-]+:)/)) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
    out[prop] = decl.slice(i + 1).trim().replace(/;$/, "");
  }
  return out;
}

/** Each value keeps the same " — short name / description" shape as the
 * English `.label` it replaces, since the compact tagline-font buttons
 * below split on " — " to show just the short name. */
const FONT_LABEL_KEY: Record<string, MessageKey> = {
  classic: "starterSite.font.classic",
  modern: "starterSite.font.modern",
  elegant: "starterSite.font.elegant",
  friendly: "starterSite.font.friendly",
  minimal: "starterSite.font.minimal",
  editorial: "starterSite.font.editorial",
  geometric: "starterSite.font.geometric",
  grotesk: "starterSite.font.grotesk",
  statement: "starterSite.font.statement",
  vintage: "starterSite.font.vintage",
};

/** Keeps the downloaded HTML file's size reasonable — each photo is
 * already resized/compressed (see resizeImageForEmbedding), but a hard
 * cap on count is a simple, honest way to bound the total. */
const MAX_CONTENT_IMAGES = 4;

const TAGLINE_SIZES: Array<{ value: TaglineSize; labelKey: MessageKey }> = [
  { value: "small", labelKey: "dashboard.website.starter.taglineSizeSmall" },
  { value: "medium", labelKey: "dashboard.website.starter.taglineSizeMedium" },
  { value: "large", labelKey: "dashboard.website.starter.taglineSizeLarge" },
];

const TAGLINE_PLACEMENTS: Array<{ value: TaglinePlacement; labelKey: MessageKey }> = [
  { value: "below", labelKey: "dashboard.website.starter.placementBelow" },
  { value: "above", labelKey: "dashboard.website.starter.placementAbove" },
];

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "starter-site";
}

interface ToggleRowProps {
  icon: typeof IconMapPin;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  available: boolean;
  /** A small link on the right (hours: "Add your hours"). */
  action?: React.ReactNode;
}

/** Every "What to include" row: checkbox · icon · label, aligned; the
 * right side says why it's off ("Not on file") or holds a small link. */
function ToggleRow({ icon: Icon, label, checked, onChange, available, action }: ToggleRowProps) {
  const locale = useLocale();
  return (
    <div className="flex min-h-10 items-center gap-3 py-1.5">
      <label className={cn("flex min-w-0 flex-1 items-center gap-3 text-sm", available ? "cursor-pointer text-ink" : "cursor-not-allowed text-ink-mute")}>
        <input
          type="checkbox"
          checked={available && checked}
          disabled={!available}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brass disabled:opacity-40"
        />
        <Icon size={15} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{label}</span>
      </label>
      {action ?? (!available && <span className="shrink-0 text-[12px] text-ink-mute">{t(locale, "dashboard.website.starter.notOnFile")}</span>)}
    </div>
  );
}

export function StarterSiteBuilder({
  businessId,
  businessName,
  businessLanguage,
  category,
  phone,
  address,
  openingHoursPeriods,
  starterSiteHours = null,
  starterSiteDetails = null,
  timeZone = "America/New_York",
  placeId = null,
  socialLinks = [],
  year,
  storefront = true,
  mapEmbed = null,
  listingWebsite = null,
  profileId,
  builderOfferReason,
  postStudioHref = null,
  onSiteLocaleChange,
  free = false,
}: {
  businessId: string;
  businessName: string;
  /** The business's own real language column — only used to default the
   * generated site's own "Site language" selector below; the dashboard
   * chrome around the generator always follows the dashboard's own
   * locale (useLocale()), never this. */
  businessLanguage: string | null;
  /** Google's name/type/address/phone: only the pre-fill for "Your
   * business details" — the site uses what the owner confirms. */
  category: string | null;
  phone: string | null;
  address: string | null;
  /** Google's hours — only to pre-fill the hours editor and to flag owner
   * hours that differ; never put on the site. */
  openingHoursPeriods: OpeningHoursPeriod[] | null;
  /** Hours the owner saved for the website (supabase/hours.sql) — website only, never scored. */
  starterSiteHours?: OwnerHours | null;
  /** false until supabase/hours.sql has been run (saving then just isn't remembered). */
  starterSiteHoursEnabled?: boolean;
  /** The details the owner confirmed (supabase/starter-site-details.sql). */
  starterSiteDetails?: StarterSiteDetails | null;
  /** false until supabase/starter-site-details.sql has been run. */
  starterSiteDetailsEnabled?: boolean;
  /** The business's time zone — the site highlights today in it. */
  timeZone?: string;
  /** The Google place ID: the site's reviews link and map. */
  placeId?: string | null;
  /** Social profiles on file that were verified to open the real profile. */
  socialLinks?: Array<{ platform: string; url: string }>;
  /** The copyright year for the footer (from the server, so both renders match). */
  year?: number;
  /** A real storefront (lib/starterSite.ts hasStorefront): street address, directions and map. */
  storefront?: boolean;
  /** Maps Embed API key + place id; null = no map, address and link only. */
  mapEmbed?: { key: string; placeId: string } | null;
  /** The Google listing's website field — an ordering / booking page there pre-fills the site's button. */
  listingWebsite?: string | null;
  profileId: string;
  /** Why the builder is being offered — see BuilderOffer in
   * app/actions/website.ts. Drives the headline/subcopy only; the
   * generator itself is identical in every case. */
  builderOfferReason: "no_website" | "underperforming" | "backup";
  /** The quiet "Need more than one page? PostStudio →" (null: they have it). */
  postStudioHref?: string | null;
  /** Lets a parent (the FAQ section, which shares no other state with
   * this component) mirror the generated site's chosen language — see
   * WebsiteGeneratorSection.tsx. */
  onSiteLocaleChange?: (locale: Locale) => void;
  /** Free: everything can be customized; the download is locked and "Open
   * full preview" shows a watermarked preview instead. */
  free?: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [siteLocale, setSiteLocaleState] = useState<Locale>(() => normalizeLocale(businessLanguage));
  function setSiteLocale(next: Locale) {
    setSiteLocaleState(next);
    onSiteLocaleChange?.(next);
  }
  const [tagline, setTagline] = useState("");
  const [taglineFontId, setTaglineFontId] = useState(STARTER_SITE_FONTS[0].id);
  const [taglineColor, setTaglineColor] = useState<string | null>(null);
  const [taglineSize, setTaglineSize] = useState<TaglineSize>("medium");
  const [taglinePlacement, setTaglinePlacement] = useState<TaglinePlacement>("below");
  const [themeId, setThemeId] = useState(STARTER_SITE_THEMES[0].id);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const [fontId, setFontId] = useState(STARTER_SITE_FONTS[0].id);
  const [accentStyle, setAccentStyle] = useState<AccentStyle>("dots");
  // The details on the site: the owner's confirmed ones, else Google's as
  // a pre-fill to confirm or edit. No Google content goes on the owner's
  // own site — the download waits for the confirmation.
  // The listing's ordering / booking / page link, pre-filled as the site's
  // big button (rows saved before the link field keep it pre-filled).
  const prefillLink = platformPage(listingWebsite) ? (listingWebsite ?? "").trim() : "";
  const savedLink = starterSiteDetails ? (starterSiteDetails.linkSaved === false ? prefillLink : starterSiteDetails.link) : prefillLink;
  const [details, setDetails] = useState<StarterSiteDetailFields>(
    () =>
      starterSiteDetails
        ? { name: starterSiteDetails.name, category: starterSiteDetails.category, address: starterSiteDetails.address, phone: starterSiteDetails.phone, link: savedLink }
        : { name: businessName, category: category ?? "", address: address ?? "", phone: phone ?? "", link: prefillLink }
  );
  const [confirmedDetails, setConfirmedDetails] = useState<StarterSiteDetailFields | null>(
    starterSiteDetails ? { name: starterSiteDetails.name, category: starterSiteDetails.category, address: starterSiteDetails.address, phone: starterSiteDetails.phone, link: savedLink } : null
  );
  const detailsConfirmed = confirmedDetails !== null && sameDetails(confirmedDetails, details);
  const [showAddress, setShowAddress] = useState(!!details.address);
  const [showPhone, setShowPhone] = useState(!!details.phone);
  // Hours: only the owner's own (never scored, never Google's).
  const googleSchedule = useMemo(() => ownerHoursFromGoogle(openingHoursPeriods), [openingHoursPeriods]);
  const [ownerHours, setOwnerHours] = useState<OwnerHours | null>(starterSiteHours);
  const [hoursEditorOpen, setHoursEditorOpen] = useState(false);
  const [showHours, setShowHours] = useState(starterSiteHours !== null);
  const [heroImage, setHeroImage] = useState<{ dataUri: string; alt: string } | null>(null);
  const [contentImages, setContentImages] = useState<Array<{ dataUri: string; alt: string }>>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handleHeroImageSelect(file: File | null) {
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUri = await resizeImageForEmbedding(file, 1600);
      setHeroImage({ dataUri, alt: t(siteLocale, "starterSite.heroPhotoAlt", { name: details.name.trim() || businessName }) });
    } catch {
      setPhotoError(t(locale, "dashboard.website.starter.photoErrorFallback"));
    }
  }

  async function handleContentImageSelect(file: File | null) {
    if (!file) return;
    if (contentImages.length >= MAX_CONTENT_IMAGES) return;
    setPhotoError(null);
    try {
      const dataUri = await resizeImageForEmbedding(file, 1000);
      setContentImages((prev) => [
        ...prev,
        { dataUri, alt: t(siteLocale, "starterSite.contentPhotoAlt", { name: details.name.trim() || businessName }) },
      ]);
    } catch {
      setPhotoError(t(locale, "dashboard.website.starter.photoErrorFallback"));
    }
  }

  function removeContentImage(index: number) {
    setContentImages((prev) => prev.filter((_, i) => i !== index));
  }

  function handleThemeSelect(id: string) {
    setThemeId(id);
    setCustomAccent(null); // a fresh theme choice starts from that theme's own accent
  }

  const currentTheme = getStarterSiteTheme(themeId);
  const effectiveAccent = customAccent ?? currentTheme.accent;

  const html = useMemo(
    () =>
      buildStarterSiteHtml({
        locale: siteLocale,
        businessName: details.name,
        category: details.category.trim() || null,
        tagline,
        taglineFontId,
        taglineColor,
        taglineSize,
        taglinePlacement,
        phone: details.phone.trim() || null,
        address: details.address.trim() || null,
        actionLink: details.link.trim() || null,
        ownerHours,
        timeZone,
        placeId,
        socialLinks,
        year,
        storefront,
        mapEmbed,
        profileId,
        themeId,
        customAccent,
        fontId,
        accentStyle,
        show: { address: showAddress, phone: showPhone, hours: showHours },
        heroImage,
        contentImages,
      }),
    [
      siteLocale,
      details,
      tagline,
      taglineFontId,
      taglineColor,
      taglineSize,
      taglinePlacement,
      ownerHours,
      timeZone,
      placeId,
      socialLinks,
      year,
      storefront,
      mapEmbed,
      profileId,
      themeId,
      customAccent,
      fontId,
      accentStyle,
      showAddress,
      showPhone,
      showHours,
      heroImage,
      contentImages,
    ]
  );

  // The download goes through the server, which checks the plan (Free is
  // refused there too) — /api/business/[id]/starter-site.
  const [downloadError, setDownloadError] = useState<string | null>(null);
  async function handleDownload() {
    if (!detailsConfirmed) return;
    setDownloadError(null);
    try {
      const res = await fetch(`/api/business/${businessId}/starter-site`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) });
      if (!res.ok) throw new Error(res.status === 403 ? t(locale, "dashboard.free.web.downloadRefused") : String(res.status));
      downloadTextFile(await res.text(), `${slugify(details.name.trim() || businessName)}-website.html`, "text/html");
    } catch (err) {
      setDownloadError(err instanceof Error && err.message.length > 3 ? err.message : t(locale, "dashboard.website.starter.downloadHelper"));
    }
  }

  /** Free: the full one-page preview in a new tab (watermarked, owner only).
   * The tab says when it's ready; the site is then posted to it alone. */
  function openFullPreview() {
    const win = window.open(`/business/${businessId}/website/preview`, "_blank");
    if (!win) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win || event.origin !== window.location.origin || event.data?.type !== PREVIEW_READY) return;
      win.postMessage({ type: PREVIEW_HTML, html }, window.location.origin);
      window.removeEventListener("message", onMessage);
    };
    window.addEventListener("message", onMessage);
    window.setTimeout(() => window.removeEventListener("message", onMessage), 60_000);
  }

  const [markState, setMarkState] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  async function handleMarkPublished() {
    setMarkState({ kind: "saving" });
    const result = await markTaskDone(businessId, "website.has_website");
    if (result.status === "ok") {
      setMarkState({ kind: "done" });
      router.refresh();
    } else {
      setMarkState({
        kind: "error",
        message: result.status === "error" ? result.message : t(locale, "dashboard.website.starter.markErrorFallback"),
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconWand size={14} />
          {/* Free: "try it free" — up top, never a buried dropdown. */}
          {free && builderOfferReason === "no_website" ? t(locale, "dashboard.free.web.generatorHeading") : t(locale, "dashboard.website.starter.eyebrow")}
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink" data-testid="starter-heading">
          {free && builderOfferReason !== "no_website"
            ? t(locale, "dashboard.free.web.generatorHeading")
            : builderOfferReason === "no_website"
            ? t(locale, "dashboard.website.starter.headlineNoWebsite")
            : builderOfferReason === "underperforming"
              ? t(locale, "dashboard.website.starter.headlineUnderperforming")
              : t(locale, "dashboard.website.starter.headlineBackup")}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          {builderOfferReason === "no_website"
            ? t(locale, "dashboard.website.starter.subcopyNoWebsite")
            : builderOfferReason === "underperforming"
              ? t(locale, "dashboard.website.starter.subcopyUnderperforming")
              : t(locale, "dashboard.website.starter.subcopyBackup")}
        </p>
        {/* The page's one other PostStudio mention: a quiet line. */}
        {postStudioHref && (
          <p className="mt-1.5 text-[13px] text-ink-soft" data-testid="poststudio-line">
            {t(locale, "dashboard.website.studioShowcase.headerLine")}{" "}
            <Link href={postStudioHref} className="font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
              PostStudio →
            </Link>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
        {/* The options: numbered section cards, 24px apart. */}
        <div className="flex min-w-0 flex-col gap-6" data-testid="starter-options">
          <DesignerSection id="language" number={1} title={t(locale, "dashboard.website.starter.section.language")} defaultOpen>
            <div className="flex flex-col gap-1.5">
              <span className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.siteLanguageLabel")}</span>
              <div className="flex flex-wrap gap-2">
                {(["en", "es"] as const).map((option) => (
                  <button key={option} type="button" onClick={() => setSiteLocale(option)} aria-pressed={siteLocale === option} className={designerChip(siteLocale === option)}>
                    {option === "es"
                      ? t(locale, "dashboard.website.starter.siteLanguageSpanishOption")
                      : t(locale, "dashboard.website.starter.siteLanguageEnglishOption")}
                  </button>
                ))}
              </div>
            </div>
          </DesignerSection>

          <DesignerSection id="details" number={2} title={t(locale, "dashboard.website.starter.details.heading")} defaultOpen>
            <StarterSiteDetailsForm
              businessId={businessId}
              fields={details}
              onChange={(next) => {
                // A field filled in for the first time can show right away.
                if (!details.address.trim() && next.address.trim()) setShowAddress(true);
                if (!details.phone.trim() && next.phone.trim()) setShowPhone(true);
                setDetails(next);
              }}
              confirmed={detailsConfirmed}
              prefilled={confirmedDetails === null}
              prefillLink={prefillLink}
              onConfirmed={setConfirmedDetails}
            />
          </DesignerSection>

          <DesignerSection id="include" number={3} title={t(locale, "dashboard.website.starter.whatToIncludeLabel")}>
            <div data-testid="starter-include" className="flex flex-col gap-1">
              <p className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.whatToIncludeHint")}</p>
              <div className="flex flex-col divide-y divide-paper-line">
                <ToggleRow
                  icon={IconMapPin}
                  label={t(locale, "dashboard.website.starter.includeAddress")}
                  checked={showAddress}
                  onChange={setShowAddress}
                  available={!!details.address.trim()}
                />
                <ToggleRow
                  icon={IconPhone}
                  label={t(locale, "dashboard.website.starter.includePhone")}
                  checked={showPhone}
                  onChange={setShowPhone}
                  available={!!details.phone.trim()}
                />
                <div data-testid="hours-row">
                  {/* Same row as the others; the checkbox waits for hours. */}
                  <ToggleRow
                    icon={IconClock}
                    label={t(locale, "dashboard.website.starter.includeHours")}
                    checked={showHours}
                    onChange={setShowHours}
                    available={ownerHours !== null}
                    action={
                      hoursEditorOpen ? null : (
                        <button type="button" onClick={() => setHoursEditorOpen(true)} className="shrink-0 text-[12px] font-semibold text-ink underline decoration-brass underline-offset-2 hover:decoration-ink">
                          {t(locale, ownerHours ? "dashboard.website.starter.hours.edit" : "dashboard.website.starter.hours.add")}
                        </button>
                      )
                    }
                  />
                  {ownerHours && !hoursEditorOpen && <p className={cn(DESIGNER_HELP, "-mt-1 pb-2 pl-[50px]")}>{t(locale, "dashboard.website.starter.hours.sourceOwner")}</p>}
                  {!hoursEditorOpen && ownerHours && googleSchedule && !sameSchedule(ownerHours, googleSchedule) && (
                    <div className="pb-2 pl-[50px]">
                      <HoursDifferNote />
                    </div>
                  )}
                  {!hoursEditorOpen && ownerHours && !googleSchedule && (
                    <div className="pb-2 pl-[50px]">
                      <HoursGoogleTip businessId={businessId} />
                    </div>
                  )}
                  {hoursEditorOpen && (
                    <StarterHoursEditor
                      businessId={businessId}
                      initial={ownerHours ?? googleSchedule ?? defaultOwnerHours()}
                      googleHours={googleSchedule}
                      canRemove={ownerHours !== null}
                      onApply={(next) => {
                        setOwnerHours(next);
                        setShowHours(next !== null);
                      }}
                      onClose={() => setHoursEditorOpen(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          </DesignerSection>

          <DesignerSection id="look" number={4} title={t(locale, "dashboard.website.starter.section.look")}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${businessId}-tagline`} className={DESIGNER_LABEL}>
                {t(locale, "dashboard.website.starter.taglineLabel")}{" "}
                <span className="font-normal text-ink-mute">{t(locale, "dashboard.website.starter.taglineOptionalHint")}</span>
              </label>
              <input
                id={`${businessId}-tagline`}
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder={t(locale, "dashboard.website.starter.taglinePlaceholder")}
                maxLength={120}
                className={DESIGNER_INPUT}
              />
              <p className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.taglineHelper")}</p>

              {tagline.trim().length > 0 && (
                <div className="mt-1.5 flex flex-col gap-3 rounded-lg border border-paper-line bg-paper p-3">
                  <div className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.taglineStyleLabel")}</div>

                  <div className="flex flex-col gap-1.5">
                    <div className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.taglineFontLabel")}</div>
                    <div className="flex flex-wrap gap-2">
                      {STARTER_SITE_FONTS.map((font) => {
                        const fontLabel = t(locale, FONT_LABEL_KEY[font.id]);
                        return (
                          <button key={font.id} type="button" onClick={() => setTaglineFontId(font.id)} title={fontLabel} aria-pressed={taglineFontId === font.id} className={designerChip(taglineFontId === font.id)}>
                            {fontLabel.split(" — ")[0]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.colorLabel")}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={taglineColor ?? "#cbd5e6"}
                          onChange={(e) => setTaglineColor(e.target.value)}
                          aria-label={t(locale, "dashboard.website.starter.taglineColorAriaLabel")}
                          className={DESIGNER_COLOR_INPUT}
                        />
                        {taglineColor !== null && (
                          <button type="button" onClick={() => setTaglineColor(null)} className="text-[12px] font-medium text-ink-mute hover:text-ink">
                            {t(locale, "dashboard.website.starter.reset")}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.sizeLabel")}</div>
                      <div className="flex flex-wrap gap-2">
                        {TAGLINE_SIZES.map((s) => (
                          <button key={s.value} type="button" onClick={() => setTaglineSize(s.value)} aria-pressed={taglineSize === s.value} className={designerChip(taglineSize === s.value)}>
                            {t(locale, s.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.placementLabel")}</div>
                      <div className="flex flex-wrap gap-2">
                        {TAGLINE_PLACEMENTS.map((p) => (
                          <button key={p.value} type="button" onClick={() => setTaglinePlacement(p.value)} aria-pressed={taglinePlacement === p.value} className={designerChip(taglinePlacement === p.value)}>
                            {t(locale, p.labelKey)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t border-paper-line pt-3">
              <div className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.colorThemeLabel")}</div>
              <div className="flex flex-col gap-2.5">
                {STARTER_SITE_THEME_GROUPS.map((group) => (
                  <div key={group} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className={cn(DESIGNER_HELP, "w-full")}>{t(locale, THEME_GROUP_KEY[group])}</div>
                    {STARTER_SITE_THEMES.filter((theme) => theme.group === group).map((theme) => {
                      const themeLabel = t(locale, THEME_LABEL_KEY[theme.id]);
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => handleThemeSelect(theme.id)}
                          title={themeLabel}
                          aria-label={themeLabel}
                          aria-pressed={themeId === theme.id}
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                            themeId === theme.id ? "border-ink" : group === "light" ? "border-paper-deep hover:border-ink-soft" : "border-transparent hover:border-paper-deep"
                          )}
                          style={{ backgroundColor: theme.heroBg }}
                        >
                          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40" style={{ backgroundColor: theme.accent }} />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={effectiveAccent}
                  onChange={(e) => setCustomAccent(e.target.value)}
                  aria-label={t(locale, "dashboard.website.starter.customAccentAriaLabel")}
                  className={DESIGNER_COLOR_INPUT}
                />
                <p className={DESIGNER_HELP}>
                  {t(locale, THEME_LABEL_KEY[currentTheme.id])}
                  {customAccent !== null && t(locale, "dashboard.website.starter.customAccentSuffix")}
                </p>
                {customAccent !== null && (
                  <button type="button" onClick={() => setCustomAccent(null)} className="text-[12px] font-medium text-ink-mute hover:text-ink">
                    {t(locale, "dashboard.website.starter.reset")}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-paper-line pt-3">
              <div className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.fontSectionLabel")}</div>
              <div className="flex flex-wrap gap-2">
                {STARTER_SITE_FONTS.map((font) => (
                  <button key={font.id} type="button" onClick={() => setFontId(font.id)} aria-pressed={fontId === font.id} className={designerChip(fontId === font.id)}>
                    {t(locale, FONT_LABEL_KEY[font.id])}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-paper-line pt-3">
              <div className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.accentsLabel")}</div>
              <p className={DESIGNER_HELP}>{t(locale, "dashboard.website.starter.accentsHelper")}</p>
              <div className="flex flex-wrap gap-2">
                {ACCENT_STYLES.map((style) => (
                  <button key={style} type="button" onClick={() => setAccentStyle(style)} aria-pressed={accentStyle === style} className={cn(designerChip(accentStyle === style), "py-1 pl-1.5")}>
                    <span aria-hidden className="h-6 w-6 shrink-0 rounded-full border border-paper-line bg-white" style={patternStyle(style, effectiveAccent)} />
                    {t(locale, ACCENT_LABEL_KEY[style])}
                  </button>
                ))}
              </div>
            </div>
          </DesignerSection>

          <DesignerSection id="photos" number={5} title={t(locale, "dashboard.website.starter.photosLabel")}>
            <p className={DESIGNER_HELP}>
              <span className="font-medium">{t(locale, "dashboard.website.starter.photosOptionalHint")}</span> {t(locale, "dashboard.website.starter.photosHelper")}
            </p>

            <div className="flex flex-col gap-1.5">
              <div className={DESIGNER_LABEL}>{t(locale, "dashboard.website.starter.heroPhotoLabel")}</div>
              {heroImage ? (
                <div className="flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={heroImage.dataUri} alt="" className="h-14 w-20 rounded-md object-cover" />
                  <button type="button" onClick={() => setHeroImage(null)} className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink">
                    <IconX size={13} /> {t(locale, "dashboard.website.starter.removePhoto")}
                  </button>
                </div>
              ) : (
                <label className="inline-flex h-10 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-paper-deep px-3 text-[12.5px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink">
                  <IconPhoto size={15} />
                  {t(locale, "dashboard.website.starter.uploadHeroPhoto")}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleHeroImageSelect(e.target.files?.[0] ?? null)} />
                </label>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className={DESIGNER_LABEL}>
                {t(locale, "dashboard.website.starter.contentPhotosLabel", {
                  current: contentImages.length,
                  max: MAX_CONTENT_IMAGES,
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {contentImages.map((img, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.dataUri} alt="" className="h-14 w-14 rounded-md object-cover" />
                    <button
                      type="button"
                      onClick={() => removeContentImage(i)}
                      aria-label={t(locale, "dashboard.website.starter.removePhotoAriaLabel")}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-paper-deep bg-white text-ink-mute hover:text-ink"
                    >
                      <IconX size={12} />
                    </button>
                  </div>
                ))}
                {contentImages.length < MAX_CONTENT_IMAGES && (
                  <label className="inline-flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-paper-deep text-ink-mute hover:border-ink-soft hover:text-ink">
                    <IconPhoto size={16} />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleContentImageSelect(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>
            </div>

            {photoError && <p className="text-[12px] text-red">{photoError}</p>}
          </DesignerSection>
        </div>

        {/* The preview: first on a phone (fixed height, scrolls inside);
            on desktop it stays in view (sticky) while the options scroll. */}
        <div className="order-first nav:order-none" data-testid="starter-preview-column">
          <div className="flex flex-col gap-3 nav:sticky nav:top-6 nav:h-[calc(100vh-3rem)]">
            <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
              {t(locale, "dashboard.website.starter.livePreviewLabel")}
            </div>
            <Card className="flex min-h-0 overflow-hidden p-0 nav:flex-1">
              <iframe
                title={t(locale, "dashboard.website.starter.iframeTitle")}
                srcDoc={html}
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="h-[480px] w-full border-0 nav:h-full"
              />
            </Card>
            {/* ONE row: the full preview (left), the download (right). */}
            <div className="flex flex-wrap items-center justify-between gap-2" data-testid="starter-actions">
              <Button variant="default" onClick={openFullPreview} className="w-fit" data-testid="open-full-preview">
                <IconExternalLink size={16} />
                {t(locale, "dashboard.free.web.openPreview")}
              </Button>
              {free ? (
                <UpgradeButton feature="grow" testId="starter-download-locked" className={buttonClasses("brass")}>
                  <IconLock size={16} aria-hidden />
                  {t(locale, "dashboard.website.starter.downloadSiteButton")}
                  <span className="rounded-full bg-white/80 px-1.5 py-px text-[10.5px] font-semibold text-ink">{t(locale, "dashboard.settings.plan.name.grow")}</span>
                </UpgradeButton>
              ) : (
                <Button variant="brass" onClick={handleDownload} disabled={!detailsConfirmed} data-testid="starter-download">
                  <IconDownload size={16} />
                  {t(locale, "dashboard.website.starter.downloadSiteButton")}
                </Button>
              )}
            </div>
            {!free && !detailsConfirmed && (
              <p data-testid="confirm-details-first" className="text-[12px] text-ink-soft">
                {t(locale, "dashboard.website.starter.details.confirmFirst")}
              </p>
            )}
            {!free && downloadError && <p className="text-[12px] text-red">{downloadError}</p>}
            {!free && <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.website.starter.downloadHelper")}</p>}
          </div>
        </div>
      </div>

      {/* Publishing only makes sense once the site can be downloaded (Grow and up). */}
      {!free && (
        <>
      <Card className="p-5">
        <div className="text-[13px] font-semibold text-ink">
          {t(locale, "dashboard.website.starter.howToPublishHeading")}
        </div>
        <ol className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-soft">
          <li>{t(locale, "dashboard.website.starter.publishStep1")}</li>
          <li>
            {t(locale, "dashboard.website.starter.publishStep2Prefix")}
            <span className="font-mono text-[12px]">index.html</span>
            {t(locale, "dashboard.website.starter.publishStep2Suffix")}
          </li>
          <li>{t(locale, "dashboard.website.starter.publishStep3")}</li>
          <li>{t(locale, "dashboard.website.starter.publishStep4")}</li>
        </ol>
        <p className="mt-3 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
          {t(locale, "dashboard.website.starter.publishFootnote")}
        </p>
      </Card>

      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-[13px] font-semibold text-ink">
            {t(locale, "dashboard.website.starter.alreadyPublishedHeading")}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-mute">
            {markState.kind === "done"
              ? t(locale, "dashboard.website.starter.markedDoneStatus")
              : t(locale, "dashboard.website.starter.notYetMarkedStatus")}
          </p>
          {markState.kind === "error" && (
            <p className="mt-1 text-[12px] text-red">{markState.message}</p>
          )}
        </div>
        <Button
          variant="default"
          onClick={handleMarkPublished}
          disabled={markState.kind === "saving" || markState.kind === "done"}
          className="shrink-0"
        >
          {markState.kind === "done" ? <IconCheck size={16} /> : <IconRocket size={16} />}
          {markState.kind === "saving"
            ? t(locale, "dashboard.website.starter.markSaving")
            : markState.kind === "done"
              ? t(locale, "dashboard.website.starter.markMarked")
              : t(locale, "dashboard.website.starter.markAsPublished")}
        </Button>
      </Card>
        </>
      )}
    </div>
  );
}
