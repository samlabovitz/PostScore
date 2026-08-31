"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconCheck,
  IconClock,
  IconDownload,
  IconMapPin,
  IconPhone,
  IconRocket,
  IconStar,
  IconWand,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  STARTER_SITE_FONTS,
  STARTER_SITE_THEMES,
  buildStarterSiteHtml,
  getStarterSiteTheme,
} from "@/lib/starterSite";
import { downloadTextFile } from "@/lib/downloadFile";
import { markTaskDone } from "@/app/actions/actionPlan";

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
      {!available && <span className="text-[11px] text-ink-mute">Not on file</span>}
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
  hasWebsite,
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
  hasWebsite: boolean;
}) {
  const router = useRouter();
  const [tagline, setTagline] = useState("");
  const [themeId, setThemeId] = useState(STARTER_SITE_THEMES[0].id);
  const [fontId, setFontId] = useState(STARTER_SITE_FONTS[0].id);
  const [showAddress, setShowAddress] = useState(!!address);
  const [showPhone, setShowPhone] = useState(!!phone);
  const [showHours, setShowHours] = useState(!!openingHours && openingHours.length > 0);
  const [showRating, setShowRating] = useState(rating !== null);

  const html = useMemo(
    () =>
      buildStarterSiteHtml({
        businessName,
        category,
        tagline,
        phone,
        address,
        openingHours,
        rating,
        reviewCount,
        googleMapsUri,
        profileId,
        themeId,
        fontId,
        show: { address: showAddress, phone: showPhone, hours: showHours, rating: showRating },
      }),
    [
      businessName,
      category,
      tagline,
      phone,
      address,
      openingHours,
      rating,
      reviewCount,
      googleMapsUri,
      profileId,
      themeId,
      fontId,
      showAddress,
      showPhone,
      showHours,
      showRating,
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
        message: result.status === "error" ? result.message : "Couldn't save that — try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconWand size={14} />
          Starter website generator
        </div>
        <h2 className="mt-1.5 font-serif text-2xl font-bold text-ink">
          {hasWebsite ? "Build a backup starter site" : "Turn your Google data into a real website"}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
          {hasWebsite
            ? "You already have a website on file, so this is here if you ever want a simple backup or a fresh starting point — not something you need."
            : "No website is one of the biggest gaps in your PostScore. This builds a real, mobile-friendly one-page site from your actual Google listing data — nothing invented."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 nav:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-soft">
              Tagline <span className="font-normal text-ink-mute">(optional — write your own)</span>
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Fresh, fast, made-to-order"
              maxLength={120}
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft"
            />
            <p className="mt-1 text-[12px] text-ink-mute">
              Left blank, the site just won&apos;t show a tagline — we never write one for you.
            </p>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-ink-soft">Color theme</div>
            <div className="flex flex-wrap items-center gap-3">
              {STARTER_SITE_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setThemeId(theme.id)}
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
            <p className="mt-1.5 text-[12px] text-ink-mute">{getStarterSiteTheme(themeId).label}</p>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-ink-soft">Font</div>
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
              What to include <span className="font-normal text-ink-mute">(all from your real listing)</span>
            </div>
            <div className="flex flex-col divide-y divide-paper-line">
              <ToggleRow
                icon={IconMapPin}
                label="Address & map"
                checked={showAddress}
                onChange={setShowAddress}
                available={!!address}
              />
              <ToggleRow
                icon={IconPhone}
                label="Phone (click-to-call)"
                checked={showPhone}
                onChange={setShowPhone}
                available={!!phone}
              />
              <ToggleRow
                icon={IconClock}
                label="Hours"
                checked={showHours}
                onChange={setShowHours}
                available={!!openingHours && openingHours.length > 0}
              />
              <ToggleRow
                icon={IconStar}
                label="Rating & reviews"
                checked={showRating}
                onChange={setShowRating}
                available={rating !== null}
              />
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-mute">
            Live preview — exactly what you&apos;ll download
          </div>
          <Card className="overflow-hidden p-0">
            <iframe
              title="Live preview of your starter site"
              srcDoc={html}
              sandbox="allow-scripts allow-popups"
              className="h-[420px] w-full border-0"
            />
          </Card>
          <Button variant="brass" onClick={handleDownload}>
            <IconDownload size={16} />
            Download site (HTML)
          </Button>
          <p className="text-[12px] text-ink-mute">
            A single, real HTML file — the same one shown above, with your chosen color theme, font,
            tagline, and sections baked right in. Open it in any browser, or upload it to any host to
            make it live.
          </p>
        </div>
      </div>

      <Card className="p-5">
        <div className="text-[13px] font-semibold text-ink">How to publish it</div>
        <ol className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-soft">
          <li>1. Download the file above.</li>
          <li>
            2. Upload it as <span className="font-mono text-[12px]">index.html</span> to any static
            host — a free option like Netlify Drop or GitHub Pages, or your existing hosting/cPanel if
            you have one.
          </li>
          <li>3. That gives you a real, public URL for the site.</li>
          <li>
            4. Add that URL to your Google Business Profile&apos;s website field, then re-save this
            business from Google Places here so PostScore picks it up.
          </li>
        </ol>
        <p className="mt-3 border-t border-paper-line pt-3 text-[12px] text-ink-mute">
          Downloading this file doesn&apos;t change your PostScore by itself — the Website points land
          only once the real site is live at a real URL, Google shows it on your listing, and a
          re-scan confirms it. That&apos;s the same honest rule every check on this app follows.
        </p>
      </Card>

      <Card className="flex items-center justify-between gap-4 p-4">
        <div>
          <div className="text-[13px] font-semibold text-ink">Already published it?</div>
          <p className="mt-0.5 text-[12.5px] text-ink-mute">
            {markState.kind === "done"
              ? "Marked as pending — we'll confirm it for real the next time we re-scan your listing."
              : "This flags it on your action plan as pending — it still only completes once a re-scan verifies the real site."}
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
          {markState.kind === "saving" ? "Saving..." : markState.kind === "done" ? "Marked" : "Mark as published"}
        </Button>
      </Card>
    </div>
  );
}
