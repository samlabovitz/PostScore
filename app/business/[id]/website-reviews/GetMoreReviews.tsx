"use client";

// The Reviews page's hero: the business's real Google "write a review"
// link (copy / open / text it) beside its QR code, plus the printable
// sign by plan — Free: the plain QR PNG only (and a small locked card);
// Grow: the basic sign; Premium/Multi: the full Sign Studio. Always
// rendered for every business, gated only on having a real place_id.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  IconAdjustmentsHorizontal,
  IconBrandInstagram,
  IconDownload,
  IconLink,
  IconLock,
  IconMessage,
  IconQrcode,
  IconReceipt,
  IconTrendingUp,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { LINK_PILL_CLASS } from "@/components/ui/linkPill";
import type { Plan } from "@/lib/plan";
import { DEFAULT_QR_STYLE, qrSvg, reviewQrGeometry } from "@/lib/reviewQr";
import { buildGoogleReviewUrl, reviewSmsHref, shortReviewLink } from "@/lib/reviews";
import {
  BASIC_STORAGE_KEY,
  DESIGN_STORAGE_KEY,
  LOGO_REMEMBER_MAX_BYTES,
  LOGO_STORAGE_KEY,
  defaultBasicChoices,
  defaultDesign,
  parseStoredJson,
  parseStoredLogo,
  readStorage,
  sanitizeBasicChoices,
  sanitizeDesign,
  signAccess,
  signFileName,
  writeStorage,
  type BasicChoices,
  type SignContent,
  type SignDesign,
  type StoredLogo,
} from "@/lib/signStudio/design";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BRASS_BUTTON, OUTLINE_BUTTON } from "./buttonStyles";

// The studio (font metrics + preview) loads only when opened.
const SignStudio = dynamic(() => import("./SignStudio").then((m) => m.SignStudio), { ssr: false });

const IDEAS = [
  { icon: IconMessage, key: "dashboard.websiteReviews.hero.ideaText" },
  { icon: IconReceipt, key: "dashboard.websiteReviews.hero.ideaReceipts" },
  { icon: IconBrandInstagram, key: "dashboard.websiteReviews.hero.ideaSocial" },
] as const;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: a hidden textarea.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** The review-link QR in a white framed tile — rounded navy dots, the
 * exact link we copy. */
export function ReviewQrTile({ reviewUrl, label }: { reviewUrl: string; label: string }) {
  const locale = useLocale();
  const svg = useMemo(() => qrSvg(reviewQrGeometry(reviewUrl, DEFAULT_QR_STYLE), 168), [reviewUrl]);
  return (
    <figure className="flex flex-col items-center gap-2">
      <div
        role="img"
        aria-label={t(locale, "dashboard.websiteReviews.qrAlt")}
        data-review-qr={reviewUrl}
        className="h-[168px] w-[168px] [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <figcaption className="text-[12px] font-semibold text-ink-soft">{label}</figcaption>
    </figure>
  );
}

export function GetMoreReviews({
  businessId,
  businessName,
  placeId,
  rating,
  reviewCount,
  verifiedSocials,
  plan,
}: {
  businessId: string;
  /** The listing's real name; null prints no name on the sign. */
  businessName: string | null;
  placeId: string | null;
  rating: number | null;
  reviewCount: number | null;
  verifiedSocials: Array<{ platform: string; url: string }>;
  plan: Plan;
}) {
  const locale = useLocale();
  const reviewUrl = placeId ? buildGoogleReviewUrl(placeId) : null;
  const access = signAccess(plan);
  const content: SignContent = useMemo(
    () => ({ businessName, rating, reviewCount, verifiedSocials }),
    [businessName, rating, reviewCount, verifiedSocials]
  );

  // Sign choices: defaults on the server and first paint, then this
  // device's remembered ones (no hydration mismatch).
  const [basic, setBasic] = useState<BasicChoices>(defaultBasicChoices);
  const [design, setDesign] = useState<SignDesign>(() => defaultDesign(locale));
  const [logo, setLogo] = useState<StoredLogo | null>(null);
  const [logoNote, setLogoNote] = useState<string | null>(null);
  useEffect(() => {
    const storedBasic = parseStoredJson(readStorage(BASIC_STORAGE_KEY));
    if (storedBasic) setBasic(sanitizeBasicChoices(storedBasic));
    const storedDesign = parseStoredJson(readStorage(DESIGN_STORAGE_KEY));
    if (storedDesign) setDesign(sanitizeDesign(storedDesign, locale));
    setLogo(parseStoredLogo(readStorage(LOGO_STORAGE_KEY)));
  }, [locale]);
  const changeBasic = useCallback((next: BasicChoices) => {
    setBasic(next);
    writeStorage(BASIC_STORAGE_KEY, JSON.stringify(next));
  }, []);
  const changeDesign = useCallback((next: SignDesign) => {
    setDesign(next);
    writeStorage(DESIGN_STORAGE_KEY, JSON.stringify(next));
  }, []);
  const changeLogoFile = useCallback(
    async (file: File | null) => {
      setLogoNote(null);
      if (!file) {
        setLogo(null);
        writeStorage(LOGO_STORAGE_KEY, null);
        return;
      }
      const { readLogoFile } = await import("./SignStudio");
      const result = await readLogoFile(file);
      if ("error" in result) {
        setLogoNote(t(locale, `dashboard.websiteReviews.studio.logo.${result.error}` as MessageKey));
        return;
      }
      setLogo(result.logo);
      // Remembered on this device only when small; never uploaded.
      if (result.logo.bytes <= LOGO_REMEMBER_MAX_BYTES) writeStorage(LOGO_STORAGE_KEY, JSON.stringify(result.logo));
      else {
        writeStorage(LOGO_STORAGE_KEY, null);
        setLogoNote(t(locale, "dashboard.websiteReviews.studio.logo.notRemembered"));
      }
    },
    [locale]
  );

  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  async function handleCopy() {
    if (!reviewUrl) return;
    const ok = await copyText(reviewUrl);
    setCopy(ok ? "copied" : "failed");
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopy("idle"), ok ? 2000 : 5000);
  }

  const [designing, setDesigning] = useState(false);
  const [download, setDownload] = useState<"idle" | "working" | "error">("idle");
  async function handleDownloadSign() {
    if (!reviewUrl || access === "none") return;
    setDownload("working");
    try {
      const out = await import("@/lib/signStudio/output");
      const studio = access === "studio";
      const bytes = await out.fetchSignPdf(businessId, studio ? design : basic, studio ? logo : null);
      out.downloadPdf(bytes, signFileName(studio ? design.size : basic.size));
      setDownload("idle");
    } catch {
      setDownload("error");
    }
  }
  async function handleDownloadQr() {
    if (!reviewUrl) return;
    const { downloadQrPng } = await import("@/lib/signStudio/output");
    await downloadQrPng(reviewUrl);
  }

  return (
    <Card className="p-4 sm:p-6">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-brass">
          <IconTrendingUp size={14} aria-hidden />
          {t(locale, "dashboard.websiteReviews.growthLeverEyebrow")}
        </div>
        <h2 className="mt-1 font-serif text-xl font-bold text-ink sm:text-2xl">{t(locale, "dashboard.websiteReviews.growthLeverHeading")}</h2>
        <p className="mt-1 max-w-2xl text-[13.5px] text-ink-soft">{t(locale, "dashboard.websiteReviews.growthLeverIntro")}</p>
      </div>

      {!reviewUrl ? (
        <p className="mt-4 rounded-xl bg-paper p-4 text-sm text-ink-soft">{t(locale, "dashboard.websiteReviews.noPlaceIdMessage")}</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_224px] sm:gap-5">
          {/* Left: the link, then share ideas. */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-1 flex-col justify-center gap-3 rounded-xl border border-[color:color-mix(in_srgb,var(--color-brass)_28%,white)] bg-paper p-4 sm:p-5">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-soft">{t(locale, "dashboard.websiteReviews.hero.linkLabel")}</div>
              <div title={reviewUrl} className="flex min-w-0 items-center gap-2 rounded-lg border border-paper-line bg-white px-3 py-2 text-[13px] text-ink">
                <IconLink size={15} className="shrink-0 text-brass" aria-hidden />
                <span className="truncate" data-testid="review-link-display">
                  {shortReviewLink(reviewUrl)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleCopy} className={cn(BRASS_BUTTON, "min-w-[8.5rem]")}>
                  {copy === "copied" ? t(locale, "dashboard.websiteReviews.hero.copied") : t(locale, "dashboard.websiteReviews.hero.copy")}
                </button>
                <a href={reviewUrl} target="_blank" rel="noreferrer" className={OUTLINE_BUTTON}>
                  {t(locale, "dashboard.websiteReviews.hero.open")}
                </a>
                {/* Phones only — a desktop has nothing to text from. */}
                <a href={reviewSmsHref(reviewUrl)} className={cn(OUTLINE_BUTTON, "sm:hidden")}>
                  <IconMessage size={15} aria-hidden />
                  {t(locale, "dashboard.websiteReviews.hero.text")}
                </a>
              </div>
              <p role="status" className={cn("text-[12px] text-red", copy !== "failed" && "sr-only")}>
                {copy === "failed" ? t(locale, "dashboard.websiteReviews.hero.copyFailed") : copy === "copied" ? t(locale, "dashboard.websiteReviews.hero.copied") : ""}
              </p>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {IDEAS.map(({ icon: Icon, key }) => (
                <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] text-ink">
                  <Icon size={14} className="shrink-0 text-brass" aria-hidden />
                  {t(locale, key)}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.websiteReviews.hero.youSend")}</p>
          </div>

          {/* Right: the QR tile and, by plan, the sign. */}
          <div className="flex flex-col items-center gap-3 rounded-xl border border-paper-deep bg-white p-4">
            <ReviewQrTile reviewUrl={reviewUrl} label={t(locale, "dashboard.websiteReviews.hero.scanLabel")} />
            {access === "none" ? (
              <>
                <button type="button" onClick={handleDownloadQr} className={cn(OUTLINE_BUTTON, "w-full")}>
                  <IconQrcode size={15} aria-hidden />
                  {t(locale, "dashboard.websiteReviews.hero.downloadQr")}
                </button>
                <div data-testid="sign-locked" className="flex w-full items-start gap-2 rounded-lg border border-paper-deep bg-paper px-3 py-2 text-[12px] text-ink-soft">
                  <IconLock size={14} className="mt-px shrink-0 text-brass" aria-hidden />
                  <span>{t(locale, "dashboard.websiteReviews.hero.locked")}</span>
                </div>
              </>
            ) : (
              <>
                <button type="button" onClick={handleDownloadSign} disabled={download === "working"} className={cn(OUTLINE_BUTTON, "w-full")}>
                  <IconDownload size={15} aria-hidden />
                  {download === "working" ? t(locale, "dashboard.websiteReviews.hero.working") : t(locale, "dashboard.websiteReviews.hero.downloadSign")}
                </button>
                <button type="button" onClick={() => setDesigning(true)} className={cn(LINK_PILL_CLASS, "gap-1.5")}>
                  <IconAdjustmentsHorizontal size={14} aria-hidden />
                  {t(locale, "dashboard.websiteReviews.hero.design")}
                </button>
                <button type="button" onClick={handleDownloadQr} className="text-[12px] font-medium text-ink-soft underline hover:text-ink">
                  {t(locale, "dashboard.websiteReviews.hero.downloadQr")}
                </button>
                {download === "error" && <p className="text-center text-[12px] text-red">{t(locale, "dashboard.websiteReviews.hero.signError")}</p>}
                <p className="text-center text-[12px] text-ink-mute">{t(locale, "dashboard.websiteReviews.hero.printYourself")}</p>
              </>
            )}
          </div>
        </div>
      )}

      {designing && reviewUrl && access !== "none" && (
        <SignStudio
          access={access}
          businessId={businessId}
          reviewUrl={reviewUrl}
          content={content}
          basic={basic}
          onBasicChange={changeBasic}
          design={design}
          onDesignChange={changeDesign}
          logo={logo}
          onLogoFile={changeLogoFile}
          logoNote={logoNote}
          onClose={() => setDesigning(false)}
        />
      )}
    </Card>
  );
}
