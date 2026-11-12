"use client";

// Fix the Google listing's website link — from the Website page's warning
// card and the Website link check.
// Premium + Google connected (or practice mode): "Update website on
// Google" — the site PostScore verified is suggested (the owner can change
// it), the server checks it loads and isn't parked, the owner sees before
// → after and clicks Approve (Beta); nothing is sent to Google before that
// click. "Updated on Google ✓" only when Google shows it. Like the other
// Edit on Google cards: "On Google now" (read live, then from the
// read-back) with Change, and "You can undo this until …" for 7 days —
// read from gbp_changes, so it's there after a reload (practice mode too).
// Approve and "Yes, undo" are locked unless practice mode or the business
// is on GOOGLE_WRITES_LIVE_PLACES — and refused on the server too.
// The step in progress (the address, its check, the preview) survives a
// page reload (this tab only, 30 minutes), with a note saying so; every
// failure shows a message — the card never goes back to the start silently.
// Otherwise: the steps to change it in Google Business Profile (~2 min),
// the real site to paste when known, and "Connect Google to fix this in
// one click" (Premium) or the Premium preview (Free/Grow).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBrandGoogle, IconExternalLink, IconLock } from "@tabler/icons-react";
import { applyWebsiteLinkAction, checkWebsiteLinkAction, openWebsiteLinkFix, undoWebsiteLinkAction } from "@/app/actions/gbpWebsiteLink";
import { useGbpEdit } from "@/components/gbp/CustomerDetailsGoogleEdit";
import { ApproveButton, PracticeChooser, ReadOnlyNote, TONE, UndoLine, type PracticeOutcome } from "@/components/gbp/googleEditBits";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { GOOGLE_LINKS, googleHelpUrl } from "@/lib/googleHelpLinks";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
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
  | { kind: "undoing" };
type Message = { text: string; tone: keyof typeof TONE };

function errorText(error: string, locale: Locale): string {
  if (error === "invalid" || error === "down" || error === "parked") return t(locale, `dashboard.websiteLinkFix.check.${error}` as MessageKey);
  if (error === "changed_since") return t(locale, "dashboard.websiteLinkFix.changedSince");
  if (error === "editing_off") return t(locale, "dashboard.gbpEdit.error.editing_off");
  const key = `dashboard.gbpEdit.error.${error}` as MessageKey;
  const text = t(locale, key);
  // A code with no message of its own still says something went wrong.
  return text === key ? t(locale, "dashboard.gbpEdit.error.failed") : text;
}

/** The step in progress, kept in this tab so a page reload doesn't lose it. */
type Draft = { phase: "editing" | "preview"; current: string | null; url: string; checked: boolean; mode: { practice: boolean; canEdit: boolean }; savedAt: number };
const DRAFT_MAX_AGE = 30 * 60 * 1000;
const draftKey = (businessId: string) => `postscore:website-link-draft:${businessId}`;

function readDraft(businessId: string): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(draftKey(businessId));
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if ((d.phase !== "editing" && d.phase !== "preview") || typeof d.url !== "string" || !(Date.now() - d.savedAt < DRAFT_MAX_AGE)) return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(businessId: string, draft: Draft | null) {
  try {
    if (draft) window.sessionStorage.setItem(draftKey(businessId), JSON.stringify(draft));
    else window.sessionStorage.removeItem(draftKey(businessId));
  } catch {
    // Storage blocked: the card still works, it just won't survive a reload.
  }
}

/** `suggested`: the site PostScore verified (or the owner confirmed), to paste in.
 * `autoLoad` (the Google Profile tab's card): read Google when the card
 * shows, for "On Google now" — elsewhere only when the owner clicks. */
export function WebsiteLinkFix({ businessId, suggested, className, autoLoad = false }: { businessId: string; suggested: string | null; className?: string; autoLoad?: boolean }) {
  const gbp = useGbpEdit();
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: autoLoad ? "loading" : "idle" });
  // The link on Google now — undefined until Google was read.
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [undo, setUndo] = useState<WebsiteLinkUndo | null>(gbp.websiteUndo ?? null);
  const [message, setMessage] = useState<Message | null>(null);
  // What the server said when the card loaded (the page's guess until then).
  const [mode, setMode] = useState({ practice: gbp.practice === true, canEdit: gbp.canEdit === true });
  const [outcome, setOutcome] = useState<PracticeOutcome>("accept");
  // Shown after a reload brought back the step in progress.
  const [restored, setRestored] = useState(false);
  const live = gbp.enabled && gbp.premium && (gbp.connected || gbp.practice);

  /** Reads Google (and the saved Undo). `edit`: then straight to the address box. */
  async function load(edit: boolean) {
    setPhase({ kind: "loading" });
    try {
      const r = await openWebsiteLinkFix(businessId);
      if (r.status === "ok") {
        setMode({ practice: r.practice, canEdit: r.canEdit });
        setCurrent(r.current);
        setUndo(r.undo);
        // The suggested real site when there is one; otherwise today's link, to edit.
        if (edit) return setPhase({ kind: "editing", current: r.current, url: r.suggested ?? suggested ?? r.current ?? "", check: null, checking: false });
        return setPhase({ kind: "idle" });
      }
      setPhase({ kind: "idle" });
      setMessage({ tone: "failure", text: r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.error, locale) });
    } catch {
      setPhase({ kind: "idle" });
      setMessage({ tone: "failure", text: t(locale, "dashboard.gbpProfileEdits.loadFailed") });
    }
  }

  // After a reload (or the card mounting again): back to the step in progress, or read Google.
  useEffect(() => {
    if (!live) return;
    const d = readDraft(businessId);
    if (!d) {
      if (autoLoad) void load(false);
      return;
    }
    setMode(d.mode);
    setCurrent(d.current);
    setRestored(true);
    if (d.phase === "preview") setPhase({ kind: "preview", current: d.current, url: d.url });
    else setPhase({ kind: "editing", current: d.current, url: d.url, checking: false, check: d.checked ? { ok: true, text: t(locale, "dashboard.websiteLinkFix.checkOk") } : null });
    // Only once, when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the step in progress; anything else (sent, cancelled, failed) clears it.
  useEffect(() => {
    if (!live || phase.kind === "loading") return;
    if (phase.kind === "editing" || phase.kind === "preview")
      writeDraft(businessId, { phase: phase.kind, current: phase.current, url: phase.url, checked: phase.kind === "preview" || (phase.kind === "editing" && phase.check?.ok === true), mode, savedAt: Date.now() });
    else writeDraft(businessId, null);
  }, [live, businessId, phase, mode]);

  // Not Premium + connected (or practice mode), or no Google editing on this page: the steps.
  if (!live) {
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

  /** "Change" (Google already read): the address box with today's link, or the suggested site. */
  function startEditing() {
    setMessage(null);
    setRestored(false);
    if (current === undefined) return void load(true);
    setPhase({ kind: "editing", current, url: suggested ?? current ?? "", check: null, checking: false });
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
    setMessage(null);
    setRestored(false);
    try {
      const r = await applyWebsiteLinkAction(businessId, preview.url, mode.practice ? outcome : null);
      if (r.status === "sent" || r.status === "pending_review") {
        setUndo(r.undo);
        // What Google shows now: the read-back (the old link while Google reviews it).
        if (r.current !== undefined) setCurrent(r.current);
        // "Updated on Google ✓" only when Google shows it; otherwise a neutral wait.
        if (r.status === "pending_review") setMessage({ text: t(locale, "dashboard.websiteLinkFix.pending"), tone: "waiting" });
        else if (r.verified) setMessage({ text: t(locale, "dashboard.websiteLinkFix.sent"), tone: "done" });
        else setMessage({ text: t(locale, "dashboard.gbpProfileEdits.unconfirmed"), tone: "waiting" });
        setPhase({ kind: "idle" });
        router.refresh();
        return;
      }
      if (r.status === "no_change") {
        setCurrent(preview.url);
        setMessage({ text: t(locale, "dashboard.websiteLinkFix.noChange"), tone: "neutral" });
        return setPhase({ kind: "idle" });
      }
      // Refused or failed: nothing changed, and the owner's address stays in the preview.
      setMessage({ tone: "failure", text: r.status === "editing_off" ? errorText("editing_off", locale) : r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.error, locale) });
      setPhase({ kind: "preview", current: preview.current, url: preview.url });
    } catch {
      setMessage({ tone: "failure", text: t(locale, "dashboard.gbpEdit.error.failed") });
      setPhase({ kind: "preview", current: preview.current, url: preview.url });
    }
  }

  async function runUndo() {
    if (!undo) return;
    setPhase({ kind: "undoing" });
    setMessage(null);
    try {
      const r = await undoWebsiteLinkAction(businessId, undo.batchId, mode.practice ? outcome : null);
      if (r.status === "sent") {
        setUndo(null);
        if (r.pending) setMessage({ text: t(locale, "dashboard.websiteLinkFix.undoDonePending"), tone: "waiting" });
        else {
          setCurrent(r.current !== undefined ? r.current : undo.before);
          setMessage({ text: t(locale, "dashboard.gbpProfileEdits.undone"), tone: "done" });
        }
        router.refresh();
      } else {
        setMessage({ tone: "failure", text: r.status === "blocked" ? t(locale, `dashboard.gbpEdit.blocked.${r.reason}` as MessageKey) : errorText(r.status === "editing_off" ? "editing_off" : r.error, locale) });
      }
    } catch {
      setMessage({ tone: "failure", text: t(locale, "dashboard.gbpEdit.error.failed") });
    }
    setPhase({ kind: "idle" });
  }

  const quiet = phase.kind === "idle" || phase.kind === "undoing";

  return (
    <div data-testid="website-link-fix" className={cn("flex flex-col gap-2", className)}>
      {restored && (phase.kind === "editing" || phase.kind === "preview") && (
        <p role="status" data-testid="website-link-restored" className={cn("text-[12.5px]", TONE.waiting)}>
          {t(locale, "dashboard.websiteLinkFix.restored")}
        </p>
      )}

      {current !== undefined && (
        <div data-testid="website-link-now" className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.gbpProfileEdits.nowOnGoogle")}</span>
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
            {current ? (
              <a data-testid="website-link-current" href={current} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 break-all font-medium underline-offset-2 hover:underline">
                {current}
                <IconExternalLink size={13} aria-hidden className="shrink-0" />
              </a>
            ) : (
              <span data-testid="website-link-current" className="text-ink-mute">
                {t(locale, "dashboard.websiteLinkFix.none")}
              </span>
            )}
            {quiet && (
              <button type="button" data-testid="website-link-change" disabled={phase.kind === "undoing"} onClick={startEditing} className="rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-soft disabled:opacity-50">
                {t(locale, "dashboard.websiteLinkFix.change")}
              </button>
            )}
          </div>
        </div>
      )}

      {current === undefined && (phase.kind === "idle" || phase.kind === "loading") && (
        <button type="button" data-testid="website-link-start" className={BUTTON} disabled={phase.kind === "loading"} onClick={() => (autoLoad ? load(false) : startEditing())}>
          <IconBrandGoogle size={14} aria-hidden />
          {phase.kind === "loading" ? t(locale, "dashboard.websiteLinkFix.loading") : autoLoad ? t(locale, "dashboard.websiteLinkFix.retry") : t(locale, "dashboard.websiteLinkFix.button")}
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
              <button type="button" data-testid="website-link-review" className={PRIMARY} onClick={() => setPhase({ kind: "preview", current: phase.current, url: phase.url })}>
                {t(locale, "dashboard.websiteLinkFix.review")}
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
          {mode.practice && <PracticeChooser outcome={outcome} onChange={setOutcome} testId="website-link-practice" />}
          {!mode.practice && !mode.canEdit && <ReadOnlyNote testId="website-link-read-only" />}
          <div className="flex flex-wrap items-center gap-3">
            <ApproveButton
              canEdit={mode.canEdit}
              busy={phase.kind === "sending"}
              disabled={false}
              onClick={() => phase.kind === "preview" && approve(phase)}
              testId="website-link-approve"
              label={t(locale, "dashboard.websiteLinkFix.approve")}
            />
            <button type="button" className={QUIET} disabled={phase.kind === "sending"} onClick={() => (setMessage(null), setPhase({ kind: "idle" }))}>
              {t(locale, "common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <p data-testid={message.tone === "failure" ? "website-link-error" : "website-link-result"} role={message.tone === "failure" ? "alert" : "status"} className={cn("text-[13px]", TONE[message.tone])}>
            {message.text}
          </p>
        )}
        {undo && quiet && (
          <UndoLine
            until={undo.undoUntil}
            confirmText={t(locale, "dashboard.websiteLinkFix.undoConfirm")}
            canEdit={mode.canEdit}
            busy={phase.kind === "undoing"}
            onUndo={runUndo}
            testId="website-link-undo"
          />
        )}
      </div>
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
