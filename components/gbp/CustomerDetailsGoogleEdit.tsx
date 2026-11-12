"use client";

// Premium "Update on Google" for customer details (docs/gbp-actions-plan.md,
// Step 1) — on the "Add your customer details" step, the score row and the
// Google Profile tab. Opening the panel only reads Google. Nothing changes
// on Google until the owner clicks Approve (Beta) or "Yes, undo" — both
// locked unless practice mode or the business is on
// GOOGLE_WRITES_LIVE_PLACES, and refused on the server too. "Updated on
// Google ✓" only when Google reads back every value. Like the other Edit
// on Google cards: "On Google now" with Change, and "You can undo this
// until …" for 7 days — read from gbp_changes, so it's there after a
// reload (practice mode too).
//
// Free/Grow: a small locked Premium chip (the row's "How to fix it" is the
// action). Premium without Google connected: "Connect Google to update
// this". Off entirely where no GbpEditProvider is (tests,
// other pages).

import { ViewOnGoogle } from "@/components/gbp/ViewOnGoogle";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBrandGoogle, IconArrowRight, IconLock } from "@tabler/icons-react";
import { applyCustomerDetailsAction, loadCustomerDetailsEditorAction, undoCustomerDetailsAction, type CustomerDetailsOwnerState, type GbpEditBlock } from "@/app/actions/gbpCustomerDetails";
import { setCustomerDetailsOwnerAnswer } from "@/app/actions/customerDetails";
import { UpgradeTrigger } from "@/components/upgrade/UpgradeTrigger";
import { t, useLocale, type Locale, type MessageKey } from "@/lib/i18n";
import { PART_ORDER, pickFromChecked, type AttrValue, type AttributeChange, type CustomerDetailsEditorRow, type UndoableChange } from "@/lib/gbpAttributes";
import { cn } from "@/lib/utils";
import type { WebsiteLinkUndo } from "@/lib/gbpWebsiteLink";
import { ApproveButton, PracticeChooser, ReadOnlyNote, TONE, UndoLine, type PracticeOutcome } from "@/components/gbp/googleEditBits";

export interface GbpEditState {
  enabled: boolean;
  premium: boolean;
  connected: boolean;
  /** The latest change the owner may still undo (≤ 7 days). */
  undo: UndoableChange | null;
  /** The latest website link change the owner may still undo (components/gbp/WebsiteLinkFix.tsx). */
  websiteUndo?: WebsiteLinkUndo | null;
  /** The real site to put on the Google listing, when PostScore knows it. */
  websiteSuggested?: string | null;
  /** Practice mode (REVIEW_REPLIES_PRACTICE): the fake Google — no connection needed, nothing sent. */
  practice?: boolean;
  /** Approve / Undo are on: practice mode, or the business is on GOOGLE_WRITES_LIVE_PLACES.
   * Only the page's look — the server refuses again. Missing: locked. */
  canEdit?: boolean;
}

const OFF: GbpEditState = { enabled: false, premium: false, connected: false, undo: null, websiteUndo: null };
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
  | { kind: "undoing" };
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

/** `autoLoad` (the Google Profile tab's card): read Google when the card
 * shows, for "On Google now" — elsewhere only when the owner clicks. */
export function CustomerDetailsGoogleEdit({ businessId, className, autoLoad = false }: { businessId: string; className?: string; autoLoad?: boolean }) {
  const state = useContext(GbpEditContext);
  const locale = useLocale();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: autoLoad ? "loading" : "idle" });
  // Google's options and their values now, with the owner's own answers — null until Google was read.
  const [now, setNow] = useState<{ rows: CustomerDetailsEditorRow[]; owner: CustomerDetailsOwnerState } | null>(null);
  const [undo, setUndo] = useState<UndoableChange | null>(state.undo);
  const [message, setMessage] = useState<Message | null>(null);
  // What the server said when the panel opened (the page's guess until then).
  const [mode, setMode] = useState({ practice: state.practice === true, canEdit: state.canEdit === true });
  const [outcome, setOutcome] = useState<PracticeOutcome>("accept");
  const live = state.enabled && state.premium && (state.connected || state.practice === true);

  useEffect(() => {
    if (live && autoLoad) void load(false);
    // Only once, when the card mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (!state.connected && !state.practice) {
    return (
      <Link data-testid="gbp-edit-connect" href={`/business/${businessId}/connect-gbp`} className={cn(BUTTON, className)}>
        <IconBrandGoogle size={14} aria-hidden />
        {t(locale, "dashboard.gbpEdit.connectToUpdate")}
      </Link>
    );
  }

  const editing = phase.kind === "editing" ? phase : null;
  const fail = (text: string, mapsUri: string | null = null) => setMessage({ tone: "failure", text, mapsUri });
  const errorText = (r: { status: "blocked"; reason: GbpEditBlock } | { status: "error"; error: string } | { status: "editing_off" }) => {
    if (r.status === "blocked") return t(locale, blockMessage(r.reason));
    if (r.status === "editing_off") return t(locale, "dashboard.gbpEdit.error.editing_off");
    const key = `dashboard.gbpEdit.error.${r.error}` as MessageKey;
    // A code with no message of its own still says something went wrong.
    return t(locale, key) === key ? t(locale, "dashboard.gbpEdit.error.failed") : t(locale, key);
  };

  function editorFrom(rows: CustomerDetailsEditorRow[], owner: CustomerDetailsOwnerState): Extract<Phase, { kind: "editing" }> {
    return {
      kind: "editing",
      rows,
      owner,
      checked: Object.fromEntries(rows.map((row) => [row.id, row.current === true])),
      ownerOff: { parking: owner.removed.includes("parking"), payment: owner.removed.includes("payment") },
    };
  }

  /** Reads Google (and the saved Undo). `edit`: then straight to the options. */
  async function load(edit: boolean) {
    setPhase({ kind: "loading" });
    try {
      const r = await loadCustomerDetailsEditorAction(businessId);
      if (r.status === "blocked" || (r.status === "error" && r.error === "reconnect")) {
        setPhase({ kind: "idle" });
        return fail(errorText(r));
      }
      // Without Google's current values there's nothing safe to change.
      if (r.status !== "ok") {
        setPhase({ kind: "idle" });
        return fail(t(locale, "dashboard.gbpEdit.error.loadCurrent"));
      }
      setMode({ practice: r.practice, canEdit: r.canEdit });
      setNow({ rows: r.rows, owner: r.owner });
      setUndo(r.undo);
      setPhase(edit ? editorFrom(r.rows, r.owner) : { kind: "idle" });
    } catch {
      // A failed request is never a silent click.
      setPhase({ kind: "idle" });
      fail(t(locale, "dashboard.gbpEdit.error.loadCurrent"));
    }
  }

  /** "Update on Google" / "Change": the options as Google shows them now. */
  function startEditing() {
    setMessage(null);
    if (!now) return void load(true);
    setPhase(editorFrom(now.rows, now.owner));
  }

  async function approve(e: Editor, changes: AttributeChange[], ownerChanges: OwnerChange[]) {
    setPhase({ kind: "sending", ...e, changes, ownerChanges });
    setMessage(null);
    const back = () => setPhase({ kind: "preview", ...e, changes, ownerChanges });
    try {
      let status: ResultStatus = "saved";
      let mapsUri: string | null = null;
      let rows = e.rows;
      if (changes.length > 0) {
        // Only the changed fields are sent; the server re-reads Google's
        // current values and builds the real before → after itself.
        const r = await applyCustomerDetailsAction(businessId, Object.fromEntries(changes.map((c) => [c.id, c.after])), mode.practice ? outcome : null);
        if (r.status === "blocked" || r.status === "editing_off") return back(), fail(errorText(r));
        if (r.status === "error") return back(), fail(errorText(r), r.mapsUri ?? null);
        if (r.status !== "no_changes") {
          setUndo(r.undo);
          mapsUri = r.mapsUri ?? null;
          // "On Google now": what Google read back (not while Google reviews it).
          if (r.status === "sent") rows = withValues(rows, r.changes.map((c) => [c.id, c.after]));
        }
        // "Updated on Google ✓" only when Google reads back every value.
        status = r.status === "sent" && !r.verified ? "unconfirmed" : r.status;
      }
      // The owner's own answers are PostScore's ("Added by you") — saved
      // only after Google took its part.
      for (const c of ownerChanges) {
        const saved = await setCustomerDetailsOwnerAnswer(businessId, c.part, c.off);
        if (saved.status !== "ok") {
          setPhase({ kind: "idle" });
          return fail(t(locale, changes.length > 0 ? "dashboard.gbpEdit.error.ownerAfterGoogle" : "content.checks.completeness.customer_details.owner.error"), mapsUri);
        }
      }
      const owner = { ...e.owner, removed: e.owner.canRemove.filter((p) => e.ownerOff[p]) };
      setNow({ rows, owner });
      setMessage({ tone: status === "sent" ? "done" : status === "pending_review" || status === "unconfirmed" ? "waiting" : "neutral", text: resultText(status, locale), mapsUri });
      setPhase({ kind: "idle" });
      router.refresh();
    } catch {
      back();
      fail(t(locale, "dashboard.gbpEdit.error.failed"));
    }
  }

  async function runUndo() {
    if (!undo) return;
    setPhase({ kind: "undoing" });
    setMessage(null);
    try {
      const r = await undoCustomerDetailsAction(businessId, undo.batchId, mode.practice ? outcome : null);
      if (r.status === "blocked" || r.status === "editing_off") fail(errorText(r));
      else if (r.status === "error") {
        // Which fields didn't revert (or changed since), in the owner's words.
        const fields = r.fields?.length ? r.fields.map((id) => optionLabel(id, locale)).join(", ") : null;
        const key: MessageKey =
          r.error === "undo_unverified"
            ? r.pending
              ? "dashboard.gbpEdit.error.undo_unverifiedPending"
              : "dashboard.gbpEdit.error.undo_unverified"
            : r.error === "changed_since" && fields
              ? "dashboard.gbpEdit.error.changed_sinceFields"
              : (`dashboard.gbpEdit.error.${r.error}` as MessageKey);
        fail(t(locale, key, { fields: fields ?? "" }), r.mapsUri ?? null);
      } else {
        // Only after Google read back the previous values — or, while Google
        // is reviewing changes to the profile, sent and said so.
        if (!r.pending) setNow((n) => (n ? { ...n, rows: withValues(n.rows, undo.changes.map((c) => [c.id, c.before])) } : n));
        setUndo(null);
        setMessage({ tone: r.pending ? "waiting" : "done", text: t(locale, r.pending ? "dashboard.gbpEdit.undo.donePending" : "dashboard.gbpProfileEdits.undone"), mapsUri: r.mapsUri ?? null });
        router.refresh();
      }
    } catch {
      fail(t(locale, "dashboard.gbpEdit.error.failed"));
    }
    setPhase({ kind: "idle" });
  }

  const quiet = phase.kind === "idle" || phase.kind === "undoing";
  const yes = now ? now.rows.filter((r) => r.current === true) : [];

  return (
    <div data-testid="gbp-edit" className={cn("flex flex-col gap-2", className)}>
      {now && (
        <div data-testid="gbp-edit-now" className="flex flex-col gap-1">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-soft">{t(locale, "dashboard.gbpProfileEdits.nowOnGoogle")}</span>
          <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
            <span data-testid="gbp-edit-current" className={yes.length === 0 ? "text-ink-mute" : undefined}>
              {yes.length === 0 ? t(locale, "dashboard.gbpEdit.nowNone") : yes.map((r) => optionLabel(r.id, locale)).join(", ")}
            </span>
            {quiet && (
              <button type="button" data-testid="gbp-edit-change" disabled={phase.kind === "undoing"} onClick={startEditing} className="rounded-lg border border-paper-deep bg-white px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-soft disabled:opacity-50">
                {t(locale, "dashboard.gbpEdit.change")}
              </button>
            )}
          </div>
        </div>
      )}

      {!now && (phase.kind === "idle" || phase.kind === "loading") && (
        <button type="button" data-testid="gbp-edit-start" className={BUTTON} onClick={() => (autoLoad ? load(false) : startEditing())} disabled={phase.kind === "loading"}>
          <IconBrandGoogle size={14} aria-hidden />
          {phase.kind === "loading" ? t(locale, "dashboard.gbpEdit.loading") : autoLoad ? t(locale, "dashboard.websiteLinkFix.retry") : t(locale, "dashboard.gbpEdit.button")}
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
          {phase.changes.length > 0 && mode.practice && <PracticeChooser outcome={outcome} onChange={setOutcome} testId="customer-details-practice" />}
          {phase.changes.length > 0 && !mode.practice && !mode.canEdit && <ReadOnlyNote testId="customer-details-read-only" />}
          <div className="flex flex-wrap items-center gap-3 border-t border-paper-line pt-2.5">
            {phase.changes.length > 0 ? (
              <ApproveButton
                canEdit={mode.canEdit}
                busy={phase.kind === "sending"}
                disabled={false}
                onClick={() => approve(phase, phase.changes, phase.ownerChanges)}
                testId="customer-details-approve"
                label={t(locale, "dashboard.gbpEdit.approve")}
              />
            ) : (
              // Only PostScore's own answers: nothing goes to Google.
              <button type="button" className={PRIMARY} disabled={phase.kind === "sending"} onClick={() => approve(phase, phase.changes, phase.ownerChanges)}>
                {phase.kind === "sending" ? t(locale, "dashboard.gbpEdit.sending") : t(locale, "dashboard.gbpEdit.saveOwnerOnly")}
              </button>
            )}
            <button type="button" className={QUIET} disabled={phase.kind === "sending"} onClick={() => setPhase({ kind: "editing", rows: phase.rows, owner: phase.owner, checked: phase.checked, ownerOff: phase.ownerOff })}>
              {t(locale, "dashboard.gbpEdit.back")}
            </button>
          </div>
        </Panel>
      )}

      <div aria-live="polite" className="flex flex-col gap-2">
        {message && (
          <p
            data-testid={message.tone === "failure" ? "gbp-edit-error" : "gbp-edit-result"}
            role={message.tone === "failure" ? "alert" : "status"}
            className={cn("text-[12.5px]", message.tone === "failure" ? "text-red" : message.tone === "waiting" ? TONE.waiting : "text-ink-soft")}
          >
            <span className={message.tone === "done" ? TONE.done : message.tone === "failure" ? undefined : "font-semibold text-ink"}>{message.text}</span>
            <ViewOnGoogle mapsUri={message.mapsUri ?? null} />
          </p>
        )}
        {undo && quiet && (
          <UndoLine
            until={undo.undoUntil}
            confirmText={t(locale, "dashboard.gbpEdit.undo.confirm")}
            canEdit={mode.canEdit}
            busy={phase.kind === "undoing"}
            onUndo={runUndo}
            testId="gbp-undo"
          />
        )}
      </div>
    </div>
  );
}

type ResultStatus = "sent" | "unconfirmed" | "pending_review" | "no_changes" | "saved";
type Message = { text: string; tone: keyof typeof TONE; mapsUri?: string | null };

/** The message after Approve: the real outcome, with the points note when Google took it. */
function resultText(status: ResultStatus, locale: Locale): string {
  const key: MessageKey =
    status === "pending_review"
      ? "dashboard.gbpEdit.result.pending"
      : status === "unconfirmed"
        ? "dashboard.gbpProfileEdits.unconfirmed"
        : status === "no_changes"
          ? "dashboard.gbpEdit.result.noChanges"
          : status === "saved"
            ? "dashboard.gbpEdit.result.saved"
            : "dashboard.gbpEdit.result.sent";
  const text = t(locale, key);
  return status === "sent" || status === "pending_review" ? `${text} ${t(locale, "dashboard.gbpEdit.result.points")}` : text;
}

/** The rows with these values (Google's read-back, or Undo's previous values). */
function withValues(rows: CustomerDetailsEditorRow[], values: Array<[string, AttrValue]>): CustomerDetailsEditorRow[] {
  const byId = new Map(values);
  return rows.map((r) => (byId.has(r.id) ? { ...r, current: byId.get(r.id)! } : r));
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
