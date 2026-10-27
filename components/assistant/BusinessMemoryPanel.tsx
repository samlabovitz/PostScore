"use client";

// The visible face of the assistant's persisted "business-context memory"
// (see AssistantBusinessProfile in lib/assistant.ts) — makes the same
// facts the assistant is grounded in on every message tangible to the
// owner, so "the assistant remembers your business" isn't just a claim in
// a system prompt. Location/score history/confirmed fixes are read-only
// here (derived live from real data, nothing to edit); business type,
// services, and job-value range are the owner-editable facts, saved
// straight through updateBusinessTypeOverride/updateBusinessProfile.

import { useState, type ReactNode } from "react";
import {
  IconBrain,
  IconCheck,
  IconChevronRight,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { formatPoints } from "@/components/scoring/CategoryCard";
import { updateBusinessDifferentiator, updateBusinessProfile, updateBusinessTypeOverride } from "@/app/actions/businesses";
import { DIFFERENTIATOR_MAX, formatSpendRange, offerWording } from "@/lib/businessOffer";
import { getBizProfileOptions } from "@/config/bizProfiles";
import type { AssistantBusinessProfile } from "@/lib/assistant";
import { t, useLocale } from "@/lib/i18n";
import { businessTypeSourceText } from "./businessTypeSource";

function ScoreTrend({ history }: { history: AssistantBusinessProfile["scoreHistory"] }) {
  const locale = useLocale();
  if (history.length === 0) {
    return <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.assistant.memory.noSavedScans")}</p>;
  }
  if (history.length === 1) {
    const only = history[0];
    return <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.assistant.memory.onlyOneScore", { total: only.total, date: only.date })}</p>;
  }
  // One line: "86 → 87 since Oct 16".
  const first = history[0];
  const last = history[history.length - 1];
  return (
    <p data-testid="memory-trend" className="text-[13px] text-ink">
      {t(locale, "dashboard.memory.trendLine", { from: first.total, to: last.total, date: first.date })}
    </p>
  );
}

function FixedItems({ items }: { items: AssistantBusinessProfile["fixedItems"] }) {
  const locale = useLocale();
  if (items.length === 0) {
    return <p className="text-[12.5px] text-ink-mute">{t(locale, "dashboard.assistant.memory.noConfirmedFixed")}</p>;
  }
  return (
    <ul data-testid="memory-fixed" className="flex flex-col gap-1 text-[12.5px] text-ink-mute">
      {items.map((item, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-ink-soft">{item.label}</span>
          <span className="shrink-0 tabular-nums">
            {item.verifiedAt
              ? t(locale, "dashboard.assistant.memory.pointsGainedWithDate", { points: formatPoints(item.pointsGained), date: item.verifiedAt })
              : t(locale, "dashboard.assistant.memory.pointsGainedNoDate", { points: formatPoints(item.pointsGained) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A chip editor for the owner's service list — type a name, press Enter
 * or tap "Add" to add a chip, tap the x to remove one. Cleaner than a raw
 * comma-separated text field: no ambiguity about how entries are split,
 * and each entry is a clearly separate, removable unit. */
function ServicesEditor({
  services,
  onChange,
  disabled,
  placeholder,
}: {
  services: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  /** The business type's own example ("e.g. Balayage, keratin"). */
  placeholder: string;
}) {
  const locale = useLocale();
  const [draft, setDraft] = useState("");

  function addFromDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (services.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...services, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {services.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-ink/5 py-1 pl-2.5 pr-1.5 text-[12.5px] text-ink"
          >
            {s}
            <button
              type="button"
              onClick={() => onChange(services.filter((x) => x !== s))}
              disabled={disabled}
              className="rounded-full p-0.5 text-ink-mute hover:bg-ink/10 hover:text-red disabled:opacity-50"
              aria-label={t(locale, "dashboard.assistant.memory.removeServiceAriaLabel", { service: s })}
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addFromDraft();
            }
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
        />
        <button
          type="button"
          onClick={addFromDraft}
          disabled={disabled || !draft.trim()}
          className="shrink-0 rounded-lg border border-paper-deep px-3 py-2 text-[12.5px] font-medium text-ink-soft disabled:opacity-50"
        >
          {t(locale, "dashboard.assistant.memory.addButton")}
        </button>
      </div>
    </div>
  );
}

/** Exported so the Settings page (app/business/[id]/settings/page.tsx)
 * can reuse this exact control standalone — same save action, same
 * validation, same copy — rather than duplicating it. */
export function BusinessTypeField({
  businessId,
  businessTypeId,
  autoDetectedBusinessTypeId,
  autoDetectedBusinessType,
  businessTypeOverridden,
  tradeName,
  onSaved,
}: {
  businessId: string;
  businessTypeId: string;
  autoDetectedBusinessTypeId: string;
  autoDetectedBusinessType: string;
  businessTypeOverridden: boolean;
  /**
   * Only passed by the Settings page (BusinessTypeSetting.tsx) — when
   * provided (even as null), the description below the dropdown uses
   * the honest 3-way "{trade} — picked by you" / "Picked by you" /
   * auto-detected wording instead of this field's own generic
   * "Corrected by you" text, reflecting whether a specific intake-
   * typeahead trade (lib/tradeSearch.ts) is actually behind the current
   * type. Omitted entirely by every other caller (e.g. PostAI's memory
   * panel below), whose description text is unaffected by this prop.
   */
  tradeName?: string | null;
  onSaved: (result: { businessType: string; businessTypeId: string; overridden: boolean }) => void;
}) {
  const locale = useLocale();
  const options = getBizProfileOptions(locale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextId: string) {
    // Picking the same type Google already auto-detected clears the
    // override rather than storing a redundant one, so "Google detected"
    // stays an honest description of what actually happened.
    const nextOverride = nextId === autoDetectedBusinessTypeId ? null : nextId;
    setSaving(true);
    setError(null);
    const result = await updateBusinessTypeOverride(businessId, nextOverride);
    setSaving(false);

    if (result.status === "ok") {
      const option = options.find((o) => o.id === nextId);
      onSaved({
        businessType: option?.label ?? nextId,
        businessTypeId: nextId,
        overridden: result.businessTypeOverride !== null,
      });
    } else {
      setError(
        result.status === "error" ? result.message : t(locale, "dashboard.assistant.memory.couldNotSaveFallback")
      );
    }
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">
        {t(locale, "dashboard.assistant.memory.businessTypeLabel")}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={businessTypeId}
          onChange={(e) => void handleChange(e.target.value)}
          disabled={saving}
          className="rounded-lg border border-paper-deep bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink-soft disabled:opacity-60"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {saving && <IconLoader2 size={14} className="animate-spin text-ink-mute" />}
      </div>
      <p className="mt-1 text-[11.5px] text-ink-mute">
        {businessTypeSourceText({ locale, businessTypeOverridden, tradeName, autoDetectedBusinessType })}
      </p>
      {error && <p className="mt-1 text-[12px] text-red">{error}</p>}
    </div>
  );
}

type OwnerField = "offer" | "spend" | "different";

/** One "Added by you" row: its value (read mode), one friendly prompt
 * with "Add" when empty, or — only while it's the one being edited — its
 * editor with Save / Cancel. Exported for tests. */
export function OwnerRow({
  testId,
  label,
  prompt,
  empty,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
  error,
  editor,
  children,
}: {
  testId: string;
  label: string;
  prompt: string;
  empty: boolean;
  editing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  editor: ReactNode;
  children?: ReactNode;
}) {
  const locale = useLocale();
  if (editing) {
    return (
      <div data-testid={testId} data-mode="edit" className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-ink">{label}</p>
        {editor}
        {error && <p role="alert" className="text-[12px] text-red">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
          >
            {saving ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
            {t(locale, "dashboard.memory.save")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep px-3 py-1.5 text-[12.5px] font-medium text-ink-soft disabled:opacity-60"
          >
            <IconX size={13} />
            {t(locale, "dashboard.memory.cancel")}
          </button>
        </div>
      </div>
    );
  }
  if (empty) {
    return (
      <div data-testid={testId} data-mode="empty" className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] text-ink-soft">{prompt}</p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-paper-deep px-2 py-1 text-[12px] font-medium text-ink hover:border-ink-soft"
        >
          <IconPlus size={12} aria-hidden />
          {t(locale, "dashboard.memory.add")}
        </button>
      </div>
    );
  }
  return (
    <div data-testid={testId} data-mode="read" className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium text-ink-soft">{label}</p>
        <button
          type="button"
          onClick={onEdit}
          aria-label={t(locale, "dashboard.memory.editLabel", { label })}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink"
        >
          <IconPencil size={12} aria-hidden />
          {t(locale, "dashboard.memory.edit")}
        </button>
      </div>
      {children}
    </div>
  );
}

/** A small section header, then its rows (no cards inside the panel). */
function MemorySection({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="flex flex-col gap-3 border-t border-paper-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mute">{title}</h3>
      {children}
    </section>
  );
}

const inputClass = "rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60";

export function BusinessMemoryPanel({
  businessId,
  profile,
}: {
  businessId: string;
  profile: AssistantBusinessProfile;
}) {
  const locale = useLocale();
  const [current, setCurrent] = useState(profile);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OwnerField | null>(null);
  const [servicesDraft, setServicesDraft] = useState<string[]>(current.services);
  const [jobLowDraft, setJobLowDraft] = useState("");
  const [jobHighDraft, setJobHighDraft] = useState("");
  const [differentDraft, setDifferentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The words follow the business type — even right after it's changed above.
  const words = offerWording(current.businessTypeId, locale);
  const hasSpend = current.avgJobValueLow !== null && current.avgJobValueHigh !== null;

  function startEditing(field: OwnerField) {
    setServicesDraft(current.services);
    setJobLowDraft(current.avgJobValueLow !== null ? String(current.avgJobValueLow) : "");
    setJobHighDraft(current.avgJobValueHigh !== null ? String(current.avgJobValueHigh) : "");
    setDifferentDraft(current.differentiator ?? "");
    setError(null);
    setEditing(field);
  }

  /** What you offer and the typical spend share one save (the other
   * keeps its saved value). */
  async function saveProfile(services: string[], avgJobValueLow: number | null, avgJobValueHigh: number | null) {
    setSaving(true);
    setError(null);
    const result = await updateBusinessProfile(businessId, { services, avgJobValueLow, avgJobValueHigh });
    setSaving(false);
    if (result.status === "ok") {
      setCurrent((prev) => ({ ...prev, services: result.services, avgJobValueLow: result.avgJobValueLow, avgJobValueHigh: result.avgJobValueHigh }));
      setEditing(null);
    } else {
      setError(result.status === "error" ? result.message : t(locale, "dashboard.assistant.memory.couldNotSaveFallback"));
    }
  }

  async function handleSaveSpend() {
    const low = jobLowDraft.trim();
    const high = jobHighDraft.trim();
    if (low === "" && high !== "") return setError(t(locale, "dashboard.assistant.memory.errorMissingLow"));
    if (high === "" && low !== "") return setError(t(locale, "dashboard.assistant.memory.errorMissingHigh"));
    const avgJobValueLow = low === "" ? null : Number(low);
    const avgJobValueHigh = high === "" ? null : Number(high);
    if (avgJobValueLow !== null && avgJobValueHigh !== null) {
      if (Number.isNaN(avgJobValueLow) || Number.isNaN(avgJobValueHigh) || avgJobValueLow < 0 || avgJobValueHigh < 0) {
        return setError(t(locale, "dashboard.assistant.memory.errorInvalidNumbers"));
      }
      if (avgJobValueLow > avgJobValueHigh) return setError(t(locale, "dashboard.assistant.memory.errorLowExceedsHigh"));
    }
    await saveProfile(current.services, avgJobValueLow, avgJobValueHigh);
  }

  async function handleSaveDifferent() {
    setSaving(true);
    setError(null);
    const result = await updateBusinessDifferentiator(businessId, differentDraft);
    setSaving(false);
    if (result.status === "ok") {
      setCurrent((prev) => ({ ...prev, differentiator: result.differentiator }));
      setEditing(null);
    } else if (result.status === "not_set_up") setError(t(locale, "dashboard.memory.notSavedYet"));
    else setError(result.status === "error" ? result.message : t(locale, "dashboard.assistant.memory.couldNotSaveFallback"));
  }

  const rowProps = (field: OwnerField) => ({
    editing: editing === field,
    onEdit: () => startEditing(field),
    onCancel: () => setEditing(null),
    saving,
    error: editing === field ? error : null,
  });

  // A collapsed row in the "Ask PostAI" panel — collapsed every time the
  // panel opens. Opened, it's a layer over the chat (its own scroll, at
  // most 60% of the panel's height, "Done" to close), so it never pushes
  // the conversation out of view. Read mode by default; only the row being
  // edited becomes a form. One column, so it reads at phone width.
  return (
    <div data-testid="postai-memory">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="postai-memory-body"
        data-testid="postai-memory-toggle"
        className="flex w-full items-center gap-2 py-2.5 text-left text-[12.5px] font-medium text-ink-soft hover:text-ink"
      >
        <IconBrain size={15} aria-hidden className="shrink-0 text-brass" />
        <span className="min-w-0 flex-1">{t(locale, "dashboard.assistant.memory.rowLabel")}</span>
        <IconChevronRight size={15} aria-hidden className={`shrink-0 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
      </button>
      <div
        id="postai-memory-body"
        hidden={!open}
        role="region"
        aria-label={t(locale, "dashboard.assistant.memory.rowLabel")}
        data-testid="postai-memory-layer"
        className="absolute inset-x-0 top-full z-20 max-h-[60vh] overflow-y-auto overscroll-contain border-b border-paper-deep bg-white px-4 pb-4 shadow-lg"
      >
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 border-b border-paper-line bg-white px-4 py-2">
          <p className="text-[12px] text-ink-mute">{t(locale, "dashboard.assistant.memory.subheading")}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            data-testid="postai-memory-done"
            className="shrink-0 rounded-md bg-ink px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-ink/90"
          >
            {t(locale, "dashboard.assistant.memory.done")}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <MemorySection title={t(locale, "dashboard.memory.fromGoogle")} testId="memory-from-google">
            <BusinessTypeField
              businessId={businessId}
              businessTypeId={current.businessTypeId}
              autoDetectedBusinessTypeId={current.autoDetectedBusinessTypeId}
              autoDetectedBusinessType={current.autoDetectedBusinessType}
              businessTypeOverridden={current.businessTypeOverridden}
              onSaved={({ businessType, businessTypeId, overridden }) =>
                setCurrent((prev) => ({ ...prev, businessType, businessTypeId, businessTypeOverridden: overridden }))
              }
            />
            <div>
              <p className="text-[12px] font-medium text-ink-soft">{t(locale, "dashboard.memory.address")}</p>
              <p className="mt-0.5 text-[13px] text-ink">{current.location ?? t(locale, "dashboard.assistant.memory.notOnFile")}</p>
            </div>
          </MemorySection>

          <MemorySection title={t(locale, "dashboard.memory.addedByYou")} testId="memory-added-by-you">
            <OwnerRow
              testId="memory-offer"
              label={words.offerLabel}
              prompt={words.offerPrompt}
              empty={current.services.length === 0}
              onSave={() => void saveProfile(servicesDraft, current.avgJobValueLow, current.avgJobValueHigh)}
              editor={<ServicesEditor services={servicesDraft} onChange={setServicesDraft} disabled={saving} placeholder={words.offerExample} />}
              {...rowProps("offer")}
            >
              <div className="flex flex-wrap gap-1.5">
                {current.services.map((s) => (
                  <span key={s} className="rounded-full bg-ink/5 px-2.5 py-1 text-[12.5px] text-ink">
                    {s}
                  </span>
                ))}
              </div>
            </OwnerRow>

            <OwnerRow
              testId="memory-spend"
              label={words.spendLabel}
              prompt={words.spendPrompt}
              empty={!hasSpend}
              onSave={() => void handleSaveSpend()}
              editor={
                <div className="flex items-center gap-2 text-sm text-ink-mute">
                  <span aria-hidden>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={jobLowDraft}
                    onChange={(e) => setJobLowDraft(e.target.value)}
                    placeholder={t(locale, "dashboard.memory.spendLow")}
                    aria-label={`${words.spendLabel} — ${t(locale, "dashboard.memory.spendLow")}`}
                    disabled={saving}
                    className={`w-24 ${inputClass}`}
                  />
                  <span aria-hidden>–</span>
                  <span aria-hidden>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={jobHighDraft}
                    onChange={(e) => setJobHighDraft(e.target.value)}
                    placeholder={t(locale, "dashboard.memory.spendHigh")}
                    aria-label={`${words.spendLabel} — ${t(locale, "dashboard.memory.spendHigh")}`}
                    disabled={saving}
                    className={`w-24 ${inputClass}`}
                  />
                </div>
              }
              {...rowProps("spend")}
            >
              {hasSpend && <p className="text-[13px] font-medium text-ink">{formatSpendRange(current.avgJobValueLow!, current.avgJobValueHigh!)}</p>}
            </OwnerRow>

            <OwnerRow
              testId="memory-different"
              label={words.differentLabel}
              prompt={words.differentPrompt}
              empty={!current.differentiator}
              onSave={() => void handleSaveDifferent()}
              editor={
                <input
                  type="text"
                  value={differentDraft}
                  onChange={(e) => setDifferentDraft(e.target.value)}
                  maxLength={DIFFERENTIATOR_MAX}
                  placeholder={words.differentExample}
                  aria-label={words.differentLabel}
                  disabled={saving}
                  className={`w-full ${inputClass}`}
                />
              }
              {...rowProps("different")}
            >
              <p className="text-[13px] text-ink">{current.differentiator}</p>
            </OwnerRow>
          </MemorySection>

          <MemorySection title={t(locale, "dashboard.memory.yourProgress")} testId="memory-progress">
            <ScoreTrend history={current.scoreHistory} />
            <FixedItems items={current.fixedItems} />
          </MemorySection>
        </div>
      </div>
    </div>
  );
}
