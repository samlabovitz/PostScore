"use client";

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
  IconStar,
  IconWand,
  IconX,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  STARTER_SITE_FONTS,
  STARTER_SITE_THEMES,
  buildStarterSiteHtml,
  getStarterSiteTheme,
  type TaglinePlacement,
  type TaglineSize,
} from "@/lib/starterSite";
import { downloadTextFile } from "@/lib/downloadFile";
import { resizeImageForEmbedding } from "@/lib/resizeImageForEmbedding";
import { markTaskDone } from "@/app/actions/actionPlan";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

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
}

function ToggleRow({ icon: Icon, label, checked, onChange, available }: ToggleRowProps) {
  const locale = useLocale();
  return (
    <label
      className={`flex items-center gap-2.5 py-2 text-sm ${available ? "text-ink" : "cursor-not-allowed text-ink-mute"}`}
    >
      <input
        type="checkbox"
        checked={available && checked}
        disabled={!available}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-brass disabled:opacity-40"
      />
      <Icon size={15} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {!available && (
        <span className="text-[11px] text-ink-mute">{t(locale, "dashboard.website.starter.notOnFile")}</span>
      )}
    </label>
  );
}

export function StarterSiteBuilder({
  businessId,
  businessName,
  category,
  phone,
  address,
  openingHours,
  rating,
  reviewCount,
  googleMapsUri,
  profileId,
  builderOfferReason,
}: {
  businessId: string;
  businessName: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  openingHours: string[] | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUri: string | null;
  profileId: string;
  /** Why the builder is being offered — see BuilderOffer in
   * app/actions/website.ts. Drives the headline/subcopy only; the
   * generator itself is identical in every case. */
  builderOfferReason: "no_website" | "underperforming" | "backup";
}) {
  const locale = useLocale();
  const router = useRouter();
  const [tagline, setTagline] = useState("");
  const [taglineFontId, setTaglineFontId] = useState(STARTER_SITE_FONTS[0].id);
  const [taglineColor, setTaglineColor] = useState<string | null>(null);
  const [taglineSize, setTaglineSize] = useState<TaglineSize>("medium");
  const [taglinePlacement, setTaglinePlacement] = useState<TaglinePlacement>("below");
  const [themeId, setThemeId] = useState(STARTER_SITE_THEMES[0].id);
  const [customAccent, setCustomAccent] = useState<string | null>(null);
  const [fontId, setFontId] = useState(STARTER_SITE_FONTS[0].id);
  const [showAddress, setShowAddress] = useState(!!address);
  const [showPhone, setShowPhone] = useState(!!phone);
  const [showHours, setShowHours] = useState(!!openingHours && openingHours.length > 0);
  const [showRating, setShowRating] = useState(rating !== null);
  const [heroImage, setHeroImage] = useState<{ dataUri: string; alt: string } | null>(null);
  const [contentImages, setContentImages] = useState<Array<{ dataUri: string; alt: string }>>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  async function handleHeroImageSelect(file: File | null) {
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUri = await resizeImageForEmbedding(file, 1600);
      setHeroImage({ dataUri, alt: `${businessName} hero photo` });
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
      setContentImages((prev) => [...prev, { dataUri, alt: `${businessName} photo` }]);
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
        businessName,
        category,
        tagline,
        taglineFontId,
        taglineColor,
        taglineSize,
        taglinePlacement,
        phone,
        address,
        openingHours,
        rating,
        reviewCount,
        googleMapsUri,
        profileId,
        themeId,
        customAccent,
        fontId,
        show: { address: showAddress, phone: showPhone, hours: showHours, rating: showRating },
        heroImage,
        contentImages,
      }),
    [
      businessName,
      category,
      tagline,
      taglineFontId,
      taglineColor,
      taglineSize,
      taglinePlacement,
      phone,
      address,
      openingHours,
      rating,
      reviewCount,
      googleMapsUri,
      profileId,
      themeId,
      customAccent,
      fontId,
      showAddress,
      showPhone,
      showHours,
      showRating,
      heroImage,
      contentImages,
    ]
  );

  function handleDownload() {
    downloadTextFile(html, `${slugify(businessName)}-website.html`, "text/html");
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
          {t(locale, "dashboard.website.starter.eyebrow")}
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          {builderOfferReason === "no_website"
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
      </div>

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.starter.taglineLabel")}{" "}
              <span className="font-normal text-ink-mute">
                {t(locale, "dashboard.website.starter.taglineOptionalHint")}
              </span>
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder={t(locale, "dashboard.website.starter.taglinePlaceholder")}
              maxLength={120}
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
            <p className="mt-1 text-[12px] text-ink-mute">{t(locale, "dashboard.website.starter.taglineHelper")}</p>

            {tagline.trim().length > 0 && (
              <div className="mt-3 flex flex-col gap-3 rounded-lg border border-paper-line bg-paper p-3">
                <div className="text-[12px] font-medium text-ink-soft">
                  {t(locale, "dashboard.website.starter.taglineStyleLabel")}
                </div>

                <div>
                  <div className="mb-1.5 text-[11.5px] text-ink-mute">
                    {t(locale, "dashboard.website.starter.taglineFontLabel")}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STARTER_SITE_FONTS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setTaglineFontId(font.id)}
                        title={font.label}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                          taglineFontId === font.id
                            ? "border-brass bg-brass/10 text-brass"
                            : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
                        )}
                      >
                        {font.label.split(" — ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <div className="mb-1.5 text-[11.5px] text-ink-mute">
                      {t(locale, "dashboard.website.starter.colorLabel")}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={taglineColor ?? "#cbd5e6"}
                        onChange={(e) => setTaglineColor(e.target.value)}
                        aria-label={t(locale, "dashboard.website.starter.taglineColorAriaLabel")}
                        className="h-8 w-10 cursor-pointer rounded border border-paper-deep bg-white p-0.5"
                      />
                      {taglineColor !== null && (
                        <button
                          type="button"
                          onClick={() => setTaglineColor(null)}
                          className="text-[11px] font-medium text-ink-mute hover:text-ink"
                        >
                          {t(locale, "dashboard.website.starter.reset")}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11.5px] text-ink-mute">
                      {t(locale, "dashboard.website.starter.sizeLabel")}
                    </div>
                    <div className="flex gap-1">
                      {TAGLINE_SIZES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setTaglineSize(s.value)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                            taglineSize === s.value
                              ? "border-brass bg-brass/10 text-brass"
                              : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
                          )}
                        >
                          {t(locale, s.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-[11.5px] text-ink-mute">
                      {t(locale, "dashboard.website.starter.placementLabel")}
                    </div>
                    <div className="flex gap-1">
                      {TAGLINE_PLACEMENTS.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setTaglinePlacement(p.value)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                            taglinePlacement === p.value
                              ? "border-brass bg-brass/10 text-brass"
                              : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
                          )}
                        >
                          {t(locale, p.labelKey)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.starter.colorThemeLabel")}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {STARTER_SITE_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleThemeSelect(theme.id)}
                  title={theme.label}
                  aria-label={theme.label}
                  aria-pressed={themeId === theme.id}
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    themeId === theme.id ? "border-ink" : "border-transparent hover:border-paper-deep"
                  )}
                  style={{ backgroundColor: theme.heroBg }}
                >
                  <span
                    className="h-3.5 w-3.5 rounded-full ring-1 ring-white/40"
                    style={{ backgroundColor: theme.accent }}
                  />
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                type="color"
                value={effectiveAccent}
                onChange={(e) => setCustomAccent(e.target.value)}
                aria-label={t(locale, "dashboard.website.starter.customAccentAriaLabel")}
                className="h-8 w-10 cursor-pointer rounded border border-paper-deep bg-white p-0.5"
              />
              <p className="text-[12px] text-ink-mute">
                {currentTheme.label}
                {customAccent !== null && t(locale, "dashboard.website.starter.customAccentSuffix")}
              </p>
              {customAccent !== null && (
                <button
                  type="button"
                  onClick={() => setCustomAccent(null)}
                  className="text-[11px] font-medium text-ink-mute hover:text-ink"
                >
                  {t(locale, "dashboard.website.starter.reset")}
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.starter.fontSectionLabel")}
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTER_SITE_FONTS.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setFontId(font.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-left text-[12.5px] font-medium transition-colors",
                    fontId === font.id
                      ? "border-brass bg-brass/10 text-brass"
                      : "border-paper-deep bg-white text-ink-soft hover:border-ink-soft hover:text-ink"
                  )}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.starter.photosLabel")}{" "}
              <span className="font-normal text-ink-mute">
                {t(locale, "dashboard.website.starter.photosOptionalHint")}
              </span>
            </div>
            <p className="mb-2 text-[12px] text-ink-mute">{t(locale, "dashboard.website.starter.photosHelper")}</p>

            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1.5 text-[11.5px] text-ink-mute">
                  {t(locale, "dashboard.website.starter.heroPhotoLabel")}
                </div>
                {heroImage ? (
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={heroImage.dataUri}
                      alt=""
                      className="h-14 w-20 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setHeroImage(null)}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink"
                    >
                      <IconX size={13} /> {t(locale, "dashboard.website.starter.removePhoto")}
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-paper-deep px-3 py-2 text-[12.5px] font-medium text-ink-soft hover:border-ink-soft hover:text-ink">
                    <IconPhoto size={15} />
                    {t(locale, "dashboard.website.starter.uploadHeroPhoto")}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleHeroImageSelect(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11.5px] text-ink-mute">
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
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleContentImageSelect(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              </div>

              {photoError && <p className="text-[12px] text-red">{photoError}</p>}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[13px] font-medium text-ink-soft">
              {t(locale, "dashboard.website.starter.whatToIncludeLabel")}{" "}
              <span className="font-normal text-ink-mute">
                {t(locale, "dashboard.website.starter.whatToIncludeHint")}
              </span>
            </div>
            <div className="flex flex-col divide-y divide-paper-line">
              <ToggleRow
                icon={IconMapPin}
                label={t(locale, "dashboard.website.starter.includeAddress")}
                checked={showAddress}
                onChange={setShowAddress}
                available={!!address}
              />
              <ToggleRow
                icon={IconPhone}
                label={t(locale, "dashboard.website.starter.includePhone")}
                checked={showPhone}
                onChange={setShowPhone}
                available={!!phone}
              />
              <ToggleRow
                icon={IconClock}
                label={t(locale, "dashboard.website.starter.includeHours")}
                checked={showHours}
                onChange={setShowHours}
                available={!!openingHours && openingHours.length > 0}
              />
              <ToggleRow
                icon={IconStar}
                label={t(locale, "dashboard.website.starter.includeRating")}
                checked={showRating}
                onChange={setShowRating}
                available={rating !== null}
              />
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            {t(locale, "dashboard.website.starter.livePreviewLabel")}
          </div>
          <Card className="overflow-hidden p-0">
            <iframe
              title={t(locale, "dashboard.website.starter.iframeTitle")}
              srcDoc={html}
              sandbox="allow-scripts allow-popups"
              className="h-[420px] w-full border-0"
            />
          </Card>
          <Button variant="brass" onClick={handleDownload}>
            <IconDownload size={16} />
            {t(locale, "dashboard.website.starter.downloadSiteButton")}
          </Button>
          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.website.starter.downloadHelper")}</p>
        </div>
      </div>

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
    </div>
  );
}
