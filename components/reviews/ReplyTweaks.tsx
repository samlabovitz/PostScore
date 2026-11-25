"use client";

// Day 25B step 6, item 9: under each reply draft, "Short · Medium · Long"
// (that one reply again at that length) and "Different wording"; and the
// owner's "Replies are written as: Me (I) / My team (we)". Shared by the
// week's replies (Growth plan, Google results), the Reviews inbox and the
// paste-a-review drafter.

import { useEffect, useState } from "react";
import { getReplyVoice, setReplyVoice } from "@/app/actions/reviewReplies";
import type { ReplyLength, ReplyVoice } from "@/lib/reviewReplies";
import { t, type MessageKey, useLocale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const R = (key: string) => `dashboard.replies.${key}` as MessageKey;
const CHIP = "inline-flex min-h-[36px] items-center rounded-lg border px-2.5 text-[12.5px] font-semibold disabled:opacity-60";

export function ReplyTweaks({ onRedraft, busy, length, disabled = false }: { onRedraft: (opts: { length: ReplyLength; mode: "length" | "different" }) => void | Promise<void>; busy: boolean; length: ReplyLength; disabled?: boolean }) {
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="reply-tweaks">
      <div role="group" aria-label={t(locale, R("tweak.length"))} className="flex flex-wrap gap-1.5">
        {(["short", "medium", "long"] as const).map((l) => (
          <button key={l} type="button" disabled={busy || disabled} aria-pressed={length === l} onClick={() => void onRedraft({ length: l, mode: "length" })} className={cn(CHIP, length === l ? "border-ink bg-ink text-paper" : "border-paper-deep bg-white text-ink hover:border-ink-soft")} data-testid={`reply-length-${l}`}>
            {t(locale, R(`tweak.${l}`))}
          </button>
        ))}
      </div>
      <button type="button" disabled={busy || disabled} onClick={() => void onRedraft({ length, mode: "different" })} className={cn(CHIP, "border-paper-deep bg-white text-ink hover:border-ink-soft")} data-testid="reply-different">
        {t(locale, R("tweak.different"))}
      </button>
      {busy && <span className="text-[12px] text-ink-mute">{t(locale, R("tweak.writing"))}</span>}
    </div>
  );
}

/** "Replies are written as: Me (I) · My team (we)" — the owner's choice, saved for the business. */
export function ReplyVoicePicker({ businessId, onChange }: { businessId: string; onChange?: (v: ReplyVoice) => void }) {
  const locale = useLocale();
  // "Me" shows from the start (the default), even before anything is saved; the saved choice replaces it.
  const [voice, setVoice] = useState<ReplyVoice>("me");
  const [saving, setSaving] = useState(false);
  const [notReady, setNotReady] = useState(false);
  useEffect(() => {
    getReplyVoice(businessId)
      .then(setVoice)
      .catch(() => setVoice("me"));
  }, [businessId]);
  const pick = async (v: ReplyVoice) => {
    if (v === voice || saving) return;
    setSaving(true);
    setNotReady(false);
    const r = await setReplyVoice(businessId, v).catch(() => null);
    setSaving(false);
    if (r?.status === "ok") {
      setVoice(v);
      onChange?.(v);
    } else setNotReady(true);
  };
  return (
    <div className="flex flex-col gap-1" data-testid="reply-voice">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-ink-soft">{t(locale, R("voice.label"))}</span>
        <div role="radiogroup" aria-label={t(locale, R("voice.label"))} className="flex gap-1.5">
          {(["me", "team"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={voice === v} disabled={saving} onClick={() => void pick(v)} className={cn(CHIP, voice === v ? "border-ink bg-ink text-paper" : "border-paper-deep bg-white text-ink hover:border-ink-soft")} data-testid={`reply-voice-${v}`}>
              {t(locale, R(`voice.${v}`))}
            </button>
          ))}
        </div>
      </div>
      {notReady && <p className="text-[12px] text-ink-mute" data-testid="reply-voice-not-ready">{t(locale, R("voice.notReady"))}</p>}
    </div>
  );
}
