"use client";

// Fix the Google listing's website link — from the Website page's warning
// card and the Website link check.
// Premium + Google connected: "Update website on Google" — the site
// PostScore verified is suggested (the owner can change it), the server
// checks it loads and isn't parked, the owner sees before → after and
// clicks Approve; nothing is sent to Google before that click. 7-day Undo.
// Otherwise: the steps to change it in Google Business Profile (~2 min),
// the real site to paste when known, and "Connect Google to fix this in
// one click" (Premium) or the Premium preview (Free/Grow).

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBrandGoogle, IconLock } from "@tabler/icons-react";
import { applyWebsiteLinkAction, checkWebsiteLinkAction, openWebsiteLinkFix, undoWebsiteLinkAction } from "@/app/actions/gbpWebsiteLink";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import type { WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";
import { cn } from "@/lib/utils";

const BUTTON =
  "inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:border-brass disabled:opacity-60";
const PRIMARY = "inline-flex w-fit items-center rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60";
const QUIET = "text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:underline";

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "editing"; current: string | null; url: string; check: { ok: boolean; text: string } | null; checking: boolean }
  | { kind: "preview" | "sending"; current: string | null; url: string }
  | { kind: "done"; text: string }
  | { kind: "error"; text: string };

function errorText(error: string, locale: Locale): string {
  if (error === "invalid" || error === "down" || error === "parked") return t(locale, `dashboard.websiteLinkFix.check.${error}` as MessageKey);
  if (error === "changed_since") return t(locale, "dashboard.websiteLinkFix.changedSince");
  return t(locale, `dashboard.gbpEdit.error.${error}` as MessageKey);
}

/** `suggested`: the site PostScore verified (or the owner confirmed), to paste in. */
export function WebsiteLinkFix({ businessId, suggested, className }: { businessId: string; suggested: string | null; className?: string }) {
  const gbp = useGbpEdit();
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [undo, setUndo] = useState<WebsiteLinkUndo | null>(gbp.websiteUndo ?? null);

  // Not Premium + connected (or no Google editing on this page): the steps.
  if (!gbp.enabled || !gbp.premium || !gbp.connected) {
    return (
      <div data-testid="website-link-fix-manual" className={cn("flex flex-col gap-2", className)}>
        <ManualSteps suggested={suggested} />
        {gbp.enabled && gbp.premium && (
          <Link href={`/business/${businessId}/connect-gbp`} className={BUTTON}>
            <IconBrandGoogle size={14} aria-hidden />
            {t(locale, "dashboard.websiteLinkFix.connect")}
          </Link>
        )}
        {gbp.enabled && !gbp.premium && (
          <span data-testid="website-link-fix-locked" className="inline-flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
              <IconLock size={11} aria-hidden />
              {t(locale, "dashboard.websiteLinkFix.premiumPreview")}
            </span>
            <UpgradeTrigger feature="googleProfile" plain />
          </span>
        )}
      </div>
    );
  }

  async function open() {
    setPhase({ kind: "loading" });
    try {
      const r = await openWebsiteLinkFix(businessId);
      // The suggested real site when there is one; otherwise today's link, to edit.
      if (r.status === "ok") return setPhase({ kind: "editing", current: r.current, url: r.suggested ?? suggested ?? r.current ?? "", check: null, checking: false });
      setPhase({ kind: "error", text: r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.error, locale) });
    } catch {
      setPhase({ kind: "error", text: t(locale, "dashboard.gbpEdit.error.failed") });
    }
  }

  async function check(editing: Extract<Phase, { kind: "editing" }>) {
    setPhase({ ...editing, checking: true, check: null });
    try {
      const r = await checkWebsiteLinkAction(businessId, editing.url);
      if (r.status === "ok") return setPhase({ ...editing, url: r.url, checking: false, check: { ok: true, text: t(locale, "dashboard.websiteLinkFix.checkOk") } });
      setPhase({ ...editing, checking: false, check: { ok: false, text: r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.status, locale) } });
    } catch {
      setPhase({ ...editing, checking: false, check: { ok: false, text: t(locale, "dashboard.gbpEdit.error.failed") } });
    }
  }

  async function approve(preview: { current: string | null; url: string }) {
    setPhase({ kind: "sending", current: preview.current, url: preview.url });
    try {
      const r = await applyWebsiteLinkAction(businessId, preview.url);
      if (r.status === "sent" || r.status === "pending_review") {
        setUndo(r.undo);
        setPhase({ kind: "done", text: t(locale, r.status === "pending_review" ? "dashboard.websiteLinkFix.pending" : "dashboard.websiteLinkFix.sent") });
        router.refresh();
      } else if (r.status === "no_change") {
        setPhase({ kind: "done", text: t(locale, "dashboard.websiteLinkFix.noChange") });
      } else {
        setPhase({ kind: "error", text: r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.error, locale) });
      }
    } catch {
      setPhase({ kind: "error", text: t(locale, "dashboard.gbpEdit.error.failed") });
    }
  }

  return (
    <div data-testid="website-link-fix" className={cn("flex flex-col gap-2", className)}>
      {undo && <UndoStrip businessId={businessId} undo={undo} onDone={() => setUndo(null)} />}

      {(phase.kind === "idle" || phase.kind === "loading") && (
        <button type="button" className={BUTTON} disabled={phase.kind === "loading"} onClick={open}>
          <IconBrandGoogle size={14} aria-hidden />
          {phase.kind === "loading" ? t(locale, "dashboard.websiteLinkFix.loading") : t(locale, "dashboard.websiteLinkFix.button")}
        </button>
      )}

      {phase.kind === "editing" && (
        <div className="flex flex-col gap-2 rounded-lg border border-paper-line bg-paper p-3 text-[13px]">
          <p className="text-ink">{phase.current ? t(locale, "dashboard.websiteLinkFix.intro", { current: phase.current }) : t(locale, "dashboard.websiteLinkFix.introNone")}</p>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-semibold text-ink">{t(locale, "dashboard.websiteLinkFix.label")}</span>
            <input
              type="url"
              inputMode="url"
              value={phase.url}
              onChange={(e) => setPhase({ ...phase, url: e.target.value, check: null })}
              className="rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
            />
          </label>
          {suggested && phase.url === suggested && <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.websiteLinkFix.suggested")}</p>}
          {phase.check && (
            <p role="status" className={cn("text-[12.5px]", phase.check.ok ? "text-green" : "text-red")}>
              {phase.check.ok ? "✓ " : ""}
              {phase.check.text}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {phase.check?.ok ? (
              <button type="button" className={PRIMARY} onClick={() => setPhase({ kind: "preview", current: phase.current, url: phase.url })}>
                {t(locale, "dashboard.websiteLinkFix.button")}
              </button>
            ) : (
              <button type="button" className={PRIMARY} disabled={phase.checking || !phase.url.trim()} onClick={() => check(phase)}>
                {phase.checking ? t(locale, "dashboard.websiteLinkFix.checking") : t(locale, "dashboard.websiteLinkFix.check")}
              </button>
            )}
            <button type="button" className={QUIET} onClick={() => setPhase({ kind: "idle" })}>
              {t(locale, "common.cancel")}
            </button>
          </div>
        </div>
      )}

      {(phase.kind === "preview" || phase.kind === "sending") && (
        <div data-testid="website-link-preview" className="flex flex-col gap-2 rounded-lg border border-paper-line bg-paper p-3 text-[13px]">
          <p className="font-semibold text-ink">{t(locale, "dashboard.websiteLinkFix.previewHeading")}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-ink-mute">{t(locale, "dashboard.websiteLinkFix.before")}</dt>
            <dd className="break-all text-ink-soft line-through">{phase.current ?? t(locale, "dashboard.websiteLinkFix.none")}</dd>
            <dt className="text-ink-mute">{t(locale, "dashboard.websiteLinkFix.after")}</dt>
            <dd className="break-all font-semibold text-ink">{phase.url}</dd>
          </dl>
          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.websiteLinkFix.previewNote")}</p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={PRIMARY} disabled={phase.kind === "sending"} onClick={() => phase.kind === "preview" && approve(phase)}>
              {phase.kind === "sending" ? t(locale, "dashboard.gbpEdit.sending") : t(locale, "dashboard.websiteLinkFix.approve")}
            </button>
            <button type="button" className={QUIET} disabled={phase.kind === "sending"} onClick={() => setPhase({ kind: "idle" })}>
              {t(locale, "common.cancel")}
            </button>
          </div>
        </div>
      )}

      {phase.kind === "done" && (
        <p role="status" className="text-[13px] font-medium text-ink">
          {phase.text}
        </p>
      )}
      {phase.kind === "error" && <p className="text-[12.5px] text-red">{phase.text}</p>}
    </div>
  );
}

function UndoStrip({ businessId, undo, onDone }: { businessId: string; undo: WebsiteLinkUndo; onDone: () => void }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "done" | "error">("idle");
  const [text, setText] = useState<string | null>(null);

  async function run() {
    setStep("sending");
    try {
      const r = await undoWebsiteLinkAction(businessId, undo.batchId);
      if (r.status === "sent") {
        setText(t(locale, r.pending ? "dashboard.websiteLinkFix.undoDonePending" : "dashboard.websiteLinkFix.undoDone"));
        setStep("done");
        router.refresh();
        return;
      }
      setText(r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.error, locale));
      setStep("error");
    } catch {
      setText(t(locale, "dashboard.gbpEdit.error.failed"));
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <p role="status" className="text-[12.5px] font-semibold text-ink">
        {text}
        <button type="button" className={cn(QUIET, "ml-2")} onClick={onDone}>
          {t(locale, "dashboard.gbpEdit.close")}
        </button>
      </p>
    );
  }
  return (
    <div data-testid="website-link-undo" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-paper-line bg-paper px-3 py-2 text-[12.5px] text-ink-soft">
      <span>
        {t(locale, undo.status === "pending_review" ? "dashboard.websiteLinkFix.undoSummaryPending" : "dashboard.websiteLinkFix.undoSummary", {
          date: formatShortDate(undo.approvedAt, locale, timeZone),
          until: formatShortDate(undo.undoUntil, locale, timeZone),
        })}
      </span>
      {step === "idle" || step === "error" ? (
        <button type="button" className={BUTTON} onClick={() => setStep("confirm")}>
          {t(locale, "dashboard.gbpEdit.undo.button")}
        </button>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink">{t(locale, "dashboard.websiteLinkFix.undoConfirm")}</span>
          <button type="button" className={PRIMARY} disabled={step === "sending"} onClick={run}>
            {step === "sending" ? t(locale, "dashboard.gbpEdit.sending") : t(locale, "dashboard.gbpEdit.undo.confirmYes")}
          </button>
          <button type="button" className={QUIET} disabled={step === "sending"} onClick={() => setStep("idle")}>
            {t(locale, "common.cancel")}
          </button>
        </span>
      )}
      {step === "error" && text && <span className="w-full text-red">{text}</span>}
    </div>
  );
}

/** The steps to change it on Google yourself (~2 min), with Google's help. */
export function ManualSteps({ suggested }: { suggested: string | null }) {
  const locale = useLocale();
  return (
    <details data-testid="website-link-steps" className="group text-[12.5px] text-ink-soft">
      <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {t(locale, "dashboard.websiteLinkFix.manualTitle")}
      </summary>
      <ol className="mt-1.5 list-decimal space-y-1 pl-5">
        <li>{t(locale, "dashboard.websiteLinkFix.step1")}</li>
        <li>{t(locale, "dashboard.websiteLinkFix.step2")}</li>
        <li>{suggested ? t(locale, "dashboard.websiteLinkFix.step3Url", { url: suggested }) : t(locale, "dashboard.websiteLinkFix.step3")}</li>
        <li>{t(locale, "dashboard.websiteLinkFix.step4")}</li>
      </ol>
      <a href={googleHelpUrl(GOOGLE_LINKS.editProfileHelp, locale)} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block font-semibold text-ink underline-offset-2 hover:underline">
        {t(locale, "dashboard.websiteLinkFix.help")} ↗
      </a>
    </details>
  );
}
