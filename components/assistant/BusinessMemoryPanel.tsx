"use client";

// The visible face of the assistant's persisted "business-context memory"
// (see AssistantBusinessProfile in lib/assistant.ts) — makes the same
// facts the assistant is grounded in on every message tangible to the
// owner, so "the assistant remembers your business" isn't just a claim in
// a system prompt. Location/score history/confirmed fixes are read-only
// here (derived live from real data, nothing to edit); business type,
// services, and job-value range are the owner-editable facts, saved
// straight through updateBusinessTypeOverride/updateBusinessProfile.

import { useState } from "react";
import {
  IconBrain,
  IconCheck,
  IconLoader2,
  IconPencil,
  IconTrendingDown,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/Card";
import { updateBusinessProfile, updateBusinessTypeOverride } from "@/app/actions/businesses";
import { BIZ_PROFILE_OPTIONS } from "@/config/bizProfiles";
import type { AssistantBusinessProfile } from "@/lib/assistant";

function ScoreTrend({ history }: { history: AssistantBusinessProfile["scoreHistory"] }) {
  if (history.length === 0) {
    return <p className="text-[13px] text-ink-soft">No saved scans yet.</p>;
  }
  if (history.length === 1) {
    const only = history[0];
    return (
      <p className="text-[13px] text-ink-soft">
        Only one saved score so far — {only.total}/100 on {only.date}. No trend yet.
      </p>
    );
  }

  const first = history[0];
  const last = history[history.length - 1];
  const delta = last.total - first.total;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        {delta >= 0 ? (
          <IconTrendingUp size={15} className="text-green" />
        ) : (
          <IconTrendingDown size={15} className="text-red" />
        )}
        <span className="text-[13px] font-medium text-ink">
          {delta >= 0 ? "+" : ""}
          {delta} pts since {first.date}
        </span>
      </div>
      <p className="text-[12px] text-ink-mute">
        {history.map((h) => `${h.date}: ${h.total}`).join("  →  ")}
      </p>
    </div>
  );
}

function FixedItems({ items }: { items: AssistantBusinessProfile["fixedItems"] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-ink-soft">Nothing confirmed fixed yet.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-ink">{item.label}</span>
          <span className="shrink-0 tabular-nums text-ink-mute">
            +{item.pointsGained} pts{item.verifiedAt ? ` · ${item.verifiedAt}` : ""}
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
}: {
  services: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
}) {
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
        {services.length === 0 && <span className="text-[12.5px] text-ink-mute">No services added yet.</span>}
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
              aria-label={`Remove ${s}`}
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
          placeholder="e.g. Haircuts"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
        />
        <button
          type="button"
          onClick={addFromDraft}
          disabled={disabled || !draft.trim()}
          className="shrink-0 rounded-lg border border-paper-deep px-3 py-2 text-[12.5px] font-medium text-ink-soft disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function BusinessTypeField({
  businessId,
  businessTypeId,
  autoDetectedBusinessTypeId,
  autoDetectedBusinessType,
  businessTypeOverridden,
  onSaved,
}: {
  businessId: string;
  businessTypeId: string;
  autoDetectedBusinessTypeId: string;
  autoDetectedBusinessType: string;
  businessTypeOverridden: boolean;
  onSaved: (result: { businessType: string; businessTypeId: string; overridden: boolean }) => void;
}) {
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
      const option = BIZ_PROFILE_OPTIONS.find((o) => o.id === nextId);
      onSaved({
        businessType: option?.label ?? nextId,
        businessTypeId: nextId,
        overridden: result.businessTypeOverride !== null,
      });
    } else {
      setError(result.status === "error" ? result.message : "Couldn't save — try again.");
    }
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">Business type</p>
      <div className="mt-1 flex items-center gap-2">
        <select
          value={businessTypeId}
          onChange={(e) => void handleChange(e.target.value)}
          disabled={saving}
          className="rounded-lg border border-paper-deep bg-white px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-ink-soft disabled:opacity-60"
        >
          {BIZ_PROFILE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {saving && <IconLoader2 size={14} className="animate-spin text-ink-mute" />}
      </div>
      <p className="mt-1 text-[11.5px] text-ink-mute">
        {businessTypeOverridden
          ? `Corrected by you — Google detected "${autoDetectedBusinessType}."`
          : "Auto-detected from your Google listing."}
      </p>
      {error && <p className="mt-1 text-[12px] text-red">{error}</p>}
    </div>
  );
}

export function BusinessMemoryPanel({
  businessId,
  profile,
}: {
  businessId: string;
  profile: AssistantBusinessProfile;
}) {
  const [current, setCurrent] = useState(profile);
  const [editing, setEditing] = useState(false);
  const [servicesDraft, setServicesDraft] = useState<string[]>(current.services);
  const [jobLowDraft, setJobLowDraft] = useState(
    current.avgJobValueLow !== null ? String(current.avgJobValueLow) : ""
  );
  const [jobHighDraft, setJobHighDraft] = useState(
    current.avgJobValueHigh !== null ? String(current.avgJobValueHigh) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setServicesDraft(current.services);
    setJobLowDraft(current.avgJobValueLow !== null ? String(current.avgJobValueLow) : "");
    setJobHighDraft(current.avgJobValueHigh !== null ? String(current.avgJobValueHigh) : "");
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    const low = jobLowDraft.trim();
    const high = jobHighDraft.trim();

    if (low === "" && high !== "") {
      setError("Enter a low value too, or clear the high value.");
      return;
    }
    if (high === "" && low !== "") {
      setError("Enter a high value too, or clear the low value.");
      return;
    }

    const avgJobValueLow = low === "" ? null : Number(low);
    const avgJobValueHigh = high === "" ? null : Number(high);

    if (avgJobValueLow !== null && avgJobValueHigh !== null) {
      if (Number.isNaN(avgJobValueLow) || Number.isNaN(avgJobValueHigh) || avgJobValueLow < 0 || avgJobValueHigh < 0) {
        setError("Enter valid positive numbers.");
        return;
      }
      if (avgJobValueLow > avgJobValueHigh) {
        setError("The low value can't be more than the high value.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    const result = await updateBusinessProfile(businessId, {
      services: servicesDraft,
      avgJobValueLow,
      avgJobValueHigh,
    });
    setSaving(false);

    if (result.status === "ok") {
      setCurrent((prev) => ({
        ...prev,
        services: result.services,
        avgJobValueLow: result.avgJobValueLow,
        avgJobValueHigh: result.avgJobValueHigh,
      }));
      setEditing(false);
    } else {
      setError(result.status === "error" ? result.message : "Couldn't save — try again.");
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brass/10 text-brass">
          <IconBrain size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">What I know about your business</p>
          <p className="text-[12px] text-ink-mute">The real facts the assistant remembers, every session.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">Location</p>
          <p className="mt-1 text-[13px] text-ink">{current.location ?? "Not on file"}</p>
        </div>
      </div>

      <div className="border-t border-paper-line pt-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">
            Services &amp; typical job value
          </p>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-mute hover:text-ink"
            >
              <IconPencil size={13} />
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[12px] text-ink-soft">Services</label>
              <ServicesEditor services={servicesDraft} onChange={setServicesDraft} disabled={saving} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-soft">Typical job/ticket value range</label>
              <div className="flex items-center gap-2 text-sm text-ink-mute">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={jobLowDraft}
                  onChange={(e) => setJobLowDraft(e.target.value)}
                  placeholder="Low"
                  disabled={saving}
                  className="w-[90px] rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
                />
                <span>to $</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={jobHighDraft}
                  onChange={(e) => setJobHighDraft(e.target.value)}
                  placeholder="High"
                  disabled={saving}
                  className="w-[90px] rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
                />
              </div>
            </div>
            {error && <p className="text-[12px] text-red">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60"
              >
                {saving ? <IconLoader2 size={13} className="animate-spin" /> : <IconCheck size={13} />}
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-paper-deep px-3 py-1.5 text-[12.5px] font-medium text-ink-soft disabled:opacity-60"
              >
                <IconX size={13} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-ink">
              {current.services.length > 0 ? current.services.join(", ") : "Not entered yet."}
            </p>
            <p className="text-[13px] text-ink">
              {current.avgJobValueLow !== null && current.avgJobValueHigh !== null
                ? `Typical job/ticket value: $${current.avgJobValueLow} to $${current.avgJobValueHigh}`
                : "Typical job/ticket value: not entered yet."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-paper-line pt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">Score trend</p>
        <ScoreTrend history={current.scoreHistory} />
      </div>

      <div className="border-t border-paper-line pt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">
          What you&apos;ve fixed
        </p>
        <FixedItems items={current.fixedItems} />
      </div>
    </Card>
  );
}
