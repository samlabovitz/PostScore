"use client";

// "How will customers pass it on?" — the first choice in the referral
// form (above Customize design): a single card (default), a tear-in-half
// card, or sharing digitally. The card's template, the "How it works"
// steps and the Share button follow it. Available on every plan.

import { IconDeviceMobileMessage, IconId, IconScissors } from "@tabler/icons-react";
import { PASS_ON, type PassOn } from "@/lib/printStudio/design";
import { t, useLocale, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const ICONS = { single: IconId, tear: IconScissors, digital: IconDeviceMobileMessage } as const;

export const PASS_ON_STORAGE_PREFIX = "postscore.referralPassOn.";

export function PassOnChoice({ value, onChange }: { value: PassOn; onChange: (v: PassOn) => void }) {
  const locale = useLocale();
  const k = (key: string) => t(locale, `dashboard.growth.referral.passOn.${key}` as MessageKey);
  return (
    <fieldset data-testid="pass-on" className="flex flex-col gap-2 border-b border-paper-line pb-4">
      <legend className="sr-only">{k("title")}</legend>
      <h3 aria-hidden className="text-[14px] font-semibold text-ink">
        {k("title")}
      </h3>
      <div role="radiogroup" className="grid grid-cols-1 gap-2">
        {PASS_ON.map((option) => {
          const Icon = ICONS[option];
          const checked = value === option;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brass",
                checked ? "border-brass bg-[color:color-mix(in_srgb,var(--color-brass)_8%,white)]" : "border-paper-deep hover:border-ink-mute"
              )}
            >
              <input type="radio" name="pass-on" value={option} checked={checked} onChange={() => onChange(option)} className="sr-only" />
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ps-icon-tile">
                <Icon size={16} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13.5px] font-semibold text-ink">{k(option)}</span>
                <span className="text-[12px] leading-snug text-ink-soft">{k(`${option}Desc`)}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
