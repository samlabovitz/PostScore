"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { updateBusinessLanguage } from "@/app/actions/businesses";
import { normalizeLocale, t, useLocale, type Locale } from "@/lib/i18n";

/**
 * The owner's manual language choice for THIS business — lives inside
 * the sidebar's collapsed account menu (see Sidebar.tsx), not the
 * always-visible nav, since it's a settings-style control rather than
 * navigation. Switching it writes businesses.language for the business
 * currently being viewed (updateBusinessLanguage, app/actions/
 * businesses.ts — RLS-scoped, so it can only ever affect a business this
 * session actually owns) and refreshes the page so the whole dashboard
 * re-renders in the new language immediately.
 *
 * The active option always reflects the real saved `language` prop.
 * While a switch is in flight, the just-clicked option shows
 * optimistically (with a subtle "Saving…" note) but `pending` isn't
 * cleared until the refreshed `language` prop actually catches up to
 * it — so a slow refresh never flickers back to the old value first. On
 * failure, `pending` clears immediately and the toggle falls back to
 * the real (old) saved value with a short error — never showing a
 * language that wasn't actually saved.
 */
export function BusinessLanguageToggle({
  businessId,
  language,
}: {
  businessId: string;
  language: string | null | undefined;
}) {
  const locale = useLocale();
  const router = useRouter();
  const saved = normalizeLocale(language);
  const [pending, setPending] = useState<Locale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pending && saved === pending) {
      setPending(null);
    }
  }, [saved, pending]);

  async function handleChange(next: Locale) {
    if (next === saved || pending) return;
    setPending(next);
    setError(null);
    const result = await updateBusinessLanguage(businessId, next);
    if (result.status === "ok") {
      router.refresh();
    } else {
      setPending(null);
      setError(t(locale, "dashboard.nav.languageUpdateError"));
    }
  }

  return (
    <div className="px-2 py-2">
      <div className="mb-1.5 text-[11px] font-medium text-ink-mute">
        {t(locale, "dashboard.nav.languageForBusinessLabel")}
      </div>
      <SegmentedControl
        options={[
          { value: "en" as const, label: t(locale, "dashboard.nav.languageToggleEn") },
          { value: "es" as const, label: t(locale, "dashboard.nav.languageToggleEs") },
        ]}
        value={pending ?? saved}
        onChange={handleChange}
      />
      {pending && <p className="mt-1 text-[11px] text-ink-mute">{t(locale, "dashboard.nav.languageSaving")}</p>}
      {error && <p className="mt-1 text-[11px] text-red">{error}</p>}
    </div>
  );
}
