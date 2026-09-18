import { SUPPORTED_LOCALES, t, type Locale } from "@/lib/i18n";

interface LanguageSelectorProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  disabled?: boolean;
}

/**
 * A controlled locale picker. Each option is labeled in its OWN language
 * (an endonym — "English", "Español") rather than in whichever locale is
 * currently selected, since that's the standard, recognizable way to
 * label a language picker regardless of what the reader currently has
 * selected.
 */
export function LanguageSelector({ value, onChange, disabled }: LanguageSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Locale)}
      disabled={disabled}
      className="w-full rounded-lg border border-paper-deep bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink-soft disabled:opacity-60"
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <option key={loc} value={loc}>
          {t(loc, `language.${loc}`)}
        </option>
      ))}
    </select>
  );
}
