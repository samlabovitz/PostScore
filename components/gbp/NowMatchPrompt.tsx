"use client";

// Day 23B: "Your {field} now match. Save these as your confirmed details?" —
// once, after a change PostScore made to that field is live on Google; while
// Google reviews it, "Waiting for Google" (lib/detailsMismatch.ts nowMatchPrompt).

import { useState } from "react";
import { IconCheck } from "@tabler/icons-react";
import { answerNowMatch } from "@/app/actions/ownerDetails";
import { t, useLocale, type MessageKey } from "@/lib/i18n";

const K = (key: string) => `dashboard.detailsMismatch.nowMatch.${key}` as MessageKey;

export function NowMatchPrompt({ businessId, field, prompt }: { businessId: string; field: "phone" | "hours"; prompt: { state: "ask" | "waiting"; key: string } }) {
  const locale = useLocale();
  const [state, setState] = useState<"ask" | "busy" | "saved" | "gone" | "error">("ask");
  if (prompt.state === "waiting") {
    return (
      <p data-testid="now-match-waiting" className="text-[12.5px] text-ink-mute">
        {t(locale, K("waiting"))}
      </p>
    );
  }
  if (state === "gone") return null;
  if (state === "saved") {
    return (
      <p data-testid="now-match-saved" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-green">
        <IconCheck size={14} aria-hidden />
        {t(locale, K("saved"))}
      </p>
    );
  }
  const answer = async (save: boolean) => {
    setState("busy");
    const r = await answerNowMatch(businessId, field, prompt.key, save).catch(() => ({ status: "error" as const }));
    setState(r.status === "ok" ? (save ? "saved" : "gone") : "error");
  };
  return (
    <div data-testid="now-match" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-paper-line bg-white px-3 py-2 text-[12.5px]">
      <span className="text-ink">{t(locale, K(field))}</span>
      <button type="button" disabled={state === "busy"} onClick={() => void answer(true)} data-testid="now-match-save" className="inline-flex h-7 items-center rounded-lg border border-ink bg-ink px-2.5 text-[12px] font-semibold text-white disabled:opacity-60">
        {t(locale, K("save"))}
      </button>
      <button type="button" disabled={state === "busy"} onClick={() => void answer(false)} data-testid="now-match-no" className="text-[12px] font-semibold text-ink-soft hover:text-ink disabled:opacity-60">
        {t(locale, K("no"))}
      </button>
      {state === "error" && <span className="w-full text-[12px] text-amber">{t(locale, "dashboard.settings.details.notSaved")}</span>}
    </div>
  );
}
