"use client";

// The listing's website link goes to an ordering / booking / review /
// social page (lib/socialLinkCheck.ts) — not a website. Shown on the
// Overview (as an alert row), the Website page and the Growth plan:
// 1. what it is, plainly;
// 2. Google's own section for it ("Order online", "Reservations",
//    "Appointments"): with Google connected, whether it's already there
//    (read-only); if only in the website spot, one action by plan —
//    Premium: "Add to 'Order online' on Google" (approve → Undo 7 days),
//    Premium not connected: connect first, Free/Grow: the steps;
//    not connected: never a guess — connect, or check it yourself;
// 3. why a real website helps, and "Get a website" (the starter site
//    comes with the button prebuilt). The website link itself is never
//    removed here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBrandGoogle, IconCircleCheck, IconWorld } from "@tabler/icons-react";
import { addPlatformLinkAction, getPlatformLinkStatus, undoPlatformLinkAction, type PlatformLinkStatus } from "@/app/actions/gbpPlaceActions";
import { websitePlatform, type PlaceActionSection, type WebsitePlatform } from "@/lib/gbpPlaceActions";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import type { UndoableChange } from "@/lib/gbpAttributes";
import { cn } from "@/lib/utils";

const k = (key: string) => `dashboard.platformLink.${key}` as MessageKey;
const PILL = "inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-3 py-1 text-[12.5px] font-semibold text-ink hover:border-brass disabled:opacity-60";
const PRIMARY = "inline-flex w-fit items-center rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60";
const QUIET = "text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:underline";

export function sectionLabel(section: PlaceActionSection, locale: Locale): string {
  return t(locale, k(`section.${section}`));
}

/** "Order on DoorDash", "Book on Vagaro", "See us on Yelp"… */
export function platformButtonLabel(platform: Pick<WebsitePlatform, "name" | "kind">, locale: Locale): string {
  return t(locale, k(`button.${platform.kind}`), { platform: platform.name });
}

function errorText(r: { status: string; error?: string; reason?: string }, locale: Locale): string {
  if (r.status === "blocked") return t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey);
  if (r.error === "not_enabled_google" || r.error === "changed_since" || r.error === "undo_expired") return t(locale, k(`error.${r.error}`));
  if (r.error === "reconnect" || r.error === "permission" || r.error === "wait_minute" || r.error === "daily_cap" || r.error === "not_enabled") return t(locale, `dashboard.gbpEdit.error.${r.error}` as MessageKey);
  return t(locale, k("error.other"));
}

export function PlatformLinkCard({
  businessId,
  website,
  premium,
  connected,
  variant = "card",
  initialStatus,
}: {
  businessId: string;
  /** The listing's website field, as saved. */
  website: string | null;
  premium: boolean;
  connected: boolean;
  /** "alert": the Overview's alert row; "card": Website page and Growth. */
  variant?: "alert" | "card";
  /** Tests only: skip the Google read. */
  initialStatus?: PlatformLinkStatus;
}) {
  const locale = useLocale();
  const platform = websitePlatform(website);
  const section = platform?.section ?? null;
  const [status, setStatus] = useState<PlatformLinkStatus | "loading" | null>(initialStatus ?? (connected && section ? "loading" : null));

  useEffect(() => {
    if (initialStatus || !connected || !section) return;
    let live = true;
    getPlatformLinkStatus(businessId)
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus({ status: "error", error: "failed" }));
    return () => {
      live = false;
    };
  }, [businessId, connected, section, initialStatus]);

  if (!platform) return null;
  const sec = section ? sectionLabel(section, locale) : "";
  const ok = status && status !== "loading" && status.status === "ok" ? status : null;

  return (
    <div
      data-testid="platform-link-card"
      role={variant === "alert" ? "alert" : undefined}
      className={cn("flex flex-col gap-2.5 rounded-xl border px-4 py-3.5 text-[13px] leading-snug", variant === "alert" ? "border-amber/50 bg-amber/5" : "border-paper-deep bg-white")}
    >
      <p className="font-semibold text-ink">{t(locale, k("title"), { platform: platform.name })}</p>
      <p className="text-ink-soft">{t(locale, section ? k("explainSection") : k("explainNoSection"), { platform: platform.name, section: sec })}</p>

      {section && (
        <div data-testid="platform-link-google" className="flex flex-col gap-2">
          {status === "loading" && <p className="text-ink-mute">{t(locale, k("checking"))}</p>}
          {ok?.alreadyOnGoogle && (
            <p data-testid="platform-already" className="flex items-start gap-1.5 font-medium text-green">
              <IconCircleCheck size={15} className="mt-0.5 shrink-0" aria-hidden />
              <span>{t(locale, k("already"), { platform: platform.name, section: sec }).replace(/^✓\s*/, "")}</span>
            </p>
          )}
          {ok && !ok.alreadyOnGoogle && (
            <>
              <p data-testid="platform-only-website" className="rounded-lg bg-paper px-3 py-2 text-ink">
                {t(locale, k("onlyWebsite"), { platform: platform.name, section: sec })}
              </p>
              {ok.canAdd ? <AddToGoogle businessId={businessId} platform={platform} section={section} initialUndo={ok.undo} /> : <HowTo platform={platform} section={section} />}
            </>
          )}
          {!connected && (
            <>
              <p data-testid="platform-not-connected" className="text-ink-soft">{t(locale, k("notConnected"), { section: sec })}</p>
              <Link href={`/business/${businessId}/connect-gbp`} className={PILL}>
                <IconBrandGoogle size={14} aria-hidden />
                {t(locale, premium ? k("connectPremium") : k("connect"))}
              </Link>
              <HowTo platform={platform} section={section} />
            </>
          )}
          {status && status !== "loading" && status.status !== "ok" && status.status !== "none" && (
            <>
              <p className="text-ink-soft">{status.status === "error" && status.error === "not_enabled_google" ? t(locale, k("notEnabledGoogle")) : errorText(status, locale)}</p>
              <HowTo platform={platform} section={section} open />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-paper-line pt-2.5">
        <p className="text-ink-soft">{t(locale, k("websiteValue"))}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href={`/business/${businessId}/website`} className={PILL}>
            <IconWorld size={14} aria-hidden />
            {t(locale, k("getWebsite"))}
          </Link>
          <span className="text-[12px] text-ink-mute">{t(locale, k("getWebsiteNote"), { button: platformButtonLabel(platform, locale) })}</span>
        </p>
      </div>
    </div>
  );
}

/** Free / Grow (and anyone not connected): the steps, with Google's own help article. */
function HowTo({ platform, section, open = false }: { platform: WebsitePlatform; section: PlaceActionSection; open?: boolean }) {
  const locale = useLocale();
  return (
    <details data-testid="platform-how-to" open={open} className="group text-[12.5px] text-ink-soft">
      <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {t(locale, k("howToTitle"))}
      </summary>
      <p className="mt-1">{t(locale, section === "order" ? k("howToOrder") : k("howToBooking"), { platform: platform.name })}</p>
      <a href={googleHelpUrl(GOOGLE_LINKS.localLinksHelp, locale)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-ink underline-offset-2 hover:underline">
        {t(locale, k("helpLink"))} ↗
      </a>
    </details>
  );
}

/** Premium + connected: approve → preview → add → Undo for 7 days. */
function AddToGoogle({ businessId, platform, section, initialUndo }: { businessId: string; platform: WebsitePlatform; section: PlaceActionSection; initialUndo: UndoableChange | null }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const sec = sectionLabel(section, locale);
  const [step, setStep] = useState<"idle" | "preview" | "sending" | "sent" | "undoConfirm" | "undoing" | "undone">("idle");
  const [undo, setUndo] = useState<UndoableChange | null>(initialUndo);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setStep("sending");
    setError(null);
    const r = await addPlatformLinkAction(businessId).catch(() => ({ status: "error" as const, error: "failed" as const }));
    if (r.status === "sent") {
      setUndo(r.undo);
      setStep("sent");
      router.refresh();
    } else if (r.status === "already") {
      setStep("sent");
    } else {
      setError(errorText(r, locale));
      setStep("idle");
    }
  }

  async function runUndo() {
    if (!undo) return;
    setStep("undoing");
    const r = await undoPlatformLinkAction(businessId, undo.batchId).catch(() => ({ status: "error" as const, error: "failed" as const }));
    if (r.status === "sent") {
      setUndo(null);
      setStep("undone");
      router.refresh();
    } else {
      setError(errorText(r, locale));
      setStep("idle");
    }
  }

  return (
    <div data-testid="platform-add" className="flex flex-col gap-2">
      {undo && step !== "undone" && (
        <p data-testid="platform-undo" className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
          {t(locale, k("undoSummary"), { section: sec, date: formatShortDate(undo.approvedAt, locale, timeZone), until: formatShortDate(undo.undoUntil, locale, timeZone) })}
          {step === "undoConfirm" || step === "undoing" ? (
            <>
              <span className="text-ink">{t(locale, k("undoConfirm"), { section: sec })}</span>
              <button type="button" className={PRIMARY} disabled={step === "undoing"} onClick={runUndo}>
                {step === "undoing" ? t(locale, k("sending")) : t(locale, k("undoYes"))}
              </button>
              <button type="button" className={QUIET} onClick={() => setStep("idle")}>
                {t(locale, k("cancel"))}
              </button>
            </>
          ) : (
            <button type="button" className={PILL} onClick={() => setStep("undoConfirm")}>
              {t(locale, k("undo"))}
            </button>
          )}
        </p>
      )}
      {step === "idle" && !undo && (
        <button type="button" className={PILL} onClick={() => setStep("preview")}>
          <IconBrandGoogle size={14} aria-hidden />
          {t(locale, k("add"), { section: sec })}
        </button>
      )}
      {(step === "preview" || step === "sending") && (
        <div data-testid="platform-preview" className="flex flex-col gap-2 rounded-lg border border-paper-line bg-paper p-3">
          <p className="text-ink">{t(locale, k("preview"), { section: sec, url: platform.url })}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} disabled={step === "sending"} onClick={approve}>
              {step === "sending" ? t(locale, k("sending")) : t(locale, k("approve"))}
            </button>
            <button type="button" className={QUIET} disabled={step === "sending"} onClick={() => setStep("idle")}>
              {t(locale, k("cancel"))}
            </button>
          </div>
        </div>
      )}
      {step === "sent" && (
        <p role="status" className="font-medium text-ink">
          {t(locale, k("sent"), { section: sec })}
        </p>
      )}
      {step === "undone" && (
        <p role="status" className="font-medium text-ink">
          {t(locale, k("undone"), { section: sec })}
        </p>
      )}
      {error && <p className="text-[12.5px] text-red">{error}</p>}
    </div>
  );
}
