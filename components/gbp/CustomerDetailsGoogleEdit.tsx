"use client";

// Premium "Update on Google" for customer details (docs/gbp-actions-plan.md,
// Step 1) — on the "Add your customer details" step and the score row.
// Opening the panel only reads Google. Nothing changes on Google until
// the owner clicks "Approve and update Google" (or "Yes, undo").
//
// Free/Grow: a small locked Premium chip (the row's "How to fix it" is the
// action). Premium without Google connected: "Connect Google to update
// this". Off entirely where no GbpEditProvider is (tests,
// other pages).

import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBrandGoogle, IconArrowRight, IconLock } from "@tabler/icons-react";
import { applyCustomerDetailsAction, loadCustomerDetailsEditorAction, undoCustomerDetailsAction, type CustomerDetailsOwnerState, type GbpEditBlock } from "@/app/actions/gbpCustomerDetails";
import { setCustomerDetailsOwnerAnswer } from "@/app/actions/customerDetails";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { formatShortDate, t, useLocale, useTimeZone, type Locale, type MessageKey } from "@/lib/i18n";
import { PART_ORDER, pickFromChecked, type AttrValue, type AttributeChange, type CustomerDetailsEditorRow, type UndoableChange } from "@/lib/gbpAttributes";
import { cn } from "@/lib/utils";

export interface GbpEditState {
  enabled: boolean;
  premium: boolean;
  connected: boolean;
  /** The latest change the owner may still undo (≤ 7 days). */
  undo: UndoableChange | null;
}

const OFF: GbpEditState = { enabled: false, premium: false, connected: false, undo: null };
const GbpEditContext = createContext<GbpEditState>(OFF);

/** Whether "Update on Google" is on this page (a GbpEditProvider above). */
export function useGbpEdit(): GbpEditState {
  return useContext(GbpEditContext);
}

export function GbpEditProvider({ value, children }: { value: Omit<GbpEditState, "enabled">; children: ReactNode }) {
  return <GbpEditContext.Provider value={{ ...value, enabled: true }}>{children}</GbpEditContext.Provider>;
}

type OwnerPart = "parking" | "payment";
export type Editor = {
  rows: CustomerDetailsEditorRow[];
  owner: CustomerDetailsOwnerState;
  /** "Choose all that apply": which options are ticked. */
  checked: Record<string, boolean>;
  /** The owner's "No parking available" / "We take no payments on site". */
  ownerOff: Record<OwnerPart, boolean>;
  /** Why other options were just un-ticked (a short note under the group). */
  note?: { part: OwnerPart; key: "cashOnly" | "notCashOnly" | "noParking" | "parkingClearsNo" | "noPayment" | "paymentClearsNo" } | null;
};
type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | ({ kind: "editing" } & Editor)
  | ({ kind: "preview" | "sending"; changes: AttributeChange[]; ownerChanges: OwnerChange[] } & Editor)
  | { kind: "done"; status: "sent" | "pending_review" | "no_changes" | "saved" }
  | { kind: "error"; message: string };
type OwnerChange = { part: OwnerPart; off: boolean };

const BUTTON =
  "inline-flex w-fit items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-brass)_40%,white)] bg-[color:color-mix(in_srgb,var(--color-brass)_10%,white)] px-3 py-1 text-[12.5px] font-semibold text-ink transition-colors hover:border-brass disabled:opacity-60";
const PRIMARY = "inline-flex w-fit items-center rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60";
const QUIET = "text-[12.5px] font-semibold text-ink-soft underline-offset-2 hover:underline";

function valueKey(v: AttrValue): MessageKey {
  return v === true ? "dashboard.gbpEdit.value.yes" : v === false ? "dashboard.gbpEdit.value.no" : "dashboard.gbpEdit.value.notSet";
}

function blockMessage(reason: GbpEditBlock): MessageKey {
  return `dashboard.gbpEdit.blocked.${reason}` as MessageKey;
}

/** The panel's plain label for one of Google's options (EN + ES). */
export function optionLabel(id: string, locale: Locale): string {
  return t(locale, `dashboard.gbpEdit.option.${id.replace(/^attributes\//, "")}` as MessageKey);
}

/** Pure: the before → after list from the ticked options ("choose all
 * that apply" — see pickFromChecked). */
export function pendingChanges(rows: CustomerDetailsEditorRow[], checked: Record<string, boolean>): AttributeChange[] {
  return rows
    .map((r) => ({ id: r.id, part: r.part, label: r.label, before: r.current, after: pickFromChecked(r.current, checked[r.id] === true) }))
    .filter((c) => c.after !== c.before);
}

const CASH_ONLY = "attributes/requires_cash_only";
const CARD_PAYMENTS = ["attributes/pay_credit_card", "attributes/pay_debit_card", "attributes/pay_mobile_nfc"];

/** Ticking an option: "Cash only" un-ticks cards and contactless (and the
 * reverse); any parking / payment option un-ticks "No parking available" /
 * "We take no payments on site". Un-ticking never touches anything else. */
export function toggleOption<E extends Editor>(editor: E, row: CustomerDetailsEditorRow): E {
  const on = !editor.checked[row.id];
  const checked = { ...editor.checked, [row.id]: on };
  let note: Editor["note"] = null;
  if (on && row.id === CASH_ONLY && CARD_PAYMENTS.some((id) => checked[id])) {
    for (const id of CARD_PAYMENTS) if (id in checked) checked[id] = false;
    note = { part: "payment", key: "cashOnly" };
  } else if (on && CARD_PAYMENTS.includes(row.id) && checked[CASH_ONLY]) {
    checked[CASH_ONLY] = false;
    note = { part: "payment", key: "notCashOnly" };
  }
  const ownerPart = row.part === "parking" || row.part === "payment" ? row.part : null;
  const ownerOff = ownerPart && on && editor.ownerOff[ownerPart] ? { ...editor.ownerOff, [ownerPart]: false } : editor.ownerOff;
  if (ownerPart && ownerOff !== editor.ownerOff) note = { part: ownerPart, key: ownerPart === "parking" ? "parkingClearsNo" : "paymentClearsNo" };
  return { ...editor, checked, ownerOff, note };
}

/** "No parking available" clears every parking option (same for payments). */
export function toggleOwnerPart<E extends Editor>(editor: E, part: OwnerPart): E {
  const off = !editor.ownerOff[part];
  const partRows = editor.rows.filter((r) => r.part === part);
  const hadAny = partRows.some((r) => editor.checked[r.id]);
  const cleared = off ? Object.fromEntries(partRows.map((r) => [r.id, false])) : {};
  return {
    ...editor,
    ownerOff: { ...editor.ownerOff, [part]: off },
    checked: { ...editor.checked, ...cleared },
    note: off && hadAny ? { part, key: part === "parking" ? "noParking" : "noPayment" } : null,
  };
}

export function ownerChangesOf(e: Editor): OwnerChange[] {
  return e.owner.canRemove.filter((p) => e.ownerOff[p] !== e.owner.removed.includes(p)).map((p) => ({ part: p, off: e.ownerOff[p] }));
}

export function CustomerDetailsGoogleEdit({ businessId, className }: { businessId: string; className?: string }) {
  const state = useContext(GbpEditContext);
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [undo, setUndo] = useState<UndoableChange | null>(state.undo);

  if (!state.enabled) return null;

  // Free/Grow: the row's "How to fix it" is the action; this is the small
  // Premium chip beside it.
  if (!state.premium) {
    return (
      <span data-testid="gbp-edit-locked" className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
        <span className="inline-flex items-center gap-1 rounded-full bg-paper-deep px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          <IconLock size={11} aria-hidden />
          {t(locale, "dashboard.gbpEdit.lockedChip")}
        </span>
        <UpgradeTrigger feature="googleProfile" plain />
      </span>
    );
  }

  if (!state.connected) {
    return (
      <Link data-testid="gbp-edit-connect" href={`/business/${businessId}/connect-gbp`} className={cn(BUTTON, className)}>
        <IconBrandGoogle size={14} aria-hidden />
        {t(locale, "dashboard.gbpEdit.connectToUpdate")}
      </Link>
    );
  }

  const editing = phase.kind === "editing" ? phase : null;
  const fail = (message: string) => setPhase({ kind: "error", message });
  const errorText = (r: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: string }) =>
    r.status === "blocked" ? t(locale, blockMessage(r.reason)) : t(locale, `dashboard.gbpEdit.error.${r.error}` as MessageKey);

  async function open() {
    setPhase({ kind: "loading" });
    try {
      const r = await loadCustomerDetailsEditorAction(businessId);
      if (r.status === "blocked" || (r.status === "error" && r.error === "reconnect")) return fail(errorText(r));
      // Without Google's current values there's nothing safe to change.
      if (r.status !== "ok") return fail(t(locale, "dashboard.gbpEdit.error.loadCurrent"));
      setPhase({
        kind: "editing",
        rows: r.rows,
        owner: r.owner,
        checked: Object.fromEntries(r.rows.map((row) => [row.id, row.current === true])),
        ownerOff: { parking: r.owner.removed.includes("parking"), payment: r.owner.removed.includes("payment") },
      });
    } catch {
      // A failed request is never a silent click.
      fail(t(locale, "dashboard.gbpEdit.error.loadCurrent"));
    }
  }

  async function approve(e: Editor, changes: AttributeChange[], ownerChanges: OwnerChange[]) {
    setPhase({ kind: "sending", ...e, changes, ownerChanges });
    try {
      let status: "sent" | "pending_review" | "no_changes" | "saved" = "saved";
      if (changes.length > 0) {
        // Only the changed fields are sent; the server re-reads Google's
        // current values and builds the real before → after itself.
        const r = await applyCustomerDetailsAction(businessId, Object.fromEntries(changes.map((c) => [c.id, c.after])));
        if (r.status === "blocked" || r.status === "error") return fail(errorText(r));
        if (r.status !== "no_changes") setUndo(r.undo);
        status = r.status;
      }
      // The owner's own answers are PostScore's ("Added by you") — saved
      // only after Google took its part.
      for (const c of ownerChanges) {
        const saved = await setCustomerDetailsOwnerAnswer(businessId, c.part, c.off);
        if (saved.status !== "ok") return fail(t(locale, changes.length > 0 ? "dashboard.gbpEdit.error.ownerAfterGoogle" : "content.checks.completeness.customer_details.owner.error"));
      }
      setPhase({ kind: "done", status });
      router.refresh();
    } catch {
      fail(t(locale, "dashboard.gbpEdit.error.failed"));
    }
  }

  return (
    <div data-testid="gbp-edit" className={cn("flex flex-col gap-2", className)}>
      {undo && <UndoStrip businessId={businessId} undo={undo} onUndone={() => setUndo(null)} />}

      {(phase.kind === "idle" || phase.kind === "loading") && (
        <button type="button" className={BUTTON} onClick={open} disabled={phase.kind === "loading"}>
          <IconBrandGoogle size={14} aria-hidden />
          {phase.kind === "loading" ? t(locale, "dashboard.gbpEdit.loading") : t(locale, "dashboard.gbpEdit.button")}
        </button>
      )}

      {editing && (
        <EditorPanel
          editor={editing}
          onChange={(e) => setPhase({ ...e, kind: "editing" })}
          onReview={(changes, ownerChanges) => setPhase({ ...editing, kind: "preview", changes, ownerChanges })}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}

      {(phase.kind === "preview" || phase.kind === "sending") && (
        <Panel>
          <p className="text-[13px] font-semibold text-ink">{t(locale, "dashboard.gbpEdit.previewTitle")}</p>
          <ul data-testid="gbp-edit-preview" className="flex flex-col gap-1 text-[12.5px] text-ink-soft">
            {phase.changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink">{optionLabel(c.id, locale)}:</span>
                <span>{t(locale, "dashboard.gbpEdit.before", { value: t(locale, valueKey(c.before)) })}</span>
                <IconArrowRight size={12} aria-label="→" />
                <span className="font-semibold text-ink">{t(locale, "dashboard.gbpEdit.after", { value: t(locale, valueKey(c.after)) })}</span>
              </li>
            ))}
            {phase.ownerChanges.map((c) => (
              <li key={c.part} data-testid="gbp-edit-preview-owner" className="flex flex-wrap items-center gap-1.5">
                <span className="text-ink">{t(locale, c.part === "parking" ? "dashboard.gbpEdit.ownerNoParking" : "dashboard.gbpEdit.ownerNoPayment")}:</span>
                <span className="font-semibold text-ink">{t(locale, c.off ? "dashboard.gbpEdit.value.yes" : "dashboard.gbpEdit.value.no")}</span>
                <span className="rounded-full bg-paper-deep px-2 py-px text-[10.5px] font-semibold text-ink-soft">{t(locale, "dashboard.memory.addedByYou")}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-ink-mute">
            {phase.changes.length > 0 ? t(locale, "dashboard.gbpEdit.previewNote") : t(locale, "dashboard.gbpEdit.previewOwnerOnly")}
          </p>
          <div className="flex flex-wrap items-center gap-3 border-t border-paper-line pt-2.5">
            <button type="button" className={PRIMARY} disabled={phase.kind === "sending"} onClick={() => approve(phase, phase.changes, phase.ownerChanges)}>
              {phase.kind === "sending" ? t(locale, "dashboard.gbpEdit.sending") : t(locale, phase.changes.length > 0 ? "dashboard.gbpEdit.approve" : "dashboard.gbpEdit.saveOwnerOnly")}
            </button>
            <button type="button" className={QUIET} disabled={phase.kind === "sending"} onClick={() => setPhase({ kind: "editing", rows: phase.rows, owner: phase.owner, checked: phase.checked, ownerOff: phase.ownerOff })}>
              {t(locale, "dashboard.gbpEdit.back")}
            </button>
          </div>
        </Panel>
      )}

      {phase.kind === "done" && (
        <p data-testid="gbp-edit-result" role="status" className="text-[12.5px] text-ink-soft">
          <span className="font-semibold text-ink">
            {t(
              locale,
              phase.status === "pending_review"
                ? "dashboard.gbpEdit.result.pending"
                : phase.status === "no_changes"
                  ? "dashboard.gbpEdit.result.noChanges"
                  : phase.status === "saved"
                    ? "dashboard.gbpEdit.result.saved"
                    : "dashboard.gbpEdit.result.sent"
            )}
          </span>{" "}
          {(phase.status === "sent" || phase.status === "pending_review") && t(locale, "dashboard.gbpEdit.result.points")}
        </p>
      )}

      {phase.kind === "error" && (
        <p data-testid="gbp-edit-error" role="alert" className="text-[12.5px] text-red">
          {phase.message}{" "}
          <button type="button" className={QUIET} onClick={() => setPhase({ kind: "idle" })}>
            {t(locale, "dashboard.gbpEdit.close")}
          </button>
        </p>
      )}
    </div>
  );
}

/** One group per part: "How can customers park? Choose all that apply",
 * Google's offered options as checkboxes (current values ticked), and the
 * owner's own "No parking available" last — which clears the others. */
export function EditorPanel({
  editor,
  onChange,
  onReview,
  onCancel,
}: {
  editor: Editor;
  onChange: (e: Editor) => void;
  onReview: (changes: AttributeChange[], ownerChanges: OwnerChange[]) => void;
  onCancel: () => void;
}) {
  const locale = useLocale();
  const changes = pendingChanges(editor.rows, editor.checked);
  const ownerChanges = ownerChangesOf(editor);
  const parts = PART_ORDER.filter((part) => editor.rows.some((r) => r.part === part) || editor.owner.canRemove.includes(part as OwnerPart));
  const toggle = (row: CustomerDetailsEditorRow) => onChange(toggleOption(editor, row));
  const toggleOwner = (part: OwnerPart) => onChange(toggleOwnerPart(editor, part));
  return (
    <Panel>
      <p className="text-[12.5px] text-ink-soft">{t(locale, "dashboard.gbpEdit.intro")}</p>
      {parts.length === 0 && <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.gbpEdit.noneOffered")}</p>}
      {parts.map((part) => (
        <fieldset key={part} data-testid={`gbp-edit-group-${part}`} className="flex flex-col gap-1">
          <legend className="mb-1 text-[12.5px] font-semibold text-ink">{t(locale, `dashboard.gbpEdit.group.${part}` as MessageKey)}</legend>
          {editor.rows
            .filter((r) => r.part === part)
            .map((row) => (
              <label key={row.id} data-testid="gbp-edit-row" className="flex items-center gap-2 text-[12.5px] text-ink">
                <input type="checkbox" checked={editor.checked[row.id] === true} onChange={() => toggle(row)} className="h-3.5 w-3.5 accent-[color:var(--color-brass)]" />
                {optionLabel(row.id, locale)}
              </label>
            ))}
          {(part === "parking" || part === "payment") && editor.owner.canRemove.includes(part) && (
            <label data-testid={`gbp-edit-owner-${part}`} className="flex items-center gap-2 text-[12.5px] text-ink">
              <input type="checkbox" checked={editor.ownerOff[part]} onChange={() => toggleOwner(part)} className="h-3.5 w-3.5 accent-[color:var(--color-brass)]" />
              {t(locale, part === "parking" ? "dashboard.gbpEdit.ownerNoParking" : "dashboard.gbpEdit.ownerNoPayment")}
              <span className="rounded-full bg-paper-deep px-2 py-px text-[10.5px] font-semibold text-ink-soft">{t(locale, "dashboard.memory.addedByYou")}</span>
            </label>
          )}
          {editor.note?.part === part && (
            <p data-testid="gbp-edit-note" role="status" className="text-[12px] text-ink-mute">
              {t(locale, `dashboard.gbpEdit.note.${editor.note.key}` as MessageKey)}
            </p>
          )}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3 border-t border-paper-line pt-2.5">
        <button type="button" className={PRIMARY} disabled={changes.length === 0 && ownerChanges.length === 0} onClick={() => onReview(changes, ownerChanges)}>
          {t(locale, "dashboard.gbpEdit.review")}
        </button>
        <button type="button" className={QUIET} onClick={onCancel}>
          {t(locale, "common.cancel")}
        </button>
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2.5 rounded-xl border border-paper-line bg-paper p-3.5">{children}</div>;
}

function UndoStrip({ businessId, undo, onUndone }: { businessId: string; undo: UndoableChange; onUndone: () => void }) {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const router = useRouter();
  const [step, setStep] = useState<"idle" | "confirm" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStep("sending");
    const r = await undoCustomerDetailsAction(businessId, undo.batchId);
    if (r.status === "blocked") {
      setMessage(t(locale, blockMessage(r.reason)));
      return setStep("error");
    }
    if (r.status === "error") {
      setMessage(t(locale, `dashboard.gbpEdit.error.${r.error}` as MessageKey));
      return setStep("error");
    }
    setMessage(t(locale, r.status === "pending_review" ? "dashboard.gbpEdit.undo.donePending" : "dashboard.gbpEdit.undo.done"));
    setStep("done");
    router.refresh();
  }

  if (step === "done") {
    return (
      <p data-testid="gbp-undo-result" role="status" className="text-[12.5px] font-semibold text-ink">
        {message}
        <button type="button" className={cn(QUIET, "ml-2")} onClick={onUndone}>
          {t(locale, "dashboard.gbpEdit.close")}
        </button>
      </p>
    );
  }
  return (
    <div data-testid="gbp-undo" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-paper-line bg-paper px-3 py-2 text-[12.5px] text-ink-soft">
      <span>
        {t(locale, undo.status === "pending_review" ? "dashboard.gbpEdit.undo.summaryPending" : "dashboard.gbpEdit.undo.summary", {
          count: undo.changes.length,
          date: formatShortDate(undo.approvedAt, locale, timeZone),
          until: formatShortDate(undo.undoUntil, locale, timeZone),
        })}
      </span>
      {step === "idle" && (
        <button type="button" className={BUTTON} onClick={() => setStep("confirm")}>
          {t(locale, "dashboard.gbpEdit.undo.button")}
        </button>
      )}
      {(step === "confirm" || step === "sending") && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-ink">{t(locale, "dashboard.gbpEdit.undo.confirm")}</span>
          <button type="button" className={PRIMARY} disabled={step === "sending"} onClick={run}>
            {step === "sending" ? t(locale, "dashboard.gbpEdit.sending") : t(locale, "dashboard.gbpEdit.undo.confirmYes")}
          </button>
          <button type="button" className={QUIET} disabled={step === "sending"} onClick={() => setStep("idle")}>
            {t(locale, "common.cancel")}
          </button>
        </span>
      )}
      {step === "error" && <span className="w-full text-red">{message}</span>}
    </div>
  );
}
