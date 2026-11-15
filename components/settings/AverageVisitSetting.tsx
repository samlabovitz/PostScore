"use client";

// Settings → "Average visit": one dollar amount, used only for the Google
// Profile tab's "What that could be worth" estimate.

import { useState } from "react";
import { saveAverageVisitValue } from "@/app/actions/averageVisit";
import { announceSaved } from "@/lib/savedEvent";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

const K = (key: string) => `dashboard.settings.averageVisit.${key}` as MessageKey;

export function AverageVisitSetting({ businessId, initial }: { businessId: string; initial: number | null }) {
  const locale = useLocale();
  const [value, setValue] = useState(initial !== null ? String(initial) : "");
  const [state, setState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "error"; key: string }>({ kind: "idle" });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "busy" });
    const result = await saveAverageVisitValue(businessId, value).catch(() => ({ status: "error", error: "failed" }) as const);
    if (result.status === "ok") {
      setValue(result.value !== null ? String(result.value) : "");
      setState({ kind: "idle" });
      announceSaved();
    } else setState({ kind: "error", key: `error.${result.error}` });
  }
  return (
    <form onSubmit={save} className="flex flex-col gap-1.5" data-testid="average-visit-setting">
      <label htmlFor="average-visit-input" className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-mute">
        {t(locale, K("label"))}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center rounded-lg border border-paper-deep bg-white pl-3 focus-within:border-ink-soft">
          <span aria-hidden className="text-[14px] text-ink-mute">$</span>
          <input
            id="average-visit-input"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="45"
            className="w-28 rounded-lg bg-transparent px-2 py-2 text-[14px] text-ink outline-none"
          />
        </span>
        <button type="submit" disabled={state.kind === "busy"} className="rounded-lg border border-ink bg-ink px-3.5 py-2 text-[13.5px] font-semibold text-paper disabled:opacity-60">
          {t(locale, K("save"))}
        </button>
      </div>
      <p className="text-[12px] text-ink-mute">{t(locale, K("help"))}</p>
      {state.kind === "error" && (
        <p role="alert" className="text-[12.5px] text-red">
          {t(locale, K(state.key))}
        </p>
      )}
    </form>
  );
}
