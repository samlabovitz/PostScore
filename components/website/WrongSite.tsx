"use client";

// "Wrong site?" — on the Overview header (next to the website chip), the
// Website page (next to "Scanning:") and Settings. A popover on a desktop,
// a bottom sheet on a phone: the site PostScore grades and where it came
// from, then the choices — the Google listing link, the site PostScore
// verified (if any), or the owner's own address. The server checks the
// page (it loads, isn't parked, and whether it shows the business's name,
// phone or address) and says so honestly before anything is saved.
// Keyboard: focus moves in, Tab stays inside, Esc closes and focus returns.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconWorld, IconX } from "@tabler/icons-react";
import { checkOwnerWebsite, getWebsiteChoice, saveOwnerWebsite, undoOwnerWebsite, type CheckSiteResult, type WebsiteChoice } from "@/app/actions/ownerWebsite";
import { siteHost, type BusinessMention } from "@/lib/ownerWebsite";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const PRIMARY = "inline-flex items-center justify-center rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass";
const SECONDARY = "inline-flex items-center justify-center rounded-full border border-paper-deep bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink hover:border-ink-soft disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass";
const TRIGGER = "inline-flex shrink-0 items-center whitespace-nowrap text-[12px] font-semibold text-ink-soft underline decoration-dotted underline-offset-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass";

type Pick = "listing" | "verified" | "enter";
type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "checking" }
  | { kind: "checked"; result: CheckSiteResult }
  | { kind: "saving" }
  | { kind: "done"; lines: string[] }
  | { kind: "error"; message: string };

/** "name and phone number" / "el nombre y el teléfono". */
export function mentionsText(mentions: BusinessMention[], locale: Locale): string {
  const items = mentions.map((m) => t(locale, `dashboard.wrongSite.found.${m}` as MessageKey));
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${t(locale, "dashboard.wrongSite.found.and")} ${items[items.length - 1]}`;
}

function checkMessage(result: CheckSiteResult, locale: Locale): { text: string; ok: boolean } {
  if (result.status === "ok") {
    return result.mentions.length > 0
      ? { text: t(locale, "dashboard.wrongSite.found", { what: mentionsText(result.mentions, locale) }), ok: true }
      : { text: t(locale, "dashboard.wrongSite.unconfirmed"), ok: false };
  }
  if (result.status === "invalid" || result.status === "down" || result.status === "parked") return { text: t(locale, `dashboard.websiteLinkFix.check.${result.status}` as MessageKey), ok: false };
  return { text: t(locale, "dashboard.wrongSite.error"), ok: false };
}

export function WrongSite({ businessId, className }: { businessId: string; className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<WebsiteChoice | null>(null);
  const [pick, setPick] = useState<Pick>("enter");
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  async function load() {
    setPhase({ kind: "loading" });
    try {
      const r = await getWebsiteChoice(businessId);
      if (r.status !== "ok") return setPhase({ kind: "error", message: t(locale, "dashboard.wrongSite.error") });
      setChoice(r.choice);
      setPick(r.choice.verified && r.choice.current?.source !== "verified" ? "verified" : r.choice.listing && !r.choice.listingBroken && r.choice.current?.source !== "listing" ? "listing" : "enter");
      setPhase({ kind: "ready" });
    } catch {
      setPhase({ kind: "error", message: t(locale, "dashboard.wrongSite.error") });
    }
  }

  function toggle() {
    if (open) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    // Desktop: under the trigger, kept on screen. A phone gets the bottom sheet.
    if (rect && typeof window !== "undefined") setAt({ top: rect.bottom + 6, left: Math.max(16, Math.min(rect.left, window.innerWidth - 368 - 16)) });
    setTyped("");
    setOpen(true);
    void load();
  }

  // Focus moves into the dialog when it opens.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Esc closes; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), a[href]") ?? []);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const i = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && i === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const target = pick === "listing" ? choice?.listing ?? "" : pick === "verified" ? choice?.verified ?? "" : typed;

  async function check() {
    setPhase({ kind: "checking" });
    try {
      setPhase({ kind: "checked", result: await checkOwnerWebsite(businessId, target) });
    } catch {
      setPhase({ kind: "error", message: t(locale, "dashboard.wrongSite.error") });
    }
  }

  async function save(anyway: boolean) {
    setPhase({ kind: "saving" });
    try {
      const r = await saveOwnerWebsite(businessId, target, anyway);
      if (r.status === "saved") {
        setPhase({ kind: "done", lines: [t(locale, "dashboard.wrongSite.saved", { host: siteHost(r.url) }), ...afterLines(r.recheck, r.screenshot, locale)] });
        router.refresh();
      } else if (r.status === "unconfirmed") {
        setPhase({ kind: "checked", result: { status: "ok", url: r.url, mentions: [] } });
      } else if (r.status === "invalid" || r.status === "down" || r.status === "parked") {
        setPhase({ kind: "checked", result: { status: r.status } });
      } else {
        setPhase({ kind: "error", message: t(locale, r.status === "not_enabled" ? "dashboard.wrongSite.notEnabled" : "dashboard.wrongSite.error") });
      }
    } catch {
      setPhase({ kind: "error", message: t(locale, "dashboard.wrongSite.error") });
    }
  }

  async function undo() {
    setPhase({ kind: "saving" });
    try {
      const r = await undoOwnerWebsite(businessId);
      if (r.status === "saved") {
        setPhase({ kind: "done", lines: [t(locale, "dashboard.wrongSite.undone"), ...afterLines(r.recheck, r.screenshot, locale)] });
        router.refresh();
      } else {
        setPhase({ kind: "error", message: t(locale, r.status === "not_enabled" ? "dashboard.wrongSite.notEnabled" : "dashboard.wrongSite.error") });
      }
    } catch {
      setPhase({ kind: "error", message: t(locale, "dashboard.wrongSite.error") });
    }
  }

  const busy = phase.kind === "checking" || phase.kind === "saving" || phase.kind === "loading";
  const checked = phase.kind === "checked" ? phase.result : null;
  const message = checked ? checkMessage(checked, locale) : null;
  const current = choice?.current ?? null;

  return (
    <>
      <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={toggle} className={cn(TRIGGER, className)} data-testid="wrong-site">
        {t(locale, "dashboard.wrongSite.button")}
      </button>
      {open && (
        <>
          {/* Phone: a dimmed backdrop; desktop: an invisible click-catcher. */}
          <div aria-hidden className="fixed inset-0 z-40 bg-[color:color-mix(in_srgb,var(--color-ink)_30%,transparent)] sm:bg-transparent" onClick={close} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-labelledby={titleId}
            data-testid="wrong-site-dialog"
            style={at ? ({ "--ws-top": `${at.top}px`, "--ws-left": `${at.left}px` } as React.CSSProperties) : undefined}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] outline-none overflow-y-auto rounded-t-2xl border border-paper-deep bg-white p-4 pb-6 shadow-card sm:inset-x-auto sm:bottom-auto sm:left-[var(--ws-left)] sm:top-[var(--ws-top)] sm:w-[23rem] sm:rounded-2xl sm:pb-4"
          >
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                <IconWorld size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-serif text-[17px] font-semibold text-ink">
                  {t(locale, "dashboard.wrongSite.title")}
                </h2>
                {current ? (
                  <p className="text-[12.5px] text-ink-soft">
                    {t(locale, "dashboard.wrongSite.current", { host: siteHost(current.url) })} · <span className="font-semibold text-ink">{t(locale, `dashboard.wrongSite.source.${current.source}` as MessageKey)}</span>
                  </p>
                ) : phase.kind !== "loading" ? (
                  <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.wrongSite.none")}</p>
                ) : null}
              </div>
              <button type="button" onClick={close} aria-label={t(locale, "dashboard.wrongSite.close")} className="rounded-full p-1 text-ink-mute hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brass">
                <IconX size={16} />
              </button>
            </div>

            {phase.kind === "loading" && <p className="mt-3 text-[13px] text-ink-mute">{t(locale, "dashboard.wrongSite.loading")}</p>}

            {phase.kind === "done" && (
              <div role="status" className="mt-3 flex flex-col gap-1 text-[13px] text-ink">
                {phase.lines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                <button type="button" className={cn(SECONDARY, "mt-2 w-fit")} onClick={close}>
                  {t(locale, "dashboard.wrongSite.close")}
                </button>
              </div>
            )}

            {phase.kind === "error" && (
              <p role="alert" className="mt-3 text-[13px] text-red">
                {phase.message}
              </p>
            )}

            {choice && phase.kind !== "done" && phase.kind !== "loading" && (
              <fieldset className="mt-3 flex flex-col gap-2" disabled={busy}>
                <legend className="mb-1 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-mute">{t(locale, "dashboard.wrongSite.choose")}</legend>
                {choice.listing && (
                  <Option checked={pick === "listing"} onChange={() => setPick("listing")} disabled={choice.listingBroken} label={t(locale, "dashboard.wrongSite.option.listing")} detail={siteHost(choice.listing)} warning={choice.listingBroken ? t(locale, "dashboard.wrongSite.option.listingBroken") : null} />
                )}
                {choice.verified && <Option checked={pick === "verified"} onChange={() => setPick("verified")} label={t(locale, "dashboard.wrongSite.option.verified")} detail={siteHost(choice.verified)} />}
                <Option checked={pick === "enter"} onChange={() => setPick("enter")} label={t(locale, "dashboard.wrongSite.option.enter")} />
                {pick === "enter" && (
                  <input
                    type="url"
                    inputMode="url"
                    autoComplete="url"
                    aria-label={t(locale, "dashboard.wrongSite.option.enter")}
                    placeholder={t(locale, "dashboard.wrongSite.placeholder")}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      if (phase.kind === "checked") setPhase({ kind: "ready" });
                    }}
                    className="ml-6 rounded-lg border border-paper-deep px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
                  />
                )}
              </fieldset>
            )}

            {message && (
              <p role="status" data-testid="wrong-site-result" className={cn("mt-3 rounded-lg px-3 py-2 text-[13px]", message.ok ? "bg-green/10 text-green" : "bg-amber/10 text-ink")}>
                {message.text}
              </p>
            )}

            {choice && phase.kind !== "done" && phase.kind !== "loading" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {checked?.status === "ok" ? (
                  <button type="button" className={PRIMARY} disabled={busy} onClick={() => save(checked.mentions.length === 0)}>
                    {phase.kind === "saving" ? t(locale, "dashboard.wrongSite.saving") : t(locale, checked.mentions.length === 0 ? "dashboard.wrongSite.useAnyway" : "dashboard.wrongSite.use")}
                  </button>
                ) : (
                  <button type="button" className={PRIMARY} disabled={busy || !target.trim()} onClick={check}>
                    {phase.kind === "checking" ? t(locale, "dashboard.wrongSite.checking") : phase.kind === "saving" ? t(locale, "dashboard.wrongSite.saving") : t(locale, "dashboard.wrongSite.check")}
                  </button>
                )}
                <button type="button" className={SECONDARY} onClick={close}>
                  {t(locale, "common.cancel")}
                </button>
              </div>
            )}

            {choice?.undoTo && phase.kind !== "done" && phase.kind !== "loading" && (
              <button type="button" className="mt-3 text-[12.5px] font-semibold text-ink-soft underline underline-offset-2 hover:text-ink" disabled={busy} onClick={undo}>
                {choice.undoTo === "default" ? t(locale, "dashboard.wrongSite.undoDefault") : t(locale, "dashboard.wrongSite.undo", { host: siteHost(choice.undoTo) })}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

function afterLines(recheck: "done" | "later", screenshot: "taken" | "later" | "capped", locale: Locale): string[] {
  return [
    t(locale, recheck === "done" ? "dashboard.wrongSite.recheckDone" : "dashboard.wrongSite.recheckLater"),
    ...(screenshot === "taken" ? [t(locale, "dashboard.wrongSite.screenshotTaken")] : screenshot === "capped" ? [t(locale, "dashboard.wrongSite.screenshotCapped")] : []),
  ];
}

function Option({ checked, onChange, label, detail, warning = null, disabled = false }: { checked: boolean; onChange: () => void; label: string; detail?: string; warning?: string | null; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[13px]", checked ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "border-paper-line", disabled && "cursor-not-allowed opacity-60")}>
      <input type="radio" name="wrong-site-pick" className="mt-0.5 accent-[var(--color-ink)]" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{label}</span>
        {detail && <span className="block truncate text-ink-soft">{detail}</span>}
        {warning && <span className="block text-[12px] font-semibold text-red">{warning}</span>}
      </span>
    </label>
  );
}
