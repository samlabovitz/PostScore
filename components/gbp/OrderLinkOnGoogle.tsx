"use client";

// Edit on Google (Premium, Beta): "Order online" for food businesses,
// "Booking link" for salons and other appointment businesses — the
// owner's own ordering or booking link on Google (app/actions/gbpOrderLink.ts).
// Shows Google's links now (read live), then Add / Change / Remove, each
// sent only on Approve: the link is checked first (https, a real ordering
// or booking site or the business's own website, never a parked one), and
// read back — "Updated on Google ✓" only when Google shows it, a neutral
// wait when it doesn't yet. Undo for 7 days. A Google partner's link is
// shown, never changed. Read-only (not on the live allow list): Approve
// and Undo are locked. Practice mode's banner and chooser are the
// section's (components/gbp/ProfileEditsOnGoogle.tsx).

import { useEffect, useState } from "react";
import { IconCheck, IconExternalLink } from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { applyOrderLinkAction, openOrderLink, undoOrderLinkAction, type OrderLinkActionResult, type OrderLinkView } from "@/app/actions/gbpOrderLink";
import { checkOrderLink, type OrderLinkOnGoogle, type OrderLinkProblem, type OrderLinkKind } from "@/lib/gbpOrderLink";
import { platformPage } from "@/lib/socialLinkCheck";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ApproveButton, LockedButton, TONE } from "@/components/gbp/googleEditBits";

const K = (key: string) => `dashboard.orderLink.${key}` as MessageKey;
const P = (key: string) => `dashboard.gbpProfileEdits.${key}` as MessageKey;
type Outcome = "accept" | "refuse" | "hold";
type What = "add" | "change" | "remove" | "undo";
type Message = { text: string; tone: keyof typeof TONE };

export function orderLinkProblemText(problem: OrderLinkProblem, kind: OrderLinkKind, locale: Locale): string {
  return t(locale, K(problem === "not_allowed" ? `problem.not_allowed.${kind}` : `problem.${problem}`));
}

/** The message after Approve or Undo: the real reason, with its tone. */
export function orderLinkMessage(result: OrderLinkActionResult, what: What, kind: OrderLinkKind, locale: Locale): Message {
  switch (result.status) {
    case "updated":
      return { text: t(locale, what === "undo" ? P("undone") : what === "remove" ? K("removed") : P("updated")), tone: "done" };
    case "unconfirmed":
      return { text: t(locale, K("unconfirmed")), tone: "waiting" };
    case "no_change":
      return { text: t(locale, P("noChange")), tone: "neutral" };
    case "invalid":
      return { text: orderLinkProblemText(result.problem, kind, locale), tone: "failure" };
    case "editing_off":
      return { text: t(locale, P("editingOff")), tone: "failure" };
    case "none":
    case "blocked":
      return { text: t(locale, P("error.blocked")), tone: "failure" };
    case "error":
      if (result.error === "rejected") return { text: t(locale, P("error.rejected")), tone: "failure" };
      if (result.error === "not_set_up" || result.error === "not_enabled") return { text: t(locale, P("error.notSetUp")), tone: "failure" };
      if (result.error === "not_enabled_google") return { text: t(locale, "dashboard.platformLink.notEnabledGoogle"), tone: "failure" };
      if (result.error === "changed_since" || result.error === "undo_expired") return { text: t(locale, `dashboard.platformLink.error.${result.error}` as MessageKey), tone: "failure" };
      return { text: t(locale, `dashboard.gbpEdit.error.${result.error}` as MessageKey), tone: "failure" };
  }
}

function siteName(uri: string): string {
  const p = platformPage(uri);
  if (p) return p.name;
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}

type Mode = { kind: "idle" } | { kind: "editing"; name: string | null } | { kind: "confirm_remove"; name: string } | { kind: "confirm_undo" } | { kind: "busy"; what: What; name: string | null };

/** The card once loaded — exported so tests can render it with a view. */
export function OrderLinkBody({
  businessId,
  initial,
  outcome,
  initialEditing,
}: {
  businessId: string;
  initial: OrderLinkView;
  outcome: Outcome;
  /** Tests only: open with the editor showing this link. */
  initialEditing?: { name: string | null; url: string };
}) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const [view, setView] = useState(initial);
  const [mode, setMode] = useState<Mode>(initialEditing ? { kind: "editing", name: initialEditing.name } : { kind: "idle" });
  const [url, setUrl] = useState(initialEditing?.url ?? "");
  const [message, setMessage] = useState<Message | null>(null);
  const own = view.links.filter((l) => l.editable);
  const partners = view.links.filter((l) => !l.editable);
  const checked = checkOrderLink(url, view.kind, view.ownSite);
  const busy = mode.kind === "busy";

  function startEditing(link: OrderLinkOnGoogle | null) {
    setMessage(null);
    setUrl(link?.uri ?? "");
    setMode({ kind: "editing", name: link?.name ?? null });
  }

  async function run(what: What, name: string | null, call: () => Promise<OrderLinkActionResult>) {
    setMode({ kind: "busy", what, name });
    setMessage(null);
    const result = await call().catch(() => ({ status: "error", error: "failed" }) as const);
    setMessage(orderLinkMessage(result, what, view.kind, locale));
    if (result.status === "updated" || result.status === "unconfirmed") {
      setView((v) => ({ ...v, links: result.links ?? v.links, undo: result.undo }));
      setMode({ kind: "idle" });
    } else if ((what === "add" || what === "change") && result.status !== "no_change") {
      // Refused or blocked: nothing changed, and the owner's link stays in the box.
      setMode({ kind: "editing", name });
    } else setMode({ kind: "idle" });
  }

  const approve = (name: string | null) =>
    run(name ? "change" : "add", name, () => applyOrderLinkAction(businessId, name ? { op: "change", name, url } : { op: "add", url }, view.practice ? outcome : null));
  const remove = (name: string) => run("remove", name, () => applyOrderLinkAction(businessId, { op: "remove", name }, view.practice ? outcome : null));
  const undo = () => view.undo && run("undo", null, () => undoOrderLinkAction(businessId, view.undo!.batchId, view.practice ? outcome : null));

  // The link being added (null) or changed (its name); undefined: not editing.
  const editingName = mode.kind === "editing" || (mode.kind === "busy" && (mode.what === "add" || mode.what === "change")) ? mode.name : undefined;
  const editing = editingName !== undefined;

  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5" data-testid="edit-order-link" data-kind={view.kind}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold text-ink">{t(locale, K(`title.${view.kind}`))}</h3>
        <p className="text-[13px] leading-snug text-ink-soft">{t(locale, K(`intro.${view.kind}`))}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, P("nowOnGoogle"))}</span>
        {view.links.length === 0 && <p className="text-[13.5px] text-ink-mute">{t(locale, K("none"))}</p>}
        {own.map((link) => (
          <div key={link.name} data-testid="order-link-own" className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
            <a href={link.uri} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 break-all font-medium underline-offset-2 hover:underline">
              {link.uri}
              <IconExternalLink size={13} aria-hidden className="shrink-0" />
            </a>
            {mode.kind === "idle" && (
              <span className="flex gap-1.5">
                <button type="button" data-testid="order-link-change" onClick={() => startEditing(link)} className="rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-soft">
                  {t(locale, K("change"))}
                </button>
                <button type="button" data-testid="order-link-remove" onClick={() => (setMessage(null), setMode({ kind: "confirm_remove", name: link.name }))} className="rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-soft">
                  {t(locale, K("remove"))}
                </button>
              </span>
            )}
          </div>
        ))}
        {partners.map((link) => (
          <p key={link.name} data-testid="order-link-partner" className="text-[13px] leading-snug text-ink-soft">
            <span className="break-all text-ink">{link.uri}</span> · {t(locale, K("partner"), { site: siteName(link.uri) })}
          </p>
        ))}
      </div>

      {own.length === 0 && mode.kind === "idle" && (
        <button type="button" data-testid="order-link-add" onClick={() => startEditing(null)} className="w-fit rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink hover:border-ink-soft">
          {t(locale, K("add"))}
        </button>
      )}

      {editing && (
        <div className="flex flex-col gap-2 rounded-xl border border-paper-deep bg-paper p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-ink">{t(locale, K("urlLabel"))}</span>
            <input
              type="url"
              inputMode="url"
              data-testid="order-link-input"
              value={url}
              placeholder="https://"
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-[14px] text-ink focus:border-brass focus:outline-none"
            />
          </label>
          <p className="text-[12.5px] text-ink-soft">{t(locale, K(`hint.${view.kind}`))}</p>
          {url.trim() !== "" && !checked.ok && (
            <p role="alert" data-testid="order-link-problem" className="text-[12.5px] text-red">
              {orderLinkProblemText(checked.problem, view.kind, locale)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <ApproveButton canEdit={view.canEdit} busy={busy} disabled={!checked.ok} onClick={() => approve(editingName ?? null)} testId="approve-order-link" label={t(locale, K(editingName ? "approveChange" : "approveAdd"))} />
            <button type="button" disabled={busy} onClick={() => setMode({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1.5 text-[13px] font-medium text-ink">
              {t(locale, P("cancel"))}
            </button>
          </div>
        </div>
      )}

      {(mode.kind === "confirm_remove" || (mode.kind === "busy" && mode.what === "remove")) && (
        <div role="alertdialog" className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-deep bg-white p-2.5 text-[13px] text-ink">
          <span>{t(locale, K("removeConfirm"))}</span>
          <ApproveButton canEdit={view.canEdit} busy={busy} disabled={false} onClick={() => mode.kind === "confirm_remove" && remove(mode.name)} testId="approve-order-link-remove" label={t(locale, K("removeYes"))} />
          <button type="button" disabled={busy} onClick={() => setMode({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1 text-[13px] font-medium text-ink">
            {t(locale, P("cancel"))}
          </button>
        </div>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <p data-testid="message-order-link" role={message.tone === "failure" ? "alert" : "status"} className={cn("flex items-center gap-1.5 text-[13px]", TONE[message.tone])}>
            {message.tone === "done" && <IconCheck size={14} aria-hidden />}
            {message.text}
          </p>
        )}
        {view.undo && !editing && mode.kind !== "confirm_remove" && (
          <div className="flex flex-col gap-1.5">
            {mode.kind === "confirm_undo" || (mode.kind === "busy" && mode.what === "undo") ? (
              <div role="alertdialog" className="flex flex-wrap items-center gap-2 rounded-lg border border-paper-deep bg-white p-2.5 text-[13px] text-ink">
                <span>{t(locale, K("undoConfirm"))}</span>
                {view.canEdit ? (
                  <button type="button" data-testid="undo-order-link-yes" disabled={busy} onClick={undo} className="rounded-lg border border-ink bg-ink px-3 py-1 text-[13px] font-semibold text-paper disabled:opacity-50">
                    {busy ? t(locale, P("approving")) : t(locale, P("undoYes"))}
                  </button>
                ) : (
                  <LockedButton label={t(locale, P("undoYes"))} testId="undo-order-link-yes" />
                )}
                <button type="button" disabled={busy} onClick={() => setMode({ kind: "idle" })} className="rounded-lg border border-paper-deep bg-white px-3 py-1 text-[13px] font-medium text-ink">
                  {t(locale, P("cancel"))}
                </button>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-soft">
                {t(locale, P("undoUntil"), { date: formatShortDate(view.undo.undoUntil, locale, timeZone) })}{" "}
                <button type="button" data-testid="undo-order-link" disabled={busy} onClick={() => setMode({ kind: "confirm_undo" })} className="font-semibold text-ink underline underline-offset-2">
                  {t(locale, P("undo"))}
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/** Loads the card; nothing for businesses that get neither card (or when it can't load — the section says why). */
export function OrderLinkOnGoogle({ businessId, outcome }: { businessId: string; outcome: Outcome }) {
  const locale = useLocale();
  const [view, setView] = useState<OrderLinkView | "none" | "failed" | null>(null);
  useEffect(() => {
    let live = true;
    openOrderLink(businessId)
      .then((r) => live && setView(r.status === "ok" ? r : r.status === "none" ? "none" : "failed"))
      .catch(() => live && setView("failed"));
    return () => {
      live = false;
    };
  }, [businessId]);
  if (view === "none") return null;
  if (view === "failed")
    return (
      <Card className="p-4 text-[13px] text-ink-soft sm:p-5" data-testid="edit-order-link-failed">
        {t(locale, P("loadFailed"))}
      </Card>
    );
  if (!view) return null;
  return <OrderLinkBody businessId={businessId} initial={view} outcome={outcome} />;
}
