// Pure text logic for BusinessTypeField's description line, split out of
// BusinessMemoryPanel.tsx (which transitively imports "use server"
// actions, and so can't be imported from a plain unit test) so this one
// piece of honest-source wording is directly testable, and so a future
// change to it can't accidentally also change the component's save
// behavior.

import { t, type Locale } from "@/lib/i18n";

/**
 * The description shown under the business-type dropdown. When
 * `tradeName` is provided (even as null) — only ever true for the
 * Settings page (see BusinessTypeSetting.tsx) — this is the honest
 * 3-way source: a specific intake-typeahead trade, a plain manual
 * correction with no trade behind it, or genuine auto-detection.
 * `tradeName === undefined` is every other caller (PostAI's memory
 * panel), which keeps its own existing "Corrected by you" wording,
 * unaffected by this 3-way logic.
 */
export function businessTypeSourceText(args: {
  locale: Locale;
  businessTypeOverridden: boolean;
  tradeName?: string | null;
  autoDetectedBusinessType: string;
}): string {
  const { locale, businessTypeOverridden, tradeName, autoDetectedBusinessType } = args;

  if (tradeName !== undefined) {
    if (!businessTypeOverridden) {
      return t(locale, "dashboard.assistant.memory.businessTypeAutoDetected");
    }
    return tradeName !== null
      ? t(locale, "dashboard.settings.businessTypePickedByYouWithTrade", { trade: tradeName })
      : t(locale, "dashboard.settings.businessTypePickedByYou");
  }

  return businessTypeOverridden
    ? t(locale, "dashboard.assistant.memory.businessTypeCorrected", { autoDetected: autoDetectedBusinessType })
    : t(locale, "dashboard.assistant.memory.businessTypeAutoDetected");
}
